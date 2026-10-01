import { Link } from 'react-router-dom'
import '../home/home.css'

export default function Simulation() {
  return (
    <main className="placeholder">
      <h1 className="headline">The simulation is being built.</h1>
      <Link className="pill-button" to="/home">
        Back to home
      </Link>
    </main>
  )
}
