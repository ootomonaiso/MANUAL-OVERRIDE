# Vue → React 移行計画（Vite 除去含む）— 却下済み・不採用

> **ステータス: 却下（不採用）。実行予定なし。**
> 本文末尾「推奨しない理由」の通り、移行コストに見合うメリットがないと判断済み。
> このファイルは「検討した上で見送った」記録として`plan/`に残しているだけで、進行中のロードマップではない。
> 再検討する場合も、まずここに書かれた不採用理由が解消されているか確認すること。

## 概要

現状: Vue 3 (Composition API) + Vite + TypeScript  
移行後: React 19 + Parcel + TypeScript  

---

## 変えるもの・変えないもの

### 変えない（TypeScript のみ、フレームワーク非依存）

| パス | 内容 |
|---|---|
| `src/domain/` | genreResolver, scoreCalc, ruleEngine, LearningSystem, types |
| `src/engine/` | FeatureSystem, GameRegistry, GenrePlugin*, index |
| `src/framework/` | ConfigLoader, ManualBuilder, ManualLoader, Validator 系 |
| `src/game/` | sideScroller, throwEngine, entities |
| `src/genres/` | 14 ジャンルプラグイン全部 |
| `src/plugins/` | JSONGenrePlugin, PluginManager, SoundManager |
| `src/data/` | config, gameBalance, genres, manualDeck, tunables |
| `tests/` | Playwright テスト（HTML の構造が変わらなければほぼそのまま） |

**ゲームロジックは一行も書き直さない。**

### 書き直すもの（Vue 固有）

| 現ファイル | 変換先 | 作業量 |
|---|---|---|
| `src/main.ts` | React の `createRoot` に差し替え | 5 行 |
| `src/App.vue` | `src/App.tsx` | 大（300 行超、ロジック多い） |
| `src/components/Hud.vue` | `src/components/Hud.tsx` | 小 |
| `src/components/ManualPanel.vue` | `src/components/ManualPanel.tsx` | 中 |
| `src/components/ChoicePanel.vue` | `src/components/ChoicePanel.tsx` | 小 |
| `src/components/ThrowOverlay.vue` | `src/components/ThrowOverlay.tsx` | 中 |
| `src/components/EndingPanel.vue` | `src/components/EndingPanel.tsx` | 小 |
| `src/components/TutorialHints.vue` | `src/components/TutorialHints.tsx` | 小 |
| `src/components/PluginLoader.vue` | `src/components/PluginLoader.tsx` | 小 |
| `src/tutorial/TutorialScreen.vue` | `src/tutorial/TutorialScreen.tsx` | 小 |
| `src/composables/useGameState.ts` | `src/hooks/useGameState.ts` | ほぼそのまま |
| `src/composables/useManual.ts` | `src/hooks/useManual.ts` | ほぼそのまま |
| `vite.config.ts` | 削除（Parcel はゼロコンフィグ） | — |
| `index.html` | `<script>` タグを Parcel 向けに修正 | 1 行 |
| `tsconfig.json` | `jsx: "react-jsx"` に変更 | 1 行 |

---

## Vite の代替: Parcel を選ぶ理由

### 選択肢比較

| ツール | 設定量 | TSX サポート | CSS/資産 | file:// 出力 | 備考 |
|---|---|---|---|---|---|
| **Parcel** | ゼロ | ネイティブ | 自動 | `--public-url ./` で OK | **推奨** |
| esbuild CLI | 少 | ネイティブ | 手動 | 可 | CSS バンドルが弱い |
| Webpack 5 | 多 | babel/ts-loader | 完全 | 可 | 設定ファイル大量 |
| Rollup | 中 | プラグイン要 | プラグイン要 | 可 | Vite の内部なのでほぼ同じ |
| import maps | なし | 不要 | 不要 | ブラウザ依存 | オフライン要件でリスク大 |

Parcel を選ぶ根拠:
- Vite と同様に「設定ファイルなし」で始められる
- `parcel build index.html --public-url ./` で `dist/` に相対パスで出力（file:// で開ける）
- TypeScript + TSX を追加設定なしで処理
- `import.meta.env.DEV` → `process.env.NODE_ENV === 'development'` に置き換えるだけ

---

## Vue → React の API マッピング

### リアクティビティ

| Vue | React |
|---|---|
| `ref(x)` | `useState(x)` |
| `computed(() => x)` | `useMemo(() => x, [deps])` |
| `watch(src, cb)` | `useEffect(() => { cb() }, [deps])` |
| `onMounted(fn)` | `useEffect(() => { fn() }, [])` |
| `onUnmounted(fn)` | `useEffect(() => () => fn(), [])` |
| `ref<HTMLCanvasElement>` | `useRef<HTMLCanvasElement>(null)` |

### テンプレート構文

| Vue | React (JSX) |
|---|---|
| `v-if="cond"` | `{cond && <Comp />}` または三項演算子 |
| `v-for="x in xs"` | `{xs.map(x => <Item key={x.id} />)}` |
| `v-model="val"` | `value={val} onChange={e => setVal(e.target.value)}` |
| `@click="fn"` | `onClick={fn}` |
| `@emit('name', val)` | props として callback を受け取る: `onName={fn}` |
| `<Transition name="fade">` | CSS クラス手動 or `react-transition-group` |
| `:prop="val"` | `prop={val}` |

### コンポジション → カスタムフック

`composables/useGameState.ts` の中身はほぼそのまま React カスタムフックになる。
`ref()` を `useState()` に、`computed()` を `useMemo()` に置き換えるだけで構造は同一。

### Transition（最大の差分）

Vue の `<Transition>` はビルトイン。React には相当品がなく 3 択:
1. **CSS のみ**: フェード系は `opacity + transition` の class 付け外しで自前実装（推奨・依存不要）
2. `react-transition-group`: Vue の Transition に近い API
3. `framer-motion`: 高機能だがバンドルサイズ増

このプロジェクトはフェード・スライドが中心なのでオプション 1 で十分。

---

## 実装ステップ

### Step 1 — 依存関係の入れ替え（30 分）

```bash
# 削除
npm uninstall vue @vitejs/plugin-vue vite vue-tsc

# 追加
npm install react react-dom
npm install -D @types/react @types/react-dom parcel typescript
```

### Step 2 — ビルド設定（15 分）

**`tsconfig.json`** に追加:
```json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler"
  }
}
```

**`package.json`** スクリプト変更:
```json
{
  "scripts": {
    "dev":     "parcel index.html",
    "build":   "parcel build index.html --public-url ./",
    "preview": "npx serve dist",
    "test":    "playwright test"
  }
}
```

**`index.html`** の `<script>` を変更:
```html
<!-- Before (Vite) -->
<script type="module" src="/src/main.ts"></script>

<!-- After (Parcel) -->
<script type="module" src="./src/main.tsx"></script>
```

### Step 3 — エントリポイント（10 分）

`src/main.tsx`:
```tsx
import { createRoot } from 'react-dom/client'
import App from './App'

createRoot(document.getElementById('app')!).render(<App />)
```

### Step 4 — カスタムフックの移植（1 時間）

`src/composables/useGameState.ts` → `src/hooks/useGameState.ts`
- `ref(x)` → `useState(x)` / `useRef(x)`
- `computed()` → `useMemo()`
- `readonly` ref を返すパターン → state の値と setter を返すパターンに変更

`src/composables/useManual.ts` → `src/hooks/useManual.ts` (同様)

### Step 5 — コンポーネント移植（3〜4 時間）

優先順位（小さい順に始める）:

1. `Hud.tsx` — props を受け取って表示するだけ、ほぼ変換作業
2. `ChoicePanel.tsx` — 同上
3. `EndingPanel.tsx` — 同上
4. `TutorialHints.tsx` — 同上
5. `PluginLoader.tsx` — 副作用のみ（useEffect に移植）
6. `ManualPanel.tsx` — アニメーションあり、CSS クラス制御注意
7. `ThrowOverlay.tsx` — ドラッグロジック + canvas あり
8. `TutorialScreen.tsx` — 中規模
9. `App.tsx` — 最後。他が揃ってから

### Step 6 — `import.meta.env` の置き換え（15 分）

`App.vue:103`:
```ts
// Before
if (import.meta.env.DEV && snapshot.value.scoreFormulaError) {

// After
if (process.env.NODE_ENV === 'development' && snapshot.scoreFormulaError) {
```

Parcel は `process.env.NODE_ENV` を自動でインライン化する。

### Step 7 — Transition の代替実装（1 時間）

Vue の `<Transition name="fade">` はすべて CSS クラスの付け外しで再現:

```tsx
// ユーティリティコンポーネント（20 行で実装可能）
function FadeTransition({ show, children }: { show: boolean; children: React.ReactNode }) {
  const [mounted, setMounted] = useState(show)
  useEffect(() => { if (show) setMounted(true) }, [show])
  return mounted ? (
    <div
      className={show ? 'fade-enter' : 'fade-leave'}
      onTransitionEnd={() => { if (!show) setMounted(false) }}
    >
      {children}
    </div>
  ) : null
}
```

### Step 8 — テスト確認（30 分）

Playwright テストは HTML の構造・セレクタ依存。コンポーネントで同じ `class` / `data-testid` を維持していれば多くはそのまま通る。

---

## リスク・注意点

### 高リスク

| 項目 | 内容 | 対策 |
|---|---|---|
| `<Transition>` | Vue のアニメーション挙動の再現が手間 | `react-transition-group` を検討 |
| `App.vue` の `watch` | `watch(gameState.phase, cb)` が複数 → `useEffect` の依存配列管理が難しい | state を flatten して整理してから移植 |
| `ThrowOverlay` | ドラッグ + canvas の複合ロジック | 最後に移植、独立テストを先に書く |

### 中リスク

| 項目 | 内容 |
|---|---|
| Parcel の CSS ハッシュ | Playwright が `.giveup-btn` 等のクラスを直接使っていれば問題なし |
| `PluginLoader.vue` | Vue の動的コンポーネント相当を useEffect でどう再現するか |
| `import.meta.hot` | 使っていないので問題なし |

### 低リスク（ほぼそのまま動く）

- Canvas ゲームロジック（`SideScroller`, `throwEngine`）
- JSON データ、ジャンルプラグイン
- TypeScript 型定義
- Playwright テストの大半

---

## 工数見積もり

| 作業 | 見積もり |
|---|---|
| 依存・設定変更 | 1 時間 |
| カスタムフック 2 本 | 1.5 時間 |
| 小コンポーネント 6 本 | 2 時間 |
| ManualPanel + ThrowOverlay | 2 時間 |
| App.tsx（最大難所） | 3 時間 |
| Transition 代替 | 1 時間 |
| テスト修正・動作確認 | 1.5 時間 |
| **合計** | **約 12 時間** |

---

## 推奨しない理由（参考）

このプロジェクトに限っては、移行コストに対するメリットが薄い:

- Vue の Composition API と React hooks は概念がほぼ同一で、得られるものが少ない
- `.vue` SFC のスタイルスコープを失う（`<style scoped>` → CSS Modules か手動管理）
- Vite 除去で Vite 固有の恩恵（HMR 高速化、plugin エコシステム）を手放す
- Parcel は安定しているが Vite より実績が少ない

「React で書きたい」「Vite を外したい」という明確な動機があるなら、上記手順で問題なく実行できる。
