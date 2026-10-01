import * as THREE from 'three'

// The car pack ships every model in one scene, each car rotated at a random
// angle, with its wheels as loose siblings of the body. This turns it into one
// clean template per car: centred on the origin, wheels on y = 0, nose to +z.

// Cars whose wheelbase axis points backwards after alignment.
const FLIPPED = new Set(['hatchback', 'minivan', 'offroad', 'pickup', 'sedan', 'sport', 'suv', 'wagon'])

const keyOf = (name) => name.replace(/[\s_]*body$/i, '').toLowerCase()

export function buildCarLibrary(source) {
  source.updateMatrixWorld(true)

  const bodies = []
  const wheels = []
  source.traverse((node) => {
    if (/body$/i.test(node.name) && node.children.some((child) => child.isMesh)) bodies.push(node)
    else if (/^Wheel_/.test(node.name) && node.children.some((child) => child.isMesh)) wheels.push(node)
  })

  const centerOf = (node) => new THREE.Box3().setFromObject(node).getCenter(new THREE.Vector3())
  const bodyCenters = bodies.map(centerOf)
  const wheelsByBody = bodies.map(() => [])
  for (const wheel of wheels) {
    const center = centerOf(wheel)
    let best = 0
    let bestDistance = Infinity
    bodyCenters.forEach((bodyCenter, index) => {
      const distance = Math.hypot(bodyCenter.x - center.x, bodyCenter.z - center.z)
      if (distance < bestDistance) {
        bestDistance = distance
        best = index
      }
    })
    wheelsByBody[best].push({ node: wheel, center })
  }

  const library = {}
  bodies.forEach((body, index) => {
    const key = keyOf(body.name)
    const carWheels = wheelsByBody[index]
    const yaw = wheelbaseYaw(carWheels.map((wheel) => wheel.center)) + (FLIPPED.has(key) ? Math.PI : 0)

    // Copy each part with its baked world transform into one group.
    const parts = new THREE.Group()
    for (const node of [body, ...carWheels.map((wheel) => wheel.node)]) {
      const copy = node.clone(true)
      node.matrixWorld.decompose(copy.position, copy.quaternion, copy.scale)
      parts.add(copy)
    }

    const box = new THREE.Box3().setFromObject(parts, true)
    const center = box.getCenter(new THREE.Vector3())
    parts.position.set(-center.x, -box.min.y, -center.z)

    const aligned = new THREE.Group()
    aligned.add(parts)
    aligned.rotation.y = -yaw

    const car = new THREE.Group()
    car.name = key
    car.add(aligned)
    car.traverse((node) => {
      if (node.isMesh) {
        node.castShadow = true
        node.receiveShadow = false
      }
    })

    const size = new THREE.Box3().setFromObject(car, true).getSize(new THREE.Vector3())
    library[key] = { template: car, length: size.z, width: size.x, height: size.y }
  })
  return library
}

// Angle (around y) of the line joining front and rear wheels on one side.
// Of the six wheel-to-wheel distances, the two shortest are the axles and the
// two longest the diagonals; the middle two run along the wheelbase.
function wheelbaseYaw(points) {
  if (points.length < 4) return 0
  const pairs = []
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const dx = points[j].x - points[i].x
      const dz = points[j].z - points[i].z
      pairs.push({ dx, dz, length: Math.hypot(dx, dz) })
    }
  }
  pairs.sort((a, b) => a.length - b.length)
  const { dx, dz } = pairs[2]
  return Math.atan2(dx, dz)
}
