import { DEFAULT_TIMING, LANES, PHASES } from '../simulation/config.js'

// Mirrors backend/sketch_sep30a/sketch_sep30a.ino. Change both together.
export const BOARD = {
  name: 'Arduino UNO R4 Minima',
  baudRate: 115200,
  usbVendorId: 0x2341, // Arduino SA
  // The sketch hard-codes these; they must equal the simulation's timing.
  yellow: DEFAULT_TIMING.yellow,
  allRed: DEFAULT_TIMING.allRed,
  minGreen: 5,
  maxGreen: 60,
  clockPin: 'A0',
  dataPin: 'A1',
}

// The sketch numbers approaches 0 = North, 1 = East, 2 = South, 3 = West.
// Each maps to the simulation lane whose cars arrive from that side, and to
// that lane's phase. Every approach has its own phase, numbered the same.
export const APPROACHES = [
  { index: 0, key: 'north', label: 'North', red: 2, yellow: 3, green: 4, latch: 'A2' },
  { index: 1, key: 'east', label: 'East', red: 5, yellow: 6, green: 7, latch: 'A3' },
  { index: 2, key: 'south', label: 'South', red: 8, yellow: 9, green: 10, latch: 'A4' },
  { index: 3, key: 'west', label: 'West', red: 11, yellow: 12, green: 13, latch: 'A5' },
].map((approach) => {
  const lane = LANES.find((item) => item.from === approach.key)
  return { ...approach, lane, phase: PHASES.findIndex((phase) => phase.lanes.includes(lane.id)) }
})

// What the board shows while running its own cycle, worked out from its last
// PHASE report: { phase, stage: 'green' | 'yellow' | 'allred', ms, at }.
// Same sums as the sketch's autoCountdown and the simulation's countdown.
export function boardSignals(report, greens, now) {
  if (!report || !greens) return null
  const left = Math.max(0, report.ms - (now - report.at))
  const yellow = BOARD.yellow * 1000
  const allRed = BOARD.allRed * 1000
  const count = greens.length
  // Time until the next phase in the rotation turns green.
  const untilNext = report.stage === 'green' ? left + yellow + allRed : report.stage === 'yellow' ? left + allRed : left
  return APPROACHES.map((approach) => {
    const own = approach.phase === report.phase
    if (own && report.stage !== 'allred') return { light: report.stage, seconds: Math.ceil(left / 1000) }
    // Phases are served in turn: add a full green, yellow and all red for
    // every phase between the next one and this approach.
    const steps = own ? count : (approach.phase - report.phase + count) % count
    let ms = untilNext
    for (let k = 1; k < steps; k++) ms += greens[(report.phase + k) % count] * 1000 + yellow + allRed
    return { light: 'red', seconds: Math.ceil(ms / 1000) }
  })
}
