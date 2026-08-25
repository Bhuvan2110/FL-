/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ink:    { 950:'#070A0F',900:'#0A0E15',800:'#111827',700:'#161F2E',600:'#1E2A3D' },
        signal: { 400:'#8B95FF',500:'#6C7CFF',600:'#5361E0' },
        cipher: { 400:'#4FE3C1',500:'#33D6B0' },
        amber:  { 400:'#F5B15C',500:'#F2A94E' },
        mist:   { 100:'#EEF1F6',300:'#B7C0CE',500:'#7C879A',700:'#4B5566' },
      },
      fontFamily: {
        display: ['"Space Grotesk"','sans-serif'],
        body:    ['"Inter"','sans-serif'],
        mono:    ['"JetBrains Mono"','monospace'],
      },
      keyframes: {
        pulseline: { '0%,100%':{opacity:0.3},'50%':{opacity:1} },
      },
      animation: {
        pulseline: 'pulseline 2.2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
