import { create } from 'zustand'
import { APPROACHES, BOARD } from './board.js'
import { simulation } from '../simulation/runtime.js'
import { useSettingsStore } from '../simulation/store.js'
import { PHASES } from '../simulation/config.js'
import { onTick } from '../simulation/clock.js'

// USB link to the board through the browser's Web Serial API (Chrome and
// Edge on desktop). The board has no Wi-Fi, so there is no server between
// this page and the hardware.

export const useBoardStore = create(() => ({
  supported: typeof navigator !== 'undefined' && 'serial' in navigator,
  status: 'disconnected', // 'connecting' | 'connected'
  ready: false,
  mode: null, // 'auto' (own cycle) | 'follow' (copying the simulation)
  frame: null, // last frame sent: { lights: ['G', ...], counts: [12, ...] }
  phase: null, // { phase, stage, ms, at } while on its own cycle
  timings: null, // [Road 1, Road 2] green seconds, as the board reports them
  lastAck: null,
  lastSent: null,
  error: null,
}))

const set = useBoardStore.setState
const log = (source, kind, message) => simulation.engine.log(source, kind, message)

let port = null
let reader = null
let writer = null
let closing = null

const describe = (timings) => PHASES.map((phase, index) => `${phase.name} ${timings[index]} s`).join(', ')

function handleLine(line) {
  const [kind, ...parts] = line.split(',')
  if (kind === 'READY') {
    set({ ready: true })
    log('board', 'ready', `${BOARD.name} is ready.`)
  } else if (kind === 'PHASE') {
    const [phaseIndex, stage, ms] = parts
    const phase = { phase: Number(phaseIndex), stage: stage.toLowerCase(), ms: Number(ms), at: performance.now() }
    const previous = useBoardStore.getState().phase
    const changed = !previous || previous.phase !== phase.phase || previous.stage !== phase.stage
    set({ phase, ready: true })
    // Status replies repeat the current stage; only log real changes, and
    // only on the board's own cycle (in follow mode it copies the app).
    if (changed && phase.stage === 'green' && useBoardStore.getState().mode !== 'follow') {
      log('board', 'phase', `Board turned ${PHASES[phase.phase].name} green for ${Math.round(phase.ms / 1000)} s.`)
    }
  } else if (kind === 'MODE') {
    const mode = parts[0] === 'FOLLOW' ? 'follow' : 'auto'
    const previous = useBoardStore.getState().mode
    set({ mode, ready: true })
    if (mode !== previous) {
      log('board', 'mode', mode === 'follow' ? 'Board is copying the simulation signals.' : 'Board is running its own cycle.')
    }
  } else if (kind === 'TIMINGS') {
    set({ timings: parts.map(Number) })
  } else if (line.startsWith('ACK')) {
    set({ lastAck: Date.now() })
    log('board', 'ack', 'Board applied the new green times.')
  } else if (kind === 'ERR') {
    log('board', 'error', `Board rejected a command: ${parts.join(',')}.`)
  }
}

async function readLoop() {
  const decoder = new TextDecoderStream()
  closing = port.readable.pipeTo(decoder.writable).catch(() => {})
  reader = decoder.readable.getReader()
  let buffer = ''
  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += value
      let newline
      while ((newline = buffer.search(/\r?\n/)) >= 0) {
        const line = buffer.slice(0, newline).trim()
        buffer = buffer.slice(buffer[newline] === '\r' ? newline + 2 : newline + 1)
        if (line) handleLine(line)
      }
    }
  } catch {
    // The port went away; disconnect() tidies up.
  } finally {
    reader.releaseLock()
  }
}

export async function send(line) {
  if (!writer) throw new Error('Board is not connected')
  await writer.write(new TextEncoder().encode(`${line}\n`))
}

// Open the chosen port, or reuse it if this tab already has it open and
// nothing is reading or writing it (for example after a hot reload).
async function openPort(selected) {
  const alreadyOpen = Boolean(selected.readable || selected.writable)
  if (!alreadyOpen) {
    await selected.open({ baudRate: BOARD.baudRate })
    return
  }
  if (selected.readable?.locked || selected.writable?.locked) {
    const error = new Error('held')
    error.name = 'PortHeldError'
    throw error
  }
}

// Plain-language reasons for the common ways opening a port fails.
function explain(error) {
  if (error?.name === 'PortHeldError' || error?.name === 'InvalidStateError') {
    return 'This tab still holds the port from an earlier connection. Reload the page, then connect again.'
  }
  if (error?.name === 'NetworkError') {
    return 'The port is busy. Close the Arduino IDE Serial Monitor or any other app using the board, then try again.'
  }
  return error?.message ?? 'Unknown error'
}

export async function connect() {
  if (!useBoardStore.getState().supported || port) return
  set({ status: 'connecting', error: null })
  let selected = null
  try {
    selected = await navigator.serial.requestPort({ filters: [{ usbVendorId: BOARD.usbVendorId }] })
    await openPort(selected)
    port = selected
    writer = port.writable.getWriter()
    set({ status: 'connected', ready: false, mode: null, frame: null, phase: null, timings: null })
    log('user', 'connect', `Connected to the ${BOARD.name} over USB.`)
    readLoop()
    // Ask for the current state in case the board started before we opened it.
    setTimeout(() => send('?').catch(() => {}), 400)
  } catch (error) {
    // Leave nothing half-open behind.
    writer?.releaseLock()
    if (selected && error?.name !== 'PortHeldError') await selected.close().catch(() => {})
    port = null
    writer = null
    const cancelled = error?.name === 'NotFoundError'
    set({ status: 'disconnected', error: cancelled ? null : explain(error) })
  }
}

export async function disconnect({ lost = false, quiet = false } = {}) {
  if (!port) return
  const closingPort = port
  port = null
  try {
    await reader?.cancel()
  } catch {
    // Reader already gone.
  }
  await closing
  try {
    writer?.releaseLock()
  } catch {
    // Writer already released.
  }
  await closingPort.close().catch(() => {})
  reader = null
  writer = null
  set({ status: 'disconnected', ready: false, mode: null, frame: null, phase: null })
  if (!quiet) log(lost ? 'board' : 'user', 'disconnect', lost ? 'Board was unplugged.' : 'Disconnected the board.')
}

const onUnplug = (event) => {
  if (event.target === port) disconnect({ lost: true })
}
if (typeof navigator !== 'undefined' && navigator.serial) {
  navigator.serial.addEventListener('disconnect', onUnplug)
}

// Green seconds for Road 1 and Road 2, used on the board's own cycle.
export async function sendTimings(timings, source = 'user') {
  const values = timings.map((value) => Math.round(Math.min(BOARD.maxGreen, Math.max(BOARD.minGreen, value))))
  await send(`<${values.join(',')}>`)
  set({ lastSent: values })
  log(source, 'send', `Sent green times to the board: ${describe(values)}.`)
  return values
}

// What the adaptive controller would give each road right now (§14: time
// to clear the longest predicted queue on that road).
export function adaptiveTimings() {
  const sense = simulation.engine.sense()
  return PHASES.map((phase) => Math.max(...phase.lanes.map((id) => simulation.engine.controller.laneGreen(sense[id]))))
}

// Follow mode: the board copies the simulation's signals. Each approach
// takes its road's light and countdown. A frame goes out as soon as anything
// changes and at least once a second, which also keeps the board from
// timing out (3 s) and falling back to its own cycle.
const KEEPALIVE_MS = 1000
const LIGHT_CODE = { green: 'G', yellow: 'Y', red: 'R' }
const PHASE_OF_APPROACH = APPROACHES.map((approach) => approach.phase)

export function simulationFrame() {
  const controller = simulation.engine.controller
  return {
    lights: PHASE_OF_APPROACH.map((phase) => LIGHT_CODE[controller.signalFor(phase)]),
    // '-' blanks the display while the junction is empty and no change is coming.
    counts: PHASE_OF_APPROACH.map((phase) => {
      const left = controller.countdown(phase)
      return left === null ? '-' : Math.min(99, Math.max(0, Math.ceil(left)))
    }),
  }
}

let lastFrameKey = ''
let lastFrameAt = 0
let sending = false
// Driven by the worker clock so frames keep flowing from a background tab.
const stopFrames = onTick(async () => {
  const { hardware } = useSettingsStore.getState()
  if (!hardware.mirror || useBoardStore.getState().status !== 'connected' || sending) {
    lastFrameKey = ''
    return
  }
  const frame = simulationFrame()
  const key = `${frame.lights.join(',')},${frame.counts.join(',')}`
  const now = performance.now()
  if (key === lastFrameKey && now - lastFrameAt < KEEPALIVE_MS) return
  sending = true
  try {
    await send(`L,${key}`)
    lastFrameKey = key
    lastFrameAt = now
    set({ frame })
  } catch {
    // Port closing; the disconnect handler resets the state.
  } finally {
    sending = false
  }
})

// During development a hot reload replaces this module. Close the port and
// stop the timers first, otherwise the tab keeps the port open with no code
// attached and the next connect fails with "The port is already open".
if (import.meta.hot) {
  import.meta.hot.dispose(async () => {
    stopFrames()
    navigator.serial?.removeEventListener('disconnect', onUnplug)
    await disconnect({ quiet: true })
  })
}
