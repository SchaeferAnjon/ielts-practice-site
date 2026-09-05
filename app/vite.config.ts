import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  // GitHub Pages 部署在 /ielts-practice-site/ 子路径；本地 dev 与 Vercel 用 /
  base: process.env.GITHUB_PAGES ? '/ielts-practice-site/' : '/',
  plugins: [react()],
})
