/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          950: '#08090c',
          900: '#0d0f14',
          850: '#12151c',
          800: '#171b24',
          700: '#222836',
          600: '#323a4d',
          500: '#4b5568',
        },
        text: {
          hi: '#f4f6fb',
          mid: '#a4adc0',
          low: '#6f7994',
        },
        accent: {
          DEFAULT: '#f0b429',
          soft: '#4a3a11',
        },
        watched: '#3ddc97',
        skip: '#f2545b',
        later: '#6ea8ff',
      },
      borderRadius: {
        card: '20px',
        control: '12px',
      },
      boxShadow: {
        deck: '0 30px 60px -20px rgba(0,0,0,0.85)',
        pop: '0 12px 32px -12px rgba(0,0,0,0.7)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
