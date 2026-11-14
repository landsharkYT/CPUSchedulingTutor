import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, ArrowRight, Check, ChevronLeft, ChevronRight, Clock3, Grip, HelpCircle, Minus, Moon, Plus, RotateCcw, Settings2, Sparkles, Sun, X } from 'lucide-react'
import { FORMULAS, parseAverage, type Difficulty } from './scheduler'
import { MLFQ_EVENT_LABELS, checkQueueRows, eventDescription, generateMlfqProblem, solveMlfq, type MlfqEventKind, type MlfqProblem, type QueueAnswerRow, type QueueLevel } from './mlfq'

type MetricName = 'completion' | 'turnaround' | 'waiting' | 'response'
type AverageName = 'turnaround' | 'waiting' | 'response'
type MlfqAttempt = {
  cells: (string | null)[]
  finish: number
  rows: QueueAnswerRow[]
  answers: Record<string, string>
  hasChecked: boolean
  checked: boolean
  solutionViewed: boolean
  elapsedSeconds: number
  started: boolean
  complete: boolean
}
type MlfqSession = { problem: MlfqProblem; attempt: MlfqAttempt }
type Theme = 'light' | 'dark'
type PendingReplacement = { difficulty: Difficulty; settingsOpen: boolean; reason: 'new' | 'difficulty' }

const STORAGE_KEY = 'cpu-scheduling-lab-mlfq-v1'
const GUIDE_KEY = 'cpu-scheduling-lab-mlfq-guide-seen'
const THEME_KEY = 'cpu-scheduling-lab-theme'
const colors = ['#4f86f7', '#9c75ed', '#36bcb0', '#ef9c54', '#e76f8a', '#86a75d', '#d3ae4a']
const metricNames: MetricName[] = ['completion', 'turnaround', 'waiting', 'response']
const averageNames: AverageName[] = ['turnaround', 'waiting', 'response']
const metricLabels: Record<MetricName, string> = { completion: 'Completion', turnaround: 'Turnaround', waiting: 'Waiting', response: 'Response' }
const eventKinds: MlfqEventKind[] = ['arrival', 'dispatch', 'interrupt', 'demote', 'complete', 'idle']
const guideProblem: MlfqProblem = {
  id: 'guide', difficulty: 'hard', quantums: [8, 16], processes: [
    { id: 'P1', arrival: 0, burst: 27, priority: 0 },
    { id: 'P2', arrival: 0, burst: 1, priority: 0 },
    { id: 'P3', arrival: 27, burst: 1, priority: 0 },
  ],
}

function processColor(id: string): string { return colors[(Number(id.slice(1)) - 1) % colors.length] }
function formatTime(seconds: number): string { return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}` }
function formatNumber(value: number): string { return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, '').replace(/\.$/, '') }

function freshAttempt(): MlfqAttempt {
  return { cells: Array(12).fill(null), finish: 0, rows: [], answers: {}, hasChecked: false, checked: false, solutionViewed: false, elapsedSeconds: 0, started: false, complete: false }
}

function freshSession(): MlfqSession { return { problem: generateMlfqProblem('easy'), attempt: freshAttempt() } }

function loadSession(): MlfqSession {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed: unknown = JSON.parse(raw)
      if (typeof parsed === 'object' && parsed !== null && 'problem' in parsed && 'attempt' in parsed) {
        const problem = parsed.problem
        const attempt = parsed.attempt
        if (typeof problem === 'object' && problem !== null && 'processes' in problem && Array.isArray(problem.processes)
          && typeof attempt === 'object' && attempt !== null && 'cells' in attempt && Array.isArray(attempt.cells)
          && 'rows' in attempt && Array.isArray(attempt.rows)) return parsed as MlfqSession
      }
    }
  } catch { /* Browser storage may be unavailable. */ }
  return freshSession()
}

function loadTheme(): Theme {
  try { return localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light' }
  catch { return 'light' }
}

function loadGuide(): boolean {
  try { return localStorage.getItem(GUIDE_KEY) !== 'yes' }
  catch { return true }
}

function FormulaHelp({ name }: { name: MetricName }) {
  const [open, setOpen] = useState(false)
  return <span className="formula-help">
    <button type="button" className="formula-trigger" aria-label={`Show ${metricLabels[name].toLowerCase()} formula`} aria-expanded={open} onClick={() => setOpen(!open)} onBlur={() => setOpen(false)}><HelpCircle size={14}/></button>
    <span className={`formula-popover ${open ? 'open' : ''}`} role="tooltip">{FORMULAS[name]}</span>
  </span>
}

function metricErrors(attempt: MlfqAttempt, solution: ReturnType<typeof solveMlfq>) {
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
  return answers
}

function solutionBlocks(solution: ReturnType<typeof solveMlfq>) {
  const blocks: { id: string; level: QueueLevel | null; start: number; end: number }[] = []
  solution.cells.forEach((id, index) => {
    const level = solution.levels[index]
    const last = blocks[blocks.length - 1]
    if (last && last.id === id && last.level === level) last.end = index + 1
    else blocks.push({ id, level, start: index, end: index + 1 })
  })
  return blocks
}

export default function MlfqExercise({ onOpenStandard }: { onOpenStandard: () => void }) {
  const [session, setSession] = useState<MlfqSession>(loadSession)
  const [theme, setTheme] = useState<Theme>(loadTheme)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [pending, setPending] = useState<PendingReplacement | null>(null)
  const [guideOpen, setGuideOpen] = useState(loadGuide)
  const [guideStep, setGuideStep] = useState(0)
  const [guideChoice, setGuideChoice] = useState<string | null>(null)
  const [selected, setSelected] = useState('P1')
  const [focusedCell, setFocusedCell] = useState(0)
  const [painting, setPainting] = useState(false)
  const [runLength, setRunLength] = useState('4')
  const [showSolution, setShowSolution] = useState(false)
  const [storageError, setStorageError] = useState(false)
  const rowCounter = useRef(0)
  const scrollRef = useRef<HTMLDivElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const replacementTrigger = useRef<HTMLElement | null>(null)
  const { problem, attempt } = session
  const solution = useMemo(() => solveMlfq(problem), [problem])
  const guide = useMemo(() => solveMlfq(guideProblem).rows.filter((row) => row.events.some((event) => event.kind === 'dispatch')), [])
  const queueErrors = useMemo(() => checkQueueRows(attempt.rows, solution), [attempt.rows, solution])
  const rowErrorById = new Map(queueErrors.map((error) => [error.rowId, error]))
  const answersErrors = useMemo(() => metricErrors(attempt, solution), [attempt, solution])
  const cellErrors = attempt.cells.map((cell, index) => index < attempt.finish ? cell === null ? 'missing' : cell === solution.cells[index] ? '' : 'wrong' : '')
  const finishError = attempt.finish === solution.cells.length ? '' : attempt.finish < solution.cells.length ? 'short' : 'long'
  const firstWrongCell = cellErrors.findIndex((error) => error !== '')
  const firstQueueError = queueErrors[0]
  const metricErrorCount = Object.values(answersErrors).filter(Boolean).length
  const firstCellTime = firstWrongCell < 0 ? Infinity : firstWrongCell
  const firstQueueTime = firstQueueError?.time ?? Infinity
  const firstErrorMessage = firstQueueTime <= firstCellTime && firstQueueError ? firstQueueError.message
    : firstWrongCell >= solution.cells.length && firstWrongCell >= 0 ? 'Your Finish marker extends past the last completed process.'
      : firstWrongCell >= 0 ? `At time ${firstWrongCell}, ${solution.cells[firstWrongCell]} should run${solution.levels[firstWrongCell] === null ? '' : ` from Q${solution.levels[firstWrongCell]}`}. Check the queue state at this boundary.`
      : finishError ? `Move Finish to the end of the schedule, after time ${solution.cells.length}.`
        : metricErrorCount ? 'The schedule is correct. Recheck the highlighted calculations.' : ''

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(session)); setStorageError(false) }
    catch { setStorageError(true) }
  }, [session])
  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme
    try { localStorage.setItem(THEME_KEY, theme) } catch { /* Theme still works for this visit. */ }
  }, [theme])
  useEffect(() => { if (pending) cancelRef.current?.focus() }, [pending])
  useEffect(() => {
    if (!attempt.started || attempt.complete || guideOpen) return
    const timer = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return
      setSession((previous) => previous.attempt.started && !previous.attempt.complete
        ? { ...previous, attempt: { ...previous.attempt, elapsedSeconds: previous.attempt.elapsedSeconds + 1 } } : previous)
    }, 1000)
    return () => window.clearInterval(timer)
  }, [attempt.started, attempt.complete, guideOpen])
  useEffect(() => {
    const stop = () => setPainting(false)
    window.addEventListener('pointerup', stop)
    return () => window.removeEventListener('pointerup', stop)
  }, [])

  function updateAttempt(change: (current: MlfqAttempt) => MlfqAttempt) {
    setSession((previous) => ({ ...previous, attempt: change(previous.attempt) }))
  }
  function editAttempt(change: (current: MlfqAttempt) => MlfqAttempt) {
    updateAttempt((current) => ({ ...change(current), started: true, checked: false, complete: false }))
  }
  function paintCell(index: number, value = selected) {
    if (value !== 'Idle' && value !== 'Erase' && !problem.processes.some((process) => process.id === value)) return
    setFocusedCell(index)
    editAttempt((current) => {
      const cells = [...current.cells]
      cells[index] = value === 'Erase' ? null : value
      return { ...current, cells, finish: value === 'Erase' ? current.finish : Math.max(current.finish, index + 1) }
    })
  }
  function fillRun() {
    const length = Number(runLength)
    if (!Number.isInteger(length) || length < 1 || length > 60 || selected === 'Erase') return
    const end = focusedCell + length
    editAttempt((current) => {
      const cells = [...current.cells, ...Array(Math.max(0, end - current.cells.length + 6)).fill(null)]
      for (let index = focusedCell; index < end; index += 1) cells[index] = selected
      return { ...current, cells, finish: Math.max(current.finish, end) }
    })
    setFocusedCell(end - 1)
  }
  function trimRun() {
    const value = attempt.cells[focusedCell]
    if (!value) return
    let end = focusedCell
    while (end + 1 < attempt.cells.length && attempt.cells[end + 1] === value) end += 1
    paintCell(end, 'Erase')
  }
  function extendRun() {
    const value = attempt.cells[focusedCell]
    if (!value) return
    let end = focusedCell
    while (end + 1 < attempt.cells.length && attempt.cells[end + 1] === value) end += 1
    if (end + 1 >= attempt.cells.length) editAttempt((current) => ({ ...current, cells: [...current.cells, ...Array(6).fill(null)] }))
    paintCell(end + 1, value)
  }
  function handleCellKey(event: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      event.preventDefault()
      const next = Math.max(0, Math.min(attempt.cells.length - 1, index + (event.key === 'ArrowRight' ? 1 : -1)))
      scrollRef.current?.querySelector<HTMLButtonElement>(`[data-cell="${next}"]`)?.focus()
      setFocusedCell(next)
    } else if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); paintCell(index, 'Erase') }
    else if (/^[1-7]$/.test(event.key)) {
      const process = problem.processes[Number(event.key) - 1]
      if (process) { event.preventDefault(); paintCell(index, process.id) }
    } else if (event.key.toLowerCase() === 'i') { event.preventDefault(); paintCell(index, 'Idle') }
    else if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); paintCell(index) }
  }
  function addRow() {
    rowCounter.current += 1
    const id = `row-${Date.now()}-${rowCounter.current}`
    editAttempt((current) => ({ ...current, rows: [...current.rows, { id, time: '', kinds: [], cpu: null, queues: [[], [], []] }] }))
  }
  function editRow(rowId: string, change: (row: QueueAnswerRow) => QueueAnswerRow) {
    editAttempt((current) => ({ ...current, rows: current.rows.map((row) => row.id === rowId ? change(row) : row) }))
  }
  function toggleKind(rowId: string, kind: MlfqEventKind | 'snapshot') {
    editRow(rowId, (row) => ({ ...row, kinds: kind === 'snapshot' ? ['snapshot']
      : row.kinds.includes(kind) ? row.kinds.filter((item) => item !== kind) : [...row.kinds.filter((item) => item !== 'snapshot'), kind] }))
  }
  function placeInRow(rowId: string, target: QueueLevel | 'cpu', processId: string) {
    if (processId !== 'Idle' && !problem.processes.some((process) => process.id === processId)) return
    if (target !== 'cpu' && processId === 'Idle') return
    editRow(rowId, (row) => {
      const queues: QueueAnswerRow['queues'] = [row.queues[0].filter((id) => id !== processId), row.queues[1].filter((id) => id !== processId), row.queues[2].filter((id) => id !== processId)]
      const cpu = row.cpu === processId ? null : row.cpu
      if (target === 'cpu') return { ...row, cpu: processId, queues }
      queues[target].push(processId)
      return { ...row, cpu, queues }
    })
  }
  function removeFromRow(rowId: string, target: QueueLevel | 'cpu', processId?: string) {
    editRow(rowId, (row) => {
      if (target === 'cpu') return { ...row, cpu: null }
      const queues: QueueAnswerRow['queues'] = [[...row.queues[0]], [...row.queues[1]], [...row.queues[2]]]
      queues[target] = queues[target].filter((id) => id !== processId)
      return { ...row, queues }
    })
  }
  function moveWithin(rowId: string, level: QueueLevel, index: number, direction: -1 | 1) {
    editRow(rowId, (row) => {
      const queues: QueueAnswerRow['queues'] = [[...row.queues[0]], [...row.queues[1]], [...row.queues[2]]]
      const next = index + direction
      if (next < 0 || next >= queues[level].length) return row
      ;[queues[level][index], queues[level][next]] = [queues[level][next], queues[level][index]]
      return { ...row, queues }
    })
  }
  function checkAnswers() {
    const valid = queueErrors.length === 0 && finishError === ''
      && attempt.cells.slice(0, attempt.finish).every((cell, index) => cell === solution.cells[index])
      && Object.values(answersErrors).every((error) => error === '')
    updateAttempt((current) => ({ ...current, hasChecked: true, checked: true, complete: valid }))
  }
  function replaceProblem(difficulty: Difficulty, keepSettingsOpen: boolean) {
    setSession({ problem: generateMlfqProblem(difficulty), attempt: freshAttempt() })
    setSelected('P1'); setFocusedCell(0); setShowSolution(false); setSettingsOpen(keepSettingsOpen)
  }
  function requestReplacement(difficulty = problem.difficulty, settings = false, reason: PendingReplacement['reason'] = 'new') {
    if (attempt.started && !attempt.complete) {
      replacementTrigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
      setPending({ difficulty, settingsOpen: settings, reason })
    } else replaceProblem(difficulty, settings)
  }
  function closeReplacement() { setPending(null); window.requestAnimationFrame(() => replacementTrigger.current?.focus()) }
  function confirmReplacement() {
    if (!pending) return
    replaceProblem(pending.difficulty, pending.settingsOpen)
    setPending(null)
    window.requestAnimationFrame(() => replacementTrigger.current?.focus())
  }
  function closeGuide() {
    setGuideOpen(false)
    try { localStorage.setItem(GUIDE_KEY, 'yes') } catch { /* Guide may replay next visit. */ }
  }

  const guideRow = guide[guideStep]
  const guideCorrect = guideRow?.cpu
  return <div className="app-shell mlfq-shell">
    <header className="topbar">
      <div className="brand"><div className="brand-mark"><span className="brand-bars"><i/><i/><i/></span></div><div><strong>CPU Scheduling Lab</strong><span>OS exam practice</span></div></div>
      <div className="top-actions"><div className="timer" aria-label={`Elapsed time ${formatTime(attempt.elapsedSeconds)}`}><Clock3 size={16}/><span>{formatTime(attempt.elapsedSeconds)}</span></div><button className="icon-button settings-button" type="button" aria-label="Open settings" onClick={() => setSettingsOpen(true)}><Settings2 size={19}/></button></div>
    </header>
    <main className="main-content">
      <section className="intro"><div><div className="eyebrow"><span className="eyebrow-dot"/> QUEUE WORKSHEET <span className="eyebrow-line"/> {problem.difficulty.toUpperCase()} MODE</div><h1>Follow the feedback.</h1><p>Track each queue change, then draw the CPU timeline and calculate the times.</p></div><div className="problem-number">PROBLEM <strong>#{problem.id.slice(-4).toUpperCase()}</strong></div></section>
      <section className="workspace-grid">
        <div className="left-column">
          <div className="panel process-panel"><div className="panel-heading"><div><span className="step-number">01</span><h2>Process set</h2></div><span className="panel-caption">Given data</span></div><div className="table-scroll"><table className="process-table"><thead><tr><th>Process</th><th>Arrival</th><th>CPU burst</th></tr></thead><tbody>{problem.processes.map((process) => <tr key={process.id}><td><span className="process-dot" style={{ background: processColor(process.id) }}/><strong>{process.id}</strong></td><td>{process.arrival}</td><td>{process.burst}</td></tr>)}</tbody></table></div><div className="table-note"><span><Sparkles size={14}/> {problem.processes.length} processes</span><span>One CPU</span></div></div>
          <div className="panel algorithm-panel"><div className="panel-heading"><div><span className="step-number">02</span><h2>Scheduling policy</h2></div></div><div className="algorithm-list"><div className="algorithm-option active"><span className="algorithm-radio"/><span>Multilevel feedback queue</span><Check size={16}/></div><button type="button" className="algorithm-option" onClick={onOpenStandard}><span className="algorithm-radio"/><span>Standard algorithms</span><ArrowRight size={16}/></button></div><div className="mlfq-queue-key"><div><strong>Q0</strong><span>Round robin · {problem.quantums[0]} units</span></div><div><strong>Q1</strong><span>Round robin · {problem.quantums[1]} units</span></div><div><strong>Q2</strong><span>First come, first served</span></div></div></div>
          <div className="rules-card"><span className="rules-icon">i</span><div><strong>Rules for this exercise</strong><p>New jobs enter Q0. A process that uses its full quantum moves down. Higher queues interrupt lower queues; an interrupted process keeps its remaining quantum and queue place. Q2 runs FCFS. No I/O, boost, or context-switch time.</p></div></div>
          <button type="button" className="guide-replay" onClick={() => { setGuideStep(0); setGuideChoice(null); setGuideOpen(true) }}>Replay guided example</button>
        </div>
        <div className="right-column">
          <div className="panel timeline-panel"><div className="panel-heading"><div><span className="step-number">03</span><h2>Build the Gantt chart</h2></div><span className="panel-caption">CPU timeline</span></div><p className="panel-description">Select a process, then tap, drag, or fill a run. Track its queue separately in the event table below.</p>
            <div className="palette" aria-label="Process labels">{problem.processes.map((process) => <button type="button" draggable onDragStart={(event) => event.dataTransfer.setData('text/plain', process.id)} key={process.id} className={`palette-item ${selected === process.id ? 'selected' : ''}`} style={{ '--process-color': processColor(process.id) } as React.CSSProperties} onClick={() => setSelected(process.id)}><Grip size={13}/>{process.id}</button>)}<button type="button" className={`palette-item idle-item ${selected === 'Idle' ? 'selected' : ''}`} onClick={() => setSelected('Idle')}>Idle</button><button type="button" className={`palette-item erase-item ${selected === 'Erase' ? 'selected' : ''}`} onClick={() => setSelected('Erase')}>Erase</button></div>
            <div className="timeline-scroll" ref={scrollRef}><div className="timeline-inner"><div className="time-labels">{attempt.cells.map((_, index) => <span key={index}>{index}</span>)}<span>{attempt.cells.length}</span></div><div className="time-cells">{attempt.cells.map((value, index) => <button type="button" key={index} data-cell={index} aria-label={`Time ${index} to ${index + 1}: ${value ?? 'empty'}`} className={`time-cell ${value ? 'filled' : ''} ${value === 'Idle' ? 'idle' : ''} ${focusedCell === index ? 'focused' : ''} ${attempt.checked ? cellErrors[index] : ''}`} style={value && value !== 'Idle' ? { '--process-color': processColor(value) } as React.CSSProperties : undefined} onClick={() => paintCell(index)} onPointerDown={(event) => { if (event.button === 0) { setPainting(true); paintCell(index) } }} onPointerEnter={() => { if (painting) paintCell(index) }} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); paintCell(index, event.dataTransfer.getData('text/plain')) }} onFocus={() => setFocusedCell(index)} onKeyDown={(event) => handleCellKey(event, index)}>{value ?? <Plus size={13}/>}</button>)}</div><div className="finish-row"><div className="finish-line" style={{ width: `calc(var(--cell-width) * ${attempt.finish})` }}/><div className={`finish-marker ${attempt.checked && finishError ? 'invalid' : ''}`} style={{ left: `calc(var(--cell-width) * ${attempt.finish})` }}><span>FINISH</span><span className="finish-time">t={attempt.finish}</span></div></div></div></div>
            <div className="timeline-tools"><div className="tool-group"><button type="button" aria-label="Move finish left" onClick={() => editAttempt((current) => ({ ...current, finish: Math.max(0, current.finish - 1) }))}><ChevronLeft size={16}/></button><span>Move finish</span><button type="button" aria-label="Move finish right" onClick={() => editAttempt((current) => ({ ...current, finish: Math.min(current.cells.length, current.finish + 1) }))}><ChevronRight size={16}/></button></div><div className="tool-group"><button type="button" aria-label="Trim selected run" onClick={trimRun}><Minus size={16}/></button><span>Resize run</span><button type="button" aria-label="Extend selected run" onClick={extendRun}><Plus size={16}/></button></div><label className="fill-run-control">Run length <input type="number" min="1" max="60" inputMode="numeric" value={runLength} onChange={(event) => setRunLength(event.target.value)} aria-label="Run length"/></label><button type="button" className="add-time" onClick={fillRun}>Fill run</button><button type="button" className="add-time" onClick={() => editAttempt((current) => ({ ...current, cells: [...current.cells, ...Array(6).fill(null)] }))}><Plus size={15}/> Add 6 cells</button></div><p className="keyboard-tip">Keyboard: arrows move · Enter paints · 1–7 picks a process · I places Idle · Delete erases</p>
          </div>

          <div className="panel queue-panel"><div className="panel-heading"><div><span className="step-number">04</span><h2>Track the queues</h2></div><span className="panel-caption">Your event table</span></div><p className="panel-description">Add a row at each scheduling event. Record the CPU and waiting queues after the decision. Select a process above, then tap a slot or drag its label.</p><div className="queue-table-actions"><button type="button" className="add-time" onClick={addRow}><Plus size={15}/> Add event row</button><span>Rows are checked by time, so you can add them in any order.</span></div>
            <div className="queue-rows">{attempt.rows.length === 0 && <div className="queue-empty">Start with the arrivals and first dispatch at time 0.</div>}{attempt.rows.map((row, rowIndex) => {
              const error = attempt.checked ? rowErrorById.get(row.id) : undefined
              return <div className={`queue-answer-row ${error ? `queue-${error.status}` : ''}`} key={row.id}>
                <div className="queue-row-head"><strong>Event {rowIndex + 1}</strong><label>Time <input aria-label={`Event ${rowIndex + 1} time`} inputMode="numeric" value={row.time} onChange={(event) => editRow(row.id, (current) => ({ ...current, time: event.target.value }))} placeholder="t = ?"/></label><button type="button" aria-label={`Remove event ${rowIndex + 1}`} onClick={() => editAttempt((current) => ({ ...current, rows: current.rows.filter((item) => item.id !== row.id) }))}><X size={16}/></button></div>
                <div className="event-kinds" aria-label={`Event ${rowIndex + 1} types`}>{[...eventKinds, 'snapshot' as const].map((kind) => <button type="button" key={kind} aria-pressed={row.kinds.includes(kind)} className={row.kinds.includes(kind) ? 'active' : ''} onClick={() => toggleKind(row.id, kind)}>{MLFQ_EVENT_LABELS[kind]}</button>)}</div>
                <div className="queue-state-grid"><div className="queue-state-slot cpu-slot"><span>CPU after dispatch</span><button type="button" aria-label={`Event ${rowIndex + 1} CPU ${row.cpu ?? 'empty'}`} onClick={() => selected === 'Erase' ? removeFromRow(row.id, 'cpu') : placeInRow(row.id, 'cpu', selected)} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); placeInRow(row.id, 'cpu', event.dataTransfer.getData('text/plain')) }}>{row.cpu ?? '+ Select process or Idle'}</button></div>{([0, 1, 2] as QueueLevel[]).map((level) => <div className="queue-state-slot" key={level} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); placeInRow(row.id, level, event.dataTransfer.getData('text/plain')) }}><span>Q{level} waiting · front → back</span><div className="queue-pills">{row.queues[level].map((id, index) => <span className="queue-pill" key={id}><button type="button" draggable onDragStart={(event) => event.dataTransfer.setData('text/plain', id)} onClick={() => setSelected(id)} onKeyDown={(event) => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); moveWithin(row.id, level, index, event.key === 'ArrowLeft' ? -1 : 1) } }} aria-label={`Select ${id} in event ${rowIndex + 1} Q${level}; arrows reorder`}>{id}</button><button type="button" aria-label={`Remove ${id} from event ${rowIndex + 1} Q${level}`} onClick={() => removeFromRow(row.id, level, id)}><X size={12}/></button></span>)}</div><button type="button" className="queue-add" aria-label={`Add selected process to event ${rowIndex + 1} Q${level}`} onClick={() => placeInRow(row.id, level, selected)}>+ Add selected</button></div>)}</div>
                {error && <p className="queue-row-error">{error.message}</p>}
              </div>
            })}</div>{attempt.checked && queueErrors.filter((error) => error.status === 'missing' && error.rowId.startsWith('missing-')).length > 0 && <p className="queue-missing-note">Missing event times: {queueErrors.filter((error) => error.status === 'missing' && error.rowId.startsWith('missing-')).map((error) => error.time).join(', ')}</p>}
          </div>

          <div className="panel metrics-panel"><div className="panel-heading"><div><span className="step-number">05</span><h2>Calculate the times</h2></div><span className="panel-caption">Your answers</span></div><p className="panel-description">Read completion times from your chart. Hover or tap a <HelpCircle size={13} className="inline-icon"/> for a formula.</p><div className="table-scroll"><table className="metrics-table"><thead><tr><th>Process</th>{metricNames.map((name) => <th key={name}>{metricLabels[name]} <FormulaHelp name={name}/></th>)}</tr></thead><tbody>{problem.processes.map((process) => <tr key={process.id}><td><span className="process-dot" style={{ background: processColor(process.id) }}/><strong>{process.id}</strong></td>{metricNames.map((name) => { const field = `${process.id}.${name}`; return <td key={field}><span className="mobile-metric-label">{metricLabels[name]} <FormulaHelp name={name}/></span><input inputMode="numeric" aria-label={`${process.id} ${metricLabels[name]} time`} className={attempt.checked ? answersErrors[field] : ''} value={attempt.answers[field] ?? ''} onChange={(event) => { const value = event.target.value; editAttempt((current) => ({ ...current, answers: { ...current.answers, [field]: value } })) }} placeholder="—"/></td> })}</tr>)}</tbody></table></div><div className="averages"><span className="averages-label">AVERAGES <small>fractions or decimals within 0.01</small></span><div className="average-fields">{averageNames.map((name) => { const field = `average.${name}`; return <label key={name}>{metricLabels[name]} <FormulaHelp name={name}/><input aria-label={`Average ${name} time`} inputMode="decimal" className={attempt.checked ? answersErrors[field] : ''} value={attempt.answers[field] ?? ''} onChange={(event) => { const value = event.target.value; editAttempt((current) => ({ ...current, answers: { ...current.answers, [field]: value } })) }} placeholder="e.g. 4.5 or 9/2"/></label> })}</div></div></div>

          <div className="check-area"><button type="button" className="check-button" onClick={checkAnswers}><Check size={18}/> Check my work <ArrowRight size={18}/></button><button type="button" className="new-button" onClick={() => requestReplacement()}><RotateCcw size={16}/> New problem</button>{storageError && <span className="storage-warning">This browser is not saving your work.</span>}</div>
          {attempt.checked && <div className={`feedback ${attempt.complete ? 'success' : 'needs-work'}`} role="status"><strong>{attempt.complete ? 'You solved it.' : 'Keep working through the queue events'}</strong><p>{attempt.complete ? `Your event table, timeline, and calculations are correct. Time: ${formatTime(attempt.elapsedSeconds)}${attempt.solutionViewed ? ' · solution viewed' : ''}.` : firstErrorMessage}</p>{!attempt.complete && <small>Missing entries are amber; wrong answers are red. Edit anything and check again.</small>}{attempt.hasChecked && <button type="button" onClick={() => { setShowSolution(!showSolution); if (!showSolution) updateAttempt((current) => ({ ...current, solutionViewed: true })) }}>{showSolution ? 'Hide worked solution' : 'View worked solution'} <ArrowRight size={15}/></button>}</div>}
          {!attempt.checked && attempt.hasChecked && <button className="solution-link" type="button" onClick={() => { setShowSolution(!showSolution); if (!showSolution) updateAttempt((current) => ({ ...current, solutionViewed: true })) }}>{showSolution ? 'Hide worked solution' : 'View worked solution'} <ArrowRight size={15}/></button>}
          {showSolution && attempt.hasChecked && <div className="panel solution-panel mlfq-solution"><div className="panel-heading"><div><span className="step-number solved">✓</span><h2>Worked solution</h2></div><span className="panel-caption">After checking</span></div><div className="solution-chart">{solutionBlocks(solution).map((block) => <div className={`solution-block ${block.id === 'Idle' ? 'idle' : ''}`} key={`${block.start}-${block.id}`} style={{ flexGrow: block.end - block.start, background: block.id === 'Idle' ? undefined : processColor(block.id) }}><strong>{block.id}{block.level === null ? '' : ` · Q${block.level}`}</strong><span>{block.start}–{block.end}</span></div>)}</div><div className="worked-events"><h3>Queue decisions</h3>{solution.rows.map((row) => <div className="worked-event" key={row.time}><strong>t={row.time}</strong><p>{row.events.map(eventDescription).join(' · ')}</p><div><span>CPU: {row.cpu}</span><span>Q0: {row.queues[0].join(', ') || '—'}</span><span>Q1: {row.queues[1].join(', ') || '—'}</span><span>Q2: {row.queues[2].join(', ') || '—'}</span></div><small>{problem.processes.filter((process) => row.remainingBurst[process.id] > 0).map((process) => `${process.id}: ${row.remainingBurst[process.id]} burst left${row.remainingQuantum[process.id] === null ? '' : `, ${row.remainingQuantum[process.id]} quantum left`}`).join(' · ')}</small></div>)}</div><div className="table-scroll"><table className="solution-table"><thead><tr><th>Process</th><th>Arrival</th><th>Burst</th><th>Completion</th><th>Turnaround</th><th>Waiting</th><th>Response</th></tr></thead><tbody>{problem.processes.map((process) => { const result = solution.metrics[process.id]; return <tr key={process.id}><td><strong>{process.id}</strong></td><td>{process.arrival}</td><td>{process.burst}</td><td>{result.completion}</td><td>{result.turnaround}</td><td>{result.waiting}</td><td>{result.response}</td></tr> })}</tbody><tfoot><tr><th colSpan={4}>Average</th><td>{formatNumber(solution.averages.turnaround)}</td><td>{formatNumber(solution.averages.waiting)}</td><td>{formatNumber(solution.averages.response)}</td></tr></tfoot></table></div></div>}
        </div>
      </section>
    </main>

    {settingsOpen && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setSettingsOpen(false) }}><div className="settings-modal" role="dialog" aria-modal="true" aria-labelledby="mlfq-settings-title"><div className="modal-heading"><div><span className="eyebrow">EXERCISE OPTIONS</span><h2 id="mlfq-settings-title">Settings</h2></div><button type="button" aria-label="Close settings" className="icon-button" onClick={() => setSettingsOpen(false)}><X size={20}/></button></div><div className="setting-section"><label>Appearance</label><div className="segmented theme-options" role="radiogroup" aria-label="Appearance"><button type="button" role="radio" aria-checked={theme === 'light'} className={theme === 'light' ? 'active' : ''} onClick={() => setTheme('light')}><Sun size={16}/> Light</button><button type="button" role="radio" aria-checked={theme === 'dark'} className={theme === 'dark' ? 'active' : ''} onClick={() => setTheme('dark')}><Moon size={16}/> Dark</button></div></div><div className="setting-section"><label>Difficulty</label><div className="segmented">{(['easy', 'medium', 'hard'] as Difficulty[]).map((difficulty) => <button type="button" key={difficulty} className={problem.difficulty === difficulty ? 'active' : ''} onClick={() => requestReplacement(difficulty, true, 'difficulty')}>{difficulty}</button>)}</div><p>Changes create a new MLFQ process set. Your standard-algorithm work stays saved.</p></div><div className="setting-section"><label>Process priorities</label><p>Numeric process priorities are unavailable in MLFQ. Queue level determines priority here.</p></div><div className="settings-footer"><button type="button" onClick={() => setSettingsOpen(false)}>Done</button></div></div></div>}
    {pending && <div className="discard-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) closeReplacement() }}><div className="discard-modal" role="alertdialog" aria-modal="true" aria-labelledby="mlfq-discard-title" aria-describedby="mlfq-discard-description" onKeyDown={(event) => { if (event.key === 'Escape') { event.preventDefault(); closeReplacement() } }}><div className="discard-icon"><AlertTriangle size={22}/></div><h2 id="mlfq-discard-title">{pending.reason === 'difficulty' ? 'Change the difficulty?' : 'Start a new problem?'}</h2><p id="mlfq-discard-description">This will replace the current MLFQ process set and remove its saved attempt. Your standard-algorithm work will stay saved.</p><div className="discard-actions"><button ref={cancelRef} type="button" className="discard-cancel" onClick={closeReplacement}>Keep current set</button><button type="button" className="discard-confirm" onClick={confirmReplacement}>Discard and continue</button></div></div></div>}
    {guideOpen && guideRow && <div className="guide-backdrop"><div className="guide-modal" role="dialog" aria-modal="true" aria-labelledby="guide-title"><div className="guide-heading"><span className="eyebrow">GUIDED EXAMPLE · {guideStep + 1} OF {guide.length}</span><button type="button" onClick={closeGuide}>Skip</button></div><h2 id="guide-title">Who runs next at t={guideRow.time}?</h2><p>Q0 runs before Q1, and Q1 before Q2. A process uses one quantum at each RR level before moving down.</p><div className="guide-processes">{guideProblem.processes.map((process) => <span key={process.id}>{process.id}: arrival {process.arrival}, burst {process.burst}</span>)}</div><div className="guide-choices">{['P1', 'P2', 'P3', 'Idle'].map((id) => <button type="button" key={id} className={guideChoice === id ? 'selected' : ''} onClick={() => setGuideChoice(id)}>{id}</button>)}</div>{guideChoice && <div className={`guide-result ${guideChoice === guideCorrect ? 'correct' : ''}`}><strong>{guideChoice === guideCorrect ? 'Correct.' : `${guideCorrect} runs next.`}</strong><p>{guideRow.events.map(eventDescription).join(' · ')}</p><p>Waiting after dispatch: Q0 [{guideRow.queues[0].join(', ')}] · Q1 [{guideRow.queues[1].join(', ')}] · Q2 [{guideRow.queues[2].join(', ')}]</p><button type="button" onClick={() => { if (guideStep + 1 === guide.length) closeGuide(); else { setGuideStep(guideStep + 1); setGuideChoice(null) } }}>{guideStep + 1 === guide.length ? 'Start practice' : 'Next decision'} <ArrowRight size={16}/></button></div>}</div></div>}
  </div>
}
