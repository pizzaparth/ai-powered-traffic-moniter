import {
  BRAKE,
  CAR_LENGTH,
  CAR_TYPES,
  LANES,
  LANE_BY_ID,
  LANE_CAP,
  MIN_GAP,
  PHASES,
  TURN_SPEED,
} from './config.js'
import { CONFLICTS, ROUTES } from './routes.js'
import { AdaptiveController } from './controller.js'

// Constant-speed traffic with braking: a car drives at its cruising speed
// unless something ahead (a car, a red light, a turn) forces it to slow. The
// speed cap sqrt(2·b·gap) guarantees it can always stop before that thing.

const PHASE_OF_LANE = Object.fromEntries(PHASES.flatMap((phase, index) => phase.lanes.map((id) => [id, index])))
const QUEUE_SPEED = 1 // below this a car counts as queued (m/s)
const ARRIVAL_TAU = 30 // seconds of history in the arrival-rate estimate
const ENTRY_CLEARANCE = 1 // free space needed at the lane entrance to spawn
const ARRIVING_WINDOW = 4 // seconds to the stop line that counts as arriving (platoons)
const GIVE_WAY_WINDOW = 3.5 // a left turn waits for oncoming cars this close in time
const GIVE_WAY_DISTANCE = 6 // ...or this close to their stop line

const random = (min, max) => min + Math.random() * (max - min)
const typeKeys = Object.keys(CAR_TYPES)

export class SimulationEngine {
  constructor({ timing, log }) {
    this.time = 0
    // Every entry carries the simulation clock.
    this.log = (source, kind, message, detail) => log({ time: this.time, source, kind, message, detail })
    this.cars = new Map()
    this.nextId = 1
    this.autoSpawn = true
    this.pending = Object.fromEntries(LANES.map((lane) => [lane.id, []]))
    this.arrivalRate = Object.fromEntries(LANES.map((lane) => [lane.id, 0]))
    this.metrics = { spawned: 0, crossed: 0, finished: 0, totalWait: 0 }
    this.nextArrival = Object.fromEntries(typeKeys.map((type) => [type, random(...CAR_TYPES[type].every) * 0.5]))
    this.listeners = new Set()
    this.controller = new AdaptiveController(timing, this.log)
    this.controller.startGreen(0, this.sense())
  }

  onCarsChange(listener) {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  emitCarsChange() {
    for (const listener of this.listeners) listener()
  }

  laneCount(laneId) {
    let count = this.pending[laneId].length
    for (const car of this.cars.values()) if (car.lane === laneId && car.s < car.route.stopS) count++
    return count
  }

  // A user (or the auto spawner) asks for a car in a lane.
  requestCar(laneId, { source = 'user', type } = {}) {
    const lane = LANE_BY_ID[laneId]
    if (this.laneCount(laneId) >= LANE_CAP) {
      if (source === 'user') this.log('user', 'rejected', `${lane.label} is full. The cap is ${LANE_CAP} cars.`)
      return false
    }
    const carType = type ?? typeKeys[Math.floor(Math.random() * typeKeys.length)]
    const roll = Math.random()
    const movement = roll < lane.turns.left ? 'left' : roll < lane.turns.left + lane.turns.right ? 'right' : 'straight'
    this.pending[laneId].push({ type: carType, movement, source })
    this.arrivalRate[laneId] += 1 / ARRIVAL_TAU
    if (source === 'user') {
      const turn = movement === 'straight' ? 'going straight' : `turning ${movement}`
      const label = carType === 'suv' ? 'SUV' : CAR_TYPES[carType].label.toLowerCase()
      const article = /^(suv|[aeiou])/i.test(label) ? 'an' : 'a'
      this.log('user', 'spawn', `Added ${article} ${label} to ${lane.label}, ${turn}.`)
    }
    return true
  }

  // Each car type keeps its own arrival clock, so different types show up
  // at different times and at different intervals.
  autoArrivals() {
    for (const type of typeKeys) {
      if (this.time < this.nextArrival[type]) continue
      this.nextArrival[type] = this.time + random(...CAR_TYPES[type].every)
      const open = LANES.filter((lane) => this.laneCount(lane.id) < LANE_CAP)
      if (!open.length) continue
      const lane = open[Math.floor(Math.random() * open.length)]
      this.requestCar(lane.id, { source: 'auto', type })
    }
  }

  releasePending() {
    let changed = false
    for (const lane of LANES) {
      const queue = this.pending[lane.id]
      if (!queue.length) continue
      const next = queue[0]
      const route = ROUTES[`${lane.id}:${next.movement}`]
      const length = CAR_LENGTH[next.type]
      // Space at the entrance: the rearmost car in this lane must be clear.
      let rearmost = Infinity
      for (const car of this.cars.values()) {
        if (car.lane === lane.id && car.s < route.stopS) rearmost = Math.min(rearmost, car.s - car.length / 2)
      }
      if (rearmost < length + MIN_GAP + ENTRY_CLEARANCE) continue
      queue.shift()
      const id = this.nextId++
      const cruise = CAR_TYPES[next.type].speed * random(0.94, 1.06)
      this.cars.set(id, {
        id,
        type: next.type,
        lane: lane.id,
        road: lane.road,
        phase: PHASE_OF_LANE[lane.id],
        route,
        length,
        s: length / 2,
        v: Math.min(cruise, Math.sqrt(2 * BRAKE * Math.max(0, rearmost - length - MIN_GAP))),
        cruise,
        committed: false,
        crossed: false,
        wait: 0,
        born: this.time,
      })
      this.metrics.spawned++
      changed = true
    }
    return changed
  }

  segmentOf(car) {
    const { segments } = car.route
    for (let i = segments.length - 1; i >= 0; i--) if (car.s >= segments[i].start) return i
    return 0
  }

  // Cars grouped by the strip of road they are on, with local positions.
  occupancy() {
    const bySegment = new Map()
    for (const car of this.cars.values()) {
      const index = this.segmentOf(car)
      const segment = car.route.segments[index]
      car.segmentIndex = index
      const entry = { car, local: car.s - segment.start }
      if (!bySegment.has(segment.id)) bySegment.set(segment.id, [])
      bySegment.get(segment.id).push(entry)
      // Connectors leaving the same lane start on top of each other, so a car
      // going straight must also follow a car turning off ahead of it.
      if (segment.kind === 'connector') {
        const key = `lane:${car.lane}`
        if (!bySegment.has(key)) bySegment.set(key, [])
        bySegment.get(key).push(entry)
      }
    }
    return bySegment
  }

  // Distance from this car's front bumper to the rear bumper of the next car
  // on its own path, looking across segment boundaries.
  gapAhead(car, bySegment) {
    const { segments } = car.route
    for (let i = car.segmentIndex; i < segments.length; i++) {
      const segment = segments[i]
      const list = bySegment.get(segment.kind === 'connector' ? `lane:${car.lane}` : segment.id)
      if (!list) continue
      const myLocal = car.s - segment.start
      let best = Infinity
      for (const { car: other, local } of list) {
        if (other === car) continue
        const ahead = local - myLocal
        if (ahead > 0 || (ahead === 0 && other.id < car.id)) best = Math.min(best, ahead - other.length / 2)
      }
      if (best < Infinity) return best - car.length / 2
    }
    return Infinity
  }

  // Inside the junction, or committed to entering it.
  occupiesJunction(car) {
    return car.committed && car.s - car.length / 2 < car.route.segments[2].start
  }

  // Some car is still inside the junction (or committed to entering it).
  junctionBusy() {
    for (const car of this.cars.values()) if (this.occupiesJunction(car)) return true
    return false
  }

  // No car in the junction is on a path that crosses or merges with ours.
  pathClearFor(car) {
    const conflicts = CONFLICTS[car.route.id]
    for (const other of this.cars.values()) {
      if (other !== car && conflicts.has(other.route.id) && this.occupiesJunction(other)) return false
    }
    return true
  }

  // Room on the exit for the whole car.
  exitClearFor(car, bySegment) {
    const onExit = bySegment.get(car.route.segments[2].id)
    if (onExit) for (const { car: other, local } of onExit) if (local - other.length / 2 < car.length + MIN_GAP) return false
    return true
  }

  // Left turns are permissive: they give way to oncoming cars (going
  // straight or turning right) that are about to cross their path.
  mustGiveWay(car) {
    if (car.route.movement !== 'left') return false
    const conflicts = CONFLICTS[car.route.id]
    for (const other of this.cars.values()) {
      if (other.committed || other.route.movement === 'left' || other.lane === car.lane) continue
      if (!conflicts.has(other.route.id) || this.controller.signalFor(other.phase) !== 'green') continue
      const toStop = other.route.stopS - (other.s + other.length / 2)
      if (toStop < 0) continue
      if (toStop < GIVE_WAY_DISTANCE || (other.v > QUEUE_SPEED && toStop / other.v < GIVE_WAY_WINDOW)) return true
    }
    return false
  }

  sense() {
    const result = {}
    for (const lane of LANES) {
      result[lane.id] = { cars: this.pending[lane.id].length, queue: 0, oldestWait: 0, downstream: 0, arrivingSoon: 0, arrivalRate: this.arrivalRate[lane.id] }
    }
    for (const car of this.cars.values()) {
      const lane = result[car.lane]
      if (car.s < car.route.stopS) {
        lane.cars++
        if (car.v < QUEUE_SPEED) lane.queue++
        lane.oldestWait = Math.max(lane.oldestWait, car.wait)
        const distance = car.route.stopS - (car.s + car.length / 2)
        if (car.v >= QUEUE_SPEED && distance / car.v < ARRIVING_WINDOW) lane.arrivingSoon++
      } else if (car.s >= car.route.segments[2].start) {
        // Cars already past the junction count against the lane whose
        // straight-ahead exit they are on.
        for (const lane of LANES) if (lane.heading === car.route.exitHeading) result[lane.id].downstream++
      }
    }
    return result
  }

  step(dt) {
    this.time += dt
    if (this.autoSpawn) this.autoArrivals()
    let changed = this.releasePending()

    for (const laneId of Object.keys(this.arrivalRate)) this.arrivalRate[laneId] *= Math.exp(-dt / ARRIVAL_TAU)

    const bySegment = this.occupancy()
    const controller = this.controller

    for (const car of this.cars.values()) {
      const { route } = car
      const front = car.s + car.length / 2
      let limit = car.cruise

      // Slow for the turn, then hold turning speed through it.
      if (route.movement !== 'straight') {
        const toTurn = route.stopS - front
        if (car.segmentIndex === 1) limit = Math.min(limit, TURN_SPEED)
        else if (car.segmentIndex === 0) limit = Math.min(limit, Math.sqrt(TURN_SPEED ** 2 + 2 * BRAKE * Math.max(0, toTurn)))
      }

      const gap = this.gapAhead(car, bySegment) - MIN_GAP
      limit = Math.min(limit, Math.sqrt(2 * BRAKE * Math.max(0, gap)))

      // Stop line: commit only when it is the last moment to decide.
      let stopRoom = Infinity
      if (!car.committed && car.segmentIndex === 0) {
        const toStop = route.stopS - front
        const brakingDistance = (car.v * car.v) / (2 * BRAKE)
        if (toStop <= brakingDistance + 2) {
          const signal = controller.signalFor(car.phase)
          const cannotStop = toStop < brakingDistance
          // A left turn that has been waiting at the line for a gap clears
          // out on yellow, as drivers do once oncoming traffic stops, but
          // only while there is time to leave the junction before the other
          // road gets green. Otherwise it waits for the next green.
          const clearTime = (route.segments[1].length + car.length) / TURN_SPEED
          const waitingToTurn =
            route.movement === 'left' && car.v < QUEUE_SPEED && toStop < 1.5 && clearTime <= controller.timeToNextGreen()
          const allowed = signal === 'green' || (signal === 'yellow' && (cannotStop || waitingToTurn))
          if (allowed && !this.mustGiveWay(car) && this.pathClearFor(car) && this.exitClearFor(car, bySegment)) {
            car.committed = true
          }
        }
        if (!car.committed) {
          stopRoom = Math.max(0, toStop - 0.3)
          limit = Math.min(limit, Math.sqrt(2 * BRAKE * stopRoom))
        }
      }

      car.v = Math.max(0, limit)
      const travel = Math.min(car.v * dt, Math.max(0, gap), stopRoom)
      car.s += travel

      if (car.segmentIndex === 0 && car.v < QUEUE_SPEED) car.wait += dt
      if (!car.crossed && car.s + car.length / 2 >= route.stopS) {
        car.crossed = true
        this.metrics.crossed++
        this.metrics.totalWait += car.wait
        controller.recordCrossing(car.phase, this.time)
      }
    }

    for (const car of this.cars.values()) {
      if (car.s - car.length / 2 >= car.route.total) {
        this.cars.delete(car.id)
        this.metrics.finished++
        changed = true
      }
    }

    controller.update(dt, this.time, this.sense(), this.junctionBusy())
    if (changed) this.emitCarsChange()
  }

  // World transform of a car for rendering.
  pose(car, position, tangent) {
    const u = Math.min(1, Math.max(0, car.s / car.route.total))
    // CurvePath.getPoint is already parametrised by arc length.
    car.route.path.getPoint(u, position)
    car.route.path.getTangent(u, tangent)
    return Math.atan2(tangent.x, tangent.z)
  }

  laneView() {
    const sense = this.sense()
    return LANES.map((lane) => {
      const phase = PHASE_OF_LANE[lane.id]
      return {
        id: lane.id,
        label: lane.label,
        count: this.laneCount(lane.id),
        queue: sense[lane.id].queue,
        oldestWait: sense[lane.id].oldestWait,
        signal: this.controller.signalFor(phase),
        countdown: this.controller.countdown(phase),
      }
    })
  }

  reset() {
    this.cars.clear()
    for (const lane of LANES) this.pending[lane.id] = []
    this.emitCarsChange()
  }
}
