# はじめての開発ガイド

このゲームは「説明書を読みながらジャンルが変わる」横スクロールアクションゲームです。  
このガイドは、プロジェクトに参加したばかりの人向けに、丁寧に説明しています。

---

## セットアップ（5分）

### 1. 環境の確認

```bash
node --version    # v18 以上が必要
npm --version     # v9 以上が必要
```

### 2. 依存関係インストール

```bash
npm install
```

### 3. 開発サーバー起動

```bash
npm run dev
```

ブラウザで `http://localhost:5173` を開くと、ゲームが起動します。

### 4. ビルド & 公開

```bash
npm run build
```

`dist/` フォルダが作成されます。これをそのままブラウザで開くと、**サーバー不要で動作します**（オフライン完全対応）。

---

## ゲームの流れ（プレイヤー視点）

### フェーズ 1: チュートリアル（説明書 ver 1.0）

```
[チュートリアル画面]
  説明書: 「障害物を避けよう」
  ゲーム: シンプルな横スクロール
    ├─ Space でジャンプ
    ├─ 矢印キーで左右移動
    └─ 赤い障害物に衝突でゲームオーバー
```

### フェーズ 2: 説明書が更新される（バージョン更新）

プレイヤーが一定距離進むと：

```
[更新パネル表示]
  「説明書が更新されました」
  ┌──────────────────────────────┐
  │ A) 敵を撃てるようにする      │
  │ B) スピードをあげる          │
  └──────────────────────────────┘
```

**選ぶとゲームが変わる**：
- A を選ぶ → **シューティングゲーム** 寄りへ
- B を選ぶ → **ランナー** 寄りへ

### フェーズ 3: ジャンルが確定する

3～4 回選択を重ねると、選択の蓄積によってジャンルが自動決定。説明書と画面が変わる。

### フェーズ 4: 説明書を投擲する

ゲームオーバー後、説明書をドラッグして投げて終了。

---

## プロジェクト構成（全体像）

```
src/
├── App.vue                       ← メイン UI
├── main.ts                       ← エントリーポイント
│
├── components/                   ← UI コンポーネント（Vue）
│   ├── ManualPanel.vue           説明書の表示・更新
│   ├── ChoicePanel.vue           2択の選択肢表示
│   ├── ThrowOverlay.vue          投擲フェーズ UI
│   ├── EndingPanel.vue           エンディング表示
│   ├── Hud.vue                   スコア・距離表示
│   └── TutorialHints.vue         初心者向けヒント
│
├── composables/                  ← Vue ロジック
│   ├── useGameState.ts           ゲーム全体の状態管理
│   └── useManual.ts              説明書の履歴管理
│
├── game/                         ← Canvas ゲームエンジン
│   ├── sideScroller.ts           ← コア: 物理・衝突・描画ループ
│   ├── entities.ts               プレイヤー・敵・弾
│   ├── throwEngine.ts            投擲シミュレーション
│   └── systems/                  ← ゲーム機能（フィーチャー）
│       ├── MovementFeature.ts    左右移動・ジャンプ
│       ├── ShootFeature.ts       弾発射システム
│       ├── RpgFeature.ts         経験値・レベルシステム
│       ├── RhythmFeature.ts      リズム同期
│       ├── PuzzleFeature.ts      パズル機能
│       └── ... (8+ フィーチャー)
│
├── genres/                       ← ジャンル定義（プラグイン）
│   ├── BasePlugin.ts             基本ジャンル（横スクロール）
│   ├── StgPlugin.ts              STG（シューティング）
│   ├── RpgPlugin.ts              RPG
│   ├── PuzzlePlugin.ts           パズル
│   ├── RhythmPlugin.ts           リズムゲーム
│   └── ... (8+ ジャンル)
│
├── domain/                       ← ロジック・型定義
│   ├── types.ts                  全型定義
│   ├── ruleEngine.ts             説明書 → ゲームルール変換
│   ├── genreResolver.ts          選択 → ジャンル決定アルゴリズム
│   ├── scoreCalc.ts              スコア計算式
│   └── LearningSystem.ts         プレイヤー行動検知
│
├── engine/                       ← プラグイン管理
│   ├── GameRegistry.ts           ジャンル・機能の登録・取得
│   └── types.ts                  ゲーム状態の型
│
├── plugins/                      ← 周辺機能
│   ├── PluginManager.ts          プラグイン管理
│   ├── JSONGenrePlugin.ts        JSON からジャンル生成
│   └── SoundManager.ts           サウンド管理
│
├── framework/                    ← 説明書フレームワーク
│   ├── ManualLoader.ts           JSON ファイル自動読み込み
│   ├── ManualBuilder.ts          プログラムで説明書生成
│   ├── ManualValidator.ts        バリデーション
│   └── types.ts                  型定義
│
└── data/                         ← ゲーム設定（すべて JSON）
    ├── config.ts                 設定読み込み
    ├── genres.ts                 全ジャンル定義（JSON から）
    ├── gameBalance.ts            ゲームバランス値
    ├── tunables.ts               調整可能なパラメータ
    ├── manualDeck.ts             説明書データベース
    ├── config/                   ← JSON 設定ファイル群（17個）
    │   ├── genres.json           ジャンル定義（20+ ジャンル）
    │   ├── game_balance.json     敵の密度・スポーン・難易度
    │   ├── score.json            スコア計算の重み
    │   ├── physics.json          重力・速度・衝突パラメータ
    │   ├── difficulty.json       難易度曲線
    │   └── ... (12+ JSON ファイル)
    └── manuals/                  ← 説明書 JSON
        ├── base.json             チュートリアル版
        ├── action-branch.json    敵・射撃分岐
        ├── advanced-branch.json  高度な分岐（ver 9.0+）
        └── ... (複数ルート)
```

---

## はじめてのコーディング

### パターン 1: 説明書ルート（テキスト内容）を追加する

**難易度:** 簡単 | **所要時間:** 5分 | **ファイル数:** 1個

説明書の新バージョン（例: ver 3.0）を追加します。

#### Step 1: JSON ファイルを作成

```bash
src/data/manuals/new-route.json
```

#### Step 2: 内容を書く

```json
{
  "id": "3.0",
  "description": "リズムゲーム方向へ分岐（開発者メモ）",
  "entries": [
    {
      "key": "3.0-rhythm",
      "version": "3.0",
      "manualText": [
        "説明書が更新されました！",
        "この世界はリズムで動いている...",
        "矢印キーの入力リズムが重要に"
      ],
      "controls": {
        "jump": "Space",
        "moveLeft": "ArrowLeft",
        "moveRight": "ArrowRight"
      },
      "hazards": {
        "colors": ["red"],
        "safeColors": ["blue"]
      },
      "choices": [
        {
          "label": "音に合わせて避ける",
          "next": "4.0-rhythm-a",
          "genreParams": { "rhythm": 2 },
          "hint": "リズム方向"
        },
        {
          "label": "スピードを上げる",
          "next": "4.0-rhythm-b",
          "genreParams": { "tempo": 2 },
          "hint": "ランナー方向"
        }
      ]
    }
  ]
}
```

#### Step 3: 既存ファイルから参照を張る

`src/data/manuals/base.json` のどこかで：

```json
{
  "choices": [
    {
      "label": "音に合わせたゲームにする",
      "next": "3.0-rhythm",
      "genreParams": { "rhythm": 1 }
    }
  ]
}
```

**完成！** ファイルは自動で認識されます。再度のコード修正は不要。

---

### パターン 2: ジャンルのビジュアルを変える

**難易度:** 中程度 | **所要時間:** 15分 | **ファイル数:** 1個

例: STG（シューティング）の敵の見た目を変える

#### Step 1: プラグインを開く

```bash
src/genres/StgPlugin.ts
```

#### Step 2: 描画メソッドを変更

```typescript
export class StgPlugin extends GenrePluginBase {
  readonly id = 'stg'

  drawHazard(ctx, hazard, world) {
    // 敵を円形に
    ctx.fillStyle = hazard.color === 'red' ? '#ff0000' : '#00ff00'
    ctx.beginPath()
    ctx.arc(hazard.x - world.cameraX, hazard.y, 8, 0, Math.PI * 2)
    ctx.fill()
  }
}
```

**保存すると即座に反映**（開発サーバー再起動不要）。

---

### パターン 3: 新しいゲーム機能を追加する

**難易度:** 難しい | **所要時間:** 30分 | **ファイル数:** 2個

例: 「ジャンプ高度を表示する」機能

#### Step 1: フィーチャーを定義

```typescript
// src/game/systems/MyFeature.ts

import type { FeatureSystem } from '../../engine/FeatureSystem'
import type { MutableWorld } from '../../engine/types'

export class JumpHeightFeature implements FeatureSystem {
  readonly handles = 'show_jump_height'
  
  render?(ctx: CanvasRenderingContext2D, world: MutableWorld): void {
    const groundLevel = world.height - 16
    const heightFromGround = Math.max(0, groundLevel - world.player.y)
    
    if (heightFromGround > 10) {
      ctx.fillStyle = '#ffff00'
      ctx.font = '14px monospace'
      ctx.fillText(`高度: ${Math.floor(heightFromGround)}px`, 20, 40)
    }
  }
}
```

#### Step 2: フィーチャーを登録

```typescript
// src/game/systems/index.ts

import { JumpHeightFeature } from './MyFeature'
import { getRegistry } from '../../engine/GameRegistry'

getRegistry().registerFeature(new JumpHeightFeature())
```

#### Step 3: JSON で有効化

```json
// src/data/config/genres.json の該当ジャンルで:
{
  "id": "my_genre",
  "enableFeatures": ["show_jump_height"],
  ...
}
```

**完成！** ジャンプ高度が画面に表示されます。

---

## より詳しく学ぶ

| 知りたいこと | 読むファイル |
|---|---|
| **ゲーム全体像** | [README.md](README.md) |
| **レイヤー構成** | [architecture.md](architecture.md) |
| **コアシステム詳説** | [core-systems.md](core-systems.md) |
| **新ジャンルの作り方** | [genre-plugin.md](genre-plugin.md) |
| **新フィーチャーの作り方** | [feature-system.md](feature-system.md) |
| **説明書 JSON 仕様** | [manual-json.md](manual-json.md) |
| **全 FeatureId 一覧** | [feature-ids.md](feature-ids.md) |
| **全ジャンル定義** | [genre-system.md](genre-system.md) |
| **タスク一覧** | [TASKS.md](TASKS.md) |

---

## よくある質問

### Q: ゲームがうまく起動しない

```bash
rm -rf node_modules package-lock.json
npm install
npm run dev
```

### Q: ビルド後のファイルはどこ？

```bash
dist/
├── index.html
├── assets/
│   ├── main.js     ← ゲームのコード
│   └── index.css   ← スタイル
```

`dist/index.html` をブラウザで開くだけで完全に動作。

### Q: プレイヤーの見た目を変えたい

`src/genres/BasePlugin.ts` の `drawPlayer()` メソッドを編集。

### Q: 説明書のテーマを変えたい

`src/data/config/genres.json` で：

```json
{
  "id": "my_genre",
  "theme": "stg"  // plain, stg, rpg, puzzle, rhythm など
}
```

---

## 次のステップ

1. **ゲームをプレイ** — `npm run dev`
2. **説明書を追加** — パターン 1 を実行
3. **ジャンルを改造** — パターン 2 を実行
4. **機能を追加** — パターン 3 に挑戦

質問があれば、他のドキュメントを参照するか、コードのコメントを読んでください。
