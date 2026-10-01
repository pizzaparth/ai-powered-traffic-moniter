import { useMemo, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Download, Trash2 } from 'lucide-react'
import { useLogStore } from '../simulation/store.js'
import { DecisionCard, Totals } from '../simulation/ui/Insights.jsx'

const SOURCES = {
  algorithm: { label: 'Algorithm', pill: 'pill-ink' },
  user: { label: 'You', pill: 'pill-blue' },
}

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'algorithm', label: 'Algorithm' },
  { id: 'user', label: 'You' },
]

const ROW_HEIGHT = 68

const simClock = (seconds) => {
  const total = Math.floor(seconds)
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

const wallClock = (time) => new Date(time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })

function exportLog(entries) {
  const rows = entries.map(({ id, time, wall, source, kind, message, detail }) => ({
    id,
    simTime: Number(time.toFixed(2)),
    at: new Date(wall).toISOString(),
    source,
    kind,
    message,
    detail,
  }))
  const blob = new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `junction-activity-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`
  link.click()
  URL.revokeObjectURL(url)
}

export default function Activity() {
  const entries = useLogStore((state) => state.entries)
  const clear = useLogStore((state) => state.clear)
  const [filter, setFilter] = useState('all')
  const scroller = useRef(null)

  // Newest first.
  const rows = useMemo(() => {
    const list = filter === 'all' ? entries : entries.filter((entry) => entry.source === filter)
    return [...list].reverse()
  }, [entries, filter])

  const counts = useMemo(() => {
    const result = { all: entries.length, algorithm: 0, user: 0 }
    for (const entry of entries) result[entry.source] = (result[entry.source] ?? 0) + 1
    return result
  }, [entries])

  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scroller.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 8,
  })

  return (
    <main className="page activity-page">
      <header className="page-head">
        <div>
          <h1 className="page-title">Activity</h1>
          <p className="page-lede">Every signal decision and every action you take, newest first.</p>
        </div>
      </header>

      <div className="insights">
        <DecisionCard />
        <Totals />
      </div>

      <div className="filters">
        <div className="segmented" role="group" aria-label="Filter">
          {FILTERS.map((item) => (
            <button key={item.id} type="button" aria-pressed={filter === item.id} onClick={() => setFilter(item.id)}>
              {item.label} {counts[item.id]}
            </button>
          ))}
        </div>
        <div className="sim-controls">
          <button type="button" className="button button-small" onClick={() => exportLog(entries)} disabled={!entries.length}>
            <Download size={16} strokeWidth={2.5} />
            Export JSON
          </button>
          <button type="button" className="button button-small" onClick={clear} disabled={!entries.length}>
            <Trash2 size={16} strokeWidth={2.5} />
            Clear log
          </button>
        </div>
      </div>

      <div className="log" ref={scroller}>
        {rows.length === 0 ? (
          <p className="empty">Nothing logged yet. Open the simulation and add a car.</p>
        ) : (
          <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
            {virtualizer.getVirtualItems().map((item) => {
              const entry = rows[item.index]
              const source = SOURCES[entry.source]
              return (
                <div
                  key={entry.id}
                  className="log-row"
                  style={{ height: item.size, transform: `translateY(${item.start}px)` }}
                >
                  <span className="log-time">{simClock(entry.time)}</span>
                  <span className={`pill log-source ${source.pill}`}>{source.label}</span>
                  <span className="log-message">{entry.message}</span>
                  <span className="log-wall">{wallClock(entry.wall)}</span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </main>
  )
}
