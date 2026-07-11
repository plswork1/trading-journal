import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Proxy către feed-ul gratuit ForexFactory ca să evităm CORS în browser
      // (doar pentru `npm run dev`; în producție face același lucru vercel.json)
      '/api/ffcal': {
        target: 'https://nfs.faireconomy.media',
        changeOrigin: true,
        rewrite: () => '/ff_calendar_thisweek.json',
      },
    },
  },
});
