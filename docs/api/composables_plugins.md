# `src/composables/`・`src/plugins/`・`src/tutorial/` — Vue Composables、Vite プラグイン、チュートリアル

---

## `src/tutorial/` — チュートリアルモジュール

ゲームの本体から分離されたチュートリアル機能。`src/tutorial/` ディレクトリを削除/無効化することで、チュートリアルなしでゲームを動作可能。

### `const.ts`

| エクスポート | 型 | 概要 |
|---|---|---|
| `TUTORIAL_ENABLED` | `boolean` | チュートリアル有効/無効フラグ（`false` でスキップ） |

### `TutorialScreen.vue`

| プロパティ/イベント | 概要 |
|---|---|
| `@start` | 「わかった、プレイする」ボタンクリック時 |

### `index.ts`

| エクスポート | 概要 |
|---|---|
| `TUTORIAL_ENABLED` | `const.ts` から再エクスポート |
| `TutorialScreen` | `TutorialScreen.vue` コンポーネント |

---

## `src/composables/useGameState.ts`

ゲーム状態管理 composable。

### `useGameState()`

| 戻り値プロパティ | 型 | 概要 |
|---|---|---|
| `phase` | `readonly<Ref<Phase>>` | ゲームフェーズ（title → tutorialIntro → tutorial → updating → playing/genreLocked → throwing → ending） |
| `rules` | `readonly<RuntimeRules>` | 現在有効なルール |
| `currentVersionKey` | `readonly<Ref<string>>` | 現在表示中のマニュアルバージョンキー |
| `choiceHistory` | `readonly<ChoiceRecord[]>` | 選択履歴 |
| `lockedGenre` | `readonly<Ref<GenreId \| null>>` | 確定済みジャンル |
| `finalScore` | `readonly<Ref<FinalScore \| null>>` | 最終スコア |
| `currentManual()` | `() => ManualVersion` | 現在バージョンの ManualVersion を返す |
| `lockedGenreDef()` | `() => GenreDef \| null` | 確定ジャンルの定義を返す |
| `startGame(): void` | — | ゲーム開始（phase → tutorialIntro、ゲームエンジン一時停止） |
| `startTutorial(): void` | — | チュートリアル完了（phase → tutorial、ゲーム再開） |
| `triggerUpdate(): void` | — | 説明書更新トリガー（phase → updating） |
| `choose(choiceId: string): void` | — | 選択肢選択（履歴記録・ジャンル収束チェック） |
| `startThrowing(playScore: number): void` | — | 投擲フェーズ開始（phase → throwing） |
| `finalizeThrowing(result, playScore): void` | — | 投擲完了・最終スコア計算（phase → ending） |
| `restart(): void` | — | 全状態を初期化（phase → title） |

---

## `src/composables/useManual.ts`

説明書 UI 状態管理 composable。

### `useManual()`

| 戻り値プロパティ | 型 | 概要 |
|---|---|---|
| `currentKey` | `ref<string>` | 現在表示中のバージョンキー |
| `currentVersion` | `ref<ManualVersion \| null>` | 現在の ManualVersion |
| `deck` | `Record<string, ManualVersion>` | MANUAL_DECK（readonly） |
| `versionIndex` | `ref<number>` | 選択履歴インデックス |
| `genreProgress` | `ref<{ closestGenre: GenreId, progress: number } \| null>` | ジャンル収束進行状況 |
| `metGenres` | `ref<GenreId[]>` | 収束済みジャンル一覧 |
| `currentGenre` | `ref<GenreId \| null>` | 現在のジャンル |
| `lockedGenre` | `ref<GenreId \| null>` | 確定済みジャンル |
| `accumulatedParams` | `ref<GenreParams>` | 累積ジャンルパラメータ |
| `genreParamMultiplier` | `ref<number>` | パラメータ倍率（選択ごと） |
| `history` | `ref<ChoiceRecord[]>` | 選択履歴 |
| `theme` | `ref<ManualTheme>` | 説明書テーマ |
| `narrative` | `ref<string>` | ナラティブテキスト |
| `tutorialHint` | `ref<string>` | チュートリアルヒント |
| `isUpdating` | `ref<boolean>` | 説明書更新中フラグ |
| `updateCount` | `ref<number>` | 更新回数 |
| `advanceTo(key: string): void` | — | 指定キーのバージョンに移動（deck 参照） |
| `selectChoice(choice: Choice, multiplier?: number): void` | — | 選択肢選択（履歴記録 + パラメータ累積） |
| `reset(): void` | — | 全状態を初期化 |

---

## `src/composables/useThrow.ts`

投擲フェーズ状態管理 composable。

### `useThrow()`

| 戻り値プロパティ | 型 | 概要 |
|---|---|---|
| `state` | `ref<ThrowState>` | 投擲エンジン状態 |
| `onDragStart(x, y): void` | — | ドラッグ開始 |
| `onDragMove(x, y): void` | — | ドラッグ中更新 |
| `onRelease(): void` | — | 放投 |
| `update(dt, canvasHeight): void` | — | 物理更新 |
| `reset(): void` | — | 状態リセット |

---

## `src/plugins/validateConfigs.ts`

Vite プラグイン。開発時に MANUAL_DECK と GAME_CONFIG の整合性を自動検証。

### エクスポート関数

| 関数 | 概要 |
|---|---|
| `validateConfigs(): Plugin` | Vite プラグインファクトリ（dev モードでのみ `buildStart` で検証実行） |
