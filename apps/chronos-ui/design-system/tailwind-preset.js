/**
 * Granola-style Tailwind preset.
 *
 * Pixel-faithful to granola.ai (see granola-extraction.md). This is the
 * format coding agents consume: add it to `presets` in a project's
 * tailwind.config.js (see tailwind.config.example.js) and build UI from
 * these utilities ONLY — never hardcode hex/px. See AGENTS.md.
 *
 * Tailwind v3 preset. For Tailwind v4, the same values are exposed as CSS
 * variables in tokens.css (`@theme` / `@import` them instead).
 */

/** @type {import('tailwindcss').Config} */
module.exports = {
  theme: {
    extend: {
      colors: {
        // --- primitives ---
        neutral: {
          50: '#fcfcf8', 100: '#f7f7f2', 150: '#f2f2ec', 200: '#eaebe5',
          300: '#d5d5d2', 400: '#acada8', 450: '#9e9e99', 500: '#818179',
          600: '#72726e', 700: '#4e4d4b', 750: '#363635', 800: '#292929',
          900: '#212121', 950: '#1e1e1e',
        },
        green: {
          50: '#f2f6e1', 100: '#e5eacd', 200: '#d1e043', 300: '#b2c248',
          400: '#788c15', 500: '#5b6f00', 600: '#434625',
        },
        red: {
          50: '#ffe7e2', 100: '#f8cec5', 200: '#f29e8b', 300: '#e95d3d', 400: '#bd4a30',
        },

        // --- semantic (prefer these) ---
        background: '#ffffff',
        surface: {
          DEFAULT: '#f7f7f2',  // warm off-white panel
          sunken: '#f2f2ec',
          raised: '#ffffff',
          elevated: '#ffffff',
        },
        ink: {
          DEFAULT: '#292929',
          primary: '#292929',
          secondary: '#72726e',
          'secondary-strong': '#4e4d4b',
          tertiary: '#acada8',
          inverse: '#fcfcf8',
          accent: '#788c15',
          danger: '#bd4a30',
        },
        hairline: '#47432a33',  // warm translucent border
        stroke: '#d5d5d2',
        border: '#e3e3e3',
        accent: {
          DEFAULT: '#d1e043',      // green-200 — Granola's rendered bright accent
          strong: '#b2c248',       // green-300 — most-used accent / hover
          text: '#0d7916',
          wash: '#d1e04333',
        },
        fill: {
          accent: '#5b6f00',
          'accent-hover': '#4c5616',
          primary: '#292929',
          'primary-hover': '#4e4d4b',
          danger: '#e95d3d',
        },
        // tinted surfaces
        tint: { green: '#f2f6e1', blue: '#eaf4fe', purple: '#f3f0fa' },
        ring: '#b2c24899',
      },

      fontFamily: {
        display: ['"EB Garamond"', 'Georgia', '"Times New Roman"', 'serif'],
        sans: ['"Geist"', 'system-ui', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', 'sans-serif'],
        mono: ['"Geist Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },

      // [size, { lineHeight, letterSpacing }] — confirmed from granola.ai
      fontSize: {
        '2xs': ['11px', { lineHeight: '14px', letterSpacing: '0.02em' }],
        xs:   ['12px', { lineHeight: '16px', letterSpacing: '0.02em' }],
        sm:   ['13px', { lineHeight: '16px', letterSpacing: '0.01em' }],
        base: ['14px', { lineHeight: '18px', letterSpacing: '0.01em' }],
        lg:   ['16px', { lineHeight: '20px' }],
        xl:   ['20px', { lineHeight: '1.4' }],
        '2xl': ['24px', { lineHeight: '1.33' }],
        '3xl': ['30px', { lineHeight: '1.2', letterSpacing: '-0.01em' }],
        '4xl': ['36px', { lineHeight: '1.11', letterSpacing: '-0.015em' }],
        '5xl': ['48px', { lineHeight: '1.0', letterSpacing: '-0.02em' }],
        '6xl': ['60px', { lineHeight: '1.0', letterSpacing: '-0.02em' }],
        '7xl': ['72px', { lineHeight: '1.0', letterSpacing: '-0.02em' }],
      },

      fontWeight: {
        light: '300', normal: '400', book: '430', medium: '500', semibold: '600', bold: '700',
      },

      lineHeight: {
        tight: '1.25', snug: '1.375', normal: '1.5', relaxed: '1.625',
      },
      letterSpacing: {
        tight: '-0.025em', normal: '0em', wide: '0.025em', wider: '0.05em',
      },

      // 4px base scale (extends Tailwind's default, which already matches)
      spacing: {
        1: '4px', 2: '8px', 3: '12px', 4: '16px', 5: '20px', 6: '24px',
        8: '32px', 10: '40px', 12: '48px', 16: '64px', 20: '80px', 24: '96px',
      },

      borderRadius: {
        xs: '2px', sm: '4px', md: '6px', lg: '8px', xl: '12px',
        '2xl': '16px', '3xl': '24px', full: '9999px', DEFAULT: '8px',
      },

      boxShadow: {
        sm: '0px 1px 2px 0px #0000000d',
        DEFAULT: '0px 4px 6px -2px #0000000d',
        lg: '0px 12px 24px -8px #00000014',
        none: 'none',
      },

      maxWidth: {
        sm: '24rem', md: '28rem', lg: '32rem', xl: '36rem', '2xl': '42rem',
        '3xl': '48rem', '4xl': '56rem', '5xl': '1014px', '6xl': '72rem', '7xl': '80rem',
      },

      // --- motion (confirmed from granola.ai) ---
      transitionDuration: {
        DEFAULT: '150ms',
      },
      transitionTimingFunction: {
        DEFAULT: 'cubic-bezier(0.4, 0, 0.2, 1)',
        out: 'cubic-bezier(0, 0, 0.2, 1)',
        in: 'cubic-bezier(0.4, 0, 1, 1)',
        'out-expo': 'cubic-bezier(0.16, 1, 0.3, 1)',     // signature show/hide curve
        'in-out-expo': 'cubic-bezier(0.87, 0, 0.13, 1)',
      },
      keyframes: {
        'fade-in-up': {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'overlay-show': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'content-show': {  // centered dialog
          '0%': { opacity: '0', transform: 'translate(-50%, -48%) scale(0.96)' },
          '100%': { opacity: '1', transform: 'translate(-50%, -50%) scale(1)' },
        },
        'dropdown-show': {  // anchored menu/popover
          '0%': { opacity: '0', transform: 'translateY(-4px) scale(0.96)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        'accordion-down': {
          '0%': { height: '0' },
          '100%': { height: 'var(--radix-accordion-content-height, auto)' },
        },
        'accordion-up': {
          '0%': { height: 'var(--radix-accordion-content-height, auto)' },
          '100%': { height: '0' },
        },
      },
      animation: {
        'fade-in-up': 'fade-in-up 0.6s cubic-bezier(0, 0, 0.2, 1) forwards',
        'overlay-show': 'overlay-show 0.15s cubic-bezier(0.16, 1, 0.3, 1)',
        'content-show': 'content-show 0.15s cubic-bezier(0.16, 1, 0.3, 1)',
        'dropdown-show': 'dropdown-show 0.15s cubic-bezier(0.16, 1, 0.3, 1)',
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
      },
    },
  },
};
