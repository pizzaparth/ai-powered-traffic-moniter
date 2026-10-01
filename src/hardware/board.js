import { LANES } from '../simulation/config.js'

// Mirrors backend/sketch_sep30a/sketch_sep30a.ino. Change both together.
export const BOARD = {
  name: 'Arduino UNO R4 Minima',
  baudRate: 115200,
  usbVendorId: 0x2341, // Arduino SA
  yellow: 3, // fixed in the sketch
  minGreen: 5,
  maxGreen: 60,
  clockPin: 'A0',
  dataPin: 'A1',
}

// The sketch numbers approaches 0 = North, 1 = East, 2 = South, 3 = West and
// runs them in that order, one at a time. Each maps to the simulation lane
// whose cars arrive from that side.
export const APPROACHES = [
  { index: 0, key: 'north', label: 'North', red: 2, yellow: 3, green: 4, latch: 'A2' },
  { index: 1, key: 'east', label: 'East', red: 5, yellow: 6, green: 7, latch: 'A3' },
  { index: 2, key: 'south', label: 'South', red: 8, yellow: 9, green: 10, latch: 'A4' },
  { index: 3, key: 'west', label: 'West', red: 11, yellow: 12, green: 13, latch: 'A5' },
].map((approach) => ({ ...approach, lane: LANES.find((lane) => lane.from === approach.key) }))

// Seconds until each approach's light changes, the same sum the sketch
// shows on its displays (getWaitTime).
export function boardCountdowns(phase, timings, elapsed) {
  if (!phase || !timings) return null
  const countdown = Math.max(0, phase.seconds - elapsed)
  return APPROACHES.map(({ index }) => {
    if (index === phase.lane) return countdown
    let wait = countdown + (phase.mode === 'green' ? BOARD.yellow : 0)
    for (let lane = (phase.lane + 1) % 4; lane !== index; lane = (lane + 1) % 4) wait += timings[lane] + BOARD.yellow
    return wait
  })
}
