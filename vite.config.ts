/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base 使用相对路径，保证 GitHub Pages 项目站点（/仓库名/）下资源可正常加载。
// 如需部署到自定义域名或根路径，可用环境变量覆盖：VITE_BASE=/ npm run build
export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE ?? './',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three', '@react-three/fiber', '@react-three/drei'],
          math: ['mathjs'],
        },
      },
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
