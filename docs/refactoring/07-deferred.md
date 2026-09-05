# 07. 本計画から除外する項目

親: [README.md](README.md)

**本リファクタリングの絶対条件は「可視挙動を変えないこと」。**
監査で見つかったが、その条件に反する／規模が過大／ユーザー判断が要る項目をここに隔離する。
**着手する場合は必ず別タスク・別ブランチとし、それぞれ独立に判断すること。**

---

## A. 挙動が変わる — バグ修正（別タスクとして起票を推奨）

### A-1.【high】`damagePreview.ts` の `statOptions` 未対応で `NaN` が返る

- `src/domain/battle/damagePreview.ts:65` が `node.scale` を `{ stat; rate }` としか読まないため、
  `scale.statOptions`（`effectOps/damage.ts:36-41` が対応、実データは `src/data/rpg/skills/skill_tsumo.json`）を無視する。
  結果 `sourceStats[undefined]` → **`NaN`**。
- **現在は露見していない。** `estimateSkillDamage` は `useBattleState.ts:557-566` の敵スキルプレビューにしか使われず、
  敵定義に `statOptions` を使うものが無いため。
- 修正すると preview の表示が `NaN` → 正しい数値に変わる＝**可視挙動の変更**。
- 詳細: [02-domain.md](02-domain.md) §1-3。**修正前に `damagePreview.ts` の特性テストを書くこと。**

### A-2.【high】announce のたびに再生中の表示HPが真値へ上書きされる

- `src/composables/useBattlePresentation.ts:253-265` の sync watch が、
  前バッチの `later()` 再生が終わっていなくても displayedHp/displayedAlive を無条件に真値へ上書きする。
- 実機（`TIMED_SCHEDULER`）では次の announce まで `impactWaitMs` 待つため通常は追い越されないが、
  **見積り（`estimateHitCount`）と実際のキュー長がずれた瞬間に実機でも再現する**（[03-composables.md](03-composables.md) §6-2）。
- 修正案: バッチ世代番号 `fxGeneration` を導入し「再生中の id はベースラインを上書きしない」ガードを入れる。
  もしくはベースライン確保を `emit()` 側（効果解決の直前）へ移す。
- **Phase 0 ではテスト側だけを直す**（敵を1体に固定して単体エンカウントを保証する）。
  プロダクト側のガードはこの項目として別途扱う。詳細: [03-composables.md](03-composables.md) §4-1 / §12-2。

---

## B. 挙動が変わる — 死にデータを実際に効かせる

### B-1.【med】`BattleEffectDef.durationMs` / `visual.kind` / `target` / `label` が runtime 未参照

- `src/domain/battle/types.ts:229,231`。**23個の `battle-effects/*.json` すべてに書かれ、content-editor でも編集できる**
  （`contentEditorForm.ts:175`）のに、**runtime で一度も読まれない**。
  実際には全エフェクトが `timing.flashMs`（220ms 一律）で消える。
- `later(def.durationMs ?? timing.flashMs, …)` にすれば JSON が効くようになるが、**演出の尺が変わる**。
- **本計画では「死にデータである」ことを docs とコード上のコメントに明記するに留める。**
- 詳細: [03-composables.md](03-composables.md) §5-2 / §7-6。

### B-2.【low】`battle.json:presentation.attackPoseMs` が未参照

`config-types.ts:392` に型もあるが、どこからも読まれていない。
`presentation.posingId` を `afterAction()`(`useBattleState.ts:304`) で即クリアする実装に変わったときの置き去りと推測。
**削除するか posing の解除に使うかの判断が要る**（後者は挙動変更）。

### B-3.【low】`fx_level_up.json` が完全な dead data

どこからも参照されていない（実測確認済み）。削除するか `$comment` で「未使用（レベルアップ演出の予約）」と明示するか。
**削除はコンテンツの削除なのでユーザー判断。**

---

## C. 挙動が変わる — 設定値の不一致の是正

### C-1.【med】CSS のアニメーション時間と `battle.json:presentation` のズレ3件

| CSS | config | 差 |
|---|---|---|
| `CharacterFrame.vue:293,296` `lunge-down/up 420ms` | `attackPoseMs: 520` | CSSが100ms早く終わる |
| `BattleScreen.vue:833` `field-shake 280ms` | 解除は `flashMs: 220` | アニメ280ms > 解除220ms |
| `BattleScreen.vue:826` `critical-flash-fade 380ms` | `flashMs+80 = 300` | 80ms |

**是正すると見た目が変わる。** [04-components.md](04-components.md) §8-3 の変数化は行うが、
**変数の初期値は現在の値のまま**にすること。是正は目視確認を伴う別タスク。

### C-2.【med】`skill_stance_guard.json` の `effect[]` が実行されていない

`skill_stance_*.json` は `kind:"active"` の完全なスキル定義（`effect[]` に `modifier` op、`cooldown:3`）として存在するのに、
`useBattleState.selectAction` は `kind==='builtin'` を別経路で処理し、
`useBuiltinAction()`（`battleEngine.ts:383-392`）が `BATTLE.guard.cutRate` をハードコードで適用する。
**JSON の `effect[]` は実行されていない飾り。** 値も `battle.json:guard.cutRate`=0.5 と
`skill_stance_guard.json` の `amount`=0.5 で二重管理。

builtin を通常アクティブへ統合（`PlayerAction` を `{kind:'active', skillId}` に一本化）すれば
[03-composables.md](03-composables.md) §8-ケースB の7箇所が丸ごと消えるが、**戦闘の実行経路が変わるため挙動保証ができない。**
本計画では「JSON側の `effect[]` が実行されない」ことをコメントで明示するに留める。

### C-3.【low】ローダの不正データを dev で throw する

`battleContent.ts` / `battleBackgrounds.ts` は不正ファイルを `console.error` + `continue` で黙って捨てる。
dev ビルドで throw に変えると**開発時の挙動が変わる**（黙って消える → 落ちる）。
本計画では「スキップ件数の集約ログ」に留める。詳細: [06-data-config.md](06-data-config.md) §5-2。

### C-4.【low】`useGlossaryPanel` の状態がラン再開時に持ち越される

`useGlossaryPanel.ts` のモジュールレベル singleton がラン再開（`App.vue:313 restart()`）でリセットされないため、
前ランで開いたヘルプ/用語ポップアップの状態が次ランへ持ち越される。
**現状の可視挙動が「持ち越し」なので、リセットの追加は挙動変更。**
`readonly()` での公開だけは挙動不変なので本計画で行う。詳細: [03-composables.md](03-composables.md) §4-11。

---

## D. 規模が過大 — 本計画では実施しない構造変更

### D-1.【—】`BattleState` の6関心ネスト化

`src/domain/battle/types.ts:412-471`（25フィールド）を `{ run, battle, draft, panel, ui, score }` へネストする案。
**`useBattleState.ts`(626行) と `BattleScreen.vue`(930行) の全体に波及する。**
先に [02-domain.md](02-domain.md) §2-2（`ui` / `seenIds` の追い出し）だけ行えばコストの割に効果が大きい。
分割（Phase 4）が完了して各ファイルが小さくなってから再評価すること。

### D-2.【—】`GenrePlugin` に描画モードの概念を導入する

`src/engine/GenrePlugin.ts` は Canvas 描画専用インターフェースで、
「画面ごと差し替わるジャンル」（rpg）を表現できず、`App.vue` に `isBattleMode` 分岐が11箇所散在している。
**抽象の設計変更であり、挙動不変を機械的に保証できない。**
2つ目の「画面ごと差し替わるジャンル」を作る段階で改めて設計すること。
詳細: [01-cross-cutting.md](01-cross-cutting.md) §1-1。

### D-3.【—】`EnemyBehavior` の判別共用体化（敵の行動パターン拡張）

`EnemyDef.actionPattern: string[]` は「スキルID列を順に消化」しか表現できず、
HP閾値での怒りモード・条件分岐・確率選択が書けない。**これは機能追加。**
本計画では [02-domain.md](02-domain.md) §1-2（選択ロジックの1本化）までを行い、
`selectEnemyAction()` という単一の拡張点を用意するに留める。

### D-4.【—】`effects` → `castEffects` のリネーム

`effect`（効果ロジック）と `effects`（詠唱演出）が1文字違いで全く別概念。表示挙動は不変だが
schema + `validate-json.mjs` + `contentEditorForm.ts` + **該当27 JSON** のマイグレーションを伴う。
詳細: [06-data-config.md](06-data-config.md) §4-2。

### D-5.【—】`unlockCondition` の tier 化

`points: 10` / `points: 20` が22ファイルにコピーされている問題（[06-data-config.md](06-data-config.md) §2-4）に対し、
`{ category, tier: 1 }` 形式へ移行する案。22ファイルのマイグレーションを伴う。
本計画では `validate-json.mjs` に「値が `categoryUnlockThresholds` のいずれかであること」の検証を足すに留める。

### D-6.【—】`src/data/rpg/**` の遅延ロード化

JSON 151件が `import.meta.glob({ eager: true })` で共通バンドルに同梱され、他21ジャンルのプレイヤーにも配信される。
**遅延ロード化は初回表示の体感を変えうる。**
詳細: [01-cross-cutting.md](01-cross-cutting.md) §5。

### D-7.【—】`lastBattleEndNotices` の構造化

`battleEngine.ts:513,526` がエンジン内で日本語の文章を組み立てている。
`{ kind, amount }[]` へ構造化して文言生成を Vue 側へ移すのが正しいが、
`battleEngine.test.ts:726,737` が文言を検査しているため差分が広い。
詳細: [02-domain.md](02-domain.md) §2-1。

### D-8.【—】旧 SoundHooks の `playSfx(id)` への全面統合

`src/plugins/SoundManager.ts` に、データ駆動の `playSfx(id)` と旧来の `onJump()`/`onLand()`/… 個別フックが併存している。
新方式が上位互換だが、**旧フックが実際に鳴らしている sfx id の対応表をテストで固定してから**段階的に移す必要がある。
一度に全部やらない。詳細: [01-cross-cutting.md](01-cross-cutting.md) §3-2。

---

## E. ユーザー判断が必要な項目

### E-1. `_` プレフィックス規約をどうするか

CLAUDE.md「ファイル内プライベート関数は `_` プレフィックス + camelCase」に対し、
**`src/domain/battle/**` の private 関数は全て素の camelCase**（十数箇所）。
`src/data/` 側のローダ（`_rawModules` / `_modules`）は規約に従っている。**混在が最も悪い。**

| 選択肢 | 内容 | コスト |
|---|---|---|
| **A（推奨）** | 規約側を実態に合わせる。「`_` プレフィックスは data ローダ系の慣習」と CLAUDE.md に明記し、関数には要求しない | 小（CLAUDE.md の1段落） |
| B | domain 全体を一括リネームして規約に合わせる | 大（差分が広く、レビューコストの割に得るものが少ない） |

ESLint の `naming-convention` は現状これを検査していない。詳細: [01-cross-cutting.md](01-cross-cutting.md) §4-1。

### E-2. `CLAUDE_OWNER.md` / `CLAUDE_TASKS.md` の扱い

- `CLAUDE_OWNER.md`（182行）— 「`CLAUDE.md` より優先。適用範囲は本ブランチ限定」を宣言するタスク定義書。
  後付けの追加要件2件が追記されている。**実装が完了した今は履歴的文書。**
- `CLAUDE_TASKS.md`（1024行）— 7フェーズ分の作業ログが1ファイルに連結。リポジトリ直下。

リポジトリ直下の一級ファイルとして残すか、`docs/genre/rpg/` 配下の履歴文書へ移すか。
**削除ではなく移設・分割の判断であり、ユーザー確認が必要。** 詳細: [01-cross-cutting.md](01-cross-cutting.md) §2-2。

### E-3. `FocusSide` の `'ally'` を削除するか

`src/domain/battle/types.ts:85`。実データに1件も存在せず、`battleEngine.ts:262` は「味方は存在しない。安全側フォールバック」として握り潰す。
削除は JSON スキーマ変更を伴う。将来「味方を増やす」構想があるなら残す。

### E-4. `contentEditor` の未保存編集を破棄する挙動

`contentEditor.ts:401-413`（`selectEntry`）とタブ切替（`:267-281`）は `currentValue` への編集を確認なく捨てる。
**仕様かバグか判断できない。** 本計画では現状維持。`state.ts` 導入時に `dirty: boolean` を持たせておくと後から足しやすい。
詳細: [05-tools.md](05-tools.md) §7-5。

---

## F. スコープ外（本ブランチのツギハギとは無関係）

`main` の時点で既に300行を超えていたファイル17件。本ブランチの継ぎ足しとは無関係なので着手しない。

`src/game/sideScroller.ts`(1667) / `src/game/systems/TetrisFeature.ts`(716) / `src/game/systems/PuzzleFeature.ts`(695) /
`src/components/EndingPanel.vue`(625) / `src/game/render/PixelCanvas.ts`(531) /
`src/components/GenreRevealOverlay.vue`(447) / `src/components/ThrowOverlay.vue`(443) /
`src/tutorial/TutorialScreen.vue`(396) / `src/tools/genreLab.ts`(388) / `src/composables/useGameState.ts`(382) /
`src/components/ChoicePanel.vue`(371) / `src/components/PluginLoader.vue`(336) / `src/plugins/SfxSound.ts`(324) /
`src/genres/AerialStgPlugin.ts`(317) ほかテスト3件。

CLAUDE.md は `TetrisFeature.ts` を「悪い前例。新規の同種実装のテンプレートにするな」と既に名指ししている。
