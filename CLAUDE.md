# 取扱説明書を読むゲーム

## プロジェクト概要

横スクロールアクションゲームを起点に、プレイヤーが説明書を選択・編集していくことでゲームジャンル自体が変容していく体験型ゲーム。「横スクロールというシンプルな原点から、どれだけ多様なゲームが生まれうるか」をプレイヤー自身が発見することがコンセプト。

説明書は逐次更新され、プレイヤーは2択でバージョンを選びながらゲームを育てる。選択の蓄積によってRPG・STG・パズル・リズムゲームなど異なるジャンルへと分岐し、最終的に説明書を投げ捨てるギミックでゲームが完成する。

- ターゲット: Webブラウザ（HTML/CSS/JS）
- 設計方針: JSON駆動。ルール・UI挙動・ジャンル分岐・スコア重みはすべてJSONで切り替え可能にする
- 完全にネットワーク遮断状態でも動作すること。Node.js等のサーバーを利用せず、dist内部のみで完結すること

---

## ゲームのコアコンセプト

### 横スクロールは「0番目のジャンル」

チュートリアルで体験する横スクロールは、あらゆるゲームの原型。説明書への選択を重ねることで、そこからRPGが生まれたり、STGが生まれたり、パズルが生まれたりする。プレイヤーは「ゲームというものがどれだけ多様になれるか」を自分の手で体験する。

### 説明書は「ゲームの設計書」

更新のたびに提示される2択は、ゲームジャンルを決定づけるルール選択。プレイヤーは意識的にも無意識的にも、自分好みのゲームを作っていく。

---

## ゲーム構造

### フェーズ

- **Phase A（チュートリアル）**: 説明書ver.1.0の横スクロールをそのまま遊ぶ。ジャンプと回避だけのシンプルな体験
- **Phase B（説明書更新フェーズ）**: 2〜4回の選択でルールが書き換わり、ゲームの手触りが変化し始める
- **Phase C（ジャンル確定フェーズ）**: 選択の蓄積によってゲームが特定ジャンルへ収束。横スクロールの面影を残しながら全く異なるゲームになっている
- **投擲フェーズ**: 説明書UIをドラッグして投げることでゲーム完成。「作り終えた」宣言

### スコア計算

```
最終スコア = プレイスコア(70%) + 投擲スコア(30%)
```

プレイスコアはジャンルごとに異なる計算式を持つ（JSON定義）。

投擲スコアの内訳:
- 滞空時間 × 0.5
- 弧の高さ × 0.4
- 速度ペナルティ × 0.1（速すぎると減点）

---

## ジャンル分岐システム

### 実装されたジャンル（21種）

| ジャンルID | ラベル | 説明 |
|---|---|---|
| `stg` | STG | 敵を撃って倒すシューティング |
| `aerial_stg` | Aerial STG | 縦スクロール版シューティング |
| `bullet_hell` | Bullet Hell | 弾幕回避ゲーム |
| `bullet_runner` | Bullet Runner | 弾を避けながら走るアクション |
| `arena` | Arena | 複数敵同時撃破 |
| `hack_slash` | Hack & Slash | コンボ系アクション |
| `aquatic` | Aquatic | 水中アドベンチャー |
| `survival` | Survival | HP管理の生存ゲーム |
| `rpg` | RPG | 経験値・成長システム |
| `dungeon` | Dungeon | ダンジョン探索 |
| `tower_def` | Tower Defense | タワー設置型防御 |
| `idle` | Idle | 放置ゲーム |
| `horror` | Horror | サバイバルホラー |
| `puzzle` | Puzzle | 思考パズル |
| `rhythm` | Rhythm | 音楽同期ゲーム |
| `platformer` | Platformer | プラットフォーマー |
| `runner` | Runner | エンドレスランナー |
| `racing` | Racing | レースゲーム |
| `sports` | Sports | スポーツゲーム |
| `stealth_action` | Stealth | ステルスアクション |
| `base` | Base | 横スクロール（原点） |

### 分岐の決まり方

各選択がジャンルパラメータを加算する。蓄積値が閾値を超えたジャンルに収束。
直接的な表現を避け、横スクロールから縦、ステージを空にしたり海にしたりなど何の気なしに選べるものが望ましい

収束システムは2方式を併用:
- **genreParams 軸方式**: `tempo` / `range` / `enemy` / `combo` / `growth` / `rhythm` の累積値でジャンルを決定（旧方式・後方互換）
- **genrePoints 直接方式**: カード選択で特定ジャンルに直接ポイントを加算（新方式）

```
RUNNER  → tempo高 + enemy低
STG     → range高 + enemy高
RPG     → growth高 + tempo低
PUZZLE  → combo高 + tempo最低
RHYTHM  → tempo高 + rhythm高
```

---

## アーキテクチャ

MVVMパターンで設計。ゲームロジック・ドメイン・View を明確に分離する。

```
src/
├── engine/          # GenrePlugin・FeatureSystem インターフェース + GameRegistry
├── domain/          # 純粋ロジック（ruleEngine, genreResolver, scoreCalc, LearningSystem）
├── framework/       # ConfigLoader・ManualBuilder・ManualValidator（JSON読み込み基盤）
├── genres/          # ジャンルプラグイン（TS実装 15種）
├── plugins/         # PluginManager・SoundManager・JSONGenrePlugin
├── game/
│   ├── sideScroller.ts   # Canvas エンジン本体
│   ├── InputManager.ts   # キー入力の受付・正規化・エッジ検出
│   ├── ParticleSystem.ts # パーティクル生成・更新・描画
│   ├── entities.ts       # Player・Hazard・Bullet・Item
│   └── systems/          # FeatureSystem 実装（MovementFeature 他6種）
├── composables/     # Vue ViewModel（useGameState, useManual, useScoreAnimation）
├── components/      # Vue UI コンポーネント
├── tutorial/        # チュートリアル画面
└── data/
    ├── config/      # 設定JSON（16ファイル: score.json, genres.json, physics.json 等）
    ├── genres/      # ジャンル定義JSON（21ファイル）
    └── cards/       # カードデッキJSON（starter-cards.json 等）
```

### 主要クラス・モジュール

| クラス/モジュール | 役割 |
|---|---|
| `SideScroller` | Canvas ゲームエンジン本体。 InputManager・ParticleSystem を内包 |
| `InputManager` | キーボード入力の正規化・justPressed/justReleased 検出 |
| `ParticleSystem` | パーティクルの追加・フレーム更新・スローモーション描画 |
| `GameRegistry` | ジャンルプラグイン・FeatureSystem の中央レジストリ |
| `FeatureSystem` | Feature フラグ制御インターフェース（ShootFeature 等が実装） |
| `LearningSystem` | プレイ行動統計を監視し動的にルールを変更（jumpRate / shotRate 等） |
| `ruleEngine` | 選択履歴から RuntimeRules を合成する純粋関数 |
| `genreResolver` | genreParams + genrePoints からジャンルIDを決定 |
| `SoundManager` | BGM フェードイン/アウト・効果音フック（SoundHooks インターフェース） |
| `useScoreAnimation` | スコア差分の大小でアニメーション/即時更新を切り替える ViewModel |

---

## 主要コンポーネント

### 横スクロール本体

- 恐竜ゲーム系エンドレス形式、自動スクロール
- 障害物出現頻度が徐々に増加（距離ベース難易度曲線: 1.0倍 → 1.5倍）
- 操作: 左右移動 + ジャンプ（デフォルト: Arrow + Space）
- ジャンル確定後は操作・見た目・ルールがそのジャンルに置き換わる

### 説明書UI

- 画面右下に常時表示
- 更新時: 差分強調（赤線・取り消し線・手書き風追加）のアニメーション
- 更新履歴: 直近数件を閲覧可能
- ギブアップ後はこのUIをドラッグして投擲

### バージョン選択システム（カードデッキ方式）

- 説明書更新時に2択を提示
- 選択肢にはジャンル方向性が隠れている（プレイヤーには明示しない）
- カードは `src/data/cards/` のJSONデッキから引く（starter-cards, action-branch 等）
- 矛盾カード機能: 特定の選択の組み合わせでランダム展開が変わる

---

## JSONデータ設計

すべてのルールはJSONで定義する。コードにルールをハードコードしない。

### 設定ファイル群 (`src/data/config/`)

| ファイル | 内容 |
|---|---|
| `score.json` | scoreRatio（play 70% / throw 30%）・投擲スコア重み |
| `genres.json` | ジャンル定義一覧・テーマカラーマップ |
| `game_balance.json` | MAX_ROUNDS・スクロール速度・難易度曲線係数 |
| `physics.json` | 重力・ジャンプ力・摩擦係数 |
| `spawn.json` | 障害物出現頻度・距離係数 |
| `rhythm_tuning.json` | BPM・ビートウィンドウ幅 |
| `shoot.json` | 弾速・連射間隔・ダメージ |
| `vfx.json` | パーティクル量・シェイク強度 |
| `ui.json` | UI タイミング・アニメーション時間 |
| `camera.json` | カメラ追従係数 |
| `difficulty.json` | 難易度スケール設定 |
| `background.json` | 背景スクロール速度比 |
| `hazard_vfx.json` | ハザード別演出パラメータ |
| `stealth.json` | ステルスゲージ設定 |
| `boss.json` | ボス出現・HP設定 |
| `genre_params.json` | ジャンルパラメータ閾値テーブル |

### ジャンル定義 (`src/data/genres/stg.json` 等)

```json
{
  "id": "stg",
  "label": "シューティングゲーム",
  "thresholds": { "range": 4, "enemy": 4 },
  "enableFeatures": ["shoot", "enemy_hp"],
  "disableFeatures": ["manual_scroll"],
  "scoreFormula": "kills * 100 + distance * 0.5",
  "manualReveal": "これはシューティングゲームになりました。",
  "theme": "sf",
  "bgColor": "#0a0a1e"
}
```

### カードデッキ (`src/data/cards/`)

```json
{
  "id": "1.1a",
  "label": "障害物を撃って倒せるようにする",
  "next": "1.1a",
  "genreParams": { "range": 2, "enemy": 2 },
  "genrePoints": { "stg": 3 }
}
```

---

## 結末の演出

投擲後、ジャンルに応じたエンディングメッセージと、最終的な取説が出てくる

---

## 実装完了項目

### Core Features
- [x] 1画面横スクロール（エンドレス）
- [x] 説明書UI（右下常時表示、テーマ切り替え対応）
- [x] 説明書の多段階更新と2択選択
- [x] ジャンルパラメータの蓄積と収束判定（genreParams + genrePoints 2方式）
- [x] 21ジャンルの完全実装（JSON定義 + TSプラグイン）

### 高度な機能
- [x] 無限選択肢システム（100+ 選択肢、ver 9.0～15.0）
- [x] 距離ベース難易度曲線（1.0倍 → 1.5倍加速）
- [x] ジャンル確定時の説明書書き換え演出
- [x] 投擲フェーズ（ドラッグ操作 + パワーゲージ）
- [x] エンディングメッセージ（ジャンル別）
- [x] 説明書更新履歴表示
- [x] 差分強調アニメーション（赤線・取り消し線・インク効果）
- [x] 矛盾カード機能（選択の組み合わせで展開変化）
- [x] BGMフェードイン/アウト（SoundManager）
- [x] LearningSystem（プレイ行動に応じた動的ルール変更）

### アーキテクチャ & 品質
- [x] MVVMパターン（ViewModel: useScoreAnimation・useGameState・useManual）
- [x] InputManager 分離（キー入力ロジックを SideScroller から独立）
- [x] ParticleSystem 分離（パーティクル処理を SideScroller から独立）
- [x] FeatureSystem インターフェース（Feature 追加が1ファイル+1行で完結）
- [x] JSON駆動設計（config/ 17ファイル、genres/ 21ファイル）
- [x] テーマカラーの完全JSON駆動化（CSS ハードコードなし）
- [x] オフライン完全動作
- [x] CI/CDパイプライン整備
- [x] コーディング規約整備（ESLint naming-convention・any 厳格化）
- [x] マジックナンバー排除（定数化: ruleEngine.ts / sideScroller.ts）
- [x] 重複コード除去（useGameState.ts: genrePoints 累積をヘルパー関数化）

### テスト & 確認
- [x] Playwright 統合テスト
- [x] 無限選択肢テスト（20+ 段階）
- [x] ビルド最適化確認

---

## ビジュアル方針

- 白背景 + 黒文字の説明書が主役
- 更新差分は赤線・取り消し線・手書き風で強調
- ジャンル確定が近づくにつれ、説明書のフォントやレイアウトがそのジャンルらしい見た目に変化していく
  - STG → ドット文字・SF書体
  - RPG → 明朝体・羊皮紙風
  - PUZZLE → モノスペース・グリッド罫線

## Feature の追加方法

```
1. domain/types.ts の FeatureId に追加
2. src/game/systems/ に FeatureSystem 実装クラスを作成
3. src/game/systems/index.ts で GameRegistry.registerFeature() を呼ぶ（1行追加）
```

---

## コーディング規約

### 命名規則

| 対象 | 規則 | 例 |
|---|---|---|
| クラス・インターフェース・型エイリアス | PascalCase | `SideScroller`, `ChoiceRecord` |
| モジュールレベル定数 | UPPER_CASE または camelCase | `DEFAULT_GRAVITY`, `MAX_ROUNDS` |
| ファイル内プライベート関数 | `_` プレフィックス + camelCase | `_buildFakeManual()` |
| Vue composable | `use` プレフィックス + camelCase | `useGameState` |

### マジックナンバー

- ソースコード内に数値リテラルを直書きしない
- ゲームバランス値 → `src/data/config/*.json` に定義して `tunables.ts` / `gameBalance.ts` 経由で参照
- 実装固有の閾値（初期座標、dt 上限など）→ ファイル先頭の `const` 定数として定義

### コメント

- **何をしているか**は書かない（コードが語る）
- **なぜそうしているか**（制約・回避策・非自明な不変条件）だけを書く
- 不適切な俗語・感情的表現は禁止

### 重複コード

- 同じロジックが 2 箇所以上に現れたらヘルパー関数に抽出する
- ファイル内プライベートなヘルパーは `function` 宣言（composable のクロージャ外）か、モジュールレベルの純粋関数として定義

### ESLint

`npm run lint` で確認。主要ルール:
- `@typescript-eslint/no-explicit-any`: **error**（`any` は原則使用禁止）
- `@typescript-eslint/naming-convention`: クラス/インターフェース/型は PascalCase を強制
- `prefer-const`: **error**
- `eqeqeq`: **error**（`===` を使う）
