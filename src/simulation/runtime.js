import { SimulationEngine } from './engine.js'
import { useLogStore, useSettingsStore, useSimStore } from './store.js'

// One simulation for the whole app. It keeps running while you look at the
// activity or hardware tabs. When the 3D view is open it drives the clock
// from the render loop so cars move in step with each frame.

const STEP = 1 / 60
const MAX_FRAME = 0.1
const PUBLISH_EVERY = 0.12

const engine = new SimulationEngine({
  timing: useSettingsStore.getState().timing,
  log: (entry) => useLogStore.getState().add(entry),
})

useSettingsStore.subscribe((state, previous) => {
  if (state.timing !== previous.timing) engine.setTiming(state.timing)
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

function advance(realDelta) {
  const { paused, speed } = useSimStore.getState()
  if (paused) return
  accumulator += Math.min(realDelta, MAX_FRAME) * speed
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

// Background clock, used whenever no 3D view is mounted.
let rendererAttached = 0
let last = performance.now()
function loop(now) {
  const delta = (now - last) / 1000
  last = now
  if (!rendererAttached) advance(delta)
  requestAnimationFrame(loop)
}
requestAnimationFrame(loop)

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
