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

説明書 UI の差分表示・更新アニメーション状態を管理する composable。ジャンル収束や選択履歴の状態は [`useGameState`](#srccomposablesusegamestatets) が保持する。

### `useManual(currentManual: () => ManualVersion)`

| 戻り値プロパティ | 型 | 概要 |
|---|---|---|
| `history` | `ref<ManualVersion[]>` | 直近の説明書バージョン履歴（最大 4 件） |
| `diffLines` | `ref<DiffLine[]>` | 直前バージョンとの行単位差分（差分なしは空配列） |
| `isAnimating` | `ref<boolean>` | 差分強調アニメーション中フラグ（約 1.5 秒で解除） |
| `isCentered` | `ref<boolean>` | 説明書パネルが中央表示中（更新演出、約 2.8 秒で解除） |
| `recordUpdate(next: ManualVersion): void` | — | 新バージョンを履歴に記録し、差分計算とアニメーションを開始 |

### `computeLineDiff(prevLines: string[], nextLines: string[]): DiffLine[]`

LCS（最長共通部分列）ベースの行単位差分。重複行も正しく扱い、差分がなければ空配列を返す。
`DiffLine = { text: string; type: 'added' | 'removed' | 'unchanged' }`。

---

## `src/composables/useScoreAnimation.ts`

スコア表示のカウントアップアニメーション composable。

### `useScoreAnimation(source: Ref<number>)`

| 項目 | 概要 |
|---|---|
| 引数 `source` | 監視対象のスコア `Ref<number>` |
| 戻り値 | `displayScore`（`Ref<number>`）。表示用にアニメーションされた値 |

`source` の変化を watch し、差分が小さい場合は即時反映、大きい場合は `requestAnimationFrame` で `ANIMATION_DURATION_MS` かけて補間する。アンマウント時に rAF を解放。

> 投擲フェーズの状態は専用 composable ではなく、`App.vue` が `game/throwEngine.ts` を直接駆動して管理する。

---

## `src/plugins/PluginManager.ts`

ユーザーがインストールしたプラグイン（ジャンル / デッキ拡張）を管理する。localStorage 永続化（利用不可時はメモリにフォールバック）。

### クラス `PluginManager`（シングルトン `pluginManager`）

| メソッド | 概要 |
|---|---|
| `loadAll(): UserPlugin[]` | 保存済みプラグインを全件読み込み |
| `install(json): { success, error? }` | JSON を検証してインストール |
| `uninstall(id): boolean` | 指定IDをアンインストール |
| `listInstalled(): UserPlugin[]` | インストール済み一覧 |

`GenrePlugin` / `DeckExtensionPlugin` インターフェースも定義する。

---

## `src/plugins/JSONGenrePlugin.ts`

JSON 定義からジャンルの視覚テーマを生成するプラグイン。TSプラグインを持たない JSON ジャンルのフォールバックとして `genres/index.ts` が利用する。

| エクスポート | 概要 |
|---|---|
| `class JSONGenrePlugin` | `GenreJsonDef`（id / theme / visual）から `GenrePlugin` 相当を構築 |
| `interface GenreJsonDef` | JSON ジャンル定義のスキーマ |

---

## `src/plugins/SoundManager.ts`

BGM フェードイン/アウトと効果音フックを管理する。

### クラス `SoundManager`（シングルトン `soundManager`）

| メソッド | 概要 |
|---|---|
| `playBgm(config: BgmConfig)` | BGM 再生（フェードイン） |
| `stopBgm(fadeOutMs?)` | BGM 停止（フェードアウト） |
| `register(impl: Partial<SoundHooks>)` | 効果音フック実装を登録 |
| `onJump / onShoot / onHit / onGenreLock / onBeat …` | `SoundHooks` の各イベントフック |

> 音声ファイルが存在しない場合、再生はスキップされる（オフライン動作を阻害しない）。
