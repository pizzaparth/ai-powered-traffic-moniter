import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { RotateCcw, Save, Unplug } from 'lucide-react'
import { DEFAULT_TIMING, LANES } from '../simulation/config.js'
import { DEFAULT_HARDWARE, useSettingsStore } from '../simulation/store.js'
import { simulation } from '../simulation/runtime.js'

const BOARDS = [
  { value: 'esp32', label: 'ESP32' },
  { value: 'rpi4', label: 'Raspberry Pi 4' },
  { value: 'arduino-mega', label: 'Arduino Mega' },
]

const CONNECTIONS = [
  { value: 'wifi-mqtt', label: 'Wi-Fi (MQTT)' },
  { value: 'websocket', label: 'WebSocket' },
  { value: 'usb-serial', label: 'USB serial' },
]

const SENSORS = [
  { value: 'camera', label: 'Camera' },
  { value: 'loop', label: 'Inductive loop' },
  { value: 'ir', label: 'IR beam' },
  { value: 'ultrasonic', label: 'Ultrasonic' },
]

const pin = z.number({ error: 'Enter a pin number' }).int('Whole numbers only').min(0, '0 or more').max(99, '99 or less')
const seconds = (min, max) =>
  z.number({ error: 'Enter a number' }).min(min, `At least ${min} s`).max(max, `At most ${max} s`)

const schema = z
  .object({
    hardware: z.object({
      board: z.string(),
      connection: z.string(),
      address: z.string().trim().min(1, 'Enter the controller address'),
      sensors: z.record(z.string(), z.object({ type: z.string(), input: z.string().trim().min(1, 'Required') })),
      outputs: z.record(z.string(), z.object({ red: pin, amber: pin, green: pin })),
    }),
    timing: z.object({
      gMin: seconds(5, 20),
      gMax: seconds(20, 120),
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

const pick = (timing) => Object.fromEntries(TIMING_FIELDS.map(({ name }) => [name, timing[name]]))

function Field({ label, error, children }) {
  return (
    <label className="field">
      {label}
      {children}
      {error && <span className="field-error">{error.message}</span>}
    </label>
  )
}

export default function Hardware() {
  const { timing, hardware, save, reset } = useSettingsStore()
  const [savedAt, setSavedAt] = useState(null)

  const {
    register,
    handleSubmit,
    reset: resetForm,
    formState: { errors, isDirty },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { hardware, timing: pick(timing) },
  })

  const log = (kind, message) => simulation.engine.log('user', kind, message)

  const onSubmit = (values) => {
    save({ hardware: values.hardware, timing: { ...timing, ...values.timing } })
    resetForm(values)
    setSavedAt(new Date())
    log('hardware', 'Saved the hardware configuration and signal timing.')
  }

  const onReset = () => {
    reset()
    resetForm({ hardware: DEFAULT_HARDWARE, timing: pick(DEFAULT_TIMING) })
    setSavedAt(null)
    log('hardware', 'Reset hardware and signal timing to defaults.')
  }

  const number = { valueAsNumber: true }

  return (
    <main className="page">
      <header className="page-head">
        <div>
          <h1 className="page-title">Hardware</h1>
          <p className="page-lede">Map lane sensors and signal outputs for the controller board. Settings are saved in this browser.</p>
        </div>
        <span className="pill pill-ink">
          <Unplug size={16} strokeWidth={2.5} />
          No board connected
        </span>
      </header>

      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <div className="hw-grid">
          <section className="card">
            <h2 className="card-title">Controller</h2>
            <p className="card-note">The board that reads sensors and switches the lights.</p>
            <div className="fields">
              <Field label="Board">
                <select {...register('hardware.board')}>
                  {BOARDS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Connection">
                <select {...register('hardware.connection')}>
                  {CONNECTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Address" error={errors.hardware?.address}>
                <input {...register('hardware.address')} autoComplete="off" spellCheck={false} />
              </Field>
            </div>
          </section>

          <section className="card">
            <h2 className="card-title">Signal timing</h2>
            <p className="card-note">Seconds. Saving applies them to the live simulation straight away.</p>
            <div className="fields">
              {TIMING_FIELDS.map((field) => (
                <Field key={field.name} label={field.label} error={errors.timing?.[field.name]}>
                  <input type="number" step="0.5" inputMode="decimal" {...register(`timing.${field.name}`, number)} />
                </Field>
              ))}
            </div>
          </section>

          <section className="card card-wide">
            <h2 className="card-title">Lane sensors</h2>
            <p className="card-note">What counts the cars in each lane, and where it plugs in.</p>
            <table className="hw-table">
              <thead>
                <tr>
                  <th scope="col">Lane</th>
                  <th scope="col">Sensor</th>
                  <th scope="col">Input</th>
                </tr>
              </thead>
              <tbody>
                {LANES.map((lane) => (
                  <tr key={lane.id}>
                    <td>
                      {lane.label} {lane.direction.toLowerCase()}
                    </td>
                    <td>
                      <select aria-label={`${lane.label} sensor`} {...register(`hardware.sensors.${lane.id}.type`)}>
                        {SENSORS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input aria-label={`${lane.label} input`} {...register(`hardware.sensors.${lane.id}.input`)} />
                      {errors.hardware?.sensors?.[lane.id]?.input && (
                        <span className="field-error">{errors.hardware.sensors[lane.id].input.message}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="card card-wide">
            <h2 className="card-title">Signal outputs</h2>
            <p className="card-note">GPIO pin for each lamp of each lane's signal head.</p>
            <table className="hw-table">
              <thead>
                <tr>
                  <th scope="col">Lane</th>
                  <th scope="col">Red pin</th>
                  <th scope="col">Amber pin</th>
                  <th scope="col">Green pin</th>
                </tr>
              </thead>
              <tbody>
                {LANES.map((lane) => (
                  <tr key={lane.id}>
                    <td>
                      {lane.label} {lane.direction.toLowerCase()}
                    </td>
                    {['red', 'amber', 'green'].map((lamp) => (
                      <td key={lamp}>
                        <input
                          type="number"
                          inputMode="numeric"
                          aria-label={`${lane.label} ${lamp} pin`}
                          {...register(`hardware.outputs.${lane.id}.${lamp}`, number)}
                        />
                        {errors.hardware?.outputs?.[lane.id]?.[lamp] && (
                          <span className="field-error">{errors.hardware.outputs[lane.id][lamp].message}</span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
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
            Save configuration
          </button>
        </div>
      </form>
    </main>
  )
}
