import { useMemo } from 'react'
import * as THREE from 'three'
import { ARM, ARM_TILES, HALF, HEADINGS, LANES, LANE_WIDTH, ROAD_Y, SIDEWALK_HEIGHT, TILE } from '../config.js'
import { lanePoint } from '../routes.js'

const PAINT = '#f4f4f4'
const BLOCK = '#e9e9e7'
const BASE = '#d4d4d2'
const TILE_BOTTOM = -1.02
const EXTENT = HALF + ARM

// Yaw that turns a marking drawn toward -z to face the travel direction.
const travelYaw = (heading) => Math.atan2(-HEADINGS[heading].x, -HEADINGS[heading].z)

function Paint({ position, rotation = 0, size }) {
  return (
    <mesh position={position} rotation={[-Math.PI / 2, 0, rotation]} receiveShadow>
      <planeGeometry args={size} />
      <meshStandardMaterial color={PAINT} roughness={0.8} />
    </mesh>
  )
}

function triangle(width, length) {
  const shape = new THREE.Shape()
  shape.moveTo(-width / 2, 0)
  shape.lineTo(width / 2, 0)
  shape.lineTo(0, length)
  shape.closePath()
  return new THREE.ShapeGeometry(shape)
}

// Painted lane arrow, drawn pointing +y in its own plane: straight ahead
// with a branch to each side, since every lane may turn either way.
function LaneArrow() {
  const head = useMemo(() => triangle(1.1, 1.3), [])
  return (
    <group rotation-x={-Math.PI / 2}>
      <mesh position={[0, 1.2, 0]}>
        <planeGeometry args={[0.32, 2.4]} />
        <meshStandardMaterial color={PAINT} />
      </mesh>
      <mesh geometry={head} position={[0, 2.4, 0]}>
        <meshStandardMaterial color={PAINT} />
      </mesh>
      {[-1, 1].map((side) => (
        <group key={side} position={[0, 0.9, 0]} rotation-z={side * -0.9}>
          <mesh position={[0, 0.7, 0]}>
            <planeGeometry args={[0.32, 1.4]} />
            <meshStandardMaterial color={PAINT} />
          </mesh>
          <mesh geometry={head} position={[0, 1.4, 0]} scale={0.8}>
            <meshStandardMaterial color={PAINT} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

function LaneMarkings() {
  return (
    <group position-y={ROAD_Y + 0.01}>
      {LANES.map((lane) => {
        const stop = lanePoint(lane.heading, -HALF - 0.35)
        const arrow = lanePoint(lane.heading, -HALF - 7)
        const acrossX = HEADINGS[lane.heading].x === 0
        return (
          <group key={lane.id}>
            {/* Stop line across the approach lane, just before the crossing. */}
            <Paint position={[stop.x, 0, stop.z]} rotation={acrossX ? 0 : Math.PI / 2} size={[LANE_WIDTH, 0.45]} />
            <group position={[arrow.x, 0, arrow.z]} rotation-y={travelYaw(lane.heading)}>
              <LaneArrow />
            </group>
          </group>
        )
      })}
    </group>
  )
}

// The whole junction sits on a block like an architectural model: road
// tiles in a "+", raised city blocks in the corners, and a base underneath.
export default function Junction({ tiles }) {
  const pieces = useMemo(() => {
    const list = [{ key: 'junction', object: tiles.junction.clone(), position: [0, 0, 0], yaw: 0 }]
    for (let i = 0; i < ARM_TILES; i++) {
      const d = HALF + TILE / 2 + i * TILE
      list.push({ key: `e${i}`, object: tiles.straight.clone(), position: [d, 0, 0], yaw: 0 })
      list.push({ key: `w${i}`, object: tiles.straight.clone(), position: [-d, 0, 0], yaw: 0 })
      list.push({ key: `n${i}`, object: tiles.straight.clone(), position: [0, 0, -d], yaw: Math.PI / 2 })
      list.push({ key: `s${i}`, object: tiles.straight.clone(), position: [0, 0, d], yaw: Math.PI / 2 })
    }
    return list
  }, [tiles])

  const blockSize = ARM
  const blockHeight = SIDEWALK_HEIGHT - TILE_BOTTOM
  const blockCenter = HALF + ARM / 2

  return (
    <group>
      {pieces.map((piece) => (
        <primitive key={piece.key} object={piece.object} position={piece.position} rotation-y={piece.yaw} />
      ))}

      {[
        [1, 1],
        [1, -1],
        [-1, 1],
        [-1, -1],
      ].map(([sx, sz]) => (
        <mesh
          key={`${sx}${sz}`}
          position={[sx * blockCenter, TILE_BOTTOM + blockHeight / 2, sz * blockCenter]}
          receiveShadow
          castShadow
        >
          <boxGeometry args={[blockSize, blockHeight, blockSize]} />
          <meshStandardMaterial color={BLOCK} roughness={0.95} />
        </mesh>
      ))}

      <mesh position={[0, TILE_BOTTOM - 0.6, 0]} receiveShadow>
        <boxGeometry args={[EXTENT * 2 + 2, 1.2, EXTENT * 2 + 2]} />
        <meshStandardMaterial color={BASE} roughness={1} />
      </mesh>

      <LaneMarkings />
    </group>
  )
}
