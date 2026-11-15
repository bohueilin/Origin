/**
 * One colour per fleet, shared by the proving ground's floor editor, 2D playback and 3D scene
 * and by the warehouse robots on /simulation and /operations, so a fleet reads the same in
 * every view. Style Lock: no blue and no teal; Fleet 1 is the site's forest-green signal.
 * Each colour holds at least 5.9:1 contrast on the paper ground (#f8f7f4), so labels drawn in
 * it stay readable, and white labels drawn on it hold at least 6.3:1.
 */
export const FLEET_COLORS: readonly string[] = [
  '#2b523b', // Fleet 1: forest signal
  '#8a5200', // Fleet 2: warm ochre
  '#6940a3', // Fleet 3: deep plum-ink
  '#9d2e68', // Fleet 4: oxide rose
  '#4a4238', // Fleet 5: charcoal umber
  '#525e2c', // Fleet 6: olive bronze
]

/** The same palette as numbers, for three.js materials. */
export const FLEET_COLORS_HEX: readonly number[] = FLEET_COLORS.map((c) => parseInt(c.slice(1), 16))
