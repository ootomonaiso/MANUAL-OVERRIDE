# 取扱説明書を読むゲーム — 実装設計書

> 本書は `CLAUDE.md`（コンセプト）と `spec.md`（仕様ドラフト）を実装可能なレベルに落とし込んだ設計書。

---

## 0. 技術方針

| 項目 | 決定 | 補足 |
|---|---|---|
| ビルド | **Vite + Vue 3 + TypeScript** | `npm run build` で `dist/` に静的成果物を出力 |
| オフライン制約 | **成果物 `dist/` は完全自己完結・ネットワーク不要** | dev server のみ node を使用。ビルド後は `index.html` を開くだけで動作。外部CDN・フォント・API を一切参照しない |
| 描画 | ゲーム本体は **Canvas 2D**、UI（説明書・選択・HUD・投擲）は **Vue コンポーネント** | DOM と Canvas を重ねる構成 |
| 状態管理 | Vue の composables（`reactive` / `ref`）。Pinia は使わない（規模的に過剰） | |
| データ | ルール・ジャンル・スコアはすべて **JSON または `.ts` の定数オブジェクト** | コードにルールをハードコードしない。`import` で同梱しビルド時に取り込む |
| アセット | 図形描画主体。画像/音は必要時に `src/assets` へ同梱し base64 or 相対パス | フォントも同梱（説明書の世界観のため） |

### オフライン整合についての注記
`CLAUDE.md` の「Node.js等のサーバーを利用せず dist内部のみで完結」は **実行時の制約**として解釈する。
Vite はビルドツールとして開発時のみ node を使い、出力 `dist/` は静的ファイルのみ。
よって `dist/index.html` をローカルで開く（`file://` または任意の静的配信）だけで動作し、制約を満たす。

---

## 1. 全体アーキテクチャ

```
┌─────────────────────────────────────────────┐
│ Vue App (UI レイヤ)                           │
│  ┌──────────┐ ┌──────────┐ ┌──────────────┐   │
│  │ HUD       │ │ ManualUI │ │ ChoiceUI     │   │
│  │ (スコア等) │ │ (説明書)  │ │ (2択)        │   │
│  └──────────┘ └──────────┘ └──────────────┘   │
│  ┌──────────────────────────────────────────┐ │
│  │ ThrowUI (投擲ドラッグ + パワーゲージ)        │ │
│  └──────────────────────────────────────────┘ │
└───────────────▲─────────────────────┬─────────┘
                │ reactive state       │ user input
┌───────────────┴─────────────────────▼─────────┐
│ composables (useGameState / useManual)         │
│  ゲームループとVueをつなぐ状態ハブ               │
└───────────────▲─────────────────────┬─────────┘
                │ RuntimeRules         │ tick()
┌───────────────┴─────────────────────▼─────────┐
│ domain (純粋ロジック・Vue非依存)                 │
│  ruleEngine / genreResolver / LearningSystem / │
│  scoreCalc / types                              │
└───────────────▲─────────────────────┬─────────┘
                │ reads                │ drives
┌───────────────┴──────────┐ ┌────────▼─────────┐
│ data (JSON駆動定義)        │ │ game (Canvas)     │
│ manualDeck / genres /     │ │ sideScroller /    │
│ gameBalance / tunables    │ │ throwEngine       │
└───────────────────────────┘ └───────────────────┘
```

**レイヤ間ルール**
- `domain` は Vue にも Canvas にも依存しない純粋関数・純粋クラス（テスト容易）。
- `game`（Canvas）は `domain` が生成した `RuntimeRules` を読み取って描画・物理を行う。状態判断は持たない。
- `composables` が橋渡し。入力イベント → domain → RuntimeRules 更新 → game へ反映、を担う。
- `data` は静的定義のみ。ロジックを持たない。

---

## 2. ディレクトリ構成

```
src/
  main.ts                     # Vue マウント
  App.vue                     # 画面ルート（Canvas + UIオーバーレイ + フェーズ切替）

  data/
    manualDeck.ts             # 説明書バージョン・2択・操作・危険色・派生パラメータ
    genres.ts                 # 各ジャンル定義（閾値・有効機能・スコア式）
    gameBalance.ts            # 距離/スコア比率/投擲重み/難易度カーブ
    tunables.ts               # VFX・カメラ・スコアの調整値
    config/                   # JSON設定ファイル群（17個）

  domain/
    types.ts                  # 全型定義
    ruleEngine.ts             # 選択履歴 → RuntimeRules 合成
    genreResolver.ts          # genreParams 蓄積 → ジャンル収束判定
    LearningSystem.ts         # 行動統計 → 追加ルール発火
    scoreCalc.ts              # プレイスコア + 投擲スコア合算

  game/
    sideScroller.ts           # Canvas 横スクロール本体（ゲームループ）
    entities.ts               # Player / Hazard / Bullet / Enemy / Tower 等
    systems/                  # ジャンル機能のシステム（feature単位）
      ShootFeature.ts
      RhythmFeature.ts
      MovementFeature.ts
      RpgFeature.ts
      PuzzleFeature.ts
    throwEngine.ts            # 投擲フェーズの物理 + 投擲スコア

  composables/
    useGameState.ts           # フェーズ・全体状態の統括
    useManual.ts              # 説明書表示・更新履歴・差分演出

  components/
    Hud.vue
    ManualPanel.vue           # 右下の説明書（差分強調アニメ含む）
    ChoicePanel.vue           # 2択提示
    ThrowOverlay.vue          # 投擲ドラッグUI + パワーゲージ
    EndingPanel.vue           # ジャンル別エンディング
    TutorialHints.vue         # 初心者向けヒント

  genres/                     # ジャンルプラグイン（12+ 種）
    BasePlugin.ts
    StgPlugin.ts
    RpgPlugin.ts
    RhythmPlugin.ts
    PuzzlePlugin.ts
    ...

  engine/
    GameRegistry.ts           # ジャンル・システムの中央レジストリ
    GenrePlugin.ts            # GenrePlugin インターフェース
    FeatureSystem.ts          # FeatureSystem インターフェース

  framework/
    ManualLoader.ts           # JSON ファイル自動読み込み
    ManualBuilder.ts          # プログラムで説明書生成
    ManualValidator.ts        # バリデーション
    types.ts                  # 型定義

  plugins/
    JSONGenrePlugin.ts        # JSON からジャンル生成
    SoundManager.ts           # サウンド管理
```

---

## 3. 型設計（`domain/types.ts`）

### 3.1 ジャンルパラメータ軸（12軸）

| 軸 | 説明 | 主に影響するジャンル |
|---|---|---|
| `tempo` | スピード・テンポ感 | runner / rhythm / racing |
| `range` | 射程・遠距離立ち回り | stg |
| `enemy` | 敵密度・戦闘激化 | stg / arena / bullet_hell |
| `combo` | 連続成功・コンボ重視 | puzzle / hack_slash |
| `growth` | 成長・育成要素 | rpg / dungeon |
| `rhythm` | リズム・タイミング精度 | rhythm / sports |
| `stealth` | 隠密・接触回避 | stealth_action / horror |
| `vertical` | 縦移動・縦スクロール指向 | aerial_stg / aquatic |
| `aerial` | 空中・浮遊指向 | platformer / aquatic |
| `survive` | 耐久・生存優先 | survival / horror |
| `craft` | 作成・設置・積み上げ | tower_def / idle |
| `speed` | 純粋速度・ダッシュ量 | racing / sports |

### 3.2 ジャンル一覧（21種 + base）

| ID | ラベル | 閾値 |
|---|---|---|
| `runner` | エンドレスランナー | tempo:5 |
| `stg` | 横スクロールSTG | range:4 + enemy:4 |
| `rpg` | RPG | growth:4 |
| `puzzle` | パズル | combo:4 |
| `rhythm` | リズム | tempo:4 + rhythm:4 |
| `aerial_stg` | 縦スクロールSTG | vertical:3 + range:3 + enemy:3 |
| `bullet_hell` | 弾幕シューティング | vertical:3 + enemy:5 |
| `survival` | サバイバル | survive:4 + growth:3 |
| `stealth_action` | ステルスアクション | stealth:4 |
| `racing` | レーシング | speed:4 + tempo:3 |
| `platformer` | プラットフォーマー | aerial:3 + combo:3 |
| `dungeon` | ダンジョン探索 | growth:5 + craft:2 |
| `tower_def` | タワーディフェンス | craft:5 + enemy:3 |
| `sports` | スポーツ | speed:3 + rhythm:3 |
| `idle` | 放置ゲーム | craft:4 |
| `bullet_runner` | 弾幕ランナー | tempo:5 + enemy:4 |
| `arena` | アリーナバトル | enemy:5 + combo:4 |
| `aquatic` | 水中アドベンチャー | vertical:2 + aerial:2 + survive:3 |
| `horror` | サバイバルホラー | survive:5 + stealth:3 |
| `hack_slash` | ハックアンドスラッシュ | enemy:4 + combo:5 |

### 3.3 主要型のリファレンス

```ts
// 成長パラメータ（12軸）
export type GenreParam = 'tempo' | 'range' | 'enemy' | 'combo' | 'growth' | 'rhythm'
  | 'stealth' | 'vertical' | 'aerial' | 'survive' | 'craft' | 'speed'

export type GenreId = 'base' | 'runner' | 'stg' | 'rpg' | 'puzzle' | 'rhythm'
  | 'aerial_stg' | 'bullet_hell' | 'survival' | 'stealth_action' | 'racing'
  | 'platformer' | 'dungeon' | 'tower_def' | 'sports' | 'idle'
  | 'bullet_runner' | 'arena' | 'aquatic' | 'horror' | 'hack_slash'

export type Phase = 'title' | 'tutorial' | 'updating' | 'playing' | 'genreLocked' | 'throwing' | 'ending';

// 機能フラグ（ジャンルが有効/無効化する挙動の単位）
export type FeatureId =
  | 'shoot' | 'three_way' | 'enemy_hp'
  | 'auto_run' | 'slow_precise' | 'double_jump' | 'long_air'
  | 'hp' | 'exp' | 'item_pickup'
  | 'grid_stop' | 'puzzle_solve'
  | 'beat_hazard' | 'just_input' | 'beat_dash'
  | 'tower';

export interface ManualVersion {
  version: string;                 // "1.0" 等
  manualText: string[];
  choices: Choice[];               // 末端は空（=更新終了）
  controls: Controls;
  hazards: { colors: string[]; safeColors: string[] };
  learningRules?: LearningRule[];  // プレイヤー行動に基づいた自動ルール更新
}

export interface GenreDef {
  id: GenreId;
  label: string;
  thresholds: GenreParams;         // この値を超えたら収束候補
  enableFeatures: FeatureId[];
  disableFeatures: FeatureId[];
  scoreFormula: string;            // 式は scoreCalc が解釈する DSL
  manualReveal: string;            // 確定時に説明書へ出す宣言文
  endingFlavor: string;            // エンディング画面の締めくくりメッセージ
  theme: 'plain' | 'stg' | 'rpg' | 'puzzle' | 'rhythm' | 'horror' | 'aquatic';
  gravity?: number;                // 重力加速度 px/s²。省略時は 1600
}

// 実行時にゲーム本体が読む合成済みルール
export interface RuntimeRules {
  controls: Controls;
  hazardColors: Set<string>;
  safeColors: Set<string>;
  features: Set<FeatureId>;
  genre: GenreId;                  // 未確定時は 'base'
  scrollSpeed: number;
  bpm?: number;                    // rhythm系で使用
}

export interface LearningRule {
  trigger: { type: keyof ActionStats | 'jumpRate' | 'rightRate'; threshold: number };
  effect: { type: 'disableAction' | 'invertHazard' | 'forceFeature'; payload: string; durationSec?: number };
}

export interface ThrowResult { airTime: number; arcHeight: number; speed: number; }
export interface FinalScore { play: number; throw: number; total: number; }
```

---

## 4. データ駆動の設計

### 4.1 説明書デッキ（`data/manualDeck.ts`）
- `ManualVersion` の配列（またはキー付きマップ）。
- ver1.0 をルート（チュートリアル）とし、`choices[].next` でツリー状に分岐。
- 各 `Choice.genreParams` が分岐の核。プレイヤーには方向性を見せない。
- 末端バージョン（`choices` が空）に到達 → Phase C 収束判定へ。

### 4.2 ジャンル定義（`data/genres.ts`）
- 21ジャンル + base を定義。
- `runner` / `stg` が完全実装、他は段階的に有効化。

### 4.3 スコア式 DSL（`scoreFormula`）
ジャンルごとのプレイスコア式を文字列で持ち、安全な評価器（`evalScoreFormula`）で計算する。
**`eval` は使わない**（XSS/任意実行リスク）。許可するのは変数・数値・`+ - * /` と括弧のみ。

```
利用可能変数: distance, kills, combo, exp, beatHits, survivedSec,
              accuracy, maxCombo, deaths, itemsCollected, bossKills,
              stealthBonus, colorTouches
例: stg  → "kills * 120 + distance * 0.5 + combo * 80"
    runner → "distance * 1.2 + survivedSec * 8 + combo * 50"
```

### 4.4 バランス（`data/gameBalance.ts`）
```
UPDATE_DISTANCES: 100段階の動的生成 + 1500px 無限トリガー
hazardSpawnCurve: 距離に応じた出現間隔の減少関数
scoreRatio: { play: 0.7, throw: 0.3 }
throwScoreWeights: { airTime: 0.5, arcHeight: 0.4, speedPenalty: 0.1 }
```

---

## 5. ゲーム進行フロー（状態機械）

```
[tutorial]
   │ ver1.0 を素のまま遊ぶ。一定距離到達
   ▼
[updating] ←─────────────┐
   │ ChoicePanel で2択提示  │ 更新回数 < 規定回数
   │ 選択 → genreParams加算  │
   │ ruleEngine が RuntimeRules 再合成
   │ ManualPanel が差分アニメ
   └───────────────────────┘
   │ 規定回数（=updateDistances長）到達
   ▼
[genreLocked]
   │ genreResolver が収束ジャンル決定
   │ enable/disableFeatures を適用、説明書テーマ変化
   │ manualReveal を表示しつつ続行プレイ
   ▼ （任意タイミングでギブアップ）
[throwing]
   │ ManualPanel をドラッグ → ThrowOverlay
   │ throwEngine が放物線シミュ → ThrowResult
   ▼
[ending]
   scoreCalc で final = play*0.7 + throw*0.3
   EndingPanel: ジャンル別メッセージ + 別ルート示唆
```

**フェーズ遷移は `useGameState` が単一の `phase: Phase` で管理**。各フェーズの入口/出口処理を明示。

---

## 6. 主要モジュール詳細

### 6.1 `domain/ruleEngine.ts`
```ts
buildRuntimeRules(deck, choiceHistory, learningActive, balance): RuntimeRules
```
- ルートから `choiceHistory` を辿って現在の `ManualVersion` を特定。
- `controls` / `hazards` を上書き合成（後勝ち）。
- 累積 `genreParams` を `genreResolver` に渡し `genre` と `features` を確定。
- 学習ルール発火分を最後に適用（危険色反転・アクション無効化など）。
- 純粋関数。入力が同じなら出力同一 → テスト容易。

### 6.2 `domain/genreResolver.ts`
```ts
accumulate(history): GenreParams
resolve(params, genres): GenreId   // 閾値超過のうち最も「超過度合い」が高いジャンル
featuresFor(genreId, genres): { enable: Set, disable: Set }
```
- 複数閾値超過時は超過量の合計が最大のものを採用。同点は定義順優先。

### 6.3 `game/sideScroller.ts`
- `requestAnimationFrame` ベースのループ：`update(dt)` → `render(ctx)`。
- 状態は `RuntimeRules` を参照。features の有無で各 system を on/off。
- エンティティ：Player / Hazard（色判定）/ Bullet / Enemy / Tower / Item。
- 衝突：AABB。危険色に触れたら被弾、安全色は無害。
- 行動を `ActionStats` に記録 → 学習トリガー監視。
- ゲーム終了時（`_die()`）に `_recalculatePlayScore()` で scoreFormula を評価。

### 6.4 `game/systems/`（feature 単位の差し込み）
| system | 担当 feature | 効果 |
|---|---|---|
| ShootFeature | shoot, three_way, enemy_hp | 弾発射・敵HP・撃破コンボ |
| MovementFeature | auto_run, slow_precise | 自動前進 / 低速精密 |
| RhythmFeature | beat_hazard, just_input, beat_dash | BPM同期の危険色反転・ジャスト入力加点 |
| RpgFeature | hp, exp, item_pickup | HP・経験値・アイテム収集 |
| PuzzleFeature | grid_stop, puzzle_solve | スクロール停止・配置パズル |

### 6.5 `game/throwEngine.ts`
- 入力：ドラッグ方向（角度）+ パワーゲージ（リリース時の値）。
- 放物線シミュ：`v0`, `angle`, 重力。`airTime`/`arcHeight`/`speed` を計測。
- 投擲スコア = `airTime*0.5 + arcHeight*0.4 - speed*0.1`（重みは JSON）。

### 6.6 `domain/scoreCalc.ts`
- プレイスコア：ジャンルの `scoreFormula` を安全パーサで評価。
- 最終：`play*ratio.play + throw*ratio.throw`。

---

## 7. UI / 演出設計

### 7.1 ManualPanel（説明書・主役）
- 画面右下に常時表示。白背景＋黒文字。
- 更新時：旧文 → 取り消し線、新文 → 赤＋手書き風フェードイン（blur アニメーション）。
- 更新履歴：直近3件を折りたたみで閲覧可。
- ジャンル確定時：`theme` に応じた CSS クラス切替（STG=ドット/SF、RPG=明朝/羊皮紙、PUZZLE=モノスペース/罫線）。

### 7.2 ChoicePanel
- 2択カード。文言のみ提示、ジャンル方向は隠す。
- 選択 → `useGameState` に通知 → ruleEngine 再合成 → 差分アニメ。

### 7.3 ThrowOverlay
- genreLocked 中いつでもギブアップ可能ボタン。
- ManualPanel をポインタドラッグ → 方向ベクトル＋パワーゲージ表示 → リリースで投擲。

### 7.4 EndingPanel
- 「あなたはこのゲームを◯◯にしました。」＋ジャンル固有の `endingFlavor`。
- 2周目示唆・スコア表示。

---

## 8. 実装フェーズ（マイルストーン）

| マイルストーン | 内容 | 状態 |
|---|---|---|
| **M0: 足場** | Vite+Vue+TS 雛形、Canvas マウント、空ループ描画 | ✅ 完了 |
| **M1: 横スクロール本体** | Player 移動+ジャンプ、自動スクロール、危険色 Hazard、衝突、距離スコア | ✅ 完了 |
| **M2: 説明書＋2択** | ManualPanel/ChoicePanel、3段階更新、controls/hazards 動的切替＋差分演出 | ✅ 完了 |
| **M3: ジャンル収束 + RUNNER/STG** | genreResolver、shoot/autorun フィーチャー、説明書テーマ切替、scoreFormula 評価 | ✅ 完了 (MVP) |
| **M4: 投擲＋エンディング** | throwEngine、ThrowOverlay、scoreCalc 合算、EndingPanel | ✅ 完了 |
| **M5: 残りジャンル** | 12+ ジャンルプラグイン、rhythm/rpg/puzzle/survival 等のフィーチャー | ✅ 完了 |
| **M6: 学習ルール + 仕上げ** | LearningSystem 統合、難易度調整、無限選択肢、offline ビルド検証 | ⚠️ 一部完了（LearningEffect 未実装） |

---

## 9. テスト方針
- `domain/` は純粋関数中心 → Playwright で統合テスト。
- スコア式パーサは不正入力（関数呼び出し・記号）を弾くテストを必須化（セキュリティ）。
- ゲームループ/Canvas は手動プレイ確認（golden path + 各ジャンル収束 + 投擲）。

---

## 10. 未決事項・要確認

| 項目 | 状態 |
|---|---|
| 説明書の差分演出は CSS アニメで足りるか | ✅ 決定: ManualPanel.vue で差分強調・取り消し線・手書き風フェードインを実装済み |
| PUZZLE のスクロール停止時、横スクロールの「面影」をどう残すか | ⚠️ 未解決: PuzzleFeature の実装継続中 |
| 学習ルールと2択分岐が競合した時の優先順位 | ✅ 決定: 学習ルールが後勝ちで上書き |
| BGM/SE を入れるか | ⚠️ 部分実装: SoundManager.ts は実装済み、実際の音声ファイルは未配置 |
