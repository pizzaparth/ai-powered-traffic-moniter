import { AnimatePresence, motion } from 'framer-motion'
import { useLogStore, useSimStore } from '../store.js'

const clock = (seconds) => {
  const total = Math.floor(seconds)
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

const latestDecision = (state) => {
  for (let i = state.entries.length - 1; i >= 0; i--) if (state.entries[i].source === 'algorithm') return state.entries[i]
  return null
}

export function DecisionCard() {
  const entry = useLogStore(latestDecision)
  return (
    <section className="card insight-decision">
      <h2 className="card-title">Last decision</h2>
      <AnimatePresence mode="wait" initial={false}>
        <motion.p
          key={entry?.id ?? 'none'}
          className="decision"
          initial={{ y: 6 }}
          animate={{ y: 0 }}
          transition={{ duration: 0.2 }}
        >
          {entry ? entry.message : 'Waiting for the first decision.'}
        </motion.p>
      </AnimatePresence>
    </section>
  )
}

export function Totals() {
  const metrics = useSimStore((state) => state.metrics)
  const time = useSimStore((state) => state.time)
  const averageWait = metrics.crossed ? metrics.totalWait / metrics.crossed : 0
  const items = [
    { value: metrics.crossed, label: 'Cars through' },
    { value: `${averageWait.toFixed(1)} s`, label: 'Average wait' },
    { value: metrics.active, label: 'On the road' },
    { value: clock(time), label: 'Running time' },
  ]
  return (
    <section className="card insight-totals">
      <h2 className="card-title">Totals</h2>
      <div className="metrics">
        {items.map((item) => (
          <div className="metric" key={item.label}>
            <strong>{item.value}</strong>
            <span>{item.label}</span>
          </div>
        ))}
      </div>
    </section>
  )
}
