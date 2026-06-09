# `src/composables/`・`src/plugins/` — Vue Composables と Vite プラグイン

---

## `src/composables/useGameState.ts`

ゲーム状態管理 composable。

### `useGameState()`

| 戻り値プロパティ | 型 | 概要 |
|---|---|---|
| `phase` | `ref<Phase>` | ゲームフェーズ（title, tutorial, updating, playing, genreLocked, throwing, ending） |
| `distance` | `ref<number>` | 走行距離 |
| `playScore` | `ref<number>` | プレイスコア |
| `throwScore` | `ref<number>` | 投擲スコア |
| `totalScore` | `ref<number>` | 合計スコア |
| `combo` | `ref<number>` | 現在コンボ |
| `maxCombo` | `ref<number>` | 最高コンボ |
| `kills` | `ref<number>` | 撃破数 |
| `hp` | `ref<number>` | 現在HP |
| `maxHp` | `ref<number>` | 最大HP |
| `exp` | `ref<number>` | 累積EXP |
| `beatHits` | `ref<number>` | ビートヒット数 |
| `survivedSec` | `ref<number>` | 生存秒数 |
| `shouldUpdate` | `ref<number \| null>` | 説明書更新トリガー（null = 更新不要） |
| `firstJumpDone` | `ref<boolean>` | 初ジャンプ完了フラグ |
| `dead` | `ref<boolean>` | 死亡フラグ |
| `updateFromSnapshot(snapshot: GameSnapshot): void` | — | SideScroller のスナップショットから全状態を更新 |

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
