# Runnerジャンル実装ドキュメント

## 概要

MANUAL-OVERRIDEゲームに「Runner（エンドレスランナー）」ジャンルを実装しました。
プレイヤーが説明書の選択肢を積み重ねることで、横スクロールゲームから自動走行するランナーへと変貌します。

今回の追加機能: **バネ（Spring）ハザード** — プレイヤーが上から踏むと高く弾き上げる安全ハザード。
ランナーらしい「ジャンプの代わりにバネを踏んで高度を得る」という手触りを提供します。

## アーキテクチャ

### ファイル構成

```
src/
├── game/
│   ├── entities.ts              # HazardShape に 'spring' 追加
│   └── sideScroller.ts          # _onSpringBounce() + 衝突ループ内バネ判定
├── data/
│   ├── config/
│   │   ├── physics.json         # springBounceVelocity: -950
│   │   └── vfx.json             # springParticle* 6件
│   ├── gameBalance.ts           # PLAYER_PHYSICS に springBounceVelocity 追加
│   └── genres/
│       └── runner.json          # ジャンル定義（auto_run / double_jump / long_air / near_miss_combo）
├── framework/
│   ├── config-types.ts          # PhysicsConfig / VfxConfig に spring 関連型追加
│   └── ConfigValidator.ts       # RANGE_CHECKS に springBounceVelocity 検証追加
├── genres/
│   └── BasePlugin.ts            # RunnerPlugin.spawnTable に spring エントリ追加
└── plugins/
    └── SoundManager.ts          # onJump() をバネ発動時に流用
```

## ジャンル収束条件

`runner.json` の thresholds: `{ tempo: 8 }`

`tempo >= 8` で Runner ジャンルに収束します。

### tempo を加算するカード（starter-cards.json）

| カードID | tempo 値 | ラベル |
|---------|---------|--------|
| `c-tempo-smooth` | +2 | キャラクターの動きをなめらかに改善する |
| `c-tempo-speed` | +3 | ゲームのテンポをどんどん上げていく |
| `c-rhythm-beat` | +1 | 音楽のテンポに合わせた動きを取り入れる |
| `c-tempo-dash` | +1 | 瞬間的な加速を使えるようにする |
| `c-general-visual` | +1 | 見た目の演出を派手にする |
| `c-rare-multidir` | +1 | 全方向に動けるステージにする |

収束はベイズ事後確率で判定（`genreResolver` 参照）。

## ゲーム仕様

### 操作方法

| キー | 動作 |
|------|------|
| Space | ジャンプ（二段ジャンプ対応） |
| ArrowLeft | 左移動（安全帯内） |
| ArrowRight | 右移動（安全帯内） |

- **自動走行**: Runner ジャンルでは `auto_run` フィーチャーによりキャラクターが自動前進
- **二段ジャンプ**: 空中でもう一度 Space で追加ジャンプ
- **コヨーテタイム**: 接地判定から 9 フレーム間はジャンプ可能
- **ジャンプバッファ**: ジャンプ入力から 10 フレーム間、着地直後のジャンプを許容

### long_air スコア

`score.json` の `longAirScoreRate` で定義された倍率が、空中滞留時間に乗算されます。

### near_miss_combo

ハザードに接近した際にコンボが累積。`maxCombo * 50` が最終スコアに加算されます。

### スコア計算式

```
distance * 1.2 + survivedSec * 8 + maxCombo * 50
```

### バネ（Spring）

- **形状ID**: `'spring'`（`HazardShape` 型に追加）
- **挙動**: プレイヤー矩形とバネ矩形が重なり、かつ `player.vy >= 0`（落下中または静止）のときに発動
- **効果**:
  - `player.vy = PLAYER_PHYSICS.springBounceVelocity`（-950）
  - `player.onGround = false`
  - `soundManager.onJump()` を再生
  - バネ上部から上向きパーティクル（`h.glowColor` = ティール `#55efc4`）
- **ダメージ**: 与えない（被弾経路 `_onPlayerHit` を通さない）
- **跳ね速度**: 通常ジャンプ（-720）より高い（絶対値 950 > 720）
- **スポーンテーブル**: RunnerPlugin に追加
  - `weightStart: 0, weightEnd: 2`（distance 3000px までで重み逓増）
  - `wRange: [28, 36], hRange: [20, 28]`
  - `safeChance: 1`（常に `isSafe = true`）
- **発動条件**: 横モード・縦モード両対応（`_updateHorizontal` / `_updateVertical` 両方の衝突ループに実装）
- **再発動ガード**: 弾かれた直後は `vy < 0` になるため、上昇中は再発動しない（クールダウン不要）
- **ジャンプ状態の消費**: バネ発動時に `jumpsLeft → 0`、`jumpBufferTimer`・`coyoteTimer`・`jumpHeld` をクリアする。
  バッファされたジャンプ入力やコヨーテタイムがバネの弾き上げをジャンプに書き換える（downgrade）ことを防止し、
  `stats.jumps` および `onPlayerJump` フックが発火しないことを保証する（バネは発射源でありジャンプではない）

## 実装上の注意点

1. **バネ判定の位置**: 衝突ループ内・`isHazardous()` の直前。`continue` で被弾・safe-touch の両方を経由しない。
   `isHazardous()` の beat_hazard 反転影響も受けない（形状駆動）。

2. **無敵時間中のバネ**: ループは `p.invincible <= 0` ガード内にあるため、無敵中はバネが効かない。
   Runner には hp feature がなく一撃で終わるため許容する。

3. **stats.jumps++ / onPlayerJump フックは発火しない**: ジャンプ操作ではないため、ジャンプ反応系 Feature の二重起動を防ぐ。

4. **soundManager.onJump() 流用**: 専用 SFX JSON は作成せず既存の jump SE を再利用。

5. **描画**: `_drawHazard` に専用分岐は追加せず、default の rect 経路で描画。
   safeChance:1 により safeGlow 色（ティール）で描画されるため視覚的に安全と認識可能。

6. **safeChance:1 と isSafe の関係**: `_spawnHazard` で `safeChance` が 1 の場合、`Math.random() < 1` は常に true となり、
   `isSafe = true` 確定。安全色の経路を通り、ティール系で描画される。

7. **横/縦モード両対応**: `_onSpringBounce` ヘルパー関数に処理を抽出。
   横モードでは screenX = `h.x - cameraX`、縦モードでは `h.x`（画面座標）を渡す。

## 既知の制限

- **beat_hazard + 反転時の表示**: 仮に `beat_hazard` フィーチャーと反転が有効な場合、
  バネは危険色で表示される可能性があるが、実際には被弾せず弾き続ける。
  現状 Runner ジャンルには `beat_hazard` が存在せず、 Runner 固有のスポーンテーブルのみがバネを生成するため
  現実的に到達しないケース（`isHazardous()` の形状判定が色ではなく形状で意味を持つため）。
- **バネと危険ハザードの重複**: 仮にバネと危険ハザードが同一フレームでプレイヤーに重なる場合、
  コード上はバネ判定が `isHazardous()` より先に実行され、バネが優先される。
  最小 spawn spacing により両者は ≥270px 離れて生成されるため、現実的に到達しないケース。

## テスト

### ユニットテスト (`tests/unit/game/SpringFeature.test.ts`)

以下の 5 件のテストを実装（vitest 全テスト通過）：

1. **バネが落下中のプレイヤーを弾く** — player.vy = 100 で落下中にバネと衝突 → `vy === -950`、`onGround === false`
2. **バネがプレイヤーにダメージを与えない** — 接地状態でバネと衝突 → `collisions === 0`、`dead === false`、`hp === 3`
3. **バネの跳ね速度は通常ジャンプより高い** — `-950 < -720` を検証
4. **上昇中のプレイヤーは再発動しない** — vy = -950 でバネと重なっても再発動しない
5. **縦モードでもバネが弾く** — scrollAxis 'y' で同様のバネ発動を検証

**全テスト通過**

## 今後の改善候補

- バネの専用描画（コイル状の `_drawSpring`）
- バネ専用 SFX JSON の作成
- 無敵時間中でもバネが発動するオプション（ゲームバランス次第）
- バネのパーティクル色をジャンルパレットに依存させる
