import { useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import NavBar from './NavBar.jsx'
import '../simulation/runtime.js'
import './app.css'

// White workspace for the simulation, activity and hardware tabs.
export default function AppShell() {
  useEffect(() => {
    document.documentElement.classList.add('light')
    return () => document.documentElement.classList.remove('light')
  }, [])

  return (
    <div className="app">
      <NavBar />
      <Outlet />
    </div>
  )
}
