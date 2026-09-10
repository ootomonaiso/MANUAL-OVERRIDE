import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  base: './',  // dist/ を file:// で開いても動くよう相対パス
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
  },
  server: {
    // PORT が指定されていれば厳密にそのポートを使う（未指定ならデフォルトの自動選択）。
    // 開発ツールの外部プレビューがポート番号を前提に接続するため、無断で別ポートへ
    // フォールバックさせない。
    port: process.env.PORT ? Number(process.env.PORT) : undefined,
    strictPort: !!process.env.PORT,
  },
})
