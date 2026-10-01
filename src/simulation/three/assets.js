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
// Two signal heads hang from the arm: the first sits near the centre line,
// the second (nearer the pole) over the approach lane.
export const GANTRY = {
  poleX: 106.45,
  baseY: -257.33,
  heads: [-151.45, -6.65],
  lampY: { red: 187.3, amber: 171.5, green: 155.65 },
  lampRadius: 7.4,
  lampZ: 23.2,
  armY: 213.6,
}

// The model also carries two pedestrian signals: one on its own post, one
// strapped to the main pole. Drop every triangle that belongs to them.
// Raw vertex space: x across, y depth, z height.
const isPedestrianPart = (x, z) => x > 190 || (x > 75 && z < -95 && z > -160)

export function buildGantry(root) {
  const gantry = root.clone(true)
  gantry.traverse((child) => {
    if (!child.isMesh) return
    const geometry = child.geometry.clone()
    const position = geometry.attributes.position
    const index = geometry.index
    const keep = []
    for (let i = 0; i < index.count; i += 3) {
      const a = index.getX(i)
      const b = index.getX(i + 1)
      const c = index.getX(i + 2)
      const x = (position.getX(a) + position.getX(b) + position.getX(c)) / 3
      const z = (position.getZ(a) + position.getZ(b) + position.getZ(c)) / 3
      if (!isPedestrianPart(x, z)) keep.push(a, b, c)
    }
    geometry.setIndex(keep)
    child.geometry = geometry
    child.castShadow = true
  })
  return gantry
}
