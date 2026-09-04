# content-editor — RPGコンテンツGUIエディタ

`src/data/rpg/{skills,traits,enemies,battle-effects,battle-backgrounds}/*.json` を、`schemas/battle-*.schema.json` から自動生成したフォームで編集する開発者専用ツール。

- 実装: `tools/content-editor.html`（エントリ）/ `src/tools/contentEditor.ts`（UI・DOM）/ `src/tools/contentEditorForm.ts`（スキーマ解決・パス操作などの純粋関数）/ `scripts/contentEditorPlugin.mjs`（保存APIを提供する Vite dev サーバー middleware）
- 開発専用。`scripts/contentEditorPlugin.mjs` は `apply: 'serve'` のため `npm run build` には一切含まれない
- スキル・特性・敵・エフェクト・背景それぞれのデータ仕様は [docs/genre/rpg/07-data-schema.md](genre/rpg/07-data-schema.md) / [09-effects.md](genre/rpg/09-effects.md) を参照

---

## 起動方法

```bash
npm run content-editor
```

dev サーバーが起動し、ブラウザで `tools/content-editor.html` が自動的に開く。手動で開く場合は dev サーバー起動中に **http://localhost:5173/tools/content-editor.html** へアクセスする。

> **通常の `npm run dev` は今まで通り本番ゲームを起動する。** content-editor へ自動遷移することはない。

---

## 画面の見方

### 1. カテゴリタブ・一覧

左サイドバーの6タブ（**アクティブ**・**パッシブ**・特性・敵・エフェクト・背景）のうち、アクティブ/パッシブは同じ `src/data/rpg/skills/` ディレクトリ（1スキーマ）を `kind` で絞り込んだ2つのUI上のタブに分けたもの。それ以外のタブは `src/data/rpg/` の対応ディレクトリを直接スキャンして生成される。ファイルを追加すれば次回リロードで自動的に一覧へ現れる。JSONが壊れている（パース不能な）ファイルは赤字で一覧に出るが、開くことはできない。

タブごとに一覧の**セクション分け**（グループ化）を選べる。例えばアクティブスキルなら「属性で分ける（物理・魔法・特殊）」「カテゴリで分ける」。選択は `localStorage` に保存され、次回起動時も引き継がれる。

| タブ | セクション分けの選択肢 |
|---|---|
| アクティブ | なし / 属性（`element`） / カテゴリ（`mainCategory`） |
| パッシブ | なし / カテゴリ（`mainCategory`） |
| 特性 | なし / ドラフト区分（`draftable`） |
| 敵 | なし / ボス区分（`isBoss`） |
| エフェクト | なし / タイミング（`timing`） |
| 背景 | なし / ボス専用区分（`bossOnly`） |

敵・エフェクトの一覧行には、見た目のプレビュー（[後述](#見た目のプレビュー編集はしない)）も小さく添える。

### 2. フォーム

エントリを選ぶと、そのカテゴリの `schemas/battle-*.schema.json` からフィールドを自動生成する。

| schema の形 | ウィジェット |
|---|---|
| `enum` を持つ string | セレクトボックス。`mainCategory`/`subCategories`/`element` 等は、値（英語キー）はそのままに、日本語ラベルを添えて表示する（[JP表示](#日本語ラベル)参照） |
| `#rrggbb` パターンの string | カラーピッカー + 16進テキスト |
| boolean | チェックボックス |
| number / integer | 数値入力（min/maxをschemaから反映） |
| 必須でない object（`unlockCondition`・`sfx`・背景の `glow`/`clouds`/`fog` 等） | 「この項目を設定する」チェックボックスで有効化するまで、そのキー自体を書き込まない |
| enum の配列（`subCategories` 等） | チェックボックス群 |
| 文字列配列で他ファイルを参照するもの（`traits`・`effects` 等） | 実在するIDから選ぶチェックボックス群/セレクト（`/refs` APIの一覧から生成） |
| `enemies.sprite` | テキスト入力（候補一覧つき）+ 実際のドット絵プレビュー |
| `enemies.activeSkills` / `passiveSkills` | スキルIDのセレクト + レベル数値の行を追加/削除。保存時は常に `{id, level}` 形式 |
| `enemies.actionPattern` | スキルIDのセレクト行。↑↓ボタンで並べ替え可能（順序が意味を持つため） |
| `battleEffects.visual` | 通常のフィールド群（kind/color/shake）に加え、色とkindを反映したプレビューを添える |
| `effect[]`（スキル・特性の効果ノード） | op セレクト + op固有の型付きフィールド（[下記](#effect-ノードの型付きフォーム)参照） |
| 上記のどれにも当てはまらない形 | JSONテキストエリア（フォールバック） |

各フィールドの上に付く `*` は、そのスキーマ上の必須項目であることを示す。

### 見た目のプレビュー（編集はしない）

- **敵**: `sprite` が指すドット絵（`src/data/sprites/*.json`）を、一覧のサムネイルと編集フォーム内の両方でその場に描く。`PixelSprite.vue` と同じアルゴリズム（横に連続する同色セルをまとめた矩形をSVGで描画）を [contentEditorForm.ts](../src/tools/contentEditorForm.ts) の `buildSpriteRuns()` に切り出して使っている。スプライト自体の編集はできない（絵を直接描き換えたい場合は該当JSONを別途編集する）
- **エフェクト**: エフェクトにはスプライトが無いため、`visual.color` を地色にした `visual.kind` のバッジで代用する。`color` が `var(--battle-diff-plus)` のようなCSSカスタムプロパティ参照の場合は、`contentEditorForm.ts` の `resolvePreviewColor()` が既知の代表値表（`BATTLE_CSS_VAR_FALLBACK`、`BattleScreen.vue` の初期値と同じ）で近似する。実際の色は戦闘テーマにより変わりうるため、あくまで目安

### 日本語ラベル

`mainCategory`・`subCategories`・`element`・stat（`str`/`hitRate`等）は、ゲーム本体と同じ日本語ラベル（`src/domain/battle/skillText.ts` の `CATEGORY_LABEL`/`ELEMENT_LABEL`/`STAT_LABEL`/`MODIFIER_SCOPE_LABEL`）を「英語キー（日本語ラベル）」の形で添えて表示する。`effect[]` の `op`（`damage`/`modifier`等）も同様に、`contentEditorForm.ts` の `EFFECT_OP_LABEL` を使って添える。**保存されるデータの値は常に英語キーのまま**で、表示だけの上乗せ。

### 3. 「JSONとして直接編集」

エントリ全体を生のJSONとして編集するモードに切り替えられる。フォームでは扱いにくい構造や、まとめて書き換えたい場合に使う。切り替えても保存経路（検証→書き込み）はフォームモードと同じ。

### 4. ＋ 新規作成 / 保存 / 削除

- **＋ 新規作成**: IDを入力すると、そのカテゴリの必須項目を満たす最小構成（`blankEntrySkeleton`）から編集を始められる。保存するまでファイルは作られない
- **保存**: [scripts/contentEditorPlugin.mjs](../scripts/contentEditorPlugin.mjs) に POST し、ajv でスキーマ検証してから書き込む。失敗時は画面上部にエラー内容が出る（`(root)` はAJVの `instancePath` がルート直下を指す場合の表記で、複数エラーが同時に出ることがある）
- **削除**: 確認ダイアログの後、ファイルを削除する。新規作成中（未保存）のエントリには表示されない

---

## 保存時に検証される内容・されない内容

| 検証する | 検証しない（`npm run validate` に任せる） |
|---|---|
| 対象カテゴリの JSON Schema（`schemas/battle-*.schema.json`） | 他ファイルからの参照整合性（例: 敵が存在しないスキルIDを参照していないか） |
| id とファイル名の一致 | スプライトの `idle`/`attack` フレーム有無 |
| `kind: "active"`/`"passive"` に応じた必須・禁止フィールド（`element`/`cooldown`等） | ボス出現数・背景の最低構成数などラン全体の整合性 |
| `enemies.actionPattern` が `activeSkills` に含まれるIDのみで構成されているか | SFX参照の実在チェック |

このため、**保存が成功しても `npm run validate` は必ず実行すること**。画面下部・保存成功メッセージにもその旨を表示している。

---

## `effect` ノードの型付きフォーム

`schemas/battle-skill.schema.json` の `effectNode` 定義は `op`（enum）しか強制しておらず、`damage` なら `element`/`scale`、`modifier` なら `stat`/`amount`/`scope` のように、op ごとに必要なフィールドが異なる（実データの整合性は `scripts/validate-json.mjs` の `walkEffectNodes` が別途担っている）。この「op依存の自由形式」を、[contentEditorForm.ts](../src/tools/contentEditorForm.ts) の `EFFECT_OP_FIELDS`（op → フィールド定義の配列）に基づいて型付きフォームへ落とし込んでいる。「ダメージを、何に基づいて、何%与えるか」を直接編集できることを主眼に置いている。

- op を切り替えると、そのopの典型的な値（`EFFECT_OP_SKELETONS`）で中身を総入れ替えする（型の合わない古いフィールドが残らないようにするため）。「リセット」ボタンで同じopのまま初期値へ戻すこともできる
- フィールドの種類ごとにウィジェットが変わる: `stat`（ステータス選択、`STAT_LABEL`付き）・`element`/`element-or-any`（属性選択）・`number`（任意項目は空にすると保存時にキー自体を消す）・`select`（`scope`/`applyTo`/`affinity` は日本語ラベル付き）・`scale`（`damage`/`heal`/`shield` 用の「ステータス＋倍率」2点セット）・`nodes`（`repeat` の `body`/`onFirstIteration`/`onLastIteration`。**この関数自身を再帰呼び出し**しており、`repeat` の中にさらに `repeat` を入れることもできる）
- `EFFECT_OP_FIELDS` に無いフィールドの組み合わせ（将来 op を追加した場合など）が必要になったら、エントリ全体を「JSONとして直接編集」に切り替えれば必ず対応できる

`ModifierScope`（`modifier.scope`）は `thisHit`/`thisTurn`/`thisBattle`/`permanent` の4値（`src/domain/battle/types.ts`）。既存データに使われている値を選択肢から漏らすと、フォームが実際の値と異なる表示になる（値自体は壊れない）ため、フィールド定義を追加する際は型定義を必ず確認すること。

---

## ファイル構成

```
tools/content-editor.html          # 独立したHTMLエントリ（本番 index.html とは無関係）
src/tools/contentEditor.ts         # UI層: DOM操作・API呼び出し・フォーム描画
src/tools/contentEditorForm.ts     # ロジック層: DOM非依存の純粋関数（テスト対象）
scripts/contentEditorPlugin.mjs    # Vite dev サーバー middleware（apply: 'serve'）
```

UI とロジックを分離しているのは [sfx-test-mode.md](sfx-test-mode.md) の `sfxTest.ts`/`sfxTestLogic.ts` と同じ理由による。`contentEditorForm.ts` の関数群は [contentEditorForm.test.ts](../tests/unit/tools/contentEditorForm.test.ts) から直接テストされている。

`src/tools/` は本番コードからの import が ESLint（`no-restricted-imports`）と回帰テスト（[sfxTestIsolation.test.ts](../tests/unit/sfxTestIsolation.test.ts)、`src/tools/` を除く `src/**` 全体を走査）の二重で禁止されている。この保証は sfx-test 用に作られたものだが、`src/tools/` 全体を対象にした汎用的な仕組みのため、content-editor にもそのまま適用される（追加の対応は不要）。

---

## API（`scripts/contentEditorPlugin.mjs`）

dev サーバーにのみ生える、`/__content-editor/api/` 配下のエンドポイント。

| メソッド・パス | 内容 |
|---|---|
| `GET /list` | 全カテゴリのエントリ一覧（id・label・kind・グループ化用フィールド・見た目プレビュー用フィールド等） |
| `GET /refs` | 他ファイルからの参照候補（スキルID・特性ID・エフェクトID・SFX ID・スプライトID） |
| `GET /file?category=&id=` | 1エントリの生JSON |
| `POST /file`（body: `{category, id, data}`） | 検証して書き込み（新規/更新共通） |
| `DELETE /file?category=&id=` | 削除 |
| `POST /validate`（body: `{category, data}`） | 書き込まずに検証だけ行う |

---

## 制限・今後の課題

- 参照整合性チェック（敵→スキル/特性、スキル→エフェクト/SFX、背景の最低構成数など）は行わない。`npm run validate` を必ず併用する
- `EFFECT_OP_FIELDS` に定義の無いop（将来追加されたもの）や、`layers`/`props`（背景）以外の想定外の配列-of-object は、フォームが対応しきれない場合JSONテキストエリアにフォールバックする
- エフェクトの見た目プレビューは `visual.color` が `var(--xxx)` 参照のとき近似値（`BATTLE_CSS_VAR_FALLBACK`）を使う。戦闘テーマによって実際の色は変わりうるため、あくまで目安
- 複数人が同時に同じファイルを編集した場合の競合検出は無い（最後に保存した内容で上書きされる）
