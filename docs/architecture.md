# アーキテクチャ

## レイヤー構成

```
┌──────────────────────────────────────────────────────┐
│  Vue UI Layer                                        │
│  App.vue / components/ / composables/               │
│  (ChoicePanel, ManualPanel, HUD, EndingPanel …)     │
└────────────────────┬─────────────────────────────────┘
                     │ RuntimeRules / GameSnapshot
┌────────────────────▼─────────────────────────────────┐
│  Game Loop (sideScroller.ts)                        │
│  物理・衝突・スポーン・描画ルーティング             │
│  FeatureSystem と GenrePlugin を GameRegistry 経由で呼ぶ │
└──────┬─────────────────────────┬───────────────────┘
       │                         │
┌──────▼──────┐         ┌────────▼──────────┐
│  GenrePlugin │         │  FeatureSystem    │
│  (src/genres)│         │  (src/game/systems)│
│  視覚テーマ  │         │  ゲームメカニクス  │
│  スポーンTBL │         │  弾・リズム・移動  │
└──────┬───────┘         └────────┬───────────┘
       │                          │
┌──────▼──────────────────────────▼───────────┐
│  GameRegistry (engine/GameRegistry.ts)      │
│  registerGenre / registerFeature            │
│  getGenre / getActiveSystems                │
└──────────────────┬──────────────────────────┘
                   │
┌──────────────────▼──────────────────────────┐
│  Domain Layer (src/domain/)                 │
│  buildRuntimeRules  genreResolver           │
│  scoreCalc          types                   │
└──────────────────┬──────────────────────────┘
                   │
┌──────────────────▼──────────────────────────┐
│  Data Layer (src/data/)                     │
│  genres.ts  gameBalance.ts  tunables.ts     │
│  manuals/*.json                             │
└─────────────────────────────────────────────┘
```

---

## データフロー

### 選択 → ルール更新

```
プレイヤーが2択を選択
  → Choice.genreParams を history に記録
  → buildRuntimeRules(currentVersion, history, lockedGenre)
      ├─ genreParams を累積 (paramMultiplier 考慮)
      ├─ resolveGenre → GenreId を決定
      ├─ resolveFeaturesForGenre → features Set を構築
      └─ runtimeConfig の上書き適用
  → RuntimeRules（イミュータブル）を生成
  → sideScroller.updateRules(rules) → FeatureSystem.onManualUpdated()
```

### フレームループ

```
requestAnimationFrame (sideScroller._loop)
  → _computeInputEdges()          入力エッジ検出
  → _update(dt)
      ├─ 移動・重力・ジャンプ      物理
      ├─ ハザードスポーン           GenrePlugin.spawnTable 参照
      ├─ 衝突判定                   beatHazardInverted 参照
      ├─ getActiveSystems(features) FeatureSystem 取得
      └─ each sys.update(world, input, dt)
          ├─ ShootFeature           弾発射・命中判定・コンボ
          └─ RhythmFeature          BPM同期・ジャスト入力
  → _render()
      ├─ _drawBackground()         GenrePlugin.drawFarLayer/drawMidLayer
      ├─ _drawHazard()             GenrePlugin.drawHazard (optional)
      ├─ getActiveSystems() each sys.render?(ctx, world)
      │   ├─ ShootFeature.render() 弾描画
      │   └─ RhythmFeature.render() ビートマーカー描画
      └─ _drawPlayer()             GenrePlugin.drawPlayer
```

---

## ファイルマップ

```
src/
├── domain/
    │   ├── types.ts          全型定義（GenreId=string, FeatureId=string, RuntimeRules, GameStats…）
    │   ├── ruleEngine.ts     buildRuntimeRules() — 純粋関数
    │   ├── genreResolver.ts  resolveGenre() — 収束アルゴリズム
    │   ├── scoreCalc.ts      最終スコア計算(投擲込み)
    │   ├── LearningSystem.ts 行動統計 → 追加ルール発火
    │   └── defaults.ts       デフォルト値定義
│
├── engine/
    │   ├── types.ts          MutableWorld / InputSnapshot / SpawnEntry / GameStats
    │   ├── GameRegistry.ts   プラグイン・システムの中央レジストリ
    │   ├── GenrePlugin.ts    GenrePlugin インターフェース
    │   ├── GenrePluginBase.ts GenrePlugin ベースクラス（共通描画ロジック）
    │   ├── FeatureSystem.ts  FeatureSystem インターフェース
    │   └── index.ts          engine エクスポート
│
├── game/
    │   ├── sideScroller.ts   Canvas ゲームループ本体
    │   ├── entities.ts       Player / Hazard / Item / Bullet / Enemy
    │   ├── throwEngine.ts    投擲フェーズ物理
    │   └── systems/
    │       ├── index.ts               全 FeatureSystem を一括登録（7系統）
    │       ├── ShootFeature.ts        shoot 系 Feature 実装
    │       ├── RhythmFeature.ts       rhythm 系 Feature 実装
    │       ├── MovementFeature.ts     movement 系 Feature 実装（dash/wall_jump/vertical_scroll も統合）
    │       ├── RpgFeature.ts          hp/exp/item_pickup 実装
    │       ├── PuzzleFeature.ts       grid_stop/puzzle_solve 実装
    │       ├── SpecialFeature.ts      stealth_mode/time_bonus/tower/boss/color_touch 実装
    │       └── TetrisFeature.ts       tetris_mode 実装
│
├── genres/
    │   ├── index.ts           全 GenrePlugin を自動収集・登録（16種 + JSONフォールバックプラグイン）
    │   ├── BasePlugin.ts      base / runner
    │   ├── StgPlugin.ts       stg
    │   ├── RpgPlugin.ts       rpg
    │   ├── RhythmPlugin.ts    rhythm
    │   ├── PuzzlePlugin.ts    puzzle
    │   ├── AerialStgPlugin.ts aerial_stg
    │   ├── SurvivalPlugin.ts  survival
    │   ├── BulletRunnerPlugin.ts bullet_runner
    │   ├── PlatformerPlugin.ts   platformer
    │   ├── RacingPlugin.ts      racing
    │   ├── ArenaPlugin.ts       arena
    │   ├── AquaticPlugin.ts     aquatic
    │   ├── DungeonPlugin.ts     dungeon
    │   ├── HackSlashPlugin.ts   hack_slash
    │   └── TetrisPlugin.ts      tetris
│
├── data/
    │   ├── config.ts          GAME_CONFIG エントリポイント
    │   ├── config/            JSON設定ファイル群（21個）
    │   │   ├── genres.json    22 種の GenreDef
    │   │   ├── game_balance.json   スコア比率/投擲重み/基本速度
    │   │   ├── difficulty.json     難易度カーブ/アップデート距離
    │   │   ├── physics.json        プレイヤー物理定数
    │   │   └── *.json              vfx, spawn, shoot, rhythm, stealth, boss, etc.
    │   ├── gameBalance.ts     config から再エクスポート（薄いラッパー）
    │   ├── tunables.ts        config から再エクスポート（薄いラッパー）
    │   ├── manualDeck.ts      JSON ファイルを import.meta.glob でロード
    │   └── manuals/
    │       ├── base.json      ルート・チュートリアルデッキ
    │       └── *.json         ブランチ別デッキ
│
├── framework/
    │   ├── types.ts           ManualDeckFile / ManualEntryJSON スキーマ
    │   ├── config-types.ts    設定ファイルの型定義
    │   ├── ManualLoader.ts    JSON → ManualVersion のパース
    │   ├── ManualBuilder.ts   プログラム的な説明書生成 API
    │   ├── ManualValidator.ts 開発時バリデーション
    │   ├── ConfigLoader.ts    JSON設定ファイルのローディング
    │   ├── ConfigValidator.ts 設定ファイルのバリデーション
    │   └── index.ts           framework エクスポート
    │
    └── plugins/
        ├── PluginManager.ts   ユーザーインストールプラグイン管理
        ├── JSONGenrePlugin.ts JSON からジャンル生成
        └── SoundManager.ts    サウンド管理
```

---

## 主要な型

| 型 | 場所 | 役割 |
|---|---|---|
| `RuntimeRules` | domain/types.ts | フレームごとに参照するイミュータブルなルールセット |
| `MutableWorld` | engine/types.ts | FeatureSystem/GenrePlugin がフレームごとに受け取るコンテキスト |
| `GameStats` | engine/types.ts | kills / combo / beatHits など FeatureSystem が書き込む統計 |
| `GenreDef` | domain/types.ts | ジャンルの閾値・Feature・スコア式・テーマを記述するデータ |
| `GenreId` | domain/types.ts | `string` 型（union 型ではない）。値は src/data/genres/*.json で定義 |
| `FeatureId` | domain/types.ts | `string` 型（union 型ではない）。src/data/genres/*.json の enableFeatures で参照 |
| `SpawnEntry` | engine/types.ts | ジャンルプラグインが宣言するハザード出現テーブルの1行 |
| `ManualVersion` | domain/types.ts | 1バージョン分の説明書データ（controls, hazards, choices…） |
| `Choice` | domain/types.ts | 選択肢の定義（genreParams, genrePoints, paramMultiplier 等） |
| `LearningRule` | domain/types.ts | 行動統計に基づく自動ルール更新 |
| `ManualRuntimeConfig` | domain/types.ts | 説明書バージョンが runtime に適用できる上書き設定 |
