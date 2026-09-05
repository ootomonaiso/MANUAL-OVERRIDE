# 10. 状態管理

対象範囲: 設計文書「状態管理」

---

## 方針

戦闘の状態は **`BattleState` として独立させ、既存の `Player` クラス（`src/game/entities.ts`）は拡張しない。**

理由:

- `Player` は横スクロール前提（`x` / `y` / `vx` / `vy` / `onGround` / `jumpsLeft` 等）であり、ターン制戦闘と共有する意味がない
- `Player.level` / `exp` は既存の（死んでいる）フィールドだが、本ジャンルのレベルは**スキルごと**であり、キャラクター単位のレベルではない
- 既存クラスを変更すると他ジャンルへ影響が波及する

---

## 型定義

### 継続ダメージ・カウンター・変化ボーナス（実装後に追加）

反撃/継続ダメージ等の構造拡張フェーズ（無属性スキル追加と同時期）で、`Combatant` に持たせる状態として以下3つが追加された。いずれも `src/domain/battle/types.ts` に定義がある。

```ts
/** 継続ダメージ（DOT）。龍鱗 想定。シールド・カット率を経由せず、endOfRound() で直接HPを減らす */
export interface PeriodicSelfEffect {
  kind: 'trueDamagePercentMaxHp'
  ratio: number       // 実効最大HPに対する割合（0.15 = 15%）
  sourceId: string
}

/**
 * カウンター/反射板 用の反撃態勢。被弾しても即座には反撃せず、攻撃側の一連の行動
 * （repeat含む）が完全に終わってから、命中した回数ぶんまとめて反撃する。
 * element は「反撃自体の属性」と「どの属性の被弾に反応するか」を兼ねる
 * （カウンター＝物理のみ反応、反射板＝魔法のみ反応）
 */
export interface PendingCounter {
  scaleStat: 'def' | 'ref'
  rate: number
  element: Element
  sourceId: string
}

/**
 * transformsInto + grantsBonusOnTransformUse から発生する、変化先スキル専用の
 * 一時ボーナス（立直→自摸の「一発ツモ」想定）。targetSkillId と一致するスキルが
 * 次に使われた時だけ消費される。roundsRemaining は nextRound スコープと同じ2ラウンド寿命
 */
export interface PendingTransformBonus {
  targetSkillId: string
  stat: StatKey
  amount: number
  roundsRemaining: number
}
```

### 戦闘参加者

```ts
export interface Combatant {
  id: string
  label: string
  isPlayer: boolean
  /** 描画に使うスプライトID（EnemyDef.sprite / battle.json の playerSprite 由来） */
  spriteId: string

  /** 10ステータスの基礎値 */
  baseStats: BattleStats
  /** 現在HP。最大HPは baseStats.hp の実効値 */
  hp: number
  /** シールド残量 */
  shield: number
  alive: boolean

  /** 所持している特性 */
  traits: OwnedTrait[]
  /** 所持しているパッシブスキル */
  passives: OwnedPassive[]
  /** 所持しているアクティブスキル（プレイヤーは枠管理あり） */
  actives: OwnedActive[]

  /** 一時的な補正（ターン・戦闘限定のバフ/デバフ） */
  temporary: TemporaryModifier[]
  /** 継続ダメージ（龍鱗 想定） */
  periodicSelfEffects: PeriodicSelfEffect[]
  /** カウンター/反射板の反撃態勢 */
  pendingCounter: PendingCounter | null
  queuedCounterHits: number
  /** 一発ツモ 想定の変化先スキル専用ボーナス */
  pendingTransformBonus: PendingTransformBonus | null

  /** 「守る」「避ける」のクールタイム（両方には同時になれないが枠は共通で扱う） */
  builtinCooldowns: { guard: number; dodge: number }

  /** 敵のみ: EnemyDef.actionPattern をそのまま保持する。プレイヤーは空配列 */
  actionPattern: string[]
  /** 敵のみ: 行動パターンの現在位置。プレイヤーは 0 のまま未使用 */
  patternIndex: number
  /** 敵のみ: 隊列上の位置（0 が左端）。プレイヤーは 0 のまま未使用 */
  formationIndex: number
  /** 敵のみ: ボスか。プレイヤーは常に false */
  isBoss: boolean
}
```

> **注意**: `patternIndex` / `formationIndex` / `isBoss` は当初 optional（`?`）として設計されていたが、実装では `freshCombatant()` が常に値を設定するため必須フィールドになっている（プレイヤーには意味を持たない既定値が入るだけ）。

### 所持スキル

```ts
// 第7フェーズ（スキルポイント制度）で level/stacks の意味が変わった。docs/genre/rpg/06-draft.md 参照
export interface OwnedActive {
  id: string
  points: number          // 投資済みポイント（累計）。ドラフトの重複取得+パネル配分で増える
  level: number            // levelForPoints(points) と同期する実効レベル（1〜4）
  cooldown: number         // 現在のクールタイム残
  slotIndex: number | null   // 0〜3。null = 枠から外して保管中
}

// レベル/スタックの概念を廃止（所持しているか否かの二値のみ）。
// level は敵の所持パッシブの強さ調整用に残したフィールドで、プレイヤー取得分は常に1固定
export interface OwnedPassive {
  id: string
  level: number
}

export interface OwnedTrait {
  id: string             // レベルの概念を持たない
}
```

### 一時補正

```ts
export type ModifierScope = 'thisHit' | 'thisTurn' | 'thisBattle' | 'permanent'

export interface TemporaryModifier {
  stat: StatKey | 'cutRate'    // cutRate は「守る」用（ステータスではない）
  flat?: number
  rate?: number
  scope: ModifierScope
  /** 付与元（表示・デバッグ用） */
  sourceId: string
}
```

### 戦闘全体

```ts
export interface BattleState {
  /** ラン全体の進行 */
  battleIndex: number          // 何戦目か（0 始まり）
  battlesWon: number
  /** 直近の戦闘でボスを倒したか（一時フラグ。背景選択・UI表示用） */
  bossDefeated: boolean
  /** ラン通算のボス撃破数。真のクリア判定・スコアはこちらを使う（ボスは周回で何度も出現する） */
  bossesDefeatedCount: number
  /** ラン終了の内訳。giveUp() を勝敗と区別するために追加された */
  runOutcome: 'won' | 'lost' | 'gaveup' | null

  player: Combatant
  /** 敵。撃破されても配列から削除しない（formationIndex を保つため） */
  enemies: Combatant[]

  /** 現ラウンドの行動順 */
  turnQueue: TurnEntry[]
  turnIndex: number
  roundCount: number

  /** 進行状態 */
  status: BattleStatus

  /** 現在の戦闘の背景ID（src/data/rpg/battle-backgrounds/*.json） */
  backgroundId: string | null

  /** ドラフト提示中の選択肢 */
  draftOptions: DraftOption[] | null
  /** アクティブ枠が全て埋まった状態で新規アクティブを選んだ際、入れ替え先の選択待ちで保持するスキルID */
  pendingSwapSkillId: string | null

  /** カテゴリ別の累計ポイント */
  categoryPoints: Record<CategoryId, number>

  /** ドラフトの引き直し回数。戦闘に勝つたび1増え、使うと1減る */
  rerollCharges: number
  /** 残りドラフト回数。通常1。ボス撃破時（真のクリアでない場合）は見返りとして
   *  複数回（bossDraftRounds）に増え、1回選ぶたびに1減る */
  pendingDraftRounds: number

  /** スキルポイント制度（第7フェーズ）。docs/genre/rpg/06-draft.md 参照 */
  skillPoints: number
  statAllocations: Record<GrowthStatKey, number>
  statPoints: number

  /** 「見たことがあるか」。所持状態とは独立 */
  seenIds: Set<string>

  /** 表示設定（ラン中は保持） */
  ui: {
    statusPanelMode: 'base' | 'effective'
    showBuffDiff: boolean
    statusPanelCollapsed: boolean
    skillListCollapsed: boolean
  }

  /** ラン終了時に確定するプレイスコア */
  playScore: number

  /** 撃破後ドラフト前に発生した戦闘間イベントのログ（回復特性等の表示用） */
  lastBattleEndNotices: string[]
}

export type BattleStatus =
  | 'battle'        // 戦闘中
  | 'drafting'      // ドラフト選択中
  | 'swapping'      // アクティブスキルの入れ替え先選択中（第7フェーズ以降、常にスキルパネルから起動する）
  | 'skillPanel'    // スキルポイント制度: 5戦ごとのポイント配分パネル（第7フェーズ）
  | 'finished'      // ラン終了（勝利・敗北とも）
```

---

## 保持すべき状態（設計文書の要求との対応）

| 設計文書の要求 | 対応 |
|---|---|
| アクティブ4枠の スキルID / レベル / ポイント / クールタイム | `OwnedActive`（`slotIndex !== null`） |
| 枠から外して保管中のアクティブ | `OwnedActive`（`slotIndex === null`） |
| 所持パッシブ: ID（レベル概念なし） | `OwnedPassive` |
| 未配分のスキル/ステータスポイント | `skillPoints` / `statPoints` / `statAllocations` |
| 所持特性: IDのリスト | `OwnedTrait` |
| カテゴリ別の取得数 | `categoryPoints` |
| 10ステータスの現在値 | `baseStats` + 都度算出する実効値 |
| 現在のシールド耐久値 | `Combatant.shield` |
| 戦闘数・ボス撃破フラグ | `battlesWon` / `bossDefeated`（ラン通算のボス撃破数は `bossesDefeatedCount`） |
| 既見フラグ | `seenIds` |
| 継続ダメージ・カウンター態勢・変化ボーナス | `Combatant.periodicSelfEffects` / `pendingCounter` + `queuedCounterHits` / `pendingTransformBonus`（実装後に追加。上記「継続ダメージ・カウンター・変化ボーナス」参照） |

---

## 基礎値と実効値の両方を扱う

**ステータス表示パネルが基礎値・実効値の両方を表示するため、両方を参照できる必要がある**（設計文書「実装上の注意点 11」）。

**決定: 基礎値のみを保持し、実効値は都度算出する。**

```ts
/** その時点の全補正を適用した実効ステータスを算出する */
export function computeEffectiveStats(c: Combatant): EffectiveStats
```

実効値をキャッシュしない理由:

- 補正の増減（バフ・デバフ・パッシブ取得）のたびに再計算が必要で、キャッシュの無効化漏れがバグになる
- ターン制のため計算頻度が低く、毎フレーム再計算する横スクロールと違って性能上の問題がない

ただし1ターン内で何度も参照する場合は、**呼び出し側でローカル変数に取る**（関数内で使い回す）。

### 現在HPと最大HPの関係

`baseStats.hp` は**最大HPの基礎値**であり、現在HPは `Combatant.hp` が別に持つ。

最大HP = `computeEffectiveStats(c).hp`

最大HPが減少した場合（デバフ等）、**現在HPを新しい最大HPでクランプする**（[02-stats.md](02-stats.md)）。

---

## `useBattleState` の責務

> **実装後の変更**: 当初案にあった `confirmFocus(targets)` という2段階の対象選択ステップは実装されていない。
> 実際は `selectAction(action, centerEnemyIndex)` が対象選択を兼ねる
> （`centerEnemyIndex` は `focusRange: 'adjacent3'` 等で中心にする敵のインデックス。単体対象や全体対象では無視される）。
> また、第7フェーズ（スキルポイント制度）でスキルパネル関連の関数が、表示ヘルパーとして
> ダメージ見積り等の関数が増え、当初案より返り値がかなり大きくなっている。

```ts
export function useBattleState(options: { scheduler?: BattleScheduler } = {}) {
  const state = reactive<BattleState>(...)

  return {
    // ── 状態・派生値 ──
    state: readonly(state),
    effectQueue: readonly(effectQueue),       // 09-effects.md の EffectRequest キュー
    presentation: readonly(presentation),     // 提示中のスキル名・演出フェーズ（announce/impact）
    playScore: computed(() => state.playScore),
    isPlayerTurn: ComputedRef<boolean>,
    isPresenting: ComputedRef<boolean>,
    guardOrDodge: ComputedRef<'guard' | 'dodge'>,  // replaceGuard 特性で「守る」→「避ける」に差し替わる
    turnNumber: ComputedRef<number>,          // roundCount + 1（表示用）
    battleNumber: ComputedRef<number>,        // battleIndex + 1（表示用）

    // ── ライフサイクル ──
    initRun(rng?: () => number): void,        // ジャンル確定時。二重呼び出しは冪等
    reset(): void,                            // restart 時

    // ── 戦闘進行 ──
    selectAction(action: PlayerAction, centerEnemyIndex?: number | null): void,

    // ── ドラフト ──
    selectDraft(index: number): void,
    confirmSwap(targetSlotIndex: number): void,
    cancelSwap(): void,
    rerollDraft(): void,                      // rerollCharges を1消費して引き直す

    // ── スキルパネル（第7フェーズ: 5戦ごとのポイント配分） ──
    selectStoredActiveToEquip(activeId: string): void,
    unequipActive(activeId: string): void,
    allocateSkillPoint(activeId: string, amount?: number): void,
    setStatAllocation(stat: GrowthStatKey, amount: number): void,
    resetStatAllocations(): void,
    closeSkillPanel(): void,                  // パネルを閉じて次の戦闘へ

    // ── 終了 ──
    giveUp(): void,

    // ── UI ──
    toggleStatusMode(): void,
    toggleBuffDiff(): void,
    toggleStatusCollapsed(): void,
    toggleSkillListCollapsed(): void,
    markSeen(ids: readonly string[]): void,
    consumeEffect(): EffectRequest | undefined,

    // ── 表示用ヘルパー（DeepReadonly な CombatantView を受けて計算する） ──
    effectiveOf(c: CombatantView): EffectiveStats,
    nextEnemySkillPreview(e: CombatantView): string | null,
    estimateDamageToPlayer(e: CombatantView, skillId: string, level: number): number,
    draftOptionLabel(opt: DraftOption): { label: string; flavorText: string } | null,
    categoryPointsOf(c: CombatantView): Record<CategoryId, number>,
    categoryContributions(c: CombatantView, category: CategoryId): CategoryContribution[],
  }
}
```

演出の「間」はコンストラクタ引数の `scheduler`（既定は同期実行の `IMMEDIATE_SCHEDULER`）が刻む。実プレイでは `TIMED_SCHEDULER`（`window.setTimeout` ベース）を `App.vue` から渡し、テストでは既定の同期スケジューラのまま1手番が即座に解決する。

### `App.vue` との接続

| タイミング | 処理 |
|---|---|
| `lockedGenre` が `rpg` になった | `initRun()` を呼び、`scroller.setPaused(true)` |
| ラン終了（`status === 'finished'`） | `gameState.startThrowing()` |
| `onThrown()` | `playScore` を `finalizeThrowing` へ渡す |
| `restart()` | `reset()` |
| `lockedGenre` が `glitch` へ上書き | `reset()`（[01-architecture.md](01-architecture.md)） |

---

## 乱数

**乱数生成器を注入可能にする。**

```ts
initRun(rng: () => number = Math.random)
```

対象:

| 用途 | |
|---|---|
| 初期ステータスの生成 | 600〜800 等 |
| 初期スキルの選択 | 叩く / ファイアボール |
| ドラフト候補の抽選 | |
| クリティカル判定 | |
| 命中判定 | |
| 敵の選出 | |

理由: テストで固定シードを与えて再現可能にするため。`Math.random()` を直接呼ぶ実装にすると検証できない。

> **注意**: `src/game/` 側には「描画は乱数を消費しない」という既存方針（`tests/feature-render-purity.test.mjs`）がある。戦闘UIは `src/components/` 配下であり同テストの対象外だが、**同じ考え方（演出が乱数列に影響しない）を守る**。

---

## リアクティビティの注意

`useGameState` は `readonly(rules)` を返し、過去に `SideScroller` へ渡した際に書き込みが no-op になる問題があった（`plan/engine-audit-report.md` の高優先度項目）。

**同じ轍を踏まないため、`BattleState` は次の方針を守る。**

- ドメインロジック（`src/domain/battle/*`）は**プレーンなオブジェクトを受け取る純粋関数**として実装する。Vue の `reactive` / `readonly` に依存しない
- `useBattleState` が `reactive` でラップし、ロジックへ渡す際は `toRaw()` で素のオブジェクトにする
- 外部（コンポーネント）へは `readonly` で公開し、変更は必ず `useBattleState` のメソッド経由にする

---

## エッジケース

| ケース | 扱い |
|---|---|
| `initRun()` が二重に呼ばれる | 冪等にする（既に初期化済みなら何もしない）。`lockedGenre` の watch が複数回発火しうるため |
| ラン終了後に行動が選択される | `status === 'finished'` なら操作を無視する |
| 敵配列が空 | 生成時に最低1体を保証（[04-battle-flow.md](04-battle-flow.md)） |
| `seenIds` がラン間で持ち越されるか | **持ち越さない**。`reset()` でクリアする |

> **決定（Q14）**: `seenIds` の永続化は行わず、**ラン内のみ**とする。

---

## 影響を受ける既存ファイル

| ファイル | 変更 |
|---|---|
| `src/composables/useBattleState.ts` | 新規 |
| `src/domain/battle/types.ts` | 新規 |

**`src/game/entities.ts` の `Player` は変更しない。**

---

## 実装後の記録

本文中の型定義は現在のソース（`src/domain/battle/types.ts`）に合わせて更新済み。変更の全体像は以下のとおり。

- **`Combatant` に継続ダメージ・カウンター・変化ボーナスの3状態を追加**（`periodicSelfEffects`/`pendingCounter`+`queuedCounterHits`/`pendingTransformBonus`。第4フェーズ、構造変更9件）。いずれも戦闘終了時にリセットされ、戦闘をまたいで持ち越さない（上記「型定義」節参照）
- **`BattleState` にラン通算のボス撃破管理を追加**（`bossesDefeatedCount`/`pendingDraftRounds`）。当初の「`bossDefeated`（一時フラグ）で即ラン終了」という設計から、「5周＝25回目のボス撃破で真のクリア」（第6フェーズ）へ変更されたことに伴う（[04-battle-flow.md](04-battle-flow.md)参照）
- **`BattleStatus` に `'skillPanel'` を追加**（第7フェーズ、スキルポイント制度）。5戦ごとに挟むポイント配分パネル用の状態
- **`OwnedActive`/`OwnedPassive` がスキルポイント制度に合わせて再設計された**（第7フェーズ）。`OwnedActive` はレベルを直接持たず `points`（投資済みポイント）から導出し、`OwnedPassive` はレベル/スタック概念が実質廃止（プレイヤー取得分は常に1固定。フィールド自体は敵の所持パッシブ強さ調整用に残る）
- **`useBattleState()` の公開APIが当初案より大きく増えた**。2段階の対象選択（`confirmFocus`）は実装されず `selectAction` が対象選択を兼ねる形になった一方、スキルパネル用の関数群（`allocateSkillPoint`/`setStatAllocation`等）や表示用ヘルパー（`effectiveOf`/`categoryContributions`等）が追加された（上記「`useBattleState` の責務」参照）

`Player`（`src/game/entities.ts`）を変更しないという当初方針は最後まで維持された。
