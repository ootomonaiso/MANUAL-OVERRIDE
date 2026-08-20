# 取扱説明書を読むゲーム — 要件定義書・仕様書・設計書

**版:** 1.0　**最終更新:** 2026-07-27

本書は本プロジェクトの要件定義書・仕様書・設計書を1ファイルに統合したもの。

- **第1部（要件定義書）** — 何を・なぜ作るか
- **第2部（仕様書）** — どう動くか（現行実装ベース）
- **第3部（設計書）** — どう実装するか（アーキテクチャ・型・モジュール詳細）

関連: [CLAUDE.md](CLAUDE.md)（プロジェクト概要・コーディング規約）/ [docs/README.md](docs/README.md)（技術ドキュメント索引）

---
---

# 第1部: 要件定義書

## 1. 目的・背景

### 1.1 コンセプト

横スクロールアクションを起点に、プレイヤーが取扱説明書（ルールブック）を2択で編集し続けることで、ゲームジャンル自体が変容していく体験型ゲーム。「横スクロールというシンプルな原点から、どれだけ多様なゲームが生まれうるか」をプレイヤー自身が発見することが体験の核。

最終的にプレイヤーは説明書UIを画面外へドラッグして投げ捨てる — これは「作品を完成させた宣言」ではなく、育ちきらなかった／愛着と自嘲が入り混じったゲームを「投げ捨てるオチ」として設計されている（作品名 *MANUAL-OVERRIDE*）。

### 1.2 想定プレイヤー体験

1. 素朴な横スクロール（ジャンプで避けるだけ）を数十秒プレイする
2. 説明書更新の2択を繰り返し選び、操作・見た目・ルールが少しずつ変質していく感覚を味わう
3. 気づけば当初と全く異なるジャンル（RPG・STG・パズル・リズムゲーム等）になっている
4. 説明書を投げて終わる。スコアと「あなたが作ったゲーム」の宣言を受け取る

## 2. スコープ

### 2.1 対象範囲

- Webブラウザ（デスクトップ想定）で完結する1人用ブラウザゲーム
- チュートリアル〜説明書更新〜ジャンル確定〜投擲〜エンディングまでの一連のプレイフロー
- 22ジャンル＋`base`（起点ジャンル）＋`glitch`（矛盾トリガー専用の非通常到達ジャンル）
- スコアリング（プレイスコア＋投擲スコア）
- ルール・ジャンル・カード・バランス値のJSON駆動化とその検証基盤

### 2.2 対象外（Non-Goals）

- マルチプレイ・オンライン対戦・ランキングサーバー連携
- モバイル専用UI最適化（タッチ操作は考慮するが専用レイアウトは作らない）
- 課金・広告等のマネタイズ要素
- セーブデータの永続化・複数プレイ間の引き継ぎ（1プレイ＝1セッションで完結）
- 実行時にサーバーへ問い合わせるあらゆる機能（下記オフライン要件と矛盾するため）

## 3. 機能要件

### 3.1 フェーズ進行

| フェーズ | 要件 |
|---|---|
| タイトル | ゲーム開始・（DEBUG_MODE時のみ）開発者メニューへの導線を提供する |
| チュートリアル導入 | 操作説明を常時参照可能な形で提示する |
| チュートリアル | ver.1.0の説明書のまま、素の横スクロールを操作できる |
| 説明書更新 | 一定距離ごとに2択カードを提示し、選択に応じてルール・操作・危険色・ジャンル方向性を変化させる |
| ジャンル確定 | 収束条件成立、または規定更新回数到達で1ジャンルに確定し、以後は説明書の自動更新を停止する |
| 投擲 | プレイヤーが任意タイミングでギブアップ可能、または死亡時に自動遷移する。説明書UIをドラッグ＆リリースして投げる操作を提供する |
| エンディング | 最終スコアとジャンル別の締めくくりメッセージを提示する |

### 3.2 説明書更新・ジャンル分岐

- 説明書更新のたびに2択（カード）を提示し、プレイヤーの選択がジャンルパラメータ・操作・危険色に反映されること
- 選択肢はジャンルの方向性を直接的な文言（ジャンル名等）では示さないこと（発見性の担保）
- 100+の選択肢を破綻なく提供できること（無限選択肢システム）
- 特定の選択の組み合わせにより、通常と異なる展開（矛盾カード）が発生しうること
- 22種類の確定ジャンル＋起点ジャンル`base`をサポートし、各ジャンルは固有の操作・見た目・スコア式を持つこと
- ジャンル確定は「収束条件成立」または「規定更新回数到達（現行値: 5回）」のいずれか早い方で発生すること
- 未収束のまま上限に達した場合、最尤ジャンルへ、`base`のまま収束した場合はフォールバックジャンルへ振り替えること

### 3.3 プレイ中の挙動変化

- 説明書更新に応じて操作キー割り当て・危険色/安全色・有効フィーチャーが動的に切り替わること
- プレイヤーの行動統計（ジャンプ多用等）に応じて、説明書に書かれていない追加ルールが自動発生しうること（学習システム）
- 距離に応じて難易度（障害物出現頻度等）が段階的に上昇すること

### 3.4 投擲フェーズ

- 説明書UIをポインタでドラッグし、方向とパワーゲージに応じて放物線状に投げられること
- 滞空時間・弧の高さを高評価、過度な速度を軽い減点とする評価方式であること（強く投げても著しく不利にならない）

### 3.5 スコアリング

- 最終スコア = プレイスコア(70%) + 投擲スコア(30%)
- プレイスコアの計算式はジャンルごとに異なり、JSON側の式定義から算出されること
- 投擲スコアの重み・速度ペナルティ閾値はJSONで調整可能であること
- スコアに応じたグレード判定（S/A/B/C等）を提示すること

### 3.6 エンディング

- 確定したジャンルに応じたエンディングメッセージ・締めくくり文を表示すること
- 通常到達しないジャンル（矛盾トリガー専用等）に到達した場合、専用のサプライズ演出を提示できること

### 3.7 説明書UI・演出

- 説明書は画面右下に常時表示されること
- 更新時、旧文の取り消し・新文の強調（差分アニメーション）が視認できること
- 直近の更新履歴を遡って確認できること
- ジャンル確定に近づくにつれ、説明書の書体・レイアウトがそのジャンルらしい見た目に変化すること

## 4. 非機能要件

### 4.1 オフライン動作（最重要制約）

- ビルド成果物（`dist/`）は完全に自己完結し、ネットワーク接続なしで動作すること
- Node.jsサーバー等の実行時依存を持たないこと（ビルド時のみNode.jsを使用する）
- 外部CDN・外部フォント・外部APIへの参照を一切含まないこと

### 4.2 データ駆動設計

- ゲームルール・ジャンル定義・スコア式・バランス値はすべてJSONで管理し、コードへの直接記述（ハードコード）を避けること
- JSON追加のみで新規ジャンル・新規説明書ルートを拡張できること（コード修正なしでの拡張性）
- すべてのJSONはスキーマ（`schemas/`）に基づき検証可能であること（`npm run validate`）

### 4.3 品質・保守性

- 命名規則・マジックナンバー排除・コメント方針など、[CLAUDE.md](CLAUDE.md) のコーディング規約に準拠すること
- 1ファイルが概ね300行を超える場合は責務分割を検討すること
- ESLint（`no-explicit-any: error`, `naming-convention`, `prefer-const`, `eqeqeq` 等）を通過すること
- ビルドサイズの増大をCI（`bundle-size`チェック）で監視すること

### 4.4 テスト

- ドメインロジック（純粋関数群）はユニットテストで担保すること
- ゲームフロー全体・各ジャンルの到達性・無限選択肢はPlaywright/スクリプトによる統合テストで担保すること
- CI（`npm run ci`）で typecheck / lint / validate / doc-links / feature-tests / build / bundle-size / unit-test を一括検証すること

### 4.5 開発者体験

- デバッグ用インターフェースは `DEBUG_MODE` 定数でオン/オフでき、本番では常時 `false` であること
- 新規ジャンル追加はJSON1ファイル（最小構成）〜JSON+TSプラグイン（フル機能）の両経路をサポートすること

## 5. 制約条件

| 制約 | 内容 |
|---|---|
| 技術スタック | Vite + Vue 3 + TypeScript（固定。Pinia等の追加状態管理ライブラリは規模的に不要と判断し採用しない） |
| 描画方式 | ゲーム本体は Canvas 2D、UIはVueコンポーネント |
| 配布形態 | 静的ファイルのみ（`dist/index.html` を開くだけで動作） |
| スコア式評価 | `eval` 不使用。変数・数値・四則演算・括弧のみを許可する安全なパーサで評価すること（XSS/任意コード実行対策） |
| 対応ブラウザ | モダンブラウザ（Chrome/Edge/Firefox 最新版相当）を主対象とする |

## 6. データ要件

- 説明書バージョン・2択カード・操作キー割当・危険/安全色定義
- ジャンル定義（22種＋`base`＋`glitch`）: 閾値・有効/無効フィーチャー・スコア式・エンディング文・テーマ
- ジャンルパラメータ12軸（tempo/range/enemy/combo/growth/rhythm/stealth/vertical/aerial/survive/craft/speed）の蓄積値
- ベイズ収束ハイパーパラメータ（`minProb`・`dominanceRatio`・`decayRate`・`baseDecay`）
- バランス値（スコア比率・投擲重み・難易度曲線・物理定数等）
- 詳細なファイル一覧・スキーマは第2部§7、第3部§2/§4参照

## 7. 受け入れ基準（Definition of Done）

以下をすべて満たすこと:

1. `npm run ci` が全ステップ成功する（typecheck / lint / validate / doc-links / feature-tests / build / bundle-size / unit-test）
2. チュートリアルからエンディングまでの一連のフローを、ネットワーク遮断状態のビルド済み `dist/` で最後までプレイできる
3. 22ジャンルすべてに到達可能であること（`npm run reach-sim` で検証）
4. 投擲〜スコア表示〜エンディングまでが正常に完了する
5. 新規ジャンル/フィーチャー/説明書ルートをコード非改修（JSON追加のみ）で追加できることを確認済みである

## 8. 用語集

| 用語 | 意味 |
|---|---|
| 説明書（マニュアル） | ゲームルールを提示するUI。プレイヤーの選択でバージョンが進む |
| フェーズ | ゲーム進行上の状態（title/tutorial/updating/playing/genreLocked/throwing/ending） |
| ジャンル収束 | 選択の蓄積により最終的なゲームジャンルが1つに確定すること |
| ジャンルパラメータ（軸） | ジャンル収束の判定に使う12種の累積値 |
| フィーチャー（FeatureId） | プレイ中に有効/無効を切り替えられる挙動単位（射撃・自動走行等） |
| 投擲フェーズ | 説明書をドラッグして投げる最終操作フェーズ |
| 矛盾カード | 特定の選択組み合わせで通常と異なる展開を発生させるカード |
| ベイズ収束 | 各軸の閾値との乖離から尤度を計算し事後確率でジャンルを決定する主方式 |

---
---

# 第2部: 仕様書

## 1. 概要

横スクロールアクション（`base`ジャンル）を起点に、プレイヤーが取扱説明書の2択を選び続けることでゲームジャンル自体が変容していく。横スクロールは「0番目のジャンル」で、選択の蓄積により22ジャンルへ分岐・収束する。最後は説明書UIを投げて終了する。

最終スコア = プレイスコア(70%) + 投擲スコア(30%)。

## 2. フェーズ遷移

状態は `phase` 変数（`useGameState.ts`）で一元管理する。

```
title
  │ ゲーム開始操作
  ▼
tutorialIntro      … 操作説明カードを表示
  │ チュートリアル開始操作
  ▼
tutorial           … ver.1.0 のまま横スクロールを実プレイ
  │ 一定距離ごとに更新条件が成立
  ▼
updating ⇄ playing … カード2択を提示（提示中はスクロール停止）→ 選択反映 → プレイ再開 → 再び距離到達で updating へ
  │ 収束成立 または 更新回数上限（5回）到達
  ▼
genreLocked        … ジャンル確定。説明書が確定文に書き換わる。以後、説明書の自動更新は停止する
  │ プレイヤーによるギブアップ操作、または死亡
  ▼
throwing           … 説明書UIをドラッグ→パワーゲージ→リリースで投擲
  │ 着地
  ▼
ending             … ジャンル別エンディングメッセージ + 最終スコア
```

補足:
- 説明書更新のトリガーは距離ベース。初期3回は間隔 `1100 / 2400 / 3900`、以降は `1100 + 1500×i` 間隔で最大100回分を動的生成する（無限選択肢システム）。
- `genreLocked` 以降は説明書の自動更新を停止する。
- 死亡すると `playing` / `genreLocked` のいずれからでも自動的に `throwing` へ遷移する。
- チュートリアルは設定でオン/オフ切り替え可能。

## 3. 初期状態（ver.1.0 / `base` ジャンル）の挙動

- 初期説明書は `base` ジャンルの定義に対応するもの1本のみ。選択履歴が空のあいだ、ジャンル収束判定はどの閾値も超えないため `base` のまま維持される。
- `base` は `auto_run` フィーチャーを常時有効とし、移動処理（`movement`）も常に併用される。
- 結果として、初期状態のプレイヤーは自動的に右へ走り続け、実質的な操作はジャンプのみになる（エンドレスランナー系の手触り）。
- 障害物色は `red`（触れると失敗）、安全色は `blue`。出現間隔は距離とともに短縮する（基準2400ms→最短800ms、指数的減衰）。
- 距離ベースの難易度加速により、出現頻度は最大+50%まで上昇する。

### 3.1 物理・操作パラメータ（初期値）

| 項目 | 値 |
|---|---|
| 基本スクロール速度 | 300 px/s |
| 走行速度 | 240 px/s |
| 重力 | 1600 px/s² |
| ジャンプ初速 | -720 |
| 2段ジャンプ初速（`double_jump`有効時） | -610 |
| プレイヤーサイズ | 36 × 52 px |
| 最大HP | 3 |
| コヨーテ時間 | 9フレーム |
| ジャンプ先行入力（バッファ） | 10フレーム |

デフォルト操作: ジャンプ=Space、移動=矢印キー。すべて数値は `src/data/config/physics.json` 等のJSONから読み込み、コードに直書きしない。

## 4. 説明書更新・カードシステム

- 最初の2択のみ固定ルート（初期説明書に内包）。以降はカードプール（`src/data/cards/*.json`）から毎回2枚を抽選する方式。
- カードデッキは3種:
  - `starter-cards.json` — 序盤向けカード
  - `expansion-cards.json` — 中盤以降の拡張カード
  - `surprise-cards.json` — 矛盾カード・サプライズ展開用
- 各カードは `genreParams`（12軸への加算）または `genrePoints`（特定ジャンルへの直接加点）、必要に応じて `addFeatures`（フィーチャーの即時付与）を持つ。
- 選択肢の文言はジャンル方向性を明示しない（「ステージに登場するものに個性を加える」等の間接表現）。

## 5. ジャンル収束システム

3方式を併用する（`genreResolver.ts`）。

1. **genreParams 軸方式**（後方互換）: 12軸（tempo/range/enemy/combo/growth/rhythm/stealth/vertical/aerial/survive/craft/speed）の累積値が各ジャンルの閾値を超えたかで判定。
2. **genrePoints 直接方式**（後方互換）: カードが特定ジャンルへ直接加点する方式。
3. **ベイズ収束方式（主方式）**: 各ジャンルの閾値との乖離量から尤度 `L = exp(-decayRate × Σmax(0, threshold - have))` を計算し、事後確率で収束判定する。

現行ハイパーパラメータ（`src/data/config/bayes.json`）:

| パラメータ | 値 | 意味 |
|---|---|---|
| `minProb` | 0.30 | 最尤ジャンルの事後確率がこれ以上で収束候補になる |
| `dominanceRatio` | 1.5 | 2位を何倍引き離せば確定するか |
| `decayRate` | 0.50 | 閾値未達分に対する尤度の減衰速度 |
| `baseDecay` | 0.10 | ベース減衰値 |

収束確定タイミング: **収束条件成立** または **更新回数 `MAX_ROUNDS`（=5）到達** のいずれか早い方。
- 上限到達までに収束しない場合は、その時点の最尤ジャンルへ確定する。
- `base` のまま収束した場合は `defaultFallbackGenre`（= `runner`）へ振り替える。
- `resolvable: false` のジャンル（`glitch`）は通常の収束候補ランキングから除外され、矛盾カードのトリガーでのみ強制発動する。

### 5.1 ジャンル一覧（22種 + base + glitch）

`src/data/genres/*.json` に1ジャンル1ファイルで定義。各ファイルは以下を持つ:

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

ジャンルの完全な一覧・閾値は [docs/genre-system.md](docs/genre-system.md) および [CLAUDE.md](CLAUDE.md) の一覧表を参照。実ファイル数は22ジャンル（起点`base`を含む）+ `glitch`（`resolvable:false`。矛盾トリガー専用の非通常到達ジャンル）の計23ファイル。

## 6. プレイ中の動的挙動

- 説明書更新のたびに `controls` / `hazards` / `features` が再合成される（後勝ちで上書き）。
- プレイヤーの行動統計（ジャンプ率・右移動率等）を監視し、閾値超過で説明書に書かれていない追加ルールが自動発火する（学習システム）。例: ジャンプ率が一定割合を超えると一時的にジャンプ無効化。
- フィーチャーは機能単位（`FeatureSystem`）で実装され、ジャンルの `enableFeatures`/`disableFeatures` により有効・無効が切り替わる。

## 7. スコア仕様

### 7.1 プレイスコア

ジャンルごとの `scoreFormula`（JSON文字列）を安全な式パーサで評価する。`eval` は使用しない（許可するのは変数・数値・四則演算・括弧のみ）。

```
利用可能変数: distance, kills, combo, exp, beatHits, survivedSec,
              accuracy, maxCombo, deaths, itemsCollected, bossKills,
              stealthBonus, colorTouches 等
例: stg    → "kills * 120 + distance * 0.5 + combo * 80"
    runner → "distance * 1.2 + survivedSec * 8 + combo * 50"
    base   → "distance * 0.8"
```

### 7.2 投擲スコア

```
投擲スコア = 滞空時間×0.6 + 弧の高さ×0.7 − 速度ペナルティ×0.04
```

- 速度ペナルティは閾値（`throwScoreWeightsSpeedPenaltyThreshold` = 1200）を超えた分のみに軽くかかる。強く投げても著しく不利にはならない設計。
- 重み・閾値はすべて `src/data/config/game_balance.json`（`throwScoreWeights*`）で調整可能。

### 7.3 最終スコア・グレード

```
最終スコア = プレイスコア×0.7 + 投擲スコア×0.3
```

グレード閾値の例（`score.json`）: S=8000 / A=5000 / B=2500 / C=1000。

## 8. 投擲フェーズ仕様

- `genreLocked` 中はいつでもギブアップ操作が可能。ギブアップまたは死亡で `throwing` へ遷移する。
- 説明書UIをポインタでドラッグすると方向ベクトルとパワーゲージが表示され、リリース時に投擲される（角度=ドラッグ方向、パワー=ゲージ値）。
- 放物線の物理パラメータ（重力・最大パワー・空気抵抗）は `src/data/config/throw.json` から読み込む。
- 着地後、投擲スコア計算・矛盾カードによるプレイスタイル検出・サプライズエンディング判定を経て `ending` へ遷移する。

## 9. UI・演出仕様

| コンポーネント | 仕様 |
|---|---|
| 説明書パネル | 画面右下に常時表示。白背景＋黒文字。更新時は旧文を取り消し線、新文を赤＋手書き風フェードインで強調する。直近数件の更新履歴を閲覧可能 |
| 2択カードUI | カード形式で2択を提示。選択後は即座にルール再合成と差分演出が走る |
| 投擲UI | ドラッグ操作＋パワーゲージのオーバーレイ |
| エンディングUI | 確定ジャンルの `endingFlavor` を用いた締めくくりメッセージ＋最終スコア表示 |
| テーマ切替 | ジャンル確定に伴い説明書の書体・レイアウトがジャンルテーマ（`theme`値）に応じて変化する（例: STG=ドット/SF書体、RPG=明朝体/羊皮紙風、PUZZLE=モノスペース/グリッド罫線） |

## 10. データファイル一覧（現行実装）

| ディレクトリ | ファイル数 | 内容 |
|---|---|---|
| `src/data/config/` | 22ファイル | スコア比率・ジャンルテーマ色・物理・スポーン・演出・ベイズ等のバランス値 |
| `src/data/genres/` | 23ファイル | 22ジャンル（起点`base`含む）＋`glitch`（`resolvable:false`、通常到達不可） |
| `src/data/cards/` | 3デッキ + テンプレート | starter / expansion / surprise の3カードプール |

すべてのJSONは `schemas/` 配下のスキーマで構造検証される（`npm run validate`）。

## 11. 既知の注意点・未決事項

- 初期説明書のテキストは左右移動が可能であるかのような案内を含む一方、実挙動は `auto_run` により自動走行＋ジャンプのみとなっている（詳細は [plan/current-game-spec-report.md](plan/current-game-spec-report.md) §3.3 参照）。案内と挙動のどちらに寄せるかは判断待ち。
- BGM/SE: `SoundManager` の仕組みは実装済みだが、実際の音声アセットは一部未配置。

---
---

# 第3部: 設計書

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

## 2. ディレクトリ構成

```
src/
  main.ts                     # Vue マウント
  App.vue                     # 画面ルート（Canvas + UIオーバーレイ + フェーズ切替）

  data/
    manualDeck.ts             # 説明書バージョン・2択・操作・危険色・派生パラメータ
    gameBalance.ts            # 距離/スコア比率/投擲重み/難易度カーブ（config から再エクスポート）
    tunables.ts               # VFX・カメラ・スコアの調整値（config から再エクスポート）
    config.ts                 # GAME_CONFIG エントリポイント
    config/                   # JSON設定ファイル群（22個）
      genres.json             # テーマカラー等。ジャンル定義本体は genres/*.json（22種、base 含む）
      game_balance.json       # スコア比率/投擲重み/基本速度
      difficulty.json         # 難易度カーブ/アップデート距離
      physics.json            # プレイヤー物理定数
      vfx.json                # パーティクル・エフェクト調整値
      spawn.json              # ハザードスポーン設定
      shoot.json              # 射撃設定
      rhythm_tuning.json      # リズム調整値
      stealth.json            # ステルス設定
      boss.json               # ボス設定
      camera.json             # カメラ設定
      throw.json              # 投擲設定
      ui.json                 # UI設定
      hazard_vfx.json         # ハザードエフェクト
      extra_movement.json     # 拡張移動設定
      genre_params.json       # ジャンルパラメータ
      background.json         # 背景設定
      bayes.json              # ベイズ学習設定
      + others

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
      MovementFeature.ts       # dash/wall_jump/vertical_scroll も統合（旧 ExtraMovementFeature）
      RpgFeature.ts
      PuzzleFeature.ts
      SpecialFeature.ts
      TetrisFeature.ts
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

  genres/                     # ジャンルプラグイン（15種 + JSONフォールバックプラグイン対応）
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

### 3.2 ジャンル一覧（22種 + base）

> 閾値は `src/data/genres/<id>.json`（1ジャンル1ファイル）に定義。変更時はこのファイルと同期すること。

| ID | ラベル | 閾値 |
|---|---|---|
| `runner` | エンドレスランナー | tempo:7 |
| `stg` | 横スクロールSTG | range:5 + enemy:5 |
| `rpg` | RPG | growth:6 |
| `puzzle` | パズル | combo:5 |
| `rhythm` | リズム | tempo:5 + rhythm:5 |
| `aerial_stg` | 縦スクロールSTG | vertical:4 + range:4 + enemy:4 |
| `bullet_hell` | 弾幕シューティング | vertical:4 + enemy:6 |
| `survival` | サバイバル | survive:5 + growth:4 |
| `stealth_action` | ステルスアクション | stealth:5 |
| `racing` | レーシング | speed:5 + tempo:4 |
| `platformer` | プラットフォーマー | aerial:4 + combo:4 |
| `dungeon` | ダンジョン探索 | growth:6 + craft:3 |
| `tower_def` | タワーディフェンス | craft:6 + enemy:4 |
| `sports` | スポーツ | speed:4 + rhythm:4 |
| `idle` | 放置ゲーム | craft:6 |
| `bullet_runner` | 弾幕ランナー | tempo:6 + enemy:5 |
| `arena` | アリーナバトル | enemy:6 + combo:5 |
| `aquatic` | 水中アドベンチャー | vertical:3 + aerial:3 + survive:4 |
| `horror` | サバイバルホラー | survive:6 + stealth:4 |
| `hack_slash` | ハックアンドスラッシュ | enemy:5 + combo:6 |
| `tetris` | テトリス | combo:4 + craft:4 |

### 3.3 主要型のリファレンス

```ts
// 成長パラメータ（12軸）
export type GenreParam = 'tempo' | 'range' | 'enemy' | 'combo' | 'growth' | 'rhythm'
  | 'stealth' | 'vertical' | 'aerial' | 'survive' | 'craft' | 'speed'

export type GenreId = string

export type Phase = 'title' | 'tutorialIntro' | 'tutorial' | 'updating' | 'playing' | 'genreLocked' | 'throwing' | 'ending';

// 機能フラグ（ジャンルが有効/無効化する挙動の単位）
// 実際は string 型（union 型ではない）。enableFeatures は src/data/genres/<id>.json に記載。
export type FeatureId = string
// 既知の FeatureId: shoot / three_way / charge_shot / spread_shot / bomb / enemy_hp / boss
//   auto_run / slow_precise / double_jump / long_air / dash / wall_jump / slide / gravity_flip / vertical_scroll
//   hp / exp / item_pickup / shield
//   grid_stop / puzzle_solve
//   beat_hazard / just_input / beat_dash
//   stealth_mode / time_bonus / tower / color_touch
//   tetris_mode

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

## 4. データ駆動の設計

### 4.1 説明書デッキ（`data/manualDeck.ts`）
- `ManualVersion` の配列（またはキー付きマップ）。
- ver1.0 をルート（チュートリアル）とし、`choices[].next` でツリー状に分岐。
- 各 `Choice.genreParams` が分岐の核。プレイヤーには方向性を見せない。
- 末端バージョン（`choices` が空）に到達 → 収束判定へ。

### 4.2 ジャンル定義（`data/genres/*.json`）
- 22ジャンル + base を定義。
- 15ジャンルが TSプラグイン実装、残り8ジャンルは JSONフォールバックで描画。

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

## 5. ゲーム進行フロー（状態機械）

```
[tutorialIntro] ← タイトル画面から遷移。チュートリアル説明書の表示
   │ 「スタート」で本編へ
   ▼
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
| ShootFeature | shoot, three_way, charge_shot, spread_shot, bomb, enemy_hp | 弾発射・敵HP・撃破コンボ |
| MovementFeature | auto_run, slow_precise, double_jump, long_air, dash, wall_jump, vertical_scroll | 移動全般・ダッシュ・壁ジャンプ・縦スクロール（旧 ExtraMovementFeature 統合） |
| RhythmFeature | beat_hazard, just_input, beat_dash | BPM同期の危険色反転・ジャスト入力加点 |
| RpgFeature | hp, exp, item_pickup | HP・経験値・アイテム収集 |
| PuzzleFeature | grid_stop, puzzle_solve | スクロール停止・配置パズル |
| SpecialFeature | color_touch, stealth_mode, time_bonus, tower, boss | 安全色接触・ステルス・時間ボーナス・タワー・ボス |
| TetrisFeature | tetris_mode | テトリス（グリッド・テトリミノ・ライン消去） |

### 6.5 `game/throwEngine.ts`
- 入力：ドラッグ方向（角度）+ パワーゲージ（リリース時の値）。
- 放物線シミュ：`v0`, `angle`, 重力。`airTime`/`arcHeight`/`speed` を計測。
- 投擲スコア = `airTime*0.5 + arcHeight*0.4 - speed*0.1`（重みは JSON）。

### 6.6 `domain/scoreCalc.ts`
- プレイスコア：ジャンルの `scoreFormula` を安全パーサで評価。
- 最終：`play*ratio.play + throw*ratio.throw`。

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

## 8. 実装フェーズ（マイルストーン）

| マイルストーン | 内容 | 状態 |
|---|---|---|
| **M0: 足場** | Vite+Vue+TS 雛形、Canvas マウント、空ループ描画 | ✅ 完了 |
| **M1: 横スクロール本体** | Player 移動+ジャンプ、自動スクロール、危険色 Hazard、衝突、距離スコア | ✅ 完了 |
| **M2: 説明書＋2択** | ManualPanel/ChoicePanel、3段階更新、controls/hazards 動的切替＋差分演出 | ✅ 完了 |
| **M3: ジャンル収束 + RUNNER/STG** | genreResolver、shoot/autorun フィーチャー、説明書テーマ切替、scoreFormula 評価 | ✅ 完了 (MVP) |
| **M4: 投擲＋エンディング** | throwEngine、ThrowOverlay、scoreCalc 合算、EndingPanel | ✅ 完了 |
| **M5: 残りジャンル** | 15 ジャンルプラグイン + JSON フォールバック対応、rhythm/rpg/puzzle/survival/tetris 等のフィーチャー | ✅ 完了 |
| **M6: 学習ルール + 仕上げ** | LearningSystem 統合（`evaluateLearningRules` を sideScroller に接続）、難易度調整、無限選択肢、offline ビルド検証 | ✅ 完了 |

## 9. テスト方針
- `domain/` は純粋関数中心 → Playwright で統合テスト。
- スコア式パーサは不正入力（関数呼び出し・記号）を弾くテストを必須化（セキュリティ）。
- ゲームループ/Canvas は手動プレイ確認（golden path + 各ジャンル収束 + 投擲）。

## 10. 未決事項・要確認

| 項目 | 状態 |
|---|---|
| 説明書の差分演出は CSS アニメで足りるか | ✅ 決定: ManualPanel.vue で差分強調・取り消し線・手書き風フェードインを実装済み |
| PUZZLE のスクロール停止時、横スクロールの「面影」をどう残すか | ✅ 実装済み: PuzzleFeature が move/solve フェーズを交互に切替（solve 中のみ停止） |
| 学習ルールと2択分岐が競合した時の優先順位 | ✅ 決定: 学習ルールが後勝ちで上書き |
| BGM/SE を入れるか | ⚠️ 部分実装: SoundManager.ts は実装済み、実際の音声ファイルは未配置 |

---

## 関連文書

- [CLAUDE.md](CLAUDE.md) — プロジェクト概要・コーディング規約
- [docs/README.md](docs/README.md) — 技術ドキュメント索引（コード詳細・API リファレンス・拡張ガイド）
- [docs/genre-system.md](docs/genre-system.md) — 全ジャンルの詳細な閾値・収束アルゴリズム
- [docs/manual-json.md](docs/manual-json.md) — 説明書JSONのスキーマ
- [plan/current-game-spec-report.md](plan/current-game-spec-report.md) — コードからの現状棚卸しレポート（より詳細な参照箇所付き）
- [docs/TASKS.md](docs/TASKS.md) — 未実装タスク・改善予定
