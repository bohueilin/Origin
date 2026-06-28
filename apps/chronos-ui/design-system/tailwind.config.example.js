/**
 * Example: how a project adopts the Granola-style design system.
 * Copy this into your app as tailwind.config.js and adjust `content`.
 *
 *   1. npm i -D tailwindcss
 *   2. Reference the preset below (adjust the relative path).
 *   3. Load tokens.css once (for CSS-var access + the @font-face fallbacks).
 *   4. Build UI from preset utilities only — never hardcode hex/px. See AGENTS.md.
 */
const granolaPreset = require('./tailwind-preset.js');

/** @type {import('tailwindcss').Config} */
module.exports = {
  presets: [granolaPreset],
  content: ['./src/**/*.{html,js,jsx,ts,tsx,vue,svelte}'],
  theme: {
    // Project-specific extensions go here. Do NOT redefine the design tokens.
    extend: {},
  },
  plugins: [],
};
