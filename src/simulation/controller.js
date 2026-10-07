import { PHASES } from './config.js'

// Adaptive signal controller: each approach gets green on its own, in turn
// clockwise. Pressure scores decide how long a green runs and when to end it
// (dynamic extension, gap-out, arrival prediction, min/max green). Approaches
// with no cars are skipped, and a starved approach jumps the queue. Section
// numbers refer to the algorithm write-up in plan.md.

const DECISION_INTERVAL = 0.5
const PLATOON_SIZE = 2
const STARVATION_BONUS = 1000
const UTILIZATION_WINDOW = 5
// All red is held past its set time, up to this long, while a car from the
// road that just stopped is still inside the junction.
const MAX_CLEARANCE_HOLD = 4

const round = (value, digits = 1) => Number(value.toFixed(digits))
const COUNT = PHASES.length
// Phase indices after `from` in clockwise order, ending with `from` itself.
const rotationAfter = (from) => PHASES.map((_, k) => (from + 1 + k) % COUNT)

export class AdaptiveController {
  constructor(timing, log) {
    this.timing = timing
    this.log = log
    this.phase = 0
    this.mode = 'green'
    this.modeTime = 0
    this.greenTime = 0
    this.planned = timing.gMin
    this.nextPhase = 1
    this.nextEstimate = timing.gMin
    this.decisionClock = 0
    this.lastGreenAt = PHASES.map(() => 0)
    this.lastCrossingAt = PHASES.map(() => 0)
    this.crossings = [] // { time, phase }
    this.holding = false
    this.idle = false
    this.extendedUntil = 0
    this.latestScores = null
    this.now = 0
  }

  // §12 Green -> Yellow -> All red -> Green. `junctionBusy` is true while
  // any car is still inside the junction.
  update(dt, now, sense, junctionBusy = false) {
    this.now = now
    this.modeTime += dt
    const t = this.timing
    // Empty junction: no car anywhere, so no change is coming and the
    // countdown boards go blank.
    this.idle = this.mode === 'green' && Object.values(sense).every((lane) => lane.cars === 0)

    if (this.mode === 'green') {
      this.greenTime += dt
      this.decisionClock += dt
      if (this.decisionClock >= DECISION_INTERVAL) {
        this.decisionClock = 0
        this.decide(sense)
      }
    } else if (this.mode === 'yellow' && this.modeTime >= t.yellow) {
      this.mode = 'allRed'
      this.modeTime = 0
      this.log('algorithm', 'all-red', 'All signals red to clear the junction.')
    } else if (this.mode === 'allRed' && this.modeTime >= t.allRed) {
      // Like a real clearance-detecting controller, the next road gets green
      // only once the junction is empty, so nobody drives into a car still
      // turning across it.
      if (junctionBusy && this.modeTime < t.allRed + MAX_CLEARANCE_HOLD) return
      if (this.modeTime - t.allRed > DECISION_INTERVAL) {
        this.log('algorithm', 'clearance', `All red held ${(this.modeTime - t.allRed).toFixed(1)} s more until the junction cleared.`)
      }
      this.startGreen(this.nextPhase, sense)
    }
  }

  recordCrossing(phaseIndex, now) {
    this.lastCrossingAt[phaseIndex] = now
    this.crossings.push({ time: now, phase: phaseIndex })
    while (this.crossings.length && now - this.crossings[0].time > UTILIZATION_WINDOW) this.crossings.shift()
  }

  // §3–§5, §11, §15: score every phase from predicted queues, downstream
  // congestion, waiting time, arrivals and time since its last green.
  score(sense) {
    const t = this.timing
    return PHASES.map((phase, index) => {
      let pressure = 0
      let demand = 0
      let queue = 0
      let predicted = 0
      let longestQueue = 0
      let oldestWait = 0
      let cars = 0
      let arriving = 0
      for (const laneId of phase.lanes) {
        const lane = sense[laneId]
        const predictedQueue = lane.queue + lane.arrivalRate * t.horizon
        pressure += predictedQueue - t.lambda * lane.downstream
        demand += t.alpha * predictedQueue + t.beta * lane.oldestWait + t.gamma * lane.arrivalRate
        queue += lane.queue
        predicted = Math.max(predicted, predictedQueue)
        longestQueue = Math.max(longestQueue, lane.queue)
        oldestWait = Math.max(oldestWait, lane.oldestWait)
        cars += lane.cars
        arriving += lane.arrivingSoon
      }
      const active = index === this.phase && this.mode === 'green'
      const starvation = active ? 0 : (this.now - this.lastGreenAt[index]) / t.wMax
      const starved = oldestWait >= t.wMax
      const value = t.a * pressure + t.b * demand + t.c * starvation + (starved ? STARVATION_BONUS : 0)
      return {
        phase: index,
        pressure: round(pressure),
        demand: round(demand),
        starvation: round(starvation, 2),
        score: round(value),
        queue,
        predicted: round(predicted),
        longestQueue,
        oldestWait: round(oldestWait),
        starved,
        cars,
        arriving,
      }
    })
  }

  // §14: enough green to clear the longest lane queue. Only cars already
  // queued count: a green planned for forecast arrivals that never came
  // gapped out early and left the red countdowns running long. Cars that do
  // arrive extend the green instead (§8, §16).
  requiredGreen(phaseScore) {
    const t = this.timing
    const required = t.startupLoss + phaseScore.longestQueue / t.dischargeRate
    return Math.min(t.gMax, Math.max(t.gMin, required))
  }

  // Green seconds for one approach on its own, for hardware that runs each
  // approach in turn. Same §14 rule, clamped to the board's 5–60 s range.
  laneGreen(lane) {
    const t = this.timing
    const predicted = lane.queue + lane.arrivalRate * t.horizon
    const required = t.startupLoss + predicted / t.dischargeRate
    return Math.round(Math.min(Math.min(60, t.gMax), Math.max(Math.max(5, t.gMin), required)))
  }

  // The approach to serve next: a starved one first, otherwise the next one
  // clockwise that has cars waiting.
  pickNext(scores) {
    const waiting = rotationAfter(this.phase).filter((index) => index !== this.phase && scores[index].cars > 0)
    const starved = waiting.filter((index) => scores[index].starved)
    if (starved.length) return starved.reduce((a, b) => (scores[b].oldestWait > scores[a].oldestWait ? b : a))
    return waiting[0] ?? (this.phase + 1) % COUNT
  }

  // §18 decision flow, run every half second while a phase is green.
  decide(sense) {
    const t = this.timing
    const scores = this.score(sense)
    this.latestScores = scores
    const current = scores[this.phase]
    const waiting = scores.filter((score) => score.phase !== this.phase && score.cars > 0)
    const name = PHASES[this.phase].name

    // §7 Minimum green.
    if (this.greenTime < t.gMin) return

    // Nobody is waiting elsewhere: rest on green instead of cycling. Keep the
    // planned green long enough to clear this approach's queue so its
    // countdown stays meaningful.
    if (!waiting.length) {
      if (this.planned - this.greenTime < 1) {
        this.planned = this.greenTime + Math.max(t.extendStep, current.predicted / t.dischargeRate)
      }
      if (!this.holding) {
        this.holding = true
        this.log('algorithm', 'hold', `${name} stays green. No cars on the other approaches.`)
      }
      return
    }
    this.holding = false

    // §11 Starvation protection.
    const starved = waiting.find((score) => score.starved)
    if (starved) {
      return this.beginSwitch(
        `${PHASES[starved.phase].name} waited ${Math.round(starved.oldestWait)} s, over the ${t.wMax} s limit.`,
        scores,
      )
    }

    // §10 Maximum green.
    if (this.greenTime >= t.gMax) {
      return this.beginSwitch(`${name} reached the ${t.gMax} s maximum green.`, scores)
    }

    // §9 Gap-out: nobody crossed recently and nobody is about to.
    const gap = this.now - this.lastCrossingAt[this.phase]
    if (gap >= t.gapThreshold && current.arriving === 0) {
      return this.beginSwitch(`${name} gapped out. No car crossed for ${gap.toFixed(1)} s.`, scores)
    }

    // The strongest demand among the approaches that are waiting.
    const other = waiting.reduce((a, b) => (b.score > a.score ? b : a))
    const otherName = PHASES[other.phase].name
    const lostTime = t.yellow + t.allRed
    const recent = this.crossings.filter((crossing) => crossing.phase === this.phase).length
    const flow = recent / UTILIZATION_WINDOW
    const utilization = flow / (t.dischargeRate * PHASES[this.phase].lanes.length)
    const switchCost = lostTime * flow
    const benefit = other.score - current.score

    if (this.greenTime >= this.planned - DECISION_INTERVAL) {
      // §16 Platoon preservation.
      if (current.arriving >= PLATOON_SIZE && other.oldestWait < t.wMax * 0.75 && this.greenTime + t.extendStep <= t.gMax) {
        this.extend(`${current.arriving} cars arriving together on ${name}.`)
        return
      }
      // §8 Dynamic extension while the queue is still discharging well.
      if (utilization >= 0.6 && current.queue >= 3 && other.score < current.score * 1.5 && this.greenTime + t.extendStep <= t.gMax) {
        this.extend(`${name} still clearing ${current.queue} queued cars at ${Math.round(utilization * 100)}% use.`)
        return
      }
      if (this.greenTime >= this.planned) {
        return this.beginSwitch(`${name} served its planned ${Math.round(this.planned)} s green.`, scores)
      }
      return
    }

    // An extension just granted is honoured in full.
    if (this.greenTime < this.extendedUntil) return

    // §6 + §13: cut the green short only once this approach has no car
    // stopped or about to reach the line, when waiting demand is clearly
    // higher and the benefit outweighs the time lost to yellow and all-red.
    // With three approaches waiting, one nearly always scores higher, so
    // cutting a queue that is still moving would leave every green at the
    // minimum.
    if (current.queue === 0 && current.arriving === 0 && other.score > current.score + t.switchThreshold && benefit > switchCost) {
      this.beginSwitch(
        `${otherName} scores ${other.score} against ${current.score}. Benefit ${benefit.toFixed(1)} beats switch cost ${switchCost.toFixed(1)}.`,
        scores,
      )
    }
  }

  extend(reason) {
    this.planned = Math.min(this.timing.gMax, this.greenTime + this.timing.extendStep)
    this.extendedUntil = this.planned
    this.log('algorithm', 'extend', `Green extended by ${this.timing.extendStep} s. ${reason}`)
  }

  beginSwitch(reason, scores) {
    this.nextPhase = this.pickNext(scores)
    this.nextEstimate = this.requiredGreen(scores[this.nextPhase])
    this.lastGreenAt[this.phase] = this.now
    this.mode = 'yellow'
    this.modeTime = 0
    this.holding = false
    this.log('algorithm', 'switch', `${PHASES[this.phase].name} to yellow. ${PHASES[this.nextPhase].name} is next. ${reason}`, {
      scores,
    })
  }

  startGreen(index, sense) {
    const scores = this.score(sense)
    this.phase = index
    this.mode = 'green'
    this.modeTime = 0
    this.greenTime = 0
    this.extendedUntil = 0
    this.decisionClock = 0
    this.lastCrossingAt[index] = this.now
    this.planned = this.requiredGreen(scores[index])
    this.latestScores = scores
    const waiting = scores[index].queue
    this.log(
      'algorithm',
      'green',
      `${PHASES[index].name} green (${PHASES[index].directions}) for ${Math.round(this.planned)} s. ${waiting} ${waiting === 1 ? 'car' : 'cars'} waiting.`,
      { scores },
    )
  }

  // Seconds until the other road can get green: the rest of yellow plus the
  // all-red clearance. Zero while the current phase is green.
  timeToNextGreen() {
    const t = this.timing
    if (this.mode === 'yellow') return t.yellow - this.modeTime + t.allRed
    if (this.mode === 'allRed') return Math.max(0, t.allRed - this.modeTime)
    return 0
  }

  signalFor(phaseIndex) {
    if (phaseIndex !== this.phase) return 'red'
    if (this.mode === 'green') return 'green'
    if (this.mode === 'yellow') return 'yellow'
    return 'red'
  }

  // Seconds until this phase's signal changes, for the countdown boards, or
  // null while the junction is empty and no change is scheduled. Red
  // approaches add up every green due before theirs, in serving order.
  countdown(phaseIndex) {
    if (this.idle) return null
    const t = this.timing
    const lostTime = t.yellow + t.allRed
    let wait
    if (this.mode === 'green') {
      const greenLeft = Math.max(0, this.planned - this.greenTime)
      if (phaseIndex === this.phase) return greenLeft
      wait = greenLeft + lostTime
    } else if (this.mode === 'yellow') {
      if (phaseIndex === this.phase) return t.yellow - this.modeTime
      wait = t.yellow - this.modeTime + t.allRed
    } else {
      wait = Math.max(0, t.allRed - this.modeTime)
    }
    // Next green: already chosen once the change has begun.
    const first = this.mode === 'green' ? null : this.nextPhase
    const order = first === null ? rotationAfter(this.phase) : [first, ...rotationAfter(first).filter((index) => index !== first)]
    for (const index of order) {
      if (index === phaseIndex) return wait
      // Approaches with no cars are skipped, so they cost no time.
      if (index === first) wait += this.nextEstimate + lostTime
      else if (index !== this.phase && this.latestScores?.[index].cars > 0) {
        wait += this.requiredGreen(this.latestScores[index]) + lostTime
      }
    }
    return wait
  }

  snapshot() {
    return {
      phase: this.phase,
      mode: this.mode,
      greenTime: this.greenTime,
      planned: this.planned,
      holding: this.holding,
      scores: this.latestScores,
    }
  }
}
