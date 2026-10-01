import { useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { ROAD_Y } from '../config.js'
import { simulation } from '../runtime.js'
import { useSimStore } from '../store.js'

const tangent = new THREE.Vector3()

function place(object, id) {
  const car = simulation.engine.cars.get(id)
  if (!car || !object) return
  const yaw = simulation.engine.pose(car, object.position, tangent)
  object.position.y = ROAD_Y
  object.rotation.y = yaw
}

function Car({ id, template }) {
  const ref = useRef()
  const model = useMemo(() => template.clone(), [template])
  useLayoutEffect(() => place(ref.current, id), [id])
  useFrame(() => place(ref.current, id))
  return <primitive ref={ref} object={model} />
}

export default function Traffic({ library }) {
  const cars = useSimStore((state) => state.carIds)
  return cars.map(({ id, type }) => <Car key={id} id={id} template={library[type].template} />)
}
