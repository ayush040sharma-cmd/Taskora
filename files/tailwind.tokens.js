/**
 * TASKORA — tailwind.config.js extension
 * Mirrors tokens.css 1:1 so designers/devs can use either utility classes
 * or the .tk-* primitive classes interchangeably without value drift.
 *
 * Usage: merge this `theme.extend` block into your existing tailwind.config.js
 */

/** @type {import('tailwindcss').Config} */
module.exports = {
  theme: {
    extend: {
      colors: {
        tk: {
          bg: '#020617',
          'bg-elevated': '#0F172A',
          card: '#0B1220',
          'card-2': '#0F1E30',
          border: '#1E293B',
          accent: '#3B82F6',
          'accent-2': '#06B6D4',
          text: {
            primary: '#E2E8F0',
            secondary: '#94A3B8',
            muted: '#475569',
            faint: '#334155',
          },
          status: {
            ok: '#22C55E',
            warn: '#F59E0B',
            danger: '#EF4444',
          },
        },
      },
      backgroundImage: {
        'tk-gradient': 'linear-gradient(90deg, #3B82F6, #06B6D4)',
        'tk-gradient-vert': 'linear-gradient(180deg, #3B82F6, #06B6D4)',
        'tk-hero-glow':
          'radial-gradient(ellipse 70% 60% at 50% 0%, rgba(59,130,246,0.12) 0%, transparent 70%)',
      },
      fontFamily: {
        display: ['Syne', 'sans-serif'],
        body: ['DM Sans', 'sans-serif'],
      },
      fontSize: {
        'tk-h1': '36px',
        'tk-h2': '24px',
        'tk-h3': '20px',
        'tk-body': '14px',
        'tk-small': '12px',
        'tk-micro': '10px',
      },
      borderRadius: {
        'tk-card': '12px',
        'tk-card-lg': '16px',
        'tk-btn': '10px',
        'tk-pill': '20px',
      },
      // semantic background-tint utilities for status pills (bg-tk-status-ok/15 etc.)
      // Tailwind's built-in opacity modifiers (bg-tk-status-ok/15) already cover this
      // once the colors above are registered — no extra config needed.
    },
  },
};
