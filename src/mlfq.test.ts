import { describe, expect, it } from 'vitest'
import { checkQueueRows, generateMlfqProblem, solveMlfq, type MlfqProblem, type QueueAnswerRow } from './mlfq'

const process = (id: string, arrival: number, burst: number) => ({ id, arrival, burst, priority: 0 })
const problem = (processes: MlfqProblem['processes']): MlfqProblem => ({ id: 'fixture', difficulty: 'easy', quantums: [2, 4], processes })

describe('MLFQ policy', () => {
  it('preserves the unused Q1 quantum and queue position after a higher-queue arrival', () => {
    const solution = solveMlfq(problem([process('P1', 0, 7), process('P2', 3, 1)]))
    expect(solution.cells).toEqual(['P1', 'P1', 'P1', 'P2', 'P1', 'P1', 'P1', 'P1'])
    expect(solution.interruptions).toEqual([0, 1, 0])
    expect(solution.rows.find((row) => row.time === 3)).toMatchObject({ cpu: 'P2', queues: [[], ['P1'], []] })
    expect(solution.rows.find((row) => row.time === 3)?.remainingQuantum.P1).toBe(3)
    expect(solution.rows.find((row) => row.time === 7)?.events.some((event) => event.kind === 'demote' && event.to === 2)).toBe(true)
    expect(solution.metrics.P1).toEqual({ completion: 8, turnaround: 8, waiting: 1, response: 0 })
  })

  it('interrupts and resumes the FCFS process at the front of Q2', () => {
    const solution = solveMlfq(problem([process('P1', 0, 8), process('P2', 7, 1)]))
    expect(solution.cells).toEqual(['P1', 'P1', 'P1', 'P1', 'P1', 'P1', 'P1', 'P2', 'P1'])
    expect(solution.interruptions[2]).toBe(1)
    expect(solution.rows.find((row) => row.time === 7)).toMatchObject({ cpu: 'P2', queues: [[], [], ['P1']] })
    expect(solution.rows.find((row) => row.time === 8)?.cpu).toBe('P1')
  })

  it('orders a quantum expiration before a simultaneous arrival and dispatch', () => {
    const solution = solveMlfq(problem([process('P1', 0, 3), process('P2', 2, 1)]))
    const atTwo = solution.rows.find((row) => row.time === 2)
    expect(atTwo?.events.map((event) => event.kind)).toEqual(['demote', 'arrival', 'dispatch'])
    expect(atTwo).toMatchObject({ cpu: 'P2', queues: [[], ['P1'], []] })
  })

  it('checks required event rows and permits correct extra snapshots', () => {
    const solution = solveMlfq(problem([process('P1', 0, 3), process('P2', 2, 1)]))
    const answers: QueueAnswerRow[] = solution.rows.map((row, index) => ({
      id: `row-${index}`, time: String(row.time), kinds: [...new Set(row.events.map((event) => event.kind))], cpu: row.cpu,
      queues: row.queues.map((queue) => [...queue]),
    }))
    const atOne = solution.states[1]
    answers.push({ id: 'extra', time: '1', kinds: ['snapshot'], cpu: atOne.cpu, queues: atOne.queues })
    expect(checkQueueRows(answers, solution)).toEqual([])
    answers[1].queues[1] = []
    expect(checkQueueRows(answers, solution)).toMatchObject([{ rowId: answers[1].id, status: 'wrong' }])
  })

  it('uses RR at every upper level and FCFS at the bottom for five queues', () => {
    const five = { ...problem([process('P1', 0, 22), process('P2', 21, 1)]), quantums: [2, 4, 6, 8] }
    const solution = solveMlfq(five)
    expect(solution.levels).toContain(4)
    expect(solution.rows.find((row) => row.time === 20)?.events).toContainEqual({ kind: 'demote', process: 'P1', from: 3, to: 4 })
    expect(solution.rows.find((row) => row.time === 21)).toMatchObject({ cpu: 'P2', queues: [[], [], [], [], ['P1']] })
    expect(solution.interruptions[4]).toBe(1)
  })
})

describe('MLFQ generation', () => {
  it('generates bounded problems with the required event for every difficulty', () => {
    const limits = {
      easy: { count: [3, 4], queues: [3, 3], arrival: 8, burst: 9, total: 14, finish: 20 },
      medium: { count: [4, 5], queues: [3, 4], arrival: 16, burst: 16, total: 25, finish: 36 },
      hard: { count: [5, 7], queues: [4, 5], arrival: 32, burst: 30, total: 40, finish: 60 },
    } as const
    for (const difficulty of ['easy', 'medium', 'hard'] as const) {
      const limit = limits[difficulty]
      const observedQueueCounts = new Set<number>()
      for (let sample = 0; sample < 100; sample += 1) {
        const generated = generateMlfqProblem(difficulty)
        const solution = solveMlfq(generated)
        observedQueueCounts.add(generated.quantums.length + 1)
        expect(generated.processes.length).toBeGreaterThanOrEqual(limit.count[0])
        expect(generated.processes.length).toBeLessThanOrEqual(limit.count[1])
        expect(generated.quantums.length + 1).toBeGreaterThanOrEqual(limit.queues[0])
        expect(generated.quantums.length + 1).toBeLessThanOrEqual(limit.queues[1])
        expect(generated.quantums).toEqual([2, 4, 6, 8].slice(0, generated.quantums.length))
        expect(generated.processes[0].arrival).toBe(0)
        expect(generated.processes.every((item) => item.arrival <= limit.arrival && item.burst <= limit.burst)).toBe(true)
        expect(generated.processes.reduce((sum, item) => sum + item.burst, 0)).toBeLessThanOrEqual(limit.total)
        expect(solution.cells.length).toBeLessThanOrEqual(limit.finish)
        const bottom = generated.quantums.length
        expect(solution.levels).toContain(bottom)
        if (difficulty === 'easy') expect(solution.interruptions.every((count) => count === 0)).toBe(true)
        if (difficulty === 'medium') { expect(solution.interruptions[1]).toBeGreaterThan(0); expect(solution.interruptions[bottom]).toBe(0) }
        if (difficulty === 'hard') expect(solution.interruptions[bottom]).toBeGreaterThan(0)
      }
      for (let queueCount = limit.queues[0]; queueCount <= limit.queues[1]; queueCount += 1) expect(observedQueueCounts.has(queueCount)).toBe(true)
    }
  })
})
