import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, ArrowRight, Check, ChevronLeft, ChevronRight, Clock3, Grip, HelpCircle, Minus, Moon, Plus, RotateCcw, Settings2, Sparkles, Sun, X } from 'lucide-react'
import {
  ALGORITHM_LABELS, FORMULAS, generateProblem, groupCells, parseAverage, solve,
  type Algorithm, type CellValue, type Difficulty, type PriorityMode, type Problem,
} from './scheduler'

type MetricName = 'completion' | 'turnaround' | 'waiting' | 'response'
type AverageName = 'turnaround' | 'waiting' | 'response'
type Attempt = {
  cells: CellValue[]
  finish: number
  answers: Record<string, string>
  hasChecked: boolean
  checked: boolean
  solutionViewed: boolean
  elapsedSeconds: number
  started: boolean
  complete: boolean
}
type Session = {
  problem: Problem
  algorithm: Algorithm
  mode: PriorityMode
  attempts: Record<string, Attempt>
}
type Theme = 'light' | 'dark'
type ReplacementReason = 'new' | 'difficulty' | 'priority'
type PendingReplacement = { difficulty: Difficulty; enabled: boolean; keepSettingsOpen: boolean; reason: ReplacementReason }

const STORAGE_KEY = 'cpu-scheduling-lab-v1'
const THEME_KEY = 'cpu-scheduling-lab-theme'
const replacementTitles: Record<ReplacementReason, string> = {
  new: 'Start a new problem?',
  difficulty: 'Change the difficulty?',
  priority: 'Change the priority setting?',
}
const metricNames: MetricName[] = ['completion', 'turnaround', 'waiting', 'response']
const averageNames: AverageName[] = ['turnaround', 'waiting', 'response']
const metricLabels: Record<MetricName, string> = { completion: 'Completion', turnaround: 'Turnaround', waiting: 'Waiting', response: 'Response' }
const colors = ['#4f86f7', '#9c75ed', '#36bcb0', '#ef9c54', '#e76f8a', '#86a75d', '#d3ae4a']

function attemptKey(algorithm: Algorithm, mode: PriorityMode): string {
  return algorithm.startsWith('priority') ? algorithm : `${algorithm}:${mode}`
}

function freshAttempt(): Attempt {
  return { cells: Array(12).fill(null), finish: 0, answers: {}, hasChecked: false, checked: false, solutionViewed: false, elapsedSeconds: 0, started: false, complete: false }
}

function freshSession(): Session {
  const algorithm: Algorithm = 'fcfs'
  const mode: PriorityMode = 'off'
  return { problem: generateProblem('easy', false, algorithm, mode), algorithm, mode, attempts: { [attemptKey(algorithm, mode)]: freshAttempt() } }
}

function isSession(value: unknown): value is Session {
  if (typeof value !== 'object' || value === null) return false
  if (!('problem' in value) || !('attempts' in value) || !('algorithm' in value) || !('mode' in value)) return false
  const problem = value.problem
  return typeof problem === 'object' && problem !== null && 'processes' in problem && Array.isArray(problem.processes)
    && typeof value.attempts === 'object' && value.attempts !== null
    && typeof value.algorithm === 'string' && typeof value.mode === 'string'
}

function loadSession(): Session {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      const parsed: unknown = JSON.parse(stored)
      if (isSession(parsed)) return parsed
    }
  } catch {
    // A private browser session may block storage. Practice still works in memory.
  }
  return freshSession()
}

function loadTheme(): Theme {
  try { return localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light' }
  catch { return 'light' }
}

function formatTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  const remainder = seconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')
}

function processColor(id: string): string {
  const index = Number(id.slice(1)) - 1
  return colors[index % colors.length]
}

function FormulaHelp({ name }: { name: MetricName }) {
  const [open, setOpen] = useState(false)
  return <span className="formula-help">
    <button type="button" className="formula-trigger" aria-label={`Show ${metricLabels[name].toLowerCase()} formula`} aria-expanded={open} onClick={() => setOpen(!open)} onBlur={() => setOpen(false)}><HelpCircle size={14} /></button>
    <span className={`formula-popover ${open ? 'open' : ''}`} role="tooltip">{FORMULAS[name]}</span>
  </span>
}

function attemptErrors(attempt: Attempt, solution: ReturnType<typeof solve>) {
  const cells = attempt.cells.map((cell, index) => index < attempt.finish ? cell === null ? 'missing' : cell === solution.cells[index] ? '' : 'wrong' : '')
  const answers: Record<string, 'missing' | 'wrong' | ''> = {}
  for (const [id, values] of Object.entries(solution.metrics)) {
    for (const name of metricNames) {
      const key = `${id}.${name}`
      const raw = attempt.answers[key]?.trim() ?? ''
      answers[key] = raw === '' ? 'missing' : /^\d+$/.test(raw) && Number(raw) === values[name] ? '' : 'wrong'
    }
  }
  for (const name of averageNames) {
    const key = `average.${name}`
    const raw = attempt.answers[key]?.trim() ?? ''
    const numeric = parseAverage(raw)
    answers[key] = raw === '' ? 'missing' : numeric !== null && Math.abs(numeric - solution.averages[name]) <= 0.0100001 ? '' : 'wrong'
  }
  return { cells, answers, finish: attempt.finish === solution.cells.length ? '' : attempt.finish < solution.cells.length ? 'short' : 'long' }
}

function reasonFor(algorithm: Algorithm, expected: string, time: number, problem: Problem): string {
  if (expected === 'Idle') return `At time ${time}, no process has arrived and remained ready, so the CPU is idle.`
  const process = problem.processes.find((item) => item.id === expected)
  const detail = algorithm === 'fcfs' ? 'it is next by the selected arrival and priority rule'
    : algorithm === 'sjf' ? 'it wins the ready-process choice under the selected shortest-job and priority rule'
      : algorithm === 'srtf' ? 'it wins the remaining-time and priority comparison'
        : algorithm === 'rr' ? 'it is next in the round-robin ready queue'
          : 'it has the highest applicable priority among ready processes'
  return `At time ${time}, ${process?.id ?? expected} should run because ${detail}.`
}

function App() {
  const [session, setSession] = useState<Session>(loadSession)
  const [theme, setTheme] = useState<Theme>(loadTheme)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [pendingReplacement, setPendingReplacement] = useState<PendingReplacement | null>(null)
  const [selected, setSelected] = useState<string | 'Idle' | 'Erase'>('P1')
  const [focusedCell, setFocusedCell] = useState(0)
  const [painting, setPainting] = useState(false)
  const [showSolution, setShowSolution] = useState(false)
  const [storageError, setStorageError] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const discardCancelRef = useRef<HTMLButtonElement>(null)
  const replacementTriggerRef = useRef<HTMLElement | null>(null)
  const key = attemptKey(session.algorithm, session.mode)
  const attempt = session.attempts[key] ?? freshAttempt()
  const solution = useMemo(() => solve(session.problem, session.algorithm, session.mode), [session.problem, session.algorithm, session.mode])
  const errors = useMemo(() => attemptErrors(attempt, solution), [attempt, solution])
  const priorityOn = session.problem.priorityEnabled
  const algorithms: Algorithm[] = priorityOn ? ['fcfs', 'sjf', 'srtf', 'rr', 'priority', 'priority-preemptive'] : ['fcfs', 'sjf', 'srtf', 'rr']

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(session)); setStorageError(false) }
    catch { setStorageError(true) }
  }, [session])

  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme
    try { localStorage.setItem(THEME_KEY, theme) } catch { /* The theme still applies for this visit. */ }
  }, [theme])

  useEffect(() => { if (pendingReplacement) discardCancelRef.current?.focus() }, [pendingReplacement])

  useEffect(() => {
    if (!attempt.started || attempt.complete) return
    const timer = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return
      setSession((previous) => {
        const activeKey = attemptKey(previous.algorithm, previous.mode)
        const active = previous.attempts[activeKey]
        if (!active?.started || active.complete) return previous
        return { ...previous, attempts: { ...previous.attempts, [activeKey]: { ...active, elapsedSeconds: active.elapsedSeconds + 1 } } }
      })
    }, 1000)
    return () => window.clearInterval(timer)
  }, [key, attempt.started, attempt.complete])

  useEffect(() => {
    const stop = () => setPainting(false)
    window.addEventListener('pointerup', stop)
    return () => window.removeEventListener('pointerup', stop)
  }, [])

  function updateAttempt(change: (current: Attempt) => Attempt) {
    setSession((previous) => {
      const activeKey = attemptKey(previous.algorithm, previous.mode)
      const current = previous.attempts[activeKey] ?? freshAttempt()
      const next = change(current)
      return { ...previous, attempts: { ...previous.attempts, [activeKey]: next } }
    })
  }

  function editAttempt(change: (current: Attempt) => Attempt) {
    updateAttempt((current) => ({ ...change(current), started: true, checked: false, complete: false }))
  }

  function paintCell(index: number, value: string | 'Idle' | 'Erase' = selected) {
    setFocusedCell(index)
    editAttempt((current) => {
      const cells = [...current.cells]
      cells[index] = value === 'Erase' ? null : value
      return { ...current, cells, finish: value === 'Erase' ? current.finish : Math.max(current.finish, index + 1) }
    })
  }

  function moveFinish(amount: number) {
    editAttempt((current) => ({ ...current, finish: Math.max(0, Math.min(current.cells.length, current.finish + amount)) }))
  }

  function changeAlgorithm(algorithm: Algorithm) {
    setShowSolution(false)
    setSession((previous) => {
      const activeKey = attemptKey(algorithm, previous.mode)
      return { ...previous, algorithm, attempts: previous.attempts[activeKey] ? previous.attempts : { ...previous.attempts, [activeKey]: freshAttempt() } }
    })
  }

  function changeMode(mode: PriorityMode) {
    setShowSolution(false)
    setSession((previous) => {
      const activeKey = attemptKey(previous.algorithm, mode)
      return { ...previous, mode, attempts: previous.attempts[activeKey] ? previous.attempts : { ...previous.attempts, [activeKey]: freshAttempt() } }
    })
  }

  function replaceProcessSet(difficulty: Difficulty, enabled: boolean, keepSettingsOpen: boolean) {
    const algorithm = enabled ? session.algorithm : session.algorithm.startsWith('priority') ? 'fcfs' : session.algorithm
    const mode = enabled ? session.mode === 'off' ? 'tie' : session.mode : 'off'
    const problem = generateProblem(difficulty, enabled, algorithm, mode)
    setSession({ problem, algorithm, mode, attempts: { [attemptKey(algorithm, mode)]: freshAttempt() } })
    setSelected('P1')
    setFocusedCell(0)
    setShowSolution(false)
    setSettingsOpen(keepSettingsOpen)
  }

  function generate(difficulty = session.problem.difficulty, enabled = priorityOn, keepSettingsOpen = false, reason: ReplacementReason = 'new') {
    if (Object.values(session.attempts).some((item) => item.started && !item.complete)) {
      replacementTriggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
      setPendingReplacement({ difficulty, enabled, keepSettingsOpen, reason })
      return
    }
    replaceProcessSet(difficulty, enabled, keepSettingsOpen)
  }

  function dismissReplacement() {
    setPendingReplacement(null)
    window.requestAnimationFrame(() => replacementTriggerRef.current?.focus())
  }

  function confirmReplacement() {
    if (!pendingReplacement) return
    replaceProcessSet(pendingReplacement.difficulty, pendingReplacement.enabled, pendingReplacement.keepSettingsOpen)
    setPendingReplacement(null)
    window.requestAnimationFrame(() => replacementTriggerRef.current?.focus())
  }

  function handleDiscardKey(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') { event.preventDefault(); dismissReplacement() }
    if (event.key !== 'Tab') return
    const buttons = event.currentTarget.querySelectorAll<HTMLButtonElement>('button')
    const first = buttons[0]
    const last = buttons[buttons.length - 1]
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
    if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
  }

  function checkAnswers() {
    const valid = errors.finish === '' && attempt.cells.slice(0, attempt.finish).every((cell, index) => cell === solution.cells[index])
      && Object.values(errors.answers).every((error) => error === '')
    updateAttempt((current) => ({ ...current, hasChecked: true, checked: true, complete: valid }))
  }

  function extendRun() {
    const value = attempt.cells[focusedCell]
    if (!value) return
    let end = focusedCell
    while (end + 1 < attempt.cells.length && attempt.cells[end + 1] === value) end += 1
    if (end + 1 >= attempt.cells.length) {
      editAttempt((current) => ({ ...current, cells: [...current.cells, value, ...Array(5).fill(null)], finish: Math.max(current.finish, end + 2) }))
      setFocusedCell(end + 1)
      return
    }
    paintCell(end + 1, value)
    setFocusedCell(end + 1)
  }

  function trimRun() {
    const value = attempt.cells[focusedCell]
    if (!value) return
    let end = focusedCell
    while (end + 1 < attempt.cells.length && attempt.cells[end + 1] === value) end += 1
    paintCell(end, 'Erase')
  }

  function handleCellKey(event: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      event.preventDefault()
      const next = Math.max(0, Math.min(attempt.cells.length - 1, index + (event.key === 'ArrowRight' ? 1 : -1)))
      scrollRef.current?.querySelector<HTMLButtonElement>(`[data-cell="${next}"]`)?.focus()
      setFocusedCell(next)
    } else if (event.key === 'Backspace' || event.key === 'Delete') {
      event.preventDefault(); paintCell(index, 'Erase')
    } else if (/^[1-7]$/.test(event.key)) {
      const process = session.problem.processes[Number(event.key) - 1]
      if (process) { event.preventDefault(); paintCell(index, process.id) }
    } else if (event.key.toLowerCase() === 'i') {
      event.preventDefault(); paintCell(index, 'Idle')
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault(); paintCell(index)
    }
  }

  const incorrectCells = attempt.checked ? errors.cells.filter(Boolean).length : 0
  const incorrectFields = attempt.checked ? Object.values(errors.answers).filter(Boolean).length : 0
  const firstCellError = attempt.checked ? errors.cells.findIndex(Boolean) : -1
  const firstMessage = firstCellError >= solution.cells.length && firstCellError >= 0 ? 'Your Finish marker extends past the last completed process.'
    : firstCellError >= 0 ? reasonFor(session.algorithm, solution.cells[firstCellError], firstCellError, session.problem)
    : errors.finish === 'short' ? 'Your Finish marker is too early; some CPU work is still missing.'
      : errors.finish === 'long' ? 'Your Finish marker extends past the last completed process.'
        : incorrectFields > 0 ? 'The timeline is correct. Recheck the highlighted calculations.' : ''

  return <div className="app-shell">
    <header className="topbar">
      <div className="brand"><div className="brand-mark"><span className="brand-bars"><i/><i/><i/></span></div><div><strong>CPU Scheduling Lab</strong><span>OS exam practice</span></div></div>
      <div className="top-actions"><div className="timer" aria-label={`Elapsed time ${formatTime(attempt.elapsedSeconds)}`}><Clock3 size={16} /><span>{formatTime(attempt.elapsedSeconds)}</span></div><button className="icon-button settings-button" type="button" aria-label="Open settings" onClick={() => setSettingsOpen(true)}><Settings2 size={19}/></button></div>
    </header>

    <main className="main-content">
      <section className="intro"><div><div className="eyebrow"><span className="eyebrow-dot"/> INTERACTIVE WORKSHEET <span className="eyebrow-line"/> {session.problem.difficulty.toUpperCase()} MODE</div><h1>Think like the scheduler.</h1><p>Build the Gantt chart. Work out the times. Check your reasoning when you're ready.</p></div><div className="problem-number">PROBLEM <strong>#{session.problem.id.slice(-4).toUpperCase()}</strong></div></section>

      <section className="workspace-grid">
        <div className="left-column">
          <div className="panel process-panel"><div className="panel-heading"><div><span className="step-number">01</span><h2>Process set</h2></div><span className="panel-caption">Given data</span></div><div className="table-scroll"><table className="process-table"><thead><tr><th>Process</th><th>Arrival</th><th>CPU burst</th>{priorityOn && <th>Priority</th>}</tr></thead><tbody>{session.problem.processes.map((process) => <tr key={process.id}><td><span className="process-dot" style={{ background: processColor(process.id) }}/><strong>{process.id}</strong></td><td>{process.arrival}</td><td>{process.burst}</td>{priorityOn && <td><span className="priority-chip">{process.priority}</span></td>}</tr>)}</tbody></table></div><div className="table-note"><span><Sparkles size={14}/> {session.problem.processes.length} processes</span><span>{session.algorithm === 'rr' ? `Quantum: ${session.problem.quantum}` : `RR quantum: ${session.problem.quantum}`}</span></div></div>

          <div className="panel algorithm-panel"><div className="panel-heading"><div><span className="step-number">02</span><h2>Choose an algorithm</h2></div></div><div className="algorithm-list">{algorithms.map((algorithm) => <button type="button" key={algorithm} className={`algorithm-option ${session.algorithm === algorithm ? 'active' : ''}`} onClick={() => changeAlgorithm(algorithm)}><span className="algorithm-radio"/><span>{ALGORITHM_LABELS[algorithm]}</span>{session.algorithm === algorithm && <Check size={16}/>}</button>)}</div>{session.algorithm === 'rr' && <div className="quantum-note">Time quantum <strong>{session.problem.quantum} units</strong></div>}{priorityOn && !session.algorithm.startsWith('priority') && <div className="mode-note">Priority rule: <strong>{session.mode === 'first' ? 'Priority first' : 'Tie-breaker'}</strong></div>}</div>

          <div className="rules-card"><span className="rules-icon">i</span><div><strong>Rules for this exercise</strong><p>One CPU burst per process. No I/O or context-switch time. {priorityOn ? session.algorithm.startsWith('priority') ? 'Higher priority numbers run first; equal priority uses arrival order.' : session.mode === 'tie' ? 'Priority breaks only equal choices under this algorithm.' : 'Highest priority runs first; this algorithm breaks equal-priority choices.' : 'Equal choices use earlier arrival, then lower process number.'} At an RR boundary, new arrivals enter before the unfinished process returns to the queue.</p></div></div>
        </div>

        <div className="right-column"><div className="panel timeline-panel"><div className="panel-heading"><div><span className="step-number">03</span><h2>Build the timeline</h2></div><span className="panel-caption">Gantt chart</span></div><p className="panel-description">Select a process, then tap or drag across time cells. You can also drag a process label onto a cell.</p>
          <div className="palette" aria-label="Process labels">{session.problem.processes.map((process) => <button draggable onDragStart={(event) => event.dataTransfer.setData('text/plain', process.id)} type="button" key={process.id} className={`palette-item ${selected === process.id ? 'selected' : ''}`} style={{ '--process-color': processColor(process.id) } as React.CSSProperties} onClick={() => setSelected(process.id)}><Grip size={13}/>{process.id}</button>)}<button type="button" draggable onDragStart={(event) => event.dataTransfer.setData('text/plain', 'Idle')} className={`palette-item idle-item ${selected === 'Idle' ? 'selected' : ''}`} onClick={() => setSelected('Idle')}>Idle</button><button type="button" className={`palette-item erase-item ${selected === 'Erase' ? 'selected' : ''}`} onClick={() => setSelected('Erase')}>Erase</button></div>
          <div className="timeline-scroll" ref={scrollRef}><div className="timeline-inner"><div className="time-labels">{attempt.cells.map((_, index) => <span key={index}>{index}</span>)}<span>{attempt.cells.length}</span></div><div className="time-cells">{attempt.cells.map((value, index) => <button type="button" key={index} data-cell={index} aria-label={`Time ${index} to ${index + 1}: ${value ?? 'empty'}`} className={`time-cell ${value ? 'filled' : ''} ${value === 'Idle' ? 'idle' : ''} ${focusedCell === index ? 'focused' : ''} ${attempt.checked ? errors.cells[index] : ''}`} style={value && value !== 'Idle' ? { '--process-color': processColor(value) } as React.CSSProperties : undefined} onClick={() => paintCell(index)} onPointerDown={(event) => { if (event.button === 0) { setPainting(true); paintCell(index) } }} onPointerEnter={() => { if (painting) paintCell(index) }} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); const item = event.dataTransfer.getData('text/plain'); if (item === 'Idle' || session.problem.processes.some((process) => process.id === item)) paintCell(index, item) }} onFocus={() => setFocusedCell(index)} onKeyDown={(event) => handleCellKey(event, index)}>{value ?? <Plus size={13}/>}</button>)}</div><div className="finish-row"><div className="finish-line" style={{ width: `calc(var(--cell-width) * ${attempt.finish})` }}/><div className={`finish-marker ${attempt.checked && errors.finish ? 'invalid' : ''}`} style={{ left: `calc(var(--cell-width) * ${attempt.finish})` }}><span>FINISH</span><span className="finish-time">t={attempt.finish}</span></div></div></div></div>
          <div className="timeline-tools"><div className="tool-group"><button type="button" onClick={() => moveFinish(-1)} aria-label="Move finish left"><ChevronLeft size={16}/></button><span>Move finish</span><button type="button" onClick={() => moveFinish(1)} aria-label="Move finish right"><ChevronRight size={16}/></button></div><div className="tool-group"><button type="button" onClick={trimRun} aria-label="Trim selected run"><Minus size={16}/></button><span>Resize run</span><button type="button" onClick={extendRun} aria-label="Extend selected run"><Plus size={16}/></button></div><button className="add-time" type="button" onClick={() => updateAttempt((current) => ({ ...current, cells: [...current.cells, ...Array(6).fill(null)] }))}><Plus size={15}/> Add 6 cells</button></div><p className="keyboard-tip">Keyboard: arrows move · Enter paints · 1–7 picks a process · I places Idle · Delete erases</p>
        </div>

        <div className="panel metrics-panel"><div className="panel-heading"><div><span className="step-number">04</span><h2>Calculate the times</h2></div><span className="panel-caption">Your answers</span></div><p className="panel-description">Read completion times from your chart, then calculate the remaining values. Hover or tap a <HelpCircle size={13} className="inline-icon"/> if you need a formula.</p><div className="table-scroll"><table className="metrics-table"><thead><tr><th>Process</th>{metricNames.map((name) => <th key={name}>{metricLabels[name]} <FormulaHelp name={name}/></th>)}</tr></thead><tbody>{session.problem.processes.map((process) => <tr key={process.id}><td><span className="process-dot" style={{ background: processColor(process.id) }}/><strong>{process.id}</strong></td>{metricNames.map((name) => { const field = `${process.id}.${name}`; return <td key={field}><span className="mobile-metric-label">{metricLabels[name]} <FormulaHelp name={name}/></span><input inputMode="numeric" aria-label={`${process.id} ${metricLabels[name]} time`} className={attempt.checked ? errors.answers[field] : ''} value={attempt.answers[field] ?? ''} onChange={(event) => { const value = event.target.value; editAttempt((current) => ({ ...current, answers: { ...current.answers, [field]: value } })) }} placeholder="—"/></td> })}</tr>)}</tbody></table></div><div className="averages"><span className="averages-label">AVERAGES <small>fractions or decimals within 0.01</small></span><div className="average-fields">{averageNames.map((name) => { const field = `average.${name}`; return <label key={name}>{metricLabels[name]} <FormulaHelp name={name}/><input aria-label={`Average ${name} time`} inputMode="decimal" className={attempt.checked ? errors.answers[field] : ''} value={attempt.answers[field] ?? ''} onChange={(event) => { const value = event.target.value; editAttempt((current) => ({ ...current, answers: { ...current.answers, [field]: value } })) }} placeholder="e.g. 4.5 or 9/2"/></label> })}</div></div></div>

        <div className="check-area"><button className="check-button" type="button" onClick={checkAnswers}><Check size={18}/> Check my work <ArrowRight size={18}/></button><button className="new-button" type="button" onClick={() => generate()}><RotateCcw size={16}/> New problem</button>{storageError && <span className="storage-warning">This browser is not saving your work.</span>}</div>
        {attempt.checked && <div className={`feedback ${attempt.complete ? 'success' : 'needs-work'}`} role="status"><strong>{attempt.complete ? 'You solved it.' : `${incorrectCells + incorrectFields + (errors.finish ? 1 : 0)} things to revisit`}</strong><p>{attempt.complete ? `Your timeline and every calculation are correct. Time: ${formatTime(attempt.elapsedSeconds)}${attempt.solutionViewed ? ' · solution viewed' : ''}.` : firstMessage}</p>{!attempt.complete && <small>Missing entries are shown in amber; wrong answers are shown in red. Edit anything and check again.</small>}{attempt.hasChecked && <button type="button" onClick={() => { setShowSolution(!showSolution); if (!showSolution) updateAttempt((current) => ({ ...current, solutionViewed: true })) }}>{showSolution ? 'Hide worked solution' : 'View worked solution'} <ArrowRight size={15}/></button>}</div>}
        {!attempt.checked && attempt.hasChecked && <button className="solution-link" type="button" onClick={() => { setShowSolution(!showSolution); if (!showSolution) updateAttempt((current) => ({ ...current, solutionViewed: true })) }}>{showSolution ? 'Hide worked solution' : 'View worked solution'} <ArrowRight size={15}/></button>}
        {showSolution && attempt.hasChecked && <div className="panel solution-panel"><div className="panel-heading"><div><span className="step-number solved">✓</span><h2>Worked solution</h2></div><span className="panel-caption">Study after checking</span></div><div className="solution-chart">{groupCells(solution.cells).map((group) => <div key={`${group.start}-${group.id}`} className={`solution-block ${group.id === 'Idle' ? 'idle' : ''}`} style={{ flexGrow: group.end - group.start, background: group.id === 'Idle' ? undefined : processColor(group.id) }}><strong>{group.id}</strong><span>{group.start}–{group.end}</span></div>)}</div><div className="table-scroll"><table className="solution-table"><thead><tr><th>Process</th><th>Arrival</th><th>Burst</th><th>Completion</th><th>Turnaround</th><th>Waiting</th><th>Response</th></tr></thead><tbody>{session.problem.processes.map((process) => { const result = solution.metrics[process.id]; return <tr key={process.id}><td><strong>{process.id}</strong></td><td>{process.arrival}</td><td>{process.burst}</td><td>{result.completion}</td><td>{result.turnaround}</td><td>{result.waiting}</td><td>{result.response}</td></tr> })}</tbody><tfoot><tr><th colSpan={4}>Average</th><td>{formatNumber(solution.averages.turnaround)}</td><td>{formatNumber(solution.averages.waiting)}</td><td>{formatNumber(solution.averages.response)}</td></tr></tfoot></table></div>{session.problem.processes[0] && (() => { const process = session.problem.processes[0]; const result = solution.metrics[process.id]; return <div className="sample-calculations"><strong>Sample calculations for {process.id}</strong><span>Completion = right edge of its last block = {result.completion}</span><span>Turnaround = {result.completion} − {process.arrival} = {result.turnaround}</span><span>Waiting = {result.turnaround} − {process.burst} = {result.waiting}</span><span>Response = {process.arrival + result.response} − {process.arrival} = {result.response}</span></div> })()}</div>}
      </div></section>
    </main>

    {settingsOpen && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setSettingsOpen(false) }}><div className="settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title"><div className="modal-heading"><div><span className="eyebrow">EXERCISE OPTIONS</span><h2 id="settings-title">Settings</h2></div><button type="button" aria-label="Close settings" className="icon-button" onClick={() => setSettingsOpen(false)}><X size={20}/></button></div><div className="setting-section"><label>Appearance</label><div className="segmented theme-options" role="radiogroup" aria-label="Appearance"><button type="button" role="radio" aria-checked={theme === 'light'} className={theme === 'light' ? 'active' : ''} onClick={() => setTheme('light')}><Sun size={16}/> Light</button><button type="button" role="radio" aria-checked={theme === 'dark'} className={theme === 'dark' ? 'active' : ''} onClick={() => setTheme('dark')}><Moon size={16}/> Dark</button></div><p>Your choice is saved on this device.</p></div><div className="setting-section"><label>Difficulty</label><div className="segmented">{(['easy', 'medium', 'hard'] as Difficulty[]).map((difficulty) => <button type="button" key={difficulty} className={session.problem.difficulty === difficulty ? 'active' : ''} onClick={() => generate(difficulty, priorityOn, true, 'difficulty')}>{difficulty}</button>)}</div><p>Changes create a new process set.</p></div><div className="setting-section priority-setting"><div><label htmlFor="priority-toggle">Add process priorities</label><p>Generate priorities from 1 to 10. Higher numbers run first.</p></div><button id="priority-toggle" type="button" role="switch" aria-checked={priorityOn} className={`switch ${priorityOn ? 'on' : ''}`} onClick={() => generate(session.problem.difficulty, !priorityOn, true, 'priority')}><span/></button></div>{priorityOn && <div className="setting-section"><label>Priority in existing algorithms</label><div className="segmented priority-modes" role="radiogroup" aria-label="Priority effect">{([['tie', 'Tie-breaker'], ['first', 'Priority first']] as const).map(([mode, label]) => <button type="button" role="radio" aria-checked={session.mode === mode} key={mode} className={session.mode === mode ? 'active' : ''} onClick={() => changeMode(mode)}>{label}</button>)}</div><p>{session.mode === 'tie' ? 'Priority breaks equal choices. FCFS, SJF, and RR keep their usual ordering.' : 'Highest priority goes first. The chosen algorithm breaks ties within a priority level.'}</p></div>}<div className="settings-footer"><button type="button" onClick={() => setSettingsOpen(false)}>Done</button></div></div></div>}
    {pendingReplacement && <div className="discard-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) dismissReplacement() }}>
      <div className="discard-modal" role="alertdialog" aria-modal="true" aria-labelledby="discard-title" aria-describedby="discard-description" onKeyDown={handleDiscardKey}>
        <div className="discard-icon"><AlertTriangle size={22}/></div>
        <h2 id="discard-title">{replacementTitles[pendingReplacement.reason]}</h2>
        <p id="discard-description">This will replace the current process set and remove all saved attempts for it. Your current answers will be lost.</p>
        <div className="discard-actions">
          <button ref={discardCancelRef} type="button" className="discard-cancel" onClick={dismissReplacement}>Keep current set</button>
          <button type="button" className="discard-confirm" onClick={confirmReplacement}>Discard and continue</button>
        </div>
      </div>
    </div>}
  </div>
}

export default App
