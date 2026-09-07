# 06. ドラフト・スキルポイント制度・カテゴリ

対象範囲: 設計文書「スキル獲得（撃破後のドラフト）」「カテゴリとカテゴリ特化」

> **2026-09-05（第7フェーズ）で刷新。** 当初は「重複取得でスタックが貯まりレベルが上がる」方式
> だったが、ドラフト候補の母数が大きく狙ったスキルを引き直せる確率が低いため、実質レベルが
> 上がりにくいという問題があった。**ドラフト運＝レベルという構造を廃止し、確定配布のポイント制**
> （5戦ごとのスキルパネル、下記）へ移行した。本ドキュメントは刷新後の仕様を記す
> （刷新の背景・設計判断は `CLAUDE_TASKS.md` 第7フェーズに詳細記録）。

---

## ドラフト

敵を全滅させると**3つの選択肢**が提示され、1つを選んで獲得する。選択肢にはアクティブスキル・パッシブスキル・特性が並ぶ。

```ts
export interface DraftOption {
  kind: SkillKind                 // 'active' | 'passive' | 'trait'
  id: string
  /** セット中アクティブの重複候補（isDuplicate）時のみ。選択前の現在レベル・累計ポイント */
  currentLevel?: number
  currentPoints?: number
  /** セット中アクティブの重複候補か（選ぶと+1ポイント） */
  isDuplicate?: boolean
  /** カテゴリ特化で解放された特別枠か */
  isUnlocked?: boolean
  /** 打ち止め時のフォールバック（ステータス微増）か */
  isFallback?: boolean
  fallbackStat?: StatKey
}

export function rollDraft(player: Combatant, content: BattleContent, rng: () => number): DraftOption[]  // 常に3件
```

### 候補の決まり方

| 種別 | 候補になる条件 |
|---|---|
| アクティブスキル（新規・未所持） | 常に候補。選ぶと空き枠へ自動セット、無ければ倉庫へ保管（後述） |
| アクティブスキル（重複） | **セット中（装備済み）のみ**。倉庫保管中は二度と候補に出ない。Lv4未満。通常候補より`duplicateDraftWeight`倍（既定3倍）の重みで出現し、選ぶと+1ポイント |
| パッシブスキル | **未所持のもののみ**。一度でも所持したら以後永久に候補から除外される（重複が発生しない） |
| 特性 | **未取得のもののみ**（重複しない） |
| カテゴリ特化枠 | 該当カテゴリのポイントがしきい値に達している |

`draftable: false` を持つスキル・特性は候補プール構築の最初の段階で除外される
（`buildCandidatePool` 冒頭）。通常はドラフトに出ないだけで入手経路自体が無いとは限らない
（例: 自摸。詳細は末尾「実装後の記録（第8フェーズ）」）。

### 打ち止め時のフォールバック

獲得できるものが尽きた場合、**基本6ステータスのいずれかをランダムに微増させる**選択肢で3枠を埋める。

```jsonc
{ "fallbackStatBoost": { "hp": 900, "other": 90 } }   // battle.json。暫定値（第8フェーズで400/40から引き上げ）
```

`hp` だけスケールが1桁大きいため、増加量も分ける。

### 重複しない3件

**同じ選択肢が3枠に重複して出ないこと。** 抽選時に既に選ばれたものを除外する。

候補が3件に満たない場合はフォールバックで埋める。

---

## アクティブスキルの所持形態（セット中／倉庫保管中）

アクティブ枠は4つ。ドラフトで新規アクティブを選ぶと、**空き枠があれば自動でセット**され、
**空きが無ければ、その場で入れ替えを迫らず黙って倉庫（`slotIndex: null`）へ保管**される。
ドラフト起因で入れ替え画面へ割り込むことはない（第7フェーズで廃止）。

入れ替え（セット中⇔倉庫保管中）は**5戦ごとのスキルパネル**（下記）でのみ行う。

```ts
export interface OwnedActive {
  id: string
  points: number         // 投資済みポイント（累計）
  level: number           // levelForPoints(points) と同期する実効レベル
  cooldown: number
  slotIndex: number | null   // null = 倉庫保管中
}
```

**倉庫保管中のアクティブはドラフト候補に一切出ない**（＝重複取得が発生しない）。
再びセットするとポイント・レベルは保ったまま復帰する（パネルでの入れ替えは全額保持、
「外す」操作だけがポイントを未配分プールへ還元する）。

保管中のスキルは**カテゴリポイントに寄与しない**（Q9の決定を維持）。

---

## スキルポイント制度

**確定配布のポイントでレベルが上がる。** ドラフト運に左右されない。

### レベルは累計投資ポイントから決まる

```ts
// src/data/config/skill_points.json（pointsForLevel。index=レベル-1、値=そのレベルへの必要累計値）
{ "pointsForLevel": [0, 1, 3, 7] }

export function levelForPoints(points: number): number   // 1〜4
```

| レベル | 累計必要ポイント |
|---|---|
| Lv1 | 0（装備した瞬間から無料） |
| Lv2 | 1 |
| Lv3 | 3 |
| Lv4（MAX） | 7 |

> **第8フェーズで変更（旧記述を訂正）**: 当初は「`pointsForLevel` は `2^(L-1)-1` の形で、既存の効果倍率
> `2^L-1` と同じ数列だから効果倍率自体は変更しない」としていたが、**この前提は覆った。**
> `pointsForLevel`（必要ポイントのテーブル）は変わっていないが、**効果倍率（`levelMultiplier`）は
> 別の緩やかな式に置き換えられた。** 両者は第8フェーズで完全に分離された。詳細・理由は末尾
> 「実装後の記録（第8フェーズ）」を参照。

```ts
// src/domain/battle/stats.ts（現行）
export function levelMultiplier(level: number): number {
  return 1 + (level - 1) * SKILL_POINTS.levelMultiplierStep   // levelMultiplierStep 既定0.25
}
```

```
倍率 = 1 + (レベル - 1) × levelMultiplierStep     → Lv1: ×1 / Lv2: ×1.25 / Lv3: ×1.5 / Lv4: ×1.75（既定値の場合）
```

### ポイントの入手経路

1. **ドラフトでの重複取得**（セット中アクティブのみ、通常候補よりduplicateDraftWeight倍の重みで出現）: 選ぶと即座に+1ポイント
2. **5戦ごとのスキルパネル**: `panelSkillPointsCycle`（既定`[1, 2]`。パネル出現回数で周期参照、第9フェーズ）を未配分プールへ付与し、セット中の任意のアクティブへ自由配分できる（Lv4上限）
3. **倉庫へ外した際の還元**: 外した瞬間、投資済みポイントが全額プールへ戻る（`points:0`・Lv1に戻る）

### パッシブ: レベル・スタックの概念を廃止

**パッシブは「所持しているか否か」の二値のみ。** 一度でも所持したら以後永久にドラフト候補から
除外される（重複が二度と出ない）。効果は常に `effect[]` の値をそのまま適用する
（レベル倍率を一切掛けない＝常に等倍）。

```ts
export interface OwnedPassive {
  id: string
  level: number   // 敵の所持パッシブの強さ調整用に残すフィールド。プレイヤー取得分は常に1固定
}
```

---

## 5戦ごとのスキルパネル

**通常のドラフト（ボス撃破時は3連続ドラフト）がすべて終わった後**、`panelIntervalBattles`
（既定5）戦ごとに追加でパネル画面が挟まる（`status: 'skillPanel'`）。ドラフトの代替ではない。

パネルで得られるもの: **スキルポイント`panelSkillPointsCycle`（既定`[1, 2]`、パネル出現1回目=1・
2回目=2・3回目=1…と周期で繰り返す。第9フェーズで固定3から変更。5戦目終了時点でLv3が
確定してしまうのを避けるため）・ステータスポイント`panelStatPoints`（既定5。第8フェーズで3から
引き上げ）**。

パネルでできること:

1. **アクティブの入れ替え**（セット中⇔倉庫保管中）。外すと投資済みポイントが全額還元される
2. **未配分のスキルポイントを、セット中のスキルへ自由配分・引き戻し可能**（Lv4上限。
   `allocateSkillPoint`/`deallocateSkillPoint`、第9フェーズ）
3. **ステータスポイントを6成長ステータス（HP/STR/DEF/INT/REF/AGI）へ自由配分**。
   いつでも何度でも組み替え・リセット可能（`player.temporary` の `permanent` スコープ補正として
   反映され、`fallbackStatBoost` と同じ1ポイントあたりの増加量を使う）

```ts
export interface BattleState {
  // ...
  skillPoints: number
  statAllocations: Record<GrowthStatKey, number>
  statPoints: number
}
```

入れ替え画面（`status: 'swapping'`）はパネルから起動した時だけ発生し、確定・キャンセルの
どちらでもパネルへ戻る（ドラフト起因の `'swapping'` は廃止された）。

---

## カテゴリ

### 11種

| カテゴリ | ID | 対応 |
|---|---|---|
| 頑強 | `vitality` | `hp` |
| 守勢 | `guard` | `def` / `ref` |
| 剛撃 | `might` | `str` |
| 明晰 | `wisdom` | `int` |
| 疾風 | `swift` | `agi` |
| 致命 | `fatal` | `hitRate` / `critRate` / `critDamageMultiplier` |
| 治癒 | `heal` | 回復系 |
| 加護 | `aegis` | シールド系 |
| 呪詛 | `curse` | デバフ・弱点付与 |
| 貫通 | `pierce` | 特殊属性・カット率踏み倒し |
| 連撃 | `combo` | 多段ヒット |

```ts
export type CategoryId =
  | 'vitality' | 'guard' | 'might' | 'wisdom' | 'swift' | 'fatal'
  | 'heal' | 'aegis' | 'curse' | 'pierce' | 'combo'
```

### メイン/サブ

1つのスキルは**メインカテゴリを常に1つ**持ち、**サブカテゴリを0個以上**持つ。特性はカテゴリを持たない。

| | 決め方 |
|---|---|
| **メイン** | **効果の形**で決める（多段→連撃、回復→治癒、シールド→加護、デバフ/弱点付与→呪詛、特殊属性/カット率踏み倒し→貫通） |
| メイン（形がない場合） | 単純なステータス上昇のみのスキルは、上昇させるステータスに対応するカテゴリ |
| **サブ** | そのスキルが**参照するステータス**に対応するカテゴリ |

> 例: `str` 参照の3連撃 → メイン `combo`、サブ `might`
> 例: `int` 参照のシールド付与 → メイン `aegis`、サブ `wisdom`
> 例: `def` を上げるだけのパッシブ → メイン `guard`、サブなし

サブは**原則1個まで**。拡張性のため2個を持つ特別なスキルを作れる余地は残す。

### カテゴリポイント

**基礎ポイント（レベル比例）**:

| 種別 | Lv1 | Lv2 | Lv3 | Lv4 | 式 |
|---|---|---|---|---|---|
| アクティブ | 3 | 6 | 9 | 12 | `3 × レベル` |
| パッシブ | 1 | ― | ― | ― | `1 × レベル`（レベルは常に1固定） |

**サブカテゴリへの重み**:

```
サブカテゴリ合計重み T(N) = 0.75 - 0.25 × (N - 2)²
各サブカテゴリの重み       = T(N) / N
```

| サブ数 N | 合計 T(N) | 各サブの重み |
|---|---|---|
| 0 | ― | ― |
| 1 | 0.5 | 0.5 |
| 2 | 0.75 | 0.375 |
| 3 | 0.5 | 0.167 |

`N=2` を頂点とし、`N=3` で再び下がる。原則1個・稀に2個という運用に対応する。

```ts
export function subCategoryWeight(n: number): number {
  if (n <= 0) return 0
  const total = 0.75 - 0.25 * Math.pow(n - 2, 2)
  return total / n
}

export function accumulateCategoryPoints(owned: OwnedSkill[]): Record<CategoryId, number> {
  const points = {} as Record<CategoryId, number>
  for (const s of owned) {
    if (s.slotIndex === null && s.kind === 'active') continue   // 保管中は寄与しない
    const basePoint = (s.kind === 'active' ? 3 : 1) * s.level
    points[s.mainCategory] = (points[s.mainCategory] ?? 0) + basePoint
    const w = subCategoryWeight(s.subCategories.length)
    for (const sub of s.subCategories) {
      points[sub] = (points[sub] ?? 0) + basePoint * w
    }
  }
  return points
}
```

> 例: `str` 参照の3連撃（Lv2アクティブ、メイン`combo`・サブ`might`1個）
> - `combo` へ `3 × 2 = 6pt`
> - `might` へ `6 × 0.5 = 3pt`

**ポイントは小数になりうる。** 丸めない（HP増減の丸め規則はダメージ・回復のみが対象）。

### カテゴリ特化による解放

同じカテゴリのポイントがしきい値に達すると、**通常のドラフトには出現しない特別なアクティブ・パッシブ・特性**が候補に加わる。

- 解放されるものは**レベル1固定**（重複取得の対象外）だが、その分**非常に強力**
- 解放条件は**解放される側のデータに持たせる**

```jsonc
{
  "id": "trait_special_example",
  "kind": "trait",
  "unlockCondition": { "category": "combo", "points": 20 }
}
```

```jsonc
{ "categoryUnlockThresholds": [10, 20, 35] }   // battle.json。暫定値。要調整
```

**第8フェーズで1段目・2段目の中身が確定した**（暫定値・要調整なのは数値のみで、構造は確定）。

| 段 | しきい値 | 実体 | 現状 |
|---|---|---|---|
| 1段目 | `points:10` | `passive_<category>_mastery.json`（11カテゴリ全種、第7フェーズ時点で既存） | 実装済み |
| 2段目 | `points:20` | `trait_<category>_zenith.json`（11カテゴリ全種、第8フェーズで新規追加） | 実装済み |
| 3段目 | `points:35` | ― | **未使用**（`categoryUnlockThresholds` に値はあるが、参照するスキル・特性が無い） |

2段目の効果は概ね1段目パッシブ（`rate:0.1〜0.15`）より一段強い`statBoost`（`rate:0.15〜0.25`程度）。
**「治癒」カテゴリのみ例外**で、`statBoost` ではなく `healTaken` op（被回復量+30%、
`{ "op": "healTaken", "rate": 0.3 }`）を使う。他カテゴリの2段目はこのopを使わない。

### 解放されたものの提示方法

**未定（実装後に持ち越しの一部）。** 暫定的に**通常候補と同列に並べ、UI 上で「解放」バッジを付ける**方式で実装する。別枠提示に変更しやすいよう、`DraftOption.isUnlocked` フラグで区別する。

---

## 既見フラグ

未入手のスキル・特性は**名前のみ表示・アイコン灰色**とし、効果は伏せる。ただし**一度でも目にしたものは順次開示**される。

開示のきっかけ:

- ドラフトの選択肢として表示された
- 敵が所持していた（敵の詳細表示で確認できた）

```ts
/** 所持状態とは独立した「見たことがあるか」 */
seenIds: Set<string>
```

**所持しているかどうかとは別の状態**として保持する（[10-state.md](10-state.md)）。

ドラフト候補を生成した時点で、提示された3件すべてに既見フラグを立てる（選ばなくても既見になる）。

敵については、**敵の詳細表示を開いた時点**でその敵の所持スキル・特性に既見フラグを立てる。

> **決定（Q10）**: 戦闘に出ただけで全て開示すると詳細表示を見る意味が薄れるため、**詳細表示を開いた時点**とする。

---

## エッジケース

| ケース | 扱い |
|---|---|
| アクティブ枠が空いていて新規アクティブを選択 | 空き枠のうち**最も小さいインデックス**へ自動でセット |
| アクティブ枠が全て埋まっていて新規アクティブを選択 | 割り込みを迫らず、黙って倉庫（`slotIndex:null`）へ保管される |
| Lv4（MAX_ACTIVE_POINTS）のアクティブが重複候補に出る | 出さない（候補生成時に除外） |
| 倉庫保管中のアクティブが候補に出る | 出さない（重複が二度と発生しない） |
| 一度所持したパッシブが候補に出る | 出さない（重複が二度と発生しない） |
| `draftable:false` のスキル・特性が候補に出る（例: 自摸） | 出さない（候補生成の最初の段階で除外）。ただし入手経路自体が無いとは限らない（自摸は立直の`transformsInto`で入手可能。末尾参照） |
| 全カテゴリのしきい値に到達済み | 解放済みのものは通常候補として扱う |
| 特性を全て取得済み | 特性は候補に出ない |
| 全て取得済み＋全カテゴリ解放済み | フォールバック（ステータス微増）で3枠を埋める |

---

## 影響を受ける既存ファイル

| ファイル | 変更 |
|---|---|
| `src/domain/battle/skillDraft.ts` | ドラフト抽選・レベル導出・カテゴリポイント（第7フェーズで大幅刷新） |
| `src/domain/battle/skillPanel.ts` | 新規（第7フェーズ）。パネルでの入れ替え・ポイント配分 |
| `src/data/config/skill_points.json` | 新規（第7フェーズ）。`pointsForLevel`・パネル周期・付与量 |
| `src/data/config/battle.json` | しきい値・フォールバック量（`fallbackStatBoost` はステータスパネルの1ポイント増加量も兼ねる） |
| `src/components/battle/SkillPanel.vue` | 新規（第7フェーズ）。5戦ごとのパネルUI（第8フェーズでスクロール不要の3ゾーンレイアウトへ再設計） |
| `src/data/rpg/traits/trait_<category>_zenith.json` | 新規（第8フェーズ）。カテゴリ特化2段目報酬（11件） |
| `src/data/rpg/skills/skill_tsumo.json` | `draftable:false` 追加（第8フェーズ）。`transformsInto` で立直と相互変化 |

抽選は `rng` を注入可能にし、テストで固定できるようにする。

---

## 実装後の記録（第7フェーズ）

- パッシブの `level` フィールドは型としては残したが（敵の所持パッシブが依然としてレベル可変のため）、
  プレイヤーが取得したパッシブは常に `level: 1` で固定し、レベル倍率は等倍になる
- アクティブの `level` は `points` から都度導出するが、フィールドとしても保持している
  （`effectOps`/`skillText.ts` 等の既存の `levelMultiplier(level)` 参照を一切変えずに済ませるため）
- ステータスポイントの配分は新しい集計経路を作らず、既存の `player.temporary`（`permanent`スコープ）
  をソースID（`statPanel:<stat>`）で管理して再利用した

---

## 実装後の記録（第8フェーズ）

> 2026-09-06、`feature/skill-point-system` ブランチを本ブランチ（`feature/rpg-roguelike-battle`）へ
> 統合する形で実施（CLAUDE_TASKS.md 第8フェーズ Z-1・Z-7・Z-9）。**このドキュメントの数値は
> すべて「調整前提の仮値」であり、断定ではない。** 執筆時点でCLAUDE_TASKS.md上は該当項目は
> 完了扱いだが、ユーザー本人からは「まだ実装途中の可能性がある、テスト中で今後修正が入る
> かもしれない」との言及があった。以下は2026-09-06時点の作業ツリー（未コミット分含む）の
> 実態であり、今後変わりうる。

### 効果倍率カーブの変更（levelMultiplier） — 旧記述の訂正

第7フェーズ時点の本文では「効果倍率自体は変更しない（`2^L-1`、Lv1〜4: ×1/×3/×7/×15）」と
していたが、**この前提は第8フェーズで覆った。** スキルレベルの上昇だけで戦力が跳ね上がり
すぎるという問題意識から、`levelMultiplier`（`src/domain/battle/stats.ts`）は下記の緩やかな
線形カーブへ置き換えられた（新設: `skill_points.json` の `levelMultiplierStep`、既定値0.25）。

| レベル | 旧倍率（`2^L-1`） | 新倍率（`levelMultiplierStep=0.25`の場合） |
|---|---|---|
| Lv1 | ×1 | ×1 |
| Lv2 | ×3 | ×1.25 |
| Lv3 | ×7 | ×1.5 |
| Lv4 | ×15 | ×1.75 |

`pointsForLevel`（`[0,1,3,7]`）自体は変わっていない。レベルアップに必要な累計ポイントの
テーブルと、1レベルあたりの効果倍率の式は、第8フェーズで完全に分離された
（前者は「レベルの上がりやすさ」、後者は「上がった時の伸び幅」を独立に調整できる）。

その代替として、ステータス側の強化幅が引き上げられた:

- `fallbackStatBoost`（`src/data/config/battle.json`）: `{hp:400, other:40}` → `{hp:900, other:90}`
- `panelStatPoints`（`src/data/config/skill_points.json`）: 3 → 5（5戦ごとに配分できるステータスポイント）
- 11カテゴリすべての `passive_<category>_mastery.json` の `rate` を 0.1 → 0.15 に引き上げ、
  個別パッシブ（`passive_brawn`/`passive_iron_will`/`passive_keen_eye`/`passive_swift_step` 等）の
  ベース効果量も全体的に引き上げ

`levelMultiplierStep`・`fallbackStatBoost`・各パッシブの引き上げ幅は、いずれも実プレイでの
周回テストによる再調整を前提とした仮値。

### カテゴリ特化2段目（trait）の実装

「しきい値は未定」としていた部分のうち、**2段目（`points:20`）の報酬内容が確定した。**
詳細は本文「カテゴリ特化による解放」節に統合済み。要点のみ再掲すると、11カテゴリすべてに
`trait_<category>_zenith.json` が追加され（1段目 `passive_*_mastery.json` の `points:10` は
第7フェーズ時点で既存）、「治癒」カテゴリだけが例外的に `healTaken` op を使う。3段目
（`points:35`）は現状どのデータからも参照されておらず未使用のまま。

### draftable と transformsInto（自摸／立直）

自摸（`skill_tsumo.json`）に `"draftable": false` が追加され、通常のドラフト候補プールから
除外された（`buildCandidatePool` が先頭で弾く）。ただし**永久に入手不可という意味ではない**。

自摸は、立直（`skill_riichi.json`）を使用した際の `transformsInto` によってのみ入手できる。
`transformsInto` 自体は第8フェーズの新機能ではなく既存の仕組み（`git status` 上
`skill_riichi.json`・`types.ts`・`battleEngine.ts` に差分なし＝コミット済み）で、
`ActiveSkillDef` に持たせられる汎用フィールドとして「使用後に別スキルIDへ変化する」
（所持スロット・投資ポイント・レベルはそのまま、`OwnedActive.id` だけ差し替わる）動作を持つ。
立直・自摸は互いの `transformsInto` に相手を指定しており、使用のたびに入れ替わる。
`grantsBonusOnTransformUse` と組み合わせることで、立直発動から1ターンだけ次の自摸の
クリティカル率が上がる（「一発ツモ」相当）効果も実装されている。**第8フェーズで変わったのは
`skill_tsumo` 側に `draftable:false` を追加した点のみ**（この仕組み自体の変更ではない）。

このメカニクス自体（変化処理の実装箇所・スコープの扱い等）は本ドキュメント（ドラフト・
スキルポイント・カテゴリ）の対象範囲外のため詳細は割愛する。実体は
`src/domain/battle/types.ts`（`ActiveSkillDef.transformsInto`/`grantsBonusOnTransformUse`）と
`src/domain/battle/battleEngine.ts` を参照。

### 未確認・要検証

- 上記バランス数値（`levelMultiplierStep`・`fallbackStatBoost`・各パッシブの引き上げ幅）は
  ユーザー本人が「調整前提の仮値」と明言しており、今後変わる可能性が高い
- 3段目のカテゴリしきい値（`points:35`）の報酬内容は未定・未着手
- `draftable` フィールドは自摸以前から一部の特性・スタンス系アクティブ（`skill_stance_*`）
  でも使われていたが、本ドキュメントはこれまで明示的に触れていなかった。上記は自摸に関する
  今回の変更点のみを記録したもので、`draftable` 全般の網羅的な整理ではない
