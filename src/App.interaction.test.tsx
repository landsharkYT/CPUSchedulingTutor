// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'

const storageKey = 'cpu-scheduling-lab-v1'

function fixture(priorityEnabled = false) {
  const mode = priorityEnabled ? 'tie' : 'off'
  return {
    problem: {
      id: 'test-ABCD',
      processes: [
        { id: 'P1', arrival: 0, burst: 2, priority: priorityEnabled ? 4 : 0 },
        { id: 'P2', arrival: 1, burst: 1, priority: priorityEnabled ? 8 : 0 },
      ],
      quantum: 2,
      difficulty: 'easy',
      priorityEnabled,
      originAlgorithm: 'fcfs',
      originMode: mode,
    },
    algorithm: 'fcfs',
    mode,
    attempts: {
      [`fcfs:${mode}`]: {
        cells: Array(12).fill(null), finish: 0, answers: {}, hasChecked: false,
        checked: false, solutionViewed: false, elapsedSeconds: 0, started: false, complete: false,
      },
    },
  }
}

function mount(priorityEnabled = false) {
  localStorage.setItem(storageKey, JSON.stringify(fixture(priorityEnabled)))
  return render(<App />)
}

function mountAnswered(finish = 3, extraCell: string | null = null, elapsedSeconds = 0) {
  const session = fixture()
  const attempt = session.attempts['fcfs:off']
  attempt.cells[0] = 'P1'
  attempt.cells[1] = 'P1'
  attempt.cells[2] = 'P2'
  attempt.cells[3] = extraCell
  attempt.finish = finish
  attempt.started = true
  attempt.elapsedSeconds = elapsedSeconds
  attempt.answers = {
    'P1.completion': '2', 'P1.turnaround': '2', 'P1.waiting': '0', 'P1.response': '0',
    'P2.completion': '3', 'P2.turnaround': '2', 'P2.waiting': '1', 'P2.response': '1',
    'average.turnaround': '2', 'average.waiting': '0.5', 'average.response': '1/2',
  }
  localStorage.setItem(storageKey, JSON.stringify(session))
  return render(<App />)
}

function cell(time: number) {
  const element = document.querySelector<HTMLButtonElement>(`[data-cell="${time}"]`)
  if (!element) throw new Error(`Missing time cell ${time}`)
  return element
}

function answer(label: string, value: string) {
  fireEvent.change(screen.getByRole('textbox', { name: label }), { target: { value } })
}

beforeEach(() => {
  localStorage.clear()
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
})
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers() })

describe('timeline and grading', () => {
  it('supports tap, keyboard, drag and drop, run resizing, and Finish controls', () => {
    mount()
    fireEvent.click(cell(0))
    expect(cell(0).getAttribute('aria-label')).toContain('P1')
    cell(0).focus()
    fireEvent.keyDown(cell(0), { key: 'ArrowRight' })
    expect(document.activeElement).toBe(cell(1))
    fireEvent.keyDown(cell(1), { key: 'Enter' })
    expect(cell(1).getAttribute('aria-label')).toContain('P1')
    fireEvent.keyDown(cell(1), { key: '2' })
    expect(cell(1).getAttribute('aria-label')).toContain('P2')
    fireEvent.keyDown(cell(2), { key: 'i' })
    expect(cell(2).getAttribute('aria-label')).toContain('Idle')
    fireEvent.keyDown(cell(2), { key: 'Delete' })
    expect(cell(2).getAttribute('aria-label')).toContain('empty')
    fireEvent.drop(cell(2), { dataTransfer: { getData: () => 'P2' } })
    expect(cell(2).getAttribute('aria-label')).toContain('P2')
    fireEvent.click(cell(0))
    fireEvent.click(screen.getByTitle('Extend selected run'))
    expect(cell(1).getAttribute('aria-label')).toContain('P1')
    fireEvent.click(screen.getByTitle('Trim selected run'))
    expect(cell(1).getAttribute('aria-label')).toContain('empty')
    fireEvent.click(screen.getByRole('button', { name: 'Move finish left' }))
    expect(screen.getByText('t=2')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Move finish right' }))
    expect(screen.getByText('t=3')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Add 6 cells' }))
    expect(cell(17)).toBeTruthy()
  })

  it('marks missing and wrong cells separately, then unlocks the worked solution', () => {
    mount()
    fireEvent.click(screen.getByRole('button', { name: 'Move finish right' }))
    fireEvent.click(screen.getByRole('button', { name: 'Move finish right' }))
    fireEvent.click(screen.getByRole('button', { name: 'P2' }))
    fireEvent.click(cell(0))
    fireEvent.click(screen.getByRole('button', { name: 'Check my work' }))
    expect(cell(0).className).toContain('wrong')
    expect(cell(1).className).toContain('missing')
    expect(screen.getByText(/At time 0, P1 should run/)).toBeTruthy()
    expect(screen.getByRole('button', { name: /View worked solution/ })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /View worked solution/ }))
    expect(screen.getByText('Worked solution')).toBeTruthy()
    const worked = document.querySelector<HTMLElement>('.solution-panel')
    if (!worked) throw new Error('Worked solution panel is missing')
    for (const name of ['Arrival', 'Burst', 'Completion', 'Turnaround', 'Waiting', 'Response']) expect(within(worked).getByRole('columnheader', { name })).toBeTruthy()
    expect(within(worked).getByText('Sample calculations for P1')).toBeTruthy()
    expect(within(worked).getByText('Average')).toBeTruthy()
    expect(JSON.parse(localStorage.getItem(storageKey) ?? '{}').attempts['fcfs:off'].solutionViewed).toBe(true)
  })

  it('accepts a fully correct schedule and calculations, including fraction averages', () => {
    mount()
    fireEvent.click(cell(0))
    fireEvent.click(cell(1))
    fireEvent.click(screen.getByRole('button', { name: 'P2' }))
    fireEvent.click(cell(2))
    answer('P1 Completion time', '2')
    answer('P1 Turnaround time', '2')
    answer('P1 Waiting time', '0')
    answer('P1 Response time', '0')
    answer('P2 Completion time', '3')
    answer('P2 Turnaround time', '2')
    answer('P2 Waiting time', '1')
    answer('P2 Response time', '1')
    answer('Average turnaround time', '2')
    answer('Average waiting time', '1/2')
    answer('Average response time', '0.5')
    fireEvent.click(screen.getByRole('button', { name: 'Check my work' }))
    expect(screen.getByText('You solved it.')).toBeTruthy()
    expect(JSON.parse(localStorage.getItem(storageKey) ?? '{}').attempts['fcfs:off'].complete).toBe(true)
  })

  it('keeps formula help hidden until activated by touch or focus', () => {
    mount()
    const trigger = screen.getByRole('button', { name: 'Show completion formula' })
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(trigger)
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getAllByRole('tooltip').length).toBeGreaterThan(0)
  })

  it('ignores workspace cells beyond Finish when checking a correct answer', () => {
    mountAnswered(3, 'P1')
    fireEvent.click(screen.getByRole('button', { name: 'Check my work' }))
    expect(screen.getByText('You solved it.')).toBeTruthy()
  })

  it('rejects a Finish marker that is too early or too late', () => {
    const view = mountAnswered(2)
    fireEvent.click(screen.getByRole('button', { name: 'Check my work' }))
    expect(screen.getByText(/Finish marker is too early/)).toBeTruthy()
    view.unmount()
    mountAnswered(4)
    fireEvent.click(screen.getByRole('button', { name: 'Check my work' }))
    expect(cell(3).className).toContain('missing')
    expect(screen.getByText(/Finish marker extends past/)).toBeTruthy()
  })

  it('accepts averages at the 0.01 boundary and rejects values outside it', () => {
    const view = mountAnswered()
    answer('Average waiting time', '0.51')
    fireEvent.click(screen.getByRole('button', { name: 'Check my work' }))
    expect(screen.getByText('You solved it.')).toBeTruthy()
    view.unmount()
    mountAnswered()
    answer('Average waiting time', '0.511')
    fireEvent.click(screen.getByRole('button', { name: 'Check my work' }))
    expect(screen.queryByText('You solved it.')).toBeNull()
    expect(screen.getByRole('textbox', { name: 'Average waiting time' }).className).toContain('wrong')
  })

  it('marks missing and wrong metric fields independently', () => {
    mountAnswered()
    answer('P1 Completion time', '')
    answer('P2 Waiting time', '5')
    fireEvent.click(screen.getByRole('button', { name: 'Check my work' }))
    expect(screen.getByRole('textbox', { name: 'P1 Completion time' }).className).toContain('missing')
    expect(screen.getByRole('textbox', { name: 'P2 Waiting time' }).className).toContain('wrong')
    expect(screen.queryByText('You solved it.')).toBeNull()
  })
})

describe('settings, saving, and elapsed time', () => {
  it('restores an attempt after a reload and keeps algorithms separate', () => {
    const view = mount()
    fireEvent.click(cell(0))
    answer('P1 Completion time', '2')
    view.unmount()
    render(<App />)
    expect(cell(0).getAttribute('aria-label')).toContain('P1')
    expect(screen.getByRole<HTMLInputElement>('textbox', { name: 'P1 Completion time' }).value).toBe('2')
    fireEvent.click(screen.getByRole('button', { name: 'Shortest job first' }))
    expect(cell(0).getAttribute('aria-label')).toContain('empty')
    fireEvent.click(screen.getByRole('button', { name: 'First come, first served' }))
    expect(cell(0).getAttribute('aria-label')).toContain('P1')
    fireEvent.click(screen.getByRole('button', { name: 'Round robin' }))
    expect(screen.getByText('2 units')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'P2' }))
    fireEvent.click(cell(0))
    fireEvent.click(screen.getByRole('button', { name: 'First come, first served' }))
    fireEvent.click(screen.getByRole('button', { name: 'Round robin' }))
    expect(cell(0).getAttribute('aria-label')).toContain('P2')
    expect(screen.getByText('2 units')).toBeTruthy()
  })

  it('restores completed status, elapsed time, Finish, and solution-viewed state', () => {
    const view = mountAnswered(3, null, 17)
    fireEvent.click(screen.getByRole('button', { name: 'Check my work' }))
    fireEvent.click(screen.getByRole('button', { name: /View worked solution/ }))
    view.unmount()
    render(<App />)
    expect(screen.getByText('You solved it.')).toBeTruthy()
    expect(screen.getByText('t=3')).toBeTruthy()
    expect(screen.getByLabelText('Elapsed time 00:17')).toBeTruthy()
    expect(screen.getByText(/solution viewed/)).toBeTruthy()
  })

  it('confirms before replacing unfinished work and exposes priority controls only when enabled', () => {
    mount()
    fireEvent.click(cell(0))
    const confirmation = vi.spyOn(window, 'confirm').mockReturnValue(false)
    fireEvent.click(screen.getByRole('button', { name: 'Open settings' }))
    fireEvent.click(screen.getByRole('switch'))
    expect(confirmation).toHaveBeenCalledOnce()
    expect(screen.queryByRole('button', { name: 'Priority · nonpreemptive' })).toBeNull()
    confirmation.mockReturnValue(true)
    fireEvent.click(screen.getByRole('switch'))
    expect(screen.getByRole('button', { name: 'Priority · nonpreemptive' })).toBeTruthy()
    expect(screen.getByText('Priority', { selector: 'th' })).toBeTruthy()
  })

  it('confirms New Problem and difficulty changes before discarding an unfinished attempt', () => {
    mount()
    fireEvent.click(cell(0))
    const confirmation = vi.spyOn(window, 'confirm').mockReturnValue(false)
    fireEvent.click(screen.getByRole('button', { name: 'New problem' }))
    expect(confirmation).toHaveBeenCalledOnce()
    expect(screen.getByText('#ABCD')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Open settings' }))
    fireEvent.click(screen.getByRole('button', { name: 'hard' }))
    expect(confirmation).toHaveBeenCalledTimes(2)
    expect(screen.getByText('#ABCD')).toBeTruthy()
    confirmation.mockReturnValue(true)
    fireEvent.click(screen.getByRole('button', { name: 'hard' }))
    expect(screen.queryByText('#ABCD')).toBeNull()
    const saved = JSON.parse(localStorage.getItem(storageKey) ?? '{}')
    expect(saved.problem.id).not.toBe('test-ABCD')
    expect(Object.keys(saved.attempts)).toHaveLength(1)
    expect(saved.attempts['fcfs:off'].cells[0]).toBeNull()
  })

  it('restores a distinct attempt for each priority mode', () => {
    mount(true)
    fireEvent.click(cell(0))
    fireEvent.click(screen.getByRole('button', { name: 'Open settings' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Priority first' }))
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(cell(0).getAttribute('aria-label')).toContain('empty')
    fireEvent.click(screen.getByRole('button', { name: 'P2' }))
    fireEvent.click(cell(0))
    fireEvent.click(screen.getByRole('button', { name: 'Open settings' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Tie-breaker' }))
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(cell(0).getAttribute('aria-label')).toContain('P1')
  })

  it('starts on the first answer edit, pauses while hidden, and resumes on return', () => {
    mount()
    vi.useFakeTimers()
    act(() => vi.advanceTimersByTime(2000))
    expect(screen.getByLabelText('Elapsed time 00:00')).toBeTruthy()
    fireEvent.click(cell(0))
    act(() => vi.advanceTimersByTime(2000))
    expect(screen.getByLabelText('Elapsed time 00:02')).toBeTruthy()
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })
    act(() => vi.advanceTimersByTime(2000))
    expect(screen.getByLabelText('Elapsed time 00:02')).toBeTruthy()
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
    act(() => vi.advanceTimersByTime(1000))
    expect(screen.getByLabelText('Elapsed time 00:03')).toBeTruthy()
  })

  it('stops the timer after a correct check', () => {
    vi.useFakeTimers()
    mountAnswered()
    act(() => vi.advanceTimersByTime(1000))
    expect(screen.getByLabelText('Elapsed time 00:01')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Check my work' }))
    act(() => vi.advanceTimersByTime(3000))
    expect(screen.getByLabelText('Elapsed time 00:01')).toBeTruthy()
  })
})
