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
| `GenreId` | ジャンルID (20種 + base: runner, stg, rpg, puzzle, rhythm, aerial_stg, bullet_hell, survival, stealth_action, racing, platformer, dungeon, tower_def, sports, idle, bullet_runner, arena, aquatic, horror, hack_slash) |
| `Phase` | ゲームフェーズ (`title`, `tutorialIntro`, `tutorial`, `updating`, `playing`, `genreLocked`, `throwing`, `ending`) |
| `ManualTheme` | 説明書テーマ (`plain`, `stg`, `rpg`, `puzzle`, `rhythm`, `horror`, `aquatic`) |
| `ScrollDirection` | スクロール方向 (`horizontal`, `vertical`, `none`) |
| `EnvironmentId` | 環境設定 (`ground`, `sky`, `space`, `ocean`, `dungeon`, `forest`, `city`) |
| `FeatureId` | Feature フラグ (30種: shoot, three_way, charge_shot, spread_shot, bomb, enemy_hp, boss, auto_run, slow_precise, double_jump, long_air, dash, wall_jump, slide, gravity_flip, vertical_scroll, hp, exp, item_pickup, shield, grid_stop, puzzle_solve, beat_hazard, just_input, beat_dash, stealth_mode, time_bonus, tower, color_touch) |
| `Controls` | キー設定 (`jump`, `moveLeft`, `moveRight`, `moveUp`, `moveDown`, `shoot?`, `dash?`, `slide?`) |
| `Choice` | 説明書選択肢 (`id`, `label`, `hint?`, `next`, `genreParams`, `genrePoints?`, `paramMultiplier?`) |
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
| `BayesianState` | ベイズ更新の状態 (`posteriors`, `converged`, `convergedGenre`, `updateCount`) |
| `BayesConfig` | ベイズ収束のハイパーパラメータ (`convergenceThreshold`, `decayRate`, `baseDecay`, `candidateThreshold`) |
| `BAYES_DEBUG_TOP_N` | デバッグログ用定数 (`= 5`) |

---

## `genreResolver.ts`

ジャンル収束アルゴリズム。

### エクスポート関数

| 関数 | 概要 |
|---|---|
| `accumulateParams(paramsList: GenreParams[]): GenreParams` | 選択履歴から genreParams を単純合算 |
| `resolveGenre(accumulated: GenreParams, genres: GenreDef[]): GenreId` | 累積パラメータからジャンルを決定（ベイズ事後確率で収束判定、50%超で確定） |
| `resolveFeaturesForGenre(genreId, genres): { enable: Set<FeatureId>, disable: Set<FeatureId> }` | ジャンルの enable/disable features を取得 |
| `resolveGenreProgress(accumulated, genres): { closestGenre: GenreId, progress: number }` | 最高事後確率を progress として返す（UI 演出用） |
| `resolveAllMetGenres(accumulated, genres): GenreId[]` | 事後確率が candidateThreshold(0.1)以上のジャンルを候補として返す（「◯◯にもできた」表示用） |
| `computeBayesianPosteriors(accumulated, genres, config): Record<GenreId, number>` | 累積パラメータから事後確率を計算 |
| `initBayesianState(genres): BayesianState` | 一様な事前分布で状態を初期化 |
| `updateBayesianState(prevState, accumulated, genres, config): BayesianState` | 1回の選択でベイズ状態を更新 |
| `resolveHighestProbGenre(accumulated, genres, config): GenreId` | 未収束時に最高確率のジャンルを返す |
| `getGenreDistribution(accumulated, genres, config): Record<GenreId, number>` | 事後確率分布を返す（デバッグ用） |
| `DEFAULT_BAYES_CONFIG` | デフォルトの BayesConfig (`convergenceThreshold: 0.50`, `decayRate: 0.4`, `baseDecay: 0.3`, `candidateThreshold: 0.1`) |

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
