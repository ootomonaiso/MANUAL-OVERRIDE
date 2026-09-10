# 04. 戦闘フロー

対象範囲: 設計文書「ゲームループ」「ラン（1回の遊び）の終了条件」「行動順」「フォーカス（対象選択）」「敵の次スキル公開」「常時選択できる行動」「戦闘間のHP回復」「スコア計算」

---

## ラン全体の構造

> **当初の設計との差分（第6・7フェーズで変更）**: 下図は当初の設計（「戦闘→ドラフト→…→ボス戦で
> ラン終了」という単線）。実装では、ボス戦は最後に一度だけ出現するのではなく
> `bossIntervalBattles`（既定10）戦ごとに周期的に出現し、`panelIntervalBattles`（既定5）戦ごとに
> スキル/ステータス配分パネルも挟まる。詳細は「ラン終了条件」節と「実装後の記録」を参照。

```
ジャンル確定（rpg に収束）
  │ 初期スキル・初期ステータスをランダム決定
  ▼
戦闘 #1 ──→ ドラフト ──→ 戦闘 #2 ──→ ドラフト ──→ ... ──→ ボス戦
  │                                                          │
  └─ 敗北 ────────────────────────────────────────────────┤
                                                             ▼
                                                        ラン終了 → throwing
```

### 実際の構造（第6・7フェーズ反映）

```
ジャンル確定（rpg に収束）
  │ 初期スキル・初期ステータスをランダム決定
  ▼
┌─ 戦闘 #N（battleIndex）───────────────────────────────────┐
│  勝利 → ドラフト（通常1回／ボス撃破時は bossDraftRounds 回連続）│
│       → battlesWon が panelIntervalBattles の倍数なら       │
│         スキルパネル（status:'skillPanel'）を追加で挟む      │
│  敗北 → ラン終了（throwing）                                │
└──────────────────────────────────────────────────────────┘
  │ 次の戦闘（battleIndex+1）。bossIntervalBattles 戦ごとに
  │ groupOrder（既定 A→B→C→D→E）を巡回するボス戦になる
  ▼
（上記を繰り返す）
  │
  └─ groupOrder.length × lapsForTrueClear 回目（既定25回目）のボス撃破 → 真のクリア → throwing
```

## 1戦闘の構造

```
戦闘開始
  │ 敵を1体以上生成／各敵の次スキルを決定・公開
  ▼
┌─ ラウンド開始 ──────────────────────────────┐
│   プレイヤーの行動選択を待つ（キューはまだ空）  │
│     │ プレイヤーが行動を決めた瞬間に            │
│     ▼ 行動順キューを構築（AGI + 特性 + alwaysActsFirst） │
│   キュー順に各キャラが1回ずつ行動              │
│     ├ プレイヤー: 決めていた行動を実行          │
│     └ 敵: actionPattern に従い使用（minRound未達／CT中は飛ばす）│
│     │                                          │
│     ▼ 各行動ごとに効果解決 → 反撃(カウンター)解決 → エフェクト再生 │
│                                                │
│   全員の行動が終わったらラウンド終了処理       │
│     ├ 全アクティブスキルのクールタイムを -1    │
│     └ 継続ダメージ(DOT)を解決（自滅もありうる）│
└────────────────────────────────────────────────┘
  │
  ├─ 敵が全滅 → 戦闘勝利 → ドラフト（ボス撃破時は3連続）→ 必要なら5戦ごとにスキルパネル
  ├─ プレイヤーが戦闘不能（DOTによる自滅を含む）→ ラン終了（敗北）
  └─ 継続 → 次のラウンドへ
```

> **第4フェーズで追加された要素**: 「反撃(カウンター)解決」（カウンター・反射板）と
> 「継続ダメージ(DOT)」（龍鱗）は、当初の設計文書には存在しなかった仕組み。詳細は
> それぞれ専用の節（「カウンター・反射（反撃）」「継続ダメージ（DOT）」）を参照。
> `minRound`（使用可能ターン制限）も同フェーズで追加された（「敵の行動」節、
> および「プレイヤーの行動選択」節の該当箇所を参照）。
>
> **第10フェーズで変更**: 行動順キューは、当初の設計（ラウンド開始時に全員ぶん確定）から
> 「プレイヤーが行動を決めた瞬間に組み立てる」方式へ変更された。守る/避ける/不意打ちのように
> **選んだ行動そのものが先手（`alwaysActsFirst`）を持つ**ケースは、ラウンド開始時点では
> まだ誰も行動を決めていないため原理的に反映できず、この変更が必要になった。
> `composables/useBattleState.ts::selectAction()` が、プレイヤーの選んだ行動と各敵の
> 予定行動（`previewEnemyNextSkill()` による非破壊プレビュー）の両方の `alwaysActsFirst` を見て
> この瞬間にキューを組み立て、選択済みの行動を保持したまま `processTurns()` へ渡す。
> 詳細は `CLAUDE_TASKS.md` 第11フェーズ参照。

### 用語

| 用語 | 定義 |
|---|---|
| **ラン** | 1回の遊び。ジャンル確定から `throwing` までの全体 |
| **戦闘** | 敵1グループとの戦い。勝利するとドラフトが挟まる |
| **ラウンド** | 行動順キューが一巡する単位。**クールタイムはラウンドごとに1減る** |
| **ターン** | 1キャラクターの1行動 |

> **クールタイムの減算タイミング**: 設計文書の「ターンごとに1ずつ減る」を、**1ラウンド（全キャラの行動が一巡）につき1減算**と解釈する（設計文書「実装上の注意点 6」で明記済み）。

---

## 1手番の刻み方（演出の「間」）

1手番は**提示 → 解決**の2段で進める。プレイヤーの手番でも敵の手番でも同じ順序で、
行動順がどちらでも手応えが揃うようにする。

```
提示（announceMs）   スキル名の帯を出す・攻撃モーションに切り替える・詠唱音を鳴らす
  ▼
解決（impactMs）     効果を解決 → ダメージポップアップ・被弾フラッシュ・着弾音
  ▼
次の手番へ
```

`useBattleState` は**スケジューラを差し替えられる**。

| 実装 | 使う場所 | 挙動 |
|---|---|---|
| 既定（同期） | 単体テスト | コールバックを即座に実行する。1手番が同期的に解決するので、演出待ちのためにタイマーを進める必要がない |
| `TIMED_SCHEDULER` | `App.vue`（実プレイ） | `setTimeout` で `battle.json` の `presentation` の尺だけ待つ |

演出待ちの間は `isPlayerTurn` が `false` になり、行動を受け付けない。
（第10フェーズで意味が変わった: `isPlayerTurn` は「行動速度キューがまだ空＝今ラウンドの
行動を誰も決めていない」ことを指す。行動を決めるとキューが組み上がり、実際にプレイヤーの
番が来るまでは `false` のまま——先手を取れない相手が先攻の場合、行動を決めた直後から
その相手の演出が挟まる）。
`reset()` / `giveUp()` は世代番号を進めて**保留中のコールバックを無効化**する
（終了後に古い演出が状態を書き換えるのを防ぐ）。

### 多段ヒットの演出待ち時間（第8フェーズで追加）

`repeat` op を使う多段ヒットスキル（弾幕等）は `damage`/`heal`/`shield` を同期的に何度も実行するため、
着弾演出（ヒットフラッシュ・ダメージポップアップ）は `multiHitIntervalMs`（`battle.json`、既定180ms）
間隔で後追い再生される（`useBattlePresentation.ts::drain()`）。次の手番へ進むタイミングが
`impactMs` という固定値だけを待っていると、ヒット数の多いスキルでは演出が終わる前に
相手の行動が始まってしまう。

```ts
// domain/battle/effectTiming.ts
// effect木を辿り、repeat.times を掛け合わせながら damage/heal/shield の発生回数を数える
export function estimateHitCount(nodes: readonly EffectNode[]): number

// composables/useBattleState.ts
function impactWaitMs(def: ActiveSkillDef, targetCount: number): number {
  const hitCount = estimateHitCount(def.effect) * Math.max(1, targetCount)
  return timing.impactMs + Math.max(0, hitCount - 1) * BATTLE.multiHitIntervalMs
}
```

プレイヤー・敵の両方の手番でこの待ち時間を使う（敵は対象が常にプレイヤー1体のため
`targetCount` は常に1）。正確なfx数の再現ではなく、次の手番までの待ち時間の**下限見積もり**でよい、
という設計。

> **多段ヒット中の表示ズレ（第8フェーズ Z-2 で修正）**: 上記の待ち時間延長とは別に、表示側
> （`useBattlePresentation.ts`）に不具合があった。多段ヒットの演出が始まる前の一瞬、
> 実際にはまだ倒していない敵の表示HPが「解決後の値」（＝しばしば0・死亡）にフォールバック
> していたため、弾幕を数発当てただけの時点で誤って死亡エフェクトが出て見えることがあった。
> `announce()` が呼ばれた瞬間（ダメージ解決の**前**）にプレイヤー・全敵の hp/alive を
> スナップショットしておく修正で解消した（ロジック側の勝敗判定は元から正しく、表示のみの不具合だった）。

---

## 行動順

**`agi` の実効値と特性を考慮したキュー**として構築する。プレイヤーと全ての敵を1つのキューに並べる。

```ts
export interface TurnEntry {
  combatantId: string
  agi: number          // 実効値（表示・デバッグ用）
  priority: number     // 並べ替えに使う最終値
}

export function buildTurnQueue(
  combatants: readonly Combatant[],
  agiOf: (c: Combatant) => number,
  alwaysFirstOf: (c: Combatant) => boolean,   // 第10フェーズで追加。守る/避ける/不意打ち 想定
): TurnEntry[]
```

### 並べ替え規則

1. `priority` の**降順**（大きいほど先に行動）
2. `priority` が同値の場合、**プレイヤーを優先**する
3. 敵同士が同値の場合、**敵の並び順（左→右）**で決定する

> 同値時の規則を固定するのは、乱数を使うと再現性がなくなりテストが書けないため。

`priority` は既定では `agi` の実効値と等しい。`alwaysFirstOf(c)` が true を返した対象は、
`priority` に `ALWAYS_FIRST_PRIORITY_BONUS`（AGIがどれだけ高くても超えられない大きな定数）を
加算する——AGIに関わらず必ず先手になる（第10フェーズで追加。守る/避ける/不意打ち 想定）。
先手同士が複数いる場合も、その中では通常どおりAGIで順序を決める。

```ts
priority = agiEffective + Σ(特性による優先度補正)
```

### キューの再構築

**ラウンドごとに再構築する。** ラウンド途中で `agi` が変化しても、そのラウンドの順序は変わらない。

> 途中で並べ替えると「まだ行動していない敵が行動済みになる／二重行動する」といった破綻が起きうるため。

---

## プレイヤーの行動選択

選択肢は**アクティブスキル4枠 + 守る + 様子を見る**の最大6つ。

| 行動 | クールタイム | 効果 |
|---|---|---|
| アクティブスキル1〜4 | スキル定義による | スキルの効果 |
| **守る** | 3 | そのターンのみ、自身のカット率に **+50%** |
| **様子を見る** | 0 | 何もしない |

### 「守る」の3ターン周期

```
ラウンド1: 守るを使用 → クールタイム3をセット
ラウンド2: 使用不可（残2）
ラウンド3: 使用不可（残1）
ラウンド4: 使用可能（残0）
```

### 「様子を見る」で詰みを防ぐ

クールタイムが 0 のため、**全スキルがクールタイム中でも必ず行動できる**。行動不能による詰みは発生しない。

### 使用可能ターン制限（`minRound`、第4フェーズで追加）

一部のアクティブスキルは `ActiveSkillDef.minRound`（省略可）を持ち、`state.roundCount` がこの値
未満の間は使用できない（例: `minRound:2` なら `roundCount` が0・1の間＝1・2ターン目は使えず、
3ターン目（`roundCount:2`）から使える）。プレイヤー・敵の両方に等しく適用される。

- **プレイヤー**: `useBattleState.ts::selectAction` が使用前に判定し、未達なら早期returnで
  選択を無視する（`if (def.minRound !== undefined && r.roundCount < def.minRound) return`）。
  UI側（`BattleScreen.vue`）でも選択不可＋グレーアウトの注記を出す
- **敵**: `turnQueue.ts::pickEnemySkill`/`previewEnemyNextSkill` が判定する（「敵の行動」節を参照）

効果テキストには `buildSkillText`（`skillText.ts`）が「Xターン目から使用可能。」を自動で追記する
（`flavorText` にはこの手の機能を持たせない方針。ユーザーフィードバックを受けた修正）。

### 「避ける」への置換

一部の特性により「守る」が「避ける」に**置き換わる**（両方は持てない）。

| | 守る | 避ける |
|---|---|---|
| クールタイム | 3 | 3 |
| 効果 | カット率 +50%（実数バフ） | 回避率の実効値に +50%（実数バフ） |

---

## フォーカス（対象選択）

```ts
export type FocusSide = 'enemy' | 'self' | 'ally'
export type FocusRange = 'single' | 'all' | 'adjacent3' | 'random'

export interface FocusSpec {
  side: FocusSide
  range: FocusRange
}
```

**JSON 上は平坦な2フィールド**（`defaultFocus` / `focusRange`）として記述し、ローダが `FocusSpec` へ正規化する（[07-data-schema.md](07-data-schema.md)）。設計文書の JSON 例に合わせるため。

各スキルは**デフォルトフォーカス**を持ち、プレイヤーは使用時に対象を変更できる。

| 範囲 | 内容 |
|---|---|
| `single` | 選択した対象1体 |
| `all` | 敵全体（または味方全体） |
| `adjacent3` | 選択した敵を中心に、**左右1体ずつを含む3体** |
| `random`（第4フェーズで追加） | 生存している敵からランダムに1体を選ぶ。プレイヤー視点のみ意味を持つ（敵視点は対象がプレイヤー1体のため無関係）。`resolvePlayerFocus()` が `rng` 引数を受け取って解決する（魔導式多連装戦略爆撃装備で使用。[05-skills.md](05-skills.md)参照） |

### 敵の並び順

`adjacent3` が成立するため、**敵は左右方向に順序を持つ**。`BattleState` に敵を配列として保持し、インデックスが並び順を表す。

```ts
/** 中心インデックスから隣接3体を解決する。端では2体になる */
export function resolveAdjacent3(enemies: readonly Combatant[], centerIndex: number): Combatant[] {
  const result: Combatant[] = []
  for (let i = centerIndex - 1; i <= centerIndex + 1; i++) {
    const e = enemies[i]
    if (e && e.alive) result.push(e)
  }
  return result
}
```

> **端の扱い**: 左端の敵を中心に選ぶと対象は2体になる。**空きを補って3体にはしない**（左端を選んだのに右へ2体広がるのは直感に反するため）。

### 撃破による並びの変化

敵が撃破されても**配列から削除せず `alive: false` にする**。インデックスを維持することで、`adjacent3` の位置関係が戦闘中に変わらない。

> 削除して詰めると「隣にいた敵を倒したら別の敵が隣に来る」という挙動になり、位置取りの意味が薄れる。表示上は撃破済みを除外するか、撃破状態で表示する（[08-ui.md](08-ui.md)）。

---

## 敵の行動

敵は `actionPattern` 配列に従い、**順番にスキルを使用してループする**。ランダムではなく決定的。

```ts
interface EnemyRuntime {
  patternIndex: number   // 次に使うスキルの位置
}
```

### 次スキルの公開

敵は**次に使用するスキルを公開する**。`TurnQueueBar.vue` に行動順と併せて表示する。

公開するのは**スキル名と属性まで**。`actionPattern` の並び全体は公開しない（設計文書「キャラクター詳細表示」）。

### 敵のフォーカス

敵のスキルもフォーカスを持つ。対象がプレイヤー1体のみのため、`side: 'enemy'`（敵から見た敵＝プレイヤー）の場合は**常にプレイヤーが対象**になる。`all` / `adjacent3` も実質プレイヤー1体に解決される。

敵が自己回復・自己バフを行う場合は `side: 'self'`。

> **味方は存在しない。** プレイヤー側は常に1体である。

### 敵のクールタイム

敵のアクティブスキルも**クールタイムを持つ**。`actionPattern` で指定されたスキルがクールタイム中の場合、**そのスキルを飛ばして次の使用可能なスキルへ進む**。すべてクールタイム中なら「何もしない」を行う。

```ts
/** パターンを進めながら、最初に使用可能なスキルを返す。全てCT中／minRound未達なら null */
export function pickEnemySkill(enemy: Combatant, content: BattleContent, roundCount: number): string | null {
  const pattern = enemy.actionPattern
  if (pattern.length === 0) return null
  const byId = new Map(enemy.actives.map(a => [a.id, a]))
  for (let i = 0; i < pattern.length; i++) {
    const idx = (enemy.patternIndex + i) % pattern.length
    const skillId = pattern[idx]
    const owned = byId.get(skillId)
    if (owned && owned.cooldown <= 0 && meetsMinRound(skillId, content, roundCount)) {
      enemy.patternIndex = (idx + 1) % pattern.length   // 使ったものの次から再開
      return skillId
    }
  }
  return null   // 全てクールタイム中／使用可能ターン未到達 → 何もしない
}
```

**飛ばしたスキルは消費扱いにしない**（`patternIndex` は実際に使用したものの次を指す）。次のターンにクールタイムが明ければ、そのスキルから再開される。`content`/`roundCount` は W1-S8（`minRound`、CLAUDE_TASKS.md 第4フェーズ）で追加された引数で、`meetsMinRound` は `content.skills.get(skillId).minRound` と現在のラウンド数を比較する。

「次に使うスキルの公開」も、この関数の結果を表示する（クールタイム中で飛ばされるスキルは公開しない）。

---

## 継続ダメージ（DOT）

**第4フェーズ（W1-S6）で追加。設計文書には存在しなかった仕組み。** 龍鱗のような
「毎ラウンド、最大HPの一定割合を確定でロスする」効果を表現する。

```ts
export interface PeriodicSelfEffect {
  kind: 'trueDamagePercentMaxHp'
  ratio: number      // 実効最大HPに対する割合（0.15 = 15%）
  sourceId: string
}
```

`Combatant.periodicSelfEffects: PeriodicSelfEffect[]` に登録された効果を、`endOfRound()` が
**クールタイム減算と同じループ内**（`applyPeriodicSelfEffects()`）で処理する。

```ts
function applyPeriodicSelfEffects(c: Combatant, content: BattleContent, emit: Emit): void {
  for (const pe of c.periodicSelfEffects) {
    if (!c.alive) break
    const dmg = Math.floor(pe.ratio * resolveEffectiveStats(c, content).hp)
    c.hp = Math.max(0, c.hp - dmg)
    emit({ effectId: 'fx_debuff', targetRef: 'source', combatantId: c.id, payload: { text: `-${dmg}`, sourceId: pe.sourceId } })
    if (c.hp <= 0) { c.alive = false; emit({ effectId: 'fx_defeat', targetRef: 'source', combatantId: c.id }) }
  }
}
```

- **シールド・カット率を経由せず、直接HPを減算する**（防ぎようがない）
- **自滅（戦闘不能）を許容する。** DOTでプレイヤーが力尽きた場合も、通常の被弾による敗北と
  同じ扱いになる（「エッジケース」節を参照）
- 効果を付与する側は宣言的op `periodicSelfDamage`（`ctx.source.periodicSelfEffects` へ登録する）が担う
- **戦闘終了時（`finishBattleOnVictory`）に必ずリセットする。** 戦闘をまたいでは持ち越さない
  （「戦闘間の引き継ぎ」節を参照）

---

## カウンター・反射（反撃）

**第4フェーズ（W1-S7）で追加。設計文書には存在しなかった仕組み。** 被弾しても即座には反撃せず、
**攻撃者の一連の行動（`repeat` を含む）がすべて終わってから、まとめて反撃する**
（カウンター＝`def`参照・反射板＝`ref`参照）。

```ts
export interface PendingCounter {
  scaleStat: 'def' | 'ref'
  rate: number
  element: Element   // 反撃自体の属性 兼 どの属性の被弾に反応するか
  sourceId: string
}
```

### 流れ

1. **反撃態勢に入る**: 宣言的op `counterStance`（自己対象）で `source.pendingCounter` をセットし、
   `queuedCounterHits` を 0 にリセットする
2. **被弾のたびに数える**: `damage` op が着弾を解決するたびに、対象に `pendingCounter` があり
   `element` が一致すれば `queuedCounterHits` を+1するだけで、その場では反撃しない
3. **まとめて反撃する**: 攻撃側の `useActiveSkill()` が `runEffects()`（一連の効果解決）を終えた
   **直後**に `flushCounterRetaliations()` を呼び、`queuedCounterHits > 0` だった対象ぶんだけ、
   通常の `damage` op（命中判定・カット率・属性相性込み）で攻撃者へ反撃する
4. **1回で使い切り**: 反撃後、`pendingCounter` を消費してクリアする（次に再度 `counterStance` を
   使うまで反撃態勢は復活しない）

`element` は「反撃自体の属性」と「どの属性の被弾に反応するか」を兼ねる（カウンターは
`physical` の被弾にのみ反応、反射板は `magical` の被弾にのみ反応）。

> **実装時に踏んだ罠**: 当初 `flushCounterRetaliations` は対象だった全員の `pendingCounter` を
> 無条件でクリアしていたため、`counterStance` 自体（被弾を伴わない自己対象の宣言的op）を
> 発動した直後に、その場で反撃態勢が消えてしまうバグがあった。`queuedCounterHits === 0` の
> 対象には `pendingCounter` に一切触れないよう修正して解消した（統合テストで検出）。

### 戦闘間・戦闘終了時の扱い

`pendingCounter`・`queuedCounterHits` は戦闘終了時（`finishBattleOnVictory`）にリセットする。
戦闘をまたいで反撃態勢を持ち越すことはない（「戦闘間の引き継ぎ」節を参照）。

---

## 戦闘間の引き継ぎ

**戦闘終了時に、現在HPだけを引き継ぎ、それ以外はすべてリセットする。**

| 対象 | 戦闘間 |
|---|---|
| **現在HP** | **引き継ぐ**（ただし戦闘終了ごとに `postBattleHealRate` ぶん自動回復する。下記） |
| **シールド残量** | **引き継ぐ**（無期限のため） |
| バフ・デバフ（`thisBattle` 以下の一時補正） | **リセット** |
| クールタイム | **リセット**（全て 0） |
| `permanent` スコープの補正 | 引き継ぐ（ラン終了まで有効） |
| スキル・特性・レベル・スタック | 引き継ぐ（成長のため当然） |
| 継続ダメージ（DOT、`periodicSelfEffects`） | **リセット**（第4フェーズで追加。龍鱗等） |
| 反撃態勢（`pendingCounter`/`queuedCounterHits`） | **リセット**（第4フェーズで追加。カウンター・反射板） |
| 変化先スキル専用ボーナス（`pendingTransformBonus`） | **リセット**（第4フェーズで追加。一発ツモ想定） |

### HPを引き継ぐ理由

**HPまで回復すると、ランに終わりが来なくなる。** 消耗が蓄積することで「いつか力尽きる」という緊張感と、回復手段への投資判断が生まれる。

**当初の設計は「戦闘間でのHP回復は行わない」だったが、実プレイのフィードバックを受けて
第4フェーズ以降で方針を修正した。** 現在は特性の有無に関わらず、**戦闘勝利のたびに無条件で
最大HPの `postBattleHealRate`（`battle.json`、既定20%）ぶんを自動回復する**
（`battleEngine.ts::finishBattleOnVictory`）。「HPまで全回復すると、ランに終わりが来なくなる」
という当初の懸念に対しては、無条件回復を最大HPの一部（既定20%、調整前提の仮値）に留めることで、
消耗が緩やかに蓄積するバランスを狙っている。

これとは別枠で、特性によって戦闘間の追加回復を付与することも可能（`healBetweenBattles` op、
「戦闘終了時にHPを一定量回復する」等）。この特性は**戦闘勝利直後、上記の無条件回復のあと、
ドラフトの前**に適用する。

### シールドの「無期限」

設計文書のとおり、シールドは**時間経過・ターン経過で消えず、戦闘をまたいでも残る**。消滅するのはダメージを吸収して耐久値が 0 になったときのみ。

これにより、シールド系（加護カテゴリ）は「戦闘終盤に張っておけば次の戦闘の頭で活きる」という運用が成立し、HPが回復しない設計に対する数少ない緩衝手段として機能する。

### リセットのタイミング

**戦闘終了時**（勝利判定の直後、ドラフトの前）に行う。次の戦闘開始時ではない。

> ドラフト画面でステータスを確認したとき、一時的なバフが乗ったままの値が見えると誤解を招くため。

---

## ラン終了条件

**2026-09-05（第6フェーズ）で見直し。** 当初は「ボスに1回勝利した時点でクリア」だったが、
ボスが `groupOrder`（既定 A〜E）を巡回して繰り返し出現する方式に変更したため、
**1回のボス撃破では終了しない**（真のクリア判定は下記）。

| 条件 | 実装 |
|---|---|
| **真のクリア** | ボスを規定回数（既定 `groupOrder.length × lapsForTrueClear` = 25回）撃破した時点で終了 |
| **プレイヤーが戦闘不能**（敗北） | HPが0以下 |
| **自分で終了を選ぶ** | 既存のギブアップボタン |

いずれも `gameState.startThrowing()` を呼び、`throwing` へ遷移する。以降の投擲・エンディングは他ジャンルと共通。

### 敵の出現・ボスの出現タイミング（敵グループ/難易度スケーリング）

**実装済み（第6フェーズ、第8フェーズでコンテンツ拡充）。** `src/data/config/encounter_groups.json`
（`ENCOUNTER_GROUPS`）で管理する。数値・グループ構成は調整前提の仮値。

```jsonc
{
  "groupOrder": ["A", "B", "C", "D", "E"],
  "lapsForTrueClear": 5,
  "bossIntervalBattles": 10,
  "bossDraftRounds": 3,
  // A〜E すべてにセットが存在する（第6フェーズ完了時点ではD/Eが空だったが、第8フェーズで埋めた）
  "groups": {
    "A": ["set_bat_solo", "set_boss_manual_keeper", "set_goblin_bat_duo", "set_slime_solo"],
    "B": ["set_bat_elder_solo", "set_boss_iron_sentinel", "set_goblin_raider_solo", "..."],
    "C": ["set_boss_arch_cultist", "set_cultist_solo", "set_knight_solo", "..."],
    "D": ["set_boss_swamp_horror", "set_cultist_zealot_solo", "set_fallen_order_duo", "..."],
    "E": ["set_boss_night_wraith", "set_goblin_chief_solo", "set_orc_warlord_solo"]
  },
  // 第8フェーズで minBattleIndex:25/40/60 の3段を追加し、後半の戦闘でC〜Eへ重みが移るようにした
  "spawnWeightTiers": [
    { "minBattleIndex": 0, "weights": { "A": 0.8, "B": 0.2 } },
    { "minBattleIndex": 5, "weights": { "A": 0.5, "B": 0.3, "C": 0.2 } },
    { "minBattleIndex": 15, "weights": { "B": 0.5, "C": 0.5 } },
    { "minBattleIndex": 25, "weights": { "B": 0.2, "C": 0.5, "D": 0.3 } },
    { "minBattleIndex": 40, "weights": { "C": 0.3, "D": 0.5, "E": 0.2 } },
    { "minBattleIndex": 60, "weights": { "D": 0.4, "E": 0.6 } }
  ]
}
```

- **敵セット** (`src/data/rpg/enemy-sets/*.json`): 1〜5体の敵の組み合わせを1単位として登録する
  （`EnemySet { id, label, members: { enemyId, statsOverride? }[] }`）。`groups` は敵IDではなく
  **セットID** の配列を持つ。同時出現を避けたい／強さを調整したい組み合わせをセット側で固定できる
- **通常戦**: `spawnWeightTiers` から現在の `battleIndex` に該当する（`minBattleIndex` 以上で最も新しい）
  ティアの重みでグループを1つ抽選し、そのグループ内の**非ボスセット**から一様ランダムに1つ選ぶ
- **ボス戦**: `(battleIndex+1) % bossIntervalBattles === 0` の戦闘。`groupOrder` を出現回数ぶん巡回した
  グループの**ボス入りセット**（`isBoss:true` の敵を含むセット）から一様ランダムに1つ選ぶ。
  該当グループにボス入りセットが無ければ全グループを横断して探すフォールバックを行う
- **ボス撃破の見返り**: 通常の1回のドラフトの代わりに `bossDraftRounds`（既定3）回連続でドラフトを行う
  （`state.pendingDraftRounds`）。真のクリアでない限り、ボスを倒してもランは終了せず次の戦闘へ進む
- 実装: `src/domain/battle/battleEngine.ts::pickEnemyDefs()`（グループ/セット抽選）・
  `isBossBattleIndex`/`bossOccurrenceNumber`/`bossGroupFor`/`isTrueClearBattleIndex`（判定用の純粋関数）
- 敵の視覚スケーリング（同時出現数に応じたスプライト縮小・並びの隙間調整）は
  `config/battle.json:enemyScaleByCount` → `BattleScreen.vue::enemySpriteHeight()`

### ドラフト後の分岐（スキルパネルの挟み込み、第7フェーズで追加）

戦闘勝利のたびに、通常は1回・ボス撃破時は `bossDraftRounds`（既定3）回連続でドラフトを行う
（前節）。その**すべてが完了したあと**、`useBattleState.ts::proceedAfterDraftRound()` が
次に進む状態を判定する。

```ts
function proceedAfterDraftRound(): void {
  if (r.pendingDraftRounds > 1) {
    // 残りのボス撃破ドラフトを消化する
    return
  }
  if (r.battlesWon > 0 && r.battlesWon % SKILL_POINTS.panelIntervalBattles === 0) {
    const occurrence = r.battlesWon / SKILL_POINTS.panelIntervalBattles
    const cycle = SKILL_POINTS.panelSkillPointsCycle
    state.skillPoints += cycle[(occurrence - 1) % cycle.length]
    state.statPoints += SKILL_POINTS.panelStatPoints
    state.status = 'skillPanel'
    return
  }
  startBattle()
}
```

- `panelIntervalBattles`（`skill_points.json`、既定5）戦ごとに `status: 'skillPanel'` へ遷移する。
  ドラフトの**代替ではなく追加**の画面。真のクリアで既にランが終わっている場合はこの関数自体が
  呼ばれない
- 付与されるスキルポイントは固定値ではなく `panelSkillPointsCycle`（既定 `[1, 2]`）を、
  このパネルが何回目の出現かで周期的に参照する（1回目→`[0]`=1、2回目→`[1]`=2、3回目→`[0]`=1、…）。
  第9フェーズで導入: 固定3ポイントだと1回目のパネル（5戦目終了時）だけで
  `pointsForLevel[2]=3` に届きLv3が確定してしまい強すぎたため、初回配分を1に抑えた
- `bossIntervalBattles`（既定10）は `panelIntervalBattles`（既定5）の**倍数**であるため、
  ボス戦の直後は必ず「3連続ドラフト → スキルパネル」の両方が続けて発生する
- スキルパネルで行えること（アクティブの入れ替え・スキルポイント配分・ステータスポイント配分）の
  詳細は [06-draft.md](06-draft.md) を参照。本ドキュメントの範囲は状態遷移のタイミングのみ

---

## スコア

**スコア式は未定（実装後に持ち越し）。** 設計文書の暫定案を初期値として `src/data/genres/rpg.json` の `scoreFormula` に置く。

```
battlesWon * 300 + bossDefeated * 3000 + maxSkillLevel * 200 + traitsAcquired * 150
```

### `ScoreVars` の拡張

現在の `ScoreVars`（`src/domain/types.ts:416-431`）には戦闘用の変数が存在しない。以下を**オプショナルフィールドとして**追加する。

```ts
export interface ScoreVars {
  // ... 既存 ...
  // ── RPG 戦闘用（rpg 以外のジャンルでは未設定） ──────────
  battlesWon?: number       // 勝利した戦闘数
  bossDefeated?: number     // ボス撃破フラグ（0 or 1）
  maxSkillLevel?: number    // 到達した最高スキルレベル
  traitsAcquired?: number   // 獲得した特性の数
}
```

#### なぜオプショナルにするか（実コード調査の結果）

| 調査項目 | 結果 |
|---|---|
| 変数解決の仕組み | `scoreCalc.ts:108-111` の `parseVar()` が `(vars as Record<string, number>)[name] ?? 0` で**動的に索引する**。変数名ごとの分岐は存在しない |
| `ScoreVars` の構築箇所 | **`src/game/sideScroller.ts:378` の1箇所のみ**（`grep` で全数確認済み） |

したがって:

- **評価側は何も変更しなくてよい**（動的索引のため、フィールドを足せばそのまま式で使える）
- ただし**必須フィールドとして追加すると `sideScroller.ts:378` が型エラーになる**（4フィールドの指定漏れ）
- **オプショナルにすれば `sideScroller.ts` は無変更で済む。** 未設定時は `parseVar` の `?? 0` が働き、既存ジャンルのスコアに影響しない

> 設計文書の「実装上の注意点」は「型定義と評価の対応変数リストの両方を更新」としているが、**実コードには「対応変数リスト」に相当するものが存在しない**（動的索引のため）。設計文書の記述が実装と異なるため、本仕様では上記の実測に従う。

#### 戦闘側での構築

`useBattleState` が独自に `ScoreVars` を構築する。既存フィールドは 0 で埋める。

```ts
const vars: ScoreVars = {
  distance: 0, kills: 0, combo: 0, exp: 0, beatHits: 0, survivedSec: 0,
  accuracy: 0, maxCombo: 0, deaths: 0, itemsCollected: 0,
  bossKills: 0, stealthBonus: 0, colorTouches: 0,
  battlesWon: state.battlesWon,
  bossDefeated: state.bossDefeated ? 1 : 0,
  maxSkillLevel: maxOwnedSkillLevel(state),
  traitsAcquired: state.player.traits.length,
}
```

丸めは既存に合わせ `Math.max(0, Math.round(...))` とする（`sideScroller.ts:396` と同じ）。

### `playScore` の算出タイミング

ラン終了時（`startThrowing()` の直前）に一度だけ `evalScoreFormula` を通し、`useBattleState.playScore` に確定させる。

---

## エッジケース

| ケース | 扱い |
|---|---|
| 敵が0体の戦闘 | 発生させない。敵生成時に最低1体を保証する |
| プレイヤーと敵が同時に戦闘不能 | **プレイヤーの敗北**を優先する（ボス撃破フラグは立てない） |
| ボスに勝利したがプレイヤーHPが0 | 上記と同じ。敗北扱い |
| 多段ヒットの途中で敵が全滅 | 残りのヒットは消滅する。戦闘は即座に勝利へ |
| ドラフト中にラン終了条件 | ドラフトはプレイヤーの勝利後にのみ発生するため、この状態は起きない |
| `adjacent3` で全対象が撃破済み | 効果を適用せず、エフェクトのみ再生する |
| クールタイム中のスキルを選択 | UI 側で選択不可にする。ロジック側でも防御的に弾く |
| `minRound` 未達のスキルを選択（実装後に追加） | プレイヤー側は UI で選択不可・グレーアウト。敵側は `pickEnemySkill()` が該当スキルを飛ばして次の使用可能スキルへ進む（クールタイム中のスキルと同じ扱い） |
| 継続ダメージ（DOT）で自滅する（実装後に追加） | `endOfRound()` の `applyPeriodicSelfEffects()` はシールド・カット率を無視して直接HPを減らすため、そのまま0以下になれば `alive:false` にして通常の撃破と同じ `fx_defeat` を発火する。**自滅を許容する**（龍鱗のリスク・リターンの一部） |
| カウンター反撃の対象（攻撃者）が反撃で撃破される | 通常の `damage` opを経由するため、撃破判定・エフェクトとも通常の攻撃と同じに扱われる。反撃はまとめて処理されるため、複数体から同時に反撃を受けて多重に撃破処理が走ることはない（1回の `flushCounterRetaliations()` で完結） |
| ボスの巡回グループに `isBoss:true` を含むセットが1つも無い | 全グループを横断してボス入りセットを探すフォールバックで選出する。コンテンツ不足でも戦闘が成立しなくなることを防ぐための保険で、発生時は警告ログを出す |
| 5体編成での単体フォーカス（`single`/`random`） | `resolveAdjacent3`/`resolvePlayerFocus`/`centerEnemyIndex` はいずれも配列長に依存しない実装のため、体数によらず正しく機能する（敵グループ/難易度スケーリング導入時に回帰テスト済み） |

---

## 影響を受ける既存ファイル

| ファイル | 変更 |
|---|---|
| `src/domain/battle/battleEngine.ts` | 新規 |
| `src/domain/battle/turnQueue.ts` | 新規 |
| `src/domain/types.ts` | `ScoreVars` に4フィールドを**オプショナルで**追加 |
| `src/domain/scoreCalc.ts` | **変更不要**（`parseVar` が動的索引のため） |
| `src/game/sideScroller.ts` | **変更不要**（オプショナルにしたため） |
| `src/data/genres/rpg.json` | `scoreFormula` 差し替え |
| `src/data/config/battle.json` | `enemyScaleByCount` 等 |
| `src/data/config/encounter_groups.json` | 敵グループ/難易度スケーリング設定（第6フェーズで新設） |
| `src/data/rpg/enemy-sets/*.json` | 敵セット定義（第6フェーズで新設） |

---

## 実装後の記録

設計当初は「単体のCanvasゲームループの延長」程度の想定だったが、実装後の複数フェーズを経て、ラン全体の進行管理（敵グループ・ボス周回・スキルパネル）がこのドキュメントの中心的な内容になった。本文中に「実装後に追加」等の注記を随所に入れてあるので詳細はそちらを参照し、ここでは変更の全体像だけまとめる。

- **ラン終了条件を「ボス即撃破でクリア」から「5周＝25回目のボス撃破で真のクリア」へ変更**（第6フェーズ）。`bossesDefeatedCount`（通算ボス撃破数）を新設し、`groupOrder.length × lapsForTrueClear` 回目のボス撃破でのみランを終了させる。それ以外のボス撃破では代わりにドラフトが `bossDraftRounds`（既定3）回連続する見返りを与える（上記「ラン終了条件」節）
- **敵の出現ロジックを、単体JSONの一様ランダム抽選から「敵セット×出現グループ」の重み付き抽選へ全面置き換え**（第6フェーズ、第8フェーズでグループD/E含む全グループのコンテンツを拡充）。敵は1〜5体の編成（`enemy-sets/*.json`）としてまとめて出現し、`battleIndex` に応じた `spawnWeightTiers` で出現グループ（A〜E）の確率が段階的に変化する（上記「敵の出現・ボスの出現タイミング」節）
- **5戦ごとのスキル/ステータス配分パネル（`status:'skillPanel'`）を追加**（第7フェーズ）。通常のドラフト（ボス撃破時は3連続ドラフト）が完全に終わったあとに挟まる、ドラフトとは別枠の画面（上記「ドラフト後の分岐」節）。詳細な操作内容は [06-draft.md](06-draft.md) の管轄
- **継続ダメージ（DOT）・反撃（カウンター/反射板）・使用ターン制限（`minRound`）を新設**（第4フェーズ、構造変更9件のうち3件）。いずれも設計文書には存在しなかった仕組み。DOTは`endOfRound()`でシールドを無視して直接HPを減らし自滅を許容、反撃は被弾のたびに数えて攻撃側の行動完了後にまとめて反撃、`minRound`は`turnQueue.ts`/`useBattleState.ts`の両方でガードする（上記「継続ダメージ」「カウンター・反射」節）
- **戦闘間のHP自動回復（`postBattleHealRate`）を追加**。当初の「戦闘間でのHP回復は行わない」という設計を、実プレイのフィードバックを受けて修正した（上記「戦闘間の引き継ぎ」節）
- **多段ヒット演出とターン進行のタイミングを分離して同期**。弾幕等の多段ヒットスキルで、演出が終わる前に次の手番が始まってしまう不具合を、`effectTiming.ts::estimateHitCount()` によるヒット数見積りで解消した
- **`FocusRange` に `'random'`（ランダム単体）を追加**（第4フェーズ）。`resolvePlayerFocus()` が `rng` を受け取って解決する

数値（`spawnWeightTiers` の重み・`bossIntervalBattles`・`panelIntervalBattles` 等）はすべて調整前提の仮値であり、本ドキュメント作成時点でもバランス再調整が続いている（第8フェーズ）。
