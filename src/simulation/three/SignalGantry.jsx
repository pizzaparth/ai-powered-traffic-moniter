import { useEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { GANTRY } from './assets.js'
import { simulation } from '../runtime.js'
import { SIDEWALK_HEIGHT } from '../config.js'

const SCALE = 0.022

const LAMP_COLORS = {
  red: { on: '#ff2a1f', off: '#3a0d0a' },
  amber: { on: '#ffae00', off: '#3a2804' },
  green: { on: '#16e05a', off: '#06301a' },
}
const BOARD_COLORS = { red: '#ff2a1f', yellow: '#ffae00', green: '#16e05a' }

// Countdown board: digits drawn into a canvas texture, redrawn only when the
// number or colour changes.
function createBoard() {
  const canvas = document.createElement('canvas')
  canvas.width = 160
  canvas.height = 128
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  let last = ''
  const draw = (value, color) => {
    const key = `${value}|${color}`
    if (key === last) return
    last = key
    const context = canvas.getContext('2d')
    context.fillStyle = '#050505'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.fillStyle = color
    context.font = '800 104px "Archivo Variable", "Helvetica Neue", Arial, sans-serif'
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.fillText(value, canvas.width / 2, canvas.height / 2 + 6)
    texture.needsUpdate = true
  }
  return { texture, draw }
}

// Soft round glow drawn around a lit lens, shared by every lamp.
let haloTexture = null
function getHaloTexture() {
  if (haloTexture) return haloTexture
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 64
  const context = canvas.getContext('2d')
  const glow = context.createRadialGradient(32, 32, 0, 32, 32, 32)
  glow.addColorStop(0, 'rgba(255,255,255,1)')
  glow.addColorStop(0.35, 'rgba(255,255,255,0.45)')
  glow.addColorStop(1, 'rgba(255,255,255,0)')
  context.fillStyle = glow
  context.fillRect(0, 0, 64, 64)
  haloTexture = new THREE.CanvasTexture(canvas)
  return haloTexture
}

// One three-lamp head. Like a real signal, exactly one lamp is lit at a
// time and the amber is steady, never flashing: green, then amber, then red.
function SignalHead({ x, phase }) {
  const lamps = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(LAMP_COLORS).map(([key, colors]) => [
          key,
          {
            lens: new THREE.MeshBasicMaterial({ color: colors.off, toneMapped: false }),
            halo: new THREE.MeshBasicMaterial({
              color: '#000000',
              map: getHaloTexture(),
              transparent: true,
              opacity: 0.85,
              blending: THREE.AdditiveBlending,
              depthWrite: false,
              toneMapped: false,
            }),
          },
        ]),
      ),
    [],
  )
  useEffect(
    () => () => {
      for (const lamp of Object.values(lamps)) {
        lamp.lens.dispose()
        lamp.halo.dispose()
      }
    },
    [lamps],
  )

  useFrame(() => {
    const signal = simulation.engine.controller.signalFor(phase)
    const lit = { red: signal === 'red', amber: signal === 'yellow', green: signal === 'green' }
    for (const key of Object.keys(LAMP_COLORS)) {
      lamps[key].lens.color.set(lit[key] ? LAMP_COLORS[key].on : LAMP_COLORS[key].off)
      // Additive blending: a black halo adds nothing, so an unlit lamp has no glow.
      lamps[key].halo.color.set(lit[key] ? LAMP_COLORS[key].on : '#000000')
    }
  })

  return Object.keys(LAMP_COLORS).map((key) => (
    <group key={key} position={[x, GANTRY.lampY[key], GANTRY.lampZ]}>
      <mesh material={lamps[key].lens}>
        <circleGeometry args={[GANTRY.lampRadius, 32]} />
      </mesh>
      <mesh position-z={0.6} material={lamps[key].halo}>
        <planeGeometry args={[GANTRY.lampRadius * 4, GANTRY.lampRadius * 4]} />
      </mesh>
    </group>
  ))
}

// Countdown board hanging from the arm beside a signal head.
function CountdownBoard({ x, phase }) {
  const board = useMemo(() => createBoard(), [])
  useEffect(() => () => board.texture.dispose(), [board])

  useFrame(() => {
    const controller = simulation.engine.controller
    const left = controller.countdown(phase)
    // Blank while the junction is empty and no change is coming.
    const text = left === null ? '' : String(Math.min(99, Math.max(0, Math.ceil(left))))
    board.draw(text, BOARD_COLORS[controller.signalFor(phase)])
  })

  return (
    <group>
      <mesh position={[x, GANTRY.armY - 15, 12]} castShadow>
        <cylinderGeometry args={[1.2, 1.2, 30, 8]} />
        <meshStandardMaterial color="#2b2b2b" metalness={0.6} roughness={0.5} />
      </mesh>
      <mesh position={[x, GANTRY.lampY.amber, 12]} castShadow>
        <boxGeometry args={[40, 32, 8]} />
        <meshStandardMaterial color="#111111" roughness={0.6} />
      </mesh>
      <mesh position={[x, GANTRY.lampY.amber, 16.2]}>
        <planeGeometry args={[36, 28.8]} />
        <meshBasicMaterial map={board.texture} toneMapped={false} />
      </mesh>
    </group>
  )
}

// Places the gantry so its pole stands at `pole` (x, z). `yaw` turns the
// model so its head (which faces the model's +z) look at oncoming traffic.
export default function SignalGantry({ template, pole, yaw, phase }) {
  const model = useMemo(() => template.clone(), [template])
  const position = useMemo(() => {
    const offset = new THREE.Vector3(GANTRY.poleX * SCALE, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw)
    return [pole[0] - offset.x, SIDEWALK_HEIGHT - GANTRY.baseY * SCALE, pole[1] - offset.z]
  }, [pole, yaw])

  return (
    <group position={position} rotation-y={yaw} scale={SCALE}>
      <primitive object={model} />
      {/* One head per approach lane, hanging over that lane, with its countdown board beside it. */}
      <SignalHead x={GANTRY.head} phase={phase} />
      <CountdownBoard x={GANTRY.boardX} phase={phase} />
    </group>
  )
}
