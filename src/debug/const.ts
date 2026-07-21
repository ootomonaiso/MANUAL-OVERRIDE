/**
 * DEV ビルド（`vite build --mode development` 含む）でのみデバッグUIを有効化する。
 * DebugPanel は静的 import のため本番ビルドでもコードはバンドルに残る（tree-shake されない）
 * が、この値が false のときは v-if で描画されない。バンドルサイズは CI の bundle-size チェックで監視。
 */
export const DEBUG_MODE = import.meta.env.DEV
