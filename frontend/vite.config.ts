import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
    // Single React copy — @remotion/player crashes otherwise
    // ("Invalid hook call" / null useContext in dev).
    dedupe: ['react', 'react-dom', 'react/jsx-runtime', 'remotion'],
  },
})
