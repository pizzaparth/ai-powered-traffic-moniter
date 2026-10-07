import { Suspense, lazy, useRef } from 'react'
import { useProgress } from '@react-three/drei'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Maximize2, Pause, Play, Square, Trash2 } from 'lucide-react'
import { LANES, LANE_CAP } from '../simulation/config.js'
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

// One signal per lane, the same four lights and countdowns the board shows.
function LaneSignal({ lane }) {
  const view = useSimStore((state) => state.lanes.find((item) => item.id === lane.id))
  const signal = view?.signal ?? 'red'
  const left = view?.countdown
  const noTimer = left === null || left === undefined
  const seconds = noTimer ? null : Math.max(0, Math.ceil(left))
  const Icon = HEADING_ICON[lane.heading]
  const count = view?.count ?? 0
  return (
    <section className="card lane-signal" aria-label={`${lane.label} signal`}>
      <div className="lane-signal-info">
        <h2 className="lane-signal-title">
          <Icon size={18} strokeWidth={3} aria-hidden="true" />
          {lane.label}
        </h2>
        <p className="lane-signal-meta">
          {lane.direction}. {count} {count === 1 ? 'car' : 'cars'}, {view?.queue ?? 0} stopped
        </p>
      </div>
      <div className="lane-signal-state">
        <span className={`pill pill-${signal}`}>{SIGNAL_LABEL[signal]}</span>
        <span className="countdown" aria-label={noTimer ? 'No change scheduled' : `${seconds} seconds until change`}>
          {noTimer ? (
            <small>No timer</small>
          ) : (
            <>
              {seconds}
              <small>s</small>
            </>
          )}
        </span>
      </div>
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
          <p className="page-lede">Two roads, one lane each way. Each approach gets green in turn, longer when more cars wait.</p>
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
          {LANES.map((lane) => (
            <LaneSignal key={lane.id} lane={lane} />
          ))}
        </aside>
      </div>
    </main>
  )
}
