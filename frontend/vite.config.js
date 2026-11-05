import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // "npm run dev" fora do Docker: manda /api para o backend local
    proxy: { '/api': 'http://localhost:8080' },
  },
});
