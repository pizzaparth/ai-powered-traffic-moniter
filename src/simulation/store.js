import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { DEFAULT_TIMING, LANES } from './config.js'

const LOG_LIMIT = 2000
let logId = 0

// Every action by the algorithm, the user or the system.
export const useLogStore = create((set) => ({
  entries: [],
  add: (entry) =>
    set((state) => {
      const next = [...state.entries, { ...entry, id: ++logId, wall: Date.now() }]
      return { entries: next.length > LOG_LIMIT ? next.slice(next.length - LOG_LIMIT) : next }
    }),
  clear: () => set({ entries: [] }),
}))

export const DEFAULT_HARDWARE = {
  board: 'esp32',
  connection: 'wifi-mqtt',
  address: 'mqtt://192.168.1.50:1883',
  sensors: Object.fromEntries(LANES.map((lane, index) => [lane.id, { type: 'camera', input: `CAM${index + 1}` }])),
  outputs: Object.fromEntries(
    LANES.map((lane, index) => [lane.id, { red: 12 + index * 3, amber: 13 + index * 3, green: 14 + index * 3 }]),
  ),
}

// Saved in this browser so the configuration survives reloads.
export const useSettingsStore = create(
  persist(
    (set) => ({
      timing: DEFAULT_TIMING,
      hardware: DEFAULT_HARDWARE,
      save: ({ timing, hardware }) => set({ timing: { ...DEFAULT_TIMING, ...timing }, hardware }),
      reset: () => set({ timing: DEFAULT_TIMING, hardware: DEFAULT_HARDWARE }),
    }),
    { name: 'traffic-settings', version: 1 },
  ),
)

// What the UI shows about the running simulation, refreshed a few times a second.
export const useSimStore = create(() => ({
  time: 0,
  paused: false,
  speed: 1,
  autoSpawn: true,
  carIds: [],
  lanes: [],
  signal: null,
  metrics: { spawned: 0, crossed: 0, finished: 0, totalWait: 0, active: 0 },
}))
