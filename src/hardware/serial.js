import { create } from 'zustand'
import { APPROACHES, BOARD } from './board.js'
import { simulation } from '../simulation/runtime.js'
import { useSettingsStore } from '../simulation/store.js'

// USB link to the board through the browser's Web Serial API (Chrome and
// Edge on desktop). The board has no Wi-Fi, so there is no server between
// this page and the hardware.

export const useBoardStore = create(() => ({
  supported: typeof navigator !== 'undefined' && 'serial' in navigator,
  status: 'disconnected', // 'connecting' | 'connected'
  ready: false,
  phase: null, // { lane, mode, seconds, at }
  timings: null, // green seconds per approach, as the board reports them
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

const describe = (timings) => APPROACHES.map((a) => `${a.label} ${timings[a.index]} s`).join(', ')

function handleLine(line) {
  const [kind, ...parts] = line.split(',')
  if (kind === 'READY') {
    set({ ready: true })
    log('board', 'ready', `${BOARD.name} is ready.`)
  } else if (kind === 'PHASE') {
    const [lane, mode, seconds] = parts
    const phase = { lane: Number(lane), mode: mode.toLowerCase(), seconds: Number(seconds), at: performance.now() }
    const previous = useBoardStore.getState().phase
    const changed = !previous || previous.lane !== phase.lane || previous.mode !== phase.mode
    set({ phase, ready: true })
    // Status replies repeat the current phase; only log real changes.
    if (changed && phase.mode === 'green') {
      log('board', 'phase', `Board turned ${APPROACHES[phase.lane].label} green for ${phase.seconds} s.`)
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

export async function connect() {
  if (!useBoardStore.getState().supported) return
  set({ status: 'connecting', error: null })
  try {
    port = await navigator.serial.requestPort({ filters: [{ usbVendorId: BOARD.usbVendorId }] })
    await port.open({ baudRate: BOARD.baudRate })
    writer = port.writable.getWriter()
    set({ status: 'connected', ready: false, phase: null, timings: null })
    log('user', 'connect', `Connected to the ${BOARD.name} over USB.`)
    readLoop()
    // Ask for the current state in case the board started before we opened it.
    setTimeout(() => send('?').catch(() => {}), 400)
  } catch (error) {
    port = null
    writer = null
    const cancelled = error?.name === 'NotFoundError'
    set({ status: 'disconnected', error: cancelled ? null : error.message })
  }
}

export async function disconnect({ lost = false } = {}) {
  if (!port) return
  try {
    await reader?.cancel()
    await closing
    writer?.releaseLock()
    await port.close()
  } catch {
    // Already closed or unplugged.
  }
  port = null
  reader = null
  writer = null
  set({ status: 'disconnected', ready: false, phase: null })
  log(lost ? 'board' : 'user', 'disconnect', lost ? 'Board was unplugged.' : 'Disconnected the board.')
}

if (typeof navigator !== 'undefined' && navigator.serial) {
  navigator.serial.addEventListener('disconnect', (event) => {
    if (event.target === port) disconnect({ lost: true })
  })
}

// Green seconds per approach, in the sketch's order (North, East, South, West).
export async function sendTimings(timings, source = 'user') {
  const values = timings.map((value) => Math.round(Math.min(BOARD.maxGreen, Math.max(BOARD.minGreen, value))))
  await send(`<${values.join(',')}>`)
  set({ lastSent: values })
  log(source, 'send', `Sent green times to the board: ${describe(values)}.`)
  return values
}

// What the adaptive controller would give each approach right now (§14:
// startup loss plus the time to clear its predicted queue).
export function adaptiveTimings() {
  const sense = simulation.engine.sense()
  return APPROACHES.map((approach) => simulation.engine.controller.laneGreen(sense[approach.lane.id]))
}

// Auto sync: push fresh adaptive green times on a fixed rhythm, but only
// when they changed, so the serial line stays quiet.
let sinceSync = 0
setInterval(() => {
  const { hardware } = useSettingsStore.getState()
  if (!hardware.autoSync || useBoardStore.getState().status !== 'connected') {
    sinceSync = 0
    return
  }
  sinceSync += 1
  if (sinceSync < hardware.syncEvery) return
  sinceSync = 0
  const next = adaptiveTimings()
  const last = useBoardStore.getState().lastSent
  if (last && last.every((value, index) => value === next[index])) return
  sendTimings(next, 'algorithm').catch(() => {})
}, 1000)
