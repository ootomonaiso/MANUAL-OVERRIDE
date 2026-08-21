# P0 ドーパミン改善 設計書

- 作成日: 2026-08-17
- 対象: MANUAL-OVERRIDE（横スクロール × 説明書編集ゲーム）
- ブランチ: `main`（P1 は別途ブランチ）
- 前提コミット: `59ed274`

## 1. 背景・課題

Discord のフィードバックから「ドーパミン不足」の根本原因を特定した。

| # | 症状 | 根本原因（コード調査済み） |
|---|------|---------------------------|
| 1 | 音が一切しない | `soundManager.register()` がどこからも呼ばれておらず `_impl` が永久的に `null`。全 SFX・BGM が no-op。`public/` は空（tetris BGM の `bgm/tetris.ogg` も欠落） |
| 2 | 撃破に実感がない | 撃破時の演出は既存の粒子のみ。ヒットストップ・フラッシュ・シェイクが弱い/なし |
| 3 | コンボの壁が低い | コンボ増加に何のフィードバックもない（音・ポップアップ・色変化なし） |
| 4 | 回避の緊張感がない | 障害物をギリギリで避えても何も起きない（ニアミスボーナスなし） |
| 5 | 速さが伝わらない | スピード表示なし、速度感演出（スピードライン）なし |
| 6 | 何が起きているか分からない | 次回説明書更新までの進捗表示なし。ジャンル収束の兆しが HUD に見えない。距離マイルストーンもなし |

## 2. 要件定義（P0）

### R1: サウンド（最重要）
- **R1.1** WebAudio で全 SFX を手続き生成（手続き生成 = オシレーター/ノイズで合成。音声ファイル不使用 → オフライン完結・バンドル増なし）
- **R1.2** BGM も手続き生成（16ステップシーケンサ、メジャー/マイナーのループ）。ゲーム開始時（ユーザー操作後）に開始、リスタート時に停止
- **R1.3** `M` キーでミュート切替。状態は localStorage（`mo_muted`）に永続化。HUD にミュート表示
- **R1.4** AudioContext が利用できない環境（jsdom・古いブラウザ）では**絶対に例外を投げない**（全フック安全に no-op）
- **R1.5** 未呼び出しだったフック `onBeat`（リズムゲームのビート）と `onChoiceReveal`（2択提示）を呼び出し側から接続
- **R1.6** 既存のファイルベース BGM（`playBgm`）は互換維持（tetris の `bgm` フィールドは残す。ファイル欠落時は従来どおり無音で失敗しない）

### R2: 撃破の快感（Juice）
- **R2.1** 撃破時にヒットストップ（timescale 0.2 / 40ms）
- **R2.2** 撃破位置に白フラッシュ粒子バースト
- **R2.3** 撃破時にシェイク（強度は config）

### R3: コンボの昇華
- **R3.1** コンボ増加のたびに `onCombo` を発火（音はピッチ上昇）
- **R3.2** マイルストーン（5/10/20/30/50/100）到達時にラベル付き大ポップアップ（GOOD / GREAT / EXCELLENT / UNSTOPPABLE / LEGENDARY / GODLIKE）+ 画面フラッシュ + シェイク
- **R3.3** 検出は SideScroller 一箇所（`_gameStats.combo` の前値比較）で全ジャンル共通。PuzzleFeature の直接 `onCombo` 呼び出しを削除（二重発火防止）

### R4: ニアミスボーナス
- **R4.1** 障害物を**衝突せず**通過し、垂直方向の隙間が閾値（42px）未満なら「CLOSE!」ポップアップ + 風切り音 + 小スコア（+15）
- **R4.2** 無敵時間中は無効。1障害物につき1回のみ（`Set<Hazard>` で管理、cull 後に prune してリーク防止）。連続発火は 0.35 秒間隔
- **R4.3** 横スクロール / 縦スクロール（aerial_stg 等）両モード対応

### R5: 速度感
- **R5.1** スピードライン（画面端から流れる細線）。速度に応じた透明度、方向はスクロール軸に従う
- **R5.2** HUD に現在速度表示（px/s）

### R6: 何が起きているか（明瞭さ）
- **R6.1** HUD に「次回説明書更新」までの進捗バー（scroller 内部の `updateProgress` をスナップショットに公開）
- **R6.2** HUD にジャンル収束メーター（ベイズ事後確率のトップジャンル + 確率%。ロック済み or 確率 < 12% or `resolvable: false` のジャンルは非表示）
- **R6.3** 距離マイルストーン（500m ごと）に画面中央の大きな表示 + 音

## 3. 設計

### 3.1 変更ファイル一覧

| ファイル | 種別 | 内容 |
|---|---|---|
| `src/data/config/sound.json` | 新規 | 音量・BGM BPM・ミュートキー設定 |
| `src/data/config/juice.json` | 新規 | ヒットストップ・シェイク・ニアミス・マイルストーン・スピードライン設定 |
| `src/framework/config-types.ts` | 修正 | `SoundConfig` / `JuiceConfig` 型追加 + `GameConfigMap` 登録 |
| `src/data/tunables.ts` | 修正 | `SOUND` / `JUICE` エクスポート追加 |
| `src/domain/comboMilestones.ts` | 新規 | 純粋関数（単体テスト対象） |
| `src/domain/updateWindow.ts` | 新規 | 純粋関数（単体テスト対象） |
| `src/domain/nearMiss.ts` | 新規 | 純粋関数（単体テスト対象） |
| `src/plugins/SoundManager.ts` | 修正 | フック拡張（任意メソッド）+ 委譲 |
| `src/plugins/WebAudioSound.ts` | 新規 | 手続き生成 SFX + BGM シーケンサ |
| `src/game/entities.ts` | 修正 | `ScorePopup.size?: number` 追加 |
| `src/game/sideScroller.ts` | 修正 | コンボ検出・ニアミス・スピードライン・マイルストーン・スナップショット拡張 |
| `src/game/systems/ShootFeature.ts` | 修正 | 撃破時のヒットストップ + フラッシュ + シェイク |
| `src/game/systems/PuzzleFeature.ts` | 修正 | 直接 `onCombo` 削除（710行付近） |
| `src/game/systems/RhythmFeature.ts` | 修正 | ビート刻みで `onBeat(bpm)` 呼び出し |
| `src/composables/useGameState.ts` | 修正 | `triggerUpdate()` で `onChoiceReveal()` 呼び出し |
| `src/components/Hud.vue` | 修正 | 速度表示・更新進捗バー・収束メーター・ミュート表示 |
| `src/App.vue` | 修正 | `WebAudioSound` 登録・ミュートキー・BGM 開始/停止・`topGenre` computed |
| `tests/unit/comboMilestones.test.ts` | 新規 | |
| `tests/unit/updateWindow.test.ts` | 新規 | |
| `tests/unit/nearMiss.test.ts` | 新規 | |
| `tests/unit/soundConfig.test.ts` | 新規 | |
| `tests/unit/WebAudioSound.test.ts` | 新規 | |
| `tests/p0_dopamine.spec.ts` | 新規 | Playwright 統合 |

### 3.2 サウンドアーキテクチャ

#### SoundHooks 拡張（`src/plugins/SoundManager.ts`）

既存12メソッドは変更しない。以下を**すべて任意（`?`）**で追加 → 既存実装/モックの破壊なし。

```ts
export interface SoundHooks {
  // …既存12メソッド（onJump〜onCombo）はそのまま…

  onMilestone?(distance: number): void
  onNearMiss?(): void
  startBgm?(bpm: number): void
  stopBgm?(): void
  setMuted?(muted: boolean): void
  readonly muted?: boolean
}
```

`SoundManager` に委譲メソッド追加:

```ts
onMilestone(distance: number) { this._impl.onMilestone?.(distance) }
onNearMiss() { this._impl.onNearMiss?.() }
startBgm(bpm: number) { this._impl.startBgm?.(bpm) }
setMuted(muted: boolean) { this._impl.setMuted?.(muted) }
get muted(): boolean { return this._impl.muted ?? false }
```

`stopBgm()`（既存）の末尾に `this._impl.stopBgm?.()` を追加（ファイルBGM停止と手続きBGM停止を同時に行う）。

#### WebAudioSound（`src/plugins/WebAudioSound.ts` 新規）

```ts
export class WebAudioSound implements SoundHooks {
  // 全メソッドは try/catch で包み、例外は絶対に外に出さない
  // AudioContext は初回フック時に遅延生成（_ensureCtx()）
  //   - new AudioContext() が失敗したら (window as any).webkitAudioContext を試す
  //   - 両方失敗したら _ctx = null に固定し以降 no-op（jsdom 対策）
  //   - 生成直後は suspended の場合 resume() を呼ぶ（ユーザー操作内なので成功する）
}
```

内部構造:

- **ゲインチェーン**: `masterGain → destination`。`sfxGain → masterGain`、`bgmGain → masterGain`
- **SFX レシピ**（すべて `_blip` / `_noise` ヘルパーで合成。発音は 10〜300ms の短音）:

| フック | 音設計 |
|---|---|
| `onJump` | 三角波 300→500Hz、80ms、音量 0.5 |
| `onLand` | 低域ノイズ 60ms + 150Hz サイン 50ms |
| `onShoot` | 矩形波 900→300Hz、60ms、音量 0.35（連射でもうるさくならないよう小さめ） |
| `onHit` | ノイズ 150ms + 100Hz サイン 120ms（被弾の重さ） |
| `onDeath` | 下り滑音 400→60Hz、500ms + ノイズ |
| `onGenreLock` | 3音のファンファーレ（440/554/659Hz、各 120ms 順次） |
| `onChoiceReveal` | 2音の「ページめくり」（ノイズ 80ms ×2、間 90ms） |
| `onChoiceSelect` | 660Hz 短音 60ms |
| `onThrowStart` | 上り滑音 200→800Hz、300ms |
| `onThrowLand` | 低域ノイズ 200ms + 80Hz 150ms |
| `onBeat(bpm)` | ハイハット風ノイズ 40ms（bpm は音設計に使用しない。呼び出し頻度で刻む） |
| `onCombo(count)` | 矩形波、基本 440Hz + `count × 12Hz`（上限 1500Hz）、50ms |
| `onMilestone(d)` | 2音（523→784Hz、各 100ms） |
| `onNearMiss` | 帯域フィルタ付きノイズの「フー」（200ms、周波数スウェプト） |

- **BGM シーケンサ**（`startBgm(bpm)` / `stopBgm()`）:
  - 16ステップ、Aマイナー。ループ構成:
    - キック: ステップ 0/4/8/12（サイン波 120→40Hz、150ms）
    - ハイハット: ステップ 2/6/10/14（ノイズ 30ms、音量 0.15）
    - ベース: ステップ 0=A2、3=C3、6=E3、10=G2（サイン波、1ステップ分）
    - リード: 2小節目ごとに数音（A4/C5/E5 の_sparse_ 配置。音量 0.12）
  - スケジューラ: `setInterval(25ms)` で 120ms 先行予約（`ctx.currentTime` ベース）。`stopBgm()` でタイマー破棄 + `bgmGain` を 150ms で 0 にランプ
  - `bgmGain` 初期値は `sound.json` の `bgmVolume`
- **ミュート**: `setMuted(m)` → `masterGain` を 50ms で 0 / 元値へランプ。`muted` getter。初回生成時に localStorage（`sound.json` の `muteStorageKey`）から復元

#### 接続箇所

| 箇所 | 変更 |
|---|---|
| `App.vue` `onMounted` | `soundManager.register(new WebAudioSound())`（1回のみ） |
| `App.vue` `startGame()` | `scroller.start()` 後に `soundManager.startBgm(SOUND.bgmBpm)` |
| `App.vue` `restart()` | 既存 `stopBgm(600)` のまま（内部で手続きBGMも停止） |
| `App.vue` `onKeyDown` | `m` / `M` → ミュート切替（全フェーズ有効） |
| `useGameState.ts` `triggerUpdate()` | `soundManager.onChoiceReveal()` をフェーズ切替前に追加 |
| `RhythmFeature.ts` ビート刻み（54〜67行の `s.nextBeat -= dtMs` ブロック） | ビート発生時に `soundManager.onBeat(60000 / s.beatInterval)`（beatInterval の単位は ms 前提。実装時に確認） |
| `PuzzleFeature.ts` 710行付近 | `soundManager.onCombo(newCombo)` の直接呼び出しを**削除**（`world.setCombo` は残す） |

**注意**: `sideScroller.ts:1481` の `onGenreLock('rhythm')` はリズム学習効果（難易度調整）のトリガーとして機能している。BGM 開始を `onGenreLock` 側に行わない（開始は `startGame` のみ）。

### 3.3 Juice 設計

#### コンボ検出（`sideScroller.ts`、全ジャンル共通）

`_update()` 内で Feature 更新の後に:

```ts
const combo = this._gameStats.combo
if (combo > this._prevCombo) {
  soundManager.onCombo(combo)
  const m = comboMilestone(combo, JUICE.comboMilestones)  // 純粋関数
  if (m) this._fireComboMilestone(combo, m)
}
this._prevCombo = combo
```

- `_fireComboMilestone`: プレイヤー位置に大ポップアップ（`ScorePopup.size = 22`、ラベル付き `×10 GREAT`）+ `triggerShake(JUICE.comboMilestoneShake)` + 白フラッシュ（`_milestoneFlash = 0.5`、毎フレーム 0.05 減衰、`_render` 末尾で白い矩形を `alpha = _milestoneFlash` で描画）
- `ScorePopup` に `size?: number` を追加。`_render` のポップアップ描画で `sp.size ?? 15` を使用

#### 撃破時の演出（`ShootFeature.ts` `_applyScoreAndEvents`）

`destroyedHazards.length > 0` のとき:

```ts
world.setTimescale(JUICE.hitStopScale, JUICE.hitStopDurationSec)
world.triggerShake(JUICE.killShakeIntensity)
for (const h of destroyedHazards) {
  // 白フラッシュ粒子を撃破位置に（画面座標。world.getHazardScreenX がモード非依存で変換してくれる）
  const sx = world.getHazardScreenX(h)
  for (let i = 0; i < JUICE.killFlashParticles; i++) {
    world.addParticle(sx + h.w/2, h.y + h.h/2, 乱数vx, 乱数vy, 0.3, '#ffffff', 3)
  }
}
```

- `addParticle` のシグネチャ: `addParticle(x, y, vx, vy, life, color, size?)`（`engine/types.ts` 46行）
- `setTimescale(scale, durationSec?)`（75行）
- 座標注意: 粒子・ポップアップは**画面座標**で描画される。横モードでは `h.x` が世界座標なので `world.getHazardScreenX(h)`（82行、モード非依存ヘルパー）で変換する。

#### ニアミス（`sideScroller.ts`）

純粋関数（`src/domain/nearMiss.ts`）:

```ts
export interface Rect { x: number; y: number; w: number; h: number }
export function isNearMiss(player: Rect, hazardScreen: Rect, mode: 'x' | 'y', gapPx: number): boolean
// 条件: 重複しない（重複は被弾なのでニアミスではない）
//      mode 'x': 障害物がプレイヤーの左に完全に通過済み (h.x + h.w < p.x) かつ垂直ギャップ < gapPx
//      mode 'y': 障害物がプレイヤーの下に完全に通過済み (h.y > p.y + p.h) かつ水平ギャップ < gapPx
```

`sideScroller.ts` 側:

- `_nearMissDone = new Set<Hazard>()`、`_lastNearMissTime = 0`
- `_updateHorizontal` の衝突ループ後:
  - `p.invincible > 0` ならスキップ
  - 各 `h`（`h.isSafe` はスキップ、`_nearMissDone` 済みはスキップ）: 画面 x = `h.x - cameraX`。通過済みなら `isNearMiss` を判定
  - 判定成立: `_nearMissDone.add(h)`、`survivedSec - _lastNearMissTime > JUICE.nearMissMinIntervalSec` なら発火（`_lastNearMissTime = survivedSec`）
  - **発火**: 「CLOSE!」ポップアップ（`size 16`、`JUICE.nearMissPopupColor`）+ `playScore += JUICE.nearMissScore` + `soundManager.onNearMiss()`
  - `hazards` の cull（`filter`）の**後**に `_nearMissDone` を prune（`hazards` に残っている Hazard のみ保持。cull された参照のリーク防止）
- `_updateVertical` にも同様の処理（mode 'y'）

#### スピードライン（`sideScroller.ts`）

- `_speedLines: { x: number; y: number; len: number; speed: number }[]` プール（最大 `JUICE.speedLines.count` 本）
- `_update` で目標本数へ追従（速度 > `minSpeed` かつ有効なら `count` 本、それ以外 0 本。増減は毎フレーム数本ずつ）
- 更新: 横モード `x -= (scrollSpeed * speedMult) * dt`、画面左端で右端へラップ（y は乱数で固定）。縦モードは y 方向
- 描画（`_render` の背景後・アイテム前）: 線幅 `width`、`alpha = baseAlpha × clamp((speed - minSpeed) / (fullSpeed - minSpeed))`
- 毎フレームの割り当ては禁止（プール再利用）

#### 距離マイルストーン（`sideScroller.ts`）

- `_nextMilestone = JUICE.milestoneInterval`、`_milestoneFx: { text: string; timer: number } | null`
- `_update`: `distance >= _nextMilestone` で発火 → `_milestoneFx = { text: '${_nextMilestone}m!', timer: 1.6 }` + `soundManager.onMilestone(_nextMilestone)` + `_nextMilestone += JUICE.milestoneInterval`
- `_render` 末尾（画面固定レイヤー）: 中央に 48px ボールド表示、`alpha = min(1, timer)`、出現 0.2 秒はスケール 1.3→1.0 のポップ。`_update` で `timer -= dt`

#### スナップショット拡張（`GameSnapshot`）

```ts
speed: number             // 有効スクロール速度（px/s）= r.scrollSpeed × (1 + min(distance/DISTANCE_ACCEL.fullDist, DISTANCE_ACCEL.maxBonus))
updateProgress: number    // scroller 内部フィールド（private updateProgress）を公開
updateWindowStart: number // 次回更新ウィンドウの開始距離
updateWindowEnd: number   // 次回更新ウィンドウの終了距離
```

- `speed` は `getSnapshot()` で純粋計算（`DISTANCE_ACCEL` は `src/data/gameBalance.ts` 61行。`{ maxBonus, fullDist }`）
- `updateWindow` は純粋関数（`src/domain/updateWindow.ts`）:

```ts
export function computeUpdateWindow(
  progress: number,
  distances: readonly number[],   // UPDATE_DISTANCES（src/data/gameBalance.ts 28行）
  infiniteInterval: number,       // DIFFICULTY.infiniteUpdateInterval（src/data/tunables.ts 78行、= 2000）
): { start: number; end: number }
// 次の未到達閾値 end と、その直前の閾値 start を返す（進捗バーの分母・分子用）
// progress < distances[0]                    → { start: 0, end: distances[0] }
// distances[i] <= progress < distances[i+1]  → { start: distances[i], end: distances[i+1] }
// progress >= 最後の距離                      → end = last + ceil((progress - last)/interval) * interval
//                                            → start = last + floor((progress - last)/interval) * interval
```

- `getSnapshot()` 内で `computeUpdateWindow(this.updateProgress, UPDATE_DISTANCES, DIFFICULTY.infiniteUpdateInterval)` を呼んで `updateWindowStart` / `updateWindowEnd` を埋める
- HUD は `shouldUpdate !== null`（2択待ち中）のときはバーを非表示にする

### 3.4 HUD 設計（`Hud.vue`）

新規 props:

```ts
speed: number
updateProgress: number
updateWindowStart: number
updateWindowEnd: number
topGenre: { label: string; prob: number } | null
muted: boolean
shouldUpdate: number | null
```

レイアウト（既存スタイルの延長。すべて `pointer-events: none`）:

- **左上ブロック**（スコアの下）:
  - `SPD 342`（11px、`--c-dim`、等幅）
  - 次回更新バー: ラベル `NEXT`（10px）+ 幅 100px のバー（高さ 4px、背景 `rgba(0,0,0,0.08)`、埋めは `--c-accent`）。埋め率 = `clamp((updateProgress - start) / (end - start), 0, 1)`
- **右上**:
  - 収束メーター（`topGenre` が null 以外のみ）: `→ STG 64%`（12px）+ 幅 80px のバー（埋め `prob`、色 `--c-accent`）
  - ミュート表示（`muted` のときのみ）: `MUTE`（10px、赤系）
- 既存のスコア・距離バー・ジャンルバッジ・コンボ表示は変更しない

`App.vue` の `topGenre` computed:

```ts
const topGenre = computed(() => {
  if (gameState.genreLocked.value) return null
  const post = gameState.bayesState.value?.posteriors
  if (!post) return null
  let best: { label: string; prob: number } | null = null
  for (const [id, prob] of Object.entries(post)) {
    if (prob < 0.12) continue
    const def = GENRES.find(g => g.id === id)
    if (!def || def.resolvable === false) continue
    if (!best || prob > best.prob) best = { label: def.label, prob }
  }
  return best
})
```

### 3.5 設定ファイル設計

`src/data/config/sound.json`（新規）:

```json
{
  "$comment": "サウンド（WebAudio 手続き生成）",
  "section": "sound",
  "masterVolume": 0.5,
  "sfxVolume": 0.8,
  "bgmVolume": 0.18,
  "bgmBpm": 112,
  "muteStorageKey": "mo_muted"
}
```

`src/data/config/juice.json`（新規）:

```json
{
  "$comment": "演出（Juice）パラメータ",
  "section": "juice",
  "hitStopScale": 0.2,
  "hitStopDurationSec": 0.04,
  "killShakeIntensity": 6,
  "killFlashParticles": 14,
  "comboMilestoneShake": 8,
  "comboMilestones": [
    { "at": 5, "label": "GOOD" },
    { "at": 10, "label": "GREAT" },
    { "at": 20, "label": "EXCELLENT" },
    { "at": 30, "label": "UNSTOPPABLE" },
    { "at": 50, "label": "LEGENDARY" },
    { "at": 100, "label": "GODLIKE" }
  ],
  "nearMissGapPx": 42,
  "nearMissScore": 15,
  "nearMissMinIntervalSec": 0.35,
  "nearMissPopupColor": "#e8590c",
  "milestoneInterval": 500,
  "milestoneTextSize": 48,
  "speedLines": {
    "enabled": true,
    "minSpeed": 300,
    "fullSpeed": 450,
    "count": 14,
    "alpha": 0.14,
    "width": 2,
    "lenMin": 40,
    "lenMax": 140,
    "speedMult": 2.5
  }
}
```

- `config-types.ts` に `SoundConfig` / `JuiceConfig` インターフェース追加し `GameConfigMap` に `sound` / `juice` を登録
- `tunables.ts` に `export const SOUND: SoundConfig = GAME_CONFIG.sound` / `export const JUICE: JuiceConfig = GAME_CONFIG.juice` 追加
- `scripts/validate-json.mjs` の `SCHEMAS` に両ファイルの必須キー追加（`section` / 音量系 / `comboMilestones` 配列 / `speedLines` オブジェクト）

### 3.6 純粋関数（`src/domain/`）

```ts
// comboMilestones.ts
export interface ComboMilestone { at: number; label: string }
export function comboMilestone(combo: number, milestones: readonly ComboMilestone[]): ComboMilestone | null
// combo が milestones[].at に**ちょうど一致**したらその要素、それ以外は null

// updateWindow.ts（3.3 参照）

// nearMiss.ts（3.3 参照）
```

## 4. テスト要件定義

### 単体テスト（`tests/unit/`、vitest）

| ファイル | ケース |
|---|---|
| `comboMilestones.test.ts` | (1) 1未満 → null (2) ちょうど5 → GOOD (3) 6〜9 → null (4) ちょうど100 → GODLIKE (5) 101 → null (6) 空配列 → null |
| `updateWindow.test.ts` | (1) progress 0 → {0, d0} (2) d1 < p < d2 → {d1, d2} (3) p = d1（境界）→ {d1, d2} (4) 最後の距離超過 → infinite の floor ウィンドウ (5) 境界値 p = 最後の距離 |
| `nearMiss.test.ts` | (1) 重複 → false (2) 横モード: 左通過 + 隙間30px → true (3) 横モード: 隙間60px → false (4) 横モード: 未通過 → false (5) 縦モード: 下通過 + 隙間30px → true (6) 縦モード: 隙間60px → false |
| `soundConfig.test.ts` | `GAME_CONFIG.sound` / `GAME_CONFIG.juice` が存在し、音量 0〜1、bgmBpm > 0、comboMilestones が at 昇順、speedLines.enabled が boolean |
| `WebAudioSound.test.ts` | (1) AudioContext なし環境（`globalThis.AudioContext = undefined`）で全フック呼び出し → 例外なし (2) `setMuted(true)` → `muted === true`、`setMuted(false)` → false (3) `startBgm(120)` / `stopBgm()` → 例外なし (4) ミニマルな AudioContext スタブ（createGain/createOscillator/createBufferSource/createBuffer/destination/currentTime/resume）で `onShoot()` 等 → 例外なし |

### 統合テスト（Playwright、`tests/p0_dopamine.spec.ts`）

ゲーム開始フロー（`smoke.spec.ts` と同じ）: `text=はじめる` クリック → チュートリアルイントロ → `text=わかった、プレイする` クリック → プレイフェーズ

- プレイフェーズで HUD に `SPD` 表示と `NEXT` バーが存在すること
- `M` キー押下 → `MUTE` 表示出現、再押下 → 消失
- 数秒間プレイ（自動スクロール）→ `pageerror` が 0 件であること
- 既存スモークテスト（`tests/smoke.spec.ts`）が引き続きパスすること

### 手動検証（スクリーンショット確認、管理者が実施）

1. タイトル画面（HUD 非表示、レイアウト崩れなし）
2. ベースランナープレイ中（スピードライン・速度表示・NEXT バーの進行）
3. コンボマイルストーン（デバッグで STG 強制 → 撃破連射 → 「×10 GREAT」ポップアップ）
4. ジャンルロック時（ロック演出 + BGM 開始 + HUD 収束メーター消滅）
5. 2択提示時（収束メーター表示、更新履歴）
6. 距離マイルストーン 500m（中央表示）
7. ミュート切替（MUTE 表示）

## 5. 実装順序（Implementer 向け）

1. **Phase 1 — 設定基盤**: `sound.json` / `juice.json` / `config-types.ts` / `tunables.ts` / `validate-json.mjs` → `npm run validate` 通過
2. **Phase 2 — 純粋関数 + 単体テスト**: `domain/comboMilestones.ts` / `updateWindow.ts` / `nearMiss.ts` + 4つの単体テスト → `npm run test:unit` 通過
3. **Phase 3 — サウンド**: `SoundManager.ts` 拡張 + `WebAudioSound.ts` + `App.vue` 登録/ミュート/BGM + `useGameState.ts` onChoiceReveal + `RhythmFeature.ts` onBeat + `PuzzleFeature.ts` 二重発火削除 + WebAudioSound 単体テスト
4. **Phase 4 — Juice**: `sideScroller.ts`（コンボ検出・ニアミス・スピードライン・マイルストーン・スナップショット）+ `ShootFeature.ts` 撃破演出 + `entities.ts` ScorePopup.size
5. **Phase 5 — HUD**: `Hud.vue` + `App.vue` wiring（topGenre computed・新 props）
6. **Phase 6 — 統合テスト + 全チェック**: `tests/p0_dopamine.spec.ts` + `npm run ci`（typecheck / lint / validate / test:features / build / bundle-size / test:unit）+ Playwright

各 Phase 完了ごとに `npx vue-tsc --noEmit` と `npm run lint` を実行すること。

## 6. 制約・リスク

| 項目 | 対応 |
|---|---|
| WebAudio の自動再生ポリシー | AudioContext は初回ユーザー操作（ゲーム開始クリック）後のフックで遅延生成 + `resume()` |
| jsdom に AudioContext なし | `_ensureCtx()` で失敗時 no-op 固定。単体テストで検証 |
| ヒットストップの体感 | 40ms と短く、config 駆動で調整可能 |
| パフォーマンス | スピードラインはプール方式。毎フレームのオブジェクト生成を避ける。`_nearMissDone` は cull 後に prune |
| バンドルサイズ | JS 800KB / CSS 100KB / dist 2MB の上限あり（`check-bundle-size.mjs`）。WebAudioSound は音声ファイル不使用で数 KB 程度。`npm run build` 後に必ず確認 |
| `onGenreLock('rhythm')` の既存挙動 | BGM 開始に使用しない（学習効果トリガーと混同する） |
| ESLint | `no-explicit-any` が error。`webkitAudioContext` フォールバックは `as unknown as typeof AudioContext` 等で any を回避 |
| マジックナンバー | 演出値はすべて `juice.json` / `sound.json` 経由。実装固有閾値はファイル先頭 const |

## 7. P1（後続・別ブランチ）への引き継ぎ

P0 で導入した仕組みを P1 が再利用する:

- `WebAudioSound` の SFX レシピ → P1 の記録更新音・スキン購入音に追加
- `onMilestone` フック → P1 の目標達成音
- スナップショットの `speed` / `updateProgress` → P1 の目標進捗表示
- HUD のバー部品 → P1 の記録・目標 UI に流用

## 追従タスク（P0.5）

P0 完了後に個別に片付ける事項。マージをブロックしない。

- **潜在 Major**: 左方向ハザード（`direction: 'left'`、SurvivalPlugin）のニアミス誤検知リスク。`_checkNearMiss` は右→左流れるハザード前提の通過判定（`h.x + h.w < p.x`）。現状左方向ハザードはカメラと同速で画面外左に留まるため発火しないが、将来の挙動変更で発火し得る。対応: ハザードの direction を考慮した通過判定。
- **潜在 Major**: `playBgm` の BGM 重複は本次修正で対応済み（ファイル追加時の同時再生を防止）。
- **Minor**: M-3 速度計算式の重複（`_drawSpeedLines` と `_update` の distanceAccelFactor）→ ヘルパー抽出。M-4 ニアミス prune ループの重複（`_updateVertical`/`_updateHorizontal`）→ 共通化。M-5 `_checkNearMiss` の未使用引数 `_speed` 削除。M-6 `onChoiceReveal` の setTimeout 未管理。M-7 `_noise` の AudioBuffer 毎再確保。M-8 ベース/リード音の長さが bpm 引数と不一致（SOUND.bgmBpm 固定）。M-9 updateWindow テストのデータを実設定（difficulty.json）に一致させる。M-10 白系演出（フラッシュ/スピードライン/マイルストーン文字）が明背景ジャンルで視認困難 → ジャンルテーマ色併用を検討。
