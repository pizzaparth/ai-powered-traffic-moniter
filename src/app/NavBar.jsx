import { NavLink, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { House } from 'lucide-react'

const TABS = [
  { to: '/simulation', label: 'Simulation' },
  { to: '/activity', label: 'Activity' },
  { to: '/hardware', label: 'Hardware' },
]

// Floating pill navigation, fixed over every tab.
export default function NavBar() {
  return (
    <nav className="navbar" aria-label="Main">
      <Link to="/home" className="nav-home" aria-label="Home">
        <House size={18} strokeWidth={2.5} />
      </Link>
      {TABS.map((tab) => (
        <NavLink key={tab.to} to={tab.to} className="nav-tab">
          {({ isActive }) => (
            <>
              {isActive && (
                <motion.span
                  layoutId="nav-active"
                  className="nav-active"
                  transition={{ type: 'spring', stiffness: 500, damping: 40 }}
                />
              )}
              <span className="nav-label">{tab.label}</span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  )
}
