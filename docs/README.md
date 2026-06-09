# 取扱説明書を読むゲーム — Framework ドキュメント

**最終更新:** 2026-06-09  
**最新実装:** 永遠システム・100+ 選択肢・距離ベース難易度曲線・API リファレンス

横スクロールを起点にジャンルが変容するゲームの技術フレームワーク完全ドキュメント。  
このドキュメントセットは、プロジェクト構造・データフロー・拡張ガイドを網羅しています。

---

## ドキュメント体系

### 全体理解用（最初に読むべき）

| ファイル | 対象読者 | 内容 |
|---|---|---|
| **このファイル** | すべて | フレームワーク全体図・クイックスタート |
| [architecture.md](architecture.md) | 開発者 | レイヤー構成・依存関係・ファイルマップ |
| [framework.md](framework.md) | 開発者 | エンジン仕様・ライフサイクル・実装ステータス |

### コード詳細解説

| ファイル | 対象 | 内容 |
|---|---|---|
| [core-systems.md](core-systems.md) | コア実装 | 5つのコアシステムの詳細解説（sideScroller, genreResolver, useGameState, ruleEngine, scoreCalc） |
| [architecture.md](architecture.md) | アーキテクチャ | レイヤー構成・依存関係・ファイルマップ |
| [framework.md](framework.md) | エンジン仕様 | エンジン仕様・ライフサイクル・実装ステータス |

### 要素別リファレンス（作成・拡張時に参照）

| ファイル | 対象 | 内容 |
|---|---|---|
| [genre-system.md](genre-system.md) | ジャンル | 21ジャンル定義・ジャンル収束アルゴリズム |
| [genre-plugin.md](genre-plugin.md) | ジャンル拡張 | GenrePlugin 実装ガイド・全フック一覧 |
| [feature-ids.md](feature-ids.md) | フィーチャー | 全FeatureId リファレンス（分類別） |
| [feature-system.md](feature-system.md) | フィーチャー拡張 | FeatureSystem 実装ガイド・全フック一覧 |
| [manual-json.md](manual-json.md) | 説明書 | JSON スキーマ・バージョン管理 |
| [adding-content.md](adding-content.md) | コンテンツ追加 | ジャンル・フィーチャー・説明書の追加手順 |

### API リファレンス（ファイル・関数・型の一覧）

| ファイル | 対象 | 内容 |
|---|---|---|
| [api/domain.md](api/domain.md) | `src/domain/` | 型定義・ジャンル収束・ルール合成・スコア計算・学習システム |
| [api/engine.md](api/engine.md) | `src/engine/` | GenrePlugin/FeatureSystem インターフェース・GameRegistry |
| [api/game.md](api/game.md) | `src/game/` | SideScroller エンジン・エンティティ・FeatureSystem 実装 |
| [api/genres.md](api/genres.md) | `src/genres/` | 全ジャンルプラグイン（10種）のテーマ・スポーン・描画 |
| [api/framework.md](api/framework.md) | `src/framework/` | ManualLoader/Builder/Validator・ConfigLoader/Validator |
| [api/data.md](api/data.md) | `src/data/` | GAME_CONFIG / MANUAL_DECK エントリポイント |
| [api/composables_plugins.md](api/composables_plugins.md) | `src/composables/`・`src/plugins/` | useGameState/useManual/useThrow composable・Vite 検証プラグイン |

---

## フレームワーク全体図

```
┌─────────────────────────────────────────────────┐
│ Vue UI Layer (App.vue / components/)            │
│ HUD・ManualPanel・ChoicePanel・EndingPanel      │
└────────────────────┬────────────────────────────┘
                     │ RuntimeRules / GameSnapshot
┌────────────────────▼────────────────────────────┐
│ Canvas Game Engine (sideScroller.ts)            │
│ ├─ 物理・衝突・スポーン                          │
│ └─ GameRegistry 経由でプラグイン・システムを呼ぶ │
└────────┬──────────────────────────┬─────────────┘
         │                          │
    ┌────▼─────┐          ┌────────▼──────────┐
    │ GenrePlugin        │ FeatureSystem      │
    │ (genres/)          │ (game/systems/)    │
    │ └ 描画・テーマ     │ └ ゲームロジック    │
    └────┬─────┘          └────────┬──────────┘
         └──────────┬───────────────┘
            ┌──────▼──────────┐
            │ GameRegistry    │
            │ (engine/)       │
            └──────┬──────────┘
         ┌────────▼────────────┐
         │ Domain Layer        │
         │ └ 型・ルール・算出  │
         └────────┬────────────┘
         ┌────────▼────────────┐
         │ Data Layer          │
         │ └ JSON・定数        │
         └─────────────────────┘
```

### データフロー（1フレーム）

```
[入力] → PreUpdate → Physics → PostUpdate → Render
        ↓           ↓         ↓            ↓
   MovementFeature  衝突判定   ScoreUpdate  描画
                    ↓
              onPlayerHit
              onSafeHazardTouch
```

---

## クイックスタート

### 新ジャンルを追加する

**必要なステップ:** 5 ファイル修正

```typescript
// 1. src/domain/types.ts — GenreId 追加
export type GenreId = 'base' | 'runner' | 'stg' | 'rpg' | ... | 'my_new_genre'

// 2. src/data/genres.ts — 定義追加
const GENRES: GenreDef[] = [
  // ...
  { id: 'my_new_genre', label: 'My Genre', thresholds: { ... }, ... }
]

// 3. src/genres/MyNewGenrePlugin.ts — 実装（GenrePluginBase 継承）
export class MyNewGenrePlugin extends GenrePluginBase {
  readonly id = 'my_new_genre'
  readonly skyColors = ['#000080', '#001a99']
  readonly groundColors = ['#8b4513', '#a0522d']
  readonly spawnTable = [ /* ... */ ]
  // 以下で描画メソッドをオーバーライド
}

// 4. src/genres/index.ts — 登録
registerGenre(new MyNewGenrePlugin())

// 5. src/data/manuals/*.json — ルート追加
{
  "id": "X.Y",
  "genre": "my_new_genre",
  // ...
}
```

 詳細: [genre-plugin.md](genre-plugin.md) / [adding-content.md](adding-content.md)

---

### 新フィーチャーを追加する

**必要なステップ:** 3 ファイル修正

```typescript
// 1. src/domain/types.ts — FeatureId 追加
export type FeatureId = 'shoot' | 'hp' | 'auto_run' | ... | 'my_feature'

// 2. src/game/systems/MyFeature.ts — 実装（FeatureSystem）
export class MyFeature implements FeatureSystem {
  readonly handles = 'my_feature'
  
  preUpdate?(world, input, dt) { /* 入力→速度 */ }
  update(world, input, dt) { /* ゲームロジック */ }
  render?(ctx, world) { /* 描画 */ }
  onPlayerHit?(world) { /* 被弾時 */ }
  // その他のフック...
}

// 3. src/game/systems/index.ts — 登録
registerFeature(new MyFeature())
```

 詳細: [feature-system.md](feature-system.md) / [adding-content.md](adding-content.md)

---

### 説明書ルートを追加する

**必要なステップ:** 1 ファイル追加

```json
// src/data/manuals/my-new-route.json
{
  "id": "X.Y",
  "genre": "target_genre",
  "manualText": ["...", "..."],
  "choices": [
    {
      "id": "X.Ya",
      "label": "選択肢 A",
      "next": "X.Ya",
      "genreParams": { "tempo": 1 }
    },
    {
      "id": "X.Yb",
      "label": "選択肢 B",
      "next": "X.Yb",
      "genreParams": { "growth": 1 }
    }
  ]
}
```

**コード修正は一切不要です。** JSON を追加するだけで自動認識されます。

 詳細: [manual-json.md](manual-json.md)

---

## 設計原則（5つの基本方針）

### JSON ドリブン設計

すべてのゲームルール・コンテンツは JSON で定義。TypeScript コード には「仕組み」だけを書く。

```
コード（仕組み）     + JSON データ（内容）  = ゲーム
─────────────────     ─────────────────
FeatureSystem        genres.ts / manuals/
GenrePlugin          gameBalance.ts
```

**メリット:**
- ルール変更がコンパイル不要
- デザイナーが JSON 直編集可能
- 複数バリエーション の管理が容易

### プラグイン分離

新しいジャンル・フィーチャーを追加してもコア（`sideScroller.ts`）を修正しない。

```typescript
//  悪い例（sideScroller に分岐を追加）
if (genre === 'my_new_genre') {
  // ...特別な処理
}

//  良い例（新しい GenrePlugin クラスを追加）
registerGenre(new MyNewGenrePlugin())
```

`GameRegistry` がプラグインを動的に検出・呼び出す。

### オフライン完結

ビルド後の `dist/` フォルダだけで動作。API 呼び出し・サーバー連携なし。

```
npm run build
↓
dist/index.html + dist/assets/
↓
ブラウザで開く → 完全に動作
```

### sideScroller は物理エンジン

`sideScroller.ts` は以下に限定：
- プレイヤーの位置・速度
- 重力・ジャンプ・衝突判定
- カメラ・スクロール
- パーティクル・画面シェイク

ゲームロジック（スコア・演出・ルール）は **FeatureSystem / GenrePlugin に委譲**。

### 座標系の一貫性

```
MutableWorld.cameraX を使い、座標変換を統一：

プレイヤー座標（スクリーン）  →  ワールド: player.x + cameraX
ハザード座標（ワールド）      →  スクリーン: hazard.x - cameraX
```

すべての Feature が同じ座標系を使うことで、バグを防止。

---

## 📋 実装ステータス（2026-05-31）

### コア実装

-  Canvas 物理エンジン（衝突・描画・パーティクル・シェイク）
-  GenrePlugin × 12+ 種（STG, Aerial STG, Bullet Hell, Arena, Hack & Slash, Aquatic, Survival, RPG, Dungeon, Tower Defense, Idle, Horror 等）
-  FeatureSystem × 8+ 種（Movement, Shoot, Enemy, Rhythm, RPG, Item, Extra Movement, Puzzle 等）
-  すべてのイベントフック完装備
-  ManualLoader / Builder / Validator / genreResolver 完全実装

### 永遠システム実装（2026-05-31）

-  **無限選択肢** - UPDATE_DISTANCES 動的生成 + 1500px 無限トリガー
-  **距離ベース難易度曲線** - 1.0倍 → 1.5倍 段階加速
-  **advanced-branch.json** - ver 9.0～15.0 の 100+ 選択肢
-  **複雑ナラティブ** - 複雑さ → 秩序 → 次元超越 → 創造の壮大な物語

### パフォーマンス & 品質

-  JSON ドリブン（マニュアル・ルール・ジャンル全て JSON化）
-  オフライン完全動作（dist 内自己完結）
-  ビルドサイズ最適化（256KB JS bundle）
-  テスト充実（Playwright 統合テスト）

---

## どこを読むべき？

| 状況 | 対象ドキュメント |
|---|---|
| **何もわからない** | このファイル → [architecture.md](architecture.md) |
| **コアシステムの実装を理解したい** | [core-systems.md](core-systems.md) |
| **新ジャンルを作りたい** | [genre-plugin.md](genre-plugin.md) → [adding-content.md](adding-content.md) |
| **新フィーチャーを作りたい** | [feature-system.md](feature-system.md) → [adding-content.md](adding-content.md) |
| **説明書を追加・修正したい** | [manual-json.md](manual-json.md) |
| **エンジンの詳細を知りたい** | [framework.md](framework.md) |
| **すべての FeatureId を知りたい** | [feature-ids.md](feature-ids.md) |
| **全ジャンルの定義を知りたい** | [genre-system.md](genre-system.md) |
| **ファイルの関数・型を一覧で知りたい** | [api/](api/) の各ファイル |
