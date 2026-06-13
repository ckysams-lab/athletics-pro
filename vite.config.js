import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite' // 👉 確保有引入 Tailwind v4 外掛

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(), // 👉 確保這裡有啟動它
  ],
})
