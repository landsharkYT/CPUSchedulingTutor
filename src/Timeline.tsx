import { useLayoutEffect, useRef, useState, type KeyboardEvent, type RefObject } from 'react'
import { Plus } from 'lucide-react'

export function useTimelineColumns() {
  const containerRef = useRef<HTMLDivElement>(null)
  const [columns, setColumns] = useState(12)

  useLayoutEffect(() => {
    const container = containerRef.current
    if (!container) return
    const measure = () => {
      if (container.clientWidth > 0) setColumns(Math.max(1, Math.floor((container.clientWidth - 26) / 48)))
    }
    measure()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    observer?.observe(container)
    window.addEventListener('resize', measure)
    return () => { observer?.disconnect(); window.removeEventListener('resize', measure) }
  }, [])

  return { containerRef, columns }
}

export function lastRowStart(cellCount: number, columns: number) {
  return Math.floor((Math.max(1, cellCount) - 1) / columns) * columns
}

export function canRemoveTimelineRow(cells: (string | null)[], finish: number, columns: number) {
  const start = lastRowStart(cells.length, columns)
  return start > 0 && finish <= start && cells.slice(start).every((cell) => cell === null)
}

type TimelineGridProps = {
  cells: (string | null)[]
  finish: number
  errors: string[]
  finishInvalid: boolean
  focusedCell: number
  painting: boolean
  columns: number
  containerRef: RefObject<HTMLDivElement | null>
  onPaint: (index: number, value?: string) => void
  onPaintingChange: (painting: boolean) => void
  onSetFinish: (time: number) => void
  onFocusCell: (index: number) => void
  onCellKeyDown: (event: KeyboardEvent<HTMLButtonElement>, index: number) => void
  processColor: (id: string) => string
}

export function TimelineGrid({ cells, finish, errors, finishInvalid, focusedCell, painting, columns, containerRef, onPaint, onPaintingChange, onSetFinish, onFocusCell, onCellKeyDown, processColor }: TimelineGridProps) {
  const rows = Array.from({ length: Math.ceil(cells.length / columns) }, (_, row) => {
    const start = row * columns
    return { start, end: Math.min(cells.length, start + columns) }
  })

  return <div className="timeline-scroll wrapped-timeline" ref={containerRef}>
    {rows.map(({ start, end }) => {
      const finishHere = finish >= start && finish <= end && (start === 0 || finish !== start)
      const markerPosition = `${((finish - start) / columns) * 100}%`
      return <div className="timeline-row" key={start} style={{ '--row-columns': columns } as React.CSSProperties}>
        <div className="timeline-row-range">Time {start}–{end}</div>
        <div className="time-labels">
          {cells.slice(start, end).map((_, offset) => <button type="button" className="time-boundary" key={start + offset} aria-label={`Set Finish at time ${start + offset}`} onClick={() => onSetFinish(start + offset)}>{start + offset}</button>)}
          <button type="button" className="time-boundary end" style={{ '--boundary-position': `${((end - start) / columns) * 100}%` } as React.CSSProperties} aria-label={`Set Finish at time ${end}`} onClick={() => onSetFinish(end)}>{end}</button>
        </div>
        <div className="time-cells">
          {cells.slice(start, end).map((value, offset) => {
            const index = start + offset
            return <button type="button" key={index} data-cell={index} aria-label={`Time ${index} to ${index + 1}: ${value ?? 'empty'}`}
              className={`time-cell ${value ? 'filled' : ''} ${value === 'Idle' ? 'idle' : ''} ${focusedCell === index ? 'focused' : ''} ${errors[index] ?? ''}`}
              style={value && value !== 'Idle' ? { '--process-color': processColor(value) } as React.CSSProperties : undefined}
              onClick={() => onPaint(index)}
              onPointerDown={(event) => { if (event.button === 0) { onPaintingChange(true); onPaint(index) } }}
              onPointerEnter={() => { if (painting) onPaint(index) }}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => { event.preventDefault(); onPaint(index, event.dataTransfer.getData('text/plain')) }}
              onFocus={() => onFocusCell(index)} onKeyDown={(event) => onCellKeyDown(event, index)}>{value ?? <Plus size={13}/>}</button>
          })}
        </div>
        <div className="finish-row">
          {finishHere && <><div className="finish-line" style={{ width: markerPosition }}/><div className={`finish-marker ${finishInvalid ? 'invalid' : ''} ${finish === end ? 'at-end' : ''}`} style={{ left: markerPosition }}><span className="finish-label">FINISH <span className="finish-time">t={finish}</span></span></div></>}
        </div>
      </div>
    })}
  </div>
}

type SolutionChartProps = {
  cells: string[]
  levels?: (number | null)[]
  columns: number
  processColor: (id: string) => string
}

export function WrappedSolutionChart({ cells, levels, columns, processColor }: SolutionChartProps) {
  const rows = Array.from({ length: Math.ceil(cells.length / columns) }, (_, row) => {
    const start = row * columns
    const end = Math.min(cells.length, start + columns)
    const blocks: { id: string; level: number | null; start: number; end: number }[] = []
    for (let time = start; time < end; time += 1) {
      const id = cells[time]
      const level = levels?.[time] ?? null
      const previous = blocks[blocks.length - 1]
      if (previous && previous.id === id && previous.level === level) previous.end = time + 1
      else blocks.push({ id, level, start: time, end: time + 1 })
    }
    return { start, end, blocks }
  })

  return <div className="solution-chart wrapped-solution-chart">
    {rows.map(({ start, end, blocks }) => <div className="solution-chart-row" key={start} style={{ '--row-columns': columns } as React.CSSProperties}>
      <div className="timeline-row-range">Time {start}–{end}</div>
      <div className="solution-chart-cells">
        {blocks.map((block) => <div key={block.start} className={`solution-block ${block.id === 'Idle' ? 'idle' : ''}`}
          style={{ gridColumn: `${block.start - start + 1} / span ${block.end - block.start}`, background: block.id === 'Idle' ? undefined : processColor(block.id) }}>
          <strong>{block.id}{block.level === null ? '' : ` · Q${block.level}`}</strong><span>{block.start}–{block.end}</span>
        </div>)}
      </div>
    </div>)}
  </div>
}
