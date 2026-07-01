# サバイバルジャンル拡張

## 概要

サバイバルジャンル (`survival`) に以下の機能を追加した。

- **hungerシステム**: 時間経過でhungerが減衰し、臨界域以下でHPダメージ
- **近接攻撃 (melee)**: Zキーで左右両方向の近接攻撃
- **XP/レベルシステム**: 敵撃破でXP獲得、レベルアップでHP回復・武器強化
- **食料/武器アイテム**: 敵撃破時にドロップ、食料はhunger回復、武器はATK強化
- **両方向からの敵出現**: 左方向からも敵が出現（両方向攻撃対応）

## ファイル構成

### 新規作成ファイル

| ファイル | 説明 |
|----------|------|
| `src/data/config/survival.json` | サバイバルゲーム固有パラメータ（hunger/melee/XP/VFX/HUD色） |
| `src/game/systems/SurvivalFeature.ts` | hunger/melee/XP/アイテム収集のFeatureSystem実装 |

### 変更ファイル

| ファイル | 変更内容 |
|----------|----------|
| `src/game/entities.ts` | `Player` に `currentLevelXp`, `nextLevelXp` 追加。`Hazard` に `direction` 追加。`Item.type` に `'food'`, `'weapon'` 追加 |
| `src/engine/types.ts` | `HazardDirection` 型追加。`SpawnEntry` に `direction` フィールド追加 |
| `src/framework/config-types.ts` | `SurvivalConfig` インターフェース追加・拡張 |
| `src/data/tunables.ts` | `SURVIVAL` 定数エクスポート追加 |
| `src/game/systems/index.ts` | `SurvivalFeature` の登録追加 |
| `src/genres/SurvivalPlugin.ts` | `drawGenreHUD`, `onHazardDestroyed`, `onGenreLocked`, 左方向敵対応 |
| `src/data/genres/survival.json` | 新feature有効化、scoreFormula更新 |
| `src/data/config/genres.json` | survivalエントリの更新 |
| `src/game/sideScroller.ts` | 左方向ハザード移動ロジック、food/weapon描画、`drawGenreHUD`呼び出し |

## アーキテクチャ

### SurvivalFeature

`FeatureSystem` インターフェースを実装し、以下の3つのFeatureを処理する。

```typescript
handles = ['survival_hunger', 'survival_melee', 'survival_level']
```

| Feature | 説明 |
|---------|------|
| `survival_hunger` | 時間経過でhunger減衰、臨界域でHPダメージ |
| `survival_melee` | Zキーで近接攻撃（左右両方向） |
| `survival_level` | 敵撃破でXP獲得、レベルアップでHP回復・武器強化 |

### 状態管理

`SurvivalState` が内部状態を保持する。

```typescript
interface SurvivalState {
  meleeCooldown: number    // 近接攻撃クールダウン残り
  meleeActive: number      // 攻撃判定残り時間
  lastHungerDamage: number // 前回のhungerダメージからの経過時間
  xp: number               // 現在レベル内のXP
  nextLevelXp: number      // 次のレベルに必要なXP
}
```

`Player` クラスの `currentLevelXp` / `nextLevelXp` と同期し、Plugin側でHUD描画に利用可能。

### SurvivalPlugin

`GenrePluginBase` を継承し、以下を提供する。

| メソッド | 説明 |
|----------|------|
| `drawGenreHUD` | hungerバー / XPバー / レベル / ATK表示 |
| `onHazardDestroyed` | 敵撃破時に食料/武器ドロップ |
| `onGenreLocked` | ジャンル確定時の状態初期化 |
| `drawFarLayer` / `drawMidLayer` | 森林テーマの背景描画 |
| `drawPlayer` | サバイバー風のプレイヤー描画 |

## 設定パラメータ

`src/data/config/survival.json` で全パラメータを管理。

### hungerシステム

| パラメータ | 初期値 | 説明 |
|-----------|--------|------|
| `maxHunger` | 100 | 最大hunger |
| `hungerDecayRate` | 2.0 | 秒間減衰量 |
| `hungerCriticalThreshold` | 20 | 臨界域（以下でHPダメージ） |
| `hungerDamageInterval` | 3.0 | ダメージ間隔（秒） |
| `hungerDamageAmount` | 1 | 1回あたりのHPダメージ |

### 近接攻撃

| パラメータ | 初期値 | 説明 |
|-----------|--------|------|
| `meleeDamage` | 1 | 基本ダメージ |
| `meleeRange` | 60 | 攻撃範囲（ピクセル） |
| `meleeCooldown` | 0.35 | クールダウン（秒） |
| `meleeArc` | 1.2 | 攻撃弧の角度（ラジアン） |
| `meleeActiveRatio` | 0.6 | 攻撃判定有効比率 |
| `meleeVerticalRatio` | 0.4 | 縦方向拡張比率 |
| `meleeCollisionGrace` | 0 | 衝突判定グレース（0=厳密） |

### XP/レベルシステム

| パラメータ | 初期値 | 説明 |
|-----------|--------|------|
| `xpPerKill` | 25 | 敵撃破時のXP獲得量 |
| `xpPerLevel` | 100 | レベル1→2に必要なXP |
| `xpLevelScale` | 1.5 | レベルごとのXP増加倍率 |
| `levelUpHealHp` | 2 | レベルアップ時のHP回復量 |
| `levelUpDamageBonus` | 1 | レベルアップ時のATK増加量 |

### アイテム

| パラメータ | 初期値 | 説明 |
|-----------|--------|------|
| `foodRestore` | 30 | 食料のhunger回復量 |
| `foodDropChance` | 0.35 | 食料ドロップ確率 |
| `weaponDropChance` | 0.15 | 武器ドロップ確率 |
| `weaponUpgradeAmount` | 1 | 武器のATK増加量 |

### VFX

| パラメータ | 初期値 | 説明 |
|-----------|--------|------|
| `meleeHitParticleCount` | 4 | 攻撃パーティクル数 |
| `meleeHitParticleSpeedMin` | 60 | 攻撃パーティクル最小速度 |
| `meleeHitParticleSpeedMax` | 140 | 攻撃パーティクル最大速度 |
| `meleeHitParticleLife` | 0.3 | 攻撃パーティクル寿命（秒） |
| `meleeHitParticleColor` | `#ffcc00` | 攻撃パーティクル色 |
| `meleeHitParticleSize` | 3 | 攻撃パーティクルサイズ |
| `meleeSwingStrokeColor` | `#ffdd00` | 攻撃弧の線色 |
| `meleeSwingLineWidth` | 3 | 攻撃弧の線幅 |
| `meleeSwingShadowColor` | `#ffaa00` | 攻撃弧のシャドウ色 |
| `meleeSwingShadowBlur` | 8 | 攻撃弧のシャドウぼかし |
| `levelUpParticleCount` | 24 | レベルアップパーティクル数 |
| `levelUpParticleSpeedMin` | 80 | レベルアップパーティクル最小速度 |
| `levelUpParticleSpeedMax` | 200 | レベルアップパーティクル最大速度 |
| `levelUpParticleLife` | 0.8 | レベルアップパーティクル寿命（秒） |
| `levelUpParticleColors` | `["#ffdd00", ...]` | レベルアップパーティクル色リスト |
| `levelUpParticleSize` | 4 | レベルアップパーティクルサイズ |
| `levelUpShakeIntensity` | 0.4 | レベルアップ振動強度倍率 |
| `levelUpPopupColor` | `#ffdd00` | レベルアップポップアップ色 |

### HUD

| パラメータ | 初期値 | 説明 |
|-----------|--------|------|
| `hudBarHeight` | 8 | バーの高さ |
| `hudTextSize` | 12 | テキストサイズ |
| `hudTopOffset` | 10 | 上マージン |
| `hudBarWidth` | 140 | バーの幅 |
| `hudLabelColor` | `#aabb88` | ラベル色 |
| `hudHungerColorHigh` | `#66aa44` | hunger高時色 |
| `hudHungerColorMid` | `#ccaa22` | hunger中時色 |
| `hudHungerColorLow` | `#cc3300` | hunger低時色 |
| `hudBarBgColor` | `rgba(255,255,255,0.15)` | 背景バー色 |
| `hudXpTextColor` | `#888866` | XPテキスト色 |
| `hudXpBarColor` | `#6688cc` | XPバー色 |
| `hudAtkTextColor` | `#ccaa66` | ATKテキスト色 |
| `hudPanelBgColor` | `rgba(0,0,0,0.55)` | パネル背景色 |
| `hudPanelPadding` | 8 | パネルパディング |
| `hudPanelRadius` | 4 | パネル角丸半径 |

### ポップアップ

| パラメータ | 初期値 | 説明 |
|-----------|--------|------|
| `foodPopupColor` | `#88cc44` | 食料収集ポップアップ色 |
| `weaponPopupColor` | `#cc8844` | 武器収集ポップアップ色 |

## 動作フロー

### hunger減衰

1. 毎フレーム `hunger -= hungerDecayRate * dt`
2. `hunger <= hungerCriticalThreshold` の場合、`hungerDamageInterval` 毎に `hungerDamageAmount` のHPダメージ
3. 1フレームで最大1回のダメージに制限（dtが大きい場合でも多重適用しない）

### 近接攻撃

1. Zキー入力 + クールダウン切れ → 攻撃開始
2. `meleeActive = meleeCooldown * meleeActiveRatio` 間、攻撃判定有効
3. 攻撃範囲内の敵に `weaponDamage` のダメージ
4. 敵撃破時、XP付与 + パーティクル演出

### XP/レベルシステム

1. 敵撃破で `xpPerKill` のXP獲得
2. `xp >= nextLevelXp` でレベルアップ
3. レベルアップで `levelUpHealHp` のHP回復 + `levelUpDamageBonus` のATK増加
4. `nextLevelXp = xpPerLevel * xpLevelScale^(level-1)` で次のレベルの要件計算
5. 無限ループ防止のため最大100回のレベルアップを1フレームで許可

### アイテムドロップ

1. 敵撃破時、`foodDropChance` / `weaponDropChance` でドロップ判定
2. 食料: hungerを `foodRestore` 回復
3. 武器: weaponDamageを `weaponUpgradeAmount` 増加

## 既知の制限

- `drawPlayer` / `drawFarLayer` / `drawMidLayer` のビジュアルパラメータはJSON未駆動（ジャンル固有の視覚表現のため）
- 左方向ハザードのスポーン位置は `cameraX - hazardW - offset` で固定（config化未対応）

## 将来の拡張

- `drawPlayer` のJSON駆動化（`GenreVisualConfig` 拡張）
- 左方向ハザードのスポーンパラメータconfig化
- 追加のhunger効果（移動速度低下、ジャンプ力低下など）
- 武器の種類追加（遠距離武器、範囲攻撃など）
