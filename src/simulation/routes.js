import * as THREE from 'three'
import { ARM, HALF, HEADINGS, LANES, LANE_WIDTH } from './config.js'

// Every route is approach -> connector -> exit. Segments are shared by id, so
// cars from different routes that use the same strip of road see each other.

const v = (x, z) => new THREE.Vector3(x, 0, z)

// Right-hand traffic: a lane sits half a lane width to the right of the
// road's centre line. Right of heading (x, z) is (-z, x).
const rightOf = (heading) => ({ x: -heading.z, z: heading.x })
const leftOf = (heading) => ({ x: heading.z, z: -heading.x })
const headingKey = (vector) =>
  Object.keys(HEADINGS).find((key) => HEADINGS[key].x === vector.x && HEADINGS[key].z === vector.z)

const OFFSET = LANE_WIDTH / 2

// A point on the centre line of the lane travelling `heading`, `along`
// metres from the junction centre (negative before it, positive after).
export function lanePoint(heading, along) {
  const d = HEADINGS[heading]
  const r = rightOf(d)
  return v(r.x * OFFSET + d.x * along, r.z * OFFSET + d.z * along)
}

function buildRoute(lane, movement) {
  const from = lane.heading
  const to =
    movement === 'straight' ? from : headingKey(movement === 'right' ? rightOf(HEADINGS[from]) : leftOf(HEADINGS[from]))

  const start = lanePoint(from, -HALF - ARM)
  const stop = lanePoint(from, -HALF)
  const entry = lanePoint(to, HALF)
  const end = lanePoint(to, HALF + ARM)

  const approach = new THREE.LineCurve3(start, stop)
  // For turns, the control point is where the two lane centre lines cross,
  // which gives a smooth quarter-turn that stays inside both lanes.
  const connector =
    movement === 'straight'
      ? new THREE.LineCurve3(stop, entry)
      : new THREE.QuadraticBezierCurve3(stop, lanePoint(from, 0).add(lanePoint(to, 0)), entry)
  const exit = new THREE.LineCurve3(entry, end)

  const path = new THREE.CurvePath()
  path.add(approach)
  path.add(connector)
  path.add(exit)

  const lengths = [approach.getLength(), connector.getLength(), exit.getLength()]
  return {
    id: `${lane.id}:${movement}`,
    lane: lane.id,
    road: lane.road,
    movement,
    exitHeading: to,
    path,
    connector,
    segments: [
      { id: `in:${lane.id}`, kind: 'approach', start: 0, length: lengths[0] },
      { id: `x:${lane.id}:${movement}`, kind: 'connector', start: lengths[0], length: lengths[1] },
      { id: `out:${to}`, kind: 'exit', start: lengths[0] + lengths[1], length: lengths[2] },
    ],
    stopS: lengths[0],
    total: lengths[0] + lengths[1] + lengths[2],
  }
}

export const MOVEMENTS = ['straight', 'left', 'right']

export const ROUTES = {}
for (const lane of LANES) {
  for (const movement of MOVEMENTS) ROUTES[`${lane.id}:${movement}`] = buildRoute(lane, movement)
}

// Two connectors conflict when cars on them could touch: their centre lines
// come closer than a car's width plus a margin anywhere inside the junction
// (crossing paths, or paths merging into the same exit). Connectors from the
// same lane are left out; cars there simply follow each other.
const CLEARANCE = 2.8
const SAMPLES = 48

const samples = Object.fromEntries(
  Object.values(ROUTES).map((route) => [route.id, route.connector.getSpacedPoints(SAMPLES)]),
)

export const CONFLICTS = {}
for (const a of Object.values(ROUTES)) {
  CONFLICTS[a.id] = new Set()
  for (const b of Object.values(ROUTES)) {
    if (a.lane === b.lane) continue
    let close = false
    for (const p of samples[a.id]) {
      for (const q of samples[b.id]) {
        if (p.distanceTo(q) < CLEARANCE) {
          close = true
          break
        }
      }
      if (close) break
    }
    if (close) CONFLICTS[a.id].add(b.id)
  }
}
