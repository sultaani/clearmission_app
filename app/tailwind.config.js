/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        forest: {
          DEFAULT: '#1B5E20',
          50: '#E8F5E9',
          100: '#C8E6C9',
          600: '#1B5E20',
          700: '#154A19',
          900: '#0D3011',
        },
        ink: '#1A1D1B',
        paper: '#FFFFFF',
        mist: {
          DEFAULT: '#EEF2ED',
          border: '#DCE3DA',
        },
        amber: { DEFAULT: '#E8730A', 50: '#FDF1E4' },
        gold: { DEFAULT: '#D4A017', 50: '#FBF3DD' },
        clay: { DEFAULT: '#C23B3B', 50: '#FBEAEA' },
        slate: { DEFAULT: '#2F5D8A', 50: '#EAF1F7' },
      },
      fontFamily: {
        sans: ['Roboto', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        sm: '4px',
        DEFAULT: '6px',
        lg: '10px',
      },
    },
  },
  plugins: [],
};
