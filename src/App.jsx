import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import Home from './pages/Home.jsx'
import Simulation from './pages/Simulation.jsx'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/home" replace />} />
        <Route path="/home" element={<Home />} />
        <Route path="/simulation" element={<Simulation />} />
        <Route path="*" element={<Navigate to="/home" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
