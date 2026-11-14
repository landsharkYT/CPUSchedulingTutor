import { metricsFromCells, type Difficulty, type Process, type ProcessMetrics } from './scheduler'

export type QueueLevel = 0 | 1 | 2
export type MlfqEventKind = 'arrival' | 'dispatch' | 'interrupt' | 'demote' | 'complete' | 'idle'
export type MlfqEvent = { kind: MlfqEventKind; process?: string; from?: QueueLevel; to?: QueueLevel }
export type QueueLists = [string[], string[], string[]]

export type MlfqProblem = {
  id: string
  difficulty: Difficulty
  processes: Process[]
  quantums: [number, number]
}

export type MlfqState = {
  time: number
  events: MlfqEvent[]
  cpu: string
  cpuLevel: QueueLevel | null
  queues: QueueLists
  remainingBurst: Record<string, number>
  remainingQuantum: Record<string, number | null>
}

export type MlfqSolution = {
  cells: string[]
  levels: (QueueLevel | null)[]
  states: MlfqState[]
  rows: MlfqState[]
  metrics: Record<string, ProcessMetrics>
  averages: { turnaround: number; waiting: number; response: number }
  interruptions: { q1: number; q2: number }
}

export type QueueAnswerRow = {
  id: string
  time: string
  kinds: (MlfqEventKind | 'snapshot')[]
  cpu: string | null
  queues: QueueLists
}

export type QueueRowError = { rowId: string; time: number | null; status: 'missing' | 'wrong'; message: string }

const limits = {
  easy: { count: [3, 4], arrival: 8, burst: 9, total: 14, finish: 20, quantums: [2, 4] },
  medium: { count: [4, 5], arrival: 16, burst: 16, total: 25, finish: 36, quantums: [4, 8] },
  hard: { count: [5, 7], arrival: 32, burst: 30, total: 40, finish: 60, quantums: [8, 16] },
} as const

export const MLFQ_LIMITS = limits
export const MLFQ_EVENT_LABELS: Record<MlfqEventKind | 'snapshot', string> = {
  arrival: 'Arrival', dispatch: 'Dispatch', interrupt: 'Interruption', demote: 'Demotion', complete: 'Completion', idle: 'CPU idle', snapshot: 'Snapshot',
}

const randomInt = (min: number, max: number) => min + Math.floor(Math.random() * (max - min + 1))
const queueCopy = (queues: Process[][]): QueueLists => [queues[0].map((process) => process.id), queues[1].map((process) => process.id), queues[2].map((process) => process.id)]

export function solveMlfq(problem: Pick<MlfqProblem, 'processes' | 'quantums'>): MlfqSolution {
  const { processes, quantums } = problem
  const queues: [Process[], Process[], Process[]] = [[], [], []]
  const remainingBurst = Object.fromEntries(processes.map((process) => [process.id, process.burst]))
  const remainingQuantum: Record<string, number | null> = Object.fromEntries(processes.map((process) => [process.id, quantums[0]]))
  const cells: string[] = []
  const levels: (QueueLevel | null)[] = []
  const states: MlfqState[] = []
  const rows: MlfqState[] = []
  const interruptions = { q1: 0, q2: 0 }
  const totalBurst = processes.reduce((sum, process) => sum + process.burst, 0)
  const lastArrival = Math.max(...processes.map((process) => process.arrival))
  let completed = 0
  let running: Process | null = null
  let runningLevel: QueueLevel | null = null
  let nextEvents: MlfqEvent[] = []
  let previousCpu = 'Idle'

  for (let time = 0; time <= totalBurst + lastArrival; time += 1) {
    const events = nextEvents
    nextEvents = []
    const arrivals = processes.filter((process) => process.arrival === time)
    for (const process of arrivals) {
      queues[0].push(process)
      events.push({ kind: 'arrival', process: process.id, to: 0 })
    }

    if (running && runningLevel !== null && queues.slice(0, runningLevel).some((queue) => queue.length > 0)) {
      const interruptedLevel = runningLevel
      queues[interruptedLevel].unshift(running)
      events.push({ kind: 'interrupt', process: running.id, from: interruptedLevel })
      if (interruptedLevel === 1) interruptions.q1 += 1
      if (interruptedLevel === 2) interruptions.q2 += 1
      running = null
      runningLevel = null
    }

    if (!running) {
      const nextLevel = ([0, 1, 2] as QueueLevel[]).find((level) => queues[level].length > 0)
      if (nextLevel !== undefined) {
        running = queues[nextLevel].shift() ?? null
        runningLevel = nextLevel
        if (running) events.push({ kind: 'dispatch', process: running.id, from: nextLevel })
      }
    }

    const cpu = running?.id ?? 'Idle'
    if (cpu === 'Idle' && previousCpu !== 'Idle') events.push({ kind: 'idle' })
    const state: MlfqState = {
      time,
      events: [...events],
      cpu,
      cpuLevel: runningLevel,
      queues: queueCopy(queues),
      remainingBurst: { ...remainingBurst },
      remainingQuantum: { ...remainingQuantum },
    }
    states.push(state)
    if (events.length > 0) rows.push(state)
    if (completed === processes.length) break

    cells.push(cpu)
    levels.push(runningLevel)
    if (running && runningLevel !== null) {
      remainingBurst[running.id] -= 1
      if (runningLevel < 2) remainingQuantum[running.id] = (remainingQuantum[running.id] ?? 0) - 1
      if (remainingBurst[running.id] === 0) {
        completed += 1
        nextEvents.push({ kind: 'complete', process: running.id, from: runningLevel })
        running = null
        runningLevel = null
      } else if (runningLevel < 2 && remainingQuantum[running.id] === 0) {
        const nextLevel: QueueLevel = runningLevel === 0 ? 1 : 2
        queues[nextLevel].push(running)
        remainingQuantum[running.id] = nextLevel === 2 ? null : quantums[nextLevel]
        nextEvents.push({ kind: 'demote', process: running.id, from: runningLevel, to: nextLevel })
        running = null
        runningLevel = null
      }
    }
    previousCpu = cpu
  }

  return { cells, levels, states, rows, ...metricsFromCells(processes, cells), interruptions }
}

function makeProblem(difficulty: Difficulty): MlfqProblem {
  const range = limits[difficulty]
  const count = randomInt(range.count[0], range.count[1])
  const earlyCount = difficulty === 'easy' ? count - 1 : count - 2
  const longBurst = difficulty === 'easy' ? randomInt(7, 9) : difficulty === 'medium' ? randomInt(13, 16) : randomInt(26, 30)
  let remainingCapacity = range.total - longBurst - (difficulty === 'easy' ? 0 : 1)
  const early = Array.from({ length: earlyCount }, (_, index) => {
    const remainingSlots = earlyCount - index - 1
    const maxBurst = difficulty === 'hard' ? 2 : 3
    const burst = randomInt(1, Math.min(maxBurst, remainingCapacity - remainingSlots))
    remainingCapacity -= burst
    return { arrival: randomInt(0, 1), burst }
  })
  const earlyCpu = early.reduce((sum, process) => sum + process.burst, 0)
  const late = difficulty === 'easy' ? [] : [{
    arrival: difficulty === 'medium' ? range.quantums[0] + earlyCpu + randomInt(1, 3) : range.quantums[0] + range.quantums[1] + earlyCpu + 1,
    burst: randomInt(1, Math.min(2, remainingCapacity)),
  }]
  const inputs = [{ arrival: 0, burst: longBurst }, ...early, ...late].sort((a, b) => a.arrival - b.arrival)
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    difficulty,
    quantums: [...range.quantums],
    processes: inputs.map((input, index) => ({ id: `P${index + 1}`, ...input, priority: 0 })),
  }
}

export function generateMlfqProblem(difficulty: Difficulty): MlfqProblem {
  for (let attempt = 0; attempt < 5000; attempt += 1) {
    const problem = makeProblem(difficulty)
    const solution = solveMlfq(problem)
    const range = limits[difficulty]
    const reachesBottom = solution.levels.includes(2)
    const validDifficulty = difficulty === 'easy' ? solution.interruptions.q1 === 0 && solution.interruptions.q2 === 0
      : difficulty === 'medium' ? solution.interruptions.q1 > 0 && solution.interruptions.q2 === 0
        : solution.interruptions.q2 > 0
    if (reachesBottom && validDifficulty && solution.cells.length <= range.finish
      && problem.processes.every((process) => process.arrival <= range.arrival && process.burst <= range.burst)) return problem
  }
  throw new Error(`Unable to generate a valid ${difficulty} MLFQ exercise.`)
}

export function eventDescription(event: MlfqEvent): string {
  switch (event.kind) {
    case 'arrival': return `${event.process} arrives in Q0`
    case 'dispatch': return `${event.process} runs from Q${event.from}`
    case 'interrupt': return `${event.process} is interrupted in Q${event.from}`
    case 'demote': return `${event.process} moves from Q${event.from} to Q${event.to}`
    case 'complete': return `${event.process} completes`
    case 'idle': return 'CPU becomes idle'
  }
}

const sameList = (left: string[], right: string[]) => left.length === right.length && left.every((id, index) => id === right[index])
const sameKinds = (left: QueueAnswerRow['kinds'], expected: QueueAnswerRow['kinds']) => left.length === expected.length && left.every((kind) => expected.includes(kind))

export function checkQueueRows(rows: QueueAnswerRow[], solution: MlfqSolution): QueueRowError[] {
  const errors: QueueRowError[] = []
  const used = new Set<string>()
  for (const expected of solution.rows) {
    const answer = rows.find((row) => Number(row.time) === expected.time && row.time.trim() !== '' && !used.has(row.id))
    if (!answer) {
      errors.push({ rowId: `missing-${expected.time}`, time: expected.time, status: 'missing', message: `Add the queue-state row for time ${expected.time}.` })
      continue
    }
    used.add(answer.id)
    const expectedKinds = [...new Set(expected.events.map((event) => event.kind))]
    if (!sameKinds(answer.kinds, expectedKinds) || answer.cpu !== expected.cpu
      || !answer.queues.every((queue, level) => sameList(queue, expected.queues[level]))) {
      errors.push({ rowId: answer.id, time: expected.time, status: 'wrong', message: `At time ${expected.time}, ${expected.events.map(eventDescription).join('; ')}. Check the CPU and queue order after these events.` })
    }
  }
  for (const answer of rows) {
    if (used.has(answer.id)) continue
    const time = Number(answer.time)
    const state = Number.isInteger(time) && time >= 0 ? solution.states[time] : undefined
    const validSnapshot = state && !solution.rows.some((row) => row.time === time) && sameKinds(answer.kinds, ['snapshot'])
      && answer.cpu === state.cpu && answer.queues.every((queue, level) => sameList(queue, state.queues[level]))
    if (!validSnapshot) errors.push({ rowId: answer.id, time: Number.isInteger(time) ? time : null, status: answer.time.trim() === '' ? 'missing' : 'wrong', message: `The extra row at ${answer.time.trim() || 'an empty time'} does not match the schedule.` })
  }
  return errors.sort((a, b) => (a.time ?? -1) - (b.time ?? -1))
}
