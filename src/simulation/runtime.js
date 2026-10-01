import { SimulationEngine } from './engine.js'
import { useLogStore, useSimStore } from './store.js'
import { DEFAULT_TIMING } from './config.js'
import { onTick } from './clock.js'

// One simulation for the whole app. It keeps running while you look at the
// activity or hardware tabs. When the 3D view is open it drives the clock
// from the render loop so cars move in step with each frame.

const STEP = 1 / 60
const MAX_FRAME = 0.1
const HIDDEN_MAX_FRAME = 1 // worker ticks are ~0.2 s apart, more if the tab is busy
const PUBLISH_EVERY = 0.12

const engine = new SimulationEngine({
  timing: DEFAULT_TIMING,
  log: (entry) => useLogStore.getState().add(entry),
})

const carIds = () => [...engine.cars.values()].map((car) => ({ id: car.id, type: car.type }))

engine.onCarsChange(() => useSimStore.setState({ carIds: carIds() }))

let accumulator = 0
let sincePublish = Infinity

function publish() {
  useSimStore.setState({
    time: engine.time,
    lanes: engine.laneView(),
    signal: engine.controller.snapshot(),
    metrics: { ...engine.metrics, active: engine.cars.size },
  })
}

function advance(realDelta, maxFrame = MAX_FRAME) {
  const { paused, speed } = useSimStore.getState()
  if (paused) return
  accumulator += Math.min(realDelta, maxFrame) * speed
  while (accumulator >= STEP) {
    engine.step(STEP)
    accumulator -= STEP
  }
  sincePublish += realDelta
  if (sincePublish >= PUBLISH_EVERY) {
    sincePublish = 0
    publish()
  }
}

// Visible tab: this frame loop drives the clock whenever no 3D view is
// mounted (the 3D view drives it from its own render loop).
let rendererAttached = 0
let last = performance.now()
function loop(now) {
  const delta = (now - last) / 1000
  last = now
  if (!rendererAttached && !document.hidden) advance(delta)
  requestAnimationFrame(loop)
}
requestAnimationFrame(loop)

// Hidden tab: frame loops stop, so the worker clock keeps simulated time in
// step with real time. The board keeps copying a live simulation.
let lastHidden = performance.now()
onTick(() => {
  const now = performance.now()
  const delta = (now - lastHidden) / 1000
  lastHidden = now
  if (document.hidden) advance(delta, HIDDEN_MAX_FRAME)
})

const userLog = (kind, message) => engine.log('user', kind, message)

export const simulation = {
  engine,
  attachRenderer() {
    rendererAttached++
    return () => {
      rendererAttached--
      last = performance.now()
    }
  },
  frame: advance,
  spawn(laneId) {
    engine.requestCar(laneId, { source: 'user' })
    publish()
  },
  setPaused(paused) {
    useSimStore.setState({ paused })
    userLog(paused ? 'pause' : 'resume', paused ? 'Paused the simulation.' : 'Resumed the simulation.')
  },
  setSpeed(speed) {
    useSimStore.setState({ speed })
    userLog('speed', `Set simulation speed to ${speed}x.`)
  },
  setAutoSpawn(autoSpawn) {
    engine.autoSpawn = autoSpawn
    useSimStore.setState({ autoSpawn })
    userLog('auto', autoSpawn ? 'Turned random traffic on.' : 'Turned random traffic off.')
  },
  clearCars() {
    engine.reset()
    userLog('clear', 'Cleared every car from the junction.')
    publish()
  },
}

publish()
