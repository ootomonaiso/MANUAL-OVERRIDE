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
| `isCentered` | `ref<boolean>` | 説明書パネルが中央表示中（更新アニメーション時） |
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

## `src/plugins/JSONGenrePlugin.ts`

JSON 定義から GenrePlugin を生成するアダプター。テンプレート（runner, space, dungeon, rhythm, puzzle）に基づいて既存の GenrePlugin へ描画処理を委譲。

### クラス `JSONGenrePlugin`

| プロパティ | 型 | 概要 |
|---|---|---|
| `id` | `GenreId` | ジャンルID |
| `_template` | `'runner' \| 'space' \| 'dungeon' \| 'rhythm' \| 'puzzle'` | 視覚テンプレート |
| `_delegate` | `PluginBase \| null` | 委譲先 GenrePlugin |

| メソッド | 概要 |
|---|---|
| `drawFarLayer()` | 委譲先の遠景描画 |
| `drawMidLayer()` | 委譲先の中景描画 |
| `drawPlayer()` | 委譲先のプレイヤー描画 |
| `drawHazard()` | 委譲先のハザード描画 |
| `onPlayerJump()` | noop（デフォルト） |
| `onPlayerLand()` | noop（デフォルト） |
| `onHazardDestroyed()` | noop（デフォルト） |

---

## `src/plugins/PluginManager.ts`

GenrePlugin の管理・登録・取得を行うマネージャー。

### エクスポート関数

| 関数 | 概要 |
|---|---|
| `registerPlugin(plugin: GenrePlugin): void` | プラグインを登録 |
| `getPlugin(id: string): GenrePlugin \| null` | ID でプラグインを取得 |
| `getAllPlugins(): GenrePlugin[]` | 全登録プラグインを返す |
