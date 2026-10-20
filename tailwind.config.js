/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: { 50: '#EEF5FD', 100: '#DCEAFA', 200: '#B9D5F4', 300: '#8DB9EA', 400: '#4F8FDB', 500: '#1F6FC9', 600: '#0F55A8', 700: '#0B4488', 800: '#0A3469', 900: '#0B2545' },
        st: { notstarted: '#9AA5B1', inprogress: '#1F6FC9', onhold: '#E8A317', closed: '#2E9E5B' },
      },
      fontFamily: { sans: ['Inter', 'Segoe UI', 'system-ui', 'sans-serif'] },
      boxShadow: { card: '0 1px 2px rgba(11,37,69,.06), 0 4px 14px rgba(11,37,69,.06)' },
    },
  },
  plugins: [],
};
