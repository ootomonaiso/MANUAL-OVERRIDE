# 02. ステータスと実効値

対象範囲: 設計文書「ステータス（10種）」「実効値の計算方式（共通ルール）」「計算値の名称（用語定義）」

---

## ステータスの型定義

```ts
/** 戦闘で使う10ステータス */
export interface BattleStats {
  hp: number
  str: number
  def: number
  int: number
  ref: number
  agi: number
  hitRate: number              // 命中率（1.0 = 100%）
  evadeRate: number            // 回避率（1.0 = 100%）
  critRate: number             // クリティカル率
  critDamageMultiplier: number // クリティカルダメージ倍率
}

export type StatKey = keyof BattleStats
```

割合系（`hitRate` / `evadeRate` / `critRate` / `critDamageMultiplier`）は**小数**で保持する（95% は `0.95`）。表示時に `%` へ変換する。

## 初期値

| ステータス | 初期値 |
|---|---|
| `hp` | 6000〜8000 のランダム |
| `str` / `def` / `int` / `ref` / `agi` | 600〜800 のランダム |
| `hitRate` | `0.95`（固定） |
| `evadeRate` | 導出値のため基礎値を持たない（後述） |
| `critRate` | `0.05`（固定） |
| `critDamageMultiplier` | `2.0`（固定） |

ただし**初期スキルに対応する攻撃ステータスのみ 700〜900**。

| 初期スキル | 優遇 |
|---|---|
| 叩く（物理） | `str` が 700〜900 |
| ファイアボール（魔法） | `int` が 700〜900 |

範囲は `src/data/config/battle.json` に置き、ハードコードしない。

```jsonc
{
  "initialStats": {
    "hpMin": 6000, "hpMax": 8000,
    "baseMin": 600, "baseMax": 800,
    "favoredMin": 700, "favoredMax": 900,
    "hitRate": 0.95,
    "critRate": 0.05,
    "critDamageMultiplier": 2.0
  }
}
```

> **注意**: `hp` だけスケールが1桁大きい。ステータスを一律のループで生成すると `hp` が他と同じ桁になるため、**`hp` を特別扱いすること**（設計文書「実装上の注意点 8」）。

---

## 実効値

### 共通式

```
実効値 = (基礎値 + 実数バフ) × 倍率バフ
```

```ts
export interface StatModifier {
  flat: number   // 実数バフの合計
  mult: number   // 倍率バフ（加算スタック済みの最終倍率。補正なしなら 1）
}

export function computeEffective(base: number, mod: StatModifier): number {
  return (base + mod.flat) * mod.mult
}
```

### 倍率バフは加算スタック

**同種の倍率は加算してから1回だけ乗算する。**

```
倍率バフ = 1 + Σ(各補正の倍率分)
```

> 例: `STR +5%` のパッシブを2つ → `1 + 0.05 + 0.05 = 1.10`（`1.05 × 1.05 = 1.1025` **ではない**）

```ts
/** 倍率補正のリストから最終倍率を得る（加算スタック） */
export function stackMultipliers(rates: readonly number[]): number {
  return 1 + rates.reduce((sum, r) => sum + r, 0)
}
```

### 基礎値の決まり方

| 種別 | 対象 | 基礎値 |
|---|---|---|
| ランダム初期値 | `hp` `str` `def` `int` `ref` `agi` | 上表の範囲で生成 |
| 固定初期値 | `hitRate` `critRate` `critDamageMultiplier` | 固定値 |
| **導出値** | `evadeRate` | `agi` の実効値から導出 |

### `evadeRate` の非対称性

`evadeRate` だけは基礎値を保持せず、**`agi` の実効値から都度導出する**。

```
回避率の基礎値 = (AGIの実効値 - 1000) / 50000
回避率の実効値 = (回避率の基礎値 + 実数バフ) × 倍率バフ     ※0〜0.8 にクランプ
```

```ts
export function deriveEvadeBase(agiEffective: number): number {
  return (agiEffective - BATTLE.evade.anchor) / BATTLE.evade.divisor
}
```

したがって `BattleStats` の `evadeRate` フィールドは**基礎値の保持には使わない**。

> **実装方針**: `BattleStats` は基礎値の器として使い、`evadeRate` は常に 0 を入れておく（未使用）。実効値の算出時にのみ `deriveEvadeBase()` を通す。型から外さないのは、詳細表示で「回避率」を10ステータスの1つとして並べるため。

### クランプ

**クランプは最終の実効値に対してのみ適用する。** 途中の導出値ではクランプしない。

| 値 | 下限 | 上限 |
|---|---|---|
| カット率 | 0% | 80% |
| 回避率 | 0% | 80% |
| 実効命中率 | 0% | 100% |

`hitRate` そのものは**クランプしない**（100%超えを許可する。クランプ対象は `命中率 × (1 - 回避率)` の結果である実効命中率）。

```ts
export function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v))
}
```

---

## カット率は10ステータスに含まれない

カット率は `def` / `ref` の実効値から**都度計算される中間結果**であり、それ自体に実数バフ・倍率バフは乗らない。`BattleStats` のフィールドとして持たない。

カット率そのものを強化する手段は次の2つ:

1. 参照元の `def` / `ref` の実効値を上げる
2. 特性・シールドによる**別枠のカット率**を追加する（[03-damage-calc.md](03-damage-calc.md)）

---

## 補正の収集

実効値の算出には、その時点で有効なすべての補正を集める必要がある。

```ts
/** あるステータスに対する補正を、所持物すべてから収集する */
export function collectModifier(
  statKey: StatKey,
  passives: readonly OwnedPassive[],
  traits: readonly OwnedTrait[],
  temporary: readonly TemporaryModifier[],
): StatModifier
```

収集元:

| 源 | 例 |
|---|---|
| パッシブスキル | `{ op: "statBoost", stat: "def", amount: 800 }` |
| 特性 | 「STRが20%上昇する代わりに〜」 |
| 一時効果 | 「守る」「避ける」、スキルによるバフ・デバフ |

パッシブ・特性の効果量には**スキルレベルの倍率**が乗る（[06-draft.md](06-draft.md)）。

```
補正値 = 定義された基礎量 × (2 ^ レベル - 1)
```

> Lv1 なら `×1`、Lv2 で `×3`、Lv3 で `×7`、Lv4 で `×15`。特性は常に Lv1 相当（`×1`）。

---

## 用語（計算値の名称）

設計文書「計算値の名称」で定義された名称を、実装でもそのまま使う。

| 名称 | 実装上の名前 | 意味 |
|---|---|---|
| 基礎値 | `base` | ステータスの出発点 |
| 実数バフ | `flat` | 加算・減算補正 |
| 倍率バフ | `mult` | 倍率補正（加算スタック済み） |
| ステータス実効値 | `effective` | `(base + flat) × mult` |
| 参照値 | `referenceValue` | スキルが参照するステータスの実効値 |
| スキル係数 | `scaleRate` | スキルの参照割合 |
| 基本ダメージ | `baseDamage` | `参照値 × スキル係数` |
| クリティカル倍率 | `critMultiplier` | 発生時のみ `critDamageMultiplier`、非発生時 `1` |
| 効果倍率 | `effectMultiplier` | 攻撃側の特性・パッシブ倍率（加算スタック） |
| 送出ダメージ | `outgoingDamage` | 攻撃側で確定する値 |
| 最終カット率 | `finalCutRate` | 対象側カット率の合計（上限80%） |
| 被ダメージ倍率 | `damageTakenMultiplier` | `1 - finalCutRate` |
| 相性段階 | `affinityStage` | 弱点`+1` / 耐性`-1` の合計（整数） |
| 属性相性倍率 | `affinityMultiplier` | `2 ^ affinityStage` |
| 最終ダメージ | `finalDamage` | HPから引かれる値 |
| 確定回復量 | `outgoingHeal` | 回復における送出ダメージ相当 |
| 被回復倍率 | `healTakenMultiplier` | 対象側の被回復補正（加算スタック） |
| 最終回復量 | `finalHeal` | HPへ加算される値 |

---

## エッジケース

| ケース | 扱い |
|---|---|
| `mult` が 0 以下になる補正 | 理論上ありうる（`-100%` の倍率デバフ）。**0 でクランプする**（負のダメージ・負のステータスを防ぐ） |
| `hp` の実効値が現在HPを下回る | 最大HPが減少するケース。**現在HPを新しい最大HPでクランプする** |
| `agi` の実効値が 1000 未満 | 回避率の基礎値が負になる。**実効値のクランプ（下限0%）で吸収される**。途中の導出値ではクランプしない |
| 補正が1つもない | `flat = 0` / `mult = 1` を返す。`(base + 0) × 1 = base` |

---

## 影響を受ける既存ファイル

| ファイル | 変更内容 |
|---|---|
| `src/data/config/battle.json` | 新規。初期値範囲・アンカー・クランプ上限 |
| `src/framework/config-types.ts` | `BattleConfig` 型を追加 |
| `src/data/tunables.ts` | `BATTLE` を export |
| `src/framework/ConfigValidator.ts` | `battle` を必須セクションに追加 |

既存の `Player` クラス（`src/game/entities.ts`）は**変更しない**。戦闘用のステータスは `BattleState` 側で独立して保持する（[10-state.md](10-state.md)）。

---

## 実装後の記録

（実装完了後に追記）
