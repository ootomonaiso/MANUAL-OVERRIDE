# バグ調査レポート

- 調査対象: `main` ブランチ（調査開始時点で `origin/main` と一致、コミット `47e3fd0`）
- 調査範囲: `src/`, `scripts/`, `schemas/`, 設定JSON群（`src/data/config/*.json` 等）
- 調査方法: 静的解析（`typecheck` / `lint` / `test:unit` / `validate` / `test:features` / `build` / `bundle-size` / `check-doc-links`）、プロジェクト付属のジャンル到達性シミュレータ（`npm run reach-sim`）、コードリーディング、一部は Playwright による実機（Chromium）動作確認、再現用ユニットテストの追加
- 修正は行っていない（調査・レポートのみ）
- 本レポート内の「確信度」表記の意味:
  - **確認済（実行確認）**: 実際にコマンド実行・ブラウザ操作で再現を確認した
  - **確認済（コードリーディング）**: コードの静的なトレースにより、条件が揃えば確実に発生すると判断できる
  - **推測**: コードから疑わしいが、実行時の挙動までは検証できていない

---

## サマリ

| 優先度 | 件数 |
|---|---|
| Critical | 4 |
| High | 6 |
| Medium | 8 |
| Low | 15 |

静的解析の結果: `typecheck` は問題なし、`lint` は警告1件のみ、`validate` / `check-doc-links` / `test:features` / `build` / `bundle-size` はすべて成功。一方で `test:unit`（`vitest run tests/unit`）は既存の `tests/unit/domain/genreResolver.test.ts` で **5件失敗**しており、CI の `test:unit:ci` はこのディレクトリを対象から除外しているため見逃されていた（詳細は Medium M7）。

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

---

## Low

以下はいずれもクラッシュやスコア不正には直結しないが、コード品質・保守性・将来のバグの温床となりうる項目。

| # | 該当箇所 | 内容 | 確信度 |
|---|---|---|---|
| L1 | [src/components/ChoicePanel.vue:2](../src/components/ChoicePanel.vue#L2) | `computed` を import しているが未使用（ESLint警告として検出済み） | 確認済（実行確認、`eslint` 実行結果） |
| L2 | [src/framework/ConfigLoader.ts:60](../src/framework/ConfigLoader.ts#L60) | `genres` セクション重複警告が `console.warn` で常時（本番ビルドでも）出力される。`src/data/config.ts` が意図的に合成セクション `__genres__` を注入する設計だが、警告文言だけでは「意図的な上書き」か「本物のバグ」か判別できず、本番コンソールにノイズとして残る | 確認済（実行確認、テスト実行時のログで毎回出力を確認） |
| L3 | [scripts/preprocess.mjs:56-82](../scripts/preprocess.mjs#L56)（`processGenres`） | `content/genres/*.json` の複数ファイルが同じ `id` を持っていた場合、出力ファイル名が `id` 由来のため後処理されたファイルが前のファイルを警告なしに上書きする（重複IDチェックがない）。現状 `content/genres/` には `_EXAMPLE.json` しかなく実害はないが、将来コンテスト参加者が複数ジャンルを追加する際の落とし穴になりうる | 確認済（コードリーディング）。現状のデータでは未発現 |
| L4 | [src/game/systems/RhythmFeature.ts:72,106](../src/game/systems/RhythmFeature.ts#L72) | ビートマーカーの生存時間 `400` が2箇所にハードコードされ、CLAUDE.mdのマジックナンバー禁止規約に反する。片方だけ変更するとフェードアニメーションが実寿命とズレる | 確認済（コードリーディング） |
| L5 | [src/game/ParticleSystem.ts:54](../src/game/ParticleSystem.ts#L54) | `clear()` メソッドがデッドコード（呼び出し箇所なし） | 確認済（`grep` によるコードリーディング） |
| L6 | [src/data/config/stealth.json](../src/data/config/stealth.json) | `stealthCooldownSec` / `detectionRange` がスキーマ検証はされるが `SpecialFeature.ts` からは一切参照されない設定項目 | 確認済（コードリーディング） |
| L7 | [src/game/sideScroller.ts:1229-1238](../src/game/sideScroller.ts#L1229)（`_weightedRandom`） | `weights` が空配列の場合 `-1` を返し、呼び出し元で `table[-1]` の `undefined` アクセス経由でクラッシュしうる。現行データでは全ジャンルの `spawnTable` が非空のため未到達 | 確認済（コードリーディング）。現状データでは再現しない |
| L8 | [src/game/systems/index.ts](../src/game/systems/index.ts)、`sideScroller.ts` コンストラクタ | `FeatureSystem` はモジュールレベルのシングルトンとして生成され、`new SideScroller()`（リスタート時含む）で明示的な再初期化が呼ばれない。現状は個々のフィーチャーが有効化時に自前でリセットしているため実害はないが、将来デフォルト有効なフィーチャーが状態を持つと問題化しうる | 確認済（コードリーディング） |
| L9 | [src/game/systems/MovementFeature.ts:75-77](../src/game/systems/MovementFeature.ts#L75) | `slide`/`gravity_flip` が未実装スタブ（`console.warn` のみ）。既存ドキュメント（`docs/feature-ids.md` 等）で既知の制約として記載済みで、現状どのジャンルにも割り当てられていないため実害なし | 確認済（コードリーディング＋既存ドキュメントとの突合） |
| L10 | [src/engine/GenrePlugin.ts:79-83,107-112](../src/engine/GenrePlugin.ts#L79) | `playerScale` / `scrollSpeedBonus` フィールドが型定義・ドキュメントコメントとも存在するが、エンジン側の参照箇所が一切ない（デッドAPI）。将来これらを設定しても無反応 | 確認済（`grep` によるコードリーディング） |
| L11 | [src/plugins/JSONGenrePlugin.ts:98-105](../src/plugins/JSONGenrePlugin.ts#L98) | フォールバックカラーがTS内にハードコードされており、`docs/coding-conventions.md` が「悪い例」として明示するアンチパターンと一致する | 確認済（ドキュメントとの文字列一致確認） |
| L12 | [src/plugins/PluginManager.ts:136-169](../src/plugins/PluginManager.ts#L136) | ユーザーインストール型プラグインJSONの `thresholds`/`visual` フィールドが存在確認のみで値の型チェックがなく、`as` キャストで素通しされる | 確認済（コードリーディング）。実際に不正な値を注入した場合の下流影響は未検証 |
| L13 | `src/genres/StgPlugin.ts` と `src/genres/AerialStgPlugin.ts` | HPバー描画・コックピット風HUD装飾のロジックがほぼ同一のまま両ファイルに重複実装されている（共有ヘルパー化されていない） | 確認済（コードリーディング、直接比較） |
| L14 | [src/composables/useManual.ts:62-92](../src/composables/useManual.ts#L62) | `animTimer`/`centerTimer` の `setTimeout` に対して `onUnmounted` によるクリーンアップがない。現状 `useManual` は `App.vue` ルートから一度しか呼ばれずアンマウントされないため実害はないが、同種の問題（`useScoreAnimation` 等）は既に対策済みであり、パターンとして一貫していない | 確認済（コードリーディング） |
| L15 | `CLAUDE.md`（ジャンル分岐システムの節） | ドキュメント上「収束システムは `tempo`/`range`/`enemy`/`combo`/`growth`/`rhythm` の6軸」と説明しているが、実際の `schemas/genre.schema.json` は `stealth`/`vertical`/`aerial`/`survive`/`craft`/`speed` を含む12軸を定義しており、ドキュメントが古い | 確認済（スキーマとの突合） |

---

## 静的解析・自動チェック結果まとめ

| コマンド | 結果 |
|---|---|
| `vue-tsc --noEmit`（typecheck） | ✅ エラーなし |
| `eslint src --ext .ts,.vue`（lint） | ⚠️ 警告1件（L1参照）、エラー0件 |
| `node scripts/validate-json.mjs`（validate） | ✅ 54 passed, 0 failed |
| `node scripts/check-doc-links.mjs` | ✅ リンク切れなし |
| `node scripts/run-feature-tests.mjs`（test:features） | ✅ 9/9 passed |
| `vite build` | ✅ ビルド成功（166 modules, JS 390KB / CSS 79KB） |
| `node scripts/check-bundle-size.mjs` | ✅ 全バジェット内（JS 381KB/800KB, CSS 77KB/100KB, dist 459KB/1.95MB） |
| `vitest run tests/unit`（test:unit、全体） | ❌ **5 failed** / 80 passed（`tests/unit/domain/genreResolver.test.ts`、M7参照） |
| `vitest run tests/unit/engine tests/unit/framework tests/unit/composables`（test:unit:ci、CIが実際に使う範囲） | ✅ 該当ディレクトリのみなら失敗なし（ただし M7 の通り `domain`/`game`/`data` 等を除外しているため見逃しが起きている） |
| `node scripts/genre-reach-sim.mjs .`（reach-sim） | ⚠️ `hack_slash`/`tetris` 到達率 0.0%（C4参照）、17ジャンルが狙い撃ちでも到達率25%未満 |

※ ローカル環境には `vitest`/`eslint` が `node_modules` に未インストールだったため、`npm install` で追加インストールして実行した（`package.json` の `devDependencies` に既存の記載通りのバージョンを取得したのみで、依存関係の変更は行っていない。`node_modules/` は元々 gitignore 対象）。

---

## 追加したファイル

- `tests/unit/domain/manualDeck-integrity.test.ts` — M8 の再現用。`ManualValidator` の既存検証ロジックを実データ（`MANUAL_DECK`）に対して実行し、`next` 参照切れ・到達不能エントリを検出するテスト。プロダクションコードの変更は含まない。

---

## 参考: 実行環境について

- ローカルの `node_modules`（gitignore対象）に `vitest`/`eslint` 等が未インストールだったため、調査用に `npm install` を実行して既存の `package-lock.json` 通りに補完した。`package.json` / `package-lock.json` に差分は生じていない（`git status` で未変更を確認済み）。
- 開発サーバー（`vite`）と Playwright（Chromium）は C1 の実機検証のみに使用し、検証終了後に停止・一時ファイルは削除済み。
