# 04. components 層（`src/components/battle/**`）

親: [README.md](README.md) / 対象: 19ファイル・4,670行

**この領域の絶対条件: 描画結果（DOM構造・算出CSS）を1pxも変えない。**
CSS/DOM に触れる作業では、[README.md](README.md) §2 の「ビルド出力CSSの before/after 比較」を必ず通すこと。

---

## 0. 現状の構造

    App.vue ── battle: ReturnType<useBattleState>  ← 巨大オブジェクト1個を prop で渡す
       └ BattleScreen.vue (930行 = script 1-569 / template 571-741 / style 743-930)
            ├ BattleBackdrop      (背景canvas)
            ├ HelpGuide           (右上ヘルプ + 用語ポップアップ)
            ├ TurnBadge
            ├ .hud-left ┬ StatusPanel      ┐
            │           ├ SkillListPanel   ├ 折りたたみパネル三兄弟（殻が完全重複）
            │           └ CategoryListPanel┘
            ├ .battle-field ┬ CharacterFrame × N (敵) ┬ PixelSprite / GlossaryTerm
            │               ├ CharacterFrame (自機) ─┘
            │               ├ BuffStrip
            │               └ SkillCastBanner
            ├ .command-area ┬ CommandMenu
            │               ├ SkillCommandPanel ─ SkillText
            │               └ .focus-hint（インライン直書き）
            ├ SkillDraftPanel  ─ SkillText / GlossaryTerm
            ├ SkillPanel       ─ SkillText
            └ InfoPanel ─ InfoPanelShell / PixelSprite / SkillText / GlossaryTerm

- `InfoPanelShell` は既に正しく抽象化された唯一の共有殻（`InfoPanel` と `HelpGuide` が再利用）。**ここは手を入れない。**
- 一方で `.panel-toggle / .panel-collapse / .panel-collapse-inner / .panel-body` の殻は
  `StatusPanel` / `SkillListPanel` / `CategoryListPanel` に **3回コピペ** されている。
- ビューモデル生成が全て `BattleScreen.vue` の script に集中しており、**569行中およそ420行がビューモデル構築**。

> **注意:** `StatusPanel.vue`（137行）は `BattleScreen.vue:584` で現役使用中であり、
> §2-1 の重複の当事者。デッドコードではないので必ずスコープに含めること。

---

## 1. `BattleScreen.vue`（930行）の責務分解

### 1-1. 責務マップ

| 行 | 責務 | 抽出先 |
|---|---|---|
| 65-111 | ビューポート追従とスプライト寸法（`FLOOR_TOP` / `viewportHeight` / `playerSpriteHeight` / `enemyCountScale` / `enemyLineGapPx` / `enemySpriteHeight`） | `useBattleViewport()` |
| 113-121 | `statRows()` / `playerStatRows` / `playerMaxHp` | `viewModelHelpers.ts` |
| 123-129 | 背景解決と `themeVars`（CSS変数注入） | `useBattleTheme()` |
| 131-258 | コマンドの状態機械（`menu` 3状態 / `pendingAction` / `commandEntries` / `skillEntries` / 各ハンドラ） | `useBattleCommand()` |
| 253-268 | 相性プレビュー（`previewedSkill` / `affinityPreviewOf`） | `useBattleCommand()` に同居（`previewedSkill` と密結合） |
| 270-292 | 敵の予告（`NextPreview` / `nextPreviewOf` / `enemyPreviews`） | `useEnemyPreview()` |
| 294-350 | INFOパネル開閉とキャラクタービュー生成 | `useInfoPanelModel()` |
| 352-423 | スキル一覧ビュー（`visibilityOf` / `skillListView`、**単一 computed で72行**） | `useSkillListModel()` |
| 425-439 | カテゴリ一覧ビュー | `useSkillListModel()` |
| 441-471 | バフ表示 + **なぜかここに `onRerollDraft`（468-471、ドラフト責務の迷子）** | `useBuffViewModel()` / ドラフトへ移動 |
| 473-522 | ドラフトカード生成（`draftCards` 39行 / `swapSlotsView`） | `useDraftModel()` |
| 524-549 | スキルポイント配分パネル | `useSkillAllocationModel()` |
| 551-568 | 手番ラベル | `useTurnLabels()` |
| 571-741 | テンプレート（8つのトップレベル領域） | 4つの子コンポーネントへ |
| 743-930 | style（テーマ変数定義 + 5領域のレイアウト + `.focus-hint` の実装） | テーマCSS + 各子へ移動 |

### 1-2. 新規子コンポーネント（Phase 4-A）

| 新コンポーネント | 移動元 | props | emits |
|---|---|---|---|
| `BattleHudLeft.vue` | template 583-603 / style 784-807 | `statusCollapsed, statusMode, showDiff, stats, skillList(6配列), categoryCollapsed, categoryRows` | `toggle-status-collapsed, toggle-status-mode, toggle-diff, toggle-skill-list, toggle-category` |
| `BattleStage.vue` | template 605-674 / style 809-863 | `enemies: EnemyFrameView[], player, floorTop, shake, criticalFlash, enemyLineGapPx, buffEntries, banner` | `select-unit(id, enemyIndex)` |
| `BattleCommandArea.vue` | template 676-698 / style 866-910, 926-929 | `mode, commandEntries, skillEntries, hoveredCommand, playerHp, playerMaxHp` | `command-select, skill-select, cancel, preview, hover` |
| `FocusHint.vue` | template 693-697 / style 882-910 | なし | `cancel` |

> **`BattleStage.vue` を切り出す際の唯一の注意点:** `.battle-field` は `.critical-screen-flash`（z-index:25）、
> `.enemy-line`、`.player-slot`、および子の `CharacterFrame .popup-layer`（z-index:22。`CharacterFrame.vue:432-436` の
> コメントが「`.battle-field` 直下で `SkillCastBanner` の z-index:20 と比較される」ことに依存）の
> **stacking context の親**。`.battle-field` に新たな `position`/`transform`/`opacity`/`isolation` を足さない限り重なり順は変わらない。
> **ルート要素をそのまま `<div class="battle-field">` として移すこと。**

### 1-3. 新規 composable（Phase 4-B）

    src/composables/battle/
      useBattleViewport.ts        (BattleScreen 65-111)
      useBattleTheme.ts           (123-129)
      useBattleCommand.ts         (131-268)
      useEnemyPreview.ts          (270-292)
      useInfoPanelModel.ts        (294-350)
      useSkillListModel.ts        (352-439)
      useBuffViewModel.ts         (441-466)
      useDraftModel.ts            (468-522)
      useSkillAllocationModel.ts  (524-549)
      useTurnLabels.ts            (551-568)
      viewModelHelpers.ts         (skillRowsFrom / statRows / panelActiveView などの純関数)

すべて `battle: ReturnType<typeof useBattleState>` を引数に取り ref/computed を返す。
`BattleScreen.vue` は「composable を並べて子へ配る」だけの **150行程度** になる。

**着手順:** `useSkillListModel` → `useDraftModel` → `useBattleCommand` の順
（前2つが最も大きく、今後もフィードバックで一番書き換わる場所）。

---

## 2. パネル系コンポーネントの重複

### 2-1.【high】折りたたみ殻が3回コピペされている

`StatusPanel.vue:44-49,80-106` / `SkillListPanel.vue:49-54,110-136` / `CategoryListPanel.vue:44-49,88-113`

DOM構造が完全に同一（`.{name}-panel` > `.panel-toggle` + `.panel-collapse` > `.panel-collapse-inner` > `.panel-body`）で、
CSS の `.panel-toggle`（13行）/ `.panel-collapse`（4行）/ `.panel-collapse-inner` が **バイト単位で同一**。
`SkillListPanel.vue:52-54` だけインデントが崩れている（`</div>` 3連が 93-95 行で不揃い）のもコピペの痕跡。

**差分は5点だけ:**

| | StatusPanel | SkillListPanel | CategoryListPanel |
|---|---|---|---|
| ルートクラス | `.status-panel` | `.skill-list-panel` | `.category-list-panel` |
| トグル文言 | ステータス | スキル一覧 | カテゴリ一覧 |
| `min-width` | 160px | 180px | 180px |
| `max-height` | なし | 60vh | 32vh |
| `.panel-body` padding | `0 10px 10px` | `0 8px 8px` | `0 8px 8px` |

**修正案（Phase 4 / DOM・CSS完全維持）:** `CollapsiblePanel.vue` を新設し、
`rootClass` / `title` / `collapsed` を props、本体を `<slot />` にする。

- **ルートクラス名は必ず prop で受け取り、`.status-panel` 等の文字列を維持すること。**
  `BattleScreen.vue:796-807` の `.hud-left :deep(.status-panel)` と、
  `BattleScreen.test.ts:306,307,313,333` の `'.hud-left .status-panel'` / `'.status-panel .panel-controls button'` /
  `'.skill-list-panel'` がこの名前に依存している。
- `collapsed` 状態のCSSは共有殻内で `.collapsed .panel-collapse { grid-template-rows: 0fr }` と書けば算出結果は同じ
  （詳細度 0,2,0 → 0,2,0 で不変、競合ルールも存在しない）。
- `min-width` / `max-height` / `.panel-body` padding の差分は殻に入れず、**呼び出し側の scoped CSS** で
  `:deep(.panel-body) { … }` として持たせるか `bodyClass` prop で切り替える。親の `:deep()` は子より詳細度が高くなるので算出値は同一。
- 削減見込み: **約90行**。

### 2-2.【med】「ホバー優先 → 固定 → フォールバック」の focus ロジックが2回

`SkillPanel.vue:54-64` と `SkillCommandPanel.vue:47-58`。フォールバックだけが違う
（前者は `equippedActives[0] ?? null`、後者は `entries.find(e => !e.disabled) ?? entries[0] ?? null`）。

**修正案:** `src/composables/battle/useFocusedItem.ts` に
`useFocusedItem<T extends {id:string}>(items, fallback)` → `{ hoveredId, pinnedId, focused, onEnter, onLeave, onClick }`。
テンプレートは無変更なので描画は不変。`SkillCommandPanel` の「2回クリックで確定」（`onSlotClick` 67-75）は固有ロジックなので含めない。

### 2-3.【med】InfoPanel の「キャラクターペイン」が2回コピペ

`InfoPanel.vue:135-177`（player）と `:179-220`（enemy）。
`info-char-head` + `info-hp-bar` + `stat-grid` の **26行が完全に同一**（変数名だけ違う）。

**修正案:** `InfoCharacterPane.vue` を切り出し `character: InfoCharacterView` を受け取る。
player 側の「現在の効果 / パッシブ / 特性」（150-176）と enemy 側の「アクティブ/パッシブ/特性」（194-219）はスロットで差し込む。
CSS（230-323）はそのまま移動。

### 2-4.【—】`InfoPanelShell` は不変で良い

`HelpGuide.vue:91-107` と `InfoPanel.vue:128-134` の2箇所から使われる正しい共有殻。
`SkillPanel` / `SkillDraftPanel` のオーバーレイ（z-index:35）とはレイアウトが根本的に違う（左ナビの有無）ので **統合しない**。

### 2-5.【low】オーバーレイのカード外殻が3回

`SkillPanel.vue:162-174` / `SkillDraftPanel.vue:217-229` / `InfoPanelShell.vue:113-126` が
同じ `background: color-mix(...)` + `border` + `border-radius` + `color` + `font-family` を持つ。
既に変数経由なのでカスタムプロパティ化は不要。`src/styles/battle-surface.css` に `.battle-surface { … }` を1つ置き、
3箇所で `class="skill-panel battle-surface"` とする程度に留める。**優先度は低い。**

---

## 3. CSS の重複・ハードコード色

CLAUDE.md「テーマカラーの完全JSON駆動化（CSSハードコードなし）」に対する違反が多数。

### 3-1.【high】HPバーのグラデーションが3箇所にリテラル直書き

`CharacterFrame.vue:568 .hp-fill` / `InfoPanel.vue:257 .info-hp-fill` / `SkillCommandPanel.vue:204 .skill-hp-fill`
がいずれも `linear-gradient(180deg, #ffd07a 0%, #e88a2a 55%, #b4550f 100%)` で完全一致。

**修正案（Phase 2）:** `BattleScreen.vue:752-779` のテーマ変数ブロックに `--battle-hp-gradient` を1行足し、
3箇所を `background: var(--battle-hp-gradient)` に置換。カスタムプロパティは `.battle-screen` から全子スコープへ継承されるので算出値は完全同一。

### 3-2.【high】「説明書の紙面」パレットが4ファイルに散在

| 色 | 意味 | 出現箇所 |
|---|---|---|
| `#f6e3cf` | 紙の地色 | `BattleScreen.vue:886` / `CommandMenu.vue:60` / `SkillCommandPanel.vue:152,184` / `SkillCastBanner.vue:72` |
| `#4a2a1e` | 紙上の文字色 | `BattleScreen.vue:888,908` / `CommandMenu.vue:45,94` / `SkillCommandPanel.vue:187,220` / `SkillCastBanner.vue:75` |
| `#d9564b` | 赤枠・見出し | `BattleScreen.vue:887` / `CommandMenu.vue:61,74` / `SkillCommandPanel.vue:229,234` |
| `#c98a5a` | 茶枠 | `BattleScreen.vue:905` / `SkillCommandPanel.vue:174,185` |
| `#f0a878` | ホバー地色 | `CommandMenu.vue:99` / `SkillCommandPanel.vue:225,228` |
| `#f2ecdd` | 暗背景上の文字 | `BattleScreen.vue:777`（**既に `--battle-text` として変数化済み**）/ `BuffStrip.vue:62` / `SkillCastBanner.vue:64` / `SkillCommandPanel.vue:153` / `TurnBadge.vue:28` |

**`#f2ecdd` は変数が既にあるのに4ファイルがリテラルで書いている**＝変数化の意図が実装から漏れている。

**修正案（Phase 2）:** テーマ変数ブロックに
`--battle-paper` / `--battle-paper-ink` / `--battle-paper-accent` / `--battle-paper-border` / `--battle-paper-hover` を追加し、
各所を変数参照に置換。`#f2ecdd` は既存の `--battle-text` へ。すべて同一値なので算出結果は不変。

### 3-3.【med】テーマ変数ブロック自体が JSON 駆動でない

`BattleScreen.vue:752-779` に **22個の色リテラルが直書き**（要素色4、カテゴリ色11、差分色3、その他4）。
カテゴリ色は `skillText.ts:19-31 CATEGORY_COLOR` が `var(--battle-category-*)` を返す形で、
**値だけが Vue の style ブロックに残っている**という中途半端な状態（→ [02-domain.md](02-domain.md) §2-1）。

**修正案（Phase 6 / 描画不変）:** `src/data/config/battle_theme.json` を新設し
`{ element, category, diff }` を持たせる。`useBattleTheme()` が `themeVars`（`:125-129`）とマージして `:style` で流し込み、
style ブロックから該当22行を削除。`:style` はインライン（詳細度最強）なので、
`themeVars` が上書きしている `--battle-accent` / `--battle-panel`（背景JSON由来、`:127-128`）との優先順位も現状と同じ結果になる。

### 3-4.【med】バッジ/チップのCSSが3〜4回書かれている

**カテゴリバッジ**（`--category-color` + `color-mix` 20〜22%）:
`SkillPanel.vue:281-288 .active-category`（10px / padding 1px 6px / border無し）/
`SkillListPanel.vue:168-176 .item-category`（8px / 0 4px / `--radius-sm`）/
`SkillDraftPanel.vue:277-288 .card-category`（12px / 3px 10px / border有り / 999px）

**効果チップ**（`{label, isBuff, scopeLabel}` を ▲/▼ 付きで描く）:
`CharacterFrame.vue:185-192 + 614-632 .status-chip` / `InfoPanel.vue:152-159 + 284-300 .effect-chip` /
`BuffStrip.vue:26-40 + 57-84 .buff-item`（縦積み・鍵アイコン付きの派生形）

`.status-chip` と `.effect-chip` は **テンプレートの式まで同一**。

**修正案:** `EffectChip.vue` を新設し `variant: 'status' | 'effect'` でクラス名を切り替える
（`.status-chip` / `.effect-chip` の名前自体は保持。font-size 9px vs 12px の差があるため）。
`BuffStrip` は形が違うので統合対象外。カテゴリバッジは `CategoryBadge.vue` に `size: 'sm'|'md'|'lg'` を持たせ、
3つの宣言ブロックをそのまま3クラスとして内包する。

### 3-5.【low】`999px` / `text-shadow` の反復

`border-radius: 999px` が10箇所、`text-shadow: 0 2px 4px rgba(0,0,0,0.85〜0.9)` が4ファイル。
`--radius-pill` / `--battle-text-shadow` を `src/styles/global.css:44-45` の隣に追加すれば済む。

---

## 4. テンプレート内のフォーマット/ラベル生成の重複（Phase 2）

### 4-1.【high】`fmt(value, isPercent)` が完全重複

`StatusPanel.vue:25-28` と `InfoPanel.vue:119-121` が同一実装。
さらに `skillText.ts:53-55 pct(n)` が同じ式の**3つ目の実装**。

**修正案:** `skillText.ts` に `formatStatValue(v, isPercent)` を追加し内部で `pct()` を使う。2つの `fmt` を削除して import に置換。

### 4-2.【high】HP 比率と `n/m` 表示が3〜4回

| 実装 | 場所 |
|---|---|
| `hpRatio` clamp | `CharacterFrame.vue:60` / `SkillCommandPanel.vue:62-65` / `InfoPanel.vue:122-124`（`hpPct`） |
| `{{ Math.max(0, Math.floor(hp)) }}/{{ Math.floor(maxHp) }}` インライン | `CharacterFrame.vue:181` / `InfoPanel.vue:140` / `InfoPanel.vue:184` / `SkillCommandPanel.vue:95` |

`InfoPanel` は `%`、他2つは `0..1` を返すという微妙な差があり、これも将来のバグ源。

**修正案:** `skillText.ts`（または `hpDisplay.ts`）に `hpRatio(hp, maxHp)`（0..1）と `formatHp(hp, maxHp)` を置き、
テンプレートの `Math.max/Math.floor` 直書きを消す。出力文字列は同一。

### 4-3.【med】`Lv{n}` / `{points}/{required}pt` / `MAX` の分岐が3箇所

`SkillPanel.vue:100-102, 119-121, 138` / `SkillListPanel.vue:81-84` / `BattleScreen.vue:172`。

**修正案:** `skillText.ts` に `formatLevelProgress(level, points, required?)` →
`{ level: string; progress: string }`（`required === undefined` → `'MAX'`）。

### 4-4.【med】種別ラベルの三項演算子がテンプレートに直書き

`SkillDraftPanel.vue:102` の `opt.kind === 'active' ? 'アクティブ' : opt.kind === 'passive' ? 'パッシブ' : '特性'`。
一方 `InfoPanel.vue:196,204,212` は同じ語を文字列リテラルで持ち、`SkillListPanel.vue:55-61` のグループ見出しも
`'所持: アクティブ'` などと重複。

**修正案:** `skillText.ts` に `SKILL_KIND_LABEL: Record<'active'|'passive'|'trait', string>` を追加
（`CATEGORY_LABEL` / `STAT_LABEL` / `ELEMENT_LABEL` と同じ場所）。

### 4-5.【med】`ELEMENT_COLOR` マップが2箇所に重複

`BattleScreen.vue:76-81` と `SkillCastBanner.vue:19-24` が**完全に同一の4エントリ**。
`skillText.ts` に `ELEMENT_COLOR: Record<Element, string>` として移し両方から import する。
`SkillCastBanner` の `accent`（`:26`）はそのまま。

---

## 5. prop drilling / 巨大 props / emits チェーン

### 5-1.【high】`battle` オブジェクト丸ごと prop

`BattleScreen.vue:57-59`: `defineProps<{ battle: ReturnType<typeof useBattleState> }>()`
（`useBattleState` の戻り値は **35個のメンバ**）。

- 型が `ReturnType<typeof …>` なので props の契約が読めない
- `readonly(state)` が prop 境界で reactive のまま流れ、どこからでも読める
- テストも `mountBattle(battle)` で丸ごと注入する形に固定されている（`BattleScreen.test.ts:37-41`）

**修正案（Phase 4 の後・単独コミット）:** `provide/inject` へ移行する。
`App.vue:35` で `provide(BATTLE_KEY, battle)`、各 composable が `inject(BATTLE_KEY)` する。
テストは provide 付きの親を1つ噛ませるだけで済む。
**⚠️ composable 化（§1）と同時に入れないこと。両方の diff が混ざって危険。**

### 5-2.【med】sibling をまたぐ emit の往復（3ホップ）

`SkillCommandPanel.vue:60` の `preview` emit → `BattleScreen.onSkillPreview`(`:255-257`) → `previewedSkill`(`:254`)
→ `affinityPreviewOf(e)`(`:260-268`) → `CharacterFrame :affinity-preview`(`:631`)。

`SkillCommandPanel`（コマンド領域）と `CharacterFrame`（戦場）は DOM 上は兄弟なので親を経由するのは構造的に正しい。
ただし `BattleScreen` を分割すると `BattleCommandArea` → `BattleScreen` → `BattleStage` の**3階層**になってしまう。

**修正案:** `previewedSkill` を `useBattleCommand()` の内部 ref にし、`affinityPreviewOf` も同 composable が公開する。
`BattleStage` は親が計算済みの `enemies: EnemyFrameView[]`（`affinityPreview` を含む）を1本の配列 prop で受ける。emit は増えない。

### 5-3.【med】`CharacterFrame` の props が18個

`CharacterFrame.vue:22-54`。うち7個（`nextSkillLabel` / `nextDamageLabel` / `nextMarkColor` / `affinityPreview` /
`statusEffects` / `targetable` / `idleSeed`）は敵専用で `side` prop で分岐する構造。
`BattleScreen.vue:612-636` の敵側バインドは**24行**。

**修正案:** props をグループ化した1つのビュー型（`CharacterFrameView` に `fx: {...}` / `enemy?: {...}` をネスト）にまとめる。
テンプレートは `props.enemy?.next.label` 等に置換するだけで DOM は不変。
`v-if="side === 'enemy' && alive"`（`:101`）は `v-if="enemy && alive"` になり条件も等価。

### 5-4.【low】`useGlossaryPanel` シングルトン経由の暗黙結合

`GlossaryTerm.vue:13` → `useGlossaryPanel()` → `HelpGuide.vue:20-23`。prop drilling は無いので構造としては良い。
ただし `BattleScreen.vue:300-301` が `jumpToHelpSignal` を watch して `infoOpen` を閉じる、という
**カウンタ ref をイベントバス代わりに使う回避策**が入っている（→ [03-composables.md](03-composables.md) §7-8）。

---

## 6. レイヤ違反（コンポーネントがゲームルールを計算している / Phase 3）

| Sev | 場所 | 内容 | 移設先 |
|---|---|---|---|
| **high** | `BattleScreen.vue:489-508` | 「重複アクティブを選ぶと+1pt入り、その1ptが次のレベル閾値を跨ぐか」を UI 側で再計算（`nextThreshold` / `willLevelUp` / `displayLevel`）。**`skillDraft.ts::addActivePoints` の挙動をコンポーネントが写経している**状態で、片方だけ直すと表示と実挙動がズレる | `skillDraft.ts` に `previewActivePointGain(opt)` → `{ displayLevel, willLevelUp, currentPoints, nextThreshold }` |
| **high** | `BattleScreen.vue:151-153` | `BUILTIN_SKILL_ID`（`guard`→`skill_stance_guard` 等）というドメインのID対応表がコンポーネント定数。`battleEngine` 側の builtin 解決と二重管理 | `domain/battle/types.ts` か `skillDraft.ts` へ |
| **high** | `BattleScreen.vue:163-164` | `minRoundNotMet = minRound !== undefined && battle.state.roundCount < minRound` — 「そのスキルが今使えるか」という**ルール判定**が UI に | `skillPanel.ts` あたりに `isSkillAvailable(def, owned, roundCount)` |
| med | `BattleScreen.vue:260-268` | `affinityPreviewOf` が `computeAffinityStage` / `effectivenessHint` を直接呼び、`stage > 0 ? 'weak' : stage < 0 ? 'resist' : null` の変換ルールを持つ | `damageCalc.ts` に `affinityPreviewOf(element, target, traits)` |
| med | `BattleScreen.vue:273-285` | `nextPreviewOf` が `estimateDamageToPlayer` → `damageMagnitude` → ラベル化まで実施 | `damagePreview.ts` に `enemyNextPreview(...)` |
| med | `BattleScreen.vue:353-356` | `visibilityOf`（`unseen`/`seen`/`owned` の判定）— コンテンツ開示ルール | `skillDraft.ts` または新規 `skillVisibility.ts` |
| med | `BattleScreen.vue:396-420` | `def.draftable === false` でフィルタする条件が `skillDraft.ts::buildCandidatePool` と重複（`:149-150` のコメントが自認している） | `skillDraft.ts` の同一ヘルパを export して呼ぶ |
| low | `BattleScreen.vue:98-111` | `enemyCountKey` の `Math.min(Math.max(count,1),5)` が `battle.json:enemyScaleByCount` のキー範囲に依存。JSON にキーが増えても 5 で頭打ち | `tunables.ts` 側で clamp、もしくは JSON のキー集合から導出（→ [06-data-config.md](06-data-config.md) §2-2） |
| low | `StatusPanel.vue:30-39` | `diff = effective - base` と `diffPositive` はドメイン寄り（軽微） | そのままで可 |

---

## 7. デッドコード（Phase 1）

| Sev | 場所 | 内容 |
|---|---|---|
| med | `SkillCommandPanel.vue:29, 86` | `SkillCommandEntry.description` を誰も設定していない（`BattleScreen.vue:165-199` は常に `effectTokens` を渡す）。`<span v-else>{{ focused.description }}</span>` は**到達不能** → prop とテンプレート分岐の両方を削除可能 |
| med | `PixelSprite.vue:24, 25, 87` | `flipX` prop を渡す呼び出し元がゼロ。削除して `transform` を `undefined` 固定にしても `undefined` は現状も出力されないので**描画は不変** |
| low | `CommandMenu.vue:6, 31, 102-105` | `CommandEntry.disabled` を設定する呼び出しがない。`:disabled` バインドと `.command-item:disabled` ルールは死んでいる。**削除は任意**（残すなら「未使用」とコメント） |
| low | `SkillListPanel.vue:8` | `SkillListItemView.kind` を読む箇所が無い（`BattleScreen.vue` が種別ごとに別配列へ振り分け済み）→ 型から削除可 |
| low | `InfoPanel.vue:42` | `InfoCharacterView.isBoss` を `BattleScreen.vue:321` が設定するが、テンプレートで一度も参照していない |
| low | `InfoPanel.vue:20-26` vs `StatusPanel.vue:4-10` | `InfoStatRow` と `StatRowView` が**構造的に完全同一**（型の二重定義） |
| low | `SkillPanel.vue:28-33` vs `StatusPanel.vue:4-10` | 両方が `StatRowView` という名前で**別物**を export しており、`BattleScreen.vue:33` が `PanelStatRowView` にリネームして回避している。**命名衝突** → `SkillPanel` 側を `StatAllocationRowView` に改名 |

### 7-1.【low】Phase 0 で判明した潜在的な不整合

- **`CharacterFrame.vue` の `.status-row` は side でゲートされていない。** `v-if` は `alive && statusEffects.length > 0` だけで、
  prop のコメントが「プレイヤーのバフは `BuffStrip` 側」と書いているのに、`statusEffects` を渡せばプレイヤー側にもチップが出る。
  現状 `BattleScreen` がプレイヤーフレームに `statusEffects` を渡していないため顕在化していない。
  **§5-3 の props 再構成で `enemy?` の中へ入れると挙動が変わる**ので、この潜在仕様を意識すること
  （`tests/unit/components/battle/CharacterFrame.test.ts` に現状を固定済み）。
- **折りたたみは純粋にCSSで行われている。** `collapsed` でも `.panel-body` はDOMに残る（`grid-template-rows: 0fr`）。
  §2-1 の共通殻で `v-if`/`v-show` に置き換えると**見た目は同じでもDOMが変わる**。
  `CategoryListPanel.test.ts` がこれを固定している。
- **`GlossaryTerm` は `<button>` として描画され `display: inline`。** そのため `CharacterFrame` の `.affinity-tag` は
  `affinity-tag` と `glossary-term` の両クラスを持つ。props 再構成でクラスの受け渡しが落ちやすい箇所。

**CSSデッドクラスの走査結果:** 実際に未使用のクラスは**検出されなかった**。
検出候補（`.battle-field` / `.enemy-line` / `.draft-overlay` / `.command-area` / `.pixel-sprite` / `popup-*` / `banner-*` / `tok-*`）は
すべてコメント内言及・`:deep()`・Transition 自動クラス・動的クラス生成（`SkillText.vue:14`）によるもので**生きている**。

---

## 8. v-if チェーン / z-index / アニメーション時間

### 8-1.【med】v-if チェーン

- `BattleScreen.vue:676-698` — `menu === 'root'/'battle'/'focus'` の3分岐。props が3者で全く違うため
  **現状の v-if のままが読みやすい**。`BattleCommandArea.vue` に閉じ込めるだけで十分。
- `BattleScreen.vue:700-739` — `status === 'drafting'||'swapping'` / `'skillPanel'` / `infoOpen` の独立した3オーバーレイ。
  互いに排他かどうかがコードから読めない（`.hud-left` の z-index:36 はドラフト 35 より前に出す前提。`:788-790` のコメント参照）
  → **`BattleOverlays.vue`** に集約し、「同時に開きうる組み合わせ」をコメントではなく型で表現する。
- `InfoPanel.vue:135/179/222` — `activeId` の prefix 文字列（`'enemy:'`/`'active:'`/`'passive:'`/`'trait:'`）で分岐。
  ID を判別可能ユニオンにすると安全だが、`InfoPanelShell` の `activeId: string` 契約と
  `BattleScreen.vue:338` を同時に直す必要がある。**med 優先。**
- `CharacterFrame.vue:101-136` — `side === 'enemy' && alive` の下に更に4段の v-if → §5-3 の props 再構成で緩和。

### 8-2.【med】z-index が10ファイルに散在（14種の値）

| 値 | 場所 |
|---|---|
| -1, 0, 1, 2 | `CharacterFrame.vue:245,225,339/367/382,268` / `BattleBackdrop.vue:224` |
| 2 | `BattleScreen.vue:812`（`.battle-field`） / `CommandMenu.vue:69` |
| 5 | `BattleScreen.vue:747`（`.battle-screen`） |
| 16 | `BattleScreen.vue:870`（`.command-area`） |
| 18 | `TurnBadge.vue:23` |
| 20 | `SkillCastBanner.vue:58` |
| 22 | `CharacterFrame.vue:436`（`.popup-layer`。**「20より前」というコメント付きの依存**） |
| 25 | `BattleScreen.vue:818`（`.critical-screen-flash`） |
| 35 | `SkillDraftPanel.vue:150` / `SkillPanel.vue:159` |
| 36 | `BattleScreen.vue:790`（`.hud-left`。**「35より前」というコメント付きの依存**） |
| 50 | `InfoPanelShell.vue:111` / `HelpGuide.vue:139` |
| 300 | `HelpGuide.vue:186`（用語ポップアップ。Teleport to body） |

**「20より前だから22」「35より前だから36」という相対関係がコメントでしか表現されていない**のが問題。

**修正案（Phase 2 / 算出値不変）:** `src/styles/battle-layers.css` に `:root` 変数
（`--z-battle-screen: 5` / `--z-battle-field: 2` / `--z-command-area: 16` / `--z-turn-badge: 18` /
`--z-cast-banner: 20` / `--z-damage-popup: 22` / `--z-critical-flash: 25` / `--z-overlay: 35` /
`--z-hud-left: 36` / `--z-info-shell: 50` / `--z-term-popup: 300`）を定義し、各所を `var(--z-…)` に置換。
値は同一なので描画不変。長いコメントは変数名が自明にするので短縮できる。

### 8-3.【high】CSS のアニメーション時間が config と二重管理・すでにズレている

`battle.json:presentation` は `announceMs:620 / impactMs:760 / popupMs:900 / flashMs:220 / attackPoseMs:520 / battleEndMs:700`。
CSS 側は独立にリテラルを持つ:

| CSS | 対応する config | 状態 |
|---|---|---|
| `CharacterFrame.vue:309` `hit-shake 220ms` | `flashMs: 220` | 一致 |
| `CharacterFrame.vue:320` `impact-flicker 220ms` | `flashMs: 220` | 一致 |
| `CharacterFrame.vue:293,296` `lunge-down/up 420ms` | `attackPoseMs: 520` | **不一致**（CSSが100ms早く終わる） |
| `BattleScreen.vue:833` `field-shake 280ms` | `flashMs: 220`（`useBattlePresentation.ts:136` で解除） | **不一致** |
| `BattleScreen.vue:826` `critical-flash-fade 380ms` | `flashMs+80 = 300`（`useBattlePresentation.ts:48`） | **不一致** |
| `CharacterFrame.vue:634-639` `popup-* 120/300ms` | `popupMs: 900` | 独立 |

**修正案（Phase 6）:** `--fx-flash-dur` 等の CSS カスタムプロパティにし `useBattleTheme()` が `BATTLE.presentation` から
`:style` で流し込む。
> **⚠️ 現状の不一致を「直す」と見た目が変わる。リファクタでは現在の値をそのまま新しい変数の初期値にすること
> （`--fx-lunge-dur: 420ms` のまま）。不一致の是正は別タスク → [07-deferred.md](07-deferred.md)。**

### 8-4.【med】JS 定数と CSS 時間の二重管理

`SkillDraftPanel.vue:53 REROLL_PULSE_MS = 460` と `:203 animation: reroll-spin 460ms` が別々に 460 を持つ。
`:240 card-shuffle 420ms` は 460ms のクラス付与期間内に収まる前提。

**修正案:** `:style="{ '--reroll-dur': REROLL_PULSE_MS + 'ms' }"` でルートに流し、CSS は `var(--reroll-dur)` を使う。値が同一なので描画不変。

### 8-5.【low】その他のマジック数値（Phase 6）

- `BattleScreen.vue:75 FLOOR_TOP = 0.485` — 20行のコメント付き。`BattleBackdrop` にも prop で渡っている → `battle.json:layout.floorTopRatio`
- `BattleScreen.vue:92 viewportHeight * 0.34` / `:110 (isBoss ? 0.36 : 0.27)` — スプライト高比率 → `battle.json:layout.*`
- `BattleScreen.vue:158, 516` `slot < 4` / `i < 4` — **アクティブ枠数が2箇所**（domain 側と合わせて計3箇所）→ `battle.json:activeSlotCount`
- `BattleScreen.vue:879` `.command-area.wide { right: 165px }` — `275 + 210 - 320` の暗算結果をコメントで説明
  → `calc(var(--command-right) + var(--command-w) - var(--skill-command-w))` にすれば式が生きる
- `CharacterFrame.vue:80 BURST_DOT_COUNT = 24` / `:155 i % 3 === 0` — VFX パラメータ → `vfx.json` 相当へ
- `HelpGuide.vue:17-18 POPUP_MARGIN = 12 / POPUP_GAP = 10` — ファイル先頭定数なので CLAUDE.md 準拠。**可**

---

## 9. テストカバレッジ

`BattleScreen.test.ts`（597行）は `BattleScreen` を**実DOMにマウント**して子コンポーネントも実物を描画するため、
間接的なカバレッジは広い。ただし**アサーションが触れている**のは以下だけ。

### 9-1. 検知できる（アサーションあり）

`BattleScreen`（`.hud-left` / `.command-area` 経由の全体構造）/ `BattleBackdrop`（**存在のみ** `:133`）/
`TurnBadge`（`:137,163`）/ `CharacterFrame`（`.char-unit`×16 / `.hp-track` / `.hp-num` / `.damage-popup` / フラッシュ時の tint。`:141-160, 265-302`）/
`PixelSprite`（存在のみ `:144`）/ `CommandMenu`（`:115, 174-180`）/
`SkillCommandPanel`（`:100-104, 181-251`。2回クリック確定・クールタイム無効化）/
`StatusPanel`（`:306, 313-327`）/ `SkillListPanel`（`:307, 329-360`）/ `SkillDraftPanel`（`:421-497`）/
`SkillPanel`（`:499-551`）/ `InfoPanel` + `InfoPanelShell`（`:363-419`）/ `SkillCastBanner`（**存在のみ** `:258`）。

### 9-2. カバレッジ **ゼロ**（リファクタ高リスク → Phase 0 で埋める）

| コンポーネント | 未検証の内容 | リスク |
|---|---|---|
| **`CategoryListPanel.vue`（177行）** | 参照が1件もない。折りたたみ・`row-frac` の内訳開閉・`maxed` 状態・`GlossaryTerm` 連携すべて | **high**（§2-1 の殻共通化の直接の対象） |
| **`HelpGuide.vue`（239行）** | 参照ゼロ。`Teleport to body` するため `host` 内 querySelector では拾えない。実測位置決め（`:59-78`）も未検証 | **high** |
| `CharacterFrame` の一部 | `.affinity-chip` / `.affinity-tag`（`:101-127`）、`.status-row`/`.status-chip`（`:185-192`）、`.hit-burst`/`.crit-ring`（`:143-158`）、`.shield-fill`（`:179`） | **high**（§5-3 の props 再構成の直撃部位） |
| `BuffStrip.vue`（85行） | 参照ゼロ。`permanent` / `isBuff` 3値分岐 | med |
| `GlossaryTerm.vue`（44行） | 参照ゼロ。クリック→`getBoundingClientRect`→ポップアップの経路 | med |
| `SkillText.vue`（46行） | 直接参照ゼロ。`skillText.test.ts` はトークン**生成**のみ検証し、トークン→`tok-*` クラスの写像は未検証 | med |
| `SkillCommandPanel` の一部 | `.skill-hp`（`:90-96`、HPバー） | med |
| `InfoPanel` の一部 | `.effect-chip`（`:150-160`）、enemy ペインのスキル一覧（`:194-219`） | med |
| フォーカスモード | `.focus-hint` は `BattleScreen.test.ts:58` のヘルパで「あればスキップ」されるだけでアサーションなし | med |
| `CommandMenu` の一部 | `:disabled` 分岐（デッドコード）/ `hover` emit | low |
| `BattleBackdrop` の描画 | canvas 描画関数（`:47-198`）。`drawProp` の6種分岐 | low（happy-dom で 2D context 無しのため元々走らない） |

### 9-3. Phase 0 で足すテスト

1. `CategoryListPanel.test.ts` — 単体マウント。折りたたみ・内訳開閉・`maxed`。
2. `CollapsiblePanel.test.ts` — §2-1 の共通殻を作った直後に、3パネルそれぞれで `outerHTML` のスナップショットを取り
   **before/after 比較する（DOM同一性の保証）**。
3. `CharacterFrame.test.ts` — 敵モードで affinity / statusEffects / shield を与えた際の DOM。§5-3 の安全網。
4. `HelpGuide.test.ts` — `document.body` 側を検索するヘルパでポップアップの表示・`ready` クラス・「詳細」ボタン。
5. **CSS の同一性検証スクリプト** — `npm run build` の出力 CSS を before/after で「セレクタと宣言の集合」として比較する。
   スコープハッシュ（`data-v-xxxx`）を除去したうえで宣言ブロックの multiset が一致することを確認する。
   `tmp/`（gitignore 済み）に置く。**§2/§3 の作業では必須。**

---

## 10. 推奨実施順序

| # | 作業 | 依存 | 見込み削減 |
|---|---|---|---|
| 1 | §9-3 の防御テスト追加（CategoryListPanel / CharacterFrame / HelpGuide / CSS差分スクリプト） | — | +250行（テスト） |
| 2 | §7 デッドコード削除 | 1 | -30行 |
| 3 | §4 フォーマット関数を `skillText.ts` へ集約 | 1 | -60行 |
| 4 | §2-1 `CollapsiblePanel.vue` 導入 | 1,3 | **-90行** |
| 5 | §3-1〜3-2 色のカスタムプロパティ化 | 4 | 重複解消 |
| 6 | §8-2 z-index の変数化 | 5 | 重複解消 |
| 7 | §1-3 composable 抽出（`useSkillListModel` → `useDraftModel` → `useBattleCommand` の順） | 3 | **BattleScreen -420行** |
| 8 | §1-2 子コンポーネント切り出し | 7 | **BattleScreen -170行** |
| 9 | §6 レイヤ違反の domain 移設 | 7 | — |
| 10 | §2-2 `useFocusedItem` / §2-3 `InfoCharacterPane` / §3-4 バッジ共通化 | 8 | -80行 |
| 11 | §5-1 `provide/inject` 化（**単独コミット**） | 8 | — |
| 12 | §8-3/8-4 アニメーション時間の変数化（**値は現状維持**） | 6 | — |

最終的に `BattleScreen.vue` は 930行 → **約150行**、`src/components/battle/` 全体で概ね **-350行**、
新規 composable 群 +400行（責務分離ぶん）。
