# バグ調査レポート

- 調査対象: `main` ブランチ
  - 初回調査時点: コミット `47e3fd0`（`origin/main` と一致）
  - **第2次調査（本更新）時点: コミット `cdc0196`（現在の `origin/main` 最新）**。初回調査後に `origin/main` へ3コミットが追加されており（依存関係バンプ2件 + `ChoicePanel.vue` の未使用 import 修正1件）、第2次調査ではこの最新コミットを対象に全項目を再検証したうえで、未調査だった領域（`scripts/`, `schemas/`, 未言及の `config/*.json`, 全22ジャンルの `scoreFormula`）を追加調査した
- 調査範囲: `src/`, `scripts/`, `schemas/`, 設定JSON群（`src/data/config/*.json` 等）
- 調査方法: 静的解析（`typecheck` / `lint` / `test:unit` / `validate` / `test:features` / `build` / `bundle-size` / `check-doc-links`）、プロジェクト付属のジャンル到達性シミュレータ（`npm run reach-sim`）、コードリーディング（全22ジャンルの `scoreFormula` と、それを構成する変数がどの `FeatureSystem` から書き込まれるかを1件ずつ突合）、一部は Playwright による実機（Chromium）動作確認、再現用ユニットテストの追加
- 第2次調査は `origin/main` を独立した git worktree に checkout した上で全ツールチェーンを再実行しており、本レポート内の main ブランチに対する記述はすべてこの手順で再検証済み
- 修正は行っていない（調査・レポートのみ）
- 本レポート内の「確信度」表記の意味:
  - **確認済（実行確認）**: 実際にコマンド実行・ブラウザ操作で再現を確認した
  - **確認済（コードリーディング）**: コードの静的なトレースにより、条件が揃えば確実に発生すると判断できる
  - **推測**: コードから疑わしいが、実行時の挙動までは検証できていない
- 参考: Critical(C1-C4)/High(H1-H6) は本レポート作成の元になった調査を基に `fix/critical-high-bugs` ブランチ（[PR #153](https://github.com/ootomonaiso/MANUAL-OVERRIDE/pull/153)、本レポート執筆時点で `main` 未マージ）で修正作業が行われているが、**`main` ブランチ自体には未反映**であるため、以下は現時点の `main` の状態として記載する

---

## サマリ

| 優先度 | 件数 | 内訳 |
|---|---|---|
| Critical | 7 | 既存4件（C1-C4）+ 第2次調査で新規3件（C5-C7） |
| High | 6 | 既存6件（H1-H6）、変化なし |
| Medium | 9 | 既存8件（M1-M8）+ 第2次調査で新規1件（M9） |
| Low | 19 | 既存15件中1件（L1）が調査中に `main` 側で解消済み、新規4件（L16-L19） |

静的解析の結果（第2次調査、`origin/main` `cdc0196` で再実行）: `typecheck` は問題なし、`lint` は **0件**（初回調査時の警告1件は `main` 側で別PRにより解消済み。旧 L1 参照）、`validate` / `check-doc-links` / `test:features` / `build` / `bundle-size` はすべて成功。`reach-sim` は初回と同様の傾向（`hack_slash` 0.1%、`tetris` 0.0%、他多数のジャンルが25%未満）。一方で `test:unit`（`vitest run tests/unit`）は既存の `tests/unit/domain/genreResolver.test.ts` で **5件失敗**しており、CI の `test:unit:ci` はこのディレクトリを対象から除外しているため見逃されていた（詳細は Medium M7）。

追加した再現用テストファイル: `tests/unit/domain/manualDeck-integrity.test.ts`（後述 Medium M8 の再現用。既存の `ManualValidator` の検証ロジックを実データに対して実行するだけで、production コードへの変更はなし）。

---

## Critical

### C1. タイトル画面がローディング画面の下に隠れたまま出てこない（初回起動が実質進行不能）

- **該当箇所**: [src/App.vue:32,97,327](../src/App.vue#L32), [src/components/LoadingScreen.vue](../src/components/LoadingScreen.vue)（全体）
- **概要**:
  `isLoading` は `ref(true)` で初期化され（`App.vue:32`）、これを `false` に戻す唯一の箇所は `startGame()` 内（`App.vue:97`）。しかし `startGame()` はタイトル画面の「はじめる」ボタン（`.title-btn`, `App.vue:355`）の `@click` からしか呼ばれない。
  `LoadingScreen.vue` は `isLoading` が `true` の間 `v-if` で表示され続け（`App.vue:327`）、`position:absolute; inset:0; background:var(--bg); z-index:200` の**不透明な全画面オーバーレイ**として `.title-screen`（`z-index:100`）の上に重なる。`LoadingScreen.vue` 内部の疑似プログレスバー（`setInterval`）は100%に達すると自分自身を止めるだけで、`isLoading` を書き換える手段は一切ない。
  つまり「はじめる」ボタンを押さないとローディングが終わらず、ローディングが終わらないとボタンが見えない、という循環構造になっている。
- **実行確認結果**: Playwright（Chromium）で `npm run dev` 相当のサーバーに接続して検証したところ、
  - ページ読み込みから4秒経過しても `.loading-screen` 要素は消えない（疑似プログレスバーが100%で停止したまま）。
  - `.loading-screen` 自体には `pointer-events:none` が指定されており、`.loading-card`（進捗表示の小さなカード）の矩形以外の領域ではクリックがそのまま透過して下の要素に届く。実際に `.title-btn` の座標で `elementFromPoint` を取ると `.title-btn` 自身が返り、Playwright の通常クリック（`force`なし）でも正常にクリックが成立し、ゲームが開始することを確認した。
  - しかし「はじめる」ボタンは不透明なオーバーレイの下に**完全に隠れて見えない**ため、プレイヤーは自分がクリックすべき場所を視覚的に一切知る手段がない。ブラウザの開発者ツールで要素を調べない限り、実質的に「ローディングが永遠に終わらない壊れたゲーム」にしか見えない。
- **優先度**: **Critical** — 技術的には（座標さえ分かれば）クリック自体は成立するため厳密な「操作不能」ではないが、一般プレイヤーが正常な手順でゲームを開始する手段が実質的に存在しない。コンテスト評価者が最初の画面で離脱する可能性が非常に高く、実運用上は進行不能と同等の影響がある。
- **確信度**: 確認済（実行確認）。ローディング画面が消えないこと、ボタンが不可視であること、座標を知っていればクリックが成立することのすべてを実機（Chromium）で確認済み。
- **再現条件**: アプリを新規に開く（初回ロード）だけで常に発生する。特別な操作は不要。

---

### C2. Survival ジャンル: 近接攻撃で倒した敵が消えず「ゾンビ化」して当たり判定が残り続ける

- **該当箇所**: [src/game/systems/SurvivalFeature.ts:122-160](../src/game/systems/SurvivalFeature.ts#L122)（`_resolveMeleeCollisions` / `_onEnemyKilled`）、[src/game/sideScroller.ts:641-660](../src/game/sideScroller.ts#L641)（衝突判定ループ、`h.hp` を一切見ない）
- **概要**:
  `_resolveMeleeCollisions` は `h.hp -= damage` の後 `h.hp <= 0` になると `_onEnemyKilled` を呼ぶが、`_onEnemyKilled` は経験値付与とレベルアップ判定のみ行い、
  - `world.removeHazardById(h)` のようなハザード除去処理を一切呼ばない
  - `world.setKills(...)` を一切呼ばない（後述）
  - `SurvivalPlugin.onHazardDestroyed`（アイテムドロップ用フック）も呼ばれない

  一方、`sideScroller.ts` のプレイヤー×ハザード衝突判定（横スクロール用 `_updateHorizontal` の該当ループ、縦スクロール用も同様）は `h.isSafe` だけを見て `h.hp` を見ていない。`isSafe` と `hp` は別のフィールドであり、`hp<=0` になっても `isSafe` は変化しないため、「倒したはずの敵」が引き続き `!isSafe` な危険オブジェクトとして扱われ、無敵時間が切れた次のフレーム以降もプレイヤーに継続してダメージを与え続ける。
  さらに `_resolveMeleeCollisions` 自身も `h.hp <= 0` のハザードをループの先頭でスキップする（`if (h.isSafe || h.hp <= 0) continue`）ため、再攻撃で消すこともできない。
- **同時に発生する副作用（スコア不正計算）**: `survival.json` の `scoreFormula` は `"survivedSec * 15 + itemsCollected * 80 + distance * 0.2 + kills * 50 + exp * 0.5"` だが、`gameStats.kills` は `world.setKills()` を呼んだ場所でしか更新されず（`ShootFeature.ts:204`, `SpecialFeature.ts:221`）、`SurvivalFeature.ts` にはその呼び出しが存在しない。そのため Survival ジャンルでは **`kills * 50` の項が常に 0** になる。
- **優先度**: **Critical** — 「敵を倒して生き延びる」という Survival ジャンルの中核ループが破綻しており、倒したはずの敵から理不尽にダメージ／死亡し得る。加えてスコア計算式の一項が常時無効という、スコア不正計算にも該当する。
- **確信度**: 確認済（コードリーディング）。`SurvivalFeature.ts` の全文と `sideScroller.ts` の該当衝突ループを直接確認し、`world.removeHazardById` / `setKills` の呼び出しがこのファイルに存在しないことを `grep` でも裏取り済み。実プレイでの再現（実際に近接攻撃で敵を倒し続けて被弾するか）は未実施。
- **再現条件**: Survival ジャンルに収束したプレイで、近接攻撃キー（デフォルト `z`）で敵を倒し、その場に留まる／敵の残骸に再接触する。

---

### C3. hack_slash ジャンル: EXP 加算条件の実装ミスにより `exp` フィーチャーが機能せず、スコア式の一項が常時 0

- **該当箇所**: [src/game/systems/RpgFeature.ts:43-56](../src/game/systems/RpgFeature.ts#L43)（`update()`）、[src/data/genres/hack_slash.json](../src/data/genres/hack_slash.json)（`enableFeatures` に `item_pickup` が含まれない）
- **概要**:
  `RpgFeature` は `handles = ['hp', 'exp', 'item_pickup', 'shield']` として `exp` フィーチャーの担当を宣言しているが、実際に EXP を加算する `update()` 本体は先頭で `if (!world.rules.features.has('item_pickup')) return` としており、**`exp` フィーチャーの有効・無効を一切見ていない**。EXP アイテムのスポーン自体も `sideScroller.ts` 側で `item_pickup` 有効時のみ行われる（[sideScroller.ts:1187,1222](../src/game/sideScroller.ts#L1187)）。
  `hack_slash.json` の `enableFeatures` は `["shoot", "enemy_hp", "exp", "dash", "boss"]` であり、`item_pickup` を含まない。つまり `exp` フィーチャーを有効化しているにもかかわらず、EXP アイテムはスポーンせず、仮にスポーンしても `RpgFeature.update()` が早期リターンするため `p.exp` は増加しない。
  hack_slash の `scoreFormula` は `"kills * 90 + maxCombo * 200 + exp * 2 + bossKills * 400"` であり、**`exp * 2` の項は常に 0** となる。（`dungeon` / `idle` / `rpg` は `exp` と `item_pickup` を両方有効化しており、同種の不整合はない。）
- **優先度**: **Critical**（ルーブリック上の「スコア不正計算」に明確に該当）
- **確信度**: 確認済（コードリーディング）。`RpgFeature.ts` の条件分岐と `hack_slash.json` の `enableFeatures`、`sideScroller.ts` のアイテムスポーン条件をすべて直接確認済み。実プレイでの数値検証は未実施。
- **再現条件**: hack_slash ジャンルに収束した状態でプレイし続けるだけで常に発生（EXP アイテムが一切出現しない）。

---

### C4. hack_slash・tetris ジャンルが、プロジェクト公式のシミュレータ上で「最適プレイでも到達率 0.0%」

- **該当箇所**: [src/data/genres/hack_slash.json:5](../src/data/genres/hack_slash.json#L5)（`thresholds: { enemy: 5, combo: 7 }`）、[src/data/genres/tetris.json:5](../src/data/genres/tetris.json#L5)（`thresholds: { combo: 10, craft: 10 }`）、比較対象 [src/data/genres/puzzle.json:5](../src/data/genres/puzzle.json#L5)（`thresholds: { combo: 6 }`）、[src/data/config/genre_params.json](../src/data/config/genre_params.json)（`thresholdGuide.dualAxis: 3`）
- **概要**:
  プロジェクトに同梱されているジャンル到達性シミュレータ `npm run reach-sim`（`scripts/genre-reach-sim.mjs`）を実行したところ、以下の結果が得られた（各ジャンルへの「狙い撃ちプレイヤー」3000回試行）。

  ```
  狙っても到達率25%未満: aerial_stg, arena, bullet_hell, bullet_runner, dungeon, hack_slash,
    horror, platformer, racing, rhythm, rpg, runner, sports, stealth_action, survival, tetris, tower_def
  ```
  中でも **`hack_slash` と `tetris` は 3000 回中 0 回（0.0%）** で、ランダムプレイヤー20000回のシミュレーションでも両者とも 0.0% だった。

  このシミュレータは `src/domain/genreResolver.ts` のベイズ収束ロジック（`computeBayesianPosteriors` / `_judgeConvergence`）と `src/data/cardPool.ts` の `sampleCards` の重み付き抽選ロジックを Node 用に忠実に再実装したものであり（実装を読み比べて確認済み）、シミュレータ自体のバグによる誤検出とは考えにくい。

  原因をコードから調べたところ、ベイズ尤度は `L(G) = exp(-decayRate × Σ max(0, threshold[axis] - accumulated[axis]))`（`decayRate = 0.50`, `src/data/config/bayes.json`）で計算される。`puzzle` は `combo:6` の単一軸のみを要求するのに対し、`hack_slash` は `enemy:5` **かつ** `combo:7`、`tetris` は `combo:10` **かつ** `craft:10` という複数軸を同時に高水準で満たす必要がある。`combo` 軸を伸ばすカードを選ぶプレイヤーは、`combo` が `puzzle` の閾値(6)を超えた時点で `puzzle` の尤度が最大化される一方、`hack_slash`/`tetris` は他の軸（`enemy`/`craft`）の不足分がそのまま尤度を押し下げるため、事後確率で `puzzle` に確率質量を奪われ続ける。
  さらに `tetris` の `combo:10`・`craft:10` という値は、プロジェクト自身が設計指針として定義している `genre_params.json` の `thresholdGuide.dualAxis: 3`（2軸ジャンルは各軸3程度を推奨）を大幅に超過しており（約3倍）、`MAX_ROUNDS=5` というカード選択回数の制約下では現実的に到達不可能な設計になっていると考えられる。
- **優先度**: **Critical** — CLAUDE.md は「22ジャンルの完全実装」を完了項目として明記しているが、実際には22ジャンル中2ジャンルがゲームプレイを通じて実質到達不能であり、ゲームの中核コンセプト（「横スクロールから多様なジャンルが生まれる体験」）が一部破綻している。なお、これは実行時クラッシュやハードな進行不能ではなく、あくまで「特定コンテンツに到達できない」という設計上の欠陥である点は付記する（読み手によっては High 相当と判断してもよい）。
- **確信度**: 確認済（実行確認 + コードリーディング）。シミュレータの実行結果自体は再現性のある事実。原因分析（閾値設計とベイズ尤度の競合）はコードリーディングによる推測。
- **再現条件**: `node scripts/genre-reach-sim.mjs .`（または `npm run reach-sim`）を実行するだけで再現する。実プレイでの追試は行っていないが、シミュレータの忠実度から見て実プレイでも同様の傾向になる可能性が高い。

---

### C5.（第2次調査で新規発見）5ジャンルの `scoreFormula` が参照する `combo` 変数、2ジャンルが参照する `kills` 変数が、そのジャンルでは恒常的に0のまま変化しない

- **該当箇所**:
  - `combo` が常に0: [src/data/genres/platformer.json:6,8](../src/data/genres/platformer.json#L6)、[src/data/genres/racing.json:6,8](../src/data/genres/racing.json#L6)、[src/data/genres/rhythm.json:6,8](../src/data/genres/rhythm.json#L6)、[src/data/genres/runner.json:6,8](../src/data/genres/runner.json#L6)、[src/data/genres/sports.json:6,8](../src/data/genres/sports.json#L6)
  - `kills` が常に0: [src/data/genres/dungeon.json:6,8](../src/data/genres/dungeon.json#L6)、[src/data/genres/rpg.json:6,8](../src/data/genres/rpg.json#L6)
  - 根本原因: `world.setCombo(...)` を呼ぶのは [ShootFeature.ts:205](../src/game/systems/ShootFeature.ts#L205)（`shoot` 有効時のみ弾がヒットして呼ばれる）、[SpecialFeature.ts:222](../src/game/systems/SpecialFeature.ts#L222)（`tower` の自動撃破時）、[PuzzleFeature.ts:690](../src/game/systems/PuzzleFeature.ts#L690)（`lights_out` の正解時）、[TetrisFeature.ts:527](../src/game/systems/TetrisFeature.ts#L527)（`tetris_mode` のライン消去時）の4箇所のみ。`world.setKills(...)` を呼ぶのは [ShootFeature.ts:204](../src/game/systems/ShootFeature.ts#L204) と [SpecialFeature.ts:221](../src/game/systems/SpecialFeature.ts#L221) の2箇所のみ。
- **概要**:
  上記5ジャンル（platformer/racing/rhythm/runner/sports）の `enableFeatures` を確認すると、`shoot`/`enemy_hp`/`tower`/`lights_out`/`tetris_mode` のいずれも含まれていない（例: `rhythm.json` は `["beat_hazard", "just_input", "beat_dash"]`、`platformer.json` は `["double_jump", "long_air", "wall_jump"]`）。つまりこれらのジャンルでプレイしている間、`world.gameStats.combo` を書き換えるコードパスは一切実行されず、初期値の `0` から一度も変化しない。同様に dungeon/rpg は `enableFeatures: ["hp", "exp", "item_pickup", "slow_precise"]` であり `kills` を書き換えるコードパスが存在しない。
  スコアは `src/game/sideScroller.ts` の `_recalculatePlayScore()`（ゲーム終了時に1回呼ばれ、`vars.combo` / `vars.kills` に `this._gameStats.combo` / `this._gameStats.kills` をそのまま渡して `scoreFormula` を評価する）で確定するため、`rhythm.json` の `"beatHits * 150 + combo * 100 + distance * 0.4"` のうち `combo * 100` の項、`dungeon.json` の `"exp * 3 + kills * 70 + ..."` のうち `kills * 70` の項は、**プレイヤーの腕前や運に関係なく、常に0**になる。乱数やタイミングに依存する話ではなく、コード上その値を書き込む経路自体が存在しないため、100%再現する。
- **優先度**: **Critical** — スコア計算式の一項が特定ジャンルで恒常的に無効化されており、明確な「スコア不正計算」に該当する。5ジャンル（platformer/racing/rhythm/runner/sports）+2ジャンル（dungeon/rpg）= 22ジャンル中7ジャンルに影響する、既知の C3（hack_slash の exp）と同型のバグパターンが広範囲に存在している。
- **確信度**: 確認済（コードリーディング）。`world.setCombo` / `world.setKills` の全呼び出し箇所を `grep` で洗い出し、各呼び出し元 `FeatureSystem.handles` が該当7ジャンルの `enableFeatures` に一つも含まれないことを直接突合して確認した。実プレイでの実測（スコア表示が実際に0のままであること）は未実施。
- **再現条件**: 該当7ジャンルのいずれかに収束してプレイし、ゲームを終了する（ギブアップ／死亡）だけで常に発生する。

---

### C6.（第2次調査で新規発見）tower_def: `enemy_hp` を有効化しているだけで `shoot` を有効化していないため、ShootFeature が毎フレーム `kills`/`combo` を0へ巻き戻し、タワーによる撃破がスコアに一切反映されない

- **該当箇所**: [src/data/genres/tower_def.json:6,8](../src/data/genres/tower_def.json#L6)（`enableFeatures: ["tower", "enemy_hp", "item_pickup"]`）、[src/game/systems/ShootFeature.ts:17,28-38,200-205](../src/game/systems/ShootFeature.ts#L17)（`handles` に `enemy_hp` を含み、`update()` 末尾で無条件に `_syncWorldStats` を呼ぶ）、[src/game/systems/SpecialFeature.ts:196-222](../src/game/systems/SpecialFeature.ts#L196)（`_updateTower` が撃破時に `world.setKills`/`setCombo` を加算）、[src/engine/GameRegistry.ts:80-87](../src/engine/GameRegistry.ts#L80)（`getActiveSystems` が `features` Set の挿入順＝JSON配列の記載順でシステムを返す）
- **概要**:
  `ShootFeature.handles` は `['shoot', 'three_way', 'charge_shot', 'spread_shot', 'enemy_hp', 'bomb']` であり、`enemy_hp` を含む。`GameRegistry.registerFeature` はこの配列の**各要素**に同一インスタンスを紐付けるため、`enemy_hp` だけを有効化した場合でも `ShootFeature` は「有効なシステム」として毎フレーム `update()` が呼ばれる。`ShootFeature.update()` は末尾で常に `_syncWorldStats(world)` を呼び、`world.setKills(s.kills)` / `world.setCombo(s.combo)` で `world.gameStats` を**無条件に上書き**する（`s.kills`/`s.combo` は `ShootFeature` 自身の内部状態で、`shoot` が無効なため弾が一切発射されず、常に `0` のまま）。
  一方 `getActiveSystems()` は `world.rules.features`（`Set<FeatureId>`）を先頭から辿って対応システムを収集する。`tower_def.json` の `enableFeatures` は `["tower", "enemy_hp", "item_pickup"]` の順であり、`resolveFeatureSet()`（[src/domain/genreResolver.ts:172-178](../src/domain/genreResolver.ts#L172)）はこの配列順で `Set` を構築するため、`tower`（→`SpecialFeature`）が先、`enemy_hp`（→`ShootFeature`）が後にヒットする。結果、`sideScroller.ts` のメインループ（[sideScroller.ts:414-415](../src/game/sideScroller.ts#L414)）では **毎フレーム `SpecialFeature.update()` → `ShootFeature.update()` の順で実行**される。タワーが敵を1体倒すと `SpecialFeature._updateTower` が `world.setKills(kills+1)` / `world.setCombo(combo+1)` を呼ぶが、**同じフレーム内で直後に実行される** `ShootFeature.update()` の `_syncWorldStats` がその値を即座に `0` へ上書きしてしまう。
  この巻き戻しは撃破のたびに毎フレーム発生するため、ゲーム終了時に `_recalculatePlayScore()` が読む `this._gameStats.kills` / `.combo` は、直前のフレームで必ず `ShootFeature` によって `0` にリセットされた後の値であり、**タワーが何体倒していても最終的な `kills` は実質常に0**になる。`tower_def.json` の `scoreFormula` は `"kills * 90 + combo * 110 + survivedSec * 8"` であり、`kills * 90` と `combo * 110` という重み最大の2項が両方無効化される。
- **優先度**: **Critical** — Tower Defense の中核である「タワーが敵を倒す」行為がスコアに一切反映されない、明確なスコア不正計算。C2/C3 と同様のパターンだが、原因が「値を書き込むコードが存在しない」ではなく「別Featureが毎フレーム上書きする」という、より発見しにくい形の競合である点に注意。
- **確信度**: 確認済（コードリーディング）。`GameRegistry.registerFeature`/`getActiveSystems` の実装、`resolveFeatureSet` の `Set` 構築順、`ShootFeature._syncWorldStats` の無条件上書き、`SpecialFeature._updateTower` の加算処理をすべて直接確認し、フレーム内の実行順が「SpecialFeature→ShootFeature」に確定することを追跡した。実プレイでの実測は未実施。
- **再現条件**: tower_def ジャンルに収束し、タワーに敵を1体でも倒させるだけで常に発生する。

---

### C7.（第2次調査で新規発見）stealth_mode: 一定時間静止し続けるだけでスコアが無制限に増加し続ける（`stealthCooldownSec` が未実装で歯止めがない）

- **該当箇所**: [src/game/systems/SpecialFeature.ts:177-194](../src/game/systems/SpecialFeature.ts#L177)（`_updateStealth`）、[src/data/config/stealth.json:6](../src/data/config/stealth.json#L6)（`stealthCooldownSec: 5.0`、定義されているが未使用）、[src/game/sideScroller.ts:1358](../src/game/sideScroller.ts#L1358)（`addScoreVarsStealthBonus` が無条件加算）、影響ジャンル: [src/data/genres/horror.json:8](../src/data/genres/horror.json#L8)（`stealthBonus * 0.8`）、[src/data/genres/stealth_action.json:8](../src/data/genres/stealth_action.json#L8)（`stealthBonus * 0.5`）
- **概要**:
  `_updateStealth` はプレイヤーが静止（`onGround && |vx|<1`）している間 `idleTimer` を加算し、`stealthDurationSec`（3.0秒）に達すると `hidden = true` にして、以後**その条件が真である限り毎フレーム** `world.addScoreVarsStealthBonus(dt)` を呼ぶ。これは `scoreVarsStealthBonus`（`sideScroller.ts:81`、コメント「ステルス継続フレーム数の累積」）に無条件・無上限で加算され続ける累積カウンタで、`_recalculatePlayScore()` の `vars.stealthBonus` としてそのまま `scoreFormula` に渡される。
  `idleTimer` は一度 `stealthDurationSec` を超えると、プレイヤーが静止し続ける限りリセットされないため、**その場に立ち止まったまま何もしないだけで、ゲーム終了までスコアが際限なく積み上がる**。`stealth.json` には `stealthCooldownSec: 5.0` というフィールドが定義されており（`ConfigValidator.ts` で型チェック・範囲チェックまでされている）、名前から見て「一定間隔でしかボーナスを与えない」ためのクールダウンを意図していたと推測されるが、`grep` で確認した限り `STEALTH.stealthCooldownSec` は `src/` のどこからも参照されておらず、実装されていない。
- **優先度**: **Critical** — 「スコアが不正計算される」の典型例。プレイスキル・運と無関係に、単に操作を止めるだけで再現でき、上限もないため、horror・stealth_action の両ジャンルで最終スコアを実質無限に吊り上げられる。
- **確信度**: 確認済（コードリーディング）。`_updateStealth` の条件分岐、`addScoreVarsStealthBonus` の無条件累積、`scoreFormula` での参照、`stealthCooldownSec` が未参照であることを直接確認した。実際にブラウザで長時間放置してスコアが増加し続けることの実機確認は未実施。
- **再現条件**: horror または stealth_action ジャンルに収束後、プレイヤーを3秒以上静止させ続ける（キー入力をしない）。

---

## High

### H1. `GenrePlugin.onGenreLocked` / `onManualUpdated` フックがエンジンから一切呼ばれていない（デッドフック）

- **該当箇所**: [src/engine/GenrePlugin.ts:173,252](../src/engine/GenrePlugin.ts)（インターフェース定義）、[src/genres/SurvivalPlugin.ts:67-73](../src/genres/SurvivalPlugin.ts#L67)（唯一の実装、`hunger`/`level`/`weaponDamage` の初期化に使用）、[src/composables/useGameState.ts:189-196](../src/composables/useGameState.ts#L189)（`_lockGenre`、フック未呼び出し）
- **概要**: `src/` 全体を `onGenreLocked` で検索してもインターフェース宣言・no-opデフォルト実装・`SurvivalPlugin` の実装以外に呼び出し箇所が存在しない。ジャンル確定は `useGameState.ts` の `_lockGenre` で行われるが、対応する `GenrePlugin` を取得してこのフックを呼ぶ処理がない。`docs/coding-conventions.md` はこのフックを「ジャンル確定直後に1回だけ呼ばれる」ものとして `plugin.onGenreLocked(world)` という呼び出しパターンを模範例として明記しており、ドキュメントと実装が矛盾している。
  現状 `SurvivalPlugin.onGenreLocked` が設定する値（`hunger=100, level=1, weaponDamage=1`）は `Player` エンティティのデフォルト値と偶然一致しており、`SurvivalFeature.onInit` 側の別経路の初期化が機能しているため、現時点では表面化していない。しかし今後 `SURVIVAL` 設定や `Player` デフォルト値が変更された場合、あるいは新しいジャンルプラグインがこのフックに依存するロジックを書いた場合、そのロジックは静かに一切実行されない。
- **優先度**: High（現状は偶然の一致で表面化していないが、プラグイン契約そのものが機能しておらず、今後の開発で確実に踏み抜かれる）
- **確信度**: 確認済（コードリーディング。`src/` 全体の網羅的な grep による）

### H2. 同一フレームで複数ハザードに同時接触すると無敵時間が機能せず多重ダメージを受ける

- **該当箇所**: [src/game/sideScroller.ts:641-660](../src/game/sideScroller.ts#L641)（`_updateHorizontal`）、同様の構造が縦スクロール版にも存在
- **概要**: `if (p.invincible <= 0) { for (const h of this.hazards) { ... if (isHazardous) this._onPlayerHit(p) ... } }` という構造で、`p.invincible <= 0` の判定はループ開始前に一度だけ評価される。`_onPlayerHit` → `RpgFeature.onPlayerHit` は同期的に `p.invincible = VFX.invincibleDuration` を設定するが、そのフレーム内で継続しているループ自体は既に走り始めているため止まらず、同一フレームでプレイヤーの当たり判定に重なっている2つ以上の危険ハザードそれぞれに対して `_onPlayerHit` が呼ばれてしまう。結果、本来1回のはずのヒットで HP が2以上減る。
- **優先度**: High（`hp` フィーチャーを持つジャンル（aquatic / dungeon / glitch / horror / rpg / survival）で発生しうる、明確な誤動作。クラッシュはせずゲームは続行可能）
- **確信度**: 確認済（コードリーディング、制御フローの静的トレース）。実際にハザードを重なった状態で発生させての実機確認は未実施。

### H3. `stealth_mode` の無敵効果が実質ゼロ（`dt` を無敵時間として設定しているため）

- **該当箇所**: [src/game/systems/SpecialFeature.ts:188-193](../src/game/systems/SpecialFeature.ts#L188)（`_updateStealth`）
- **概要**: `p.invincible = Math.max(p.invincible, dt)` としており、無敵時間として1フレーム分の `dt`（数十ミリ秒）しか設定されない。`sideScroller.ts` 側の無敵時間減算・当たり判定はこの `_updateStealth` 呼び出しより**前**のフェーズで実行されるため、次フレームでは実質的に無敵時間がまた0に近い値まで減っており、無敵として機能しない。`stealth.json` にも無敵時間用の定数は定義されていない。`RpgFeature.ts:26` の `p.invincible = VFX.invincibleDuration` という正しいパターンと比較すると、`dt` は本来別の定数を渡すべきところの実装ミスである可能性が高い。
- **優先度**: High（ドキュメント上「無敵」と説明されている中核機能が実質機能していない。クラッシュはせずゲーム続行は可能）
- **確信度**: 確認済（コードリーディング、フレーム順序と数式の静的トレース）。実機での効果測定は未実施。

### H4. `InputManager` がウィンドウのフォーカス喪失時にキー状態をクリアせず、キーが「押しっぱなし」のまま固着しうる

- **該当箇所**: [src/game/InputManager.ts](../src/game/InputManager.ts)（全体。`keydown`/`keyup` のみ登録、`blur`/`visibilitychange` のハンドラなし）
- **概要**: Alt+Tab やブラウザ外へのフォーカス移動時、OS/ブラウザはキーを押したまま `keyup` を発火しないことがある。この場合 `this.keys` に該当キーが残り続け、`MovementFeature` 等が継続的にその入力を「押されている」ものとして処理し続ける。プレイヤーが実際にはキーから指を離していても、再度同じキーを押して離すまで移動が止まらない。
- **優先度**: High（明確に再現しうる誤動作。ゲーム続行は可能）
- **確信度**: 確認済（コードリーディング。`blur`/`visibilitychange` ハンドラの不在は `grep` で確認済み）。ブラウザの `keyup` 未発火自体は一般的に知られた挙動だが、本アプリでの実機確認は未実施。

### H5.（要ランタイム検証）`PuzzleFeature.onInit` に多重初期化ガードがなく、スクロール速度の復元値が破損する可能性

- **該当箇所**: [src/game/systems/PuzzleFeature.ts:265-280](../src/game/systems/PuzzleFeature.ts#L265)、比較対象 [src/game/systems/TetrisFeature.ts:366-401](../src/game/systems/TetrisFeature.ts#L366)（同種の問題に対する `firstInit` ガードが既にコメント付きで実装されている）
- **概要**: `sideScroller.updateRules()` は `sys.onManualUpdated?.()` をルール更新のたびに毎回呼び、`PuzzleFeature.onManualUpdated` は単に `this.onInit(world)` を呼ぶ。`onInit` は毎回 `this._state.baseScrollSpeed = world.rules.scrollSpeed` として現在のスクロール速度を「復元用の元の値」として保存するが、`lights_out` フィーチャーが有効な間は `onInit` 内で `world.rules.scrollSpeed = 0` にも設定している。2回目以降に `onInit` が再度呼ばれると、その時点で既に 0 になっているスクロール速度を「元の値」として上書き保存してしまい、後で `onDisable` により `baseScrollSpeed` へ復元しようとした際に速度が 0 のまま固定される可能性がある。`TetrisFeature.ts` は全く同型の問題に対して明示的に「H7」というコメント付きの初回のみガードを実装済みであり、`PuzzleFeature` だけこの対策が漏れている。
- **優先度**: High（再現すれば `distance`/スクロールが永久停止するという重い影響）だが、通常経路では `useGameState.ts` の `_rebuildRules()` が毎回 `scrollSpeed` を作り直すため自己修復される可能性が高く、破損した値が実際に使われるかは Vue のリアクティブ更新タイミングと「矛盾蓄積による glitch エンド強制発動（ジャンル確定後）」という特殊経路が重なった場合に限られる。
- **確信度**: 推測（コードの静的構造としては確認済みだが、実際に破損値が使われる具体的なタイミング競合は実行時検証していない）
- **再現条件（推測）**: puzzle ジャンルに収束後、さらに矛盾カードの蓄積により glitch エンドが強制発動するタイミングが重なった場合

### H6. `JSONGenrePlugin` がデリゲート先の視覚チューニングフィールドを転送しておらず、JSON専用ジャンルの見た目が簡素化される

- **該当箇所**: [src/plugins/JSONGenrePlugin.ts:63-109](../src/plugins/JSONGenrePlugin.ts#L63)（コンストラクタ）、[src/game/sideScroller.ts:813-822](../src/game/sideScroller.ts#L813)（`verticalBackgroundLayers` 参照箇所）
- **概要**: `JSONGenrePlugin` は委譲先プラグインの描画メソッド（`drawFarLayer`等）は転送するが、`parallax` / `verticalBackgroundLayers` / `hazardConfig` / `particleColors` 等のチューニングフィールドは転送していない。例えば `bullet_hell`（縦スクロール、`stg` に視覚委譲）は `verticalBackgroundLayers` が常に `undefined` になるため、`StgPlugin` が持つ宇宙背景の遠景・中景描画（`drawFarLayer`/`drawMidLayer`）が一切呼ばれず、汎用の空グラデーション＋星のみのシンプルな背景にフォールバックする。
- **優先度**: High〜Medium の境界（見た目のみの問題でクラッシュ・スコア影響はないが、「15種TS実装ジャンルと7種JSON専用ジャンルの見た目品質に明確な差」という、タスクで名指しされている観点に該当するため High 寄りとした）
- **確信度**: 確認済（コードリーディング）

---

## Medium

### M1. ジャンル確定後も矛盾蓄積で glitch へ強制上書きされる際、同一 `choose()` 呼び出し内で `_lockGenre` が二重発火しうる

- **該当箇所**: [src/composables/useGameState.ts:223-236](../src/composables/useGameState.ts#L223)
- **概要**: `roundCount >= MAX_ROUNDS` またはベイズ収束による通常ロックと、矛盾スコアによる glitch 強制ロックの判定が同一 `choose()` 内で連続して行われる。両方の条件が同一ラウンドで成立した場合、`_lockGenre` が2回呼ばれ、`accumulatedManualText` に本来のジャンルの `manualReveal` と glitch の `manualReveal` が両方追記され、`soundManager.onGenreLock` も2回発火する。UI上の見た目（`watch` は最終値の glitch のみを見るため）には大きな影響はないが、説明書テキストの重複と効果音の二重再生が発生する。
- **優先度**: Medium
- **確信度**: 確認済（コードリーディング）。狭い入力条件（同一ラウンドで通常ロック条件と矛盾閾値超過が同時発生）が必要なため実機再現は未実施。

### M2. 直近の修正（コミット `47e3fd0`）の副作用で、ジャンル確定後も説明書バージョン表示が `MAX_ROUNDS` を超えて増加し続ける

- **該当箇所**: [src/composables/useGameState.ts:95](../src/composables/useGameState.ts#L95)（`_buildFakeManual` の `version: "${roundCount}/${MAX_ROUNDS}"`)、[src/App.vue:141](../src/App.vue#L141)（`activePlay` に `'genreLocked'` を含める変更）
- **概要**: 直近の修正でジャンル確定後も矛盾蓄積を監視するために `choose()` の呼び出しが継続するようになったが、`roundCount` の増加に上限がないため、ジャンル確定後に選択を続けると `ManualPanel`/`ChoicePanel` に表示されるバージョンが `ver.7/5` のように `MAX_ROUNDS` を超えて表示される。見た目上「壊れているカウンタ」に見え、直近の修正が意図した「壊れて見える挙動の解消」と逆方向のリグレッションになっている。
- **優先度**: Medium（クラッシュ・データ破損はないが、UI表示の不整合。かつ直近修正の隣接領域で発生している点は要注意）
- **確信度**: 確認済（コードリーディング）

### M3. ジャンル・スクロール軸変更時にハザード/アイテム/弾配列がクリアされず、軸切替直後に古い座標系のオブジェクトが一瞬混入する

- **該当箇所**: [src/game/sideScroller.ts:157-205](../src/game/sideScroller.ts#L157)（`updateRules`）
- **概要**: `updateRules()` は `scrollAxis` を `'x'`⇔`'y'` に切り替えうるが、既存の `hazards`/`items`/`_bullets`/`scorePopups` を一切クリアしない。古い軸の座標系で生成されたオブジェクトが新しい軸の座標系として一時的に再解釈されるため、切替直後の1〜数フレームでハザードが不自然にワープ/消失する視覚的な乱れが生じうる。カリング処理により数フレームで解消されるためスコアやクラッシュへの影響は確認できていない。
- **優先度**: Medium
- **確信度**: 確認済（コードリーディング）。視覚的影響のみで実機確認は未実施。

### M4. `SoundManager.playBgm` に非同期 `play()` 呼び出しの世代管理がなく、短時間の連続ジャンル切替でBGMが二重再生されうる

- **該当箇所**: [src/plugins/SoundManager.ts:30-61](../src/plugins/SoundManager.ts#L30)
- **概要**: `playBgm` 呼び出し時、直前の `audio.play()` の Promise が**まだ解決していない**状態で次の `playBgm` が呼ばれた場合、先行呼び出しをキャンセルする手段がない（`_cancelFadeIn` は「フェードインが開始済み」の場合しか効かない）。先行呼び出しの `.then()` が後から解決すると、既にフェードアウト／破棄されているはずの古いAudio要素に対してフェードインを再開してしまう可能性がある。`useGameState.ts` の `_lockGenre` は短時間に2回呼ばれうる（M1参照）ため、理論上発生しうる。
- **優先度**: Medium（音声のみの問題。スコア・進行には影響しない）
- **確信度**: 推測（構造的な欠陥はコードリーディングで確認済みだが、実際のブラウザでの Promise 解決タイミング競合までは検証していない）

### M5. `JSONGenrePlugin` の `TO_DELEGATE_ID` に `glitch`・`stealth` テーマのマッピングが欠落し、`base` に無言でフォールバックする

- **該当箇所**: [src/plugins/JSONGenrePlugin.ts:48-61](../src/plugins/JSONGenrePlugin.ts#L48)
- **概要**: `TO_DELEGATE_ID` は `runner`/`horror` 等は明示的に `'base'` へマッピングしているが、`glitch`（`glitch.json`）と `stealth`（`stealth_action.json`）のテーマは辞書に存在せず、`?? 'base'` のフォールバックで暗黙的に `base` になる。意図的な設計か単なる記載漏れか、コードからは判別できない。結果として「壊れたゲーム」演出の glitch ジャンルと、ステルスアクションジャンルが、専用の `bgColor` を持ちながら見た目上は素の `base` テーマと区別がつかない。
- **優先度**: Medium
- **確信度**: 確認済（コードリーディング。意図的かどうかは不明）

### M6. `EndingPanel.vue` の重複CSSセレクタにより、エンディング画面の矛盾度メタ情報がジャンル別テーマ色を反映せず固定の緑色になる

- **該当箇所**: `src/components/EndingPanel.vue`（`.meta-row`/`.meta-label`/`.meta-value`/`.contradiction-bar` 等が2箇所で定義されており、後方の定義が `var(--genre-*)` を使わないハードコード色で上書きしている）
- **概要**: `.ending-surprise` 系のスタイルおよび `.meta-*` 系のスタイルがそれぞれ2回定義されており、CSSのソース順により後の定義（テーマ変数を使わない固定の緑系配色）が勝つ。結果、エンディング画面のプレイスタイル・矛盾度セクションは常に緑系配色で表示され、ロックされたジャンルのテーマカラーに追従しない。
- **優先度**: Medium（見た目の一貫性の問題。CLAUDE.mdが謳う「ジャンル確定が近づくにつれ見た目がジャンルらしく変化」という方針に反する）
- **確信度**: 確認済（コードリーディング、重複セレクタの直接確認）

### M7. `resolveGenreProgress` が本体から削除済みなのにテストが参照し続けており、`tests/unit/domain` が5件失敗している（CIでは検出されない）

- **該当箇所**: [tests/unit/domain/genreResolver.test.ts:5,171,203,211,217](../tests/unit/domain/genreResolver.test.ts#L5)、[src/domain/genreResolver.ts](../src/domain/genreResolver.ts)（該当関数は存在しない）、[package.json:27](../package.json#L27)（`test:unit:ci` が `tests/unit/domain` を対象外にしている）
- **概要**: `resolveGenreProgress` はコミット `be9f335`（STGジャンル刷新PR #140）で `src/domain/genreResolver.ts` から削除されたが、`tests/unit/domain/genreResolver.test.ts` は依然としてこの関数を `import` して5箇所で呼び出しており、`npm run test:unit`（`vitest run tests/unit`）を実行すると `TypeError: resolveGenreProgress is not a function` で5テストが失敗する。この関数はデバッグパネル用の進捗表示ユーティリティで、`docs/core-systems.md:158` にも仕様が記載されているが、`src/debug/` を含む本番コードのどこからも呼ばれていないため、**削除自体はゲームプレイに影響しない**。
  問題は、`package.json` の `"ci"` スクリプトが呼ぶ `test:unit:ci` は `vitest run tests/unit/engine tests/unit/framework tests/unit/composables` のみを対象としており、`tests/unit/domain` を含んでいない。そのため、このようなAPI削除漏れ／テストの追従漏れが CI では一切検出されない。
  なお `resolveGenre(...)` の呼び出しも一部のテストで実際のシグネチャ（3引数）より多い5引数（`params, GENRES, undefined, undefined, config`）で呼ばれており、3番目の引数が常に `undefined` になるため、意図していたはずのカスタム `config` がテスト内で実際には使われていない（デフォルト設定で評価されている）箇所もある。こちらはテストの信頼性の問題であり、プロダクションコードには影響しない。
- **優先度**: Medium（ゲームプレイへの直接影響はないが、テストスイートの一部が壊れたまま放置されており、かつ CI のディレクトリ指定漏れにより将来的な本物のリグレッションも同様に見逃される構造的リスクがある）
- **確信度**: 確認済（実行確認）。`node node_modules/vitest/dist/cli.js run tests/unit/domain/genreResolver.test.ts` で実際に5件の失敗を確認。`resolveGenreProgress` が本番コードのどこからも呼ばれていないことは `grep` で確認済み。

### M8. 旧来の説明書ツリー（`src/data/manuals/*.json`、`choices[].next` 方式）に到達不能キー・存在しない参照が多数残っており、検証もCIに組み込まれていない

- **該当箇所**: [src/data/manuals/advanced-branch.json](../src/data/manuals/advanced-branch.json)（`11.0-b`〜`11.0-p` の全30選択肢が存在しない `12.0-*` キーを参照）、[src/framework/ManualValidator.ts](../src/framework/ManualValidator.ts)（検証ロジック自体は存在するが `devValidate` は `import.meta.env.PROD` で本番ビルド時は即 return）、[scripts/validate-json.mjs](../scripts/validate-json.mjs)（`src/data/manuals/*.json` に対しては `id`/`entries` の存在確認のみで `next` 参照整合性は検証しない）
- **概要**: 追加した再現テスト `tests/unit/domain/manualDeck-integrity.test.ts` で実データに対して `ManualValidator.validateDeck` を実行したところ、`11.0-b` 〜 `11.0-p`（15エントリ×2選択肢=30件）がすべて存在しない `12.0-*` キーを `next` に指定しているエラーと、`9.0-*`〜`15.0-*` の大部分（CLAUDE.mdが「実装完了」と記す「無限選択肢システム（100+選択肢、ver9.0〜15.0）」のほぼ全域）が `'1.0'` から到達不能という警告が大量に検出された。
  ただし `src/data/manualDeck.ts` 冒頭のコメントで明記されている通り、**現在のゲームロジックが実際に参照するのは `MANUAL_DECK['1.0']` のみ**であり、ラウンドごとの選択肢は `src/data/cards/*.json` のカードプール方式で提供される（`useGameState.ts` の `choose()` は `MANUAL_DECK` の `next` を一切辿らない）。つまりこの `next` グラフはコメント上「後方互換のために残されている」死んだデータであり、**現状のプレイヤー体験には影響しない**。
  とはいえ、(a) 実データにこれだけ多数の壊れた参照が残っていること自体がコンテンツ管理上の問題であり、(b) この整合性チェックは実装済みにもかかわらず本番ビルドでは実行されず、`npm run validate`（CIで実行される）の対象にも含まれていないため、今後 `deck-extension` プラグインの `injection.targetKey` がこれらの壊れたキーを参照した場合や、将来この `next` グラフが再びゲームロジックに組み込まれた場合に、無警告のまま壊れる土台になっている。
- **優先度**: Medium（現状ゲームプレイへの影響はないと判断されるため Critical/High ではなく Medium としたが、コンテンツ量として非常に大きい欠陥データが放置されている点、および検証の仕組みがあるのに機能していない点は看過できない）
- **確信度**: 確認済（実行確認）。追加テストの実行結果として30件のエラーを実際に確認。`MANUAL_DECK['1.0']` 以外が実行時に参照されないことは `useGameState.ts`/`useManual.ts` の全 `MANUAL_DECK` 参照箇所を `grep` して確認済み。

### M9.（第2次調査で新規発見）`src/data/config/*.json` の過半数がフィールド単位の検証を一切受けておらず、C7 のような「定義されているが未実装のフィールド」が `npm run validate` を素通りする

- **該当箇所**: [scripts/validate-json.mjs:17-27](../scripts/validate-json.mjs#L17)（`SCHEMAS` オブジェクト。9ファイルのみ個別の必須キーリストを持ち、他は `walkJson` のループ内で `SCHEMAS[name] ?? ['section']` により `section` キーの存在確認のみ）、[src/framework/ConfigValidator.ts:154-155](../src/framework/ConfigValidator.ts#L154)（`if (import.meta.env?.PROD) return` — 本番ビルドでは検証自体が丸ごとスキップされる）、`tests/` 配下に `ConfigValidator` を参照するテストが存在しない（`grep` で0件）
- **概要**:
  `src/data/config/` には23ファイルあるが、フィールド単位の必須チェックを持つのは `score.json` / `physics.json` / `game_balance.json` / `spawn.json` の4ファイルのみ（`difficulty.json`/`shoot.json`/`throw.json` は `section` キーのみ、`genres.json`/`genre_params.json` はノーチェック）。残る `camera.json` / `background.json` / `hazard_vfx.json` / `ui.json` / `vfx.json` / `boss.json` / `rhythm_tuning.json` / `stealth.json` / `bayes.json` / `special.json` / `puzzle.json` / `extra_movement.json` / `survival.json`（計13ファイル）は `npm run validate`（CIが呼ぶ `npm run ci` に含まれる）から一切フィールド検証を受けない。
  もう一つの検証機構である `ConfigValidator.ts`（`devValidateConfig` 等）はフィールドの型・範囲チェックを持つが、`import.meta.env.PROD` で本番ビルド時は即 return する設計であり、かつこの検証結果を assert するテストが存在しないため、**ローカル開発中に `console.warn`/`console.error` を目視で見逃さない限り誰も検知できない**。
  加えて `schemas/genre.schema.json` / `schemas/cards.schema.json` という JSON Schema ファイル自体は存在し `enum`/`additionalProperties: false` 等の制約を定義しているが、`scripts/` 内に AJV 等のスキーマバリデータを実行する処理は存在しない（`ajv` は依存関係にもない）。`scripts/validate-json.mjs` はこのスキーマファイルから `thresholds` の軸名と `theme` の enum だけを取り出して自前でチェックする独自実装であり、`enableFeatures` の enum 違反や `additionalProperties: false` 違反などスキーマの他の制約は一切検証されない（一例として `glitch.json` の `enableFeatures` に含まれる `"movement"` は `genre.schema.json` の enum に存在しないが、`validate-json.mjs` はこれを検知しない。この特定の事例自体は実害がない —— `movement` は `ruleEngine.ts` が全ジャンルへ自動追加するベース機能であり、二重記載してもエンジン側では単なる no-op であるため）。
  この検証網の隙間が、C7（`stealthCooldownSec` が定義されているのに未実装のまま気づかれず残っていた）や L17（`ui.json` の `beatMarker*` が未使用のまま残っていた）といった個別バグを許容してしまう構造的な原因になっていると考えられる。
- **優先度**: Medium（それ自体はクラッシュやスコア不正を引き起こさないが、他の Critical/Low バグが検証をすり抜けて本番まで残り続ける根本原因であるため、個別バグより一段階上の構造的リスクとして Medium とした）
- **確信度**: 確認済（コードリーディング）。`validate-json.mjs` 全文、`ConfigValidator.ts` の該当箇所、`tests/` 内の `ConfigValidator` 参照有無（grep 0件）をすべて直接確認した。

---

## Low

以下はいずれもクラッシュやスコア不正には直結しないが、コード品質・保守性・将来のバグの温床となりうる項目。

| # | 該当箇所 | 内容 | 確信度 |
|---|---|---|---|
| L1 | ~~[src/components/ChoicePanel.vue:2](../src/components/ChoicePanel.vue#L2)~~ | **[解消済み]** `computed` を import しているが未使用（ESLint警告として検出済み）。第2次調査時点の `origin/main`（コミット `5ec4999`、PR #152）で既に修正済みであることを確認した。`eslint src --ext .ts,.vue` を再実行し警告0件になったことで確認 | 確認済（実行確認、`eslint` 実行結果。第2次調査で解消を確認） |
| L2 | [src/framework/ConfigLoader.ts:60](../src/framework/ConfigLoader.ts#L60) | `genres` セクション重複警告が `console.warn` で常時（本番ビルドでも）出力される。`src/data/config.ts` が意図的に合成セクション `__genres__` を注入する設計だが、警告文言だけでは「意図的な上書き」か「本物のバグ」か判別できず、本番コンソールにノイズとして残る | 確認済（実行確認、テスト実行時のログで毎回出力を確認） |
| L3 | [scripts/preprocess.mjs:56-82](../scripts/preprocess.mjs#L56)（`processGenres`） | `content/genres/*.json` の複数ファイルが同じ `id` を持っていた場合、出力ファイル名が `id` 由来のため後処理されたファイルが前のファイルを警告なしに上書きする（重複IDチェックがない）。現状 `content/genres/` には `_EXAMPLE.json` しかなく実害はないが、将来コンテスト参加者が複数ジャンルを追加する際の落とし穴になりうる | 確認済（コードリーディング）。現状のデータでは未発現 |
| L4 | [src/game/systems/RhythmFeature.ts:72,106](../src/game/systems/RhythmFeature.ts#L72) | ビートマーカーの生存時間 `400` が2箇所にハードコードされ、CLAUDE.mdのマジックナンバー禁止規約に反する。片方だけ変更するとフェードアニメーションが実寿命とズレる（第2次調査でこの値が本来 `ui.json` の `beatMarker*` 系フィールドで一元管理されるべきだったことが判明。詳細は後述 L17） | 確認済（コードリーディング） |
| L5 | [src/game/ParticleSystem.ts:54](../src/game/ParticleSystem.ts#L54) | `clear()` メソッドがデッドコード（呼び出し箇所なし） | 確認済（`grep` によるコードリーディング） |
| L6 | [src/data/config/stealth.json](../src/data/config/stealth.json) | `stealthCooldownSec` / `detectionRange` がスキーマ検証はされるが `SpecialFeature.ts` からは一切参照されない設定項目。**第2次調査で判明**: この `stealthCooldownSec` 未実装こそが Critical C7（stealth_mode のスコア無限増殖）の直接の原因であることが確認できたため、この項目は当初の想定より深刻。詳細・再現条件は C7 を参照 | 確認済（コードリーディング。C7 で実際の実害を確認） |
| L7 | [src/game/sideScroller.ts:1229-1238](../src/game/sideScroller.ts#L1229)（`_weightedRandom`） | `weights` が空配列の場合 `-1` を返し、呼び出し元で `table[-1]` の `undefined` アクセス経由でクラッシュしうる。現行データでは全ジャンルの `spawnTable` が非空のため未到達 | 確認済（コードリーディング）。現状データでは再現しない |
| L8 | [src/game/systems/index.ts](../src/game/systems/index.ts)、`sideScroller.ts` コンストラクタ | `FeatureSystem` はモジュールレベルのシングルトンとして生成され、`new SideScroller()`（リスタート時含む）で明示的な再初期化が呼ばれない。現状は個々のフィーチャーが有効化時に自前でリセットしているため実害はないが、将来デフォルト有効なフィーチャーが状態を持つと問題化しうる | 確認済（コードリーディング） |
| L9 | [src/game/systems/MovementFeature.ts:75-77](../src/game/systems/MovementFeature.ts#L75) | `slide`/`gravity_flip` が未実装スタブ（`console.warn` のみ）。既存ドキュメント（`docs/feature-ids.md` 等）で既知の制約として記載済みで、現状どのジャンルにも割り当てられていないため実害なし | 確認済（コードリーディング＋既存ドキュメントとの突合） |
| L10 | [src/engine/GenrePlugin.ts:79-83,107-112](../src/engine/GenrePlugin.ts#L79) | `playerScale` / `scrollSpeedBonus` フィールドが型定義・ドキュメントコメントとも存在するが、エンジン側の参照箇所が一切ない（デッドAPI）。将来これらを設定しても無反応 | 確認済（`grep` によるコードリーディング） |
| L11 | [src/plugins/JSONGenrePlugin.ts:98-105](../src/plugins/JSONGenrePlugin.ts#L98) | フォールバックカラーがTS内にハードコードされており、`docs/coding-conventions.md` が「悪い例」として明示するアンチパターンと一致する | 確認済（ドキュメントとの文字列一致確認） |
| L12 | [src/plugins/PluginManager.ts:136-169](../src/plugins/PluginManager.ts#L136) | ユーザーインストール型プラグインJSONの `thresholds`/`visual` フィールドが存在確認のみで値の型チェックがなく、`as` キャストで素通しされる | 確認済（コードリーディング）。実際に不正な値を注入した場合の下流影響は未検証 |
| L13 | `src/genres/StgPlugin.ts` と `src/genres/AerialStgPlugin.ts` | HPバー描画・コックピット風HUD装飾のロジックがほぼ同一のまま両ファイルに重複実装されている（共有ヘルパー化されていない） | 確認済（コードリーディング、直接比較） |
| L14 | [src/composables/useManual.ts:62-92](../src/composables/useManual.ts#L62) | `animTimer`/`centerTimer` の `setTimeout` に対して `onUnmounted` によるクリーンアップがない。現状 `useManual` は `App.vue` ルートから一度しか呼ばれずアンマウントされないため実害はないが、同種の問題（`useScoreAnimation` 等）は既に対策済みであり、パターンとして一貫していない | 確認済（コードリーディング） |
| L15 | `CLAUDE.md`（ジャンル分岐システムの節） | ドキュメント上「収束システムは `tempo`/`range`/`enemy`/`combo`/`growth`/`rhythm` の6軸」と説明しているが、実際の `schemas/genre.schema.json` は `stealth`/`vertical`/`aerial`/`survive`/`craft`/`speed` を含む12軸を定義しており、ドキュメントが古い | 確認済（スキーマとの突合） |
| L16 | [src/data/gameBalance.ts:19-27](../src/data/gameBalance.ts#L19)（`_generateUpdateDistances`）、比較対象 [src/data/config/difficulty.json:4](../src/data/config/difficulty.json#L4) | 説明書更新距離の生成ロジックが `1100 + dc.updateDistancesBaseInterval * i` と、`difficulty.json` の `updateDistancesInitial[0]`（現在値 `1100`）と同じ値をソースコード側にもハードコードしている。現在の設定値（`updateDistancesInitial: [1100,2400,3900]`, `updateDistancesBaseInterval: 1500`）で実際に計算すると `...,3900,5600,7100,...` となり、`3900→5600` の間隔だけ `1700` と、他の区間（`1500`/`1300`）から外れた段差が生じる。`updateDistancesInitial[0]` を `difficulty.json` 側だけで変更すると、この場所の値と一致しなくなりさらに不整合な段差が発生する（CLAUDE.mdのマジックナンバー禁止規約にも反する） | 確認済（コードリーディング。現在の設定値で実際に数列を計算し段差を確認） |
| L17 | [src/game/systems/RhythmFeature.ts:72,106-109](../src/game/systems/RhythmFeature.ts#L72)、比較対象 [src/data/config/ui.json:14-18](../src/data/config/ui.json#L14) | L4 の続報。ビートマーカーの寿命(`400`)・不透明度計算・線色(`#ff00ff`)・線幅(`2`)・破線パターン(`[6,4]`)がすべて `RhythmFeature.ts` にハードコードされている。`ui.json` には同じ値の `beatMarkerAlphaDivisor`/`beatMarkerMaxAlpha`/`beatMarkerColor`/`beatMarkerLineW`/`beatMarkerDash` が定義され型定義・`ConfigValidator` でも検証されているが、`RhythmFeature.ts` はこの設定オブジェクト（`UI`）を一切 import していないため、`ui.json` を編集してもビートマーカーの見た目には何の影響もない | 確認済（コードリーディング。ハードコード値と `ui.json` の値が完全一致することを直接比較） |
| L18 | [src/data/config/bayes.json:4,9](../src/data/config/bayes.json#L4)、型定義 [src/framework/config-types.ts:293-299](../src/framework/config-types.ts#L293) | `bayes.json` の `convergenceThreshold`（0.30）と `candidateThreshold`（0.10）が `BayesConfig` 型に存在せず、唯一の消費元である `genreResolver.ts` のどこからも参照されていない。ベイズ収束のハイパーパラメータとして調整しても一切効果を持たないデッドな設定値 | 確認済（コードリーディング。`grep` で両フィールドが `bayes.json` 以外に一切出現しないことを確認） |
| L19 | [scripts/genre-reach-sim.mjs:24-28](../scripts/genre-reach-sim.mjs#L24) | ジャンル到達性シミュレータが、実ゲームの `useGameState.ts` が使う `PARAM_JITTER_RANGE`（`game_balance.json` の `paramJitterRange: 0.4` を参照）と同じ値を `JITTER = 0.4 // useGameState.PARAM_JITTER_RANGE` としてハードコード複製している。すぐ上の2行（`MAX_ROUNDS`/`FALLBACK`）は同じ `game_balance.json` を正しく読み込んでいるにもかかわらず、この値だけ手動転記されており、将来 `paramJitterRange` がチューニングされた際にシミュレータの到達率算出（本レポートの C4 の根拠データ）が実際のゲーム挙動と無警告で乖離する | 確認済（コードリーディング。`useGameState.ts` の実消費箇所と該当行を直接比較） |

---

## 静的解析・自動チェック結果まとめ

初回調査時点（`47e3fd0`）と第2次調査時点（`origin/main` 最新 `cdc0196`、独立 git worktree 上で再実行）の両方の結果を併記する。

| コマンド | 初回（`47e3fd0`） | 第2次（`cdc0196`） |
|---|---|---|
| `vue-tsc --noEmit`（typecheck） | ✅ エラーなし | ✅ エラーなし |
| `eslint src --ext .ts,.vue`（lint） | ⚠️ 警告1件（旧L1） | ✅ **警告0件**（旧L1はPR #152で解消済み） |
| `node scripts/validate-json.mjs`（validate） | ✅ 54 passed, 0 failed | ✅ 54 passed, 0 failed |
| `node scripts/check-doc-links.mjs` | ✅ リンク切れなし | ✅ リンク切れなし |
| `node scripts/run-feature-tests.mjs`（test:features） | ✅ 9/9 passed | ✅ 9/9 passed |
| `vite build` | ✅ ビルド成功（166 modules, JS 390KB / CSS 79KB） | ✅ ビルド成功（166 modules, JS 390KB / CSS 79KB、変化なし） |
| `node scripts/check-bundle-size.mjs` | ✅ 全バジェット内 | ✅ 全バジェット内（JS 381KB/800KB, CSS 77KB/100KB, dist 459KB/1.95MB） |
| `vitest run tests/unit`（test:unit、全体） | ❌ 5 failed / 80 passed | ❌ **変化なし**：5 failed / 80 passed（`tests/unit/domain/genreResolver.test.ts`、M7参照） |
| `vitest run tests/unit/engine tests/unit/framework tests/unit/composables`（test:unit:ci） | ✅ 失敗なし | ✅ 失敗なし（14/14 passed） |
| `node scripts/genre-reach-sim.mjs .`（reach-sim） | ⚠️ `hack_slash`/`tetris` 到達率 0.0% | ⚠️ **ほぼ変化なし**：`hack_slash` 0.1%（3000回中3回）、`tetris` 0.0%、17ジャンルが狙い撃ちでも到達率25%未満（C4参照） |

※ ローカル環境には `vitest`/`eslint` が `node_modules` に未インストールだったため、`npm install` で追加インストールして実行した（`package.json` の `devDependencies` に既存の記載通りのバージョンを取得したのみで、依存関係の変更は行っていない。`node_modules/` は元々 gitignore 対象）。第2次調査では `origin/main` を `git worktree add` で別ディレクトリに checkout し、その worktree に `node_modules` をコピーして全ツールを再実行した（作業ブランチの `node_modules` 自体は変更していない）。

---

## 追加したファイル

- `tests/unit/domain/manualDeck-integrity.test.ts` — M8 の再現用。`ManualValidator` の既存検証ロジックを実データ（`MANUAL_DECK`）に対して実行し、`next` 参照切れ・到達不能エントリを検出するテスト。プロダクションコードの変更は含まない（初回調査で追加、第2次調査でも変更なし）。

---

## 参考: 実行環境について

- ローカルの `node_modules`（gitignore対象）に `vitest`/`eslint` 等が未インストールだったため、調査用に `npm install` を実行して既存の `package-lock.json` 通りに補完した。`package.json` / `package-lock.json` に差分は生じていない（`git status` で未変更を確認済み）。
- 開発サーバー（`vite`）と Playwright（Chromium）は C1 の実機検証のみに使用し、検証終了後に停止・一時ファイルは削除済み。
- 第2次調査: `git worktree add ../MANUAL-OVERRIDE-main-audit origin/main --detach` で `cdc0196` を独立 checkout し、その worktree に対して全静的解析・ビルド・シミュレータを再実行した。worktree は本調査完了後に `git worktree remove` で片付け済み。本作業ブランチ（`fix/critical-high-bugs`）のファイルは一切変更していない。
