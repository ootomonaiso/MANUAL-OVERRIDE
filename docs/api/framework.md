# `src/framework/` — 説明書・設定フレームワーク

JSON ドリブンな説明書デッキとゲーム設定のロード・検証・ビルダー。

---

## `ManualLoader.ts`

JSON ファイルから ManualVersion のマップを構築する。

### エクスポート関数

| 関数 | 概要 |
|---|---|
| `loadFromGlob(modules: Record<string, unknown>): Record<string, ManualVersion>` | import.meta.glob の結果から MANUAL_DECK を構築 |
| `buildFromFiles(files: ManualDeckFile[]): Record<string, ManualVersion>` | 静的インポートのファイル配列から構築 |
| `extendDeck(deck, entries: [string, ManualVersion][]): void` | 既存デッキにエントリーを追加 |

---

## `ManualBuilder.ts`

TypeScript から型安全にマニュアルバージョンを定義できる Fluent Builder。

### クラス `ManualBuilder`

| メソッド | 概要 |
|---|---|
| `constructor(key, verLabel)` | MANUAL_DECK キーとバージョン番号で初期化 |
| `.text(line): this` | 本文行を1行追加 |
| `.texts(lines): this` | 本文行を複数追加 |
| `.image(path, alt?): this` | イラスト設定（`/manuals/` プレフィックス自動付与） |
| `.controls(c): this` | 操作キー設定 |
| `.hazards(h): this` | 危険/安全色設定 |
| `.choice(label, genreParams, next, id?, hint?): this` | 選択肢追加 |
| `.tutorialHint(hint): this` | チュートリアルヒント設定 |
| `.narrative(text): this` | ナラティブテキスト設定 |
| `.runtimeConfig(config): this` | runtime上書き設定 |
| `.build(): [string, ManualVersion]` | 構築結果をタプルで返す |

---

## `ManualValidator.ts`

MANUAL_DECK の整合性チェック。

### エクスポート関数

| 関数 | 概要 |
|---|---|
| `validateManualVersionStructure(key, v): string[]` | 単一エントリーの必須フィールド検証（エラー配列を返す） |
| `validateDeckStructure(deck): string[]` | デッキ全体の型構造検証 |
| `validateDeck(deck): ValidationResult` | 参照整合性チェック（ルートキー存在・next参照・到達不可能・循環参照） |
| `devValidate(deck): void` | 開発環境でのみ検証実行（型構造 → 参照整合性の順） |

### インターフェース

| 型 | 概要 |
|---|---|
| `ValidationResult` | (`ok: boolean`, `errors: string[]`, `warnings: string[]`) |

---

## `ConfigLoader.ts`

JSON 設定ファイルから GameConfigMap を構築する。

### エクスポート関数

| 関数 | 概要 |
|---|---|
| `loadConfigFromGlob(modules: Record<string, unknown>): GameConfigMap` | import.meta.glob の結果から設定マップを構築 |

---

## `ConfigValidator.ts`

設定値の整合性検証。

### エクスポート関数

| 関数 | 概要 |
|---|---|
| `validateGameConfig(config): ConfigValidationResult` | 全セクション存在確認・必須フィールド型チェック・数値範囲チェック |
| `devValidateConfig(config): void` | 開発環境でのみ検証実行 |

### インターフェース

| 型 | 概要 |
|---|---|
| `ConfigValidationResult` | (`ok: boolean`, `errors: string[]`, `warnings: string[]`) |

---

## `types.ts`

ManualDeck JSON ファイルのスキーマ定義。

### インターフェース

| 型 | 概要 |
|---|---|
| `ManualDeckFile` | JSON ファイル形式 (`id`, `description?`, `entries: ManualEntryJSON[]`) |
| `ManualEntryJSON` | 説明書エントリー (`key?`, `version`, `manualText[]`, `image?`, `imageAlt?`, `controls?`, `hazards?`, `runtimeOverrides?`, `style?`, `tutorialHint?`, `narrative?`, `choices?`) |
| `ChoiceJSON` | 選択肢 (`label`, `next`, `genreParams`, `id?`, `hint?`, `displayStyle?`, `paramMultiplier?`, `condition?`) |
| `PhysicsOverride` | 物理値上書き (`jumpVelocity?`, `jumpCutMultiplier?`, `gravity?`, `fallGravityMult?`, `runSpeed?`, `slowPreciseRatio?`, `coyoteFrames?`, `jumpBufferFrames?`) |
| `SpawnConfigOverride` | スポーン設定上書き (`baseInterval?`, `minInterval?`, `decayRate?`, `itemDropChance?`, `enemyHpAmount?`, `floatAmp?`) |
| `ShootOverride` | シュート挙動上書き (`bulletSpeed?`, `shotCooldown?`, `comboResetTime?`, `baseScorePerKill?`, `forceThreeWay?`) |
| `ManualStyleOverride` | 説明書UIビジュアル上書き (`fontFamily?`, `accentColor?`, `paperColor?`, `textColor?`, `borderColor?`, `headerTextColor?`, `diffAddColor?`, `diffRemoveColor?`, `boxShadow?`, `borderRadius?`, `fontSize?`, `lineHeight?`) |
| `RuntimeOverrides` | runtime上書き (`scrollSpeed?`, `gravity?`, `bpm?`, `forceGenreId?`, `scrollDirection?`, `environment?`, `playerMaxHp?`, `timescale?`, `colorTouchScore?`, `physics?`, `spawn?`, `shoot?`) |
| `ChoiceDisplayStyle` | 選択ボタン見た目 (`color?`, `textColor?`, `borderColor?`, `icon?`, `emphasis?`) |
| `ChoiceCondition` | 選択肢表示条件（将来拡張用） |

---

## `config-types.ts`

JSON 設定ファイルの TypeScript 型定義。

### インターフェース（セクションごと）

| 型 | JSONファイル | 概要 |
|---|---|---|
| `PhysicsConfig` | physics.json | プレイヤー物理 |
| `ShootConfig` | shoot.json | 射撃システム |
| `ThrowConfig` | throw.json | 投擲エンジン |
| `SpawnConfig` | spawn.json | ハザード・アイテムスポーン |
| `VfxConfig` | vfx.json | 視覚エフェクト |
| `CameraConfig` | camera.json | カメラ・視差スクロール |
| `BackgroundConfig` | background.json | 背景描画 |
| `HazardVfxConfig` | hazard_vfx.json | ハザード描画 |
| `UiConfig` | ui.json | UI表示 |
| `ScoreConfig` | score.json | スコア |
| `DifficultyConfig` | difficulty.json | 難易度 + TEMPO_SPEED_BONUS |
| `BossConfig` | boss.json | ボス |
| `RhythmTuningConfig` | rhythm_tuning.json | リズムゲーム |
| `StealthConfig` | stealth.json | ステルス |
| `GenreParamsConfig` | genre_params.json | ジャンルパラメータ設計支援 |
| `GameBalanceConfig` | game_balance.json | スコア比率・スクロール速度 |
| `GenresConfig` | genres.json | ジャンル定義テーブル |
| `GameConfigMap` | — | 全セクションのマッピング |
| `GameConfigSection` | — | `keyof GameConfigMap` |

---

## `index.ts`

一括エクスポート。Manual API + Config API の再エクスポート。
