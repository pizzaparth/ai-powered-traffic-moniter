import { useCallback, useEffect, useRef, useState } from 'react'
import { useReducedMotion } from 'framer-motion'
import { useProgress } from '@react-three/drei'
import gsap from 'gsap'
import { Observer } from 'gsap/Observer'
import Scene from '../home/Scene.jsx'
import Panels from '../home/Panels.jsx'
import StageRail from '../home/StageRail.jsx'
import Loader from '../home/Loader.jsx'
import { LAST_STAGE, STAGES } from '../home/stages.js'
import '../home/home.css'

gsap.registerPlugin(Observer)

// Each gesture moves exactly one stage with the same duration and easing.
const STEP_DURATION = 1.4
const STEP_EASE = 'power2.inOut'
// Delta (px) a gesture must travel before it counts, so tiny nudges are ignored.
const GESTURE_THRESHOLD = 24
// Wheel events closer together than this belong to the same gesture
// (trackpad momentum keeps firing long after the fingers lift).
const GESTURE_GAP_MS = 220

const clamp = (value, min, max) => Math.min(max, Math.max(min, value))

export default function Home() {
  const reducedMotion = useReducedMotion()
  const { active, progress } = useProgress()
  const [stage, setStage] = useState(0)
  // Shared with the 3D scene. `target` is a continuous stage index (0–4)
  // that GSAP tweens between whole stages.
  const [scroll] = useState(() => ({ target: 0 }))
  const committed = useRef(0)
  const animating = useRef(false)

  const goTo = useCallback(
    (next) => {
      const value = clamp(next, 0, LAST_STAGE)
      if (value === committed.current) return
      const distance = Math.abs(value - committed.current)
      committed.current = value
      animating.current = true
      setStage(value)
      gsap.to(scroll, {
        target: value,
        duration: reducedMotion ? 0.4 : STEP_DURATION + (distance - 1) * 0.4,
        ease: STEP_EASE,
        overwrite: true,
        onComplete: () => {
          animating.current = false
        },
      })
    },
    [scroll, reducedMotion],
  )

  useEffect(() => {
    let lastInput = 0
    let travelled = 0
    let gestureUsed = false

    // The page never scrolls. A wheel or touch gesture is collected until it
    // passes the threshold, then fires one fixed-length step. The rest of that
    // gesture (including momentum) is ignored, as is input mid-transition.
    const observer = Observer.create({
      target: window,
      type: 'wheel,touch',
      wheelSpeed: -1,
      preventDefault: true,
      onPress() {
        gestureUsed = false
        travelled = 0
      },
      onChangeY(self) {
        const now = performance.now()
        if (now - lastInput > GESTURE_GAP_MS) {
          gestureUsed = false
          travelled = 0
        }
        lastInput = now
        if (gestureUsed || animating.current) return

        travelled += -self.deltaY
        if (Math.abs(travelled) < GESTURE_THRESHOLD) return
        gestureUsed = true
        goTo(committed.current + Math.sign(travelled))
      },
    })

    const onKey = (event) => {
      const keys = {
        ArrowDown: 1,
        ArrowRight: 1,
        PageDown: 1,
        ' ': 1,
        ArrowUp: -1,
        ArrowLeft: -1,
        PageUp: -1,
      }
      if (event.key === 'Home') goTo(0)
      else if (event.key === 'End') goTo(LAST_STAGE)
      else if (keys[event.key]) {
        if (event.key === ' ' && event.target.closest('a, button')) return
        event.preventDefault()
        if (!animating.current) goTo(committed.current + keys[event.key])
      } else return
    }
    window.addEventListener('keydown', onKey)

    return () => {
      observer.kill()
      window.removeEventListener('keydown', onKey)
    }
  }, [goTo, scroll])

  return (
    <main
      className="home"
      data-stage={STAGES[stage].id}
      style={{ '--accent': STAGES[stage].accent }}
    >
      <Scene scroll={scroll} reducedMotion={reducedMotion} />
      <Panels stage={stage} />
      <StageRail stage={stage} onSelect={goTo} />
      <Loader active={active || progress < 100} progress={progress} />
    </main>
  )
}
