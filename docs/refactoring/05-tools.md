# 05. 開発ツール層（content-editor / 検証スクリプト）

親: [README.md](README.md)
対象: `src/tools/contentEditor.ts`(1396) / `src/tools/contentEditorForm.ts`(367) /
`scripts/contentEditorPlugin.mjs`(325) / `tools/content-editor.html`(157) /
`schemas/battle-*.schema.json`(6本) / `scripts/validate-json.mjs`(902、うち battle 部 460-806)

> **重要な制約:** `src/tools/` は開発専用で、本番コードからの import は
> `eslint.config.js:80-85` の `no-restricted-imports`（`group: ['**/tools/*']`）で禁止済み。
> したがって共有化は **必ず本番側（`src/domain/`）に置き、tools が下向きに import する** 方向にしかできない。

---

## 0. 数字

| 指標 | 値 |
|---|---:|
| `contentEditor.ts` 行数 | 1396（`sideScroller.ts` に次ぐ最大。CLAUDE.md の目安300行の4.7倍） |
| モジュールレベルの可変グローバル | 9個（`:227-235`） |
| `document.createElement` 直呼び | 44回（内訳: input 17 / option 13 / select 8 / datalist 2 / textarea 1 / SVG系 2） |
| `addEventListener` | 46回 |
| `innerHTML = ''` による全消し再描画 | 21回 |
| `h(...)` ヘルパ呼び出し | 95回 |
| `currentCategory === '...'` によるカテゴリ分岐 | 8箇所（554, 565, 611-616） |
| 「リスト編集」の再実装 | **5回**（799, 824, 870, 916, 964） |
| 「任意項目トグル」の再実装 | **3回**（580, 1166, 1202） |
| effect op を1つ増やすときの編集箇所 | **10箇所 / 6ファイル + 新規1**（うち機械チェックがあるのは3箇所のみ） |
| `contentEditor.ts` のテストカバレッジ | **0行** |

---

## 1. `contentEditor.ts` の分割

### 1-1. 責務マップ

| # | 責務 | 行範囲 | 行数 |
|---|---|---|---:|
| A | 設定テーブル（TABS / CATEGORY_SCHEMA / CATEGORY_ID_HINT） | 39-86 | 48 |
| B | API型（EntrySummary / RefOption / RefsResponse） | 88-103 | 16 |
| C | 参照補完テーブル（REF_CHECKBOX_FIELDS / REF_DATALIST_FIELDS） | 105-117 | 13 |
| D | i18n ラベル表（ENUM_LABEL_FIELDS / APPLY_TO / AFFINITY / TIMING / EFFECT_SELECT_LABELS） | 119-135 | 17 |
| E | グループ化（GROUP_OPTIONS / GROUP_ORDER / localStorage / groupKeyOf / groupLabelOf） | 137-207 | 71 |
| F | DOM ヘルパ（el / h / optionLabel） | 209-224 | 16 |
| G | **可変グローバル状態** | 226-239 | 14 |
| H | HTTP（apiJson / loadAll） | 241-256 | 16 |
| I | サイドバー描画 | 258-359 | 102 |
| J | プレビュー描画（sprite SVG / effect swatch） | 361-398 | 38 |
| K | エントリのCRUD操作 | 400-481 | 82 |
| L | スキーマ駆動フォーム本体 | 483-867 | 385 |
| M | 特殊フィールド（sprite / skillRefList / actionPattern / visual） | 738-955 | 128 |
| N | effect[] 型付きフォーム | 957-1230 | 274 |
| O | 出現グループ専用エディタ（`encounter_groups.json`） | 1232-1376 | 145 |
| P | 起動（main） | 1378-1389 | 12 |

> **Phase 0 で判明した追加事実:** `contentEditor.ts` は **export を1つも持たず、末尾（`:1396`）で `void main()` を実行する**
> 純粋なトップレベルスクリプトである。つまり素の `import` では何も取り出せず、import しただけで fetch と DOM 構築が走る。
> Phase 0 の characterization test（`tests/unit/tools/contentEditor.test.ts`）は、
> **元ソースを読んで `void main()` を無効化し export を追加した派生モジュールを `tmp/`（gitignore 済み）へ生成する**
> というハーネス経由でしか書けなかった。
> **§1-2 の分割では `state.ts` の導入と実 export を最初のステップに置くこと。** それが済めばハーネスは捨てられ、
> テストのアサーションはそのまま新モジュールへの直接 import に載せ替えられる。

**【high】A〜P が単一モジュールスコープの可変グローバル（G）で結合しているため、どの関数も単体では呼べない。**
`renderField`(`:606`) は引数に `currentCategory` を取らず、グローバル(`:230`)を読む(`:554/565/603/611-616`)。結果:

- L/M/N はテスト不能（`contentEditorForm.test.ts` が純粋関数しか触れていない理由がこれ）。
- 「敵タブの特別扱い」を足すたびに `renderField` の先頭 if 列(`:611-616`)が伸びる。
- O（出現グループ）は L〜N と全く別系統の実装なのに同居している（145行）。

### 1-2. 分割案（Phase 4）

新設 `src/tools/contentEditor/`。`tools/content-editor.html:155` の
`src="/src/tools/contentEditor.ts"` を `/src/tools/contentEditor/index.ts` へ書き換える（HTML の DOM 構造・CSS は無改変）。

| 新ファイル | 移す元 | 主な公開API |
|---|---|---|
| `contentEditor/api.ts` | H + B | `ContentEditorApi` インターフェースと `createApi(base)`。`SaveResult = { ok: true } \| { ok: false; errors: string[] }` |
| `contentEditor/catalog.ts` | A + E（+ `blankEntrySkeleton` / `isValidIdShape`） | `TABS` / `CATEGORY_SCHEMA` / `CATEGORY_ID_HINT` / `GROUP_OPTIONS` / `GROUP_ORDER` / `groupKeyOf` / `groupLabelOf` / `orderGroupKeys`（`:312-338` の並び替えを純粋関数化）/ `loadGroupByPrefs` / `saveGroupByPrefs` |
| `contentEditor/dom.ts` | F + §2 のヘルパ | `el` / `h` / `input` / `select` / `checkbox` / `button` / `datalist` / `optionLabel` / `optionalSection` |
| `contentEditor/labels.ts` | D のうちツール専用分（`:127-135`）+ C | `TIMING_LABEL` / `EFFECT_SELECT_LABELS` / `ENUM_LABEL_FIELDS` / `REF_*_FIELDS`。**`APPLY_TO_LABEL`/`AFFINITY_LABEL` はここではなく §3-1 のとおり domain へ** |
| `contentEditor/state.ts` | G | `EditorState` と `createState()`（グローバル束縛を消し views に引数で渡す） |
| `contentEditor/views/sidebar.ts` | I | `renderTabs` / `renderGroupBySelect` / `renderList` |
| `contentEditor/views/preview.ts` | J | `renderSpritePreview` / `renderEffectSwatch` |
| `contentEditor/views/schemaForm.ts` | L の汎用部（483-736, 780-867） | `renderObjectFields` / `renderField` / `renderOptionalObjectField` / `renderCheckboxGroup` / `renderJsonSubEditor` |
| `contentEditor/views/listEditors.ts` | M のリスト系（799-955） | `renderListEditor<T>(spec)` 1本 + 4つの薄いラッパ（§2-2） |
| `contentEditor/views/effectForm.ts` | N | `renderEffectNodeList` / `renderEffectField` / `statSelect` / `elementSelect` |
| `contentEditor/views/encounterGroups.ts` | O | `renderEncounterGroupsEditor` |
| `contentEditor/fieldOverrides.ts` | 554 / 565 / 611-616 の分岐 | `FIELD_OVERRIDES: Record<string, FieldRenderer>`（キーは現在の `refFieldKey()` と同じ `"<category>.<path>"`）と `overrideFor(category, path)`。7エントリ。**`:554` の `!(currentCategory === 'battleEffects' && path === 'visual')` は `!overrideFor(...)` に置換でき、554 と 616 の条件の二重定義が消える** |
| `contentEditor/index.ts` | P + 配線 | `main()` のみ（約50行） |

`contentEditorForm.ts` も併せて分割する。**テストの import パスを維持するため `contentEditorForm.ts` は re-export バレルとして残す**
（`tests/unit/tools/contentEditorForm.test.ts` が無改変で通る）。

- `contentEditor/schemaUtils.ts` ← `JsonSchema` / `resolveRef` / `widgetKindOf` / `getAtPath` / `setAtPath` / `deleteAtPath`（8-98行）
- `contentEditor/effectOpForms.ts` ← `EFFECT_OP_SKELETONS` / `ALLOWED_EFFECT_OPS` / `EFFECT_OP_LABEL` / `EffectFieldSpec` / `EFFECT_OP_FIELDS` / `toPercentInputValue` / `fromPercentInputValue`（107-297行）
- `contentEditor/spritePreviewData.ts` ← `SpriteDefLike` / `SpriteRun` / `BATTLE_CSS_VAR_FALLBACK` / `resolvePreviewColor` / `buildSpriteRuns`（299-367行）

**結果の見込み:** 最大ファイルは `views/schemaForm.ts` の約250行、`views/effectForm.ts` の約230行。
**すべて CLAUDE.md の300行目安内に収まる。**

---

## 2. 手書き DOM 構築の定型句（Phase 5）

### 2-1.【med】`document.createElement` の反復

`h()`(`:215`) はあるが `className`/`textContent` しか面倒を見ないため、`input`/`select`/`option` は毎回3〜6行の定型を手書きしている。
「select を組み立てて value をセットして change を張る」という同型のブロックが
`:654-659, 880-889, 925-934, 974-980, 1026-1032, 1038-1045` の **6箇所**にある。

**修正案:** `contentEditor/dom.ts` に4つ足す。

    export function input(type: string, init?: Partial<HTMLInputElement>): HTMLInputElement
    export function select(opts: readonly { value: string; text: string }[], value: string,
                           onChange: (v: string) => void): HTMLSelectElement
    export function checkbox(checked: boolean, onChange: (v: boolean) => void): HTMLInputElement
    export function datalist(id: string, values: readonly string[]): HTMLDataListElement

`select()` の導入だけで **21回の createElement が6回の呼び出しに畳める**。
`datalist` の重複（`:695-706` と `:744-753`）も1本化できる。

### 2-2.【high】「リスト編集」の5重実装

`renderStringListEditor`(799) / `renderObjectArrayEditor`(824) / `renderSkillRefList`(870) /
`renderActionPattern`(916) / `renderEffectNodeList`(964) がすべて同一骨格
（`list` のコピー → `commit` → `redraw()` で innerHTML 全消し → 行UI + 削除ボタン → 追加ボタン）。

`'＋ 追加'` リテラルが4回（816, 842, 907, 949）、`'（未選択）'` の空オプションが2回（882, 927）、
`renderActionPattern`(925-935) は `renderSkillRefList`(880-890) の select 構築をほぼ丸写し（差は `↑↓` ボタンの有無だけ）。

**修正案:** `views/listEditors.ts` に `renderListEditor<T>(rootValue, path, container, spec)` を1本だけ置く。

    interface ListEditorSpec<T> {
      cls: string          // 'string-list' | 'object-array' | 'skill-ref-list'
      blank: () => T
      renderRow: (item: T, i: number, row: HTMLElement, redraw: () => void) => void
      reorderable?: boolean   // actionPattern のみ true（↑↓）
      rowCls?: string
      addLabel?: string       // 既定 '＋ 追加'（effect のみ '＋ ノード追加'）
    }

既存5関数はこれを呼ぶ10〜25行のラッパになる（157行 → 約90行）。
**CSS クラス名を `spec.cls`/`spec.rowCls` でそのまま渡すので、`tools/content-editor.html:96-105` のスタイルには一切触れずに済む＝見た目不変。**

### 2-3.【med】「任意項目トグル」の3重実装

`renderOptionalObjectField`(572-600) / `case 'scale'` の optional 分岐(1160-1187) / `case 'nodes'` の optional 分岐(1196-1225) が、
`'この項目を設定する'` チェックボックス + `box.style.display` 切り替え + `box.innerHTML=''` 再描画という同一パターン（580 / 1166 / 1202）。

**修正案:** `dom.ts` に `optionalSection(checked, container, onEnable, onDisable, boxCls)` を置き3箇所を各5行に落とす。
`boxCls` を `'scale-field'`(1173)/`'nested-object'` で切り替えれば見た目不変。

---

## 3. i18n / ラベル表の重複（Phase 2）

**良い点:** `CATEGORY_LABEL` / `ELEMENT_LABEL` / `STAT_LABEL` / `MODIFIER_SCOPE_LABEL` は
`src/domain/battle/skillText.ts:13,40,46,198` にあり、`contentEditor.ts:31` が **下向きに** import している。
方向は正しく、重複していない（`BattleScreen.vue:41` も同じものを import）。

### 3-1.【med】`applyTo` / `affinity` のラベルが2箇所に散っている

| 内容 | 場所A（本番・インライン三項） | 場所B（ツール・マップ） |
|---|---|---|
| `self`→自分 / `target`→対象 | `skillText.ts:111` | `contentEditor.ts:127 APPLY_TO_LABEL` |
| `weak`→弱点 / `resist`→耐性 | `skillText.ts:144` | `contentEditor.ts:128 AFFINITY_LABEL` |

用語を変えたい（例:「耐性」→「軽減」）とき、片方を直してもエディタとゲーム本編で表記が食い違う。
しかも A は三項演算子なので grep で見つけにくい。

**修正案（共有先は必ず本番側）:** `skillText.ts` に既存の `MODIFIER_SCOPE_LABEL` と並べて
`APPLY_TO_LABEL` / `AFFINITY_LABEL` を追加し、`skillText.ts:111` / `:144` をそこ参照に置換（出力文字列は同一）。
`contentEditor.ts:127-128` は削除し、`:134` の `EFFECT_SELECT_LABELS` が import したものを参照する。

### 3-2. ツール専用のまま残してよいもの

- `TIMING_LABEL`(`contentEditor.ts:129-132`) — 本番に対応する日本語表示がない（`types.ts:222` の `EffectTiming` は英語のみ）。
  **共有化不要。** ただし `contentEditor/labels.ts` へ移動。
- `EFFECT_OP_LABEL`(`contentEditorForm.ts:128-144`) — 本番の効果文は `skillText.ts:70-187` が文章として組み立てるので、
  op名の短ラベルはツールにしか要らない。**共有化不要。** ただし §4-1 の同期問題は残る。

### 3-3.【med】`element` 一覧のハードコードが4箇所

`types.ts:67`（型）/ `schemas/battle-skill.schema.json:30`（enum）/
`contentEditor.ts:167`（`GROUP_ORDER.element`）/ `contentEditor.ts:1039`（`elementSelect` の values）。

**修正案:** `types.ts` に `STAT_KEYS`(`:29`) / `CATEGORY_IDS`(`:77`) と同じ形で
`export const ELEMENTS: readonly Element[] = ['physical','magical','special','none']` を足し、
`:167` を `[...ELEMENTS]`、`:1039` を `includeAny ? [...ELEMENTS,'any'] : [...ELEMENTS]` にする（順序が同一なので描画順は不変）。

---

## 4. スキーマ知識の重複 — 拡張性の実測

### 4-1. 「effect op を1つ追加する」→ 必須10 + 条件付き3

| # | ファイル:行 | 内容 | 機械チェック |
|---|---|---|---|
| 1 | `src/domain/battle/effectOps/<newOp>.ts` | 新規ファイル | — |
| 2 | `effectOps/index.ts:14-28` | `import` 1行 | ○ `effectOps.test.ts:26` |
| 3 | `effectOps/index.ts:30-44` | `registerOp()` 1行 | ○ 同上 |
| 4 | `effectOps/registry.ts:60-64` | `KNOWN_OP_IDS` | ○ `effectOps.test.ts:22,26` |
| 5 | `skillText.ts:71-186` | `nodeToTokens()` の switch（無いと `:185` で op名が生表示） | **×** |
| 6 | `schemas/battle-skill.schema.json:9-11` | `allowedOps`（`validate-json.mjs:467` が読む） | ○ `battleContent.test.ts:182` |
| 7 | `schemas/battle-skill.schema.json:85-87` | `definitions.effectNode.properties.op.enum`（Ajv が実際に見る） | ○ `:183` |
| 8 | `schemas/battle-trait.schema.json:37-39` | **同じ enum の3つ目の写し** | ○ `:184` |
| 9 | `contentEditorForm.ts:107-123` | `EFFECT_OP_SKELETONS` | **×（下記の罠）** |
| 10 | `contentEditorForm.ts:128-144` | `EFFECT_OP_LABEL` | **×（下記の罠）** |
| 11 | `contentEditorForm.ts:220-281` | `EFFECT_OP_FIELDS` | **×（下記の罠）** |
| 12 | `validate-json.mjs:481-505` | `walkEffectNodes()`。op固有の構造検証が要るときのみ | — |
| 13 | `contentEditor.ts:133-135` | `EFFECT_SELECT_LABELS`。新 op に新しい select フィールドが要るときのみ | — |

### 4-1-a.【high】最大の罠 — テストが全部グリーンのまま新 op がエディタから消える

`contentEditorForm.test.ts:102-118, 122-126` は「`ALLOWED_EFFECT_OPS` の全 op にひな形/ラベル/フィールド定義がある」を検査するが、
**`ALLOWED_EFFECT_OPS` は `contentEditorForm.ts:125` で `Object.keys(EFFECT_OP_SKELETONS)` として自分自身から導出されている。**
つまり #9 を書き忘れれば `ALLOWED_EFFECT_OPS` にも載らず、テストは全部グリーンのまま
**「エディタの op ドロップダウンに新 op が出ない」という無言の欠落**になる。
`battleContent.test.ts:179-185` が schema 3箇所と `KNOWN_OP_IDS` を突き合わせているのに、**ツール側だけがこの網から外れている。**

**修正（Phase 0 で最初にやる。3行）:**

    import { KNOWN_OP_IDS } from '../../../src/domain/battle/effectOps'
    it('ALLOWED_EFFECT_OPS が実装側の KNOWN_OP_IDS と一致する', () => {
      expect([...ALLOWED_EFFECT_OPS].sort()).toEqual([...KNOWN_OP_IDS].sort())
    })

（テストは `src/tools` を import してよい。禁止されているのは**本番コードからの** import のみ。）

### 4-1-b.【med】スキーマ enum の3重コピー（Phase 8）

#6/#7/#8 が同一内容。`battle-trait.schema.json` の `properties.effect`(`:28-43`) を
`battle-skill.schema.json` の `#/definitions/effectNode` と同期させ続ける必要があるのは、
Ajv が `$ref` をファイル跨ぎで引けていないため。

`ajv.addSchema()` で `battle-skill.schema.json` を先に登録して
`"$ref": "battle-skill.schema.json#/definitions/effectNode"` にすれば、
`validate-json.mjs:471-477` と `contentEditorPlugin.mjs:59-65` の両方で写しが1箇所に減る（**#8 が消えて9箇所**）。
さらに `allowedOps`(#6) は `validate-json.mjs:467` を
`_battleSkillSchema.definitions.effectNode.properties.op.enum` に変えるだけで #7 から導出でき、**8箇所**まで縮む。

### 4-2. 「skill フィールドを1つ追加する」→ 必須3 + 条件付き5

| # | ファイル:行 | 内容 | 必須? |
|---|---|---|---|
| 1 | `schemas/battle-skill.schema.json:12-77` `properties` | `additionalProperties: false`(`:8`) なので、追記しないと**全ファイルが検証エラー** | 必須 |
| 2 | `:7` `required` | 必須項目にする場合 | 条件 |
| 3 | `types.ts:121-160`（`SkillDefBase`/`ActiveSkillDef`/`PassiveSkillDef`） | TS型 | 必須 |
| 4 | `battleContent.ts:18,27-39` | `SkillJson` は `Partial<ActiveSkillDef>` なので通常は自動追随。normalize が要るときのみ | 条件 |
| 5 | `contentEditorForm.ts:147-165 blankEntrySkeleton('skills')` | required にした場合、新規作成が即エラーになるので必須 | 条件 |
| 6 | `validate-json.mjs:508-560 validateBattleSkills()` | 他ファイルへの参照 or active/passive 限定なら | 条件 |
| 7 | `contentEditorPlugin.mjs:138-160 extraChecks()` | 保存時にも同じ規則を効かせたいなら | 条件 |
| 8 | `contentEditor.ts:106-135` の各テーブル | 参照補完や日本語ラベルを付ける場合 | 条件 |

**【med】実際に起きているドリフト:** `contentEditorPlugin.mjs:146` の passive 禁止リストは
`['element','cooldown','defaultFocus','focusRange','sfx']`、`validate-json.mjs:537` の同リストは `sfx` を含まず、
代わりに `:548-551` で別メッセージ（`'sfx は kind="active" のスキルにのみ指定できます'`）を出す。
**結果は同じだがエラー文言が2種類**あり、片方だけ更新されるとユーザーが混乱する。→ §5 の共有化で構造的に消える。

### 4-3. その他の shape 重複

- `enemies.stats` の必須10キーが `schemas/battle-enemy.schema.json:21`（required）/ `contentEditorForm.ts:171`（skeleton）/
  `types.ts` の `BattleStats` に重複。ただし **skeleton の初期値 `hp:1000, str:100…` は「意味のある既定値」であって
  schema からは導けない。ここは現状維持が正しい**（schema 導出化は挙動が変わるので不可）。
- `EFFECT_OP_FIELDS`（`contentEditorForm.ts:220-281`）と `nodeToTokens()`（`skillText.ts:70-187`）は
  「どの op がどのキーを読むか」という同じ知識の2表現。`contentEditorForm.ts:203` のコメントも対応関係を自認している。
  **統合は非推奨**（片方は編集UI仕様、片方は文章生成で要求が違う）。§4-1-a の同期テストで「op の抜け」だけ守るのが費用対効果が高い。

---

## 5. `validate-json.mjs` と `contentEditorPlugin.mjs` の重複（Phase 8）

### 5-1.【high】重複の実体（9項目）

| 内容 | `validate-json.mjs` | `contentEditorPlugin.mjs` |
|---|---|---|
| Ajv インスタンス生成 `{strict:false, allErrors:true}` | `:180`, `:471`（**同一プロセス内に2つ**） | `:59` |
| battle-* schema の読み込み+compile | `:463-477`（6本を個別に） | `:60-65`（`CATEGORIES` から一括） |
| Ajv エラー→文字列整形 | `:551, :576, :604, :664, :715, :774`（**6回コピペ**） | `:172`（1回） |
| skills の active 必須4項目チェック | `:531-534` | `:142-144` |
| skills の passive 禁止項目チェック | `:537-540`(+`:548-551`) | `:146-148` |
| enemies の actionPattern ⊂ activeSkills | `:626-628` | `:151-158` |
| id とファイル名/パターンの一致 | `:529`（basename一致） | `:166-168`（idPattern 正規表現） |
| encounter_groups の groups/setId 参照検査 | `:680-699` | `:79-105` |
| カテゴリ→ディレクトリの対応表 | 各関数にベタ書き（`:517,570,596,652,708,765`） | `CATEGORIES`（`:26-57`）に集約 |

### 5-2. 共有できる — ただし片方向で

両者とも純 Node ESM（Vite の TS 解決に依存しない）なので、
**新規 `scripts/lib/battleContentRules.mjs`（約120行）** を作り双方から import できる。

    export const BATTLE_CATEGORIES         // 現 contentEditorPlugin.mjs:26-57 をそのまま移設
    export function createBattleValidators(root)   // ajv 1個 + 6本 compile
    export function formatAjvErrors(validateFn)    // エラー整形を1箇所に
    export function checkSkillKindFields(data)     // active必須4 / passive禁止5 → string[]
    export function checkEnemyActionPattern(data)  // actionPattern ⊂ activeSkills → string[]
    export function checkEncounterGroupsShape(data, setIds)
    export const ALLOWED_OPS               // schema から導出（§4-1-b）
    export function walkEffectNodes(nodes, problems, path)

> **線を動かさないこと:** 参照整合性（ファイル跨ぎ）検査は `validate-json.mjs` に残す。
> プラグイン側は「1ファイル単位のみ」という設計上の線引き（`contentEditorPlugin.mjs:14-15` のコメント）であり、
> ここを共有すると保存が重くなり挙動が変わる。

副産物として §4-2 のドリフト（`sfx` の扱い）が構造的に消える。

### 5-3.【low】`PROBLEM_SEPARATOR` が使われていない

`validate-json.mjs:478` に定数が定義されているのに、`problems.join('\n       ')` の
**リテラル直書きが11箇所**（89, 116, 165, 308, 365, 397, 456, 555, 581, 636, 722）残っており、
定数を使っているのは5箇所（673, 697, 745, 755, 781）だけ。
文字列は同一なので出力は変わらない。**Phase 1 で11箇所を統一する。**

---

## 6. デッドコード（Phase 1）

| Sev | 場所 | 内容 |
|---|---|---|
| med | `contentEditorPlugin.mjs:310-316` | `POST /__content-editor/api/validate` エンドポイント。`src/tools/` 側に呼び出しが**1つも無い**（grep 済み）。保存前プレビュー検証の名残 → 削除（GUI 挙動は不変） |
| low | `contentEditorForm.ts:38` | `WidgetKind` の `'textarea'` は `widgetKindOf`(42-63) が**一度も返さず**、`renderField` の switch(627-735) にも case が無い → union から削除 |
| low | `contentEditorForm.ts:15,20,21,24` | `JsonSchema` の `additionalProperties` / `minItems` / `maxItems` / `description` はどこからも読まれていない → 削除 or 「将来用」コメント |
| low | `contentEditorForm.ts:186-188` | `blankEntrySkeleton` の `default: return { id }` は到達不能（引数は6値すべて case 網羅済み）→ 引数型を `CategoryKey` に絞れば TS が網羅性を保証し default を消せる |
| low | `contentEditor.ts:870` | `renderSkillRefList(..., withLevel)` の第5引数は呼び出し2箇所（612, 613）とも `true` 固定 → 引数を削除し `if (withLevel)`(893) を無条件化 |
| low | `validate-json.mjs:649,669,676` | `validateEnemySets()` が返す `bossSetIds` を呼び出し側 `:836` が**捨てている** → 返り値から削除（`bossSetIds.add` の3行も消える） |
| low | `contentEditor.ts:1052-1054` | `unitSuffix(text)` は引数が常に `'%'`（1103, 1153）→ `percentSuffix()` に。または現状維持 |
| low | `contentEditor.ts:88-92` | `EntrySummary` の `mainCategory`/`element`/`timing`/`draftable`/`sprite`/`visual` はカテゴリによっては常に `undefined` なのに全部 optional の平坦な型 → カテゴリ別の判別 union にすると `groupKeyOf`(186-196) が網羅性チェックを得る |

---

## 7. 保存パスのエラーハンドリング（Phase 8）

### 7-1.【high】`apiJson()` がエラーを握り潰す

`contentEditor.ts:242-247`。問題が3つ:

1. **`res.json()` が非JSONで throw する。** Vite dev サーバーがミドルウェアの外で 500/HTML を返した場合
   （プラグイン未ロード、ポート違い等）、`SyntaxError` になる。
2. **`GET /file` の失敗形が食い違う。** プラグインの catch-all(`contentEditorPlugin.mjs:319-321`) は
   `{ ok:false, errors:[...] }` を返すが、`selectEntry()`(`:401-405`) は `{ data?, error? }` を期待するため
   `res.error` が `undefined` になり、**実際の失敗理由が捨てられて一般文言だけが出る**。
3. **`/list` `/refs` の失敗が沈黙する。** `{ok:false,errors}` は上の if を通り抜けて `lists` に代入され(`loadAll()`:249-256)、
   `renderTabs()`:263 で `undefined` → `entries.filter` が TypeError。`main()`(1378-1386) に try/catch が無いため**真っ白な画面**になる。

**修正案:** `apiJson` を「まず `res.text()` → `JSON.parse` を try/catch」に変え、非JSONは本文の先頭を含む Error にする。
サーバー側 `contentEditorPlugin.mjs:319-321` の catch-all を、`/file` GET のときだけ `{ error: msg }` 形にする。
`main()` を try/catch で包む（成功パスの表示は不変）。

### 7-2.【med】エラー文言の連結がバラバラ

`save()`(455) は `.join('\n')`、`deleteCurrent()`(438) は `.join(' / ')`、
出現グループ保存(1369) / 読み込み(1256) はまた別。`.status-box` は `white-space: pre-wrap`（`content-editor.html:72`）なので
改行はどちらでも表示できる。

**修正案:** `showErrors(prefix, errors)` を1本置く。
**⚠️ `' / '` → `'\n'` は表示が変わるので、厳密に挙動不変を守るなら `deleteCurrent()` はそのまま残し、共通化は他3箇所に留める。**

### 7-3.【med】try/catch の適用が不揃い

`selectEntry()`(401) / `createNew()`(415) / `deleteCurrent()`(431) / `save()`(448) は**すべて try/catch 無し**で、
`void selectEntry(...)`(357) で呼ぶため例外は unhandled rejection になりコンソールにしか出ない。
一方 `renderEncounterGroupsEditor()`(1249-1257) とその保存ハンドラ(1360-1372) はちゃんと try/catch して `showStatus` する。

**修正案:** `guarded(fn)` を1本作り5箇所の `void` 呼び出しを置換。成功時の表示は一切変わらない。

### 7-4.【med】保存成功後の DOM 直パッチ

`contentEditor.ts:462-473` が `document.querySelector('.editor-header')` を全体検索して削除ボタンを後付けしている。
`renderEditor()` を呼ぶと成功メッセージが消えるための回避策（コメントに明記）だが、
`.editor-header` / `.danger` という **CSSクラス名への暗黙依存**が生まれている（`content-editor.html:63,69` を変えると壊れる）。

**修正案（挙動不変）:** `renderEditor()` に `keepStatus = false` 引数を足し、
`true` のときだけ `el('status-box').style.display = 'none'`(487) をスキップする。
`save()` は `renderEditor(true)` を呼ぶだけになり **12行が消える**。描画結果は現状の後付けパッチと同一。

### 7-5.【low】未保存編集の破棄が無警告 — **要件確認**

`selectEntry()`(401-413) と タブ切替(267-281) は `currentValue` への編集を確認なく捨てる。
**仕様かバグか判断できないため、リファクタでは現状維持。** `state.ts` 導入時に `dirty: boolean` を持たせておくと後から足しやすい。

---

## 8. テストカバレッジ

### 8-1. `contentEditorForm.test.ts`（286行）がカバーしているもの

`resolveRef`(9-29) / `widgetKindOf`(31-71、`textarea` を除く全ケース) / パス操作(73-99) /
effect ひな形(101-119、**自己参照。§4-1-a**) / `EFFECT_OP_FIELDS`(121-186) /
%変換(188-208、「0.7→80を直保存」バグの回帰テスト付き) / `blankEntrySkeleton`(210-256) /
`isValidIdShape`(258-269) / `resolvePreviewColor`(271-286)。

つまり **`contentEditorForm.ts` の純粋関数はほぼ全域カバー**（`buildSpriteRuns` を除く）。

### 8-2. 未テスト = リファクタ risk（**Phase 0 で埋める**）

| Sev | 対象 | なぜ危険か | 提案 |
|---|---|---|---|
| **high** | `contentEditor.ts` の**1396行すべて**（テストファイルが存在しない） | §1 の分割を「型が通る＝壊れていない」だけを頼りに行うことになる | 分割の**前**に jsdom で薄い characterization test を数本: ①`renderField` が各 `widgetKindOf` に対して生成する tagName/class/初期値、②「select/color を表示しただけでは `rootValue` に書き込まない」（`:661-664, 685-686` のコメントが明記する既知バグの再発防止）、③`renderEffectField` の `percentByStat`(`:1079-1080`) が stat に応じて `%` サフィックスを出し分ける、④optional トグル ON/OFF で `rootValue` にキーが増減する(`:588-599`) |
| **high** | `ALLOWED_EFFECT_OPS` ↔ `KNOWN_OP_IDS` の一致 | 新 op がエディタから静かに消える（§4-1-a） | **3行のテストを最初に足す** |
| med | `contentEditorPlugin.mjs` の `validateEntry`/`extraChecks`/`validateEncounterGroups` | §5 の共有化で挙動が変わっても誰も気づかない | `tests/unit/tools/battleContentRules.test.mjs` を新設し、3つのチェック関数の入出力（`string[]`）を固定 |
| med | `buildSpriteRuns`（`contentEditorForm.ts:348-367`） | 唯一テストのない純粋関数。`@` 動的色スロットのスキップ(`:359`)が非自明 | 3×3程度の `SpriteDefLike` で run 分割・`.`透明・`@`スキップを検証（3件） |
| low | `groupKeyOf` / `groupLabelOf` / グループ並び替え（`:186-207, 330-331`） | 純粋関数なのに private でテストできない | §1 で `catalog.ts` へ出せば即テスト可能（`orderGroupKeys` の「既知順→残りを sort」が特にバグりやすい） |
| low | `save()` の新規保存後 DOM パッチ(`:462-473`) | §7-4 の置換が唯一の挙動変化リスク箇所 | **手動確認手順:** 新規作成 → 保存 → 見出しから「（新規）」が消え、削除ボタンが出て、成功メッセージが残っている |

---

## 9. 推奨実施順序

1. §4-1-a の同期テスト（3行）、§6 のデッドコード削除、§5-3 の `PROBLEM_SEPARATOR` 統一。**挙動変化ゼロ・レビュー容易。**
2. §3-1（`APPLY_TO_LABEL`/`AFFINITY_LABEL` を `skillText.ts` へ）+ §3-3（`ELEMENTS` を `types.ts` へ）。方向は tools→domain の下向きのみ。
3. §5-2（`scripts/lib/battleContentRules.mjs` 新設）。Node 側だけで閉じるのでフロントに影響しない。
4. §8-2 の characterization test を jsdom で数本。
5. §2（`dom.ts` / `renderListEditor` / `optionalSection`）。**テストが入った後に。**
6. §1 のファイル分割。`fieldOverrides.ts` 化（554/616 の条件二重定義の解消）を含む。
7. §7（`apiJson` 堅牢化 / `guarded()` / `renderEditor(keepStatus)`）。
