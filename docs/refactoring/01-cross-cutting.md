# 01. 横断的な問題（アーキテクチャ・ドキュメント・共有資産）

親: [README.md](README.md)

個々のレイヤに閉じない、ブランチ全体に効いている問題。**後続の開発者・AIエージェントを最も強く誤らせるのはここ。**

---

## 1. `rpg` がジャンル抽象を迂回している

### 1-1.【high】`GenrePlugin` が Canvas 描画専用インターフェースで、rpg を表現できない

- `src/engine/GenrePlugin.ts` — `skyColors` / `groundColors` / `spawnTable` / `drawPlayer` / `parallax` / `starConfig` …
  すべて「同一の横スクロール Canvas エンジンの変奏」を前提にした型。
- `rpg` はジャンル確定後に Canvas を捨てて専用の Vue 画面へ完全移行する唯一の例外であり、この型に当てはまらない。
- 結果として `App.vue` に `isBattleMode` の条件分岐が散在する（src 全体で11箇所、うち `App.vue` に12参照）:
  `App.vue:41`(定義) / `:54` / `:173` / `:246` / `:287` / `:375` / `:472` / `:475` / `:540` / `:557` / `:580`。

**なぜ問題か:** 「画面ごと差し替わるジャンル」を2つ目に作ると、同じ条件分岐をもう一度 `App.vue` に足すことになる。
プラグイン機構があるのに、最も大きな差異だけがプラグインの外にある。

**本計画での扱い:** `GenrePlugin` に描画モードの概念を導入するのは**設計変更であり挙動不変を保証できない**ため、
[07-deferred.md](07-deferred.md) へ送る。本計画では代わりに以下だけを行う。

- `isBattleMode` の定義（`App.vue:41-44`）に、なぜ `throwing` を含むのかを含めた仕様コメントを維持したうえで、
  分岐が11箇所ある事実と将来の一本化方針を `App.vue` の該当箇所に1つのコメントとして集約する。
- ライフサイクルの二重駆動を解消する（下記 1-2）。これは挙動不変。

### 1-2.【med】戦闘の初期化とUIのマウントが別条件で駆動されている

- `App.vue:408-415` — `watch(gameState.lockedGenre)` の副作用として `battle.initRun()` / `battle.reset()`。
- `App.vue:41-44` — UI の出し入れは `isBattleMode`（`lockedGenre === 'rpg' && phase ∈ {genreLocked, throwing}`）。
- 条件が別なので、`phase` が `genreLocked` になる前に `initRun` が走りうる。その間に `emit()` された効果は
  `useBattlePresentation` の watch が未登録のためキューに滞留する。

**修正案（挙動不変）:** `isBattleMode` を単一の真実にし、`watch(isBattleMode, on => on ? battle.initRun() : battle.reset())` へ一本化する。

### 1-3.【med】App 破棄時に戦闘のタイマーが止まらない

- `App.vue:457-464` の `onUnmounted` は `snapRaf` / `scroller` / 3つのタイマーを片付けるが、`battle` に触れていない。
- `useBattleState` 側にも `onScopeDispose` が無い（→ [03-composables.md](03-composables.md) §5-1）。

**修正案:** `useBattleState` に `onScopeDispose(() => { generation++; cancelPending() })` を追加する。
テストから直接呼ばれるケースがあるため `getCurrentScope()` ガードを併用する。

---

## 2. ドキュメントが実装を誤って説明している

### 2-1.【high】設計文書が「未実装」と宣言したまま

- `docs/genre/rpg/rpg-genre.md`（1082行）の冒頭が **「本文書のステータス: 設計のみ・未実装」**。
- 同文書自身が「実装が完了したら、この文書を『現状の実装を記録する』形式へ書き直すこと」と指示しているが、未実施。
- さらに文書内のファイル配置案は `src/data/skills/` で、実装 `src/data/rpg/skills/` と乖離している。
- `docs/genre/rpg/00-overview.md` と `01-architecture.md` は仕様策定時（2026-09-02）の内容が中心
  （※ `01-architecture.md` は `bb6675b` のWIPで更新済み）。

**なぜ問題か:** リポジトリを引き継いだAIエージェントが最初に開く1082行の文書が「未実装」と主張し、
存在しないディレクトリ構成を提示する。**本ブランチにおける最大の誤誘導源。**

**修正案（Phase 9）:**
1. `rpg-genre.md` 冒頭のステータス欄を「実装済み。本文書は設計判断とその根拠の記録」に書き換える。
2. 「アーキテクチャ（ファイル構成案）」節を、実装後の実際の構成へ差し替えるか、
   「※実装時に `src/data/rpg/` 配下へ変更。現状は [01-architecture.md](../genre/rpg/01-architecture.md) を参照」と明記する。
3. 「実装のいずれかの方針を選ぶ必要がある（A/B）」等の未決記述を、実際に選ばれた方針の記録に改める。

### 2-2.【high】コミット済みドキュメントが、リポジトリに存在しないファイルを根拠として参照している

`CLAUDE_OWNER.md`（182行）と `CLAUDE_TASKS.md`（1024行）は **`.gitignore` に登録されており、git 管理下にない**
（`.gitignore:47-48`。`git ls-files` で確認済み）。つまり**リポジトリを clone した人の手元には存在しない**。

にもかかわらず、**コミット済みの文書がこの2ファイルを設計判断の出典として繰り返し参照している。**

| 参照元（コミット済み） | 内容 |
|---|---|
| `docs/genre/rpg/00-overview.md:4` | **`CLAUDE_OWNER.md` への Markdown リンク**（相対パス `../../../CLAUDE_OWNER.md`）|
| `docs/genre/rpg/05-skills.md:24` | 「実装後の変更（スキルポイント制度、`CLAUDE_TASKS.md` 第7フェーズ）」 |
| `docs/genre/rpg/05-skills.md:183` | 「実装後の見直し（第8フェーズ、`CLAUDE_TASKS.md` Z-9）」 |
| `docs/genre/rpg/06-draft.md:9` | 「刷新の背景・設計判断は `CLAUDE_TASKS.md` 第7フェーズに詳細記録」 |
| `docs/genre/rpg/06-draft.md:382-383` / `04-battle-flow.md:327` / `08-ui.md:620` | 同種の参照 |
| `docs/pixelart-rebuild/**` | 別ブランチ由来だが同様に多数（`00-rendering-system.md` だけで7箇所） |

**なぜ問題か:**

1. **本ブランチの最大の設計変更（ドラフト制→スキルポイント制、レベル倍率の線形化）の「なぜ」が、
   リポジトリからは辿れない。** 文書は「詳細記録は CLAUDE_TASKS.md にある」と言うが、その文書は clone しても付いてこない。
   **後続のAIエージェント・開発者が最も知りたい根拠が、リポジトリの外にある。**
2. `docs/genre/rpg/00-overview.md:4` は**実リンク**なので、**クリーンな clone では `npm run check-doc-links` が失敗する**
   （現在の作業ツリーではローカルにファイルが在るため通ってしまい、気づけない）。CI 環境次第では既に潜在的に壊れている。

**修正案（Phase 9）:**

1. `docs/genre/rpg/00-overview.md:4` のリンクを、リンクではないコード表記（`` `CLAUDE_OWNER.md`（リポジトリ管理外のローカル文書）``）に変える。
   **これだけは Phase 1 で先に直す**（clone 時の CI 破損を塞ぐため）。
2. `CLAUDE_TASKS.md` に記録されている**設計判断の根拠のうち、後続が必要とするもの**を
   `docs/genre/rpg/` 配下のコミット済み文書へ移す。全文の移設ではなく、
   「なぜドラフト制をやめたか」「なぜ 2^Lv-1 を線形にしたか」といった判断とその理由に絞る。
   移設先は既に該当節がある `05-skills.md` / `06-draft.md`。
3. 移設が済むまでは、参照している各文書に「※ `CLAUDE_TASKS.md` はリポジトリ管理外」と明記する。

> **なお、この2ファイル自体をどう扱うか**（リポジトリに入れるか、ローカル文書のままにするか）は
> ユーザー判断。→ [07-deferred.md](07-deferred.md) §E-2。**ただし上記1〜3は判断を待たずに実施できる。**

### 2-3.【low】設定ファイル表の追随

- `CLAUDE.md:194-220` の設定ファイル表は `bb6675b` で `battle.json` / `encounter_groups.json` / `skill_points.json` の
  3行が追加済み。**config キーを1つ足すたびにこの表を更新する必要がある**（→ [06-data-config.md](06-data-config.md) §3-2 の6箇所目）。

---

## 3. 共有資産への rpg の漏れ出し

### 3-1.【med】`ScoreVars` に rpg 専用の optional フィールドが4つ

`src/domain/types.ts:428-436`:

```ts
battlesWon?: number
bossDefeated?: number    // ← コメント「ボス撃破なら 1」は誤り。実際は通算撃破数が入る
maxSkillLevel?: number
traitsAcquired?: number
```

- 全22ジャンルが共有する型に、1ジャンル専用のフィールドが optional で生えている。
- 同じ4フィールドが `src/domain/battle/types.ts:474-479` の `ScoreVarsBattle` にも定義されており**二重管理**。
- `bossDefeated` は3つの異なる意味で使われている（`BattleState.bossDefeated: boolean` = 直近戦闘、
  `ScoreVarsBattle.bossDefeated: number` = ラン通算、`domain/types.ts` のコメント = 「撃破なら1」）。

**修正案（Phase 7 / 挙動不変）:**
`src/domain/types.ts` を `export interface ScoreVars extends Partial<ScoreVarsBattle> { …共通分… }` にする。
フィールド名の二重管理が消える。`domain/types.ts → domain/battle/types.ts` の import が増えるが逆向き依存はないので循環しない。
`bossDefeated` のコメント誤りは Phase 1 で即修正する（改名はスコア式JSONに波及するため行わない）。

### 3-2.【med】効果音APIが2系統ある

`src/plugins/SoundManager.ts`:

- 本ブランチで追加された `playSfx?(id: string, freqScale?: number)` — **データ駆動の正しい形**。
  JSON が持つ id をそのまま渡す。
- 既存の `onJump()` / `onLand()` / `onShoot()` … 個別イベントフック（十数個）が併存。

新方式は旧方式の上位互換だが、両方が生きているため「音を足すときどちらを使うのか」が決まらない。

**修正案（Phase 8 / 挙動不変）:** 旧フックの実装が結局どの sfx id を鳴らしているかを対応表にし、
`playSfx(id)` へ寄せられるものを段階的に移す。**id と発音が一致することをテストで固定してから**行う。
一度に全部やらない。

### 3-3.【low】共有コンポーネントに rpg 専用のCSSが混入

`src/components/ManualPanel.vue` — `compact` prop（rpg 戦闘用に説明書を小さく畳む）と、
そのための専用CSSブロック。`width: 210px` / `max-height: 132px` / `font-size: 10px` / `opacity: 0.9` が直書き。

**修正案（Phase 6）:** 数値を `battle.json` へ出すか、少なくとも `ManualPanel.vue` 先頭の const/CSS変数へ括り出す。
**prop 自体は妥当**（レイアウトのバリアントであってジャンル固有ロジックではない）ので残す。

### 3-4.【high】スコア式が2箇所に文字単位で重複

- `src/data/genres/rpg.json:8` の `scoreFormula`
- `src/composables/useBattleState.ts:47` の `RPG_SCORE_FORMULA_FALLBACK`（同一文字列）

CLAUDE.md / CLAUDE_OWNER.md 双方の「ハードコード禁止」に真正面から違反。
`GENRES` の取得に失敗した経路では、JSON を調整してもサイレントに旧係数でスコアが出る。

**修正案（Phase 2）:** `RPG_SCORE_FORMULA_FALLBACK` を削除し、`GENRES` から取れない場合は
`game_balance.json` に既存の `defaultScoreFormula` へ落とす。`rpg.json` を単一の出所にする。

---

## 4. コーディング規約の実態との乖離

### 4-1.【low】`_` プレフィックス規約が battle 系で一切守られていない

CLAUDE.md「ファイル内プライベート関数: `_` プレフィックス + camelCase（例 `_buildFakeManual()`）」に対し、
`src/domain/battle/**` の private 関数は**全て素の camelCase**:
`battleEngine.ts:35 randRange` / `:39 freshCombatant` / `:134 weightsForBattleIndex` / `:146 weightedPick` /
`:159 filterSetsByBossFlag` / `:342 flushCounterRetaliations` / `:461 applyPeriodicSelfEffects` /
`skillDraft.ts:57 contributionAmount` / `:175 rollFallbackOption` / `:182 shuffle` /
`skillPanel.ts:55 syncStatAllocationModifier` / 各 effectOp の `readParams` ほか。

ESLint の `naming-convention` はこれを検査していない。一方 `src/data/` 側のローダ（`_rawModules` / `_modules`）は
規約に従っている。**混在が最も悪い。**

**修正案（Phase 9）:** どちらかに倒す判断を先に行う。推奨は**規約側を実態に合わせる**
（`_` プレフィックスは manual/data ローダ系の慣習と明記し、関数には要求しない）。
一括リネームは差分が大きく、レビューコストの割に得るものが少ない。**ユーザー判断が必要。**

### 4-2.【low】型 import の書き方の揺れ

`src/domain/battle/battleEngine.ts:228` だけ `import('./types').EffectiveStats` のインライン型 import を使う
（同ファイル `:10-14` に型 import ブロックがあるのに）。→ Phase 1 でブロックへ寄せる。

---

## 5. バンドルへの同梱（記録のみ・本計画では着手しない）

`src/data/rpg/**` の JSON 151件（skills 52 / enemy-sets 26 / battle-effects 24 / enemies 22 / traits 22 / backgrounds 5）が
`import.meta.glob({ eager: true })` で共通バンドルに同梱され、他21ジャンルのプレイヤーにも配信される。
CSS バジェットも battle UI のために 100KB → 120KB へ引き上げ済み（`scripts/check-bundle-size.mjs:14-18`）。

遅延ロード化は**初回表示の体感を変えうる**（＝可視挙動の変更）ため、[07-deferred.md](07-deferred.md) へ送る。
ただし [04-components.md](04-components.md) の CSS 重複解消により、CSS 側は自然に縮む見込み。
