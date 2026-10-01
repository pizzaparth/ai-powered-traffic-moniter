// One entry per scroll stop. `accent` drives the page accent and the
// signal glow; `lamp` is the lit lamp on the 3D model.
export const STAGES = [
  { id: 'intro', accent: '#ffffff', lamp: null },
  { id: 'hero', accent: '#ffffff', lamp: 'blink' },
  { id: 'about', accent: '#ff3b30', lamp: 'red' },
  { id: 'how', accent: '#ffb21a', lamp: 'amber' },
  { id: 'run', accent: '#22e07a', lamp: 'green' },
]

export const LAST_STAGE = STAGES.length - 1
