import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { contentEditorPlugin } from './scripts/contentEditorPlugin.mjs'

export default defineConfig({
  plugins: [vue(), contentEditorPlugin()],
  base: './',  // dist/ を file:// で開いても動くよう相対パス
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
  },
})
