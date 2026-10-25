/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        bg: '#0E1116',
        card: '#181C24',
        'card-alt': '#1F2430',
        line: '#232933',
        ink: '#F3F4F6',
        muted: '#9AA3B2',
        amber: '#F2B544',
        sky: '#63C7F2',
        danger: '#F07167',
        ok: '#5BD69B',
      },
      fontFamily: {
        display: ['Sora_600SemiBold'],
        'display-bold': ['Sora_700Bold'],
        body: ['Manrope_500Medium'],
        'body-semibold': ['Manrope_600SemiBold'],
        'body-bold': ['Manrope_700Bold'],
      },
      borderRadius: {
        card: '20px',
        tile: '16px',
      },
    },
  },
  plugins: [],
};
