// World units are metres. The junction is a "+" of two two-way roads:
//   Road 1 runs north-south, Road 2 runs east-west.
// Each road has one lane per direction and traffic keeps to the right.
// North is -z and east is +x.

export const TILE = 12 // one road-kit tile, edge to edge
export const LANE_WIDTH = 3.6 // asphalt is 60% of a tile: one lane each way
export const HALF = TILE / 2 // stop lines sit on the junction tile's edge
export const ARM_TILES = 5
export const ARM = ARM_TILES * TILE // approach (and exit) length
export const SIDEWALK_HEIGHT = 0.43
export const ROAD_Y = 0.1 // top of the lane paint, where tyres sit

export const LANE_CAP = 8
export const MIN_GAP = 1.6 // bumper-to-bumper gap when queued
export const BRAKE = 6 // m/s², comfortable braking
export const TURN_SPEED = 3.5 // m/s through a turn

export const ROADS = [
  { id: 'r1', name: 'Road 1', axis: 'North-south' },
  { id: 'r2', name: 'Road 2', axis: 'East-west' },
]

// Unit travel directions on the ground plane (x, z).
export const HEADINGS = {
  south: { x: 0, z: 1, label: 'Southbound' },
  north: { x: 0, z: -1, label: 'Northbound' },
  east: { x: 1, z: 0, label: 'Eastbound' },
  west: { x: -1, z: 0, label: 'Westbound' },
}

// Every lane is one approach into the junction. Turn shares are the chance
// that a new car turns left or right instead of going straight.
export const LANES = [
  { id: 'r1l1', road: 'r1', index: 1, label: 'Road 1 Lane 1', heading: 'south', from: 'north' },
  { id: 'r1l2', road: 'r1', index: 2, label: 'Road 1 Lane 2', heading: 'north', from: 'south' },
  { id: 'r2l1', road: 'r2', index: 1, label: 'Road 2 Lane 1', heading: 'east', from: 'west' },
  { id: 'r2l2', road: 'r2', index: 2, label: 'Road 2 Lane 2', heading: 'west', from: 'east' },
].map((lane) => ({ ...lane, direction: HEADINGS[lane.heading].label, turns: { left: 0.2, right: 0.2 } }))

export const LANE_BY_ID = Object.fromEntries(LANES.map((lane) => [lane.id, lane]))

// A phase is the set of lanes that share green. Each approach gets green on
// its own, in turn clockwise from the north: North, East, South, West.
// Only one approach moves at a time, so nothing crosses its path and every
// car that sees green can go. Order matches the board's approach numbers.
const APPROACH_ORDER = ['north', 'east', 'south', 'west']
export const PHASES = APPROACH_ORDER.map((from, index) => {
  const lane = LANES.find((item) => item.from === from)
  return { id: `p${index + 1}`, road: lane.road, name: lane.label, from, directions: lane.direction.toLowerCase(), lanes: [lane.id] }
})

// Each car type arrives on its own rhythm (seconds between arrivals, spaced
// so signals serving one approach at a time keep up) and drives at its own
// cruising speed (m/s): roughly 20-28 km/h, town traffic.
export const CAR_TYPES = {
  sedan: { label: 'Sedan', every: [10, 22], speed: 6.5 },
  hatchback: { label: 'Hatchback', every: [12, 28], speed: 6.2 },
  compact: { label: 'Compact', every: [18, 36], speed: 5.8 },
  suv: { label: 'SUV', every: [21, 40], speed: 6.2 },
  wagon: { label: 'Wagon', every: [26, 46], speed: 6.2 },
  minivan: { label: 'Minivan', every: [28, 51], speed: 5.5 },
  pickup: { label: 'Pickup', every: [30, 56], speed: 5.8 },
  coupe: { label: 'Coupe', every: [36, 62], speed: 7.2 },
  offroad: { label: 'Off-roader', every: [40, 72], speed: 5.5 },
  sport: { label: 'Sports car', every: [51, 90], speed: 7.8 },
}

export const CAR_LENGTH = {
  compact: 3.26,
  coupe: 4.24,
  hatchback: 3.96,
  minivan: 4.61,
  offroad: 3.94,
  pickup: 5.18,
  sedan: 4.36,
  sport: 3.91,
  suv: 4.61,
  wagon: 4.38,
}

// Default controller settings. Names follow the algorithm write-up.
export const DEFAULT_TIMING = {
  gMin: 10,
  gMax: 60,
  yellow: 3,
  allRed: 1.5,
  gapThreshold: 2.5,
  extendStep: 3,
  wMax: 120,
  switchThreshold: 5,
  startupLoss: 2,
  dischargeRate: 0.55,
  horizon: 10,
  lambda: 0.5,
  alpha: 1,
  beta: 0.12,
  gamma: 3,
  a: 1,
  b: 0.6,
  c: 4,
}
