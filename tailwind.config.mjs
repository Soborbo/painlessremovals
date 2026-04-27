/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  theme: {
    extend: {
      colors: {
        // Primary: Steel Blue (trust, professionalism)
        primary: {
          50: '#edf3f8',
          100: '#d5e2ee',
          200: '#aec6dd',
          300: '#87aacb',
          400: '#608eb9',
          500: '#4777a3',
          600: '#3b6587', // Main steel blue
          700: '#31536e',
          800: '#274257',
          900: '#1d3240',
          950: '#121f28',
        },
        // Secondary: Terracotta (warmth, action)
        secondary: {
          50: '#fdf4f1',
          100: '#fbe8e1',
          200: '#f6d0c3',
          300: '#f0b09a',
          400: '#e88a6a',
          500: '#B35535', // Main terracotta (WCAG AA compliant)
          600: '#A34A2D', // Dark terracotta
          700: '#8a3f26',
          800: '#6f331f',
          900: '#5a2a1a',
          950: '#331510',
        },
        // Accent: Gold (premium, trust badges)
        accent: {
          50: '#fefaf0',
          100: '#fdf5dc',
          200: '#F5E6C8', // Light gold
          300: '#e9d5a3',
          400: '#dfc07a',
          500: '#D4A84B', // Main gold
          600: '#be923a',
          700: '#9d7830',
          800: '#7d5f28',
          900: '#674e22',
          950: '#3a2b12',
        },
        // Teal (tertiary)
        teal: {
          50: '#e6f2f2',
          100: '#c0dede',
          200: '#96c9c9',
          300: '#6bb4b4',
          400: '#4ba3a3',
          500: '#2b9393',
          600: '#1B4D4D',
          700: '#163f3f',
          800: '#113131',
          900: '#0c2323',
          950: '#071515',
        },
        // Cream backgrounds
        cream: '#FAF7F2',
        'warm-white': '#FFFFFF',
        'warm-gray': '#6B6B6B',
      },
      fontFamily: {
        heading: ['Fraunces', 'Georgia', 'serif'],
        body: ['DM Sans', 'system-ui', 'sans-serif'],
      },
      container: {
        center: true,
        padding: {
          DEFAULT: '1rem',
          sm: '1.5rem',
          lg: '2rem',
        },
      },
      maxWidth: {
        'container-wide': '1168px',
        'container-narrow': '720px',
      },
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
    require('@tailwindcss/typography'),
  ],
};
