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

### 戦闘参加者

```ts
export interface Combatant {
  id: string
  label: string
  isPlayer: boolean

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

  /** 敵のみ: 行動パターンの現在位置 */
  patternIndex?: number
  /** 敵のみ: 隊列上の位置（0 が左端） */
  formationIndex?: number
  /** 敵のみ: ボスか */
  isBoss?: boolean
}
```

### 所持スキル

```ts
export interface OwnedActive {
  id: string
  level: number          // 1〜4
  stacks: number         // 現レベルで貯まっている重複数
  cooldown: number       // 現在のクールタイム残
  slotIndex: number | null   // 0〜3。null = 枠から外して保管中
}

export interface OwnedPassive {
  id: string
  level: number
  stacks: number
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
  bossDefeated: boolean

  player: Combatant
  /** 敵。撃破されても配列から削除しない（formationIndex を保つため） */
  enemies: Combatant[]

  /** 現ラウンドの行動順 */
  turnQueue: TurnEntry[]
  turnIndex: number
  roundCount: number

  /** 進行状態 */
  status: BattleStatus

  /** ドラフト提示中の選択肢 */
  draftOptions: DraftOption[] | null

  /** カテゴリ別の累計ポイント */
  categoryPoints: Record<CategoryId, number>

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
}

export type BattleStatus =
  | 'battle'        // 戦闘中
  | 'drafting'      // ドラフト選択中
  | 'swapping'      // アクティブスキルの入れ替え先選択中
  | 'finished'      // ラン終了（勝利・敗北とも）
```

---

## 保持すべき状態（設計文書の要求との対応）

| 設計文書の要求 | 対応 |
|---|---|
| アクティブ4枠の スキルID / レベル / スタック / クールタイム | `OwnedActive`（`slotIndex !== null`） |
| 枠から外して保管中のアクティブ | `OwnedActive`（`slotIndex === null`） |
| 所持パッシブ: ID / レベル / スタック | `OwnedPassive` |
| 所持特性: IDのリスト | `OwnedTrait` |
| カテゴリ別の取得数 | `categoryPoints` |
| 10ステータスの現在値 | `baseStats` + 都度算出する実効値 |
| 現在のシールド耐久値 | `Combatant.shield` |
| 戦闘数・ボス撃破フラグ | `battlesWon` / `bossDefeated` |
| 既見フラグ | `seenIds` |

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

```ts
export function useBattleState() {
  const state = reactive<BattleState>(...)

  return {
    state: readonly(state),
    playScore: computed(() => state.playScore),

    // ── ライフサイクル ──
    initRun(rng?: () => number): void,      // ジャンル確定時
    reset(): void,                          // restart 時

    // ── 戦闘進行 ──
    selectAction(action: PlayerAction): void,
    confirmFocus(targets: Combatant[]): void,

    // ── ドラフト ──
    selectDraft(index: number): void,
    confirmSwap(slotIndex: number): void,
    cancelSwap(): void,

    // ── 終了 ──
    giveUp(): void,

    // ── UI ──
    toggleStatusMode(): void,
    toggleBuffDiff(): void,
    markSeen(ids: string[]): void,
  }
}
```

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

（実装完了後に追記）
