import { STAGES } from './stages.js'

const LABELS = {
  intro: 'Start',
  hero: 'Overview',
  about: 'What it does',
  how: 'How to use it',
  run: 'Open the simulation',
}

export default function StageRail({ stage, onSelect }) {
  return (
    <nav className="rail" aria-label="Sections">
      {STAGES.map((item, index) => (
        <button
          key={item.id}
          type="button"
          className="rail-stop"
          aria-label={LABELS[item.id]}
          aria-current={index === stage ? 'step' : undefined}
          onClick={() => onSelect(index)}
        />
      ))}
    </nav>
  )
}
