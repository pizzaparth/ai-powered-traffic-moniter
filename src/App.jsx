import { Suspense, lazy } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import Home from './pages/Home.jsx'

// The workspace tabs load on demand so the home page stays light.
const AppShell = lazy(() => import('./app/AppShell.jsx'))
const Simulation = lazy(() => import('./pages/Simulation.jsx'))
const Activity = lazy(() => import('./pages/Activity.jsx'))
const Hardware = lazy(() => import('./pages/Hardware.jsx'))

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={null}>
        <Routes>
          <Route path="/" element={<Navigate to="/home" replace />} />
          <Route path="/home" element={<Home />} />
          <Route element={<AppShell />}>
            <Route path="/simulation" element={<Simulation />} />
            <Route path="/activity" element={<Activity />} />
            <Route path="/hardware" element={<Hardware />} />
          </Route>
          <Route path="*" element={<Navigate to="/home" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
