# 07. 本計画から除外する項目

親: [README.md](README.md)

**本リファクタリングの絶対条件は「可視挙動を変えないこと」。**
監査で見つかったが、その条件に反する／規模が過大／ユーザー判断が要る項目をここに隔離する。

> **2026-09-06 更新:** ユーザーの指示により、A〜C に挙げていた**既知の不具合はすべて対応済み**
> （コミットは [README.md](README.md) の進捗表を参照）。以下は「何をどう直したか」と「まだ残っているもの」の記録。
> D（規模が過大）と E（ユーザー判断）は未着手のまま。

---

## A. バグ修正 — 対応済み

### A-1.【対応済み】`damagePreview.ts` の `statOptions` 未対応で `NaN` が返っていた

- 症状: `src/domain/battle/damagePreview.ts` が `node.scale` を `{ stat; rate }` としか読まず、
  `scale.statOptions`（実データ: `src/data/rpg/skills/skill_tsumo.json`）で `sourceStats[undefined]` → `NaN`。
  1ノードでスキル全体の合計が `NaN` になり、`damageMagnitude(NaN, maxHp)` が全閾値を素通りして `'lethal'` を返すため、
  **敵がそのスキルを持った瞬間、敵の次手予告が常に「致命傷」になる**状態だった。
- 修正: 実行側 `effectOps/damage.ts` の `resolveReferenceValue()` と `DamageScale` 型を export し、
  プレビュー側がそれを**共有**するようにした（再実装せず1本化したので、今後ズレようがない）。
  規則は「`statOptions` があればその中の実効値の最大、無ければ `stat`」。
- 当時のプレイヤーへの影響: なし。`skill_tsumo` は `draftable:false` で `skill_riichi` からの変身でしか到達できず、
  どの敵定義もそれを持っていなかったため、実際には発火していなかった。
- 副次効果: [02-domain.md](02-domain.md) §1-3 が指摘していた「preview が damage のパイプラインを再実装している」問題の
  一部（参照値の解決）が解消した。残りの重複（カット率・相性の組み立て）は Phase 5 で扱う。

### A-2.【対応済み】announce のたびに再生中の表示HPが真値へ上書きされていた

- 症状: `useBattlePresentation` の sync watch が、前バッチの再生が終わっていなくても
  `displayedHp` / `displayedAlive` を真値へ上書きし、多段ヒットの段階表示が消える。
- 修正: `hasPendingPlayback(id)` を導入し、再生が残っている対象はベースライン確保を見送るようにした。
  判定は2条件:
  - `hpStepRemaining` が残っている（drain 済みで多段ヒットの途中）
  - `effectQueue` に**表示HPを動かすエフェクト**（`fx_hit_*` / `fx_heal` / `fx_defeat`）が残っている
    （drain がまだ走っていない区間。同期スケジューラでは1手番が同一コールスタックで完結するため実際に起きる）
- **キューを無条件に見るのは誤り**だった点に注意。`fx_debuff`（継続ダメージの通知）は `play()` が
  `displayedHp` を書き換えないため、それを理由にベースライン確保を見送るとHPバーが取り残される。
  `tests/unit/composables/useBattlePresentation.test.ts` にこの条件を固定するテストがある。

> **ここで判明した別件（未修正・軽微）:** 継続ダメージは適用直後に announce が来ないため、
> HPバーへの反映が**次の announce まで1手番ぶん遅れる**。`play()` が `fx_debuff` で表示HPを更新しないための
> 既存挙動であり、今回のガードとは無関係。気になるなら `play()` に `fx_debuff` の表示HP更新を足すのが素直。

---

## B. 死にデータ — 対応済み

### B-1.【対応済み】`BattleEffectDef.durationMs` が runtime 未参照だった

- 症状: スキーマ上 `required` で、23個の `battle-effects/*.json` すべてに書かれ、content-editor でも編集できるのに、
  runtime は一律 `timing.flashMs`（220ms）を使っていた。**編集しても何も起きない項目**だった。
- 修正: `play()` が `def?.durationMs ?? timing.flashMs` を使うようにし、フラッシュ・クリティカル強調・画面シェイクの
  消灯に反映した。あわせて CSS 側のアニメーション尺も同じ値で駆動するようにした（C-1 参照）。
- **可視の変更:** エフェクトの発光・揺れの尺が一律220msから各エフェクトの値になった。
  代表値: `fx_hit_physical` 260 / `fx_hit_none` 240 / `fx_hit_special` 280 / `fx_critical` 320 /
  `fx_super_critical` 420 / `fx_heal` 300 / `fx_defeat` 400 ms。

### B-2.【対応済み】`battle.json presentation.attackPoseMs` が未参照だった

- 症状: 値は 520 だが誰も読まず、実際の踏み込みアニメーション（`lunge-down/up`）は CSS に 420ms 直書き。
  **config が現実と食い違ったまま放置**されていた。
- 修正: config の値を実態に合わせて **420 へ訂正**し、CSS がそこから `--lunge-dur` として受け取るようにした。
  可視の変更なし（420ms のまま）。死んだキーと嘘の食い違いが同時に消えた。

### B-3.【未対応 — ユーザー判断】`fx_level_up.json` が完全な dead data

どこからも参照されていない（実測確認済み）。
`schemas/battle-effect.schema.json` は `additionalProperties: false` で `$comment` を許さないため、
ファイル内に注記を書けない。代わりに [docs/genre/rpg/09-effects.md](../genre/rpg/09-effects.md) に
「未使用データ」として明記した。**実装する（レベルアップ演出を鳴らす）か削除するかはユーザー判断。**

---

## C. 設定値の不一致 — 対応済み（C-2 を除く）

### C-1.【対応済み】CSS のアニメーション尺と実際の消灯タイミングのズレ

`--shake-mag` をインラインで渡す既存の作法にならい、**尺も同じ経路で渡す**ようにして単一の出所にした。

| 対象 | 修正前 | 修正後 |
|---|---|---|
| `.sprite-box.flashing` の `hit-shake` / `impact-flicker` | 220ms 固定 | `var(--fx-dur, 220ms)`。エフェクトの `durationMs` が駆動 |
| `.crit-ring` の `crit-ring-expand` | 520ms 固定 | `var(--fx-dur, 520ms)` |
| `.battle-field.shaking` の `field-shake` | 280ms 固定 | `var(--shake-dur, 280ms)` |
| `.critical-screen-flash` の `critical-flash-fade` | 380ms 固定 / JS側は `flashMs + 80` = 300ms | 両方 `battle.json presentation.screenCriticalFlashMs`（380）から |
| `lunge-down` / `lunge-up` | 420ms 固定 | `var(--lunge-dur, 420ms)`（B-2） |

- **可視の変更はクリティカル時の画面フラッシュ1点のみ。** 300ms で切られていたフェードが 380ms 最後まで再生される。
- フォールバック値はすべて修正前と同じなので、変数が届かない経路があっても見た目は変わらない。
- `timing.flashMs + 80` というマジックナンバーは消えた。

### C-2.【未対応 — ただしドリフトは防止済み】`skill_stance_*.json` の `effect[]` が実行されていない

`skill_stance_guard` / `skill_stance_watch` は `kind:"active"` の完全なスキル定義として存在するのに、
`useBattleState.selectAction` は `kind==='builtin'` を別経路で処理し、`useBuiltinAction()` が
`BATTLE.guard.cutRate` を使う。**JSON の `effect[]` は実行されない飾りのまま。**

実行経路の一本化（`PlayerAction` を `{kind:'active', skillId}` へ寄せる）は
[03-composables.md](03-composables.md) §3-4 / §8-ケースB のとおり戦闘の実行経路そのものを差し替える構造変更なので、
今回は行っていない。
代わりに `scripts/validate-json.mjs` に **`battle.json` と `skill_stance_*.json` の数値が一致することを検査**する
`validateBuiltinStanceConsistency()` を追加した。片方だけ調整すると `npm run validate` が落ちるので、
「スキル説明の数値と実際の効果が食い違う」形で黙って壊れることはなくなった。

### C-3.【対応済み】コンテンツローダが不正ファイルを黙って落としていた

- 症状: `battleContent.ts` / `battleBackgrounds.ts` は不正なファイルを `console.error` + `continue` で捨てる。
  スキルの `kind` をタイポするとドラフト候補から静かに消え、敵の `stats` を消すと編成が1体欠けて始まる。
- 修正: **本番の挙動は一切変えず**（壊れたデプロイで白画面にしない）、dev のみ、
  スキップしたファイルを集約して1回のエラーとしてまとめて出すようにした（`import.meta.env?.PROD` ガードは
  `ConfigValidator.ts` の既存パターンに合わせている）。
  `battleGuide.ts` にも他のローダと同等の形状チェックを追加した（従来は無検証キャストだった）。
- dev で throw する案は採らなかった。このローダは `App.vue` から無条件に読まれるため、
  rpg の JSON 1つのタイポで**全ジャンルの dev アプリが落ちる**ことになり、影響が釣り合わない。

### C-4.【対応済み】ヘルプ／用語パネルの状態がラン再開後も残っていた

`useGlossaryPanel` はモジュールレベルの singleton で、`App.vue` の `restart()` が触っていなかった。
ヘルプや用語ポップアップを開いたままギブアップすると、次のランがそれを開いた状態で始まっていた。
`resetGlossaryPanel()` を追加し `restart()` から呼ぶようにした。**可視の変更: 次のランは閉じた状態で始まる。**

> `readonly()` での公開は見送った。`HelpGuide.vue:39` が `activeSectionId.value` へ直接書き込んでおり、
> そこまで書き換えると「バグ修正」の範囲を越えるため。Phase 4 の分割時に併せて整理する。

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

### E-2. `CLAUDE_OWNER.md` / `CLAUDE_TASKS.md` をリポジトリに入れるか

この2ファイルは **`.gitignore` に登録されており git 管理下にない**（`.gitignore:47-48`）。
つまり clone した人の手元には存在しない。

- `CLAUDE_OWNER.md`（182行）— 「`CLAUDE.md` より優先。適用範囲は本ブランチ限定」を宣言するタスク定義書。
  後付けの追加要件2件が追記されている。**実装が完了した今は履歴的文書。**
- `CLAUDE_TASKS.md`（1024行）— 7フェーズ分の作業ログが1ファイルに連結。

**問題は「置き場所」ではなく「コミット済み文書が、リポジトリに無いファイルを設計判断の出典として参照していること」。**
その解消（リンクの是正と、必要な判断根拠の `docs/genre/rpg/` への移設）は
[01-cross-cutting.md](01-cross-cutting.md) §2-2 のとおり **Phase 1 / Phase 9 で判断を待たずに実施する。**

ここに残るユーザー判断は1点のみ:

| 選択肢 | 内容 |
|---|---|
| A | 現状維持（ローカル文書のまま）。§2-2 の移設で必要な根拠だけリポジトリに残す |
| B | `.gitignore` から外してリポジトリに入れる。履歴がすべて残るが、1024行の作業ログが恒久的にリポジトリに入る |

**判断が出るまでは A を前提に進める**（＝ファイル自体には触れない）。

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
