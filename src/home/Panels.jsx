import { AnimatePresence, motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { STAGES } from './stages.js'

const ease = [0.22, 1, 0.36, 1]

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08, delayChildren: 0.15 } },
  exit: { transition: { staggerChildren: 0.03, staggerDirection: -1 } },
}

const rise = {
  hidden: { y: '110%' },
  show: { y: '0%', transition: { duration: 0.8, ease } },
  exit: { y: '-110%', transition: { duration: 0.35, ease: 'easeIn' } },
}

const fade = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.7, ease } },
  exit: { opacity: 0, y: -16, transition: { duration: 0.3, ease: 'easeIn' } },
}

// Headline lines are revealed through a clipping mask, one line at a time.
function Line({ children }) {
  return (
    <span className="line">
      <motion.span className="line-inner" variants={rise}>
        {children}
      </motion.span>
    </span>
  )
}

function Intro() {
  return (
    <motion.p className="scroll-hint" variants={fade}>
      Scroll to start
    </motion.p>
  )
}

function Hero() {
  return (
    <>
      <h1 className="headline">
        <Line>Signals that</Line>
        <Line>respond to</Line>
        <Line>the street.</Line>
      </h1>
      <motion.p className="pill" variants={fade}>
        Smart traffic monitoring and management
      </motion.p>
    </>
  )
}

const FEATURES = [
  { tag: 'Monitor', text: 'Counts vehicles in every lane' },
  { tag: 'Decide', text: 'Gives green time to the longest queue' },
  { tag: 'Connect', text: 'Built to plug into roadside hardware' },
]

function About() {
  return (
    <>
      <h2 className="headline">
        <Line>Timers ignore</Line>
        <Line>the traffic.</Line>
      </h2>
      <div className="features">
        {FEATURES.map((feature) => (
          <motion.div className="feature" key={feature.tag} variants={fade}>
            <span className="pill pill-small">{feature.tag}</span>
            <p>{feature.text}</p>
          </motion.div>
        ))}
      </div>
    </>
  )
}

const STEPS = ['Open the simulation', 'Add traffic to each lane', 'Watch the signals adapt']

function How() {
  return (
    <>
      <h2 className="headline">
        <Line>Run it in</Line>
        <Line>three steps.</Line>
      </h2>
      <ol className="steps">
        {STEPS.map((step, index) => (
          <motion.li key={step} variants={fade}>
            <span className="pill pill-number">{index + 1}</span>
            {step}
          </motion.li>
        ))}
      </ol>
    </>
  )
}

function Run() {
  return (
    <>
      <h2 className="headline">
        <Line>Green light.</Line>
        <Line>Watch it run.</Line>
      </h2>
      <motion.div variants={fade}>
        <Link className="pill-button" to="/simulation">
          Open simulation
        </Link>
      </motion.div>
    </>
  )
}

const CONTENT = { intro: Intro, hero: Hero, about: About, how: How, run: Run }

export default function Panels({ stage }) {
  const { id } = STAGES[stage]
  const Content = CONTENT[id]

  return (
    <section className={`panel panel-${id}`} aria-live="polite">
      <AnimatePresence mode="wait">
        <motion.div
          key={id}
          className="panel-content"
          variants={container}
          initial="hidden"
          animate="show"
          exit="exit"
        >
          <Content />
        </motion.div>
      </AnimatePresence>
    </section>
  )
}
