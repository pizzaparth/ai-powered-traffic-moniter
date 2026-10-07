import { create } from 'zustand'
import { persist } from 'zustand/middleware'

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

// Board link settings. Green times are per phase (p1-p4 = North, East, South, West),
// used when the board runs its own cycle.
export const DEFAULT_HARDWARE = {
  greens: { p1: 20, p2: 20, p3: 20, p4: 20 },
  // Stream the simulation's signals to the board so it copies them live.
  mirror: true,
}

// Saved in this browser so the configuration survives reloads.
export const useSettingsStore = create(
  persist(
    (set) => ({
      hardware: DEFAULT_HARDWARE,
      save: ({ hardware }) => set((state) => ({ hardware: { ...state.hardware, ...hardware } })),
      reset: () => set((state) => ({ hardware: { ...DEFAULT_HARDWARE, mirror: state.hardware.mirror } })),
      setMirror: (mirror) => set((state) => ({ hardware: { ...state.hardware, mirror } })),
    }),
    {
      name: 'traffic-settings',
      version: 5,
      // Older versions stored per-approach green times, signal timing and
      // other hardware options. Keep only the live-copy switch.
      migrate: (saved) => ({
        hardware: { ...DEFAULT_HARDWARE, mirror: saved?.hardware?.mirror ?? DEFAULT_HARDWARE.mirror },
      }),
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
