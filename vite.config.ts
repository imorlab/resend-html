import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // ⚠️ Cambia '/resend-html/' por el nombre real de tu repo de GitHub
  base: '/resend-html/',
})
