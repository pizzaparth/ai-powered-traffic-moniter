import * as THREE from 'three'
import { TILE } from '../config.js'

export const ROAD_URL = '/main_road_builder.glb'
export const LIGHT_URL = '/main_traffic_light.glb'
export const CARS_URL = '/generic_passenger_car_pack.glb'

// Height of the asphalt in the road kit, in its own units.
const KIT_ASPHALT_Y = -0.1721

// The road kit holds four tiles side by side. Pull one out, centre it, put
// its asphalt at y = 0 and scale it so a tile is TILE metres wide.
function extractTile(root, name) {
  root.updateMatrixWorld(true)
  const node = root.getObjectByName(name)
  const copy = node.clone(true)
  node.matrixWorld.decompose(copy.position, copy.quaternion, copy.scale)

  const box = new THREE.Box3().setFromObject(copy, true)
  const center = box.getCenter(new THREE.Vector3())
  const inner = new THREE.Group()
  inner.add(copy)
  inner.position.set(-center.x, -KIT_ASPHALT_Y, -center.z)

  const tile = new THREE.Group()
  tile.add(inner)
  tile.scale.setScalar(TILE / (box.max.x - box.min.x))
  tile.traverse((child) => {
    if (child.isMesh) child.receiveShadow = true
  })
  return tile
}

export function buildRoadTiles(root) {
  return {
    // Two lanes with a dashed divider, running along x.
    straight: extractTile(root, 'Road_1'),
    // Four-way junction with crossings on every side.
    junction: extractTile(root, 'Road_2'),
  }
}

// Signal gantry geometry, in the model's own units (after its z-up fix).
// The model hangs two signal heads from its arm. Only the one nearer the
// pole is kept: it sits over the approach lane. The outer head hung over
// the opposite lane, which gave that lane a second, misleading signal.
export const GANTRY = {
  poleX: 106.45,
  baseY: -257.33,
  head: -6.65,
  lampY: { red: 187.3, amber: 171.5, green: 155.65 },
  lampRadius: 7.4,
  lampZ: 23.2,
  armY: 213.6,
  boardX: -38.65, // countdown board, just outside the head
  armEnd: -62, // arm cut back to end just past the board
}

// Raw vertex space: x across, y depth, z height.
// The model also carries two pedestrian signals: one on its own post, one
// strapped to the main pole.
const isPedestrianPart = (x, z) => x > 190 || (x > 75 && z < -95 && z > -160)
// The outer signal head and its bracket.
const OUTER_HEAD = { min: -185, max: -115 }

export function buildGantry(root) {
  const gantry = root.clone(true)
  gantry.traverse((child) => {
    if (!child.isMesh) return
    const geometry = child.geometry.clone()
    const position = geometry.attributes.position
    const index = geometry.index
    const keep = []
    for (let i = 0; i < index.count; i += 3) {
      const corners = [index.getX(i), index.getX(i + 1), index.getX(i + 2)]
      const xs = corners.map((vertex) => position.getX(vertex))
      const x = (xs[0] + xs[1] + xs[2]) / 3
      const z = corners.reduce((sum, vertex) => sum + position.getZ(vertex), 0) / 3
      if (isPedestrianPart(x, z)) continue
      if (Math.min(...xs) > OUTER_HEAD.min && Math.max(...xs) < OUTER_HEAD.max) continue
      keep.push(...corners)
    }
    geometry.setIndex(keep)
    // Only the arm reaches past the board now; pull its far end in.
    for (let i = 0; i < position.count; i++) {
      if (position.getX(i) < GANTRY.armEnd) position.setX(i, GANTRY.armEnd)
    }
    position.needsUpdate = true
    geometry.computeBoundingBox()
    geometry.computeBoundingSphere()
    child.geometry = geometry
    child.castShadow = true
  })
  return gantry
}
