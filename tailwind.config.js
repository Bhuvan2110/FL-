/** @type {import('tailwindcss').Config} */
// NOTE: this theme was reconstructed after a mid-project context reset —
// the original tailwind.config.js was only ever partially viewed, never
// fully captured. This covers every custom color/spacing/typography
// token the components actually reference, but the exact original hex
// values are not guaranteed. See README.md "What's reconstructed, not
// recovered" for detail.
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        background: '#010f1f',
        'deep-navy': '#010f1f',

        primary: '#60eca8',
        'primary-fixed': '#4FE3C1',
        'primary-container': '#17352a',
        'on-primary': '#002112',
        'on-primary-container': '#bdf5d4',

        'on-surface': '#EEF1F6',
        'on-surface-variant': '#9db2a8',

        surface: '#0b1a2b',
        'surface-dim': '#081321',
        'surface-variant': '#13263a',
        'surface-container-lowest': '#010f1f',
        'surface-container-low': '#0c1d2e',
        'surface-container-high': '#152a3d',
        'surface-container-highest': '#1b3345',

        outline: '#3d4a41',
        'outline-variant': '#273647',
        line: '#1E2A3D',

        'encryption-gold': '#F59E0B',
        'alert-red': '#EF4444',
        'data-blue': '#3B82F6',

        signal: { 400: '#8B95FF', 500: '#6C7CFF' },
        cipher: { 400: '#4FE3C1', 500: '#1FC8B4' },
        mist: {
          100: '#EEF1F6',
          400: '#7C879A',
          500: '#4B5566',
          600: '#3a4352',
          700: '#2a3442',
          800: '#1b2430',
        },
        ink: {
          600: '#2a3442',
          700: '#1E2A3D',
          800: '#13202e',
          900: '#0c1824',
          950: '#010f1f',
        },
      },
      fontFamily: {
        body: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['"Space Grotesk"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      fontSize: {
        'headline-xl': ['1.75rem', { lineHeight: '2.1rem', fontWeight: '700' }],
        'headline-lg': ['1.375rem', { lineHeight: '1.75rem', fontWeight: '700' }],
        'body-md': ['0.9375rem', { lineHeight: '1.4rem' }],
        'body-sm': ['0.8125rem', { lineHeight: '1.2rem' }],
        'label-caps': ['0.75rem', { lineHeight: '1rem', letterSpacing: '0.04em' }],
        'code-sm': ['0.8125rem', { lineHeight: '1.2rem' }],
      },
      spacing: {
        'gutter-md': '1rem',
        'margin-lg': '1.5rem',
      },
      maxWidth: {
        'container-max': '1400px',
      },
      keyframes: {
        pulseline: {
          '0%, 100%': { opacity: 1 },
          '50%': { opacity: 0.4 },
        },
      },
      animation: {
        pulseline: 'pulseline 1.4s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
