import { useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { LAST_STAGE } from './stages.js'

const MODEL_URL = '/subway_traffic_light__gameready.glb'

// Model is ~198 units tall with its base at y=0. Lamp lenses sit on +z:
// green y<153, amber 153–174, red y>174 (object space).
const MODEL_SCALE = 0.02
const MODEL_CENTER_Y = 99
const LAMP_CENTER_Y = 163
const LAMP_OFFSET = (LAMP_CENTER_Y - MODEL_CENTER_Y) * MODEL_SCALE

const LAMP_INTENSITY = 2.4
const BLINK_STEPS_PER_SECOND = 4

const LAMP_COLORS = {
  red: new THREE.Color('#ff3b30'),
  amber: new THREE.Color('#ffb21a'),
  green: new THREE.Color('#22e07a'),
}

const TAU = Math.PI * 2

// Module-level so the per-frame writes stay outside React's render data.
// The page only ever shows one traffic light.
const uniforms = {
  uRed: { value: 0 },
  uAmber: { value: 0 },
  uGreen: { value: 0 },
  uBase: { value: 0.12 },
}

// Every stage keeps the same three-quarter yaw, so each transition is exactly
// one full turn and all scroll steps feel the same.
const YAW = 0.3

// Pose for each stage. x is in "half viewport widths" so the light lands in
// the middle of the left half regardless of screen size.
function buildKeyframes(viewport, mobile) {
  const sideX = mobile ? 0 : -viewport.width / 4
  const focusY = mobile ? viewport.height * 0.28 : 0
  const scale = mobile ? 0.8 : 1.75
  const y = focusY - LAMP_OFFSET * scale

  return [
    { p: [0, 0, 0], r: [0, YAW, 0], s: mobile ? 0.8 : 0.9 },
    { p: [sideX, y, 0.2], r: [0, TAU + YAW, 0], s: scale },
    { p: [sideX, y, 0.2], r: [0, TAU * 2 + YAW, 0], s: scale },
    { p: [sideX, y, 0.2], r: [0, TAU * 3 + YAW, 0], s: scale },
    { p: [sideX, y, 0.2], r: [0, TAU * 4 + YAW, 0], s: scale },
  ]
}

// Extra displacement at the midpoint of each transition so the light
// travels through all three axes instead of sliding in a straight line.
const ARCS = [
  [-0.4, 0.3, 1.0],
  [0, 0.2, 0.8],
  [0, 0.2, 0.8],
  [0, 0.2, 0.8],
]

const lerp = THREE.MathUtils.lerp
const tri = (p, center) => Math.max(0, 1 - Math.abs(p - center))

function createLampMaterial(source) {
  const material = source.clone()
  material.toneMapped = false
  material.customProgramCacheKey = () => 'signal-lamps'
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms)
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vLampPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLampPos = position.xy;')
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec2 vLampPos;
        uniform float uRed;
        uniform float uAmber;
        uniform float uGreen;
        uniform float uBase;`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        float y = vLampPos.y;
        float redMask = step(174.0, y);
        float amberMask = step(153.0, y) * (1.0 - redMask);
        float greenMask = 1.0 - step(153.0, y);
        float centerY = redMask * 183.0 + amberMask * 163.5 + greenMask * 144.0;
        // Distance from the lens centre (lens radius ~7.3 units). A real lamp
        // has a bright, slightly washed-out core that falls off to the rim.
        float d = clamp(length(vec2(vLampPos.x, y - centerY)) / 7.3, 0.0, 1.0);
        float falloff = mix(1.0, 0.18, smoothstep(0.15, 1.0, d));
        float core = (1.0 - smoothstep(0.0, 0.45, d)) * 0.45;
        vec3 lamp = uRed * redMask * vec3(1.0, 0.12, 0.06)
          + uAmber * amberMask * vec3(1.0, 0.5, 0.06)
          + uGreen * greenMask * vec3(0.12, 1.0, 0.55);
        lamp *= falloff;
        lamp += core * dot(lamp, vec3(0.33));
        // Keep the glass texture visible through the light.
        lamp *= 0.6 + 0.4 * clamp(dot(diffuseColor.rgb, vec3(0.6)), 0.0, 1.0);
        totalEmissiveRadiance = totalEmissiveRadiance * uBase + lamp;`,
      )
  }
  return material
}

export default function TrafficLight({ scroll, reducedMotion }) {
  const { scene } = useGLTF(MODEL_URL)
  const group = useRef()
  const glow = useRef()
  const viewport = useThree((state) => state.viewport)
  const camera = useThree((state) => state.camera)

  const model = useMemo(() => {
    const clone = scene.clone(true)
    clone.traverse((object) => {
      if (!object.isMesh) return
      if (object.parent?.name.startsWith('LucesSemaforo')) {
        object.material = createLampMaterial(object.material)
      }
    })
    return clone
  }, [scene])

  const glowColor = useMemo(() => new THREE.Color(), [])

  useFrame((state) => {
    const current = viewport.getCurrentViewport(camera, [0, 0, 0])
    const mobile = current.aspect < 0.8
    const keys = buildKeyframes(current, mobile)

    // scroll.target is already eased by a fixed-duration GSAP tween, so it is
    // used as-is: no second smoothing pass to make steps feel uneven.
    const p = THREE.MathUtils.clamp(scroll.target, 0, LAST_STAGE)
    const i = Math.min(Math.floor(p), LAST_STAGE - 1)
    const f = p - i
    const e = f
    const arc = Math.sin(Math.PI * f)
    const a = keys[i]
    const b = keys[i + 1]
    const t = state.clock.elapsedTime
    const sway = reducedMotion ? 0 : 1

    group.current.position.set(
      lerp(a.p[0], b.p[0], e) + ARCS[i][0] * arc,
      lerp(a.p[1], b.p[1], e) + ARCS[i][1] * arc + Math.sin(t * 0.8) * 0.03 * sway,
      lerp(a.p[2], b.p[2], e) + ARCS[i][2] * arc,
    )
    group.current.rotation.set(
      lerp(a.r[0], b.r[0], e),
      lerp(a.r[1], b.r[1], e) + Math.sin(t * 0.5) * 0.05 * sway,
      lerp(a.r[2], b.r[2], e),
    )
    group.current.scale.setScalar(lerp(a.s, b.s, e) * MODEL_SCALE)

    // Fast chase across all lamps while leaving the intro, fading out as the
    // red stage takes over. Reduced motion gets a steady glow instead.
    const blinkAmount = p <= 1 ? p : Math.max(0, 2 - p)
    const step = Math.floor(t * BLINK_STEPS_PER_SECOND) % 3
    const chase = (index) => (reducedMotion ? 0.5 : step === index ? 1 : 0)

    const red = Math.max(blinkAmount * chase(0), tri(p, 2))
    const amber = Math.max(blinkAmount * chase(1), tri(p, 3))
    const green = Math.max(blinkAmount * chase(2), tri(p, 4))
    uniforms.uRed.value = red * LAMP_INTENSITY
    uniforms.uAmber.value = amber * LAMP_INTENSITY
    uniforms.uGreen.value = green * LAMP_INTENSITY

    glowColor
      .setRGB(0, 0, 0)
      .add(LAMP_COLORS.red.clone().multiplyScalar(red))
      .add(LAMP_COLORS.amber.clone().multiplyScalar(amber))
      .add(LAMP_COLORS.green.clone().multiplyScalar(green))
    glow.current.color.copy(glowColor)
    glow.current.intensity = 1.2 * Math.max(red, amber, green)
  })

  return (
    <group ref={group}>
      <group position={[0, -MODEL_CENTER_Y, 0]}>
        <primitive object={model} />
        <pointLight ref={glow} position={[0, LAMP_CENTER_Y, 40]} distance={0} decay={0} />
      </group>
    </group>
  )
}

useGLTF.preload(MODEL_URL)
