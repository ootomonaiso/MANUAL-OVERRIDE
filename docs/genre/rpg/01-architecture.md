# 01. アーキテクチャ — メニューUIへの移行方式

対象範囲: 設計文書「アーキテクチャ上の最大の変更点」「アーキテクチャ（ファイル構成案）」「ラン（1回の遊び）の終了条件」

---

## 論点

`rpg` は**ジャンル確定後に横スクロールCanvasを使わず戦闘専用のメニューUIへ完全移行する唯一のジャンル**である。既存の phase 管理・画面切り替えに、他ジャンルにない分岐が必要になる。

## 現状の把握（実コード）

### Phase 定義

`src/domain/types.ts:35`

```ts
export type Phase = 'title' | 'tutorialIntro' | 'tutorial' | 'updating'
                  | 'playing' | 'genreLocked' | 'throwing' | 'ending'
```

### 画面の構成（`src/App.vue`）

| 行 | 内容 |
|---|---|
| 472 | `<canvas ref="canvasRef" class="game-canvas" v-show="!isBattleMode" />` — 要素自体は phase に関係なく常にDOMに残り、`isBattleMode` 中だけ `v-show` で非表示になる（後述の「決定」どおり実装済み） |
| 340-343 | `showGameUI` = phase が `title` / `ending` / `tutorialIntro` **以外** |
| 538 | `<template v-if="showGameUI">` 配下に HUD・説明書・ギブアップ等 |
| 557 | `ControlHintBadge` は `!isBattleMode && ['playing','tutorial','genreLocked'].includes(phase)` で制御（個別UIの表示条件はここ1箇所。ギブアップボタンは別条件 `['playing','genreLocked']` で `tutorial` を含まない） |

### `SideScroller` のライフサイクル

| 箇所 | 内容 |
|---|---|
| `App.vue:126`（`startGame()` 内） | `scroller = new SideScroller(canvas, cloneRules())`。タイトル画面の「はじめる」ボタン、またはデバッグパネルの `forceGenre` 適用（`onDebugApply()` → `startGame()`）から呼ばれる。**`onMounted` からではない**（`onMounted` は `resize` / `keydown` のイベント登録のみを行う） |
| `App.vue:53-56` | `isActivePlayPhase()` は `isBattleMode` 中は `false` を返し、それ以外は `playing` / `tutorial` / `genreLocked` を判定する（後述の「決定」で挙げる分岐がすでに実装済み） |
| `App.vue:239` | カード選択のたび `scroller.updateRules(...)` |
| `App.vue:245-257` | `giveUp()` → 戦闘モードなら `battle.giveUp()` へ分岐、それ以外は `scroller.recalcPlayScore()` → `setPaused(true)` → `startThrowing()`（後述の「決定」どおり実装済み） |
| `App.vue:284-300` | `onThrown()` → 戦闘モードなら `battle.playScore.value` を、それ以外は `scroller.getStats()` / `snapshot.value.playScore` を `finalizeThrowing()` へ渡す（後述の「決定」どおり実装済み） |

### 既存の統合点（`rpg` が満たす必要のある契約）

1. **`snapshot.playScore`** — 最終スコアの70%。`SideScroller` から毎フレーム取得している
2. **`scroller.getStats()`** — `ActionStats`。プレイスタイル検出（サプライズエンド）に使う
3. **`giveUp()`** — ギブアップで `throwing` へ
4. **死亡** — `snapshot.dead` の監視で `throwing` へ

---

## 決定: 方式A（既存 phase を維持し、`genreLocked` 中の表示を差し替える）

設計文書が挙げる2案のうち、**方式A（新しい phase を追加しない）**を採用する。

### 採用理由

| 観点 | 方式A（表示差し替え） | 方式B（新 phase 追加） |
|---|---|---|
| `Phase` 型への影響 | なし | 全 phase 判定箇所（`App.vue` に十数箇所）の見直しが必要 |
| 他ジャンルへの影響 | なし | phase を列挙している箇所すべてに影響しうる |
| 投擲フェーズへの接続 | 既存の `genreLocked → throwing` がそのまま使える | 新 phase からの遷移を別途実装 |
| ドラフト中の扱い | `genreLocked` のまま内部状態で表現 | さらに phase が増える |

**方式Bは `Phase` 型を変更するため、`rpg` と無関係な既存コードにまで影響が波及する。** 設計文書の「既存ジャンルを壊さない」方針に照らし、方式Aを採る。

### 表示の分岐

`App.vue` に**単一の判定**を追加し、そこを起点に分岐する。

```ts
/** rpg ジャンル確定後、戦闘UIへ移行しているか */
const isBattleMode = computed(() =>
  gameState.lockedGenre.value === 'rpg'
  && ['genreLocked', 'throwing'].includes(gameState.phase.value)
)
```

`throwing` を含めるのは、投擲中も背景に Canvas ではなく戦闘画面（または戦闘結果）を残すため。

分岐の内容:

| 対象 | 通常ジャンル | `isBattleMode` |
|---|---|---|
| `<canvas class="game-canvas">` | 表示 | **非表示**（`v-show="!isBattleMode"`） |
| `<BattleScreen>` | 非表示 | **表示** |
| `Hud`（距離・スコア等） | 表示 | **非表示**（戦闘UIが独自に持つ） |
| `ControlsLegend` / `ControlHintBadge` | 表示 | **非表示** |
| `ManualPanel` | 表示 | **表示**（投擲対象のため必須） |
| ギブアップボタン | 表示 | 表示（ラン終了条件の1つ） |

> **`v-if` ではなく `v-show` を使う理由**: `canvasRef` は `onMounted` で `SideScroller` に渡され、以後同じ要素を参照し続ける。`v-if` で DOM から外すと参照が切れる。`rpg` 以外のジャンルへ影響を出さないため、要素は残したまま非表示にする。
>
> **`display:none` による副作用がないことを確認済み**: `resizeCanvas()`（`App.vue:94-101`）は `canvas.width = window.innerWidth` と**ウィンドウ寸法を直接代入**しており、要素の描画サイズを参照していない。したがって非表示中もバッファ寸法は 0 にならず、`glitch` 上書き等で再表示された際も追加の再初期化を必要としない。

---

## `SideScroller` の扱い

戦闘モードでは Canvas 描画もフレーム更新も不要である。

### 停止のタイミング

`lockedGenre` が `rpg` になった時点で `scroller.setPaused(true)` する。既存の `watch(() => gameState.lockedGenre.value, ...)`（`App.vue:364`）に分岐を追加する。

`stop()` ではなく `setPaused(true)` とする理由:

- `stop()` は `onThrown()` の後に呼ばれる既存フローがあり、二重停止を避ける
- 投擲フェーズは Canvas とは独立した DOM オーバーレイ（`ThrowOverlay`）で動作するため、`scroller` を破棄する必要がない

### `isActivePlayPhase()` への影響

`App.vue:41` の `isActivePlayPhase()` は `genreLocked` を含むため、そのままでは戦闘中もキー入力が `SideScroller` へ流れる。**`isBattleMode` のとき false を返すよう修正する。**

```ts
function isActivePlayPhase() {
  if (isBattleMode.value) return false
  return ['playing', 'tutorial', 'genreLocked'].includes(gameState.phase.value)
}
```

---

## スコアの供給

### 課題

最終スコアは `finalizeThrowing(result, snapshot.value.playScore, gameStats)` で確定する。`snapshot` は `SideScroller` 由来のため、戦闘モードでは値が更新されない（`distance` も `kills` も 0 のまま）。

### 決定

`useBattleState` が **`playScore` を算出して公開**し、`App.vue` は戦闘モードのときそちらを使う。

実装は、共有の `computed`（`finalPlayScore` 等）を介する形ではなく、`onThrown()` 内で `isBattleMode` により直接分岐している（`App.vue:284-300`）。

```ts
function onThrown(result: ThrowResult) {
  if (isBattleMode.value) {
    scroller?.stop()
    gameState.finalizeThrowing(result, battle.playScore.value)
    return
  }
  const gameStats = scroller?.getStats()
  scroller?.stop()
  gameState.finalizeThrowing(result, snapshot.value.playScore, gameStats)
}
```

`battle.playScore` は `useBattleState.ts` 内で `state.playScore`（`evalScoreFormula()` の戻り値）を `computed` で公開したもの。

スコア式は `src/data/genres/rpg.json` の `scoreFormula` に実装済み: `battlesWon * 300 + bossDefeated * 3000 + maxSkillLevel * 200 + traitsAcquired * 150`。**値は調整前提の仮値**（詳細は [04-battle-flow.md](04-battle-flow.md)）。

### `ActionStats` の供給

`scroller.getStats()` はプレイスタイル検出（`jumps` / `shots` / `moveLeft` 等の横スクロール前提の統計）に使われる。戦闘モードではこれらの概念が存在しない。

**決定: 戦闘モードでは `gameStats` を渡さない**（`finalizeThrowing(result, playScore)` の2引数版を呼ぶ）。

`useGameState.finalizeThrowing` は `gameStats` が undefined の場合、`playStyle` を `null` のままにし、`computeSurpriseEnding` へ `balanced` / `confidence: 0` を渡す既存経路がある（`useGameState.ts:312-321`）。この経路では**プレイスタイル由来のサプライズエンドは発生せず、矛盾由来の glitch エンドのみが有効**になる。

> **補足（推測）**: 戦闘の行動傾向（攻撃的/防御的など）から `ActionStats` 相当を合成することは可能だが、既存の `ActionStats` は横スクロール専用のフィールド構成であり、無理に対応付けると意味のない判定になる。本仕様では見送る。

---

## ラン終了条件と phase の対応

設計文書の3つの終了条件を、既存 phase へ次のように対応させる。

| 終了条件 | 実装 |
|---|---|
| **ボスに勝利**（クリア） | `useBattleState` が終了を検知 → `gameState.startThrowing()` |
| **プレイヤーが倒れる**（敗北） | 同上 |
| **自分で終了を選ぶ** | 既存のギブアップボタン → `giveUp()` |

いずれも `throwing` へ遷移し、以降の投擲・エンディングは他ジャンルと共通である。

`giveUp()` は `scroller.recalcPlayScore()` を呼ぶが、戦闘モードでは意味を持たない（`playScore` は `useBattleState` 側が持つ）。**戦闘モードでは呼び出しをスキップする**。

---

## ファイル構成

### 新規（設計時点の案。実際の構成は後の「実装後の記録」および [08-ui.md](08-ui.md) を参照）

```
src/
├── data/
│   ├── skills/*.json                # スキル定義
│   ├── traits/*.json                # 特性定義
│   ├── enemies/*.json               # 敵定義
│   └── config/battle.json           # バランス定数
├── domain/battle/
│   ├── types.ts                     # 型定義
│   ├── stats.ts                     # 実効値の算出
│   ├── damageCalc.ts                # ダメージ・回復・命中
│   ├── turnQueue.ts                 # 行動順
│   ├── battleEngine.ts              # ターン進行・勝敗判定
│   ├── skillDraft.ts                # ドラフト抽選
│   └── effectOps/                   # スキル効果の部品
│       ├── index.ts                 # レジストリ
│       └── *.ts                     # 各オペレーション
├── components/battle/
│   ├── BattleScreen.vue
│   ├── StatusPanel.vue
│   ├── SkillListPanel.vue
│   ├── ActiveSkillBar.vue
│   ├── FocusSelector.vue
│   ├── TurnQueueBar.vue
│   ├── CharacterFrame.vue
│   ├── CharacterDetail.vue
│   ├── SkillDraftPanel.vue
│   ├── SkillText.vue
│   └── BattleEffectLayer.vue
└── composables/
    └── useBattleState.ts
```

> **実際との差分（要点のみ。詳細は「実装後の記録」）**: `data/skills` `data/traits` `data/enemies` はフラット配置ではなく `src/data/rpg/skills` `src/data/rpg/traits` `src/data/rpg/enemies`（rpg専用サブディレクトリ）に置かれている。`ActiveSkillBar.vue` `FocusSelector.vue` `TurnQueueBar.vue` `CharacterDetail.vue` `BattleEffectLayer.vue` は改修過程で削除され、`components/battle/` は最終的に19ファイル構成になった。コンポーネントの現在の役割一覧は [08-ui.md](08-ui.md) の「コンポーネント構成」表が正。

### 変更

| ファイル | 変更内容 |
|---|---|
| `src/App.vue` | `isBattleMode` 追加、canvas/HUD の表示分岐、`isActivePlayPhase()` 修正、スコア供給の分岐、`giveUp()` の分岐 |
| `src/data/genres/rpg.json` | `enableFeatures` と `scoreFormula` を戦闘システム用に再設計 |
| `src/domain/types.ts` | `ScoreVars` に戦闘用変数を追加 |
| `src/domain/scoreCalc.ts` | 追加変数に対応（型と評価の両方） |
| `src/framework/config-types.ts` | `battle.json` の型 |
| `src/data/tunables.ts` | `BATTLE` の export |
| `scripts/validate-json.mjs` | 新規 JSON 群の検証 |
| `src/framework/ConfigValidator.ts` | `battle` を必須セクションへ |

### 変更しない

| ファイル | 理由 |
|---|---|
| `src/domain/types.ts` の `Phase` | 方式Aのため変更不要 |
| `src/game/sideScroller.ts` | 戦闘モードでは一時停止するのみ |
| `src/genres/RpgPlugin.ts` | **`genreLocked` 前（`playing` 中）は従来どおり Canvas で描画されるため残す**（後述） |
| `src/game/systems/*.ts` | `rpg` では使わないが他ジャンルが使用 |

---

## ジャンル確定前の扱い

**重要**: `rpg` に収束するのは `genreLocked` の時点である。それ以前（`tutorial` / `playing` / `updating`）は横スクロールで進行する。

したがって:

- `RpgPlugin.ts`（Canvas 描画）は**削除しない**。確定前の描画には使われない（確定前は選択履歴に応じた `base` 等の描画）が、`GameRegistry` の登録・`JSONGenrePlugin` のフォールバック解決に `rpg` の存在が必要
- `src/data/genres/rpg.json` の `theme` / `bgColor` / `visual` 等の描画関連フィールドは**そのまま残す**

`rpg.json` の `enableFeatures` は戦闘モードでは参照されないが、**確定の瞬間に一度 `buildRuntimeRules` を通る**ため、不整合な値を入れると確定直後の1フレームで例外が出うる。既存の Feature を破壊しない値にする（詳細は [07-data-schema.md](07-data-schema.md)）。

---

## エッジケース

| ケース | 扱い |
|---|---|
| ジャンル確定後もカード選択が続く | 既存仕様では `genreLocked` 後も `choose()` は呼ばれうる。戦闘モードでは説明書更新のトリガー（距離ベース）が発火しないため、**実質的に発生しない**。ただし `debugForceGenre` 経由では起こりうるため、`updateRules` を戦闘状態に影響させないこと |
| `debugForceGenre('rpg')` | タイトルから直接 `genreLocked` へ飛ぶ。戦闘の初期化が `lockedGenre` の watch で走るため動作する。デバッグ導線として維持する |
| 矛盾による `glitch` 上書き | `choose()` 内で `lockedGenre` が `glitch` へ強制変更されうる（`useGameState.ts:283`）。この場合 `isBattleMode` が false になり Canvas へ戻る。**戦闘状態は破棄する** |
| `restart()` | `lockedGenre` が null に戻るため `isBattleMode` も false。戦闘状態を初期化すること |

---

## 実装後の記録

本ドキュメントで「決定」として挙げた方式（方式A: 既存 phase を維持し `isBattleMode` で表示を差し替える）は、
`isBattleMode` の判定・`v-show` による canvas 非表示・`isActivePlayPhase()` / `giveUp()` / `onThrown()` の
戦闘モード分岐・`lockedGenre` の watch での `battle.initRun()` / `battle.reset()` 呼び出しを含め、
設計どおりに実装されている（各表の行に実際の行番号を付記済み）。

設計時点の記述との差分は次のとおり:

- **`SideScroller` の生成タイミング**: 「`onMounted` で1度だけ生成」という設計時点の前提記述は誤りだった
  （rpg対応に起因する変更ではなく、記述時点から実態と食い違っていた）。実際は `startGame()`
  （タイトル画面の「はじめる」、またはデバッグパネルの `forceGenre` 適用）から生成される。
  `isBattleMode` を経由するのはジャンルが `rpg` に確定した**後**であり、生成タイミング自体は
  rpg 対応の影響を受けていない。
- **`finalPlayScore` の共有 computed は導入されていない**: 設計では `App.vue` 側に
  `isBattleMode` で分岐する共有 `computed` を置く案を示していたが、実装は `onThrown()` 内で
  直接 `if (isBattleMode.value)` 分岐する形になっている。結果（渡される値）は設計どおり。
- **`scoreFormula` は仮値ながら実装済み**: 「実装後に持ち越し」としていたスコア式は
  `battlesWon * 300 + bossDefeated * 3000 + maxSkillLevel * 200 + traitsAcquired * 150`
  として `src/data/genres/rpg.json` に定義されている。バランス調整前提の仮値であり、
  最終値ではない（詳細は [04-battle-flow.md](04-battle-flow.md)）。
- **データ配置がジャンル専用サブディレクトリへ変更**: 「ファイル構成」で示した
  `src/data/skills` `src/data/traits` `src/data/enemies` はフラット配置の案だったが、
  実際は `src/data/rpg/skills` `src/data/rpg/traits` `src/data/rpg/enemies`
  （他ジャンルが参照しない rpg 専用データとして `src/data/rpg/` 配下にまとめる方針。
  CLAUDE.md 参照）に置かれている。加えて `src/data/rpg/enemy-sets/*.json`（敵グループ編成）・
  `src/data/rpg/battle-effects/*.json`・`src/data/rpg/battle-backgrounds/*.json` など、
  設計時点では想定していなかったデータ種別も後続フェーズ（敵グループ/難易度スケーリング等）で追加された。
- **コンポーネント構成は大きく再編された**: `ActiveSkillBar.vue` `FocusSelector.vue`
  `TurnQueueBar.vue` `CharacterDetail.vue` `BattleEffectLayer.vue` はいずれも改修の過程で
  削除され、代わりに `TurnBadge.vue` `CommandMenu.vue` `SkillCommandPanel.vue`
  `CharacterFrame.vue`（予告チップ・相性プレビュー含む）`InfoPanel.vue` /
  `InfoPanelShell.vue`（詳細表示の統合パネル）`CategoryListPanel.vue`（カテゴリポイント一覧）
  `SkillPanel.vue`（5戦ごとのスキル/ステータス配分パネル）`HelpGuide.vue` / `GlossaryTerm.vue`
  （用語ヘルプ）等が追加された。現在のコンポーネント一覧・役割は [08-ui.md](08-ui.md) を参照。
