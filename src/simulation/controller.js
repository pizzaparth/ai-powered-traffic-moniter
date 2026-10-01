import { PHASES } from './config.js'

// Adaptive signal controller: max-pressure phase selection with dynamic green
// extension, gap-out, arrival prediction, min/max green and starvation
// protection. Section numbers refer to the algorithm write-up in plan.md.

const DECISION_INTERVAL = 0.5
const PLATOON_SIZE = 2
const STARVATION_BONUS = 1000
const UTILIZATION_WINDOW = 5

const round = (value, digits = 1) => Number(value.toFixed(digits))

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
    this.extendedUntil = 0
    this.latestScores = null
    this.now = 0
  }

  setTiming(timing) {
    this.timing = timing
  }

  // §12 Green -> Yellow -> All red -> Green.
  update(dt, now, sense) {
    this.now = now
    this.modeTime += dt
    const t = this.timing

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
        oldestWait: round(oldestWait),
        starved,
        cars,
        arriving,
      }
    })
  }

  // §14: enough green to clear the longest predicted lane queue.
  requiredGreen(phaseScore) {
    const t = this.timing
    const required = t.startupLoss + phaseScore.predicted / t.dischargeRate
    return Math.min(t.gMax, Math.max(t.gMin, required))
  }

  // §18 decision flow, run every half second while a phase is green.
  decide(sense) {
    const t = this.timing
    const scores = this.score(sense)
    this.latestScores = scores
    const current = scores[this.phase]
    const other = scores[1 - this.phase]
    const name = PHASES[this.phase].name
    const otherName = PHASES[1 - this.phase].name

    // §7 Minimum green.
    if (this.greenTime < t.gMin) return

    // Nobody is waiting elsewhere: rest on green instead of cycling.
    if (other.cars === 0) {
      if (this.planned - this.greenTime < 1) this.planned = this.greenTime + t.extendStep
      if (!this.holding) {
        this.holding = true
        this.log('algorithm', 'hold', `${name} stays green. No cars on ${otherName}.`)
      }
      return
    }
    this.holding = false

    // §11 Starvation protection.
    if (other.starved) {
      return this.beginSwitch(`${otherName} waited ${Math.round(other.oldestWait)} s, over the ${t.wMax} s limit.`, scores)
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

    // §6 + §13: cut the green short only for a clearly better phase whose
    // benefit outweighs the time lost to yellow and all-red.
    if (other.score > current.score + t.switchThreshold && benefit > switchCost) {
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
    this.nextPhase = 1 - this.phase
    this.nextEstimate = this.requiredGreen(scores[this.nextPhase])
    this.lastGreenAt[this.phase] = this.now
    this.mode = 'yellow'
    this.modeTime = 0
    this.holding = false
    this.log('algorithm', 'switch', `${PHASES[this.phase].name} to yellow. ${reason}`, { scores })
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
      `${PHASES[index].name} green both ways (${PHASES[index].directions}) for ${Math.round(this.planned)} s. ${waiting} ${waiting === 1 ? 'car' : 'cars'} waiting.`,
      { scores },
    )
  }

  signalFor(phaseIndex) {
    if (phaseIndex !== this.phase) return 'red'
    if (this.mode === 'green') return 'green'
    if (this.mode === 'yellow') return 'yellow'
    return 'red'
  }

  // Seconds until this phase's signal changes, for the countdown boards.
  countdown(phaseIndex) {
    const t = this.timing
    const greenLeft = Math.max(0, this.planned - this.greenTime)
    if (phaseIndex === this.phase) {
      if (this.mode === 'green') return greenLeft
      if (this.mode === 'yellow') return t.yellow - this.modeTime
      // All red after this phase: wait for the other phase to run.
      return t.allRed - this.modeTime + this.nextEstimate + t.yellow + t.allRed
    }
    if (this.mode === 'green') return greenLeft + t.yellow + t.allRed
    if (this.mode === 'yellow') return t.yellow - this.modeTime + t.allRed
    return t.allRed - this.modeTime
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
