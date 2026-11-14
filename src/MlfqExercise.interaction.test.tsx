// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import App from './App'
import { solveMlfq, type MlfqProblem } from './mlfq'

const key = 'cpu-scheduling-lab-mlfq-v1'
const familyKey = 'cpu-scheduling-lab-family'
const guideKey = 'cpu-scheduling-lab-mlfq-guide-seen'
const problem: MlfqProblem = {
  id: 'test-MLFQ', difficulty: 'easy', quantums: [2, 4],
  processes: [
    { id: 'P1', arrival: 0, burst: 7, priority: 0 },
    { id: 'P2', arrival: 3, burst: 1, priority: 0 },
  ],
}

function seed(answered = false) {
  const solved = solveMlfq(problem)
  const answers: Record<string, string> = {}
  if (answered) {
    for (const process of problem.processes) {
      for (const name of ['completion', 'turnaround', 'waiting', 'response'] as const) {
        answers[`${process.id}.${name}`] = String(solved.metrics[process.id][name])
      }
    }
    for (const name of ['turnaround', 'waiting', 'response'] as const) answers[`average.${name}`] = String(solved.averages[name])
  }
  localStorage.setItem(key, JSON.stringify({
    problem,
    attempt: {
      cells: answered ? [...solved.cells, ...Array(4).fill(null)] : Array(12).fill(null),
      finish: answered ? solved.cells.length : 0,
      rows: answered ? solved.rows.map((row, index) => ({
        id: `row-${index}`, time: String(row.time), kinds: [...new Set(row.events.map((event) => event.kind))],
        cpu: row.cpu, queues: row.queues,
      })) : [],
      answers, hasChecked: false, checked: false, solutionViewed: false,
      elapsedSeconds: 0, started: answered, complete: false,
    },
  }))
  localStorage.setItem(familyKey, 'mlfq')
  localStorage.setItem(guideKey, 'yes')
}

beforeEach(() => localStorage.clear())
afterEach(() => cleanup())

describe('MLFQ exercise', () => {
  it('checks a complete event table, Gantt chart, and metrics together', () => {
    seed(true)
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: /Check my work/ }))
    expect(screen.getByText('You solved it.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /View worked solution/ }))
    expect(screen.getByText('Queue decisions')).toBeTruthy()
    expect(screen.getByText(/P1 · Q2/)).toBeTruthy()
    const saved = JSON.parse(localStorage.getItem(key) ?? '{}')
    expect(saved.attempt.complete).toBe(true)
    expect(saved.attempt.solutionViewed).toBe(true)
  })

  it('reports missing event times and keeps the unfinished attempt when discard is canceled', () => {
    seed()
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: /Add event row/ }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Event 1 time' }), { target: { value: '0' } })
    fireEvent.click(screen.getByRole('button', { name: /Check my work/ }))
    expect(screen.getByText(/Missing event times:/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /New problem/ }))
    expect(screen.getByRole('alertdialog')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Keep current set' }))
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(screen.getByRole('textbox', { name: 'Event 1 time' }).getAttribute('value')).toBe('0')
  })

  it('keeps the standard process set while replacing MLFQ difficulty', () => {
    seed()
    localStorage.setItem('cpu-scheduling-lab-v1', 'standard-set-marker')
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Open settings' }))
    fireEvent.click(screen.getByRole('button', { name: 'medium' }))
    expect(screen.getByRole('dialog', { name: 'Settings' })).toBeTruthy()
    expect(JSON.parse(localStorage.getItem(key) ?? '{}').problem.difficulty).toBe('medium')
    expect(localStorage.getItem('cpu-scheduling-lab-v1')).toBe('standard-set-marker')
  })

  it('shows and grades all waiting queues in a five-queue problem', () => {
    seed()
    const stored = JSON.parse(localStorage.getItem(key) ?? '{}')
    stored.problem.quantums = [2, 4, 6, 8]
    stored.problem.processes[0].burst = 22
    stored.problem.processes[1].arrival = 21
    localStorage.setItem(key, JSON.stringify(stored))
    render(<App />)
    expect(screen.getByText('Q4')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Add event row/ }))
    expect(screen.getByRole('button', { name: 'Add selected process to event 1 Q4' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Check my work/ }))
    fireEvent.click(screen.getByRole('button', { name: /View worked solution/ }))
    expect(screen.getAllByText(/Q4:/).length).toBeGreaterThan(0)
  })
})
