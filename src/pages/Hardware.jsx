import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Cable, RefreshCw, RotateCcw, Save, Send, Unplug, Wand2 } from 'lucide-react'
import { DEFAULT_HARDWARE, useSettingsStore } from '../simulation/store.js'
import { simulation } from '../simulation/runtime.js'
import { APPROACHES, BOARD, boardSignals } from '../hardware/board.js'
import { PHASES } from '../simulation/config.js'
import { adaptiveTimings, connect, disconnect, send, sendTimings, useBoardStore } from '../hardware/serial.js'

const green = z
  .number({ error: 'Enter a number' })
  .int('Whole seconds only')
  .min(BOARD.minGreen, `At least ${BOARD.minGreen} s`)
  .max(BOARD.maxGreen, `At most ${BOARD.maxGreen} s`)

const schema = z.object({
  hardware: z.object({
    greens: z.object(Object.fromEntries(PHASES.map((phase) => [phase.id, green]))),
  }),
})

const LIGHT_LABEL = { green: 'Green', yellow: 'Yellow', red: 'Red' }

const LIGHT_NAME = { G: 'green', Y: 'yellow', R: 'red' }

const toArray = (greens) => PHASES.map((phase) => greens[phase.id])

function Field({ label, error, children }) {
  return (
    <label className="field">
      {label}
      {children}
      {error && <span className="field-error">{error.message}</span>}
    </label>
  )
}

// Re-renders a few times a second so countdowns from board reports keep moving.
function useNow(active) {
  const [now, setNow] = useState(() => performance.now())
  useEffect(() => {
    if (!active) return
    const timer = setInterval(() => setNow(performance.now()), 250)
    return () => clearInterval(timer)
  }, [active])
  return now
}

function ConnectionCard() {
  const { supported, status, ready, error } = useBoardStore()
  const connected = status === 'connected'
  return (
    <section className="card">
      <h2 className="card-title">Board</h2>
      <dl className="facts">
        <div>
          <dt>Controller</dt>
          <dd>{BOARD.name}</dd>
        </div>
        <div>
          <dt>Link</dt>
          <dd>USB serial at {BOARD.baudRate.toLocaleString()} baud</dd>
        </div>
        <div>
          <dt>Vehicle sensors</dt>
          <dd>None. Queues come from the simulation.</dd>
        </div>
        <div>
          <dt>Status</dt>
          <dd>{connected ? (ready ? 'Talking to the sketch' : 'Waiting for the sketch to reply') : 'Not connected'}</dd>
        </div>
      </dl>
      {!supported && <p className="card-note">Connecting over USB needs Chrome or Edge on a computer.</p>}
      {error && <p className="card-note">Could not open the port: {error}</p>}
      <div className="card-actions">
        {connected ? (
          <>
            <button type="button" className="button button-small" onClick={() => send('?').catch(() => {})}>
              <RefreshCw size={16} strokeWidth={2.5} />
              Ask for status
            </button>
            <button type="button" className="button button-small button-solid" onClick={() => disconnect()}>
              <Unplug size={16} strokeWidth={2.5} />
              Disconnect
            </button>
          </>
        ) : (
          <button
            type="button"
            className="button button-small button-solid"
            onClick={connect}
            disabled={!supported || status === 'connecting'}
          >
            <Cable size={16} strokeWidth={2.5} />
            {status === 'connecting' ? 'Connecting' : 'Connect board'}
          </button>
        )}
      </div>
    </section>
  )
}

// What the board shows: the frames we stream while it copies the
// simulation, or its own cycle worked out from its PHASE reports.
function boardLights({ mode, frame, phase, timings }, now) {
  if (mode === 'follow' && frame) {
    return APPROACHES.map((approach) => ({
      light: LIGHT_NAME[frame.lights[approach.index]],
      seconds: frame.counts[approach.index],
    }))
  }
  return boardSignals(phase, timings, now)
}

function LiveLights() {
  const board = useBoardStore()
  const mirror = useSettingsStore((state) => state.hardware.mirror)
  const setMirror = useSettingsStore((state) => state.setMirror)
  const now = useNow(Boolean(board.phase))
  const lights = boardLights(board, now)
  const { status } = board

  const toggleMirror = (event) => {
    setMirror(event.target.checked)
    simulation.engine.log(
      'user',
      'mirror',
      event.target.checked
        ? 'Board set to copy the simulation signals.'
        : 'Board set to run its own cycle. It switches back within 3 s.',
    )
  }

  return (
    <section className="card">
      <h2 className="card-title">
        Lights on the board
        {board.mode && (
          <span className={`pill ${board.mode === 'follow' ? 'pill-green' : 'pill-ink'}`}>
            {board.mode === 'follow' ? 'Copying simulation' : 'Own cycle'}
          </span>
        )}
      </h2>
      <label className="check toggle-row">
        <input type="checkbox" checked={mirror} onChange={toggleMirror} />
        Copy the simulation signals live
      </label>
      {!lights ? (
        <p className="card-note">
          {status === 'connected'
            ? 'No report yet. Upload the updated sketch so the board reports its lights.'
            : 'Connect the board to see its lights and countdowns here.'}
        </p>
      ) : (
        <ul className="lane-rows">
          {APPROACHES.map((approach) => {
            const { light, seconds } = lights[approach.index]
            return (
              <li key={approach.key}>
                <span>{approach.label}</span>
                <span className="row-end">
                  <span className={`pill pill-${light}`}>{LIGHT_LABEL[light]}</span>
                  <strong className="row-count">{seconds === '-' ? 'No timer' : `${seconds} s`}</strong>
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

function Wiring() {
  return (
    <section className="card card-wide">
      <h2 className="card-title">Wiring</h2>
      <p className="card-note">
        From the sketch. Every countdown display shares clock {BOARD.clockPin} and data {BOARD.dataPin} and has its own
        latch.
      </p>
      <table className="hw-table">
        <thead>
          <tr>
            <th scope="col">Approach</th>
            <th scope="col">Simulation lane</th>
            <th scope="col">Red</th>
            <th scope="col">Yellow</th>
            <th scope="col">Green</th>
            <th scope="col">Display latch</th>
          </tr>
        </thead>
        <tbody>
          {APPROACHES.map((approach) => (
            <tr key={approach.key}>
              <td>{approach.label}</td>
              <td>
                {approach.lane.label} {approach.lane.direction.toLowerCase()}
              </td>
              <td>D{approach.red}</td>
              <td>D{approach.yellow}</td>
              <td>D{approach.green}</td>
              <td>{approach.latch}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}

export default function Hardware() {
  const { hardware, save, reset } = useSettingsStore()
  const { status, lastAck } = useBoardStore()
  const connected = status === 'connected'
  const [savedAt, setSavedAt] = useState(null)

  const {
    register,
    handleSubmit,
    reset: resetForm,
    setValue,
    formState: { errors, isDirty },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { hardware: { greens: hardware.greens } },
  })

  const log = (kind, message) => simulation.engine.log('user', kind, message)

  const onSave = (values) => {
    save({ hardware: values.hardware })
    resetForm(values)
    setSavedAt(new Date())
    log('hardware', 'Saved the board green times.')
  }

  const onSend = (values) => sendTimings(toArray(values.hardware.greens)).catch(() => {})

  const fillFromSimulation = () => {
    adaptiveTimings().forEach((value, index) => {
      setValue(`hardware.greens.${PHASES[index].id}`, value, { shouldDirty: true, shouldValidate: true })
    })
  }

  const onReset = () => {
    reset()
    resetForm({ hardware: { greens: DEFAULT_HARDWARE.greens } })
    setSavedAt(null)
    log('hardware', 'Reset the board green times to defaults.')
  }

  const number = { valueAsNumber: true }

  return (
    <main className="page">
      <header className="page-head">
        <div>
          <h1 className="page-title">Hardware</h1>
          <p className="page-lede">An {BOARD.name} on USB runs the lights and countdowns. It can copy the simulation signals live.</p>
        </div>
        <span className={`pill ${connected ? 'pill-green' : 'pill-ink'}`}>
          {connected ? <Cable size={16} strokeWidth={2.5} /> : <Unplug size={16} strokeWidth={2.5} />}
          {connected ? 'Board connected' : 'No board connected'}
        </span>
      </header>

      <form onSubmit={handleSubmit(onSave)} noValidate>
        <div className="hw-grid">
          <ConnectionCard />
          <LiveLights />

          <section className="card card-wide">
            <h2 className="card-title">Green times</h2>
            <p className="card-note">
              Used when the board runs its own cycle: each approach in turn, North, East, South, West, with{' '}
              {BOARD.yellow} s of yellow and {BOARD.allRed} s of all red between. Each green {BOARD.minGreen} to{' '}
              {BOARD.maxGreen} s.
            </p>
            <div className="fields">
              {PHASES.map((phase) => (
                <Field key={phase.id} label={`${phase.name} green`} error={errors.hardware?.greens?.[phase.id]}>
                  <input type="number" step="1" inputMode="numeric" {...register(`hardware.greens.${phase.id}`, number)} />
                </Field>
              ))}
            </div>
            <div className="card-actions">
              <span className="card-status" role="status">
                {lastAck ? `Board confirmed at ${new Date(lastAck).toLocaleTimeString()}` : ''}
              </span>
              <button type="button" className="button button-small" onClick={fillFromSimulation}>
                <Wand2 size={16} strokeWidth={2.5} />
                Fill from simulation
              </button>
              <button
                type="button"
                className="button button-small button-solid"
                onClick={handleSubmit(onSend)}
                disabled={!connected}
              >
                <Send size={16} strokeWidth={2.5} />
                Send to board
              </button>
            </div>
          </section>

          <Wiring />
        </div>

        <div className="form-actions">
          <span className="saved" role="status">
            {isDirty ? 'Unsaved changes' : savedAt ? `Saved at ${savedAt.toLocaleTimeString()}` : 'All changes saved'}
          </span>
          <button type="button" className="button button-small" onClick={onReset}>
            <RotateCcw size={16} strokeWidth={2.5} />
            Reset to defaults
          </button>
          <button type="submit" className="button button-small button-solid">
            <Save size={16} strokeWidth={2.5} />
            Save settings
          </button>
        </div>
      </form>
    </main>
  )
}
