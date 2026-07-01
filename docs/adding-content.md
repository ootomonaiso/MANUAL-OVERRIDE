# 選択肢・エンディングの追加ガイド

新しい選択肢（説明書の2択）や、新しいジャンルエンディングを追加するための実践ガイドです。

---

## 目次

1. [全体の仕組みを3分で理解する](#全体の仕組みを3分で理解する)
2. [選択肢（説明書の分岐）を追加する](#選択肢説明書の分岐を追加する)
3. [新しいジャンルエンディングを追加する](#新しいジャンルエンディングを追加する)
4. [ジャンルの見た目（GenrePlugin）を実装する](#ジャンルの見た目genrepluginを実装する)
5. [パラメータ設計のコツ](#パラメータ設計のコツ)
6. [バリデーションとデバッグ](#バリデーションとデバッグ)
7. [チェックリスト](#チェックリスト)

---

## 全体の仕組みを3分で理解する

```
プレイヤーが選択肢を選ぶ
        ↓
  genreParams が蓄積される
  例: { tempo: +2, aerial: +1 }
        ↓
  蓄積値がどのジャンルの thresholds を超えたか判定（genreResolver）
        ↓
  閾値を全て超えたジャンルのうち「超過量の合計が最大」のものが確定
        ↓
  GenrePlugin の視覚テーマ・スポーンテーブルが適用される
        ↓
  投擲 → エンディング（manualReveal + endingFlavor を表示）
```

**選択肢を追加する = JSON ファイルを編集するだけ**
**ジャンル・エンディングを追加する = `src/data/genres/<id>.json` を置くだけ（見た目を作り込むなら TS プラグインも）**

---

## 選択肢（説明書の分岐）を追加する

選択肢は `src/data/manuals/` 以下の JSON ファイルで定義します。
Vite が `*.json` を自動ロードするため、**ファイルを置くだけで反映されます**。

### ファイル構成

```
src/data/manuals/
├── base.json          ← ver 1.0（チュートリアル直後の最初の2択）
├── action-branch.json ← 戦闘・探索系の分岐（2.0-a → 3.0-xxx）
├── flow-branch.json   ← 速度・音楽系の分岐（2.0-b → 3.0-xxx）
└── TEMPLATE.json      ← 新ブランチ追加時のテンプレート
```

**既存の流れ:**
```
1.0 (base.json)
  ├─ 2.0-a (action-branch.json) ─ STG・RPG・サバイバル方向
  └─ 2.0-b (flow-branch.json)  ─ ランナー・リズム・プラットフォーム方向
```

### 既存ブランチに選択肢を追記する

`action-branch.json` などを開き、`choices` 配列に追記します。

```json
{
  "choices": [
    {
      "label": "プレイヤーに見える文章（ジャンル方向を直接書かない）",
      "next": "3.0-my-choice",
      "genreParams": { "enemy": 2, "range": 1 },
      "hint": "開発者メモ（プレイヤーには非表示）: STG方向"
    }
  ]
}
```

| フィールド | 必須 | 説明 |
|---|---|---|
| `label` | ✅ | プレイヤーに表示するテキスト |
| `next` | ✅ | 次のマニュアルバージョンのキー |
| `genreParams` | ✅ | 蓄積するジャンルパラメータ（後述） |
| `hint` | ― | 開発者向けメモ（非表示） |
| `id` | ― | 省略するとラベルから自動生成 |

### 新しいブランチファイルを追加する

`TEMPLATE.json` をコピーして新しいファイルを作ります。

```bash
# 例: my-branch.json を作成
cp src/data/manuals/TEMPLATE.json src/data/manuals/my-branch.json
```

```json
{
  "id": "my-branch",
  "description": "開発者向けのブランチ説明",
  "entries": [
    {
      "key": "3.0-my-route",
      "version": "3.0",
      "manualText": [
        "ここに説明書の本文を書く。",
        "4〜6行が見やすい。"
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
          "label": "ステージを縦に広げる",
          "next": "4.0-vertical",
          "genreParams": { "vertical": 3 },
          "hint": "aerial_stg 方向"
        },
        {
          "label": "ステージに宝箱を置く",
          "next": "4.0-loot",
          "genreParams": { "growth": 3 },
          "hint": "RPG/dungeon 方向"
        }
      ]
    }
  ]
}
```

このファイルを `src/data/manuals/` に置くだけで自動ロードされます。
親エントリ（`2.0-a` など）の `next` を新しいキーに変えることで接続します。

### runtimeOverrides でゲームの挙動を変える

選択肢によってゲームの物理パラメータも変えられます。

```json
{
  "key": "3.0-fast-route",
  "version": "3.0",
  "manualText": ["スピードが上がりました。"],
  "runtimeOverrides": {
    "scrollSpeed": 6.0,
    "gravity": 1400,
    "bpm": 160
  },
  "controls": { "jump": "Space", "moveLeft": "ArrowLeft", "moveRight": "ArrowRight" },
  "hazards": { "colors": ["red"], "safeColors": ["blue"] },
  "choices": []
}
```

| パラメータ | デフォルト | 説明 |
|---|---|---|
| `scrollSpeed` | 3.0 | 横スクロール速度（px/フレーム換算） |
| `gravity` | 1200 | 重力加速度 |
| `bpm` | 120 | リズムゲーム用 BPM |
| `scrollDirection` | `"horizontal"` | `"vertical"` / `"none"` も可 |
| `playerMaxHp` | 1 | HP 制（2以上でRPG的被弾許容） |
| `timescale` | 1.0 | ゲーム全体の時間倍率 |
| `environment` | `"ground"` | `"sky"` / `"space"` / `"ocean"` など |

---

## 新しいジャンルエンディングを追加する

エンディングを追加するには **最小1箇所（JSON）、見た目を作り込むなら3箇所** を変更します。

> `GenreId` / `FeatureId` は `string` 型のため、`src/domain/types.ts` の編集は不要です。

### ステップ 1: GenreDef（ジャンル定義）を JSON で追加する

`src/data/genres/my_genre.json` を新規作成します。`src/data/genres/*.json` は `import.meta.glob` で自動収集されるため、**ファイルを置くだけ**で登録されます（`src/data/genres.ts` は `GAME_CONFIG` からの再エクスポートなので編集不要）。

```jsonc
{
  "id": "my_genre",
  "label": "マイジャンル",

  // ─── 収束条件（軸パラメータ閾値）。複数指定時はすべて満たす必要がある ───
  "thresholds": { "tempo": 3, "aerial": 3 },

  // ─── フィーチャー：確定時に有効/無効になるメカニクス ───
  "enableFeatures": ["double_jump", "dash"],
  "disableFeatures": ["grid_stop"],

  // ─── スコア計算式 ───
  // 変数: distance, kills, combo, exp, beatHits, survivedSec,
  //        accuracy, maxCombo, deaths, itemsCollected, bossKills,
  //        stealthBonus, colorTouches
  "scoreFormula": "distance * 1.5 + combo * 60 + kills * 80",

  // ─── エンディングテキスト ───
  "manualReveal": "これはマイジャンルになりました。",
  "endingFlavor": "あなたは独自のゲームを作り上げた。",

  // ─── UI テーマ（ManualTheme のいずれか。例: plain / stg / rpg / puzzle / rhythm / tetris …）───
  "theme": "plain",

  // ─── Canvas 背景色 ───
  "bgColor": "#0a1020",

  // ─── 任意 ───
  // environment: 'ground' | 'sky' | 'space' | 'ocean' | 'dungeon' | 'forest' | 'city'
  "environment": "sky",
  // 重力加速度 px/s²。省略時は 1600。0 で無重力。
  "gravity": 1600
}
```

### ステップ 2: GenrePlugin（見た目）を実装する（任意）

専用ビジュアルが必要な場合のみ実装します。省略すると `JSONGenrePlugin` が `theme` からフォールバック描画します。[次節](#ジャンルの見た目genrepluginを実装する) を参照してください。

### ステップ 3: 選択肢が収束するようにパラメータを設計する

マニュアルの JSON ファイルの `genreParams` を調整して、
プレイヤーが特定の選択を続けると `thresholds` に到達するようにします。

**例:** `thresholds: { tempo: 3, aerial: 3 }` の場合
- ver 2.0 の選択肢で `{ tempo: 2, aerial: 1 }` を加算
- ver 3.0 の選択肢で `{ tempo: 1, aerial: 2 }` を加算
- 合計で `{ tempo: 3, aerial: 3 }` → ジャンル確定

---

## ジャンルの見た目（GenrePlugin）を実装する

`src/genres/MyGenrePlugin.ts` を新規作成します。

### 最小実装（DarkThemePlugin を継承する場合）

```typescript
// src/genres/MyGenrePlugin.ts
import type { GenreId } from '../domain/types'
import type { GenrePlugin } from '../engine/GenrePlugin'
import type { SpawnEntry } from '../engine/types'
import { DarkThemePlugin } from './BasePlugin'

export class MyGenrePlugin extends DarkThemePlugin {
  readonly id: GenreId = 'my_genre'

  // 空の色: [上, 下]
  readonly skyColors    = ['#001028', '#002050'] as const
  readonly groundColors = ['#003060', '#001030'] as const

  // 背景レイヤーの色
  readonly farLayerColor = '#002050'
  readonly midLayerColor = '#001540'

  // 星フィールドの色。undefined にすると非表示。
  readonly starColor: string | undefined = '#88aaff'

  // 危険色・安全色のパレット
  readonly palette: GenrePlugin['palette'] = {
    danger:     '#ff4444', dangerGlow: '#ff8888',
    safe:       '#44ff88', safeGlow:   '#88ffcc',
  }

  // ハザードの出現テーブル
  readonly spawnTable: readonly SpawnEntry[] = [
    // weightStart: 序盤の出現重み / weightEnd: 終盤の出現重み
    { shape: 'rect',    placement: 'ground', weightStart: 8, weightEnd: 4,  wRange: [35, 65], hRange: [40, 75] },
    { shape: 'spike',   placement: 'ground', weightStart: 1, weightEnd: 4,  wRange: [35, 55], hRange: [50, 80] },
    { shape: 'diamond', placement: 'float',  weightStart: 0, weightEnd: 3,  wRange: [40, 55], hRange: [40, 55] },
  ]

  // DarkThemePlugin のデフォルト実装（山シルエット・建物・宇宙船風プレイヤー）を使うので
  // drawFarLayer / drawMidLayer / drawPlayer は省略できる。
  // カスタマイズしたい場合は以下のようにオーバーライドする:

  override drawMidLayer(ctx: CanvasRenderingContext2D, offsetX: number, W: number, gY: number): void {
    // 独自の中景を描画
    ctx.globalAlpha = 0.15
    ctx.fillStyle = '#4488ff'
    const spacing = 80
    for (let x = -(offsetX % spacing); x < W; x += spacing) {
      ctx.fillRect(x, 0, 1, gY)
    }
    ctx.globalAlpha = 1

    // 親の建物シルエットも表示したい場合
    super.drawMidLayer(ctx, offsetX, W, gY)
  }
}
```

### 登録する

ファイル末尾で `default export` するだけです。`src/genres/index.ts` が `import.meta.glob` で自動収集するため、`index.ts` の編集は不要です。

```typescript
export default new MyGenrePlugin()   // ← これだけ
```

### spawnTable の書き方

| フィールド | 型 | 説明 |
|---|---|---|
| `shape` | `'rect' \| 'spike' \| 'pillar' \| 'diamond'` | ハザードの形状 |
| `placement` | `'ground' \| 'air' \| 'float'` | 配置位置 |
| `weightStart` | number | 序盤の出現重み（0 = 出ない） |
| `weightEnd` | number | 終盤の出現重み |
| `wRange` | `[min, max]` | 横幅の範囲（px） |
| `hRange` | `[min, max]` | 縦幅の範囲（px） |
| `safeChance` | number (0〜1) | この確率で安全色になる |
| `hpOverride` | number | このハザードの耐久値（shoot フィーチャーで複数弾必要） |
| `isBoss` | boolean | ボスとして扱う（onBossSpawn フックが呼ばれる） |

### オプショナルフック

プラグインには追加のライフサイクルフックを実装できます。

```typescript
// ジャンル確定時に1回だけ呼ばれる
onGenreLocked(rules: RuntimeRules): void { }

// 毎フレーム呼ばれる（独自の背景アニメーションなど）
onUpdate(world: MutableWorld, dt: number): void { }

// ハザードが撃破されたとき
onHazardDestroyed(hazard: Hazard): void { }

// 説明書が更新されたとき（BPM 変更などに対応）
onManualUpdated(version: ManualVersion): void { }

// プレイヤーがジャンプしたとき
onPlayerJump(): void { }

// プレイヤーが着地したとき
onPlayerLand(): void { }

// ジャンル固有の HUD を描画する
drawGenreHUD(ctx: CanvasRenderingContext2D, W: number, H: number, stats: GameStats): void { }
```

---

## パラメータ設計のコツ

### 12軸のジャンルパラメータ

| パラメータ | 向いているジャンル | 典型的な閾値 |
|---|---|---|
| `tempo` | runner, rhythm, bullet_runner, racing | 4〜5 |
| `range` | stg, aerial_stg, bullet_hell | 3〜4 |
| `enemy` | stg, arena, hack_slash, bullet_hell | 4〜5 |
| `combo` | puzzle, hack_slash, arena | 4〜5 |
| `growth` | rpg, dungeon, idle | 4〜5 |
| `rhythm` | rhythm, sports | 3〜4 |
| `stealth` | stealth_action, horror | 4〜5 |
| `vertical` | aerial_stg, aquatic, bullet_hell | 2〜3 |
| `aerial` | platformer, aquatic | 2〜3 |
| `survive` | survival, horror, aquatic | 3〜5 |
| `craft` | tower_def, idle | 4〜5 |
| `speed` | racing, sports, bullet_runner | 3〜4 |

### 分岐が「自然に見える」ようにする設計

選択肢のラベルはジャンルを直接示さず、ゲームの「雰囲気の変化」として表現します。

```
✗ 悪い例: "シューティングゲームにする"
✓ 良い例: "ステージに登場するものに個性を加える"

✗ 悪い例: "RPG要素を追加する"
✓ 良い例: "主人公に名前と物語を与える"

✗ 悪い例: "縦スクロールにする"
✓ 良い例: "ステージを空へ広げる"
```

### 複数ジャンルへの道が分岐を面白くする

1つの選択肢が複数パラメータを加算すると、中間的なルートを経由して
異なるジャンルへ到達できます。

```json
{
  "label": "敵をどんどん強くする",
  "next": "3.0-intense",
  "genreParams": { "enemy": 2, "tempo": 1 }
}
```

`enemy` が高い → STG / arena / bullet_hell のいずれかへ
`tempo` も蓄積されると → bullet_runner への可能性が生まれる

---

## バリデーションとデバッグ

### 自動バリデーション

開発中（`import.meta.env.DEV`）は起動時に自動で検証が走ります。
コンソールに以下が出れば正常:

```
[ManualDeck] Validation OK (42 entries, 0 errors, 2 warnings)
```

エラーが出た場合の例:

```
[ManualDeck] ERROR: key "3.0-my-route" の choices[0].next "4.0-nonexist" が存在しません
[ManualDeck] WARNING: key "3.0-orphan" は "1.0" から到達不可能です
```

### よくあるミス

| 症状 | 原因 |
|---|---|
| 選択肢を選んでも何も起きない | `next` のキーが存在しない or タイプミス |
| いつまでもジャンルが確定しない | `thresholds` の値が選択肢の合計を超えている |
| エンディングテキストが表示されない | `endingFlavor` が `src/data/genres/<id>.json` に未記載 |
| 見た目が変わらない | TSプラグインの `export default` 忘れ、または `id` の不一致 |
| ジャンルが認識されない | `src/data/genres/<id>.json` の `id` 重複・JSON 構文エラー（起動時の validation を確認） |

---

## チェックリスト

### 新しい選択肢ブランチを追加する

- [ ] `src/data/manuals/` に JSON ファイルを作成（TEMPLATE.json をコピー）
- [ ] `key` が全ファイル通じてユニークであることを確認
- [ ] 親エントリの `choices[].next` が新しいキーを指していることを確認
- [ ] ブラウザ開発者コンソールで validation エラーがないことを確認

### 新しいジャンルエンディングを追加する

- [ ] `src/data/genres/<id>.json` を作成（thresholds, enableFeatures, scoreFormula, manualReveal, endingFlavor, theme, bgColor）
- [ ]（任意）`src/genres/MyGenrePlugin.ts` を作成し末尾で `export default new MyGenrePlugin()`（視覚テーマ + spawnTable）
- [ ] ※ `src/domain/types.ts` や `src/genres/index.ts` の編集は不要（GenreId は string・プラグインは自動収集）
- [ ] `src/data/manuals/` の JSON で genreParams を調整し、新ジャンルの thresholds へ収束するルートが存在することを確認
- [ ] ブラウザで実際にそのジャンルへ収束するか動作確認

### テスト時のショートカット

`genreParams` の初期値を `src/data/genres/<id>.json` の thresholds ちょうどに設定した URL パラメータや
ブラウザコンソールからの直接呼び出しで、エンディング画面を素早く確認できます。
（実装方法は `composables/useGameState.ts` の `debugForceGenre()` を参照）

---

## 参照ドキュメント

- [architecture.md](./architecture.md) — システム全体の設計
- [manual-json.md](./manual-json.md) — JSON スキーマの全フィールド詳細
- [genre-plugin.md](./genre-plugin.md) — GenrePlugin の全メソッド仕様
- [feature-system.md](./feature-system.md) — FeatureSystem（メカニクス追加）の方法
- [framework.md](./framework.md) — ManualBuilder / ManualValidator の使い方
