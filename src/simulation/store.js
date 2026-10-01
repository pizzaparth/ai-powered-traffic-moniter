import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { DEFAULT_TIMING } from './config.js'

const LOG_LIMIT = 2000
let logId = 0

// Every action by the algorithm, the user or the board.
export const useLogStore = create((set) => ({
  entries: [],
  add: (entry) =>
    set((state) => {
      const next = [...state.entries, { ...entry, id: ++logId, wall: Date.now() }]
      return { entries: next.length > LOG_LIMIT ? next.slice(next.length - LOG_LIMIT) : next }
    }),
  clear: () => set({ entries: [] }),
}))

// Board link settings. Green times are per approach in the sketch's order:
// North, East, South, West.
export const DEFAULT_HARDWARE = {
  greens: { north: 10, east: 10, south: 10, west: 10 },
  autoSync: false,
  syncEvery: 5,
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
    {
      name: 'traffic-settings',
      version: 2,
      // Version 1 described a Wi-Fi board with cameras; keep only the timing.
      migrate: (saved) => ({ timing: { ...DEFAULT_TIMING, ...saved?.timing }, hardware: DEFAULT_HARDWARE }),
    },
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
