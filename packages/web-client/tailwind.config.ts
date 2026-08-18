import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        blood: '#7f1d1d',
        rose: '#f5f0e8',
        iron: '#1c1917',
        cathedral: '#0c0a09',
      },
    },
  },
  plugins: [],
} satisfies Config;
