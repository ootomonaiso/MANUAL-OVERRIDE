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
│  config/*.json  (genres, physics, score…)   │
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
│   ├── types.ts          全型定義（GenreId, FeatureId, RuntimeRules, GameStats…）
│   ├── ruleEngine.ts     buildRuntimeRules() — 純粋関数
│   ├── genreResolver.ts  resolveGenre() — 収束アルゴリズム
│   └── scoreCalc.ts      最終スコア計算(投擲込み)
│
├── engine/
│   ├── types.ts          MutableWorld / InputSnapshot / SpawnEntry / GameStats
│   ├── GameRegistry.ts   プラグイン・システムの中央レジストリ
│   ├── GenrePlugin.ts    GenrePlugin インターフェース
│   ├── FeatureSystem.ts  FeatureSystem インターフェース
│   └── index.ts          engine エクスポート
│
├── game/
│   ├── sideScroller.ts   Canvas ゲームループ本体
│   ├── entities.ts       Player / Hazard / Item / Bullet
│   ├── throwEngine.ts    投擲フェーズ物理
│   └── systems/
│       ├── index.ts           全 FeatureSystem を一括登録
│       ├── ShootFeature.ts    shoot 系 Feature 実装
│       ├── RhythmFeature.ts   rhythm 系 Feature 実装
│       ├── MovementFeature.ts movement 系 Feature 宣言
│       ├── shootSystem.ts     弾物理エンジン（純粋関数）
│       └── rhythmSystem.ts    BPM・タイミング判定（純粋関数）
│
├── genres/
│   ├── index.ts                全 GenrePlugin を一括登録
│   ├── BasePlugin.ts           base / runner
│   ├── StgPlugin.ts            stg
│   ├── RpgPlugin.ts            rpg
│   ├── RhythmPlugin.ts         rhythm
│   ├── PuzzlePlugin.ts         puzzle
│   ├── AerialStgPlugin.ts      aerial_stg
│   ├── SurvivalPlugin.ts       survival
│   ├── BulletRunnerPlugin.ts   bullet_runner
│   ├── PlatformerPlugin.ts     platformer
│   ├── RacingPlugin.ts         racing
│   ├── ArenaPlugin.ts          arena
│   ├── AquaticPlugin.ts        aquatic
│   ├── DungeonPlugin.ts        dungeon
│   └── HackSlashPlugin.ts      hack_slash
│
├── data/
│   ├── config/                 設定 JSON（17ファイル）
│   │   ├── genres.json         21 種の GenreDef
│   │   ├── physics.json        物理定数
│   │   ├── score.json          スコア重み
│   │   └── *.json              spawn, vfx, camera, difficulty など
│   ├── manualDeck.ts           JSON ファイルを import.meta.glob でロード
│   └── manuals/
│       ├── base.json           ルート・チュートリアルデッキ
│       └── *.json              ブランチ別デッキ
│
└── framework/
    ├── types.ts           ManualDeckFile / ManualEntryJSON スキーマ
    ├── ManualLoader.ts    JSON → ManualVersion のパース
    ├── ManualBuilder.ts   プログラム的な説明書生成 API
    ├── ManualValidator.ts 開発時バリデーション
    └── index.ts           framework エクスポート
```

---

## 主要な型

| 型 | 場所 | 役割 |
|---|---|---|
| `RuntimeRules` | domain/types.ts | フレームごとに参照するイミュータブルなルールセット |
| `MutableWorld` | engine/types.ts | FeatureSystem/GenrePlugin がフレームごとに受け取るコンテキスト |
| `GameStats` | engine/types.ts | kills / combo / beatHits など FeatureSystem が書き込む統計 |
| `GenreDef` | domain/types.ts | ジャンルの閾値・Feature・スコア式・テーマを記述するデータ |
| `SpawnEntry` | engine/types.ts | ジャンルプラグインが宣言するハザード出現テーブルの1行 |
| `ManualVersion` | domain/types.ts | 1バージョン分の説明書データ（controls, hazards, choices…） |
| `ChoiceRecord` | domain/ruleEngine.ts | 選択履歴の1件。累積ジャンルパラメータの計算に使用 |
