# 現行ゲーム仕様レポート

作成日: 2026-07-06 / 対象ブランチ: `chore/remove-nested-duplicate-tests`

「取扱説明書を読むゲーム」の**現時点で実装されている仕様**をコードから読み取ってまとめたもの。
今後「壊れたゲーム（＝素朴な最小の横スクロール）から始める」方向に手を入れる前提の現状把握資料。

---

## 1. 全体コンセプト

横スクロールアクションを起点に、プレイヤーが説明書の2択を選び続けることでゲームジャンル自体が変容していく。横スクロール（`base`）は「0番目のジャンル」で、選択の蓄積により RPG / STG / パズル等 **22ジャンル**へ分岐・収束する。最後は説明書UIを投げて完成。

---

## 2. フェーズ遷移フロー

状態は `useGameState.ts` の `phase` で管理。遷移は以下の通り。

```
title
  │ startGame()
  ▼
tutorialIntro      … TutorialScreen.vue（遊び方・操作説明のカード）
  │ startTutorial()
  ▼
tutorial           … 最初の横スクロールを実プレイ（ver.1.0）
  │ 一定距離ごとに shouldUpdate 発火 & firstJumpDone 済み
  ▼
updating           … カード2択を提示（scroller は一時停止）
  │ choose(cardId)
  ▼
playing  ←──────┐  … 選択反映後、続きをプレイ。再び距離で updating へ
  │             │      （updating ⇄ playing を繰り返す）
  │ 収束 or MAX_ROUNDS(=5) 到達
  ▼             │
genreLocked ─────┘  … ジャンル確定。説明書が確定文で書き換わり演出
  │ ギブアップ or 死亡
  ▼
throwing           … 説明書UIをドラッグして投擲（パワーゲージ）
  │ onThrown()
  ▼
ending             … ジャンル別エンディング + 最終スコア
```

補足:
- 説明書更新のトリガーは**距離ベース**（`UPDATE_DISTANCES`）。初期3回は `[1100, 2400, 3900]`、以降は `1100 + 1500*i` 間隔で最大100回分生成。
- `genreLocked` 以降は説明書の自動更新を停止（`App.vue:139-149`）。
- 死亡すると `playing`/`genreLocked` から自動で `throwing` へ移行（`App.vue:151-155`）。
- チュートリアルは `TUTORIAL_ENABLED`（`src/tutorial/const.ts`）で ON/OFF 切替可能。現在 `true`。

---

## 3. 初期ゲーム（ver.1.0 / `base` ジャンル）の実際の挙動

### 3.1 ルールの決まり方
- ランタイムが参照する初期説明書は `MANUAL_DECK['1.0']`（`src/data/manuals/base.json`）のみ。
- 選択履歴が空のあいだ、`resolveGenre({})` はどのジャンルにも収束しないため **`base`** を返す（`genreResolver.ts:148-155`）。
- `base` ジャンルの有効フィーチャーは `enableFeatures: ["auto_run"]`（`src/data/genres/base.json`）。
- `buildRuntimeRules` は常に `movement` を追加する（`ruleEngine.ts:35`）。
  → **初期状態で `auto_run` と `movement` が同時に有効**。

### 3.2 実際の操作挙動（MovementFeature）
`MovementFeature.preUpdate`（`src/game/systems/MovementFeature.ts:67-73`）:
```ts
const isAutoRun = r.features.has('auto_run')
p.vx = (isAutoRun || moveRight) ? runSpeed
     : moveLeft ? -runSpeed
     : 0
```
- `auto_run` が有効なので `vx = runSpeed` に固定 → **常に右へ自動スクロール**。
- **左右キー（← →）は実質無効**（`auto_run` が上書きするため左に戻れない）。
- 操作として意味を持つのは実質 **Space ジャンプのみ** → 挙動は Chrome 恐竜ゲームに近い。

### 3.3 【重要】案内と挙動の食い違い ← 要判断ポイント
挙動は「自動スクロール＋ジャンプのみ」なのに、案内テキストは左右移動できると書いている:

| 箇所 | 内容 |
|---|---|
| 説明書 ver.1.0 本文 | 「← → キーで左右に移動できます。」（`src/data/manuals/base.json:9`） |
| チュートリアル画面 | `←` `→` 「移動」/ `SPACE`「ジャンプ」（`TutorialScreen.vue:64-73`） |
| 実挙動 | 左右キーは効かず、自動で右に走る |

→ **「ジャンプのみ（自動スクロール）に統一」するか「左右移動を実際に効かせる」かは保留中**（本レポート作成のきっかけとなった論点）。恐竜ゲーム路線なら前者、案内どおりに直すなら後者。

### 3.4 障害物・色ルール
- ハザード色: `red`（触れると失敗）/ セーフ色: `blue`（`base.json` hazards）。
- スポーン間隔は距離で短くなる: `baseInterval 2400ms → minInterval 800ms`、減衰率 `0.00015`。
- 距離ベース難易度加速: 最大 `+50%`（`distanceAccelMaxBonus 0.5`）を距離 `20000` で到達。

---

## 4. 操作・物理パラメータ（初期値）

| 項目 | 値 | 出典 |
|---|---|---|
| 基本スクロール速度 | 300 px/s | `game_balance.json baseScrollSpeed` |
| 走り速度 runSpeed | 240 px/s | `physics.json runSpeed` |
| 重力 | 1600 | `physics.json defaultGravity`（base も同値） |
| ジャンプ初速 | -720 | `physics.json jumpVelocity` |
| 2段ジャンプ初速 | -610 | `doubleJumpVelocity`（`double_jump` 有効時のみ） |
| プレイヤーサイズ | 36 × 52 px | `physics.json` |
| 開始X座標 | 140 px | `playerStartX` |
| 最大HP | 3 | `defaultPlayerMaxHp`（初期は当たり=即ミス相当の扱い） |
| コヨーテ時間 | 9 フレーム | `coyoteFrames`（着地猶予） |
| ジャンプ先行入力 | 10 フレーム | `jumpBufferFrames` |

- デフォルト操作: `jump=Space` / `moveLeft=ArrowLeft` / `moveRight=ArrowRight` / `moveUp,moveDown=Arrow`（`base.json controls`）。
- 移動系フィーチャーは `MovementFeature` が一括処理: `movement / auto_run / slow_precise / double_jump / long_air / dash / wall_jump / vertical_scroll`。

---

## 5. ジャンル収束システム（3方式併用）

`useGameState.choose()` で選択のたびに更新。

1. **genreParams 軸方式**（後方互換）: `tempo / range / enemy / combo / growth / rhythm` 等の累積値。
2. **genrePoints 直接方式**（後方互換）: カードが特定ジャンルへ直接加点。
3. **ベイズ収束方式（主方式）**: 各ジャンルの閾値との乖離から尤度 `L = exp(-decayRate × Σmax(0, threshold - have))` を計算し、事後確率で収束判定（`genreResolver.ts`）。
   - 収束条件: 最尤ジャンルが `minProb` 以上、かつ2位を `dominanceRatio` 倍以上引き離す。
   - `base` は尤度計算には残すが収束候補ランキングからは除外（`isConvergenceCandidate`）。
   - `resolvable:false`（glitch 等）は矛盾トリガーでのみ強制発動。

確定タイミング: **収束成立** または **`MAX_ROUNDS(=5)` 到達**。未収束で上限到達時は最尤ジャンル、`base` 収束時は `defaultFallbackGenre = runner` に振替（`useGameState.ts:189-196`）。

初期説明書の最初の2択（`base.json`）:
- 「ステージに登場するものに個性を加える」→ `{ enemy:1, range:1 }`（戦闘・探索方向）
- 「キャラクターの動きをなめらかにする」→ `{ tempo:2, aerial:1 }`（速度・空中・音楽方向）

以降の選択肢はツリーではなく**カードプール方式**（`src/data/cards/*.json`）から `sampleCards(2, ...)` で抽選。

---

## 6. スコア計算

```
最終スコア = プレイスコア(70%) + 投擲スコア(30%)      ← score.json scoreRatio
```

- **プレイスコア**: ジャンルごとの `scoreFormula`（JSON）を `evalScoreFormula` で評価。`base` は `distance * 0.8`。
- **投擲スコア**: `滞空時間×0.5 + 弧の高さ×0.4 − 速度ペナルティ×0.1`（`throwScoreWeights`）。
- 距離スコアレート `0.28`、長時間滞空ボーナス `1.6/s`（`long_air` 有効時）。
- グレード閾値: S=8000 / A=5000 / B=2500 / C=1000（`score.json`）。

---

## 7. 投擲フェーズ

- `genreLocked` でギブアップ、または死亡で `throwing` へ。
- 説明書UIをドラッグ → パワーゲージ → 投擲。物理は `throw.json`（重力・最大パワー・空気抵抗）。
- 着地で `finalizeThrowing()` → 矛盾スコア計算・プレイスタイル検出・サプライズエンド判定（`glitch` 等）→ `ending`。

---

## 8. アーキテクチャ要点（変更時の触り所）

| 関心事 | ファイル |
|---|---|
| フェーズ・状態管理（ViewModel） | `src/composables/useGameState.ts` |
| 画面遷移・スナップショット監視 | `src/App.vue` |
| Canvas エンジン本体 | `src/game/sideScroller.ts` |
| 移動・自動走行ロジック | `src/game/systems/MovementFeature.ts` |
| 初期説明書テキスト・ハザード | `src/data/manuals/base.json` |
| 初期ジャンル定義（auto_run 等） | `src/data/genres/base.json` |
| チュートリアル画面 | `src/tutorial/TutorialScreen.vue` |
| ルール合成（純粋関数） | `src/domain/ruleEngine.ts` |
| ジャンル収束（ベイズ） | `src/domain/genreResolver.ts` |
| バランス値 | `src/data/config/*.json` |

---

## 9. 「壊れたゲームから始める」向けの現状まとめ

- 挙動レベルでは**すでに「自動スクロール＋ジャンプのみ」の恐竜ゲーム風**が土台として存在する（`base` + `auto_run`）。
- ただし**案内（説明書テキスト・チュートリアル）が左右移動を謳っており挙動と不整合**。ここが「中途半端に壊れて見える」主因。
- 方向性の判断（保留中）:
  - (A) 恐竜ゲームに寄せる → 左右移動の案内を削除し「ジャンプで避ける」に統一。挙動は現状のままでほぼ成立。
  - (B) 案内どおりに直す → `base` から `auto_run` を外し `movement` で左右移動を実際に効かせる。
- 「見た目として壊れている（ノイズ/バグっぽい演出）」路線にするなら、上記いずれかに加えて**新規の演出実装**が別途必要。
```
