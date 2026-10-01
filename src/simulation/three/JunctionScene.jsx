import { Suspense, useEffect, useMemo } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { CameraControls, Environment, Lightformer, useGLTF } from '@react-three/drei'
import { CARS_URL, LIGHT_URL, ROAD_URL, buildGantry, buildRoadTiles } from './assets.js'
import { buildCarLibrary } from './carLibrary.js'
import Junction from './Junction.jsx'
import SignalGantry from './SignalGantry.jsx'
import Traffic from './Traffic.jsx'
import { simulation } from '../runtime.js'
import { HALF, HEADINGS, LANES, PHASES } from '../config.js'
import { lanePoint } from '../routes.js'
import { HOME_VIEW } from './views.js'


// One gantry per approach, on the kerb to the driver's right just before
// the stop line, its arm reaching across the road toward the centre line.
const KERB = 2.4 // from the lane centre to the pole
const GANTRIES = LANES.map((lane) => {
  const heading = HEADINGS[lane.heading]
  const base = lanePoint(lane.heading, -HALF - 0.7)
  return {
    lane: lane.id,
    phase: PHASES.findIndex((phase) => phase.lanes.includes(lane.id)),
    pole: [base.x - heading.z * KERB, base.z + heading.x * KERB],
    // Heads face the model's +z; turn them toward oncoming traffic.
    yaw: Math.atan2(-heading.x, -heading.z),
  }
})

// While the view is open the render loop drives the simulation clock.
function Clock() {
  useEffect(() => simulation.attachRenderer(), [])
  useFrame((_, delta) => simulation.frame(delta), -1)
  return null
}

function World() {
  const road = useGLTF(ROAD_URL)
  const light = useGLTF(LIGHT_URL)
  const cars = useGLTF(CARS_URL)
  const tiles = useMemo(() => buildRoadTiles(road.scene), [road.scene])
  const gantry = useMemo(() => buildGantry(light.scene), [light.scene])
  const library = useMemo(() => buildCarLibrary(cars.scene), [cars.scene])

  return (
    <>
      <Junction tiles={tiles} />
      {GANTRIES.map((placement) => (
        <SignalGantry key={placement.lane} template={gantry} {...placement} />
      ))}
      <Traffic library={library} />
    </>
  )
}

export default function JunctionScene({ controlsRef }) {
  return (
    <Canvas
      shadows="percentage"
      dpr={[1, 2]}
      camera={{ position: HOME_VIEW.slice(0, 3), fov: 38, near: 0.5, far: 1000 }}
      gl={{ antialias: true }}
    >
      <color attach="background" args={['#ffffff']} />
      <Clock />
      <hemisphereLight args={['#ffffff', '#d9d9d9', 1.1]} />
      <directionalLight
        position={[45, 80, 30]}
        intensity={2.4}
        castShadow
        shadow-mapSize={[4096, 4096]}
        shadow-bias={-0.0004}
        shadow-camera-left={-80}
        shadow-camera-right={80}
        shadow-camera-top={80}
        shadow-camera-bottom={-80}
        shadow-camera-far={250}
      />
      <Environment resolution={256}>
        <Lightformer form="rect" intensity={2} position={[0, 30, 0]} rotation-x={Math.PI / 2} scale={[80, 80, 1]} />
        <Lightformer form="rect" intensity={1} position={[60, 10, 0]} rotation-y={-Math.PI / 2} scale={[60, 10, 1]} />
        <Lightformer form="rect" intensity={1} position={[-60, 10, 0]} rotation-y={Math.PI / 2} scale={[60, 10, 1]} />
      </Environment>
      <Suspense fallback={null}>
        <World />
      </Suspense>
      <CameraControls
        ref={(controls) => {
          if (controls && !controlsRef.current) controls.setTarget(...HOME_VIEW.slice(3), false)
          controlsRef.current = controls
        }}
        makeDefault
        minDistance={15}
        maxDistance={230}
        maxPolarAngle={Math.PI * 0.46}
        dollySpeed={0.6}
        smoothTime={0.2}
      />
    </Canvas>
  )
}

useGLTF.preload(ROAD_URL)
useGLTF.preload(LIGHT_URL)
useGLTF.preload(CARS_URL)
