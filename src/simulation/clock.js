// A steady tick that keeps running when the tab is hidden. Browsers pause
// requestAnimationFrame and throttle timers in background tabs, which froze
// the simulation and starved the board of frames. Timers inside a dedicated
// worker are not throttled that way, so the worker paces the ticks.

const INTERVAL_MS = 200
const listeners = new Set()
let worker = null

function start() {
  const source = `setInterval(() => postMessage(0), ${INTERVAL_MS})`
  const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }))
  worker = new Worker(url)
  URL.revokeObjectURL(url)
  worker.onmessage = () => {
    for (const listener of listeners) listener()
  }
}

export function onTick(listener) {
  if (!worker) start()
  listeners.add(listener)
  return () => listeners.delete(listener)
}
