import preset from './design-system/tailwind-preset.js'

/**
 * Local project config. Consumes the Granola design-system preset verbatim and
 * adds a small set of *semantic state* tokens (warn/amber + soft tints) required
 * by the Traceback run-graph states (promising / qa-review / running). These are
 * added as named tokens here — never inlined as arbitrary values in markup — per
 * design-system/AGENTS.md rule 1.
 */
/** @type {import('tailwindcss').Config} */
export default {
  presets: [preset],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Libre Baskerville"', 'Georgia', '"Times New Roman"', 'serif'],
      },
      spacing: {
        18: '72px',
      },
      colors: {
        warn: {
          DEFAULT: '#b07d22',
          text: '#9a6b1f',
          soft: '#f6efde',
          border: '#e6d29a',
        },
        state: {
          'green-soft': '#eef3da',
          'green-border': '#cdd99a',
          'red-soft': '#fbe9e4',
          'gray-soft': '#f0f0ea',
        },
      },
    },
  },
}
