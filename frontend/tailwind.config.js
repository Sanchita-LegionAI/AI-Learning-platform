/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        saffron:  '#E8871E',
        'saffron-light': '#FDF0E0',
        'saffron-dark':  '#C06B10',
        forest:   '#2D7A4F',
        'forest-light':  '#E8F5EE',
        'forest-dark':   '#1E5435',
        cream:    '#FFFDF7',
        ink:      '#1A1A2E',
        'ink-light': '#4A4A6A',
        border:   '#E8E0D0',
        'border-dark': '#C8B89A',
      },
      fontFamily: {
        ui:      ['Hind Siliguri', 'sans-serif'],
        bengali: ['Tiro Bangla', 'serif'],
      },
      maxWidth: { app: '640px' },
      boxShadow: {
        card: '0 2px 12px rgba(26,26,46,0.08)',
        'card-hover': '0 4px 20px rgba(26,26,46,0.14)',
      },
    },
  },
  plugins: [],
}
