# 02. domain 層（`src/domain/battle/**`）

親: [README.md](README.md) / 対象: 31ファイル・約4,100行

---

## 1. 重複ロジック

### 1-1.【high】「所持特性・パッシブの `effect[]` を走査して op を集計する」同型ループが7箇所

| 箇所 | 関数 | 対象 op | 返り値 | レベル倍率 |
|---|---|---|---|---|
| `effectOps/damage.ts:44-54` | `collectTraitCutRates` | `cutRate` | `number[]` | 掛けない |
| `damagePreview.ts:41-51` | `collectTraitCutRates`（**同名別実装**） | `cutRate` | `number[]` | 掛けない |
| `effectOps/heal.ts:28-38` | `healTakenMultiplier` | `healTaken` | `1+Σ` | 掛けない |
| `stats.ts:151-172` | `collectEffectMultiplier` | `effectBoost` | `1+Σ` | **掛ける** |
| `stats.ts:128-144` | `accumulatePassiveStatBoosts` | `statBoost` | `void` | 掛ける |
| `damageCalc.ts:50-66` | `computeAffinityStage` | `elementAffinity` | 段階和 | 掛けない |
| `battleEngine.ts:395-400` | `hasReplaceGuard` | `replaceGuard` | `boolean` | — |
| `battleEngine.ts:516-528` | （無名インライン） | `healBetweenBattles` | HPへ直接反映 | — |

**なぜ問題か:** 宣言的op（実行本体を持たず、読み取り側が意味を与える op）7種の意味が、この7箇所に散っている。
新しい宣言的opを足すとき「どこに集計関数を書くか」の規則がない。さらに **レベル倍率を掛けるか否かが関数ごとに暗黙に異なり、
意図的な差なのか書き忘れなのかコードから判別できない。**

**修正案（Phase 5）:** `src/domain/battle/ownedEffects.ts` を新設し、走査の骨組みを1本化する。

    export interface OwnedEffectHit { node: EffectNode; levelMult: number; sourceKind: 'trait' | 'passive' }
    export function scanOwnedEffects(
      c: Combatant, content: BattleContent, op: string,
      opts?: { traits?: boolean; passives?: boolean },   // 既定は両方 true
    ): OwnedEffectHit[]

`levelMult` を **明示的に返す** ことで「掛ける／掛けない」の差が呼び出し側に見える形で残り、現状の挙動をそのまま写せる。
走査範囲の差（heal/damage は特性のみ、stats は特性+パッシブ）は `opts` で表現でき、機械的に等価変換できる。

### 1-2.【high】`pickEnemySkill` と `previewEnemyNextSkill` がほぼ完全な複製

`turnQueue.ts:74-89` と `:92-102`。ループ構造・条件（`owned && owned.cooldown <= 0 && meetsMinRound(...)`）・
戻り値が同一で、**差は `pickEnemySkill` が `enemy.patternIndex` を書き戻すことだけ**。
`turnQueue.test.ts:150` に「プレビューは実際に選ばれるスキルと一致する」というテストがあるのは、
この重複が壊れることを既に恐れている証拠。

**修正案（Phase 2）:** 純粋関数 `findNextUsableSkill(enemy, content, roundCount)` へ1本化し、
`previewEnemyNextSkill` は結果を返すだけ、`pickEnemySkill` は結果の `nextIndex` を書き戻してから返す。
既存テスト2本がそのまま回帰テストになる。これは §7-3（敵の行動パターン拡張）の前提にもなる。

### 1-3.【high】`damagePreview.ts` が `effectOps/damage.ts` のパイプラインを再実装している

| `damagePreview.ts` | 対応する `effectOps/damage.ts` |
|---|---|
| `:37-39 shieldCutRateFor` | `:115-117`（**同名 export が既にあるのにコピーしている**） |
| `:41-51 collectTraitCutRates` | `:44-54` |
| `:53-55 readTemporaryCutRate` | `:119-121 readTemporaryFlat`（名前だけ違う） |
| `:102-119` 組み立て | `:59-97` |

**すでに乖離が発生している。** `damagePreview.ts:65` は `node.scale` を `{ stat; rate }` としか読まないため
`scale.statOptions`（`damage.ts:36-41` が対応、実データは `skill_tsumo.json`）を無視し、
`sourceStats[undefined]` → **`NaN` を返す**。現在は敵スキルのプレビューにしか使われず、
敵定義に `statOptions` を使うものが無いため露見していないだけ。

**修正案（Phase 5）:** `effectOps/damageFormula.ts` を新設し「1ノード分のダメージ計算（乱数抜き）」を共有する
（`computeOneHitDamage(...)` → `{ finalDamage, affinityStage }`）。

> **⚠️ 統合すると `statOptions` 対応が preview にも波及し `NaN` → 正しい数値になる＝挙動が変わる。**
> バグ修正は [07-deferred.md](07-deferred.md) へ分離する。本計画では preview 側の現状挙動を維持したまま共有関数へ寄せるか、
> 統合自体を Phase 8 送りにする。**着手前に `damagePreview.ts` の特性テストを書くこと**（Phase 0。現状テストファイルが存在しない）。

### 1-4.【high】`zeroCategoryPoints` が3箇所で定義されている

- `skillDraft.ts:43-47`（正）
- `battleEngine.ts:558-562`（同一実装。**本番から未使用**。`battleEngine.test.ts:780` のみが呼ぶ）
- `useBattleState.ts:90-93`（private 再実装。**実際に本番で使われているのはこれ**）

`battleEngine.ts:554-556` のコメントは「エンジンからも参照するためここに置く」と言うが、エンジン本体は一度も呼んでいない。

**修正案（Phase 2）:** `skillDraft.ts` の1本に統一。`battleEngine.ts:558-562` を削除し、
`useBattleState.ts:90-93` を import に置換。テストの import 先を差し替えるだけ。

### 1-5.【med】カテゴリポイント寄与の計算式が2箇所

`skillDraft.ts:66-88 accumulateCategoryPoints`（`:74`/`:81`）と `:97-115 categoryContributionsOf`（`:105`/`:111`）に
「アクティブは `3 * level`、パッシブは `1 * level`、サブカテゴリは `subCategoryWeight(n)` 倍」が独立して書かれている。
片方だけ直すと **UI上で内訳と総計がズレる**。

**修正案（Phase 5）:** 既存の `contributionAmount`（`:57-63`）を唯一の計算点にし、
`accumulateCategoryPoints` をそのループへ書き換える。`skillDraft.test.ts:77-107` が総計側を検証しているので回帰は検出できる。

### 1-6.【med】`effect` 木のウォーカーが3つある

- `effectTiming.ts:17-29 estimateHitCount`（damage/heal/shield を数える。`onFirstIteration`/`onLastIteration` を**数えない**）
- `damagePreview.ts:58-81 sumDamageNodes`（damage だけ足す。onFirst/onLast を**数える**）
- `skillText.ts:92-104` の `repeat` ケース（テキスト化のため再帰）

`repeat` にフィールドを足すと3箇所を直す必要がある。

**修正案（Phase 5）:** `src/domain/battle/effectTree.ts` に `walkEffectNodes(nodes, visit)` を置き、3者ともその上に載せる。
**`effectTiming` の onFirst/onLast 非カウントが意図的か不明なため、移行時は現状の数え方を `visit` 側で再現して挙動を固定すること。**

### 1-7.【med】「レベル倍率をこのスキルに適用するか」の三項式が6箇所

`ctx.skill.kind === 'active' ? levelMultiplier(ctx.level) : 1` が
`effectOps/damage.ts:62` / `heal.ts:45` / `shield.ts:28` / `modifier.ts:42` / `damagePreview.ts:98` に、
そして `skillText.ts:222` だけ `def.kind === 'trait' ? 1 : ...` と **条件が違う**（passive に対して結果が異なる）。
現状 passive は `runEffects` を通らないため露見しないが、規約が2種類あるのは危険。

**修正案（Phase 5）:** `stats.ts` に `skillLevelMultiplier(def, level)` を1本置いて6箇所を置換。
統一先は多数派の「active のみ倍率」。`skillText.test.ts:61` で passive 表示が変わらないことを確認する。

### 1-8.【med】クリティカル抽選の2行ペアが3箇所

`damage.ts:81-82` / `heal.ts:53-54` / `shield.ts:33-34` で `rollCriticalStacks` + `criticalMultiplierForStacks` が完全同一。
`emitCriticalEffect` は既に切り出されているのに抽選側は未切り出し。

**修正案（Phase 5）:** `damageCalc.ts` に `rollCriticalMultiplier(stats, rng)` を追加して3箇所置換。

### 1-9.【low】成長ステータスの一覧が3箇所

- `types.ts:26 GROWTH_STAT_KEYS = ['hp','str','def','int','ref','agi']`
- `skillDraft.ts:173 FALLBACK_STATS`（**内容が完全一致**）
- `battleEngine.ts:68 ['str','def','int','ref','agi']`（hp を別扱いする部分集合）

**修正案（Phase 2）:** `FALLBACK_STATS` を削除して `GROWTH_STAT_KEYS` を使う。
`battleEngine.ts:68` は `GROWTH_STAT_KEYS.filter(k => k !== 'hp')` に。

### 1-10.【low】ディスパッチループが二重実装

`effectOps/registry.ts:24-35 runEffects` と `effectOps/repeat.ts:41-47 runNodes`。差は「thisHit をいつクリアするか」だけ。
警告文言も `registry.ts:28` と `repeat.ts:44` で異なる。

**修正案（Phase 2）:** `registry.ts` に private `dispatchNodes(nodes, ctx)` を切り出し、
`runEffects` = `dispatchNodes` + クリア、`repeat` は `dispatchNodes` を import。

---

## 2. 責務漏れ・神モジュール・長すぎる関数

### 2-1.【high】domain に表示文字列・CSS変数名が入り込んでいる

- `skillText.ts:19-31 CATEGORY_COLOR` の値が **`'var(--battle-category-vitality)'` 等の CSS カスタムプロパティ文字列**。
  domain が「battle-screen の CSS に特定の変数名が存在する」ことに依存している（コメント自身が認めている）。
- `skillText.ts:13-16, 40-48, 198-201` — `CATEGORY_LABEL` / `STAT_LABEL` / `ELEMENT_LABEL` / `MODIFIER_SCOPE_LABEL`（日本語UIラベル表）。
- `damagePreview.ts:29-35 MAGNITUDE_LABEL`（'無傷' / '小ダメージ' …）。
- `battleEngine.ts:513, 526` — **エンジンが日本語の文章を組み立てている**（`lastBattleEndNotices.push('戦闘後の回復で…回復した')`）。
- `battleEngine.ts:63` — プレイヤー名 `'あなた'` がエンジンにハードコード。

**修正案（Phase 3、段階的）:**

1. **まず `CATEGORY_COLOR` だけ** を Vue 側（`src/components/battle/` のテーマ定義）へ移す。参照元が `BattleScreen.vue` のみなので機械的・無リスク。
2. ラベル表の移設は、[04-components.md](04-components.md) §4 の「フォーマット関数を `skillText.ts` へ集約する」と逆向きになる。
   **`skillText.ts` を「表示テキスト生成の単一の置き場」と位置づけ、`src/domain/battle/` に置いたままにする**のが現実解。
   ただしファイル冒頭に「本モジュールは presentation 寄りであり純粋ロジックではない」と明記する。
3. `lastBattleEndNotices: string[]` の構造化は `battleEngine.test.ts:726,737` が文言を検査しているため差分が広い。
   → [07-deferred.md](07-deferred.md)。

### 2-2.【high】`BattleState` に UI 状態が入っている

`types.ts:457-464` の `ui { statusPanelMode, showBuffDiff, statusPanelCollapsed, skillListCollapsed }` と `seenIds`。
パネルの開閉という純粋な view state が、ターン進行・スコアと同じ domain state に同居している。
**`battleEngine` / `skillDraft` / `skillPanel` からの参照はゼロ（grep 確認済み）。**

**修正案（Phase 3）:** `BattleState` から `ui` / `seenIds` を外し、`useBattleUiFlags`（→ [03-composables.md](03-composables.md) §1）の
ローカル `reactive` へ移す。**移動だけで挙動不変。**
`backgroundId`（`:430-431`）も描画都合だが `pickBackgroundId` が domain 側で抽選するため現状維持でよい。

### 2-3.【high】`backdrop.ts`（326行）は domain ではなくレンダリング層

ファイル全体が「320×180 キャンバス上の矩形・多角形座標」を生成する描画コード。
`SCENE_W/SCENE_H`(`:15-16`) / `skyBands`(`:265`) / `glowRings`(`:280`) / `mixHex`(`:301`) は
`BattleBackdrop.vue` 専用で、ゲームルールと一切関係ない。

**修正案（Phase 3）:** `src/components/battle/backdrop/` へ移設。ファイル移動 + import パス変更のみで挙動不変
（`backdrop.test.ts` の import も1行）。移設後に300行超の分割を検討する（形状定数の const 群を別ファイルへ）。

### 2-4.【med】`battleEngine.ts`（564行）が8関心の神モジュール

**分割案（`battleEngine.ts` は re-export バレルとして残せば全 import が無傷）:**

| 新ファイル | 移すもの（現行行） | 概算 |
|---|---|---:|
| `combatantFactory.ts` | `INITIAL_SKILLS` / `randRange` / `freshCombatant` / `initPlayer` / `spawnEnemyFromDef` (`:30-97`) | 70行 |
| `encounter.ts` | `isBossBattleIndex` 〜 `pickEnemyDefs` / `EnemySpawnPick` (`:99-222`) | 125行 |
| `stats.ts`（既存へ追記） | `resolveEffectiveStats` (`:228-248`) | 21行 |
| `turnQueue.ts`（既存へ追記） | `resolvePlayerFocus` / `resolveEnemyFocus` (`:250-276`) | 27行 |
| `skillExecution.ts` | `useActiveSkill` / `flushCounterRetaliations` / `useBuiltinAction` / `hasReplaceGuard` / `enemyTakeTurn` (`:278-429`) | 152行 |
| `roundLifecycle.ts` | `endOfRound` / `applyPeriodicSelfEffects` / `checkBattleOutcome` / `finishBattleOnVictory` / `buildBattleScoreVars` (`:433-552`) | 120行 |
| `battleEngine.ts`（残） | 上記の re-export のみ | 20行 |

`resolveEffectiveStats` を `stats.ts` へ移すと `stats.ts` ← `battleEngine.ts` の依存が逆転して循環が解ける
（現在 `damagePreview` / `_helpers.ts` がこの1関数のために `battleEngine` を import している）。

### 2-5.【med】`types.ts`（519行）が全レイヤの型の置き場

コンテンツ定義（JSON由来）・ランタイム状態・UI状態・エフェクト実行コンテキスト・
ランタイム値（`PERCENT_STAT_KEYS`:47 / `CATEGORY_IDS`:77）・判定関数（`isPercentStat`:51-53）が同居。

**分割案（`types.ts` はバレルとして残す）:**

| 新ファイル | 内容（現行行） |
|---|---|
| `types/stats.ts` | `BattleStats` / `StatKey` / `GROWTH_STAT_KEYS` / `STAT_KEYS` / `PERCENT_STAT_KEYS` / `isPercentStat` / `StatModifier` / `EffectiveStats` (`:9-62`) |
| `types/content.ts` | `Element` 〜 `BattleContent`（`:64-233`, `:355-363`） |
| `types/combatant.ts` | `Owned*` / `TemporaryModifier` / `PeriodicSelfEffect` / `PendingCounter` / `PendingTransformBonus` / `Combatant` (`:235-353`) |
| `types/state.ts` | `TurnEntry` / `PlayerAction*` / `DraftOption` / `BattleStatus` / `BattleState` / `ScoreVarsBattle` (`:365-479`) |
| `types/effects.ts` | `EffectNode` / `ModifierScope` / `EffectRequest` / `EffectPayload` / `EffectContext` / `EffectOp` (`:96-109`, `:481-519`) |

### 2-6.【med】60行超・複数責務の関数

| 関数 | 場所 | 行数 | 抱えている責務 |
|---|---|---:|---|
| `nodeToTokens` | `skillText.ts:70-187` | 118 | 15 op ぶんの文章生成が1つの switch。op を足すたび伸びる |
| `damageOp.execute` | `effectOps/damage.ts:58-111` | 54 | 参照値解決 / 命中判定 / カウンター積み / crit抽選 / 効果倍率 / カット率 / 相性 / HP反映 / fx 6種の emit |
| `useActiveSkill` | `battleEngine.ts:282-334` | 53 | transformBonus 消費 / onCast fx / runEffects / カウンター清算 / transformsInto 差し替え |
| `finishBattleOnVictory` | `battleEngine.ts:491-536` | 46 | 状態リセット / 無条件回復 / 特性回復 / HPクランプ / 進行カウンタ / 通知文生成 |
| `pickEnemyDefs` | `battleEngine.ts:182-222` | 41 | ボス判定 / 重み抽選 / フォールバック2種 / メンバー展開 |

**修正案（Phase 4）:**

- `nodeToTokens` → `skillText/opText/<op>.ts` に `(node, mult) => SkillTextToken[]` を置き、`Record<string, OpTextFn>` で引く。
  effectOps レジストリと同じ形になり「op を足す = ファイルを足す」に揃う（→ §7-1 の緩和策）。
- `damageOp.execute` → §1-3 の `computeOneHitDamage` 抽出 + `emitDamageEffects(...)` 抽出で20行程度に。
- `finishBattleOnVictory` → `resetBattleScopedState` / `applyBetweenBattleHeals` / `advanceRunCounters` の3つへ
  （`:495-501` / `:503-529` / `:531-535` がそのまま境界）。

### 2-7.【low】`skillDraft.ts` が3関心を抱えている

`:13-37`（レベル制度）と `:39-121`（カテゴリポイント）はドラフトと独立に使われている
（`skillPanel.ts:9` はレベル制度だけ、`useBattleState.ts:579` はカテゴリだけ）。
**最新コミットで「ドラフト運からの脱却」を行ったのにファイル名はドラフトのまま**という名実の乖離もここ。

**修正案（Phase 4）:** `skillLevel.ts`(`:13-37`) と `categoryPoints.ts`(`:39-121`) へ切り出し、
`skillDraft.ts` は候補プール構築 + 抽選 + 適用（`:123-257`）に絞る。

---

## 3. 型設計

### 3-1.【high】`EffectNode` の `[key: string]: unknown` 逃げ

`types.ts:96-99`: `export interface EffectNode { op: string; [key: string]: unknown }`

全 op が未検証の `as` キャストで値を取り出している
（`damage.ts:24-31` / `heal.ts:19-24` / `shield.ts:18-19` / `modifier.ts:23-31` / `counterStance.ts:18-22` /
`periodicSelfDamage.ts:14` / `repeat.ts:18-23`、加えて `skillText.ts:73-183` に20箇所以上、`damagePreview.ts:65-76` にも）。
**同じ JSON フィールドの読み取りコードが execution 側と表示側で二重に存在し、型による同期保証がない。**
`op: string` なのでタイポした op はコンパイルを通り、実行時に `console.warn` で握り潰される（`registry.ts:28`）。

**修正案（Phase 7、段階的）:**

1. `effectOps/nodeSchemas.ts` を新設し、各 op の `readParams` をそこへ集約して export。
   `skillText.ts` と `damagePreview.ts` も同じパーサを使う（キャストが1箇所に集まる）。
2. `EffectNode` を判別共用体化し、`UnknownNode = { op: string; [k: string]: unknown }` を union 末端に残す（既存 JSON は型エラーにならない）。
3. `EffectOp` を `EffectOp<N extends EffectNode = EffectNode>` にして `execute(node: N, ctx)` に。

### 3-2.【high】`Combatant` がプレイヤー専用/敵専用フィールドを同居させている

`types.ts:319-353`。敵専用 `actionPattern` / `patternIndex` / `isBoss`（`:344-352`、プレイヤーは常に空配列/0/false）、
プレイヤー専用 `actives[].points` / `actives[].slotIndex`（`:238-254` のコメントが「敵は常に0（未使用）」「敵は null」と明記）。
`freshCombatant`(`battleEngine.ts:39-59`) が全部埋めるため、不正状態が型で表現可能なまま。

**修正案（Phase 7）:** `isPlayer` が既に存在するのでこれを判別子にして `Combatant = PlayerCombatant | EnemyCombatant` へ。
`turnQueue.ts:35` 等の `c.isPlayer` 比較はそのまま動く。影響範囲が大きいので §3-1 の後段に置く。

### 3-3.【high】`OwnedActive.points` と `.level` の二重管理

`types.ts:238-254`。`level` は `points` から `levelForPoints`(`skillDraft.ts:23-29`) で導出できる値なのにフィールドとして持ち、
`addActivePoints`(`:32-37`) でだけ同期される。**`skillPanel.ts:17-18` は `points = 0; level = 1` と手で両方書いている**ため
同期規約が2箇所に分裂。敵は `points` を使わず `level` を直接持つ（`turnQueue.ts:64`）ので、同じフィールドが2つの意味を持つ。

**修正案（Phase 7）:** §3-2 とセットで `PlayerOwnedActive { points; readonly level }` / `EnemyOwnedActive { level }` に分け、
`skillPanel.ts:17-18` を `resetActivePoints(owned)` ヘルパへ。

### 3-4.【med】`DraftOption` の optional 6連発 + `'__fallback__'` マジック文字列

`types.ts:394-405` と `skillDraft.ts:179`。「パッシブでないものをパッシブとして表現」しているため
`applyDraftChoice`(`:223-251`) が「isFallback を先に見る → kind で分岐」の2段 if になっている。

**修正案（Phase 7）:** `kind` による判別共用体（`'active' | 'passive' | 'trait' | 'statFallback'`）へ。
`applyDraftChoice` は素直な `switch (option.kind)` になる。

> **⚠️ `rollDraft` の重複除去(`:198-203`) が `opt.id` に依存しているため、fallback には合成キー（`stat:<name>` 形式）が必要。要挙動確認。**

### 3-5.【med】`EffectiveStats = BattleStats` エイリアスが不変条件を消している

`types.ts:17`（`evadeRate` は「基礎値では常に0」）と `:62`。基礎値と実効値が同じ型なので誤用を型が止められない。
`battleEngine.ts:464` は毎回 `resolveEffectiveStats(c, content).hp` を再計算しており、
どちらの値が流れているかは呼び出し名でしか判別できない。

**修正案（Phase 7）:** ブランド型にする。`computeEffectiveStats` の戻り値1箇所のキャストで済み、挙動不変。

### 3-6.【med】`bossDefeated` が3つの異なる意味で使われている

→ [01-cross-cutting.md](01-cross-cutting.md) §3-1 参照。
**`src/domain/types.ts:434` のコメント「ボス撃破なら 1」は実装（通算撃破数）と食い違っている。Phase 1 で修正する。**
改名はスコア式 JSON（`src/data/genres/rpg.json`）に波及するため行わない。

### 3-7.【med】`ScoreVarsBattle` と `ScoreVars` の並行定義

→ [01-cross-cutting.md](01-cross-cutting.md) §3-1。

### 3-8.【—】`BattleState` が6関心を抱える god-object

`types.ts:412-471`（25フィールド）。`{ run, battle, draft, panel, ui, score }` へのネスト化が理想だが、
`useBattleState.ts`(626行) と `BattleScreen.vue`(930行) の全体に波及する。
**本計画では実施しない。** → [07-deferred.md](07-deferred.md)。
先に §2-2（`ui` の追い出し）だけ行えば、コストの割に効果が大きい。

### 3-9.【low】`FocusSpec` が到達不能な組み合わせを許す

`types.ts:85-91`。`side: 'enemy'|'self'|'ally'` × `range` の12通りだが、
`resolvePlayerFocus`(`battleEngine.ts:256-271`) は `side === 'self'` なら range を無視し、
`'ally'` は「味方は存在しない。安全側フォールバック」(`:262`) で握り潰す。**`'ally'` は実データに1件も存在しない。**
`'ally'` の削除は JSON スキーマ変更を伴うため要確認。

---

## 4. マジックナンバー（Phase 6 / **値は現行リテラルをそのまま JSON へ写す**）

| Sev | 場所 | 値 | 内容 | 移設先 |
|---|---|---|---|---|
| high | `skillDraft.ts:52` | `0.75`, `0.25`, `2` | サブカテゴリ合計重みの曲線 | `skill_points.json` → `subCategoryWeight: { base, curvature, center }` |
| high | `skillDraft.ts:74, 81, 105, 111` | `3`, `1` | アクティブ/パッシブのカテゴリ寄与係数（**各2箇所に重複**） | `skill_points.json` → `categoryPointPerActiveLevel` / `…PerPassiveLevel` |
| high | `skillDraft.ts:199, 205` | `3` | ドラフト提示枚数 | `skill_points.json` → `draftOptionCount` |
| high | `skillDraft.ts:247` | `1` | 重複ドラフト選択時の付与ポイント | `skill_points.json` → `duplicatePickPoints` |
| high | `skillDraft.ts:255` / `BattleScreen.vue:158, 516` | `4` | **アクティブ枠数が3箇所に重複** | `battle.json` → `activeSlotCount` |
| high | `damageCalc.ts:14` | `4` | special 属性の防御参照 `(def+ref)/4` | `battle.json` → `cut.specialDefenseDivisor` |
| high | `damageCalc.ts:69` | `2` | 相性1段階あたりの倍率の底 | `battle.json` → `affinity.stageMultiplier` |
| high | `battleEngine.ts:30-33` | `INITIAL_SKILLS` | **プレイヤーの初期スキル**。`playerSprite` は `battle.json:26` にあるのに初期スキルだけコード側 | `battle.json` → `initialSkills` |
| med | `battleEngine.ts:330` | `2` | `pendingTransformBonus.roundsRemaining` の初期値 | `battle.json` → `transformBonusRounds` |
| med | `damagePreview.ts:22-27` | `0.001, 0.12, 0.3, 0.6` | ダメージ段階の閾値（プレイヤーへの提示に直結） | `battle.json` → `damageMagnitudeThresholds` |
| med | `useBattlePresentation.ts:48` | `80` | クリティカル画面フラッシュの余韻 | `battle.json` → `presentation.criticalFlashTailMs` |
| low | `damageCalc.ts:79` | `0.1` | `EFFECTIVENESS_SKEW_THRESHOLD`。const 化済み | CLAUDE.md「実装固有の閾値は先頭 const で可」の範囲内。現状維持可 |
| low | `heal.ts:37` / `stats.ts:171` | `1 +` | 加算スタックの基準1。`stackMultipliers`(`stats.ts:23`) の再実装 | 定数化ではなく `stackMultipliers` へ統一（§1-1 で消える） |
| low | `backdrop.ts:146-241, 287-290` | 多数 | 地形・雲・小物の形状係数 | §2-3 で presentation へ移した上でファイル先頭 const 群へ。JSON 化までは不要 |

補足: `battleEngine.ts` の他のバランス値（`BATTLE.guard.cutRate` 等）は `tunables.ts` 経由で JSON 化されており、
方針自体は徹底されている。上記は**取りこぼし**。

---

## 5. デッドコード（Phase 1）

| Sev | 場所 | 内容 |
|---|---|---|
| med | `stats.ts:174-181 buildTemporaryFromBuiltin` | **参照ゼロ**。`useBuiltinAction`(`battleEngine.ts:383-392`) が同じことをインラインで実施。`stat as never`(`:180`) の型握り潰しを含む → 削除 |
| med | `stats.ts:183-185 currentMaxHp` | **参照ゼロ**。かつ第1引数 `c: Combatant` を本体で使っていない（名残の引数）→ 削除 |
| med | `stats.ts:31-45 collectModifier` | 本番から参照ゼロ。`stats.test.ts:37-55` だけが呼ぶ。実経路は `newAccumulator`/`toModifiers`/`computeEffectiveStats` → 削除しテストも落とすか、`toModifiers` の実装に使って実経路へ戻す |
| med | `battleEngine.ts:558-562 zeroCategoryPoints` | 本番参照ゼロ（§1-4）→ 削除 |
| med | `battleEngine.ts:431 export { previewEnemyNextSkill }` | `turnQueue` からの素通し再 export。唯一の消費者 `useBattleState.ts:26` は `turnQueue` から直接 import → 削除 |
| low | `battleEngine.ts:564 export type { SkillDef, ActiveSkillDef }` | 誰もここからは import していない → 削除 |
| low | `effectOps/damage.ts:119-121 readTemporaryFlat(c, stat)` | 第2引数が `'cutRate'` 以外を取り得ない → `readCutRateModifier(c)` に |
| low | `types.ts:85 FocusSide` の `'ally'` | 実データ0件（§3-9） |

> **監査時の誤報を訂正:** `tests/unit/_debug_scratch.test.ts` は**存在しない**。対応不要。

---

## 6. 兄弟モジュール間の API 形状の不一致

### 6-1.【high】`EffectOp` が「実行 op」と「宣言的 op」を区別できていない

登録15 op のうち **7個が実行本体を持たない警告スタブ**:
`statBoost.ts:14-16` / `elementAffinity.ts:13-15` / `cutRate.ts:13-15` / `replaceGuard.ts:13-15` /
`healBetweenBattles.ts:13-15` / `effectBoost.ts:13-15` / `healTaken.ts:13-15`。
7ファイルすべてが **ほぼ同一の警告文を微妙に違う文言で** 持つ。さらに `noop.ts:9-10` は警告を出さずに何もしない
——「何もしない」の表現が2種類ある。

**修正案（Phase 8）:** `EffectOp` に `kind: 'executable' | 'declarative'` を持たせ、
`declarative` 側は `readBy`（誰が読むか）を記述するだけの3行にする。`runEffects` は `declarative` を静かにスキップする。

> **⚠️ `effectOps.test.ts:54`「宣言的op は警告のみで例外を投げない」を「警告を出さずスキップする」へ更新が必要
> （`console.warn` の有無だけが変わる）。**

### 6-2.【med】op のパラメータ命名規約が揃っていない

| op | 形状 | 場所 |
|---|---|---|
| `damage` | `scale: { stat または statOptions, rate }` | `damage.ts:17-21` |
| `heal` | `scale?: { stat, rate }` + `flat?` | `heal.ts:11-16` |
| `shield` | `scale: { stat, rate }`（必須） | `shield.ts:12-15` |
| `modifier` | `stat` + `amount?` + `rate?` + `scale?` | `modifier.ts:12-20` |
| `counterStance` | **`scaleStat` + `rate`（ネストしない）** | `counterStance.ts:11-15` |
| `periodicSelfDamage` | `ratio` | `periodicSelfDamage.ts:14` |
| `cutRate` | `amount` | `damage.ts:50` の読み取り側 |
| `effectBoost` / `healTaken` | `rate` | `stats.ts:160` / `heal.ts:34` |

`rate` が「割合」を意味したり「倍率」を意味したりする。JSON スキーマも content-editor のフォーム定義
(`contentEditorForm.ts:220`) もこの不揃いをなぞらざるを得ない。

**修正案（Phase 8）:** 共通の `ScaleSpec { stat?, statOptions?, rate }` を `types.ts` に定義し、新規 op は必ずこれを使う規約にする。
既存 `counterStance` は `scale` を **追加で** 受け付け `scaleStat` を後方互換で残す（既存 JSON 無変更＝挙動保存）。

### 6-3.【med】`KNOWN_OP_IDS` が手書きミラーになっている

`registry.ts:60-64` の配列は `index.ts:30-44` の `registerOp` 呼び出し列と手で同期する必要があり、
`effectOps.test.ts:25` に **同期漏れを検知するためだけのテスト** が存在する。
`index.ts` は import 列（15行）と registerOp 列（15行）で同じリストを2回書いている。

**修正案（Phase 2）:** `index.ts` に `const OPS = [...] as const` を1本置き、`OPS.forEach(registerOp)` と
`KNOWN_OP_IDS = OPS.map(o => o.id)` を導出する。同期テストはトートロジーになるので削除できる。挙動不変。

### 6-3-a.【low】Phase 0 で判明した細部

- **`weightedPick`（`battleEngine.ts:146`）は重み0のグループを選びうる。** `roll -= w` のあと `roll <= 0` で判定するため、
  `rng()` がちょうど `0` を返すと重み0（さらには負の重み）の先頭エントリが選ばれる。実害は無視できるが、
  `<=` を `<` に変えると挙動が変わる。`tests/unit/domain/battle/encounter.test.ts` に固定済み。
- **`effectOps/criticalFx.ts` は op ではない。** クリティカル演出を発火する共有ヘルパ（`emitCriticalEffect`）であり、
  `KNOWN_OP_IDS` に無いのは正しい。`effectOps/` に op でないファイルが同居しているだけなので、
  §2-4 の分割時に置き場所を見直すとよい（**バグではない**）。

### 6-4/6-5/6-6.【low】その他

- `periodicSelfDamage.ts:13` だけ `execute` に型注釈があり、`statBoost.ts:14` 等は引数ゼロ → §6-1 の `kind` 導入で解消。
- private 関数の `_` プレフィックス規約 → [01-cross-cutting.md](01-cross-cutting.md) §4-1（**方針決定が先**）。
- `battleEngine.ts:228` のインライン型 import → Phase 1 でブロックへ寄せる。

---

## 7. 拡張の摩擦

### 7-1. 新しい effect op を1つ追加 → **最大10箇所 / 6ファイル + 新規1**

1. `effectOps/<op>.ts`（新規）
2. `effectOps/index.ts:14-28` の import 行
3. `effectOps/index.ts:30-44` の `registerOp` 行
4. `effectOps/registry.ts:60-64` `KNOWN_OP_IDS`
5. `skillText.ts:70-186` `nodeToTokens` の switch（漏らすと op名が生表示。**機械チェックなし**）
6. `schemas/battle-skill.schema.json:9-11` の `allowedOps`
7. `schemas/battle-skill.schema.json:85-87` の enum（**同じファイル内に2箇所**）
8. `schemas/battle-trait.schema.json:37-39` の enum（**3つ目の写し**）
9. `src/tools/contentEditorForm.ts:107 / :128 / :220`（`EFFECT_OP_SKELETONS` / `LABEL` / `FIELDS`）
10. ダメージ系なら `effectTiming.ts:17` と `damagePreview.ts:58`。宣言的opならさらに §1-1 の7箇所のどこかへ集計関数を新規実装

**緩和策（Phase 8 完了時に 2〜4箇所へ）:**
(a) §6-3 でリスト1本化 → 2,3,4 が1箇所に。
(b) §2-6 の `skillText/opText/<op>.ts` 化 → 5 が op ファイルの隣に来る。
(c) スキーマ enum の `$ref` 統合と `allowedOps` の導出 → 6,7,8 が1箇所に（→ [05-tools.md](05-tools.md) §4-1）。
(d) §1-6 の `walkEffectNodes` 化 → 10 の2箇所が1箇所に。

### 7-2. 新しいステータスを1つ追加 → **11箇所**

`types.ts:9-21`(`BattleStats`) / `:29-32`(`STAT_KEYS`) / `:26`(`GROWTH_STAT_KEYS`) / `:47-49`(`PERCENT_STAT_KEYS`) /
`skillDraft.ts:173`(`FALLBACK_STATS`。§1-9 で消える) / `skillText.ts:40-44`(`STAT_LABEL`) /
`battleEngine.ts:43-48`(`freshCombatant` の `baseStats` リテラル) / `:68`(初期化ループのインライン配列) /
`battle.json`(`initialStats`) / `schemas/battle-enemy.schema.json`(`stats`) / `BattleScreen.vue`(表示行)。

**緩和策（Phase 8 で 11 → 4）:** 上記1〜4と6を「1つの宣言表 `STAT_SPECS`」へ統合し、
`STAT_KEYS` / `GROWTH_STAT_KEYS` / `PERCENT_STAT_KEYS` / `STAT_LABEL` をそこから導出する。
7,8 も `Object.fromEntries(STAT_KEYS.map(...))` で導出できる。

### 7-3. 新しい敵の行動パターン → 構造上表現できない

`EnemyDef.actionPattern: string[]`（`types.ts:197`）は「スキルID列を順に消化」しか表現できない。
HP閾値での怒りモード、プレイヤーの状態に応じた分岐、確率選択は書けない。

**緩和策:** 先に §1-2 で選択ロジックを1本化し `selectEnemyAction(enemy, state, content)` という **単一の拡張点** を作る。
その上で `EnemyBehavior` を判別共用体にすれば、既存データは `kind: 'sequence'` として無変更で動く（挙動保存）。
**機能追加なので本計画では §1-2 までに留める。**

### 7-4. 新しいカテゴリを追加 → 4箇所

`types.ts:73-80` / `skillText.ts:13-16` / `:19-31` / `BattleScreen.vue` の CSS カスタムプロパティ定義。
§7-2 と同じ宣言表1本化で2箇所に減らせる。

---

## 8. テストカバレッジ

### 十分にカバーされている（機械的リファクタをそのまま行ってよい）

`damageCalc.ts` 全 export（`damageCalc.test.ts` 302行・50 it）/ `effectOps` 7種（`effectOps.test.ts` 630行・60+ it）/
`stats.ts` の算術・アキュムレータ（221行）/ `turnQueue.ts` 全 export（192行。§1-2 の統合に十分）/
`skillDraft.ts` 主要経路（311行）/ `skillPanel.ts` 全 export（160行）/ `skillText.ts`（247行。§2-6 の分割はここで守れる）/
`effectTiming.ts`（44行）/ `battleEngine.ts` の大半（784行・70+ it）/ `backdrop.ts` の主要2関数（122行）。

### テストが無い = リファクタ risk（**Phase 0 で埋める**）

| Sev | 対象 | 状況 |
|---|---|---|
| **high** | `damagePreview.ts` **全体**（130行） | **専用テストファイルが存在しない。** §1-3 の統合の前に、現行出力を golden として固定する特性テストが必須 |
| high | `battleEngine.ts:104-131` のボス周期関数群（`isBossBattleIndex` / `bossOccurrenceNumber` / `bossGroupFor` / `isTrueClearOccurrence` / `isTrueClearBattleIndex`） | 直接テストなし。`isTrueClearBattleIndex` は `useBattleState.ts:323` の「真のクリア」判定に直結する |
| med | `battleEngine.ts:134-156`（`weightsForBattleIndex` / `weightedPick`） | `spawnWeightTiers` の境界（`minBattleIndex`）の切り替わりが未検証 |
| med | `backdrop.ts:265-308`（`skyBands` / `glowRings` / `mixHex` / `clamp255`） | §2-3 の移設時に壊しても気づけない |
| med | `skillDraft.ts:118-121 nextCategoryThreshold` / `:97-115 categoryContributionsOf` | §1-5 の統合で影響を受ける側 |
| med | `battleEngine.ts:461-473 applyPeriodicSelfEffects` の emit 内容 | HP減少・戦闘不能は検証済みだが `fx_debuff` / `fx_defeat` の emit は未検証 |
| low | `skillText.ts:19-31 CATEGORY_COLOR` | 全カテゴリ網羅が未検証（§2-1 の移設時に漏れても気づけない） |
