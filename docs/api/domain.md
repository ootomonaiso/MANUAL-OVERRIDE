# `src/domain/` — 型定義・ゲームロジック

ゲーム全体の型定義と純粋関数ロジックを収める。

---

## `types.ts`

全ゲームの型定義を一元管理するファイル。

### 型・インターフェース

| 型 | 概要 |
|---|---|
| `GenreParam` | ジャンル分岐の軸パラメータ (12種: tempo, range, enemy, combo, growth, rhythm, stealth, vertical, aerial, survive, craft, speed) |
| `GenreParams` | `Partial<Record<GenreParam, number>>` — 軸パラメータのマップ |
| `GenreId` | ジャンルID。実体は `string` 型（union ではない）。定義は 22種（base 含む）: base, runner, stg, rpg, puzzle, rhythm, aerial_stg, bullet_hell, survival, stealth_action, racing, platformer, dungeon, tower_def, sports, idle, bullet_runner, arena, aquatic, horror, hack_slash, tetris |
| `Phase` | ゲームフェーズ (`title`, `tutorialIntro`, `tutorial`, `updating`, `playing`, `genreLocked`, `throwing`, `ending`) |
| `ManualTheme` | 説明書テーマ (15種: `plain`, `stg`, `rpg`, `puzzle`, `rhythm`, `horror`, `aquatic`, `runner`, `stealth`, `racing`, `platformer`, `dungeon`, `hack_slash`, `survival`, `tetris`) |
| `ScrollDirection` | スクロール方向 (`horizontal`, `vertical`, `none`) |
| `EnvironmentId` | 環境設定 (`ground`, `sky`, `space`, `ocean`, `dungeon`, `forest`, `city`) |
| `FeatureId` | Feature フラグ。実体は `string` 型（union ではない）。既知の ID: shoot, three_way, charge_shot, spread_shot, bomb, enemy_hp, boss, movement, auto_run, slow_precise, double_jump, long_air, dash, wall_jump, slide, gravity_flip, vertical_scroll, hp, exp, item_pickup, shield, grid_stop, puzzle_solve, beat_hazard, just_input, beat_dash, stealth_mode, time_bonus, tower, color_touch, tetris_mode |
| `Controls` | キー設定 (`jump`, `moveLeft`, `moveRight`, `moveUp`, `moveDown`, `shoot?`, `dash?`, `slide?`) |
| `Choice` | 説明書選択肢 (`id`, `label`, `hint?`, `next`, `genreParams`, `paramMultiplier?`) |
| `ManualRuntimeConfig` | バージョン固有のruntime上書き (`scrollSpeed?`, `gravity?`, `bpm?`, `scrollDirection?`, `environment?`, `playerMaxHp?`, `timescale?`, `colorTouchScore?`, `forceGenreId?`) |
| `ManualVersion` | 説明書バージョン (`version`, `manualText[]`, `image?`, `imageAlt?`, `choices[]`, `controls`, `hazards`, `runtimeConfig?`, `tutorialHint?`, `narrative?`, `learningRules?`) |
| `GenreDef` | ジャンル定義 (`id`, `label`, `thresholds`, `enableFeatures[]`, `disableFeatures[]`, `scoreFormula`, `manualReveal`, `theme`, `bgColor`, `environment?`, `scrollDirection?`, `gravity?`, `endingFlavor?`) |
| `RuntimeRules` | 合成済みルール (`controls`, `hazardColors`, `safeColors`, `features`, `genre`, `scrollSpeed`, `bpm`, `gravity`, `scrollDirection`, `environment`, `playerMaxHp`, `timescale`, `scrollAxis`, `colorTouchScore`) |
| `ActionStats` | 行動統計 (`jumps`, `moveRight`, `moveLeft`, `shots`, `ticks`, `dashes?`) |
| `LearningTrigger` | 行動トリガー (`type: 'jumpRate' | 'rightRate' | 'leftRate' | 'shotRate' | 'dashRate'`, `threshold`, `triggerAbove?`) |
| `LearningEffect` | 行動効果 (`type: 'disableAction' | 'invertHazard' | 'forceFeature' | 'changeKey'`, `payload`, `durationSec?`) |
| `LearningRule` | 学習ルール (`id`, `trigger`, `effect`, `triggered`) |
| `ThrowResult` | 投擲結果 (`airTime`, `arcHeight`, `speed`) |
| `FinalScore` | 最終スコア (`play`, `throw`, `total`) |
| `ScoreVars` | スコア計算変数 (`distance`, `kills`, `combo`, `exp`, `beatHits`, `survivedSec`, `accuracy`, `maxCombo`, `deaths`, `itemsCollected`, `bossKills`, `stealthBonus`, `colorTouches`) |

---

## `genreResolver.ts`

ジャンル収束アルゴリズム。

### エクスポート関数

| 関数 | 概要 |
|---|---|
| `accumulateParams(paramsList: GenreParams[]): GenreParams` | 選択履歴から genreParams を単純合算 |
| `resolveGenre(accumulated: GenreParams, genres: GenreDef[]): GenreId` | 累積パラメータからジャンルを決定（超過量最大のものを選択） |
| `resolveFeaturesForGenre(genreId, genres): { enable: Set<FeatureId>, disable: Set<FeatureId> }` | ジャンルの enable/disable features を取得 |
| `resolveGenreProgress(accumulated, genres): { closestGenre: GenreId, progress: number }` | 収束の近さを 0〜1 で返す（UI 演出用） |
| `resolveAllGenreProgress(accumulated, genres)` | 全ジャンルの進捗を返す |
| `resolveAllMetGenres(accumulated, genres): GenreId[]` | 収束済みの全ジャンルを返す（「◯◯にもできた」表示用） |

### ベイズ収束（主方式）

現在の主たる収束判定はベイズ事後確率方式。各軸の閾値との乖離量から尤度 `L = exp(-decayRate × deviation)` を求め、事後確率で収束を判定する（ハイパーパラメータは `config/bayes.json`）。

| 関数 | 概要 |
|---|---|
| `accumulateGenrePoints(history)` | 選択履歴から genrePoints（ジャンル直接ポイント）を合算 |
| `computeBayesianPosteriors(accumulated, genres, config)` | 各ジャンルの事後確率を計算 |
| `initBayesianState(genres): BayesianState` | ベイズ状態（事後分布）を初期化 |
| `updateBayesianState(state, accumulated, genres, config): BayesianState` | 1選択分の事後分布を更新し収束判定 |
| `resolveHighestProbGenre(accumulated, genres, config): GenreId` | 最尤ジャンルを返す |
| `getGenreDistribution(accumulated, genres, config)` | デバッグ用に上位ジャンルの確率分布を返す |
| `DEFAULT_BAYES_CONFIG` | `bayes.json` 不在時のフォールバック設定 |

---

## `ruleEngine.ts`

ルール合成エンジン。選択履歴と現在のバージョンから RuntimeRules を合成する。

### エクスポート関数

| 関数 | 概要 |
|---|---|
| `buildRuntimeRules(currentVersion: ManualVersion, history: ChoiceRecord[], lockedGenre: GenreId \| null): RuntimeRules` | 選択履歴から RuntimeRules を合成。適用順序: 1) genreParams累積 → 2) ジャンル解決 → 3) features合成 → 4) runtimeConfig上書き |
| `nextVersionKey(deck, currentKey, choiceId): string \| null` | 選択をたどって次バージョンキーを返す |
| `accumulateParams` | `genreResolver` から再エクスポート（後方互換） |

### インターフェース

| 型 | 概要 |
|---|---|
| `ChoiceRecord` | 選択履歴 (`versionKey`, `choiceId`, `genreParams`, `paramMultiplier?`) |

---

## `scoreCalc.ts`

スコア計算。

### エクスポート関数

| 関数 | 概要 |
|---|---|
| `evalScoreFormula(formula: string, vars: ScoreVars): number` | 安全なスコア式パーサ（eval 禁止、四則演算 + 括弧 + 変数） |
| `calcThrowScore(result: ThrowResult): number` | 投擲スコア計算（airTime, arcHeight, speedPenalty） |
| `calcFinalScore(playScore, throwScore): FinalScore` | 最終スコア合算（play:throw 比率適用） |

---

## `LearningSystem.ts`

プレイヤーの行動統計を監視し、LearningRule のトリガーを評価する。

### エクスポート関数

| 関数 | 概要 |
|---|---|
| `evaluateLearningRules(rules: LearningRule[], stats: ActionStats): LearningEffect[]` | 未発動ルールを評価し、新たに発動したエフェクトを返す（in-place で triggered を true に書き換え） |
| `describeEffect(effect: LearningEffect): string` | エフェクトの人間可読ラベルを返す（デバッグ用） |
