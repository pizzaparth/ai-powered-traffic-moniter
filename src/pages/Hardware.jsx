import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Cable, RefreshCw, RotateCcw, Save, Send, Unplug, Wand2 } from 'lucide-react'
import { DEFAULT_TIMING } from '../simulation/config.js'
import { DEFAULT_HARDWARE, useSettingsStore } from '../simulation/store.js'
import { simulation } from '../simulation/runtime.js'
import { APPROACHES, BOARD, boardCountdowns } from '../hardware/board.js'
import { adaptiveTimings, connect, disconnect, send, sendTimings, useBoardStore } from '../hardware/serial.js'

const seconds = (min, max) =>
  z.number({ error: 'Enter a number' }).min(min, `At least ${min} s`).max(max, `At most ${max} s`)
const green = z
  .number({ error: 'Enter a number' })
  .int('Whole seconds only')
  .min(BOARD.minGreen, `At least ${BOARD.minGreen} s`)
  .max(BOARD.maxGreen, `At most ${BOARD.maxGreen} s`)

const schema = z
  .object({
    hardware: z.object({
      greens: z.object(Object.fromEntries(APPROACHES.map((approach) => [approach.key, green]))),
      autoSync: z.boolean(),
      syncEvery: z.number(),
    }),
    timing: z.object({
      gMin: seconds(5, 20),
      gMax: seconds(20, 60),
      yellow: seconds(3, 6),
      allRed: seconds(1, 3),
      gapThreshold: seconds(1, 5),
      extendStep: seconds(1, 10),
      wMax: seconds(30, 300),
    }),
  })
  .refine((value) => value.timing.gMax > value.timing.gMin, {
    path: ['timing', 'gMax'],
    message: 'Must be longer than minimum green',
  })

const TIMING_FIELDS = [
  { name: 'gMin', label: 'Minimum green' },
  { name: 'gMax', label: 'Maximum green' },
  { name: 'yellow', label: 'Yellow' },
  { name: 'allRed', label: 'All red' },
  { name: 'gapThreshold', label: 'Gap-out after' },
  { name: 'extendStep', label: 'Extend by' },
  { name: 'wMax', label: 'Longest allowed wait' },
]

const SYNC_OPTIONS = [5, 10, 15, 30]
const LIGHT_LABEL = { green: 'Green', yellow: 'Yellow', red: 'Red' }

const pick = (timing) => Object.fromEntries(TIMING_FIELDS.map(({ name }) => [name, timing[name]]))
const toArray = (greens) => APPROACHES.map((approach) => greens[approach.key])

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

function LiveLights() {
  const { status, phase, timings } = useBoardStore()
  const now = useNow(Boolean(phase))
  const elapsed = phase ? Math.floor((now - phase.at) / 1000) : 0
  const waits = boardCountdowns(phase, timings, elapsed)

  return (
    <section className="card">
      <h2 className="card-title">Lights on the board</h2>
      {!waits ? (
        <p className="card-note">
          {status === 'connected'
            ? 'No report yet. Upload the updated sketch so the board reports its lights.'
            : 'Connect the board to see its lights and countdowns here.'}
        </p>
      ) : (
        <ul className="lane-rows">
          {APPROACHES.map((approach) => {
            const light = approach.index === phase.lane ? phase.mode : 'red'
            return (
              <li key={approach.key}>
                <span>{approach.label}</span>
                <span className="row-end">
                  <span className={`pill pill-${light}`}>{LIGHT_LABEL[light]}</span>
                  <strong className="row-count">{waits[approach.index]} s</strong>
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
  const { timing, hardware, save, reset } = useSettingsStore()
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
    defaultValues: { hardware, timing: pick(timing) },
  })

  const log = (kind, message) => simulation.engine.log('user', kind, message)

  const onSave = (values) => {
    save({ hardware: values.hardware, timing: { ...timing, ...values.timing } })
    resetForm(values)
    setSavedAt(new Date())
    log('hardware', 'Saved the board settings and signal timing.')
  }

  const onSend = (values) => sendTimings(toArray(values.hardware.greens)).catch(() => {})

  const fillFromSimulation = () => {
    adaptiveTimings().forEach((value, index) => {
      setValue(`hardware.greens.${APPROACHES[index].key}`, value, { shouldDirty: true, shouldValidate: true })
    })
  }

  const onReset = () => {
    reset()
    resetForm({ hardware: DEFAULT_HARDWARE, timing: pick(DEFAULT_TIMING) })
    setSavedAt(null)
    log('hardware', 'Reset board settings and signal timing to defaults.')
  }

  const number = { valueAsNumber: true }

  return (
    <main className="page">
      <header className="page-head">
        <div>
          <h1 className="page-title">Hardware</h1>
          <p className="page-lede">An {BOARD.name} on USB runs the lights and countdowns. This page sends it green times.</p>
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
              The board runs North, East, South, West in turn, with {BOARD.yellow} s of yellow. Each green lasts{' '}
              {BOARD.minGreen} to {BOARD.maxGreen} s.
            </p>
            <div className="fields">
              {APPROACHES.map((approach) => (
                <Field key={approach.key} label={`${approach.label} green`} error={errors.hardware?.greens?.[approach.key]}>
                  <input type="number" step="1" inputMode="numeric" {...register(`hardware.greens.${approach.key}`, number)} />
                </Field>
              ))}
            </div>
            <div className="sync-row">
              <label className="check">
                <input type="checkbox" {...register('hardware.autoSync')} />
                Send adaptive green times from the simulation every
              </label>
              <select aria-label="Send interval" {...register('hardware.syncEvery', number)}>
                {SYNC_OPTIONS.map((value) => (
                  <option key={value} value={value}>
                    {value} s
                  </option>
                ))}
              </select>
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

          <section className="card card-wide">
            <h2 className="card-title">Signal timing</h2>
            <p className="card-note">Seconds. Used by the simulation and for the green times sent to the board.</p>
            <div className="fields">
              {TIMING_FIELDS.map((field) => (
                <Field key={field.name} label={field.label} error={errors.timing?.[field.name]}>
                  <input type="number" step="0.5" inputMode="decimal" {...register(`timing.${field.name}`, number)} />
                </Field>
              ))}
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
