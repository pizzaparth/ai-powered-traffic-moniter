import { Suspense, lazy, useRef } from 'react'
import { useProgress } from '@react-three/drei'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Maximize2, Pause, Play, Square, Trash2 } from 'lucide-react'
import { LANES, LANE_BY_ID, LANE_CAP, ROADS } from '../simulation/config.js'
import { simulation } from '../simulation/runtime.js'
import { useSimStore } from '../simulation/store.js'
import { HOME_VIEW, TOP_VIEW } from '../simulation/three/views.js'

const JunctionScene = lazy(() => import('../simulation/three/JunctionScene.jsx'))

const SIGNAL_LABEL = { green: 'Green', yellow: 'Yellow', red: 'Red' }
const SPEEDS = [1, 2, 4]
// Compass arrows, matching the top view (north is up).
const HEADING_ICON = { south: ArrowDown, north: ArrowUp, east: ArrowRight, west: ArrowLeft }

function SpawnButtons() {
  const lanes = useSimStore((state) => state.lanes)
  return (
    <div className="spawn-buttons">
      {LANES.map((lane) => {
        const count = lanes.find((item) => item.id === lane.id)?.count ?? 0
        const full = count >= LANE_CAP
        const Icon = HEADING_ICON[lane.heading]
        return (
          <button
            key={lane.id}
            type="button"
            className="spawn"
            aria-disabled={full}
            onClick={() => simulation.spawn(lane.id)}
            title={full ? `${lane.label} is full` : `Add a car to ${lane.label}, ${lane.direction.toLowerCase()}`}
          >
            <Icon size={18} strokeWidth={3} aria-hidden="true" />
            <span className="spawn-label">
              {lane.label}
              <small>{lane.direction}</small>
            </span>
            <span className={`pill ${full ? 'pill-red' : 'pill-paper'}`}>
              {full ? 'Full' : `${count}/${LANE_CAP}`}
            </span>
          </button>
        )
      })}
    </div>
  )
}

function Controls() {
  const paused = useSimStore((state) => state.paused)
  const speed = useSimStore((state) => state.speed)
  const autoSpawn = useSimStore((state) => state.autoSpawn)
  return (
    <div className="sim-controls">
      <div className="segmented" role="group" aria-label="Speed">
        {SPEEDS.map((value) => (
          <button key={value} type="button" aria-pressed={speed === value} onClick={() => simulation.setSpeed(value)}>
            {value}x
          </button>
        ))}
      </div>
      <button type="button" className="button button-small" onClick={() => simulation.setAutoSpawn(!autoSpawn)}>
        {autoSpawn ? <Square size={16} strokeWidth={3} /> : <Play size={16} strokeWidth={3} />}
        {autoSpawn ? 'Stop random traffic' : 'Start random traffic'}
      </button>
      <button type="button" className="button button-small" onClick={() => simulation.clearCars()}>
        <Trash2 size={16} strokeWidth={2.5} />
        Clear cars
      </button>
      <button type="button" className="button button-small button-solid" onClick={() => simulation.setPaused(!paused)}>
        {paused ? <Play size={16} strokeWidth={3} /> : <Pause size={16} strokeWidth={3} />}
        {paused ? 'Resume' : 'Pause'}
      </button>
    </div>
  )
}

function RoadCard({ road }) {
  const lanes = useSimStore((state) => state.lanes).filter((lane) => lane.id.startsWith(road.id))
  const signal = lanes[0]?.signal ?? 'red'
  const countdown = Math.max(0, Math.ceil(lanes[0]?.countdown ?? 0))
  return (
    <section className="card" aria-label={`${road.name} signal`}>
      <h2 className="card-title">
        {road.name}
        <span className="pill pill-ink">{road.axis}</span>
      </h2>
      <div className="signal-row">
        <span className={`pill pill-${signal}`}>{SIGNAL_LABEL[signal]}</span>
        <span className="countdown" aria-label={`${countdown} seconds until change`}>
          {countdown}
          <small>s</small>
        </span>
      </div>
      <ul className="lane-rows">
        {lanes.map((lane) => (
          <li key={lane.id}>
            <span>
              Lane {LANE_BY_ID[lane.id].index} {LANE_BY_ID[lane.id].direction.toLowerCase()}
            </span>
            <span>
              {lane.count} {lane.count === 1 ? 'car' : 'cars'}, {lane.queue} stopped
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}

function Loading() {
  const { progress, active } = useProgress()
  return (
    <AnimatePresence>
      {(active || progress < 100) && (
        <motion.div className="stage-loading" exit={{ opacity: 0 }} transition={{ duration: 0.4 }} role="status">
          Loading {Math.round(progress)}%
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export default function Simulation() {
  const controls = useRef()
  const view = (target) => controls.current?.setLookAt(...target, true)

  return (
    <main className="page sim-page">
      <header className="page-head">
        <div>
          <h1 className="page-title">Live junction</h1>
          <p className="page-lede">Two roads, one lane each way. The signal gives green to the road that clears the most traffic.</p>
        </div>
        <Controls />
      </header>

      <div className="toolbar">
        <SpawnButtons />
      </div>

      <div className="sim-grid">
        <div className="stage">
          <Suspense fallback={null}>
            <JunctionScene controlsRef={controls} />
          </Suspense>
          <div className="stage-overlay">
            <p className="stage-hint">Drag to orbit. Scroll or pinch to zoom. Right-drag or two fingers to pan.</p>
            <div className="stage-views">
              <button type="button" className="button button-small" onClick={() => view(TOP_VIEW)}>
                Top view
              </button>
              <button type="button" className="button button-small" onClick={() => view(HOME_VIEW)}>
                <Maximize2 size={16} strokeWidth={2.5} />
                Reset view
              </button>
            </div>
          </div>
          <Loading />
        </div>

        <aside className="status">
          {ROADS.map((road) => (
            <RoadCard key={road.id} road={road} />
          ))}
        </aside>
      </div>
    </main>
  )
}
