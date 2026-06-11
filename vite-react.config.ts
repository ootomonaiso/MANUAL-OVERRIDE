import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [
    react({ tsconfig: './tsconfig-react.json' }),
    {
      name: 'ignore-vue',
      transform(_: string, id: string) {
        if (id.endsWith('.vue')) return { code: 'export default {}', map: null }
      },
    },
  ],
  base: './',
  build: {
    outDir: 'dist-react',
    assetsDir: 'assets',
    rollupOptions: {
      input: 'index-react.html',
    },
  },
  server: {
    open: '/index-react.html',
  },
})
