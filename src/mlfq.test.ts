import { describe, expect, it } from 'vitest'
import { checkQueueRows, generateMlfqProblem, solveMlfq, type MlfqProblem, type QueueAnswerRow } from './mlfq'

const process = (id: string, arrival: number, burst: number) => ({ id, arrival, burst, priority: 0 })
const problem = (processes: MlfqProblem['processes']): MlfqProblem => ({ id: 'fixture', difficulty: 'easy', quantums: [2, 4], processes })

describe('MLFQ policy', () => {
  it('preserves the unused Q1 quantum and queue position after a higher-queue arrival', () => {
    const solution = solveMlfq(problem([process('P1', 0, 7), process('P2', 3, 1)]))
    expect(solution.cells).toEqual(['P1', 'P1', 'P1', 'P2', 'P1', 'P1', 'P1', 'P1'])
    expect(solution.interruptions).toEqual({ q1: 1, q2: 0 })
    expect(solution.rows.find((row) => row.time === 3)).toMatchObject({ cpu: 'P2', queues: [[], ['P1'], []] })
    expect(solution.rows.find((row) => row.time === 3)?.remainingQuantum.P1).toBe(3)
    expect(solution.rows.find((row) => row.time === 7)?.events.some((event) => event.kind === 'demote' && event.to === 2)).toBe(true)
    expect(solution.metrics.P1).toEqual({ completion: 8, turnaround: 8, waiting: 1, response: 0 })
  })

  it('interrupts and resumes the FCFS process at the front of Q2', () => {
    const solution = solveMlfq(problem([process('P1', 0, 8), process('P2', 7, 1)]))
    expect(solution.cells).toEqual(['P1', 'P1', 'P1', 'P1', 'P1', 'P1', 'P1', 'P2', 'P1'])
    expect(solution.interruptions.q2).toBe(1)
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
      queues: [[...row.queues[0]], [...row.queues[1]], [...row.queues[2]]],
    }))
    const atOne = solution.states[1]
    answers.push({ id: 'extra', time: '1', kinds: ['snapshot'], cpu: atOne.cpu, queues: atOne.queues })
    expect(checkQueueRows(answers, solution)).toEqual([])
    answers[1].queues[1] = []
    expect(checkQueueRows(answers, solution)).toMatchObject([{ rowId: answers[1].id, status: 'wrong' }])
  })
})

describe('MLFQ generation', () => {
  it('generates bounded problems with the required event for every difficulty', () => {
    const limits = {
      easy: { count: [3, 4], arrival: 8, burst: 9, total: 14, finish: 20, quantums: [2, 4] },
      medium: { count: [4, 5], arrival: 16, burst: 16, total: 25, finish: 36, quantums: [4, 8] },
      hard: { count: [5, 7], arrival: 32, burst: 30, total: 40, finish: 60, quantums: [8, 16] },
    } as const
    for (const difficulty of ['easy', 'medium', 'hard'] as const) {
      for (let sample = 0; sample < 100; sample += 1) {
        const generated = generateMlfqProblem(difficulty)
        const solution = solveMlfq(generated)
        const limit = limits[difficulty]
        expect(generated.processes.length).toBeGreaterThanOrEqual(limit.count[0])
        expect(generated.processes.length).toBeLessThanOrEqual(limit.count[1])
        expect(generated.quantums).toEqual(limit.quantums)
        expect(generated.processes[0].arrival).toBe(0)
        expect(generated.processes.every((item) => item.arrival <= limit.arrival && item.burst <= limit.burst)).toBe(true)
        expect(generated.processes.reduce((sum, item) => sum + item.burst, 0)).toBeLessThanOrEqual(limit.total)
        expect(solution.cells.length).toBeLessThanOrEqual(limit.finish)
        expect(solution.levels).toContain(2)
        if (difficulty === 'easy') expect(solution.interruptions).toEqual({ q1: 0, q2: 0 })
        if (difficulty === 'medium') { expect(solution.interruptions.q1).toBeGreaterThan(0); expect(solution.interruptions.q2).toBe(0) }
        if (difficulty === 'hard') expect(solution.interruptions.q2).toBeGreaterThan(0)
      }
    }
  })
})
