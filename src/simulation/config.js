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
export const TURN_SPEED = 5 // m/s through a turn

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

// A phase is a set of lanes that share green: both directions of one road
// (§2, phases 1 and 2). Left turns are permissive and give way to oncoming
// traffic, so the conflicting turn phases are not needed.
export const PHASES = [
  { id: 'p1', road: 'r1', name: 'Road 1', directions: 'north and south', lanes: ['r1l1', 'r1l2'] },
  { id: 'p2', road: 'r2', name: 'Road 2', directions: 'east and west', lanes: ['r2l1', 'r2l2'] },
]

// Each car type arrives on its own rhythm (seconds between arrivals) and
// drives at its own cruising speed.
export const CAR_TYPES = {
  sedan: { label: 'Sedan', every: [7, 15], speed: 10 },
  hatchback: { label: 'Hatchback', every: [8, 19], speed: 9.5 },
  compact: { label: 'Compact', every: [12, 24], speed: 9 },
  suv: { label: 'SUV', every: [14, 27], speed: 9.5 },
  wagon: { label: 'Wagon', every: [17, 31], speed: 9.5 },
  minivan: { label: 'Minivan', every: [19, 34], speed: 8.5 },
  pickup: { label: 'Pickup', every: [20, 37], speed: 9 },
  coupe: { label: 'Coupe', every: [24, 41], speed: 11 },
  offroad: { label: 'Off-roader', every: [27, 48], speed: 8.5 },
  sport: { label: 'Sports car', every: [34, 60], speed: 12 },
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
  gMin: 8,
  gMax: 45,
  yellow: 3,
  allRed: 1.5,
  gapThreshold: 2.5,
  extendStep: 3,
  wMax: 90,
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
