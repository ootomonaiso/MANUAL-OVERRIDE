# 05. スキル・特性・効果オペレーション

対象範囲: 設計文書「アクティブスキル」「スキル効果の記述方式」「シールド」「パッシブスキル」「特性」「クリティカルの適用範囲」

---

## 3種の区別

| | アクティブスキル | パッシブスキル | 特性 |
|---|---|---|---|
| ターン消費 | する | しない | しない |
| 枠 | **4枠**を消費 | 消費しない | 消費しない |
| 重複取得 | 可（ドラフトで重複を選ぶとポイント+1、累計ポイントからレベルを導出） | **不可**（実装後に変更。下記参照） | **不可** |
| カテゴリ | メイン1 + サブ0以上 | 同左 | **持たない** |
| 主な役割 | 能動的な効果 | ステータス上昇 | 例外的な処理 |
| クールタイム | 持つ | ― | ― |
| 属性 | 持つ | ― | ― |
| フレーバーテキスト | **必須** | **必須** | **必須** |

```ts
export type SkillKind = 'active' | 'passive' | 'trait'
```

> **実装後の変更（スキルポイント制度、`CLAUDE_TASKS.md` 第7フェーズ）**: パッシブのレベル/スタック概念は廃止された。プレイヤーが取得したパッシブは常に Lv1 相当（＝`levelMultiplier` が等倍）で固定され、一度所持すると `skillDraft.ts::buildCandidatePool()` が以後永久にドラフト候補から除外する（重複取得自体が発生しない）。`OwnedPassive.level` フィールド自体は残っているが、これは敵の所持パッシブ（`EnemyDef.passiveSkills`）の強さ調整用。
>
> アクティブは重複取得の仕組み自体は残っているが、内部実装がレベル直接指定から「投資ポイント（`OwnedActive.points`）→ `levelForPoints()` で都度レベル導出」に変わっている。配分の詳細（ドラフトでの重複ポイント付与・スキルパネルでのポイント割り振り）は06-draft.mdの管轄。本節ではレベルが決まった後の「効果量への反映（`levelMultiplier`）」のみを扱う。

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
  emit: (req: EffectRequest) => void   // エフェクト再生
  rng: () => number            // 乱数（テスト時に差し替え可能）
  getEffective: (c: Combatant) => EffectiveStats   // 対象の実効ステータスを都度算出（補正の変化を反映するため毎回計算）
  content: BattleContent       // スキル・特性定義の参照に使う
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

> **実装時の変更**: `emit` は当初案の `(effectId, target?) => void` ではなく、`EffectRequest` を1引数で受け取る形になっている。
>
> ```ts
> export interface EffectRequest {
>   effectId: string
>   targetRef: 'source' | 'target' | 'screen'
>   combatantId?: string
>   payload?: EffectPayload   // text（表示テキスト）/ color / absorbedByShield / skillId / critStacks 等
> }
> ```
>
> また `EffectContext` には設計時点になかった `getEffective`（実効ステータスの都度算出）と `content`（スキル・特性定義の参照）が追加されている。特性由来のカット率合計・弱点耐性・効果倍率などは `ctx.content.traits` / `ctx.content.skills` を直接読んで集計する「宣言的op」（後述）が担うため、この2つが必要になった。

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
| `damage` | ダメージを与える | `element` / `scale: { stat, rate }` または `scale: { statOptions, rate }` |
| `heal` | 回復する | `element` / `scale: { stat, rate }` または `flat`（`scale`と排他） |
| `shield` | シールドを付与する | `element` / `scale: { stat, rate }` |
| `repeat` | 内側を N 回繰り返す | `times` / `body` / `onLastIteration` |
| `modifier` | 一時的な補正を付与する | `stat` / `amount` / `rate` / `scale: { stat, rate }`（`amount`と併用可・加算） / `scope` |
| `statBoost` | ステータスを恒常的に上昇（パッシブ用） | `stat` / `amount` または `rate` |
| `elementAffinity` | 弱点・耐性を付与（特性用） | `element` / `affinity` |
| `cutRate` | カット率を追加（特性用） | `amount` |
| `replaceGuard` | 「守る」を「避ける」へ置換（特性用） | ― |
| `healBetweenBattles` | 戦闘終了時に回復（特性用） | `amount` または `rate` |
| `effectBoost` | 自身が出す効果の効果倍率を上昇（特性/パッシブ用） | `element`（`"any"` で全属性）/ `rate` |
| `healTaken` | 対象側の被回復倍率を上昇（特性/パッシブ用） | `rate` |
| `noop` | 何もしない（「様子を見る」用） | ― |
| `counterStance` | 反撃態勢に入る（次の被弾ぶんをまとめて反撃） | `scaleStat: 'def'\|'ref'` / `rate` / `element` |
| `periodicSelfDamage` | 継続ダメージ（DOT）を自身に登録する | `ratio`（実効最大HPに対する割合） |

この一覧は初期セットであり、**後から増やせることが要件**である。

> **実装時に判明した追加**: 当初の一覧には「送出ダメージ = ... × 効果倍率」（ダメージ計算の流れ）が参照する**効果倍率そのものを付与する手段**が含まれていなかった（`damage`/`heal`/`shield` のいずれの倍率も1固定になってしまう欠落だった）。`effectBoost`（例:「物理攻撃+50%」）と、回復側の対称にあたる `healTaken`（「被回復量+30%」）を追加した。
>
> **さらに実装後に追加された3op**（詳細は末尾「実装後の記録」参照）: `noop`（意図的な無効果。「様子を見る」の実体）、`counterStance`（カウンター/反射板 用の反撃態勢）、`periodicSelfDamage`（龍鱗 用の継続ダメージ）。

### 宣言的op（`runEffects` から実行されない op）

`statBoost` / `elementAffinity` / `cutRate` / `replaceGuard` / `healBetweenBattles` / `effectBoost` / `healTaken` の7opは、`effect[]` を直接読む集計側（`stats.ts::accumulatePassiveStatBoosts`、`damageCalc.ts::computeAffinityStage`、`damage.ts::collectTraitCutRates`、`battleEngine.ts::hasReplaceGuard`、戦闘終了処理、`stats.ts::collectEffectMultiplier`、`heal.ts::healTakenMultiplier`）が個別に読む**宣言的op**であり、`runEffects()`（＝スキル使用時の逐次実行）からは実行されない。レジストリには「未登録の op」検証のためだけに登録されており、`execute()` は呼ばれた場合に警告を出すのみの空実装になっている。対して `damage` / `heal` / `shield` / `repeat` / `modifier` / `noop` / `counterStance` / `periodicSelfDamage` は `runEffects()` で実際に実行される**手続き的op**。

### `scale` の構造

**属性と参照ステータスは独立**なので、両方を別々に指定する。

```jsonc
{ "op": "damage", "element": "magical", "scale": { "stat": "str", "rate": 0.8 } }
// 魔法属性だが STR を参照する（設計文書が明示的に許容）
```

`damage` の `scale` は `stat`（単一）の代わりに `statOptions: StatKey[]`（複数候補のうち実効値が最も高いものを参照）も指定できる。自摸（`skill_tsumo`）が `statOptions: ["str", "int"]` でSTR/INTの高い方を参照する。`stat` と `statOptions` は排他。

`heal` は `scale` の代わりに `flat: number`（固定値・ステータス参照なし）を指定できる。`scale` と `flat` は排他。`flat` でもスキルレベル倍率は乗る（ステータス参照を経由しないだけで、レベルによる伸びはある）。

`modifier` は `amount`/`rate` に加えて `scale: { stat, rate }` を指定でき、**発動元(source)の実効ステータス**を参照して補正量を決められる（例:「自分のSTRの50%分、DEFを上げる」＝棘を纏う 想定）。`scale` は `amount` と併用可能で、その場合は加算される（`combinedAmount = amount + (発動元ステータス × scale.rate)`）。`scale` は常に発動元（`ctx.source`）を参照する点に注意（`applyTo: "target"` のデバフでも、量を決めるのは「かける側の力量」）。

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
| `nextRound` | 付与されたラウンドの残り + 次のラウンド丸ごと（実装後に追加。下記参照） |

> **実装後に追加**: `nextRound` は「他者の行動をまたいで、自分の次の行動でも生きている」補正のために追加された。`thisTurn` は `endOfRound()` で毎ラウンド即座に失効するため「相手の行動までしか保たない」（守る/避ける向け）。それでは足りないケース——大振りの自己デバフ（次の自分の行動開始まで DEF-50%）や、立直が仕込む「自摸使用時のみ」クリティカル率バフ——のために `nextRound` を用意した。
>
> 実装（`effectOps/registry.ts`）: `endOfRound()` が毎ラウンド `clearThisTurnModifiers()` で `thisTurn` を失効させた**直後**に `downgradeNextRoundModifiers()` を呼び、`nextRound` を `thisTurn` へ格下げする。この順序を逆にすると、格下げした直後に同じ呼び出しで消えてしまう。付与 → 格下げ → 失効で「2ラウンド分」保つ計算になる。

`applyTo` は補正を誰に与えるかを指定する（省略時 `"source"`）。

| `applyTo` | 対象 |
|---|---|
| `"source"`（既定） | 発動元自身（例:「最後の攻撃のみクリティカル率上昇」のような自己バフ） |
| `"target"` | 効果の対象（デバフ等） |

---

## スキルレベルの効果量

効果量はレベルに応じて増加する。

> **実装後の見直し（第8フェーズ、`CLAUDE_TASKS.md` Z-9）**: 当初の指数カーブ（`2^Lv-1`）はスキルレベルだけで戦力が急激に跳ね上がりすぎたため、線形カーブへ変更された。**この節の内容は現在は歴史的資料であり、以下が実装の実値**。

```
倍率 = 1 + (レベル - 1) × levelMultiplierStep
```

`levelMultiplierStep` は `src/data/config/skill_points.json` で定義（2026-09-06 時点で `0.25`。**調整前提の仮値**、`skill_points.json` 自身が「数値は仮値」と明記している）。

| レベル | 倍率（`levelMultiplierStep = 0.25` の場合） |
|---|---|
| Lv1 | ×1.0 |
| Lv2 | ×1.25 |
| Lv3 | ×1.5 |
| Lv4 | ×1.75 |

```ts
// src/domain/battle/stats.ts
export function levelMultiplier(level: number): number {
  return 1 + (level - 1) * SKILL_POINTS.levelMultiplierStep
}
```

旧仕様との対比（参考）: 旧カーブは Lv1〜4 で ×1/×3/×7/×15。新カーブは ×1/×1.25/×1.5/×1.75。伸びを緩めた分、代わりにステータス側（スキルパネルの `statPoints`・フォールバック選択肢の `fallbackStatBoost`）の1ポイントあたりの上昇量を引き上げる方針転換とセットで行われた（`battle.json` の `fallbackStatBoost` コメント参照。この配分の詳細は06-draft.mdの管轄）。

**スキルレベル自体の出どころ**: プレイヤーのアクティブスキルはレベルを直接持たず、投資済みポイント（`OwnedActive.points`）から `skillDraft.ts::levelForPoints()` が都度導出する（`pointsForLevel: [0, 1, 3, 7]` で Lv1〜4、`MAX_ACTIVE_LEVEL = 4`）。敵はEnemyDefで指定されたレベルに固定。ポイントの獲得方法（ドラフト重複取得・スキルパネル配分）は06-draft.mdの管轄であり、本節では `levelMultiplier()` という「レベル→効果量倍率」の関数のみを扱う。

### 何に掛かるか

**数値量を持つパラメータに掛かる。ただし割合ステータス（`PERCENT_STAT_KEYS`）は例外。**

| 対象 | 掛かるか |
|---|---|
| `damage` の `scale.rate`（`stat` / `statOptions` いずれも） | **掛かる** |
| `heal` の `scale.rate` または `flat` | **掛かる** |
| `shield` の `scale.rate` | **掛かる** |
| `statBoost` の `amount` / `rate`（対象が `hitRate`/`evadeRate`/`critRate`/`critDamageMultiplier` 以外） | **掛かる** |
| `modifier` の `amount` / `rate` / `scale.rate`（同上） | **掛かる** |
| `cutRate` の `amount` | **掛かる** |
| `statBoost` / `modifier` の対象が `hitRate`/`evadeRate`/`critRate`/`critDamageMultiplier`（+ `modifier` の `cutRate` 指定） | **掛からない**（常に等倍） |
| `repeat` の `times` | **掛からない**（回数は増えない） |
| `elementAffinity` の `affinity` | **掛からない**（段階は増えない） |
| `periodicSelfDamage` の `ratio`（実装後に追加） | **掛からない**（「毎ターン最大HPの一定割合を失う」固定コストのため） |
| `counterStance` の `rate`（実装後に追加） | 態勢に入る時点では**掛からない**。反撃発動時にあらためて `damage` opを経由するため、そこで反撃側のレベル倍率が乗る（＝結果的には反映されるが、`counterStance` 自身のパラメータには乗らない） |
| クールタイム | **掛からない** |

> **決定（Q5）**: 回数や段階まで増やすと `repeat` 3回が Lv4 で45回になるなど破綻するため、**連続量のみ**とする。

**特性は常に Lv1 相当（×1）** である（重複取得できないため）。

**カテゴリ特化で解放されたものも Lv1 固定**（重複取得の対象外）。

> **改修（8回目のプレイフィードバック）**: 「割合ステータスにも掛かる」という当初の仕様のまま
> `三連撃`（`onLastIteration` に `critRate` へのmodifier）や `見切り撃ち`・複数のパッシブ
> （`passive_curse_mastery`/`passive_fatal_mastery`/`passive_keen_eye`）を実装していたため、
> レベルアップのたびに「確率」や「クリティカルダメージ倍率」自体が指数的に膨張していた
> （例: `critRate` に `amount:0.5` のmodifierはLv1で+50%のはずが、Lv2で+150%・Lv4で+750%に
> なっていた）。特に `critDamageMultiplier` はスーパークリティカル（100%超過分がさらに
> クリティカルを重ねる仕組み。[03-damage-calc.md](03-damage-calc.md)参照）と絡んで際限なく
> 暴走する、実際に確認されたゲームバランス崩壊だった。
>
> 対策として、割合ステータス（`hitRate`/`evadeRate`/`critRate`/`critDamageMultiplier`。
> `PERCENT_STAT_KEYS`、`src/domain/battle/types.ts`）を対象とする `modifier`/`statBoost` には
> レベル倍率を掛けないよう変更した（`effectOps/modifier.ts` の `modifierOp` と `stats.ts` の
> `accumulatePassiveStatBoosts`、表示側は `skillText.ts`）。ダメージ・回復のような
> 「大きいほど強い」連続量とは性質が異なり、確率・倍率が指数的に伸びること自体が
> 破綻の原因だったため。三連撃は合わせて `scale.rate` を `0.8`→`0.6` へ調整した
> （合計威力 `80%×3=240%` は他スキルと比べ突出していたため）。

---

## 使用条件・スキル変化（実装後に追加）

第4フェーズ（構造変更9件）で、`ActiveSkillDef` に以下のフィールドが追加された。3種の区別・効果オペレーションとは独立した「そもそも使えるか／使うと何が起きるか」を制御する仕組みで、フィールド一覧・JSON例は [07-data-schema.md](07-data-schema.md#属性対象範囲スコープの拡張第4フェーズ) にまとめてある（本節は概要のみ）。

| フィールド | 概要 |
|---|---|
| `draftable: boolean` | `false` ならドラフト候補から除外する。「守る」等の常設行動、または `transformsInto` の変化先としてのみ得るスキル（自摸）に使う |
| `minRound: number` | このターン数に達するまで使用不可（プレイヤー・敵の双方）。効果文には自動で「Xターン目から使用可能。」が追記される |
| `transformsInto: string` | 使用後に別スキルIDへ変化する（立直⇔自摸）。所持スロット・レベル・ポイントは維持したまま `id` だけ差し替わる。敵の固定行動パターンには向かない制約がある |
| `grantsBonusOnTransformUse` | `transformsInto` と併用し、変化先スキルが**次に使われた時だけ**一時ボーナスを与える（一発ツモ） |

これらは `Element`（`'none'` 追加）・`FocusRange`（`'random'` 追加。対象選択そのものの仕組みは [04-battle-flow.md](04-battle-flow.md) の管轄）・`ModifierScope`（`'nextRound'` 追加。上記「`modifier` の `scope` と `applyTo`」参照）と同じ第4フェーズの構造変更で、無属性スキル（龍鱗・立直・自摸等）を成立させるために一括で導入された。

---

## 常時選択できる行動の定義

「守る」「何もしていない」「様子を見る」は**アクティブスキル枠を消費しない特別な行動**である。当初はスキル定義を持たずエンジン側だけに組み込む想定だったが、改修後は内容（ラベル・説明文・カテゴリ）をスキルJSONとして持つ（下記「改修（実装後）」参照）。ただし実行そのものはエンジン側の専用パス（`useBuiltinAction()`）を経由し、4つの通常アクティブ枠とは別に扱う。

```ts
export type BuiltinAction = 'guard' | 'pass'
```

| | ID | クールタイム | 効果 |
|---|---|---|---|
| 守る | `guard` | 3 | カット率に `+0.5` の実数バフ（`scope: thisTurn`） |
| 様子を見る | `pass` | 0 | 効果なし |
| 避ける | `dodge` | 3 | 回避率に `+0.5` の実数バフ（`scope: thisTurn`） |

`dodge` は `guard` の置換であり、**両方を同時に持つことはない**。特性 `replaceGuard` を持つ場合のみ `guard` が `dodge` に差し替わる。

値は `battle.json` に置く（[03-damage-calc.md](03-damage-calc.md) の定数表を参照）。

> **改修（実装後）**: プレイフィードバックを受け、この3行動は
> `src/data/rpg/skills/skill_stance_guard.json` / `skill_stance_watch.json` / `skill_stance_idle.json` として、
> 他のアクティブスキルと同じ `battle-skill.schema.json` 形式で定義し直した（`draftable: false` を付け、
> `skillDraft.ts` の `buildCandidatePool` がアクティブ/パッシブ双方でこのフラグを見て候補から除外する）。
> ラベル・フレーバーテキスト・カテゴリ・効果文はこの JSON から生成し、コードへハードコードしない
> （以前は `GUARD_DESCRIPTION` のような文字列を Vue 側に直書きしていた）。
> クールタイムの管理・効果の適用そのものは、引き続き `Combatant.builtinCooldowns` と
> `useBuiltinAction()`（エンジン側）が担う。「内容はJSON、実行はエンジン」という分担にすることで、
> スキルらしく自然に見せながら、実行モデルの大きな作り替え（4枠に混ぜる等）は避けている。
> ラベルも `避ける`→`様子を見る`、`何もしない`→`何もしていない` に改めた
> （`様子を見る` は敵のNEXT表示が使っていた語と統一、`何もしていない` は文字通りの無効果と紛れないようにするため）。
>
> **再改修（6回目のプレイフィードバック）**: 上記の改称を明示的に差し戻す指示があり、
> `様子を見る`→`避ける`、`何もしていない`→`何もしない` へ再度改めた。理由は特に示されていないが、
> ユーザーの明示指示のため踏襲する。
>
> **3度目の改称（8回目のプレイフィードバック）**: `避ける`（`dodge`）と語が競合しない形にしたいとの
> 指示を受け、`pass` のラベルを `何もしない`→`様子を見る` に改めた（`様子を見る` は3回目の改修時点で
> `dodge` から離れて空いた語であり、今回はそれを `pass` 側が引き継ぐ形）。`guard`/`dodge`/`pass` の
> 最終的な組み合わせは「守る」「避ける」「様子を見る」。

---

## 初期スキル

スキル枠1に、**ジャンル確定時にランダムでどちらかがセットされる**。

| スキル | ID | 属性 | 参照 |
|---|---|---|---|
| 叩く | `skill_strike` | `physical` | `str` |
| ファイアボール | `skill_fireball` | `magical` | `int` |

**クールタイムは 0** とする。

> **決定（Q6）**: 初期スキルが使えないターンがあると序盤が「何もしていない」だけになるため **0** とする。

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

### スーパークリティカル（実装後に追加）

クリティカル率は元々**上限を設けていない**（[02-stats.md](02-stats.md)）。プレイフィードバックを受け、
100%を超えた分に意味を持たせる「スーパークリティカル」を追加した。

> **決定**: クリティカル率が101%（1.01）で、クリティカルダメージ倍率が3倍の場合を考える。
> まずクリティカルが1重確定する。そして、超過分の1%の確率でさらにもう1重乗る（スーパークリティカル）。
> 成功した場合、同じ確率（この例では1%）でさらにもう1重…と際限なく重なりうる。
> 倍率は「クリティカルダメージ倍率 ^ 重なった回数」。つまり2重なら`3^2=9`倍、3重なら`3^3=27`倍になる。

```ts
/** 戻り値はクリティカルが重なった回数（0=なし、1=通常のクリティカル、2以上=スーパークリティカル） */
export function rollCriticalStacks(critRate: number, rng: () => number): number {
  if (critRate < 1) return rollCritical(critRate, rng) ? 1 : 0
  let stacks = Math.floor(critRate)
  const chance = critRate - stacks
  while (chance > 0 && rng() < chance) stacks++
  return stacks
}

export function criticalMultiplierForStacks(critDamageMultiplier: number, stacks: number): number {
  return stacks <= 0 ? 1 : Math.pow(critDamageMultiplier, stacks)
}
```

ダメージ・回復・シールドの3op（`damage.ts` / `heal.ts` / `shield.ts`）すべてが対象。演出は1重なら
`fx_critical`、2重以上なら`fx_super_critical`（画面シェイクが大きく、ポップアップに重なった回数を表示）を鳴らし分ける。

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
| `src/domain/battle/effectOps/*` | 新規（初期10op + 実装後追加の `noop`/`counterStance`/`periodicSelfDamage`/`effectBoost`/`healTaken`） |
| `src/domain/battle/types.ts` | 新規。第4フェーズで `Element`/`FocusRange`/`ModifierScope` を拡張、`ActiveSkillDef` に `minRound`/`transformsInto`/`grantsBonusOnTransformUse`/`draftable` を追加 |
| `src/domain/battle/damageCalc.ts` | 第4フェーズでスーパークリティカル（`rollCriticalStacks`/`criticalMultiplierForStacks`）を追加 |
| `src/domain/battle/skillText.ts` | 割合ステータスの`%`表示・レベル倍率の非適用・新opの効果文・`minRound`の自動追記等 |
| `src/data/config/skill_points.json` | 第7〜8フェーズ。`levelMultiplierStep` 等（[06-draft.md](06-draft.md)参照） |
| `src/data/rpg/skills/*.json` | 新規 |
| `src/data/rpg/traits/*.json` | 新規 |

---

## 実装後の記録

本文中に「実装後の変更」「実装後に追加」の注記を随所に入れてあるので詳細はそちらを参照し、ここでは変更の全体像だけまとめる。

- **パッシブのレベル/スタック概念を廃止**（第7フェーズ、スキルポイント制度）。プレイヤー取得分は常にLv1相当で固定、一度所持すると二度とドラフトに出ない。配分の仕組み自体は[06-draft.md](06-draft.md)の管轄
- **効果オペレーションを3op追加**: `noop`（「様子を見る」の実体）・`counterStance`（カウンター/反射板の反撃態勢）・`periodicSelfDamage`（龍鱗の継続ダメージ）。加えて `damage`/`modifier`/`heal` の`scale`をそれぞれ`statOptions`・`scale`併用・`flat`へ拡張した（第4フェーズ、構造変更9件）
- **`ModifierScope`に`nextRound`を追加**（「付与ラウンドの残り＋次のラウンド丸ごと」で失効する2ラウンド寿命）。大振り・立直⇔自摸の会心シナジーを成立させるために新設
- **`ActiveSkillDef`に`minRound`/`transformsInto`/`grantsBonusOnTransformUse`/`draftable`を追加**（上記「使用条件・スキル変化」参照）。フィールド定義・JSON例は[07-data-schema.md](07-data-schema.md)にまとめた
- **レベルによる効果量倍率を指数カーブ（`2^Lv-1`）から線形カーブ（`1+(Lv-1)×levelMultiplierStep`）へ変更**（第8フェーズ）。スキルレベルだけで戦力が跳ね上がりすぎたための緩和で、詳細は上記「スキルレベルの効果量」節・[02-stats.md](02-stats.md)を参照。**現在値（`levelMultiplierStep:0.25`）は調整前提の仮値**
- **割合ステータス（`hitRate`/`evadeRate`/`critRate`/`critDamageMultiplier`）にはレベル倍率を掛けない例外を追加**（8回目のプレイフィードバック）。確率・倍率が指数的に膨張してバランスが崩壊した実例を受けた対応
- **クリティカル率100%超過分を扱う「スーパークリティカル」を追加**（上記「スーパークリティカル」節）
- **常設行動（守る/避ける/様子を見る）をハードコードからJSON定義（`skill_stance_*.json`）へ移行**し、ラベルは複数回のフィードバックを経て最終的に「守る」「避ける」「様子を見る」に確定した（上記「常時選択できる行動の定義」参照）

数値（`levelMultiplierStep`・各スキルの`scale.rate`等）はすべて調整前提の仮値であり、本ドキュメント作成時点でもバランス再調整が続いている（第8フェーズ）。
