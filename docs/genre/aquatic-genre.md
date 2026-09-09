# Aquatic（水中アクション）ジャンル実装ドキュメント

## 概要

横スクロールの原点から、水中アドベンチャー「Aquatic」へ変貌するジャンル。
プレイヤーは深海をダイブし、酸素ゲージを管理しながら安全色ハザード（珊瑚）に
触れて回復を図る。説明書の選択肢を重ねることで、横スクロールから縦スクロールへ、
さらには「水中」という環境へゲームが変容していく体験が核。

## アーキテクチャ

### ファイル構成

```
src/
├── data/
│   ├── config/oxygen.json          # 酸素ゲージパラメータ（新規）
│   ├── genres/aquatic.json         # ジャンル定義（enableFeatures: oxygen）
│   └── tunables.ts                 # export const OXYGEN 追加（修正）
├── engine/
│   └── FeatureSystem.ts            # onPlayerHit 戻り値を boolean に変更（修正）
├── game/
│   ├── sideScroller.ts             # _onPlayerHit を absorbed 判定に変更（修正）
│   └── systems/
│       ├── index.ts                # OxygenFeature 登録（修正）
│       └── OxygenFeature.ts        # 酸素ゲージロジック（新規）
├── framework/
│   ├── config-types.ts             # OxygenConfig 型追加（修正）
│   └── ConfigValidator.ts          # RANGE_CHECKS に oxygen 追加（修正）
└── schemas/
    └── genre.schema.json           # enableFeatures/disableFeatures に oxygen 追加（修正）
```

## ジャンル収束条件

| パラメータ | 閾値 |
|-----------|------|
| `vertical` | 3以上 |
| `aerial`   | 3以上 |
| `survive`  | 4以上 |

3軸すべてが閾値を超えると Aquatic ジャンルに収束する。
収束方式はベイズ収束（主方式）＋ genreParams 軸方式の併用。

### 収束のしくみ

- **ベイズ収束（主方式）**: `bayes.json` のハイパーパラメータ（convergenceThreshold / decayRate）で
  各軸の閾値との乖離量から尤度を計算し、事後確率でジャンルを確定
- **genreParams 軸方式（後方互換）**: vertical / aerial / survive の累積値で直接判定
- **genrePoints 直接方式（後方互換）**: カード選択で aquatic に直接ポイント加算

## ゲーム仕様

### 酸素ゲージ

| パラメータ | 値（oxygen.json） | 意味 |
|-----------|-------------------|------|
| `maxOxygen` | 100 | 最大酸素量 |
| `oxygenDecayRate` | 4.0 /秒 | 時間減衰速度（満タン→枯渇 = 25秒） |
| `oxygenHitDamage` | 25 | 危険ハザード被弾での酸素減少量 |
| `oxygenCoralRestore` | 30 | 珊瑚（safe hazard）接触での回復量 |
| `oxygenLowThreshold` | 30 | 低酸素警告閾値 |

- 酸素は `[0, maxOxygen]` にクランプされる
- 酸素が 0 になった瞬間、死亡トリガーが発火（1回のみ）
- 被弾時に oxygen > 0 なら無敵フレーム（`VFX.invincibleDuration`）が付与され生存する
- 低酸素警告は `oxygen <= 30` に**落ちた瞬間**に1回だけ発火。閾値以上に回復するとフラグがリセットされ再警告可能

### 縦スクロール

- `scrollDirection: "vertical"` → `scrollAxis 'y'`
- ハザードが下から上に流れる（プレイヤーは固定・世界が下へスクロール）
- プレイヤーは `y ∈ [0, H - p.h]` にクランプされる（画面外へ押し出されない）

### 操作方法

| キー | 動作 |
|------|------|
| ← → | 左右移動 |
| ↑ ↓ | 上下移動 |
| Space | ジャンプ |

### スコア計算

```
distance * 0.8 + itemsCollected * 100 + survivedSec * 12
```

- `distance`: 縦スクロールでの進行距離
- `itemsCollected`: 収集したアイテム数
- `survivedSec`: 生存時間（秒）

### 珊瑚（safe hazard）

- `aquatic.json` の spawnTable で safeChance 0.6 が設定されている
- 接触時に `oxygenCoralRestore` 分回復し、ハザードは消費される（除去）
- 「珊瑚に触れたらなくなる」はゲームとして自然で、毎フレーム発火スパムを防止する

## 実装上の注意点

1. **`onManualUpdated` で酸素をリセットしない理由**（#179）
   oxygen はプレイ中の永続状態であり、説明書更新でリセットすると
   スコア巻き戻しや低酸素警告の再発火バグにつながる。
   `OxygenFeature.onManualUpdated` は何もしない（状態保持のみ）。

2. **死亡トリガーは `modifyPlayerHp(-maxHp)` の1回発火パターン**
   `deathTriggered` フラグで二重発火を防ぐ（TetrisFeature 449行と同型）。
   `oxygen <= 0` の瞬間に `world.modifyPlayerHp(-world.player.maxHp)` を呼び、
   標準の死亡フロー（投擲フェーズへの自動遷移）へ橋渡しする。

3. **safe hazard は接触で除去する理由**（§2.3）
   横スクロールの衝突ループでは、safe hazard がプレイヤーと重なり続ける間
   `onSafeHazardTouch` が毎フレーム呼び出される。除去しないと
   毎フレームの酸素回復＋パーティクル＋SE のスパムになる。
   aquatic の features に `color_touch` は含まれていないため、
   除去による他 feature への副作用はない。

4. **エンジン修正（onPlayerHit 戻り値）の経緯**
   従来 `_onPlayerHit` は `this.dead` の有無だけで即死判定をしていた。
   `RpgFeature.onPlayerHit` が HP を 3→2 に減らしても `dead` は false のまま、
   結果として hp feature 全ジャンルで「1 被弾即死」になっていた（既存バグ）。
   `onPlayerHit` の戻り値を `boolean` に変更し、`true` を返したシステムが
   被弾を処理したことをエンジンに通知するようにした。
   これにより hp/oxygen ジャンルは複数回被弾して生存可能になる。

5. **oxygen は Player フィールドにせず feature 局所状態にした理由**
   Player クラスへのフィールド追加は他 feature への影響が広く、
   テスト時のモックも複雑化する。oxygen は aquatic ジャンル固有の
   減衰リソースであり、feature 局所状態として管理することで
   独立性・テスト性を保つ。テストは getter `oxygenFeature.oxygen` で検証する。

6. **PixelCanvas.withAlpha の alpha 量子化問題**
   `withAlpha` は内部で alpha を `Math.round(alpha / 0.0625) * 0.0625` で量子化しており、
   alpha < 0.0625 で 0 になる（消える）。HUD 背景の半透明は
   `rgba()` 色文字列を直接 `px.rect()` に渡すことで回避している。

## 既知の制限 / 今後の改善候補

- 「terrain がプレイヤーを押し上げる」「上端からはみ出せばゲームオーバー」は未実装
  （プレイヤーは画面内にクランプされる）
- 縦スクロールは STG 型（プレイヤー固定・ハザードが下方へ流れる）。
  設計の「ダイバーが下へ潜り続ける」表現とは異なる
- 酸素ゲージの HUD 位置が Vue HUD のスコアブロックと干渉する可能性がある
  （oxygen.json の `hudTopOffset` で調整可能）

## テスト

### ユニットテスト

- `tests/unit/game/OxygenFeature.test.ts`: T-1〜T-14（14件）
- `tests/unit/game/playerHitAbsorb.test.ts`: ケースA〜C（3件）

### Playwright E2E テスト

- `tests/aquatic.spec.ts`: aquatic ジャンル強制 → 酸素ゲージ描画確認 → 減衰確認 → safe hazard 接触確認
