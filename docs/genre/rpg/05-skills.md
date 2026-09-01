# 05. スキル・特性・効果オペレーション

対象範囲: 設計文書「アクティブスキル」「スキル効果の記述方式」「シールド」「パッシブスキル」「特性」「クリティカルの適用範囲」

---

## 3種の区別

| | アクティブスキル | パッシブスキル | 特性 |
|---|---|---|---|
| ターン消費 | する | しない | しない |
| 枠 | **4枠**を消費 | 消費しない | 消費しない |
| 重複取得 | 可（レベル上昇） | 可（レベル上昇） | **不可** |
| カテゴリ | メイン1 + サブ0以上 | 同左 | **持たない** |
| 主な役割 | 能動的な効果 | ステータス上昇 | 例外的な処理 |
| クールタイム | 持つ | ― | ― |
| 属性 | 持つ | ― | ― |
| フレーバーテキスト | **必須** | **必須** | **必須** |

```ts
export type SkillKind = 'active' | 'passive' | 'trait'
```

---

## 効果オペレーション（最重要の設計方針）

**スキルの効果を一連の流れとしてベタ書きで実装してはならない。** 部品ごとに関数を設計し、それを連鎖させる。

### レジストリ方式

```ts
export interface EffectContext {
  source: Combatant            // 効果の発動元
  targets: Combatant[]         // 解決済みの対象
  skill: SkillDef              // 発動したスキル
  level: number                // スキルレベル（効果量に影響）
  state: BattleState
  emit: (effectId: string, target?: Combatant) => void   // エフェクト再生
  rng: () => number            // 乱数（テスト時に差し替え可能）
}

export interface EffectOp {
  /** JSON の "op" と対応する識別子 */
  readonly id: string
  /** 効果を適用する。副作用は ctx 経由（state 更新・emit）で行い、戻り値は持たない */
  execute(node: EffectNode, ctx: EffectContext): void
}

/** JSON 上の1オペレーション */
export interface EffectNode {
  op: string
  [key: string]: unknown
}
```

`effectOps/index.ts` がレジストリを持つ。

```ts
const registry = new Map<string, EffectOp>()
export function registerOp(op: EffectOp): void
export function getOp(id: string): EffectOp | undefined

/** オペレーション配列を順に実行する */
export function runEffects(nodes: readonly EffectNode[], ctx: EffectContext): void
```

**新しい効果を追加するには、`effectOps/` にファイルを1つ足してレジストリに登録するだけでよい。** 既存スキルへの影響はゼロ。

### 初期オペレーション一覧

| `op` | 内容 | 主なパラメータ |
|---|---|---|
| `damage` | ダメージを与える | `element` / `scale: { stat, rate }` |
| `heal` | 回復する | `element` / `scale: { stat, rate }` |
| `shield` | シールドを付与する | `element` / `scale: { stat, rate }` |
| `repeat` | 内側を N 回繰り返す | `times` / `body` / `onLastIteration` |
| `modifier` | 一時的な補正を付与する | `stat` / `amount` / `scope` |
| `statBoost` | ステータスを恒常的に上昇（パッシブ用） | `stat` / `amount` または `rate` |
| `elementAffinity` | 弱点・耐性を付与（特性用） | `element` / `affinity` |
| `cutRate` | カット率を追加（特性用） | `amount` |
| `replaceGuard` | 「守る」を「避ける」へ置換（特性用） | ― |
| `healBetweenBattles` | 戦闘終了時に回復（特性用） | `amount` または `rate` |
| `effectBoost` | 自身が出す効果の効果倍率を上昇（特性/パッシブ用） | `element`（`"any"` で全属性）/ `rate` |
| `healTaken` | 対象側の被回復倍率を上昇（特性/パッシブ用） | `rate` |

この一覧は初期セットであり、**後から増やせることが要件**である。

> **実装時に判明した追加**: 当初の一覧には「送出ダメージ = ... × 効果倍率」（ダメージ計算の流れ）が参照する**効果倍率そのものを付与する手段**が含まれていなかった（`damage`/`heal`/`shield` のいずれの倍率も1固定になってしまう欠落だった）。`effectBoost`（例:「物理攻撃+50%」）と、回復側の対称にあたる `healTaken`（「被回復量+30%」）を追加した。

### `scale` の構造

**属性と参照ステータスは独立**なので、両方を別々に指定する。

```jsonc
{ "op": "damage", "element": "magical", "scale": { "stat": "str", "rate": 0.8 } }
// 魔法属性だが STR を参照する（設計文書が明示的に許容）
```

### `repeat` と反復中のタイミング指定

```jsonc
{
  "op": "repeat",
  "times": 3,
  "body": [ { "op": "damage", "element": "physical", "scale": { "stat": "str", "rate": 0.8 } } ],
  "onLastIteration": [ { "op": "modifier", "stat": "critRate", "amount": 0.5, "scope": "thisHit" } ]
}
```

| キー | 内容 |
|---|---|
| `times` | 反復回数 |
| `body` | 毎回実行するオペレーション |
| `onFirstIteration` | 初回のみ、`body` の**前**に実行（任意） |
| `onLastIteration` | 最終回のみ、`body` の**前**に実行（任意） |

> **`body` の前に実行する理由**: 「最後の攻撃のみクリティカル率上昇」は、その攻撃に補正を乗せる必要がある。`body` の後だと補正が間に合わない。

**命中判定と属性相性はヒットごとに個別に評価する**（[03-damage-calc.md](03-damage-calc.md)）。`repeat` の各反復が1ヒットに相当する。

### `modifier` の `scope` と `applyTo`

| `scope` | 有効期間 |
|---|---|
| `thisHit` | 直後の1ヒットのみ |
| `thisTurn` | そのラウンドの終わりまで（ラウンド終了処理で一括除去） |
| `thisBattle` | 戦闘終了まで |
| `permanent` | ラン終了まで |

`applyTo` は補正を誰に与えるかを指定する（省略時 `"source"`）。

| `applyTo` | 対象 |
|---|---|
| `"source"`（既定） | 発動元自身（例:「最後の攻撃のみクリティカル率上昇」のような自己バフ） |
| `"target"` | 効果の対象（デバフ等） |

---

## スキルレベルの効果量

効果量はレベルに応じて増加する。

```
倍率 = 2 ^ レベル - 1
```

| レベル | 倍率 |
|---|---|
| Lv1 | ×1 |
| Lv2 | ×3 |
| Lv3 | ×7 |
| Lv4 | ×15 |

```ts
export function levelMultiplier(level: number): number {
  return Math.pow(2, level) - 1
}
```

### 何に掛かるか

**数値量を持つパラメータに掛かる。**

| 対象 | 掛かるか |
|---|---|
| `damage` / `heal` / `shield` の `scale.rate` | **掛かる** |
| `statBoost` の `amount` / `rate` | **掛かる** |
| `modifier` の `amount` | **掛かる** |
| `cutRate` の `amount` | **掛かる** |
| `repeat` の `times` | **掛からない**（回数は増えない） |
| `elementAffinity` の `affinity` | **掛からない**（段階は増えない） |
| クールタイム | **掛からない** |

> **決定（Q5）**: 回数や段階まで増やすと `repeat` 3回が Lv4 で45回になるなど破綻するため、**連続量のみ**とする。

**特性は常に Lv1 相当（×1）** である（重複取得できないため）。

**カテゴリ特化で解放されたものも Lv1 固定**（重複取得の対象外）。

---

## 常時選択できる行動の定義

「守る」「何もしない」は**アクティブスキル枠を消費しない特別な行動**である。スキル定義としては持たず、エンジン側に組み込む。

```ts
export type BuiltinAction = 'guard' | 'pass'
```

| | ID | クールタイム | 効果 |
|---|---|---|---|
| 守る | `guard` | 3 | カット率に `+0.5` の実数バフ（`scope: thisTurn`） |
| 何もしない | `pass` | 0 | 効果なし |
| 避ける | `dodge` | 3 | 回避率に `+0.5` の実数バフ（`scope: thisTurn`） |

`dodge` は `guard` の置換であり、**両方を同時に持つことはない**。特性 `replaceGuard` を持つ場合のみ `guard` が `dodge` に差し替わる。

値は `battle.json` に置く（[03-damage-calc.md](03-damage-calc.md) の定数表を参照）。

---

## 初期スキル

スキル枠1に、**ジャンル確定時にランダムでどちらかがセットされる**。

| スキル | ID | 属性 | 参照 |
|---|---|---|---|
| 叩く | `skill_strike` | `physical` | `str` |
| ファイアボール | `skill_fireball` | `magical` | `int` |

**クールタイムは 0** とする。

> **決定（Q6）**: 初期スキルが使えないターンがあると序盤が「何もしない」だけになるため **0** とする。

初期スキルの選択に応じて、対応する攻撃ステータスが優遇される（[02-stats.md](02-stats.md)）。

ランダム化の理由は**プレイヤーの無意識のビルド偏りを防ぐ**ため。

---

## シールド

サポート系スキルで付与される**追加体力**。

`Combatant.shield`（`number`）が残り耐久値を保持する（[10-state.md](10-state.md)）。0 のときシールドなし。

| 性質 | 内容 |
|---|---|
| 期限 | **無期限**（ターン経過・時間経過で消えない） |
| 消費 | ダメージを受けた際、**HPより優先して消費**する |
| カット率（通常） | **20%** |
| カット率（特殊属性に対して） | **40%** |
| 上限 | これらのカット率は最終カット率に合算され、**80%上限に従う** |

### ダメージ適用の順序

```ts
export function applyDamage(target: Combatant, finalDamage: number, emit: EmitFn): void {
  const dmg = Math.floor(finalDamage)          // ここで丸める
  if (target.shield > 0) {
    const absorbed = Math.min(target.shield, dmg)
    target.shield -= absorbed
    const rest = dmg - absorbed
    if (rest > 0) target.hp -= rest
    if (target.shield === 0) emit('fx_shield_break', target)
  } else {
    target.hp -= dmg
  }
  if (target.hp <= 0) { target.hp = 0; target.alive = false }
}
```

**シールドのカット率は、シールドが 1 以上残っている間のみ適用する。** そのダメージでシールドが割れる場合も、そのダメージにはカット率が乗る（判定はダメージ適用の前）。

### 特殊属性への高いカット率

特殊属性は `(def + ref) / 4` を参照するため防御ステータスが効きにくい。その対抗手段としてシールドが 40% を持つ。

### 重ねがけ

シールドを複数回付与した場合、**耐久値を加算する**（上書きしない）。

> **決定（Q7）**: 上書きだと後から弱いシールドを張ると損をする不自然さがあるため **加算** とする。

---

## クリティカル

クリティカルは**ダメージだけでなく回復・シールドにも適用される**。

```
効果量 × クリティカルダメージ倍率
```

> 例: `int` の80%分を回復するスキルで、クリティカルダメージ倍率が200%なら、クリティカル時は **160%分**（`0.8 × 2.0 = 1.6`）の回復になる。

判定は**ヒットごと**に行う（命中判定・属性相性と同じ単位）。

```ts
export function rollCritical(critRate: number, rng: () => number): boolean {
  return rng() < critRate
}
```

デバフ・純粋なバフなど数値量を持たない効果には適用しない。

---

## 効果文の表示

効果文は**効果データから自動生成する**。手書きの文字列として持たない。

```ts
export interface SkillTextToken {
  type: 'plain' | 'stat' | 'element' | 'number'
  text: string
}

export function buildSkillText(skill: SkillDef, level: number): SkillTextToken[]
```

`SkillText.vue` がトークン列を受け取り、`type` ごとに色を分けて描画する。

| `type` | 例 | 色 |
|---|---|---|
| `stat` | `STR` / `INT` / `クリティカル率` | ステータス色 |
| `element` | 物理 / 魔法 / 特殊 | 属性色 |
| `number` | `80%` / `3回` / `+800` | 数値色 |
| `plain` | その他の地の文 | 既定色 |

**表示される数値はスキルレベルの倍率を適用済みの実値**とする（Lv2 の「STRの80%」は「STRの240%」と表示する）。

> **決定（Q8）**: レベルを上げたのに表示が変わらないと成長を実感できないため、**レベル適用後の実値**を表示する。

色は CSS 変数として定義し、ハードコードしない。

---

## フレーバーテキスト

**アクティブ・パッシブ・特性のすべてが必須で持つ。** ゲームプレイに一切影響しない。

効果の説明文（自動生成）とは**別枠**で保持し、詳細表示・マウスオーバー時に併せて表示する。

---

## エッジケース

| ケース | 扱い |
|---|---|
| 未知の `op` を含むスキル | ロード時に検証して弾く（[07-data-schema.md](07-data-schema.md)）。実行時に遭遇したら警告して**そのオペレーションのみスキップ**し、戦闘は継続する |
| `repeat` の入れ子 | 許容する。ネスト深さの上限は設けないが、JSON 検証で深さ3までを推奨とする |
| `times` が 0 以下 | 検証で弾く（1以上を必須とする） |
| 対象が0体 | オペレーションを実行せず、エフェクトのみ再生 |
| `modifier` の対象ステータスが存在しない | 検証で弾く（`StatKey` に限定する） |
| シールド付与量が 0 以下 | 付与しない（既存シールドも変更しない） |

---

## 影響を受ける既存ファイル

| ファイル | 変更 |
|---|---|
| `src/domain/battle/effectOps/*` | 新規 |
| `src/domain/battle/types.ts` | 新規 |
| `src/data/skills/*.json` | 新規 |
| `src/data/traits/*.json` | 新規 |

---

## 実装後の記録

（実装完了後に追記）
