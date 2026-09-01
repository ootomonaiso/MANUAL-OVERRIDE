# 03. ダメージ計算

対象範囲: 設計文書「属性システム」「カット率」「ダメージ計算の流れ」「回復の計算の流れ」「回避率」「命中判定」「相性段階」「スタック規則」

---

## 属性

```ts
export type Element = 'physical' | 'magical' | 'special'
```

| 属性 | 弱点・耐性 | カット率の参照元 |
|---|---|---|
| `physical` | あり | `def` の実効値 |
| `magical` | あり | `ref` の実効値 |
| `special` | **なし（常に等倍）** | `(def + ref) / 4` |

**サポート系スキルも属性を持つ**（回復・シールド・バフを含む）。「魔法属性の効果を上昇させる」特性をサポート系にも適用できるようにするため。

**属性と参照ステータスは独立**である。「魔法属性だが `str` を参照する」スキルを許容する。

```ts
export function defenseValueFor(element: Element, stats: EffectiveStats): number {
  switch (element) {
    case 'physical': return stats.def
    case 'magical':  return stats.ref
    case 'special':  return (stats.def + stats.ref) / 4
  }
}
```

---

## カット率

```
カット率 = (防御ステータス - 1000) / 20000     ※下限 0%、上限 80%
```

| 防御ステータス | カット率 |
|---|---|
| 1000 以下 | 0%（下限。被ダメージが等倍を超えることはない） |
| 1000 | 0% |
| 11000 | 50% |
| 17000 以上 | 80%（上限） |

```ts
export function cutRateFromDefense(defenseValue: number): number {
  const raw = (defenseValue - BATTLE.cut.anchor) / BATTLE.cut.divisor
  return clamp(raw, 0, BATTLE.cut.max)   // 0 〜 0.8
}
```

定数は `battle.json`:

```jsonc
{
  "cut": { "anchor": 1000, "divisor": 20000, "max": 0.8 },
  "evade": { "anchor": 1000, "divisor": 50000, "max": 0.8 },
  "affinity": { "weakStage": 1, "resistStage": -1 },
  "guard": { "cutRate": 0.5, "cooldown": 3 },
  "dodge": { "evadeBonus": 0.5, "cooldown": 3 },
  "shield": { "cutRate": 0.2, "cutRateVsSpecial": 0.4 }
}
```

### 最終カット率（加算スタック）

ステータス由来・特性由来・シールド由来のカット率を**すべて加算**し、最後に 80% でクランプする。

```ts
export function computeFinalCutRate(
  element: Element,
  target: EffectiveStats,
  traitCutRates: readonly number[],
  shieldCutRate: number,
  guardCutRate: number,
): number {
  const statCut = cutRateFromDefense(defenseValueFor(element, target))
  const sum = statCut
    + traitCutRates.reduce((a, b) => a + b, 0)
    + shieldCutRate
    + guardCutRate
  return clamp(sum, 0, BATTLE.cut.max)
}
```

> **設計文書の「別枠で計算する」との関係**: 各源のカット率は**それぞれ独立に算出**する（ステータス由来は防御値から、特性由来は定義値から、シールドは固定値から）。それらを**最後に加算**して 80% でクランプする。「別枠」は算出方法が別という意味であり、合成は加算である。

### 「守る」のカット率

「守る」は使用ターンのみ **+50% の実数バフ**をカット率に与える。上式の `guardCutRate` に入り、**80%上限の対象に含まれる**。

---

## 相性段階

弱点・耐性は倍率を直接重ねず、**段階として加算**してから倍率に変換する。

```
相性段階     = (弱点の数) - (耐性の数)
属性相性倍率 = 2 ^ 相性段階
```

| 状況 | 段階 | 倍率 |
|---|---|---|
| なし | 0 | ×1 |
| 弱点1つ | +1 | ×2 |
| 耐性1つ | -1 | ×0.5 |
| 弱点1 + 耐性1 | 0 | ×1（打ち消し） |
| 耐性2つ | -2 | ×0.25 |
| 弱点3つ | +3 | ×8 |

```ts
export function computeAffinityStage(
  element: Element,
  targetTraits: readonly OwnedTrait[],
): number {
  if (element === 'special') return 0   // 特殊は弱点・耐性が存在しない
  let stage = 0
  for (const t of targetTraits) {
    for (const eff of t.effects) {
      if (eff.op !== 'elementAffinity' || eff.element !== element) continue
      stage += eff.affinity === 'weak' ? BATTLE.affinity.weakStage
                                       : BATTLE.affinity.resistStage
    }
  }
  return stage
}

export function affinityMultiplier(stage: number): number {
  return Math.pow(2, stage)
}
```

**現状、相性段階に上限・下限のクランプは設けない**（設計文書「調整の余地」参照）。将来必要になれば `battle.json` に `stageMin` / `stageMax` を追加する。

> **特殊属性は段階を常に 0 とする。** 弱点・耐性の特性が対象に付いていても、`special` に対しては無効。

---

## スタック規則の一覧

**同じ項目の補正は必ず加算で合成する（例外なし）。**

| 項目 | 合成 |
|---|---|
| 倍率バフ | 加算（`1 + Σ`） |
| 効果倍率 | 加算（`1 + Σ`） |
| 最終カット率 | 加算（上限80%でクランプ） |
| 被回復倍率 | 加算（`1 + Σ`） |
| **相性段階** | **加算**（段階を足す。倍率は `2^段階` で後から変換） |

「相性だけ乗算」ではない点に注意する。**加算する対象が倍率ではなく段階**というだけで、規則は統一されている。

---

## ダメージ計算の流れ

**攻撃側で完結する部分**と**対象側の影響を受ける部分**を、別の関数に分ける。

```
── 攻撃側 ──────────────────────────────────────
  参照値       = 参照ステータスの実効値
  基本ダメージ = 参照値 × スキル係数
  送出ダメージ = 基本ダメージ × クリティカル倍率 × 効果倍率

── 対象側 ──────────────────────────────────────
  被ダメージ倍率 = 1 - 最終カット率
  最終ダメージ   = 送出ダメージ × 被ダメージ倍率 × 属性相性倍率
```

```ts
/** 攻撃側で確定する値を算出する（対象に依存しない） */
export function computeOutgoingDamage(params: {
  referenceValue: number
  scaleRate: number
  critMultiplier: number
  effectMultiplier: number
}): number {
  return params.referenceValue * params.scaleRate
       * params.critMultiplier * params.effectMultiplier
}

/** 対象側の補正を適用して最終ダメージを得る */
export function computeFinalDamage(params: {
  outgoingDamage: number
  finalCutRate: number
  affinityStage: number
}): number {
  return params.outgoingDamage
       * (1 - params.finalCutRate)
       * affinityMultiplier(params.affinityStage)
}
```

**弱点・耐性はカット率を適用した後、最後に乗算する。** これにより、防御を固めていても弱点を突かれれば軽減効果が実質半減する。

### 計算例（検算済み）

| 前提 | 値 |
|---|---|
| `str` の基礎値 | 1000 |
| パッシブ | `STR +300`（実数）/ `STR +5%`（倍率） |
| 特性 | 物理攻撃 +50% |
| スキル | 物理属性・`str` を100%参照 |
| 対象 | 物理弱点持ち・`def` = 2000 |
| クリティカル | 発生せず |

```
STRの実効値   = (1000 + 300) × 1.05  = 1365
基本ダメージ   = 1365 × 1.00          = 1365
送出ダメージ   = 1365 × 1 × 1.5       = 2047.5

最終カット率   = (2000-1000)/20000    = 0.05
被ダメージ倍率 = 1 - 0.05             = 0.95
相性段階       = +1
属性相性倍率   = 2^1                  = 2
最終ダメージ   = 2047.5 × 0.95 × 2    = 3890.25

切り捨て       = 3890  ← HPから引かれる値
```

---

## 回復の計算の流れ

回復も「回復元側で確定 → 対象側の補正」という**同じ形**をとるが、**対象側で適用する補正の中身が異なる**。

```
確定回復量 = 参照値 × スキル係数 × クリティカル倍率 × 効果倍率
最終回復量 = 確定回復量 × 被回復倍率
```

**回復には最終カット率も属性相性倍率も適用しない。**

| 適用しない理由 | |
|---|---|
| カット率 | `def` が高いほど回復量が減るという逆転が起きる |
| 属性相性 | 「物理弱点」を自分で取得し物理属性の回復を使うと2倍になり、**弱点を取ることが最適解**になる |

```ts
export function computeFinalHeal(params: {
  outgoingHeal: number
  healTakenMultiplier: number   // 1 + Σ(被回復補正)
}): number {
  return params.outgoingHeal * params.healTakenMultiplier
}
```

回復スキルも属性を持つため、**回復元側の効果倍率**（「魔法属性の効果+50%」等）は通常どおり適用される。

シールド付与も回復と同じ扱いとする（クリティカル・効果倍率が乗り、カット率・属性相性は乗らない）。

---

## 命中判定

```
実効命中率 = 命中率の実効値 × (1 - 回避率の実効値)     ※0〜100%にクランプ
```

```ts
export function computeHitChance(
  attackerHitRate: number,   // 実効値。100%超えを許容
  targetEvadeRate: number,   // 実効値。0〜0.8 にクランプ済み
): number {
  return clamp(attackerHitRate * (1 - targetEvadeRate), 0, 1)
}
```

ダメージ計算の `× (1 - 最終カット率)` と**同じ構造**であり、「防御側のステータスが割合で減らす」形が全体で統一される。

| 命中率 | 回避率 | 実効命中率 |
|---|---|---|
| 95% | 0% | 95% |
| 95% | 50% | 47.5% |
| 95% | 80% | 19% |
| 130% | 50% | 65% |
| 130% | 80% | 26% |

### 命中率の100%超え

**`hitRate` は100%を超えてよい。** ただし超過分は**ダメージを増やさない**。回避率と打ち消し合いやすくなるだけである。

> **実装上の注意**: クランプするのは `実効命中率`（積の結果）であって、`hitRate` 自体ではない。`hitRate` の時点で 1.0 に丸めると回避特化への対抗手段が失われる（設計文書「実装上の注意点 4」）。

### 判定の単位

**命中判定はヒットごとに個別に行う**（属性相性と同じ）。

多段ヒットスキルは回避持ちに対して安定し、単発の大技はギャンブルになる。

### 外れた場合

**救済措置は設けない。** かすり（半減ダメージ）も命中率の下限保証も導入しない。クールタイム3の大技が外れれば3ターン分が無駄になる。

命中判定に失敗したヒットは、**ダメージ・効果を一切適用せず、`fx_miss` エフェクトのみ再生する**。

### 回復・バフに命中判定はない

自分または味方を対象とする回復・シールド・バフは**命中判定を行わない**（常に成功）。

命中判定を行うのは、**敵を対象とする効果**（ダメージ・デバフ）のみとする。

> **決定（Q1）**: 自己回復が命中率で失敗するのは不自然であり、「避ける」で自分の回避率を上げたら自己回復が当たらなくなるという矛盾も生じるため、**回復・バフ・シールド付与には命中判定を行わない**。

---

## 丸め処理

**丸めは「HPを増減させる直前」に1回だけ行い、方式は切り捨て（floor）とする。**

```ts
export function applyDamage(target: Combatant, rawDamage: number): number {
  const applied = Math.floor(rawDamage)
  // シールドを優先的に消費（05-skills.md 参照）
  ...
}
```

- 対象はダメージ・回復の**両方**（HPが動くすべての箇所）
- ステータス実効値・カット率・各種倍率といった**中間値は丸めない**
- 途中で丸めないため、乗算の順序を入れ替えても結果は変わらない

クランプも同様に**最終値に対してのみ**適用する。回避率は `agi` から導出した基礎値の時点ではクランプせず、実数バフ・倍率バフを適用した後の実効値でのみクランプする。

---

## エッジケース

| ケース | 扱い |
|---|---|
| 最終ダメージが 0〜1 の間 | 切り捨てで 0 になる。**0ダメージとして扱う**（最低1保証は設けない）。カット率上限80%があるため、極端な差でのみ発生する |
| 最終ダメージが負 | 発生しない（各倍率は 0 以上、カット率は 80% 上限）。ただし防御的に `Math.max(0, ...)` を通す |
| 相性段階が大きく負（耐性多数） | `2^-3 = 0.125` 等。倍率は 0 にならないため、常に微小ダメージは通る |
| HPが最大値を超える回復 | 最大HPでクランプする |
| シールドが最終ダメージを上回る | シールドのみ減り、HPは減らない（[05-skills.md](05-skills.md)） |
| 対象が既に戦闘不能 | 効果を適用しない。多段ヒットの途中で撃破された場合、**残りのヒットは別の対象へ移らず消滅する** |

---

## 影響を受ける既存ファイル

| ファイル | 変更 |
|---|---|
| `src/domain/battle/damageCalc.ts` | 新規 |
| `src/data/config/battle.json` | 新規。上記の定数群 |

すべて純粋関数として実装し、Vue・DOM に依存させない（ユニットテストのため）。

---

## 実装後の記録

（実装完了後に追記）
