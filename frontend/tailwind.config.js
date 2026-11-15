/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: { 50: '#F2F0FF', 100: '#E8E3FF', 200: '#D4CCFF', 400: '#9B8CF0', 500: '#8171E8', 600: '#6E5BD6', 700: '#5A47B8' },
        ink: '#252944',
        muted: '#9298B0',
        canvas: '#F7F8FE',
        success: '#47C99A',
        warning: '#FFBE69',
        danger: '#F27D91',
        cyan: '#73D8E6',
        blue: '#67A9ED',
      },
      fontFamily: { sans: ['Be Vietnam Pro', 'sans-serif'] },
      boxShadow: {
        soft: '0 8px 30px rgba(55, 48, 107, 0.06)',
        lift: '0 16px 40px rgba(87, 70, 160, 0.12)',
        button: '0 7px 16px rgba(129, 113, 232, 0.24)',
      },
      borderRadius: { '4xl': '2rem' },
    },
  },
  plugins: [],
}
