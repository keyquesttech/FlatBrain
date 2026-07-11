import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Proxy API calls to the Express backend during `npm run dev`.
      // Matches the backend's default port (see server.js).
      '/api': 'http://localhost:80'
    }
  }
})
