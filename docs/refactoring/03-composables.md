# 03. composables 層（ViewModel）

親: [README.md](README.md) / 対象: `useBattleState.ts`(626) / `useBattlePresentation.ts`(293) / `useGlossaryPanel.ts`(67) / ローダ3本(192)

---

## 0. 1行要約

`useBattleState.ts` は **状態所有 + ターン駆動 + 演出タイミング + 進行管理 + スコア確定 + UIトグル + View用アダプタ** の
7責務を1関数（626行 / 公開API 37個）に抱えている。演出状態は `useBattleState.presentation`（announce/impact/posing）と
`useBattlePresentation`（popup/flash/displayedHp）に **分断** されており、両者の同期が暗黙の時間的前提
（「次の announce までに drain が終わっている」）に依存している。**これが現在の失敗テスト2件の背景。**

---

## 1. `useBattleState.ts` の責務マップと分割

### 1-1. 責務マップ（行範囲）

| # | 行 | 責務 | 本来あるべき場所 |
|---|---|---|---|
| A | 53–67 | `BattleScheduler` 抽象・`IMMEDIATE_SCHEDULER`・`TIMED_SCHEDULER`（`window` 依存） | 独立モジュール（infra） |
| B | 69–88 | `BattlePresentation` 型・`idlePresentation()` | 演出モジュール |
| C | 90–94 | `zeroCategoryPoints()` | **domain（既に2箇所に実装あり＝3重複）** |
| D | 96–117 | `freshState()`（BattleState ファクトリ） | **domain** |
| E | 119–121 | `BUILTIN_LABEL`（'守る'/'避ける'/'様子を見る'） | **データ（`skill_stance_*.json` に同じ文字列がある）** |
| F | 124–137 | インスタンス状態 | ViewModel（正当） |
| G | 139–160 | `raw()` / `emit()` | ViewModel（`raw()` は実質恒等関数） |
| H | 162–193 | `impactWaitMs()` / `after()` / `cancelPending()` | `impactWaitMs` は **domain**、`after`/`cancelPending` は ViewModel |
| I | 196–219 | ライフサイクル `initRun()` / `reset()` | ViewModel |
| J | 222–243 | 戦闘開始 `startBattle()` / `startNewRound()` | ViewModel（進行） |
| K | 246–313 | ターン駆動（`findCombatant`/`processTurns`/`finishRound`/`announce`/`clearPresentation`/`runEnemyTurn`/`afterAction`） | ViewModel（ターン駆動）＋演出 |
| L | 315–352 | 決着 `handleOutcome()` / スコア `finalizeScore()` | `finalizeScore` は **domain** |
| M | 355–407 | プレイヤー行動（`isPlayerTurn`/`isPresenting`/`guardOrDodge`/`selectAction`） | ViewModel |
| N | 410–458 | ドラフト進行 | ViewModel（進行） |
| O | 460–502 | スキルパネル（薄いガード + domain 委譲） | ViewModel |
| P | 505–513 | `giveUp()` | ViewModel |
| Q | 516–533 | UIトグル5種 + `markSeen` + `consumeEffect` | **View 寄りの状態（`BattleState.ui` は domain 型に混入）** |
| R | 535–584 | View用アダプタ6種（`as unknown as Combatant` × 5） | 純関数モジュール |
| S | 586–625 | 公開API 37個 | facade |

### 1-2. 分割案（Phase 4）

**原則: `useBattleState.ts` は「同名・同APIの facade」として残す。**
`App.vue:35` / `BattleScreen.vue:57-63` / 既存テスト58本を1行も変えずに内部だけ差し替えられ、挙動非変更を機械的に保証できる。

    src/composables/battle/
      battleScheduler.ts        # A
      useBattleTurnDriver.ts    # K + M
      useBattleProgression.ts   # J + L(handleOutcome) + N
      useBattleSkillPanel.ts    # O
      useBattleUiFlags.ts       # Q
      battleViewAdapters.ts     # R（composable ではなくモジュール純関数）
    src/composables/useBattleState.ts  # F + I + P + facade（目標 約150行）
    src/domain/battle/
      battleState.ts            # D + C（createInitialBattleState / findCombatant）
      battleScore.ts            # L(finalizeScore)
      effectTiming.ts           # H(impactWaitMs) を追加

| 新モジュール | 公開API | 境界 |
|---|---|---|
| `battleScheduler.ts` | `BattleScheduler` / `IMMEDIATE_SCHEDULER` / `TIMED_SCHEDULER` / `createTimerTracker(scheduler)` → `{ after, cancelAll, bumpGeneration }` | **`window` に触れる唯一の場所。** `generation`/`pendingTimers`(`:132-133,177-193`) をここへ。「世代番号でキャンセルする」非自明な不変条件を1ファイルに閉じ込める |
| `useBattleTurnDriver.ts` | `{ isPlayerTurn, isPresenting, guardOrDodge, selectAction, startNewRound, clearPresentation }` | **1ラウンド内の手番を回すことだけ。** 勝敗が付いたら `onBattleEnd` を呼び、その先（ドラフト/スコア）は知らない |
| `useBattleProgression.ts` | `{ startBattle, handleOutcome, selectDraft, rerollDraft, proceedAfterDraftRound, confirmSwap, cancelSwap }` | 戦闘の外側のループだけ。手番の中身は知らない |
| `useBattleSkillPanel.ts` | 6メソッド | 全メソッドが `if (state.status !== 'skillPanel') return` の同一ガード＋domain 委譲。ガードを `withSkillPanel(fn)` の高階関数1つに畳める（**現在は同じ行が `:463,471,476,481,486,492` に6回コピー**） |
| `useBattleUiFlags.ts` | `{ ui, toggleStatusMode, toggleBuffDiff, toggleStatusCollapsed, toggleSkillListCollapsed, seenIds, markSeen }` | **domain が一切読まない View 状態**（§4-6） |
| `battleViewAdapters.ts` | `createBattleViewAdapters(content, getRoundCount, getPlayer)` → 6関数 | reactive 依存なし。`as unknown as Combatant` を **1箇所のヘルパ `asCombatant()`** に集約（現在 `:549,552,559,575,579` に5回散在） |

---

## 2. ViewModel に居座っている純粋ロジック（→ domain へ / Phase 3）

| # | Sev | file:line | 内容 | 移動先 |
|---|---|---|---|---|
| 2-1 | **high** | `useBattleState.ts:90-94 zeroCategoryPoints()` | **同一実装が3箇所**（`battleEngine.ts:558` / `skillDraft.ts:43` / ここ）。CLAUDE.md「同じロジックが2箇所以上に現れたら抽出」に真正面から違反 | `skillDraft.ts` の1本に統一し import のみに（→ [02-domain.md](02-domain.md) §1-4） |
| 2-2 | **high** | `useBattleState.ts:96-117 freshState()` | BattleState の初期値（12フィールド + `ui` + `statAllocations`）が ViewModel に埋め込まれている。domain 側で `BattleState` を新規生成する手段が無いため、domain テストは `tests/unit/domain/battle/_helpers.ts` で別に組み立てている＝**初期値定義が2系統** | `domain/battle/battleState.ts` に `createInitialBattleState(rng)`。`_helpers.ts` もこれを使う |
| 2-3 | **high** | `useBattleState.ts:341-352 finalizeScore()` | `GENRES` 検索・`ScoreVars` の0埋め・`evalScoreFormula` は完全に純粋。ViewModel が `src/data/genres` と `domain/scoreCalc` を直接引いている | `domain/battle/battleScore.ts` へ。フォールバック式（`:47`）の扱いは [01-cross-cutting.md](01-cross-cutting.md) §3-4 |
| 2-4 | med | `useBattleState.ts:167-170 impactWaitMs()` | `estimateHitCount()` と `BATTLE.presentation` から待ち時間を求める純関数。`domain/battle/effectTiming.ts` は既にこの計算の**説明コメントだけ**(`:6-8`)を持つのに、計算本体は composable 側にある | `effectTiming.ts` に `impactWaitMs(def, targetCount)`。`effectTiming.test.ts` で直接テストできるようになる |
| 2-5 | med | `useBattleState.ts:246-250 findCombatant()` | id で参加者を引くだけの純関数。`useBattlePresentation.ts:71-78 trueHpOf/trueAliveOf` が同じ探索を**再実装** | `domain/battle/battleState.ts` に `findCombatant(state, id)` |
| 2-6 | med | `useBattleState.ts:355-360 isPlayerTurn` | 「turnQueue の現在エントリが player か」は純粋な述語。ただし `presentation.phase === 'idle'` という**演出条件が混ざっている** | domain に `isPlayerTurnInQueue(state)` を出し、composable 側で `&& !isPresenting.value` と合成 |
| 2-7 | low | `useBattleState.ts:119-121 BUILTIN_LABEL` | `skill_stance_guard.json:4`='守る' / `skill_stance_watch.json:4`='避ける' / `skill_stance_idle.json:4`='様子を見る' と**同じ文字列をコードに直書き**。JSON駆動規約違反 | `BUILTIN_SKILL_ID`（`BattleScreen.vue:150-152` に既存）を共有モジュールへ移し、ラベルは `content.skills.get(id).label` から引く |
| 2-8 | low | `useBattleState.ts:291 '様子を見ている'` | 敵の announce フォールバック文言がハードコード | 同上 |

---

## 3. ViewModel に混入した表示・タイミングの関心

| # | Sev | file:line | 内容 | 修正案 |
|---|---|---|---|---|
| 3-1 | **high** | `useBattleState.ts:69-88, 272-287` | **`BattlePresentation`（phase/actorId/skillLabel/element/posingId/seq）が「戦闘状態」の composable に住んでいる。** 名前も紛らわしい（`useBattleState.presentation` と `useBattlePresentation` は別物）。演出状態が2ファイルに割れているため §6-2 の同期バグの温床 | `presentation` の**所有権は useBattleState に残す**（announce のタイミングを知るのはターン駆動側だけなので正しい）。型と `idlePresentation()` を `battlePresentationModel.ts` へ切り出し双方から import。名前を `turnCue` / `useBattleFx` へ改名すると意味の衝突が消える |
| 3-2 | med | `useBattleState.ts:292,298,309,375,384,396,405` | `after(...)` のネストが**7箇所**に散在し、「announce → impact → afterAction」の同一3段シーケンスが**3回コピー**されている（`runEnemyTurn` / builtin 分岐 / active 分岐） | `performTurn(actor, skillId, fallbackLabel, resolve, waitMs)` の1本に集約。3経路の差分は `resolve` の中身と `waitMs` の求め方だけ |
| 3-3 | med | `useBattleState.ts:379-382` | builtin 行動の演出エフェクトIDが `fx_guard` / `fx_evade` とコードに直書き。他のスキルは JSON の `effects[]` から発行される | `skill_stance_*.json` に `effects` を持たせ共通経路で発行（3-4 とセット） |
| 3-4 | med | `useBattleState.ts:373-387` vs `:389-406` | `skill_stance_*.json` は **`kind:"active"` の完全なスキル定義**（`effect[]` に `modifier` op、`cooldown:3`）として存在するのに、`selectAction` は `kind==='builtin'` を別経路で処理し `useBuiltinAction()` が `BATTLE.guard.cutRate` をハードコードで適用する。**JSON の `effect[]` は実行されていない飾り**。値が `battle.json:guard.cutRate`=0.5 と `skill_stance_guard.json` の `amount`=0.5 で二重管理 | 中期: builtin を通常アクティブへ統合し `PlayerAction` を `{kind:'active', skillId}` に一本化（→ [07-deferred.md](07-deferred.md)）。**本計画では「JSON側の effect[] が実行されない」ことをコメントで明示するに留める** |
| 3-5 | low | `useBattleState.ts:583-584 turnNumber / battleNumber` | `roundCount + 1` / `battleIndex + 1` という純粋な表示整形が公開APIになっている | View 側か `battleViewAdapters.ts` へ |
| 3-6 | low | `useBattlePresentation.ts:48` | `timing.flashMs + 80` の **`80` がマジックナンバー**（このファイルで唯一の違反） | `battle.json:presentation.criticalFlashTailMs` |

---

## 4. リアクティビティの臭い

| # | Sev | file:line | 内容 | 修正案 |
|---|---|---|---|---|
| 4-1 | **high** | `useBattlePresentation.ts:253-265` | `watch(() => battle.presentation.seq, …, { flush: 'sync' })` が **announce のたびに全参加者の displayedHp/displayedAlive を無条件で「現在の真値」に上書き**する。前バッチの `later()` 再生が終わっていない場合、段階表示が破壊される（§12 の実失敗の直接原因）。sync watch の中で reactive Map を5〜6回書き換えている | バッチ世代番号 `fxGeneration` を導入し「再生中の id はベースラインを上書きしない」ガードを入れる。もしくはベースライン確保を `emit()` 側（＝効果解決の直前）へ移し announce に依存させない |
| 4-2 | **high** | `useBattlePresentation.ts:238` | `watch(() => battle.effectQueue.value.length, l => { if (l>0) drain() })`。**配列長という間接的な指標**でトリガしており、(a) `consumeEffect()` の `shift()` が drain 中に自分自身の watch を再スケジュールする、(b) 同一 tick に「積む→掃ける→積む」が起きると取りこぼす | `emit()` から直接呼ばれるリスナ登録（`onEffect(cb)`）へ。挙動を変えないなら最低限 `flush:'sync'` にして「積まれた瞬間に必ず引き取る」不変条件を明示する |
| 4-3 | med | `useBattleState.ts:126,531-533` | `readonly(effectQueue)` として公開しているキューを外部が `shift()` で消費するというAPI矛盾 | 4-2 のリスナ方式にすれば `effectQueue`/`consumeEffect` の公開自体が不要になる |
| 4-4 | med | `useBattleState.ts:196-210 initRun()` | `freshState()` 内で既に `initPlayer(Math.random)` を呼んでいる(`:99`)のに、直後に `fresh.player = initPlayer(rng)`(`:203`) で捨てている＝**initPlayer が毎回2回走る**。`:205-206` の `categoryPoints`/`seenIds` 再代入も `freshState()` が既に作っているので**完全な重複** | `createInitialBattleState(rng)` を1回呼ぶだけにする。挙動不変（`Math.random` の消費が1回減るだけ） |
| 4-5 | med | `useBattleState.ts:112,206,528-530 seenIds` | reactive 内の `Set` を `add` で破壊的更新し `readonly(state)` 経由で `has()` される。追跡しづらい経路 | `useBattleUiFlags` へ移し `BattleState` から外す（4-6 とセット） |
| 4-6 | med | `domain/battle/types.ts:457-464` | **`BattleState` に `ui` と `seenIds` が入っている**（層の逆流） | `BattleState` から削除し `useBattleUiFlags` のローカル reactive へ。**domain 側は一切参照していないため機械的に外せる**（grep 済み） |
| 4-7 | med | `useBattleState.ts:154-156 raw()` | 実体は `return state`（恒等関数）。26行のコメント(`:139-153`)が「なぜ toRaw を使わないか」を説明しているが関数として残す意義がない。`r = raw()` と `state.` が**同一オブジェクトに対して混在**（`:319-338`）しており誤読を招く | `raw()` を削除して `state` に一本化。コメントは `state` 宣言(`:125`)の直上へ。**挙動完全不変** |
| 4-8 | low | `useBattleState.ts:548-580` | `as unknown as Combatant` が5回 | `asCombatant(c)` 1本に集約（監査点を1つにする） |
| 4-9 | low | `useBattlePresentation.ts:41-42,59-61,69` | 状態が `reactive(Map)×3` + `ref×2` + 非リアクティブ `Map×2` + `WeakSet×1` の**7コンテナに分散**。「ある combatant の演出状態」を1箇所で見られない | `reactive(new Map<string, CombatantFxState>())` 1本へ統合。画面全体の `screenShake`/`screenCriticalFlash` は別に残す |
| 4-10 | low | `useBattleState.ts:362 isPresenting` | `isPlayerTurn`(`:355-360`) が `isPresenting` を再実装している | `isPlayerTurn` 内で `!isPresenting.value` を使う |
| 4-11 | low | `useGlossaryPanel.ts:26-37` | モジュールレベル singleton の `ref` を**書き込み可能なまま公開**(`:64`)。またラン再開（`App.vue:313 restart()`）時に**リセットされない**ため、前ランで開いたヘルプ/用語ポップアップの状態が次ランへ持ち越される | `readonly()` で公開する部分は挙動不変。**リセット追加は挙動変更**（現状が「持ち越し」なので）→ [07-deferred.md](07-deferred.md) |

---

## 5. タイマー / アニメーションタイミング

### 5-1. タイマー機構が5系統に分散

| 機構 | 場所 | キャンセル | 世代管理 | スコープ破棄 |
|---|---|---|---|---|
| `after()` / `cancelPending()` | `useBattleState.ts:177-193` | あり | あり（`generation`） | **なし**（`onScopeDispose` 未使用） |
| `later()` / `clearTimers()` | `useBattlePresentation.ts:83-94` | あり | **なし** | あり（`:282`） |
| `SkillDraftPanel.vue:60-61` | View | — | — | — |
| `BattleBackdrop.vue:179-189`（rAF） | View | — | — | — |
| `App.vue` の3タイマー | App | あり | — | あり |

- **[med]** `useBattleState.ts:177-193` に `onScopeDispose(cancelPending)` が無く、`App.vue:457-464` の `onUnmounted` も
  `battle` を片付けないため、**App 破棄後も戦闘の演出タイマーが生き残る**。
  → `onScopeDispose(() => { generation++; cancelPending() })` を追加（`getCurrentScope()` ガード併用）。
- **[med]** `useBattlePresentation.ts:83-89 later()` に世代管理が無い。`reset()` / `giveUp()` で戦闘状態が破棄されても
  再生中の演出タイマーは走り続け、破棄後の `battle.state` を読む。`useBattleState` 側は `generation` で防いでいる**非対称**。
  → `later()` にも同じ世代番号を持たせる。

**Phase 4 で `battleScheduler.ts:createTimerTracker()` に統一する（§6-3）。**

### 5-2. 数値の出所

**戦闘の演出尺は `ui.json` ではなく `battle.json:presentation` にあり、これは妥当**
（`ui.json` は Canvas 横スクロール用の別セクション。`battle.json` は rpg 専用データという CLAUDE.md の方針に合致）。
`config-types.ts:383-393` に型もある。参照も正しく行われている
（`announceMs`×3 / `impactMs`×3 / `popupMs` / `flashMs`×4 / `battleEndMs` / `multiHitIntervalMs`×2）。

- **[low] 違反1件:** `useBattlePresentation.ts:48` の `+80`（§3-6）。
- **[low] 未使用の設定値:** `battle.json:presentation.attackPoseMs`（`config-types.ts:392` に型もある）が
  **どこからも読まれていない**。`presentation.posingId` を `afterAction()`(`:304`) で即クリアする実装に変わったときの置き去りと推測。
- **[med] JSON に書かれているのに無視されている演出データ（JSON駆動規約の実質的な破れ）:**
  `BattleEffectDef.durationMs`（`types.ts:229`）は **23個の `battle-effects/*.json` 全てに書かれ、content-editor でも編集できる**
  （`contentEditorForm.ts:175`）が、**runtime で一度も読まれない**。実際には全エフェクトが `timing.flashMs`（220ms 一律）で消える。
  `visual.kind` / `target` / `label` も未参照。
  → **「編集しても何も起きない項目」は将来の開発者を確実に誤らせる。** 実際に効かせるのは挙動変更なので
  [07-deferred.md](07-deferred.md) へ。**本計画では docs とコード上のコメントに「死にデータ」と明記する。**

---

## 6. `useBattleState` ↔ `useBattlePresentation` の重複

| # | Sev | 重複 | 場所 | 修正案 |
|---|---|---|---|---|
| 6-1 | med | 参加者を id で引く探索 | `useBattleState.ts:246-250` と `useBattlePresentation.ts:71-74, :75-78`（同型分岐が計3回） | `domain/battle/battleState.ts:findCombatant` に統一 |
| 6-2 | **high** | 「多段ヒットの再生に何ms かかるか」の知識 | 発行側 `useBattleState.ts:167-170`（`estimateHitCount` による**見積り**）と 再生側 `useBattlePresentation.ts:233-235`（実際に積まれた `pending.length` による**実測**）が**別々に計算**。両者がずれると §12 の症状（次の announce が再生を追い越す）が出る | 再生側が総再生時間を返す（`drain(): number`）か、発行側の `waitMs` を再生側へ渡す。どちらでも**単一の真実**にできる。挙動非変更で行くなら、まず `impactWaitMs` を domain へ出して（§2-4）両者から同じ関数を使わせる |
| 6-3 | med | タイマーユーティリティ | `after()` と `later()` はほぼ同じ実装 | `battleScheduler.ts:createTimerTracker()` に統一 |
| 6-4 | low | 効果音のトリガ | `useBattlePresentation.ts:132` / `:262-264` / `:278-279` と View 側 `BattleScreen.vue:204,213` / `:469` の**4ファイルに分散** | `useBattleSound.ts` に集約。`BattleScreen.test.ts:553-583` の spy 対象が1箇所になる |
| 6-5 | low | builtin 3種のマッピング | `useBattleState.ts:119-121 BUILTIN_LABEL`（label）と `BattleScreen.vue:150-152 BUILTIN_SKILL_ID`（skill id）が同じ3値の別マップ | 1つの `BUILTIN_ACTIONS` にし label は JSON から引く（§2-7） |

---

## 7. デッドコード / 遺物（Phase 1）

| # | Sev | file:line | 内容 |
|---|---|---|---|
| 7-1 | low | `useBattleState.ts:205-206` | 直前の `Object.assign(state, fresh)`(`:204`) で済んでおり無意味 |
| 7-2 | low | `useBattleState.ts:199` | `initPlayer` の二重生成（§4-4） |
| 7-3 | low | `useBattleState.ts:154-156 raw()` | 恒等関数（§4-7） |
| 7-4 | low | `data/rpg/battleContent.ts:129 ENEMY_SETS` | 外部からの参照はゼロだが、**同ファイル `:133` の `BATTLE_CONTENT` 組み立てで使われている**。未使用なのは `export` だけ。<br>**Phase 1 での判断: 残す。** `SKILLS`/`TRAITS`/`ENEMIES`/`BATTLE_EFFECTS` と並ぶ5定数の対称な公開面の一部であり、1つだけ `export` を外すと読み手が「なぜこれだけ違うのか」を考える羽目になる。実行時コストもゼロ |
| 7-5 | low | `battle.json:presentation.attackPoseMs` + `config-types.ts:392` | 未参照（§5-2） |
| 7-6 | med | `domain/battle/types.ts:229,231` | `BattleEffectDef.durationMs` / `visual.kind` / `target` / `label` が23個の JSON にあるのに runtime 未参照（§5-2） |
| 7-7 | low | `useBattleState.ts:132,507 generation` | `after()` 内で `done` フラグと二重に安全策を張っており(`:179-187`)読み解きに時間がかかる |
| 7-8 | low | `useGlossaryPanel.ts:37,55 jumpToHelpSignal` | 「カウンタを増やして watch で拾う」イベントバス代用。購読側は `BattleScreen.vue:301` の1箇所のみ → `onJumpToHelp(cb)` の方が意図が明確 |

---

## 8. 拡張の摩擦

### ケースA: 新しい効果 op + 専用の見た目 → **最低9ファイル**

`schemas/battle-skill.schema.json` / `types.ts` / `effectOps/<op>.ts` + `index.ts` / `effectTiming.ts` /
`skillText.ts` / `battle-effects/fx_*.json` / **`useBattlePresentation.ts`** / `contentEditor.ts` / `effectOps.test.ts`。

**最大の摩擦は `useBattlePresentation.play()`。** エフェクトの振る舞い（フラッシュ色 / HPを段階的に減らすか /
ポップアップに何を出すか）が **effectId の文字列前方一致・等値比較で9箇所にハードコード**されている
（`:107-114 flashKindOf` / `:141-159` displayedHp 分岐 / `:171-195` popup 分岐）。
**JSON を足しても必ず composable を書き換えることになる。**

**修正案（Phase 8）:** `battle-effect.schema.json` に `role: 'hit'|'heal'|'defeat'|'miss'|'label'|'none'` と `popupText?` を追加し、
`play()` を `switch (def.role)` に置き換える。既存23個の JSON に `role` を付ければ**挙動は完全に等価**。
以後、新エフェクトは **JSON 1ファイル追加のみ**（CLAUDE.md の「Feature 追加は1ファイル+1行」に揃う）。
**⚠️ 着手前に `play()` の全分岐テストが必須**（§11 の high 2件）。

### ケースB: 新しいプレイヤー行動種別（例: `'item'`）→ 7箇所

`types.ts:PlayerAction` / `useBattleState.ts:368-407 selectAction` の分岐 / `BUILTIN_LABEL` /
`BattleScreen.vue:211-233 onSkillSelect` / `skillEntries` computed / `CommandMenu.vue` / テスト。
→ §3-4 のとおり builtin を JSON アクティブへ統合すればこの列が丸ごと消える。

### ケースC: 新しい `BattleStatus` を1値追加 → 6箇所

`types.ts` / `useBattleState` の各ガード（`status !==` 判定が **`:411,425,463,471,476,481,486,492,498` の9箇所にコピー**）/
`proceedAfterDraftRound` の遷移表 / `BattleScreen.vue` の `v-if` 群 / `useBattlePresentation.ts:267-280` の status watch / テスト。

**修正案:** 状態遷移を `domain/battle/battleFlow.ts` の宣言的な遷移表
（`Record<BattleStatus, { allows: readonly ActionName[] }>`）に外出しし、composable 側は `assertStatus(action)` 1関数で全ガードを賄う。

---

## 9. ローダ層（`src/data/rpg/*.ts`）

概ね良好。`import.meta.glob({eager:true})` + id 重複警告 + 不正データのスキップ、という同じ形が3ファイルで一貫している。

| # | Sev | file:line | 内容 | 修正案 |
|---|---|---|---|---|
| 9-1 | low | `battleContent.ts:26-124` | **同じ「glob → validate → Map 化 → 重複警告」ループが5回コピー**（skills / traits / enemies / enemy-sets / effects）。各24行前後 | `_collect<T>(modules, kindLabel, validate)` の1本に畳む。差分は validate と正規化だけ（→ [06-data-config.md](06-data-config.md) §5-1） |
| 9-2 | low | `battleContent.ts` vs `battleBackgrounds.ts:24-25` | 重複時の挙動が**ローダ間で不一致**（前者は「後勝ちで上書き」、後者は「先勝ちでスキップ」） | どちらかに統一。現状で重複は発生しないので**統一しても挙動不変** |
| 9-3 | low | `battleContent.ts` | `battleBackgrounds.ts:31` は「glob の列挙順がビルド環境依存」なので id ソートしているが、**battleContent 側はソートしていない** | battleContent 側も id ソート（挙動不変・保険） |
| 9-4 | low | `battleGuide.ts:20-21` | `raw.sections` / `raw.terms` を**型検証なしでキャスト**。他のローダが持つ不正データ検出が無い | `Array.isArray` / `typeof` チェック（→ [06-data-config.md](06-data-config.md) §5-4） |
| 9-5 | low | `battleBackgrounds.ts:35-38 findBattleBackground` | ローダに検索関数が同居。線形探索が `BattleScreen.vue` の computed から毎回走る（23件未満なので実害なし） | Map を1つ持つだけで十分 |

---

## 10. `App.vue` の戦闘モード結合

→ [01-cross-cutting.md](01-cross-cutting.md) §1 に集約。要点のみ:

| # | Sev | file:line | 内容 |
|---|---|---|---|
| 10-1 | med | `App.vue:408-415` vs `:41-44` | 「状態の初期化」と「UIのマウント」が別条件で駆動されている |
| 10-2 | med | `App.vue:457-464` | `onUnmounted` が `battle` のタイマーを止めていない |
| 10-3 | low | `App.vue:35` vs `BattleScreen.vue:63` | `useBattleState` は App が所有してプロップで渡すのに、`useBattlePresentation` は BattleScreen が内部で生成。**所有権が非対称**（現状 BattleScreen は常時マウントなので可視挙動は変わらない） |
| 10-4 | low | `App.vue:259-264` | 終了経路が `watch(battle.state.status === 'finished')` 経由で、依存関係がコメントにしか書かれていない → `onRunFinished(cb)` で明示的に結線 |
| 10-5 | low | `App.vue:287-291` | `onThrown` の中に「戦闘モード」と「Canvasモード」の2つの世界が同居 |

---

## 11. テストカバレッジ

### カバーされている

- `useBattleState.test.ts`（**58本**）— ライフサイクル / リアクティビティ / プレイヤー行動 / ドラフト / リロール /
  スキルパネル / 決着とスコア / UI状態 / 1手番の演出。`manualScheduler` で任意順に進められる良い設計。
  **分割リファクタの回帰ネットとして十分強い。**
- `AppBattleMode.test.ts`（12本）— 戦闘モードの出入り・キャンバスの表示/非表示・ギブアップ→投擲。§10-1/10-2 を守る。
- `BattleScreen.test.ts`（約40本）/ `battleContent.test.ts`（ローダの件数一致・ID参照整合）。

### 未カバー（**Phase 0 で埋める**）

| Sev | 対象 | 備考 |
|---|---|---|
| **high** | `useBattlePresentation.ts:128-196 play()` の全分岐（critical / super_critical / weakness / resisted / miss / shield 吸収 / screenShake） | popup 3種・フラッシュ種別・シェイク値を検証するテストが**ゼロ**。§8-ケースA の `role` 化の前提 |
| **high** | `useBattlePresentation.ts:267-280` status watch（戦闘切替時の displayedHp クリア、勝敗SE） | 未カバー。「新しい戦闘で前の戦闘のHPが残る」という過去バグの再発防止が効いていない |
| med | `useBattlePresentation.ts:253-265` の announce ベースライン確保 | 間接的にしかカバーされていない（現在の失敗テスト2本がまさにここ） |
| med | `useBattleState.ts:315-339 handleOutcome` のボス周回 | `useBattleState.test.ts:507-548` で1ケースのみ。周回2周目以降・真クリア境界は未検証 |
| med | `useBattleState.ts:341-352 finalizeScore` | `giveUp` 経由で「0より大きい」程度の検証のみ。domain へ出せば単体テストしやすくなる |
| med | `useGlossaryPanel.ts` 全体 | **専用テストが存在しない。** singleton の状態持ち越し（§4-11）が検出できない |
| low | `battleBackgrounds.ts` / `battleGuide.ts` | 直接のローダテストなし |
| low | `useBattleState.ts:177-193 after()` の世代キャンセル | `giveUp` のケースのみ。`reset()` 中の取り消しは未検証 |

---

## 12. 現在失敗している3テストの診断（Phase 0 で解消）

### 12-1. `useBattleState.test.ts:669-678`「敵の手番も同じ順序で進み、攻撃者が誰か分かる」

- 症状: `expect(presentation.actorId).toBe(state.enemies[0].id)` が `enemy_goblin#0` を期待して `enemy_bat#1` を受け取る。
- 機序: `rng = () => 0.5` で選ばれるエンカウントが2体編成 `set_goblin_bat_duo` になり、
  `buildTurnQueue` は AGI 降順なので `enemy_bat`(agi 650) が `enemy_goblin`(agi 420) より先に動く。
  テストは `:674` のコメントどおり **「enemies 配列の順 = 手番の順」を暗黙に仮定**していた。
- **判定: テスト期待のドリフト（製品バグではない）。**
- 修正: `state.turnQueue[state.turnIndex].combatantId` と比較する、あるいは `enemies.some(e => e.id === actorId)` にすれば、
  意図（「敵が announce している」）を保ったまま将来のデータ変更に耐える。

### 12-2. `useBattlePresentation.test.ts:47` / `:92`（2本）

- 症状: `displayedAliveOf(enemyId)` が最初から `false`、`displayedHpOf` が1ステップ目で既に `0`。
- 機序: 同じ2体編成化により「敵は1体、倒したら戦闘終了」が成立しなくなった。既定の `IMMEDIATE_SCHEDULER`（同期）では
  `selectAction()` の**同一コールスタック内**で `announce(player)` → 効果解決（goblin 撃破） → `afterAction()` →
  `processTurns()` → `runEnemyTurn(bat)` → **`announce(bat)`** まで走り切る。
  この2度目の announce が §4-1 の sync watch を再発火させ、**まだ1発も再生していない段階で**
  `displayedHp`/`displayedAlive` を解決後の真値（hp=0 / alive=false）に上書きする。
- 実機（`TIMED_SCHEDULER`）では次の announce まで `impactWaitMs` 待つため通常は追い越されない
  → **今すぐ見える不具合ではない。**
- **判定: 直接原因はテスト期待のドリフト。ただし §4-1 の設計は実バグ予備軍**
  （§6-2 のとおり、見積りと実際のキュー長がずれた瞬間に実機でも再現する）。
- 修正: **テスト側**（挙動非変更）— 敵を1体に固定して単体エンカウントを保証し、テストの意図（多段ヒットの段階表示）を維持する。
  **製品側**（推奨・別コミット）— §4-1 のガードを入れる。これを入れれば2体編成のままでも通る。

---

## 13. 数値サマリ

- `useBattleState.ts`: 626行 / 公開API 37個 / `status !==` ガード 9箇所 / `after()` 呼び出し 7箇所 /
  `as unknown as Combatant` 5箇所 / 3層ネストのコールバック 3箇所
- `useBattlePresentation.ts`: 293行 / 状態コンテナ 7個 / `fx_` 文字列判定 9箇所 / `watch` 3個（うち1つ `flush:'sync'`）
- `useGlossaryPanel.ts`: 67行 / module-level ref 5個（全て書き込み可能で公開）/ 専用テスト 0本
- ローダ3ファイル: 192行 / 同型ループ 5回コピー
- タイマー機構: 5系統
