import { Suspense } from 'react'
import { Canvas } from '@react-three/fiber'
import { Environment, Lightformer } from '@react-three/drei'
import { Bloom, EffectComposer } from '@react-three/postprocessing'
import TrafficLight from './TrafficLight.jsx'

export default function Scene({ scroll, reducedMotion }) {
  return (
    <Canvas
      className="scene"
      dpr={[1, 2]}
      camera={{ position: [0, 0, 7], fov: 35 }}
      gl={{ antialias: true, alpha: true }}
      aria-hidden="true"
    >
      <ambientLight intensity={0.15} />
      <directionalLight position={[4, 6, 5]} intensity={2.2} />
      <directionalLight position={[-6, 2, -4]} intensity={1.4} />

      <Environment resolution={256}>
        <Lightformer form="rect" intensity={2} position={[0, 4, 6]} scale={[10, 2, 1]} />
        <Lightformer form="rect" intensity={1} position={[-6, 0, 2]} rotation-y={Math.PI / 2} scale={[8, 2, 1]} />
        <Lightformer form="rect" intensity={1} position={[6, 0, 2]} rotation-y={-Math.PI / 2} scale={[8, 2, 1]} />
      </Environment>

      <Suspense fallback={null}>
        <TrafficLight scroll={scroll} reducedMotion={reducedMotion} />
      </Suspense>

      <EffectComposer>
        <Bloom mipmapBlur luminanceThreshold={0.9} luminanceSmoothing={0.2} intensity={0.55} radius={0.35} />
      </EffectComposer>
    </Canvas>
  )
}
