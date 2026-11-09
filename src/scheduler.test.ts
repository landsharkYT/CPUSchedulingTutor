import { describe, expect, it } from 'vitest'
import { generateProblem, parseAverage, solve, type Algorithm, type Difficulty, type PriorityMode, type Process } from './scheduler'

function scenario(processes: Process[], quantum = 2) { return { processes, quantum } }

describe('paper-exam scheduling rules', () => {
  it('solves the supplied FCFS example and calculates all three metrics', () => {
    const input = scenario([
      { id: 'P1', arrival: 0, burst: 9, priority: 0 },
      { id: 'P2', arrival: 4, burst: 4, priority: 0 },
      { id: 'P3', arrival: 6, burst: 1, priority: 0 },
      { id: 'P4', arrival: 8, burst: 6, priority: 0 },
    ])
    const result = solve(input, 'fcfs', 'off')
    expect(result.cells.join(' ')).toBe('P1 P1 P1 P1 P1 P1 P1 P1 P1 P2 P2 P2 P2 P3 P4 P4 P4 P4 P4 P4')
    expect(result.metrics.P3).toEqual({ completion: 14, turnaround: 8, waiting: 7, response: 7 })
  })

  it('puts simultaneous RR arrivals before the expired process', () => {
    const result = solve(scenario([
      { id: 'P1', arrival: 0, burst: 3, priority: 1 },
      { id: 'P2', arrival: 2, burst: 1, priority: 2 },
    ]), 'rr', 'off')
    expect(result.cells).toEqual(['P1', 'P1', 'P2', 'P1'])
  })

  it('does not let tie-breaker priority pass an earlier FCFS arrival', () => {
    const result = solve(scenario([
      { id: 'P1', arrival: 0, burst: 4, priority: 1 },
      { id: 'P2', arrival: 1, burst: 2, priority: 2 },
      { id: 'P3', arrival: 2, burst: 1, priority: 10 },
    ]), 'fcfs', 'tie')
    expect(result.cells.slice(4)).toEqual(['P2', 'P2', 'P3'])
  })

  it('uses process number when FCFS arrival and priority are both equal', () => {
    const result = solve(scenario([
      { id: 'P1', arrival: 0, burst: 1, priority: 5 },
      { id: 'P2', arrival: 0, burst: 1, priority: 5 },
    ]), 'fcfs', 'tie')
    expect(result.cells).toEqual(['P1', 'P2'])
  })

  it('priority-orders simultaneous RR arrivals without passing an older queued process', () => {
    const result = solve(scenario([
      { id: 'P1', arrival: 0, burst: 3, priority: 1 },
      { id: 'P2', arrival: 0, burst: 2, priority: 5 },
      { id: 'P3', arrival: 1, burst: 1, priority: 10 },
    ], 1), 'rr', 'tie')
    expect(result.cells.slice(0, 3)).toEqual(['P2', 'P1', 'P3'])
  })

  it('uses higher priority to break an equal remaining-time SJF tie', () => {
    const input = scenario([
      { id: 'P1', arrival: 0, burst: 4, priority: 2 },
      { id: 'P2', arrival: 2, burst: 2, priority: 8 },
    ])
    expect(solve(input, 'srtf', 'off').cells.slice(0, 4)).toEqual(['P1', 'P1', 'P1', 'P1'])
    expect(solve(input, 'srtf', 'tie').cells.slice(0, 4)).toEqual(['P1', 'P1', 'P2', 'P2'])
  })

  it('keeps nonpreemptive SJF running, then chooses the shortest ready job', () => {
    const result = solve(scenario([
      { id: 'P1', arrival: 0, burst: 5, priority: 0 },
      { id: 'P2', arrival: 1, burst: 4, priority: 0 },
      { id: 'P3', arrival: 2, burst: 1, priority: 0 },
    ]), 'sjf', 'off')
    expect(result.cells).toEqual(['P1', 'P1', 'P1', 'P1', 'P1', 'P3', 'P2', 'P2', 'P2', 'P2'])
    expect(result.metrics.P3).toEqual({ completion: 6, turnaround: 4, waiting: 3, response: 3 })
  })

  it('preempts only for a strictly shorter remaining job when priority is off', () => {
    const result = solve(scenario([
      { id: 'P1', arrival: 0, burst: 5, priority: 0 },
      { id: 'P2', arrival: 1, burst: 4, priority: 0 },
      { id: 'P3', arrival: 2, burst: 1, priority: 0 },
    ]), 'srtf', 'off')
    expect(result.cells.slice(0, 6)).toEqual(['P1', 'P1', 'P3', 'P1', 'P1', 'P1'])
    expect(result.events.preemptions).toBe(1)
  })

  it('keeps the existing RR queue ahead of later arrivals and represents idle gaps', () => {
    const result = solve(scenario([
      { id: 'P1', arrival: 0, burst: 2, priority: 0 },
      { id: 'P2', arrival: 0, burst: 1, priority: 0 },
      { id: 'P3', arrival: 1, burst: 1, priority: 0 },
      { id: 'P4', arrival: 7, burst: 1, priority: 0 },
    ], 1), 'rr', 'off')
    expect(result.cells).toEqual(['P1', 'P2', 'P3', 'P1', 'Idle', 'Idle', 'Idle', 'P4'])
    expect(result.events.idleGap).toBe(true)
    expect(result.metrics.P4.response).toBe(0)
  })

  it('applies priority-first selection but does not preempt FCFS or nonpreemptive SJF', () => {
    const input = scenario([
      { id: 'P1', arrival: 0, burst: 3, priority: 1 },
      { id: 'P2', arrival: 0, burst: 4, priority: 5 },
      { id: 'P3', arrival: 1, burst: 1, priority: 9 },
    ])
    expect(solve(input, 'fcfs', 'first').cells.slice(0, 5)).toEqual(['P2', 'P2', 'P2', 'P2', 'P3'])
    expect(solve(input, 'sjf', 'first').cells.slice(0, 5)).toEqual(['P2', 'P2', 'P2', 'P2', 'P3'])
  })

  it('uses shortest job among equal-priority processes in a priority-first SJF hybrid', () => {
    const result = solve(scenario([
      { id: 'P1', arrival: 0, burst: 3, priority: 1 },
      { id: 'P2', arrival: 0, burst: 4, priority: 5 },
      { id: 'P3', arrival: 0, burst: 1, priority: 5 },
    ]), 'sjf', 'first')
    expect(result.cells.slice(0, 5)).toEqual(['P3', 'P2', 'P2', 'P2', 'P2'])
  })

  it('preempts for higher priority in priority-first SRTF even if the new burst is longer', () => {
    const result = solve(scenario([
      { id: 'P1', arrival: 0, burst: 3, priority: 1 },
      { id: 'P2', arrival: 1, burst: 4, priority: 9 },
    ]), 'srtf', 'first')
    expect(result.cells).toEqual(['P1', 'P2', 'P2', 'P2', 'P2', 'P1', 'P1'])
  })

  it('preempts for a shorter remaining job within the same priority level', () => {
    const result = solve(scenario([
      { id: 'P1', arrival: 0, burst: 5, priority: 5 },
      { id: 'P2', arrival: 1, burst: 2, priority: 5 },
    ]), 'srtf', 'first')
    expect(result.cells.slice(0, 4)).toEqual(['P1', 'P2', 'P2', 'P1'])
  })

  it('preempts only higher priority in preemptive Priority Scheduling', () => {
    const input = scenario([
      { id: 'P1', arrival: 0, burst: 4, priority: 2 },
      { id: 'P2', arrival: 1, burst: 2, priority: 9 },
    ])
    expect(solve(input, 'priority', 'tie').cells).toEqual(['P1', 'P1', 'P1', 'P1', 'P2', 'P2'])
    expect(solve(input, 'priority-preemptive', 'tie').cells).toEqual(['P1', 'P2', 'P2', 'P1', 'P1', 'P1'])
  })

  it('preempts priority-first RR and gives the interrupted process a fresh quantum', () => {
    const result = solve(scenario([
      { id: 'P1', arrival: 0, burst: 5, priority: 2 },
      { id: 'P2', arrival: 1, burst: 2, priority: 8 },
      { id: 'P3', arrival: 2, burst: 2, priority: 2 },
    ], 3), 'rr', 'first')
    expect(result.cells).toEqual(['P1', 'P2', 'P2', 'P1', 'P1', 'P1', 'P3', 'P3', 'P1'])
  })

  it('keeps equal-priority arrivals from preempting priority scheduling', () => {
    const result = solve(scenario([
      { id: 'P1', arrival: 0, burst: 3, priority: 5 },
      { id: 'P2', arrival: 1, burst: 2, priority: 5 },
    ]), 'priority-preemptive', 'tie')
    expect(result.cells).toEqual(['P1', 'P1', 'P1', 'P2', 'P2'])
  })

  it('accepts exact fractions and decimals for averages', () => {
    expect(parseAverage('3 / 2')).toBe(1.5)
    expect(parseAverage('1.50')).toBe(1.5)
    expect(parseAverage('3/0')).toBeNull()
    expect(parseAverage('oops')).toBeNull()
  })
})

describe('generated exercises', () => {
  const difficulties: Difficulty[] = ['easy', 'medium', 'hard']
  const algorithms: Algorithm[] = ['fcfs', 'sjf', 'srtf', 'rr', 'priority', 'priority-preemptive']
  const limits = { easy: { count: [3, 4], arrival: 4, burst: 6, total: 14, quantum: [2, 3] }, medium: { count: [4, 5], arrival: 8, burst: 8, total: 25, quantum: [2, 4] }, hard: { count: [5, 7], arrival: 12, burst: 10, total: 40, quantum: [1, 4] } }

  it('stays in difficulty ranges and completes every process', () => {
    for (const difficulty of difficulties) for (const algorithm of algorithms) for (const mode of ['off', 'tie', 'first'] as PriorityMode[]) for (let sample = 0; sample < 20; sample += 1) {
      if (algorithm.startsWith('priority') && mode === 'off') continue
      const priorityEnabled = mode !== 'off'
      const problem = generateProblem(difficulty, priorityEnabled, algorithm, mode)
      const limit = limits[difficulty]
      expect(problem.processes.length).toBeGreaterThanOrEqual(limit.count[0])
      expect(problem.processes.length).toBeLessThanOrEqual(limit.count[1])
      expect(problem.processes[0].arrival).toBe(0)
      expect(problem.processes.reduce((sum, process) => sum + process.burst, 0)).toBeLessThanOrEqual(limit.total)
      expect(problem.quantum).toBeGreaterThanOrEqual(limit.quantum[0])
      expect(problem.quantum).toBeLessThanOrEqual(limit.quantum[1])
      for (const process of problem.processes) {
        expect(process.arrival).toBeLessThanOrEqual(limit.arrival)
        expect(process.burst).toBeLessThanOrEqual(limit.burst)
        if (priorityEnabled) {
          expect(process.priority).toBeGreaterThanOrEqual(1)
          expect(process.priority).toBeLessThanOrEqual(10)
        }
      }
      expect(problem.processes.map((process) => process.id)).toEqual(problem.processes.map((_, index) => `P${index + 1}`))
      expect(problem.processes.map((process) => process.arrival)).toEqual([...problem.processes.map((process) => process.arrival)].sort((a, b) => a - b))
      const result = solve(problem, algorithm, mode)
      for (const process of problem.processes) expect(result.cells.filter((cell) => cell === process.id)).toHaveLength(process.burst)
      if (algorithm === 'sjf') expect(result.events.choices).toBeGreaterThanOrEqual(difficulty === 'hard' ? 2 : 1)
      if (algorithm === 'srtf') expect(result.events.preemptions).toBeGreaterThanOrEqual(difficulty === 'hard' ? 2 : 1)
      if (algorithm === 'rr') expect(result.events.rotations).toBeGreaterThanOrEqual(difficulty === 'hard' ? 2 : 1)
      if (algorithm === 'priority' && difficulty === 'hard') expect(result.events.priorityChoices).toBeGreaterThanOrEqual(2)
      if (algorithm === 'priority-preemptive' && difficulty === 'hard') expect(result.events.preemptions).toBeGreaterThanOrEqual(2)
      if (mode === 'first' && !algorithm.startsWith('priority')) expect(result.events.secondaryChoices).toBeGreaterThanOrEqual(1)
      if (algorithm === 'fcfs' && difficulty === 'hard') {
        expect(result.events.idleGap).toBe(true)
        expect(Object.values(result.metrics).some((metric) => metric.waiting > 0)).toBe(true)
      }
      if (priorityEnabled) {
        const baseline = solve(problem, algorithm.startsWith('priority') ? 'fcfs' : algorithm, 'off')
        expect(result.cells.some((value, index) => value !== baseline.cells[index])).toBe(true)
      }
    }
  })
})
