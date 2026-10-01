import { AnimatePresence, motion } from 'framer-motion'

export default function Loader({ active, progress }) {
  return (
    <AnimatePresence>
      {active && (
        <motion.div
          className="loader"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.6 } }}
          role="status"
        >
          <span className="loader-count">{Math.round(progress)}</span>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
