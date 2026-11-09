export type Algorithm = 'fcfs' | 'sjf' | 'srtf' | 'rr' | 'priority' | 'priority-preemptive'
export type Difficulty = 'easy' | 'medium' | 'hard'
export type PriorityMode = 'off' | 'tie' | 'first'
export type CellValue = string | 'Idle' | null

export interface Process {
  id: string
  arrival: number
  burst: number
  priority: number
}

export interface Problem {
  id: string
  processes: Process[]
  quantum: number
  difficulty: Difficulty
  priorityEnabled: boolean
  originAlgorithm: Algorithm
  originMode: PriorityMode
}

export interface ProcessMetrics {
  completion: number
  turnaround: number
  waiting: number
  response: number
}

export interface Solution {
  cells: string[]
  metrics: Record<string, ProcessMetrics>
  averages: { turnaround: number; waiting: number; response: number }
  events: { choices: number; preemptions: number; rotations: number; priorityChoices: number; secondaryChoices: number; idleGap: boolean }
}

export const ALGORITHM_LABELS: Record<Algorithm, string> = {
  fcfs: 'First come, first served',
  sjf: 'Shortest job first',
  srtf: 'Shortest remaining time first',
  rr: 'Round robin',
  priority: 'Priority · nonpreemptive',
  'priority-preemptive': 'Priority · preemptive',
}

export const FORMULAS = {
  completion: 'Completion time = time when the process finishes',
  turnaround: 'Turnaround time = Completion time − Arrival time',
  waiting: 'Waiting time = Turnaround time − CPU burst time',
  response: 'Response time = First execution time − Arrival time',
} as const

const bounds = {
  easy: { count: [3, 4], arrival: 4, burst: 6, total: 14, quantum: [2, 3] },
  medium: { count: [4, 5], arrival: 8, burst: 8, total: 25, quantum: [2, 4] },
  hard: { count: [5, 7], arrival: 12, burst: 10, total: 40, quantum: [1, 4] },
} as const

const randomInt = (min: number, max: number) => min + Math.floor(Math.random() * (max - min + 1))
const byArrival = (a: Process, b: Process) => a.arrival - b.arrival || processNumber(a) - processNumber(b)
const processNumber = (process: Process) => Number(process.id.slice(1))
const priorityOf = (process: Process, mode: PriorityMode) => mode === 'off' ? 0 : process.priority

function compareReady(a: Process, b: Process, remaining: Record<string, number>, algorithm: Algorithm, mode: PriorityMode): number {
  const priorityDifference = priorityOf(b, mode) - priorityOf(a, mode)
  if (mode === 'first' && priorityDifference !== 0) return priorityDifference
  let algorithmDifference = 0
  if (algorithm === 'sjf') algorithmDifference = a.burst - b.burst
  if (algorithm === 'srtf') algorithmDifference = remaining[a.id] - remaining[b.id]
  if (algorithm === 'priority' || algorithm === 'priority-preemptive') algorithmDifference = b.priority - a.priority
  if (algorithmDifference !== 0) return algorithmDifference
  if (algorithm === 'fcfs' && a.arrival !== b.arrival) return a.arrival - b.arrival
  if (mode === 'tie' && priorityDifference !== 0) return priorityDifference
  return byArrival(a, b)
}

function metricsFromCells(processes: Process[], cells: string[]): Pick<Solution, 'metrics' | 'averages'> {
  const metrics: Record<string, ProcessMetrics> = {}
  for (const process of processes) {
    const first = cells.indexOf(process.id)
    const last = cells.lastIndexOf(process.id)
    const completion = last + 1
    const turnaround = completion - process.arrival
    metrics[process.id] = {
      completion,
      turnaround,
      waiting: turnaround - process.burst,
      response: first - process.arrival,
    }
  }
  const divisor = processes.length
  const averages = {
    turnaround: processes.reduce((sum, process) => sum + metrics[process.id].turnaround, 0) / divisor,
    waiting: processes.reduce((sum, process) => sum + metrics[process.id].waiting, 0) / divisor,
    response: processes.reduce((sum, process) => sum + metrics[process.id].response, 0) / divisor,
  }
  return { metrics, averages }
}

export function solve(problem: Pick<Problem, 'processes' | 'quantum'>, algorithm: Algorithm, mode: PriorityMode): Solution {
  const processes = problem.processes
  const remaining = Object.fromEntries(processes.map((process) => [process.id, process.burst]))
  const cells: string[] = []
  const events = { choices: 0, preemptions: 0, rotations: 0, priorityChoices: 0, secondaryChoices: 0, idleGap: false }
  const maxTime = processes.reduce((sum, process) => sum + process.burst, 0) + Math.max(...processes.map((process) => process.arrival)) + 1

  if (algorithm === 'rr') {
    const queue: Process[] = []
    let current: Process | null = null
    let slice = 0
    let pending: Process | null = null
    for (let time = 0; time < maxTime && cells.filter((cell) => cell !== 'Idle').length < processes.reduce((sum, process) => sum + process.burst, 0); time += 1) {
      const arrivals = processes.filter((process) => process.arrival === time)
      arrivals.sort((a, b) => mode === 'tie' ? b.priority - a.priority || byArrival(a, b) : byArrival(a, b))
      queue.push(...arrivals)
      const expired = pending
      if (pending) { queue.push(pending); pending = null }
      if (current && mode === 'first' && queue.some((process) => process.priority > current!.priority)) {
        queue.push(current)
        current = null
        slice = 0
        events.preemptions += 1
      }
      if (!current && queue.length > 0) {
        if (mode === 'first') {
          const highest = Math.max(...queue.map((process) => process.priority))
          const sameLevel = queue.filter((process) => process.priority === highest)
          if (sameLevel.length > 1) events.secondaryChoices += 1
          current = queue.splice(queue.findIndex((process) => process.priority === highest), 1)[0]
        } else {
          current = queue.shift() ?? null
        }
        slice = problem.quantum
        if (expired && current && expired.id !== current.id) events.rotations += 1
      }
      if (!current) {
        if (cells.some((cell) => cell !== 'Idle')) events.idleGap = true
        cells.push('Idle')
        continue
      }
      cells.push(current.id)
      remaining[current.id] -= 1
      slice -= 1
      if (remaining[current.id] === 0) {
        current = null
      } else if (slice === 0) {
        pending = current
        current = null
      }
    }
  } else {
    let current: Process | null = null
    const preemptive = algorithm === 'srtf' || algorithm === 'priority-preemptive'
    for (let time = 0; time < maxTime && cells.filter((cell) => cell !== 'Idle').length < processes.reduce((sum, process) => sum + process.burst, 0); time += 1) {
      const ready = processes.filter((process) => process.arrival <= time && remaining[process.id] > 0)
      if (ready.length === 0) {
        current = null
        if (cells.some((cell) => cell !== 'Idle')) events.idleGap = true
        cells.push('Idle')
        continue
      }
      if (!current || preemptive) {
        const sorted = [...ready].sort((a, b) => compareReady(a, b, remaining, algorithm, mode))
        const best = sorted[0]
        const selected: Process = current && preemptive && compareReady(best, current, remaining, algorithm, mode) >= 0 ? current : best
        if (selected !== current) {
          if (current && remaining[current.id] > 0) events.preemptions += 1
          if ((algorithm === 'priority' || algorithm === 'priority-preemptive') && selected.id !== [...ready].sort(byArrival)[0].id && ready.some((process) => process.priority < selected.priority)) events.priorityChoices += 1
          if (ready.length > 1 && (algorithm === 'sjf' || algorithm === 'srtf')) {
            const earliest = [...ready].sort(byArrival)[0]
            if (selected.id !== earliest.id) events.choices += 1
          }
          if (mode === 'first') {
            const equalPriority = ready.filter((process) => process.priority === selected.priority)
            if (algorithm === 'fcfs' && equalPriority.some((process) => process.arrival !== selected.arrival)) events.secondaryChoices += 1
            if ((algorithm === 'sjf' || algorithm === 'srtf') && equalPriority.length > 1) {
              const earliest = [...equalPriority].sort(byArrival)[0]
              const selectedLength = algorithm === 'sjf' ? selected.burst : remaining[selected.id]
              const earliestLength = algorithm === 'sjf' ? earliest.burst : remaining[earliest.id]
              if (selected.id !== earliest.id && selectedLength < earliestLength) events.secondaryChoices += 1
            }
          }
        }
        current = selected
      }
      const runner = current ?? ready[0]
      cells.push(runner.id)
      remaining[runner.id] -= 1
      if (remaining[runner.id] === 0) current = null
    }
  }
  return { cells, ...metricsFromCells(processes, cells), events }
}

function generateCandidate(difficulty: Difficulty, priorityEnabled: boolean, algorithm: Algorithm, mode: PriorityMode): Problem {
  const range = bounds[difficulty]
  const count = randomInt(range.count[0], range.count[1])
  const arrivals = [0, ...Array.from({ length: count - 1 }, () => randomInt(0, range.arrival))].sort((a, b) => a - b)
  let capacity = range.total
  const processes = arrivals.map((arrival, index) => {
    const remainingCount = count - index - 1
    const burst = randomInt(1, Math.min(range.burst, capacity - remainingCount))
    capacity -= burst
    return { id: `P${index + 1}`, arrival, burst, priority: priorityEnabled ? randomInt(1, 10) : 0 }
  })
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    processes,
    quantum: randomInt(range.quantum[0], range.quantum[1]),
    difficulty,
    priorityEnabled,
    originAlgorithm: algorithm,
    originMode: mode,
  }
}

function isUseful(problem: Problem): boolean {
  const { originAlgorithm: algorithm, originMode: mode, difficulty } = problem
  const solution = solve(problem, algorithm, mode)
  const hard = difficulty === 'hard'
  if (algorithm === 'fcfs' && hard) {
    if (!solution.events.idleGap || !Object.values(solution.metrics).some((metric) => metric.waiting > 0)) return false
  }
  if (algorithm === 'sjf' && solution.events.choices < (hard ? 2 : 1)) return false
  if (algorithm === 'srtf' && solution.events.preemptions < (hard ? 2 : 1)) return false
  if (algorithm === 'rr' && solution.events.rotations < (hard ? 2 : 1)) return false
  if (algorithm === 'priority' && hard && solution.events.priorityChoices < 2) return false
  if (algorithm === 'priority-preemptive' && hard && solution.events.preemptions < 2) return false
  if (problem.priorityEnabled) {
    const baseline = solve(problem, algorithm === 'priority' || algorithm === 'priority-preemptive' ? 'fcfs' : algorithm, 'off')
    if (solution.cells.every((cell, index) => cell === baseline.cells[index])) return false
    if (mode === 'first' && algorithm !== 'priority' && algorithm !== 'priority-preemptive' && solution.events.secondaryChoices === 0) return false
  }
  if (difficulty === 'medium' && !problem.processes.some((process, index) => index > 0 && process.arrival < problem.processes[index - 1].arrival + problem.processes[index - 1].burst)) return false
  return true
}

export function generateProblem(difficulty: Difficulty, priorityEnabled: boolean, algorithm: Algorithm, mode: PriorityMode): Problem {
  for (let attempt = 0; attempt < 50000; attempt += 1) {
    const candidate = generateCandidate(difficulty, priorityEnabled, algorithm, mode)
    if (isUseful(candidate)) return candidate
  }
  throw new Error(`Unable to generate a valid ${difficulty} ${algorithm} exercise with the selected priority rules.`)
}

export function parseAverage(input: string): number | null {
  const trimmed = input.trim()
  if (/^\d+\s*\/\s*[1-9]\d*$/.test(trimmed)) {
    const [numerator, denominator] = trimmed.split('/').map(Number)
    return numerator / denominator
  }
  if (/^\d+(?:\.\d+)?$/.test(trimmed)) return Number(trimmed)
  return null
}

export function groupCells(cells: string[]): { id: string; start: number; end: number }[] {
  const groups: { id: string; start: number; end: number }[] = []
  cells.forEach((id, index) => {
    const last = groups[groups.length - 1]
    if (last && last.id === id) last.end = index + 1
    else groups.push({ id, start: index, end: index + 1 })
  })
  return groups
}
