# ジャンル別ゲームプレイ設計（GameMode 抽象化）

## 0. 問題点

現状、全ジャンルが**同一のコアループ**（自動スクロール → 障害物生成 → 接触で死亡）を
踏襲しており、ジャンル差は「ビジュアル（色・背景・HUD）+ Feature の足し算」に留まっている。
ユーザー指摘:

- 「全体的にビジュアルを変えただけでジャンル自体はほぼ全部同一に見える」
- 「説明書を作るゲームなので、左右移動・障害物回避の主目的からかけ離れたものでも問題ない」
- 「テトリスくらい変えちゃっていい」（＝コアループの完全置換を許可）

テトリス／パズルだけが `scrollSpeed=0` + フルスクリーンオーバーレイでループを置換している
（brute force）。これを**宣言可能な GameMode 抽象化**に昇格し、ジャンルごとに
根本的に異なるゲームプレイを持たせる。

---

## 1. アーキテクチャ: GameMode 抽象化

### 1.1 新インターフェース `src/engine/GameMode.ts`

```ts
import type { MutableWorld } from './types'

/**
 * ジャンルが「コアループの完全置換」を宣言するためのインターフェース。
 * 提供された場合、エンジン側はデフォルトの「スクロール+障害物+衝突」パイプラインの代わりに
 * この Mode の update / render を呼ぶ。Mode は自前のエンティティ（ノーツ・競争相手・タワー等）を
 * 内部状態として持ち、world はスコア/生存/入力の共有バスとして使う。
 */
export interface GameMode {
  readonly id: string
  /** Mode 開始時（ジャンル確定時）に一度だけ呼ばれる。 */
  setup?(world: MutableWorld): void
  /** 毎フレーム。Mode がゲーム進行を完全に制御する。 */
  update(world: MutableWorld, dt: number): void
  /** 毎フレーム。Mode 固有の描画（自前エンティティ等）。 */
  render(ctx: CanvasRenderingContext2D, world: MutableWorld): void
  /** 勝利条件（true でランを「成功終了」させる。既存の死亡→投擲ではなく別ルート）。 */
  isWon?(world: MutableWorld): boolean
  /** 敗北条件（true で死亡扱い。衝突死亡の代わりに Mode が失敗を定義）。 */
  isLost?(world: MutableWorld): boolean
}
```

### 1.2 GenrePlugin への接続

`GenrePlugin` に任意の `gameMode?: GameMode` フィールドを追加。
`src/genres/index.ts` の登録処理で、`plugin.gameMode` があれば `GameRegistry.registerMode(genreId, mode)` に登録。

### 1.3 エンジン側の分岐（`sideScroller.ts`）

`_update`（:433）と `_render`（:947）の先頭に Mode 分岐を挿入:

```ts
// _update 冒頭
const mode = this.activeMode   // GameRegistry.getMode(currentGenreId)
if (mode) {
  mode.update(this._buildWorld(), dt)
  if (mode.isWon?.(world)) { this._onWin() }        // 新: 成功終了
  else if (mode.isLost?.(world)) { this._die() }     // 既存: 死亡
  return                                             // デフォルトパイプラインをスキップ
}
// ... 以下デフォルト（スクロール+障害物+衝突）
```

- `_onWin()`: 新メソッド。`Phase` に `'won'` を追加し、投擲フェーズへ（死亡とは別の演出: 「クリア」）。
- Mode がある間はデフォルトの `_spawnHazard` / 衝突判定を**完全にスキップ**する（テトリスの brute force を正規化）。

### 1.4 勝利状態の追加

`src/domain/types.ts:35` の `Phase` に `'won'` を追加。
`App.vue` の dead→throwing 分岐（:177-185）に won→throwing を並列追加。
投擲スコアはそのまま利用（「作り終えた」宣言に整合）。

### 1.5 既存 Feature との共存

- **完全置換型**（rhythm / idle / sports / racing / tower_def 等）: GameMode を提供する。Feature は不要（Mode が全てを制御）。
- **強化型**（glitch / runner / horror 等）: GameMode を**提供せず**、既存ループ + Feature で実現。
  - glitch: 新 Feature `glitch_corrupt`（入力反転・ハザード挙動ランダム化・スコアちらつき）
  - runner: 新 Feature `lane_dodge`（3レーン切替）+ 高速化
  - horror: 既存 `hp`+`stealth_mode` + 新 `sanity`（正気ゲージ、時間経過で減少、アイテムで回復）

---

## 2. ジャンル別ゲームプレイ設計（優先度順）

### 完全置換型（GameMode 提供）

#### ① rhythm — 「ノーツをたたく」リズムゲーム（プロセカ風）
- 4レーン（←↓↑→）にノーツが上から降下。
- ノーツが画面下部の判定ラインに重なる瞬間に該当キーを押す。
- タイミングで Perfect / Great / Good / Miss を判定。Miss で HP−1、HP0 で敗北。
- ヒットでコンボ増、スコアは `beatHits * 150 + maxCombo * 100`（既存 scoreFormula 維持）。
- **勝利**: 曲の長さ（例: 60秒）を耐え切ったら「クリア」。
- 障害物・スクロールは一切なし（`scrollSpeed=0`）。ノーツは Mode 自前の配列。
- 視覚: 判定ラインの発光、ノーツヒット時のパーティクル、コンボによる画面彩度上昇。

#### ② idle — 「放置で資源が積む」放置ゲーム
- 死亡・障害物なし。資源が時間経過で自動増加（パッシブインカム）。
- クリック/タップで資源を追加生成（アクティブインカム）。
- 一定資源でアップグレード購入（増加率UP・自動クリックャー）。
- **目標**: 資源の最大化（勝利/敗北なし、スコア＝累積資源）。
- 障害物・スクロールなし。Mode 自前で「資源の山」を描画。
- 視覚: 明るいクリーム色、資源の山が積み上がる、アップグレード購入時の演出。

#### ③ sports — 「ゴールに到達する」レース
- **目標**: 一定距離（ゴールライン）に到達する。
- タイマーあり。時間切れで敗北。
- 障害物は「減速」（死亡しない）。ダッシュで加速。
- 到達すると「記録更新」演出（既存 BEST 記録と競う）。
- 視覚: スタジアム、ゴールライン、スコアボード（TIME/BEST）。

#### ④ racing — 「競争相手と競う」レース
- 他プレイヤー（競争相手）が同じトラックを走行。
- 速度で順位が決まる。ダッシュで加速。
- 障害物は減速（死亡しない）。
- **勝利**: 1位でゴール。敗北: 最下位 or 時間切れ。
- Mode 自前で競争相手エンティティ（2〜3体）を描画・更新。
- 視覚: トラック、順位HUD（1st/2nd/3rd）、競争相手のスプライト。

#### ⑤ tower_def — 「タワーを置いて守る」タワーディフェンス
- 画面左に拠点（城門）。右から敵が波状に接近。
- プレイヤーは**タワーを配置**（クリック/キーで、一定コスト）。
- タワーは自動で最寄りの敵を撃破。
- **勝利**: 全ウェーブを耐え切ったら「クリア」。敗北: 敵が拠点に到達。
- Mode 自前でタワー・敵エンティティを描画・更新。
- 視覚: 城門、タワー、敵波、ウェーブHUD。

### 強化型（既存ループ + Feature）

#### ⑥ glitch — 「壊れたゲーム」
- 新 Feature `glitch_corrupt`:
  - 入力反転（左右がランダムに逆転、数秒ごとに切替）
  - ハザード挙動のランダム化（速度・出現位置が不規則）
  - スコア/HUD のちらつき（数値がランダムに変わる）
  - 画面ディストーション（既存ビジュアル + 入力・数値の破損）
- 「壊れた感」を**ゲームプレイ**に反映（操作が効かなくなる恐怖）。

#### ⑦ runner — 「疾走感」ランナー
- 新 Feature `lane_dodge`: 3レーン制。上下キーでレーン切替、障害物を回避。
- 高速スクロール（scrollSpeedBonus 大）+ 速度ライン（既存ビジュアル）。
- 障害物が「速く・密集」して疾走感を出す。
- 視覚: 夜の街、レーンライン、速度ライン。

#### ⑧ horror — 「正気を保つ」サバイバル（RPG寄り）
- 新 Feature `sanity`: 正気ゲージ（時間経過で減少、敵接近で急減、アイテムで回復）。
- 既存 `hp` + `stealth_mode` + `item_pickup`（正気回復アイテム）。
- 正気0 or HP0 で敗北。一定時間生存で「脱出」（勝利）。
- 視覚: 漆黒、明かり点滅、SANITY ゲージ（既存）+ 正気低下時の画面歪み。

### 既存で十分個別（Phase 2、軽微調整のみ）

| ジャンル | 現状 | 調整 |
|---|---|---|
| dungeon | melee_kill + hp + exp（個別） | ほぼそのまま |
| arena | shoot + enemy_hp + boss（個別） | ほぼそのまま |
| hack_slash | shoot + enemy_hp + boss（個別） | ほぼそのまま |
| bullet_runner | auto_run + shoot + enemy_hp（個別） | ほぼそのまま |
| platformer | wall_jump + double_jump（個別） | ゴール追加（Phase 2） |
| aquatic | vertical + hp（個別） | ほぼそのまま |
| stealth_action | stealth_mode（個別） | ほぼそのまま |

---

## 3. 実装フェーズ

### Phase 1（アーキテクチャ + 完全置換型 5ジャンル）
1. `GameMode` インターフェース + `GameRegistry.registerMode` + エンジン分岐 + `Phase 'won'`
2. `RhythmMode`（プロセカ風ノーツ）
3. `IdleMode`（放置・資源累積）
4. `SportsMode`（ゴール到達レース）
5. `RacingMode`（競争相手レース）
6. `TowerDefMode`（タワー配置）

### Phase 2（強化型 3ジャンル）
7. `GlitchCorruptFeature`（入力反転・破損）
8. `LaneDodgeFeature`（3レーン）
9. `SanityFeature`（正気ゲージ）

### Phase 3（既存ジャンルの軽微調整 + 全ジャンル検証）
10. platformer のゴール追加等
11. 全15ジャンルのスクリーンショット + 動画検証
12. レビュー + バグ修正（別途PR）

---

## 4. 制約・注意

- **既存テストの壊し**: `thresholdReachability.test.ts`（到達率ガード）は維持。GameMode 追加は到達率に影響しない（threshold 不変）。
- **スコア**: 各 Mode は既存 `ScoreVars` の範囲でスコアを計算。新規メトリクス（レース順位等）が必要な場合は `ScoreVars` に追加。
- **入力**: Mode は `InputManager` 経由でキーを読む（既存の justPressed 等）。
- **オフライン**: 新規アセットなし（既存スプライト・JSON のみ）。
- **バグ**: コーディング中に発見した既存バグは本タスクと分離し、最後に別途 PR。
