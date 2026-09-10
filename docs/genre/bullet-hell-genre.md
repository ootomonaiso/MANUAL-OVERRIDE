# Bullet Hell（弾幕STG）ジャンル実装ドキュメント

## 概要

MANUAL-OVERRIDEゲームにおける `bullet_hell`（弾幕回避シューティング）ジャンルの実装をまとめる。
横スクロールアクションの原点（`base`）から、説明書の選択を積み重ねることで「画面上部に居座る倒せないボスが弾幕を撃ち続け、その隙間を縫って生き延びる」弾幕STGへ変貌する。

`stg`（宇宙・横）・`aerial_stg`（空・縦・撃破前提）と違い、**目的は撃破ではなく生存**であり、自機の攻撃はボスを倒すためではなく**命中数・連続命中がスコアに寄与する副次的な要素**である。世界観は東方Project的なファンタジー弾幕STG（黒背景＋桜・お札の浮遊）とし、近縁STG群から明確に差別化する。

## アーキテクチャ

### ファイル構成

```
src/
├── data/
│   ├── config/bullet_hell.json        # 新規: ボス位置・弾幕パターン・弾速・カラー等のチューニング値
│   └── genres/bullet_hell.json        # 変更: enableFeatures再設計（boss_stationary追加・enemy_hp削除）・scoreFormula変更
├── genres/
│   └── BulletHellPlugin.ts            # 新規: 東方風ビジュアル（黒背景・桜/お札パララックス・背面視点自機）
├── game/systems/
│   ├── BulletHellBossFeature.ts       # 新規: boss_stationary。常駐ボス描画・弾幕パターンスポーン/移動/カリング・被弾/命中判定・スコア計上
│   ├── playerHitEffect.ts             # 新規: 被弾エフェクト共有ヘルパー（BulletHellBossFeature / RpgFeature 共用）
│   ├── ShootFeature.ts                # 変更: _spawnVerticalBullets に boss_stationary ゲートのオートエイム分岐
│   ├── RpgFeature.ts                  # 変更: onPlayerHit の被弾エフェクトを playerHitEffect へ集約
│   └── index.ts                       # 変更: BulletHellBossFeature を登録
├── game/
│   └── sideScroller.ts                # 変更: ScoreVars 2変数 + MutableWorld配線 + _spawnHazard の空テーブルガード
├── domain/types.ts                    # 変更: ScoreVars に hitsOnBoss / maxHitCombo 追加
├── engine/types.ts                    # 変更: MutableWorld に addScoreVarsHitsOnBoss / setScoreVarsMaxHitCombo 追加
├── data/tunables.ts                   # 変更: BULLET_HELL 再エクスポート
├── framework/config-types.ts          # 変更: BulletHellConfig 型 + GameConfigMap への bullet_hell 追加
├── data/cards/expansion-cards.json    # 変更: c-boss-stationary カード追加（到達性確保）
└── schemas/genre.schema.json          # 変更: boss_stationary を feature enum 追加 / scoreFormula 変数説明に新変数追加
```

フィーチャーIDについて: 既存の `boss`（`SpecialFeature`、HP持ち撃破可能ボス）とは性質が異なるため、**新規 FeatureId `boss_stationary`** を導入し `BulletHellBossFeature` が担当する。既存 `boss` の挙動（`arena` / `hack_slash`）には影響しない。

## ジャンル収束条件

| パラメータ | 閾値 |
|-----------|------|
| `vertical` | 4以上 |
| `enemy`    | 8以上 |

ベイズ収束方式（主方式）に準拠。専用の収束ロジックは持たない。

### 到達性

`enemy: 8` は高閾値のため、到達性を担保するカード **`c-boss-stationary`**（`vertical +3` / `enemy +3`、`genreAffinity: ["bullet_hell"]`）を `expansion-cards.json` に追加した。このカードを数枚選択すると `vertical` / `enemy` が閾値を充足し、ベイズ収束で bullet_hell が最尤ジャンルになる。`tests/unit/domain/genreResolver.test.ts` で実カード（`CARD_POOL` 由来）を用いて収束候補に上がることを検証する。

## ゲーム仕様

### 常駐ボス（倒せない）

- 画面上部中央（`BULLET_HELL.boss.yRatio` × 画面高さ、X は画面中央）に固定。**HP を持たず倒せない**。`BulletHellBossFeature.render()` が描画する（ハザードではないためプレイヤーとの衝突判定対象にならない）。
- `idle sway`（上下の僅かな揺れ）: `sway = sin(time × swaySpeed) × swayAmp`。
- 少女シルエット（頭・髪・ドレス・リボン・光輪）を Canvas パスで描画。

### 弾幕パターン（3種・`BULLET_HELL.pattern` で切替）

ボスは `patternCycleSec` ごとにパターンを切り替え、`fireIntervalSec` ごとに発射する。全パターンともボス中心から発射、敵弾は毎フレーム `x += vx·dt` / `y += vy·dt` で移動し画面外（4方向）でカリング。同時存在数は `bullet.maxBullets` で上限。

| パターン | 内容 |
|---------|------|
| radial  | ボス中心から全方向（360°）に `radialCount` 発を等間隔に放射（環） |
| fan     | ボスから下方扇形（`fanSpreadDeg`）に `fanCount` 発を拡散 |
| aimed   | プレイヤーの現在位置を狙い、`aimedCount` 発を `aimedSpreadDeg` の広がりで発射 |

### 自機の攻撃（3方向オートエイム）

`z` 長押しで連射。`ShootFeature._spawnVerticalBullets` 内で **`boss_stationary` をゲート**に、中央弾はボス位置へ角度追従（自動照準）、左右2発は中央弾からの固定オフセット（`autoAim.sideOffsetDeg`）。ボスに近い・良い位置に陣取れば3発とも命中する。命中した弾は `alive=false` となり消滅。

### 被弾（HP制）

- 既定 `playerMaxHp = 3`（`hp` feature 有効）。
- 敵弾×プレイヤー衝突で `playerHitEffect`（共有ヘルパー）が `modifyPlayerHp(-1)` → 無敵時間付与 → シェイク → 赤パーティクルを実行。被弾で `hitCombo` が 0 にリセット。
- 無敵時間中（`p.invincible > 0`）は被弾判定をスキップし、1フレームに1被弾のみ。

### 操作方法

| キー | 動作 |
|------|------|
| ← → | 左右移動 |
| ↑ ↓ | 上下移動（`scrollAxis: 'y'`、`MovementFeature` が4方向を処理） |
| Space | 縦STGのため未使用（ジャンプ相当の割り当てなし） |
| z | 射撃（3方向オートエイム） |

### スコア計算

```
survivedSec × 15 + hitsOnBoss × 25 + maxHitCombo × 40
```

- `survivedSec`: 生存時間。回避が主軸であることを反映し比重を最も高く
- `hitsOnBoss`: ボスへの命中数。攻撃はスコアボーナスの位置づけ
- `maxHitCombo`: 被弾せずに連続命中させた最大数（被弾で `hitCombo` リセット、セッション全体で保持）

`hitsOnBoss` / `maxHitCombo` は `ScoreVars` に新設し、`sideScroller._recalculatePlayScore` の vars 構築と `MutableWorld` 配線（`addScoreVarsHitsOnBoss` / `setScoreVarsMaxHitCombo`）の3点セットで反映する。

## 説明書分岐

`expansion-cards.json` に `c-boss-stationary` を1枚追加（`vertical +3` / `enemy +3`、`weight 2`、`genreAffinity: ["bullet_hell"]`）。既存分岐木への接続は不要（フラットランダムプール方式のカード）。

## ビジュアル（BulletHellPlugin）

- **背景**: 黒グラデーション（`#04040e` → `#0a0a1a`）+ 桜の花びら・お札の浮遊パララックス（`verticalBackgroundLayers = true` で縦モードでも `drawFarLayer` / `drawMidLayer` を描画、`Math.sin` 決定的配置）
- **自機**: 東方風キャラクターを**背面視点**で描画（長い髪・後頭部リボン・ドレス）。`spriteFacesUp = true` で engine 側 -90° 回転を無効化（二重回転回避、#102）
- **ボス / 敵弾**: `BulletHellBossFeature.render()` が担当。敵弾は円形（塗り `fillColor` `#ffffff` + 枠 `rimColor` `#4a90ff`、グロー付き）
- **フィールド幅**: 縦STG共有セーフゾーン（`hud_safezone.json` の `vstgLeftRatio` / `vstgRightRatio` = 0.225）をそのまま使用

## 設定パラメータ（`config/bullet_hell.json`）

| キー | 既定値 | 内容 |
|------|--------|------|
| `boss.yRatio` | 0.12 | ボス中心 Y（画面高さ比）。X は画面中央 |
| `boss.w` / `boss.h` | 96 / 96 | ボス描画サイズ |
| `boss.swayAmp` | 10 | idle sway 振幅 px |
| `boss.swaySpeed` | 0.8 | idle sway 角速度 rad/s |
| `bullet.radius` | 6 | 敵弾の半径 px |
| `bullet.speed` | 180 | 敵弾の速度 px/s |
| `bullet.fireIntervalSec` | 0.5 | パターン内発射間隔（秒） |
| `bullet.maxBullets` | 220 | 敵弾の同時存在上限 |
| `bullet.rimColor` | `#4a90ff` | 敵弾の枠色 |
| `bullet.fillColor` | `#ffffff` | 敵弾の塗り色 |
| `pattern.radialCount` | 24 | 放射状パターンの弾数 |
| `pattern.fanCount` | 9 | 扇状パターンの弾数 |
| `pattern.fanSpreadDeg` | 60 | 扇状の広がり（度） |
| `pattern.aimedCount` | 3 | 自機狙いパターンの弾数 |
| `pattern.aimedSpreadDeg` | 14 | 自機狙いの広がり（度） |
| `pattern.patternCycleSec` | 2.4 | パターン切り替え間隔（秒） |
| `autoAim.sideOffsetDeg` | 12 | オートエイム左右弾のオフセット角度（度） |

## テスト

### ユニットテスト（`tests/unit/`）

- `game/BulletHellBossFeature.test.ts`（21件）: パターン生成・移動、被弾で HP 減算 + 無敵付与、無敵中は被弾スキップ、HP 0 で弾除去、自機弾×ボスで `hitsOnBoss` / `hitCombo` / `maxHitCombo` 更新、被弾で `hitCombo` リセット、`maxBullets` 上限、画面外カリング
- `domain/scoreFormulaBulletHell.test.ts`（8件）: スコア式を `GENRES` 由来の `scoreFormula` で評価、未設定変数は 0 扱い
- `game/spawnGuard.test.ts`（3件）: 空テーブル / 全重み0 で `_spawnHazard` が例外を投げない、非空テーブルは従来どおりスポーン
- `domain/genreResolver.test.ts`（追記）: 実カード `c-boss-stationary` で bullet_hell が収束候補に上がる
- `data/genres.test.ts`（追記）: `bullet_hell.json` の `enableFeatures`（`boss_stationary` / `hp` 含む、`enemy_hp` 除外）と `scoreFormula` の整合

全体: **44 files / 396 tests PASS**（新規 bullet_hell 関連テスト 32件以上）。

### Playwright / 手動確認

DEV モードのデバッグパネルで `bullet_hell` を強制し、以下を目視＋スクリーンショットで確認済み：
- 黒背景＋桜/お札の浮遊、少女ボスが上部中央に浮遊（sway）
- 円形弾（青枠白塗り）が radial / fan / aimed のパターンで撃たれる
- 自機が背面スプライトで描画され、3方向オートエイムでボスへ命中
- 被弾で HP が減り、HP 0 で死亡 → 投擲フェーズへ遷移
- 説明書ラベルが「弾幕回避シューティング」に切り替わる

## 実装上の注意点

1. **敵弾は Feature 内独立配列**（`enemyBullets[]`）。既存ハザード系・`_updateVertical`・他ジャンルには触れない。ボスはハザードではなく Feature の `render()` が描画（衝突判定対象外）
2. **被弾は `playerHitEffect` 共有ヘルパー**で処理。`_onPlayerHit` のフォールバック（`if (!this.dead) this._die(p)`、HP 系で即死し得る疑い）に依存しない。無敵時間中は被弾判定をスキップ
3. **`boss_stationary` は新規 FeatureId**。ShootFeature のオートエイムもこの Feature でゲート（genre 文字列のハードコードを回避）。**Feature の update 順序は `rules.features` Set の順序 = `bullet_hell.json` の `enableFeatures` 配列順序**（`shoot` … `boss_stationary`）に従うため、`shoot` が先に来ることで `world.bullets` が同期された後にボス側が自機弾×ボス判定できる。JSON の順序を変えると逆転するが、最悪 1 フレーム遅延に留まるため許容
4. **ScoreVars は型・構築・world 配線の3点セット**。片方だけ更新すると式が無言で 0 扱い
5. **`_spawnHazard` に空テーブルガード**（`table.length === 0 || weights.every(w => w <= 0)` で早期 return）。bullet_hell は `spawnTable = []`（通常ハザードを出さない）のため必須
6. **`onManualUpdated` は一時状態のみリセット**（`enemyBullets` / タイマー / `patternIndex`）。`hitCombo` / `hitsOnBoss` / `maxHitCombo` はセッション全体で保持（`ShootFeature.onManualUpdated` の kills/combo 保持と同様の意図、#179 参照）
7. **`fireTimer` は `fireIntervalSec` でクランプ**。`maxBullets` 上限到達中にタイマーが無限に溜まり、上限解除後にバースト発射するのを防ぐ
8. **theme は `stg` を維持**（専用の東方系テーマは未定義。Canvas ビジュアルは Plugin が担当するため説明書 UI は stg テーマで十分）

## レビュー履歴

Iteration 1（review subagent）: **APPROVE**（HIGH 0件）。MEDIUM 5件 + LOW 12件を指摘。

- **MEDIUM（すべて修正）**:
  - `maxBullets` テストが虚テストだった → 上限付近を事前充填して上限維持を検証
  - `spawnGuard` の「全重み0」テストが未存在メソッドをパッチし実質未検証 → `GameRegistry.getGenre` を spy して全0重みテーブルを検証
  - 「HP 0 で弾除去」テストが除去をアサートしていなかった → `enemyBullets.length === 0` を追加
  - 被弾エフェクトが `RpgFeature` と重複（DRY 違反）→ `playerHitEffect` 共有ヘルパーに集約（RpgFeature は `yBoost` 付きで従来挙動を維持）
  - `onManualUpdated` が累積カウンタをセッション途中でリセットしていた → 一時状態のみリセットに変更
- **LOW（該当分修正）**: `fireTimer` バースト（クランプ）、マジックナンバー（ファイル先頭 `const` 化）、テストの引数誤り・虚定数・ハードコード式（`GENRES` 参照へ）、schema の scoreFormula 変数説明、`tunables.ts` の import 位置、Plugin の `_gY` 命名、設計書の update 順序説明の修正
- **未対応（許容）**: ボス位置の2箇所で計算（L3）、`palette.danger` と `bullet.rimColor` の重複（L7、無害）、`onInit` がランタイムで呼ばれない点（L12、他 Feature と一致）

## 今後の改善候補

- ボスを段階的に撃破可能にする拡張（フェーズ制・複数ボス等）。今回は意図的に見送り、常駐・不撃破の仕様
- 弾幕パターンの追加バリエーション（波状・螺旋・誘導弾など）。初期 3 種（radial / fan / aimed）を実装し、config で拡張可能
- `bullet_hell` 専用にフィールド幅を共有設定よりさらに狭める場合、`hud_safezone.json` のジャンル単位オーバーライド機構が新規に必要
- 東方系専用の説明書テーマ（`ManualTheme` に追加）
- 敵弾の種類分け（速弾・遅弾・誘導弾）とスコアへの反映
- `_onPlayerHit` の HP フォールバック（`if (!this.dead) this._die(p)`）が HP 系で即死する疑い（本タスクのスコープ外。survival / rpg にも影響し得るため、別途 issue 化して検証）
