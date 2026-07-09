# バグ調査レポート（main 網羅調査）

- 調査対象: `main` ブランチ（コミット `dacac32`、`origin/main` と一致）
- 調査範囲: **プロジェクト全体を網羅** — `src/`（domain / engine / framework / game / systems / genres / plugins / composables / components / tutorial / debug）、`src/data/`（config / genres / cards / manuals）、`scripts/`
- 調査方法: 全ソースのコードリーディング（制御フロー静的トレース）、静的解析（`typecheck` / `validate-json` / `test:features` / `test:unit` / `reach-sim`）、データ整合性の機械的検査（feature ID・スコア変数 producer・カード genreParams/genrePoints の突合）、再現/特性化テストの追加
- 修正は行っていない（調査・レポートのみ。プロダクションコードは未変更。追加は調査用テスト2件のみ）
- 確信度の表記:
  - **確認済（実行確認）**: コマンド実行・テストで再現を確認
  - **確認済（コードリーディング）**: 静的トレードで条件が揃えば確実に発生すると判断
  - **推測**: コードから疑わしいが実行時挙動までは未検証

---

## サマリ

| 優先度 | 件数 | 概要 |
|---|---|---|
| Critical | 0 | — |
| High | 1 | tower_def の kills/combo スコア項が常時 0（ShootFeature 上書き） |
| Medium | 3 | 死にスコア項7ジャンル / 投擲摩擦のフレームレート依存 / キャッシュ退避による更新再発 |
| Low | 6 | マジックナンバー・死にデータ・ユーザープラグインの機能欠落 等 |

静的解析はすべて良好: `typecheck` エラー0 / `validate-json` 55 passed / `test:features` 9/9 / `test:unit` 90/90（本レポート追加テスト込みで 93/93）/ `reach-sim` 全ジャンル到達率 > 0%。

> **先行レポートとの関係**: 旧 `docs/bug-report.md`（旧 main `47e3fd0`）の Critical 4 / High 6 / 主要 Medium は PR #153/#154/#161 で修正済みを確認（末尾の検証表）。本レポートは**現 main で新たに検出した未報告の問題**を扱う。

---

## High

### H-1. `tower_def` ジャンルで `kills` / `combo` スコア項が常時 0（ShootFeature が `enemy_hp` 経由で常駐し毎フレーム上書き）

- **該当箇所**:
  - [src/game/systems/ShootFeature.ts:17](../src/game/systems/ShootFeature.ts#L17)（`handles` に `enemy_hp` を含む）
  - [src/game/systems/ShootFeature.ts:200-216](../src/game/systems/ShootFeature.ts#L200)（`_syncWorldStats` が**無条件**に `world.setKills(s.kills)` / `world.setCombo(s.combo)`）
  - [src/engine/GameRegistry.ts:80-87](../src/engine/GameRegistry.ts#L80)（`getActiveSystems`: handles のいずれか1つが有効ならアクティブ扱い）
  - [src/game/systems/SpecialFeature.ts:224-225](../src/game/systems/SpecialFeature.ts#L224)（tower が `setKills(gameStats.kills + 1)` で加算）
  - [src/data/genres/tower_def.json:6,8](../src/data/genres/tower_def.json#L6)（`enableFeatures: ["tower", "enemy_hp", "item_pickup"]` / `scoreFormula: "kills * 90 + combo * 110 + survivedSec * 8"`）
- **概要**:
  `ShootFeature.handles` は `enemy_hp` を含む。`tower_def` は `shoot` を有効化しないが `enemy_hp` を有効化しているため、`getActiveSystems` が ShootFeature をアクティブ判定し、毎フレーム `update()` が走る。`_fireBullets()` は `shoot` 未有効で早期リターンし弾は出ず、ShootFeature 内部の `kills`/`combo` は 0 のまま。ところが末尾の `_syncWorldStats()` は条件を見ずに `setKills(0)` / `setCombo(0)` を実行する。
  一方 `tower_def` の実撃破は SpecialFeature（tower）が担い `setKills(gameStats.kills + 1)` で加算するが、`tower_def` の feature 順から `getActiveSystems` は `[SpecialFeature, ShootFeature, RpgFeature]` を返すため、同一フレーム内で tower の加算を直後の ShootFeature が 0 に上書きし、`kills`/`combo` は蓄積できない。
  結果、`scoreFormula` の **`kills * 90` と `combo * 110` の2項が常時 0** となり、実質 `survivedSec * 8` のみでスコアが決まる（敵を倒してもスコアに反映されない）。
- **優先度**: **High**。先行レポートは同種の「スコア項常時0」（旧 C2/C3）を Critical に分類していた。本件は影響が `tower_def` 1ジャンルかつスコアのみのため High とするが、Critical と読む余地がある。
- **確信度**: **確認済（実行確認 + コードリーディング）**。再現テスト `tests/unit/game/ShootFeature-enemyHp-clobber.test.ts` で `enemy_hp` のみ有効（`shoot` なし）の World に対し `kills=5,combo=3` が 0 に上書きされることを確認。
- **補足**: `enemy_hp` を有効化しつつ `shoot` を持たないジャンルは全22ジャンル中 `tower_def` のみ（機械的に確認済み）。根本原因は `_syncWorldStats()` が `shoot` の有無を見ずスコア変数を絶対値で上書きしている点。

---

## Medium

### M-1. 7ジャンルの scoreFormula に「構造的に常時 0 の項」が存在する（有効フィーチャーが当該スコア変数を生成しない）

- **該当箇所**: 各 `src/data/genres/*.json` の `scoreFormula` と `enableFeatures`、スコア変数の生成元 [src/game/systems/](../src/game/systems/)（`setKills`/`setCombo`/`addScoreVars*`/`addBeatHit`）
- **概要**:
  各スコア変数は特定フィーチャーが有効なときだけ値が入る（producer）。コード実測での producer は以下:
  - `kills` → `shoot`(ShootFeature) / `survival_melee`(SurvivalFeature) / `tower`(SpecialFeature)
  - `combo` / `maxCombo` → `shoot` / `lights_out`(PuzzleFeature) / `tetris_mode`(TetrisFeature) / `tower`
  - `exp` → `item_pickup`(RpgFeature) / `survival_level`
  - `beatHits` → `beat_hazard`/`just_input`/`beat_dash`(RhythmFeature)
  - `bossKills`→`boss`、`stealthBonus`→`stealth_mode`、`colorTouches`→`color_touch`

  これらを各ジャンルの `enableFeatures` と突合すると、**式に現れるのに producer が1つも有効化されていない項**が以下7ジャンルに存在する（＝その項は常時 0）:

  | ジャンル | scoreFormula | 死に項 | 実効的なスコア |
  |---|---|---|---|
  | `sports` | `combo * 180 + distance * 1.0 + beatHits * 80` | **`combo * 180`** | distance + beatHits のみ |
  | `platformer` | `combo * 150 + distance * 0.8 + survivedSec * 5` | **`combo * 150`** | distance + survivedSec のみ |
  | `rhythm` | `beatHits * 150 + combo * 100 + distance * 0.4` | `combo * 100` | beatHits + distance |
  | `runner` | `distance * 1.2 + survivedSec * 8 + combo * 50` | `combo * 50` | distance + survivedSec |
  | `racing` | `distance * 2.0 + survivedSec * 3 + combo * 30` | `combo * 30` | distance + survivedSec |
  | `rpg` | `exp * 2 + kills * 60 + distance * 0.3` | `kills * 60` | exp + distance |
  | `dungeon` | `exp * 3 + kills * 70 + itemsCollected * 60 + distance * 0.2` | `kills * 70` | exp + items + distance |

  `combo` は `shoot`/`lights_out`/`tetris_mode`/`tower` のいずれも持たないジャンル（platformer/racing/rhythm/runner/sports）で常時 0、`kills` は `shoot`/`survival_melee`/`tower` を持たないジャンル（dungeon/rpg）で常時 0。特に `sports`（combo*180）・`platformer`（combo*150）は**式中で最大の重みを持つ項が死んでいる**ため、スコア設計と実挙動の乖離が大きい。
- **優先度**: **Medium**。クラッシュ・進行不能はなく他項でスコアは成立するが、ジャンルごとの「スコアの主眼」を表す項が機能しておらず、多くのジャンルでスコアが distance/survivedSec に偏る。H-1（tower_def）は producer(tower) を持ちながら ShootFeature に上書きされる別問題として区別（この表には含まない）。
- **確信度**: **確認済（コードリーディング + 実行確認）**。producer 対応は全 systems の `set*`/`addScoreVars*` 呼び出しを実コードで確認。死に項集合は追加テスト `tests/unit/data/genre-score-formula-coverage.test.ts` で固定化（現状集合と一致することを検証、2 passed）。
- **注記**: 設計上「テンプレート式を使い回して一部の項が当該ジャンルに存在しないだけ」という意図の可能性も否定できない。ただし最大重みの項が死んでいる点から、多くは配線漏れ（当該ジャンルに combo/kill 機構を持たせるはずだった、あるいは式から当該項を外すべき）と推測する。

### M-2.（推測）投擲の空気抵抗がフレームレート依存で、投擲スコアが表示リフレッシュレートに左右される

- **該当箇所**: [src/game/throwEngine.ts:68-69](../src/game/throwEngine.ts#L68)（`updateThrow`）
- **概要**:
  `updateThrow` は水平速度に `state.vx *= THROW.airFriction` を**毎フレーム**適用する一方、重力は `state.vy += THROW.gravity * dt` と `dt` でスケールしている。摩擦だけが `dt` 非依存のため、同じ実時間でも高リフレッシュ環境ほど適用回数が増え、`vx` の減衰が速くなる（例: airFriction=0.98 として 1.5 秒飛行時、60fps では `0.98^90≈0.16`、144fps では `0.98^216≈0.013`）。水平到達距離・滞空時間・弧の高さが変わり、`calcThrowScore`（滞空 × 0.5 + 弧 × 0.4 − 速度ペナルティ）の結果が端末依存になる。投擲スコアは最終スコアの30%を占める。
- **優先度**: **Medium**（スコアの再現性・公平性に影響。重力が `dt` スケール済みなのに摩擦だけ未対応という不整合そのものがバグ）
- **確信度**: **推測**（フレームレート依存はコード上明確だが、実機での高リフレッシュ差の定量測定は未実施）

### M-3.（推測）超長時間の1プレイで `updateTriggeredFor` キャッシュ退避により説明書更新プロンプトが再発する

- **該当箇所**: [src/game/sideScroller.ts:247-259](../src/game/sideScroller.ts#L247)（`getSnapshot`）、[src/game/sideScroller.ts:292-301](../src/game/sideScroller.ts#L292)（`markUpdated`）、[src/game/sideScroller.ts:91](../src/game/sideScroller.ts#L91)（`MAX_TRIGGER_CACHE = 256`）、[src/data/config/difficulty.json:6](../src/data/config/difficulty.json#L6)（`updateDistancesCount: 100`）
- **概要**:
  `getSnapshot()` は `UPDATE_DISTANCES.findIndex((d, i) => distance >= d && !updateTriggeredFor.has(i))` で未発火の更新インデックスを探す。実要素は 100 個。`markUpdated()` は `size > 256` で最小インデックスから約半数を一括削除する。無限更新でインデックスが増え続けると実インデックス 0〜99 が退避され、退避後は `findIndex` が再び 0 を拾って**過去の更新ラウンドを再発火**しうる。`App.vue:142` の `activePlay` は `genreLocked` を含むため、カードプールが残っていれば収束後の無限走行中に更新プロンプトが割り込む。
- **優先度**: **Medium**（発生に約256回の更新ラウンド＝距離20〜30万相当の単一プレイが必要で到達性は低い。UX 上の割り込みに留まる）
- **確信度**: **推測**（キャッシュ構造は確認済みだが、再発タイミングは実行時未検証）

---

## Low

| # | 該当箇所 | 内容 | 確信度 |
|---|---|---|---|
| L1 | [src/domain/scoreCalc.ts:126](../src/domain/scoreCalc.ts#L126) | `calcThrowScore` の速度ペナルティ閾値 `800` が数値リテラル直書き（CLAUDE.md マジックナンバー禁止規約違反、config 未経由） | 確認済（コードリーディング） |
| L2 | [src/game/sideScroller.ts:373](../src/game/sideScroller.ts#L373) | LearningSystem 再評価間隔 `this.learningCheckTimer = 1.0` が直書き（初回遅延は定数化済みだが繰返し間隔が未定数化） | 確認済（コードリーディング） |
| L3 | [src/data/manuals/*.json](../src/data/manuals/)、[src/data/manualDeck.ts:60](../src/data/manualDeck.ts#L60) | 旧説明書ツリーに存在しないキーへの `next` 参照が 85 件残存（`advanced-branch.json` は 58 エントリ）。ランタイムは `MANUAL_DECK['1.0']` のみ参照するため**ゲーム影響なし**だが、`import.meta.glob` でバンドルに含まれ、`devValidate(MANUAL_DECK)` が**DEV 起動毎に 85 件のエラーをコンソール出力**する（本物の検証エラーの埋没を招く）。`deck-extension` の `injection.targetKey`（[manualDeck.ts:44](../src/data/manualDeck.ts#L44)）が壊れたキーを指すと無警告で失敗しうる。旧 M8 が未修正 | 確認済（実行確認） |
| L4 | [src/genres/index.ts:76-84](../src/genres/index.ts#L76)、[src/data/genres.ts:13](../src/data/genres.ts#L13) | ユーザーがインストールした `type:'genre'` プラグインは JSONGenrePlugin（描画）としてのみ登録され、`GENRES`（ベイズ収束候補・feature/scoreFormula の供給元）に追加されない。→ **インストールしたジャンルはゲームプレイ上到達不能で、thresholds/enableFeatures/scoreFormula が一切使われない**（描画のみ）。ニッチ機能（PluginLoader） | 確認済（コードリーディング） |
| L5 | [src/framework/ManualLoader.ts:144](../src/framework/ManualLoader.ts#L144) | `_parseEntry` は `runtimeOverrides` がある時 `gravity` を `RULE_DEFAULTS.gravity` へ強制する。これが「全 undefined なら runtimeConfig を省略」（154行）を無効化し、`ruleEngine` の優先順位（`rc?.gravity ?? genreDef?.gravity`）でロック済みジャンルの重力を上書きしうる。現状は死にデータ `action-branch.json` のみが該当し表面化しない | 確認済（コードリーディング） |
| L6 | [src/data/genres/*.json](../src/data/genres/) `disableFeatures` | `grid_stop` / `puzzle_solve` は全ジャンルで `disableFeatures` にのみ出現し、どのコードも handle/enable しない残骸フィーチャーID（無効化は無害な no-op）。データ整理の余地 | 確認済（実行確認） |

（旧 Low の一部、`src/game/systems/MovementFeature.ts:75-77` の `slide`/`gravity_flip` 未実装スタブ（有効化時フレーム毎 `console.warn`、現状どのジャンルも未使用）、`finalizeThrowing` の glitch 上書き時スコア非再計算（[useGameState.ts:281-286](../src/composables/useGameState.ts#L281)、推測）も残存。）

---

## 追加したファイル（調査用・production 非変更）

- `tests/unit/game/ShootFeature-enemyHp-clobber.test.ts` — H-1 の再現。`enemy_hp` のみ有効な World で `ShootFeature.update()` が `kills`/`combo` を 0 に上書きすることを検証。
- `tests/unit/data/genre-score-formula-coverage.test.ts` — M-1 の特性化。全ジャンルの scoreFormula 変数と enableFeatures の producer を突合し、現状の死に項集合（7件）を固定化。将来のジャンル修正/追加で差分検出できる。
- `test:unit` 全体は **93/93 passed**（既存 90 + 追加 3）。

---

## 網羅監査カバレッジ（問題なしを確認した領域）

| 層 | ファイル | 所見 |
|---|---|---|
| domain | genreResolver / ruleEngine / contradictionTracker / LearningSystem / playStyleDetector / scoreCalc | 純粋ロジックは健全。scoreCalc の手書きパーサ・ベイズ収束・矛盾トラッキング・LCS 差分いずれも問題なし |
| engine/framework | GameRegistry / PluginManager / ManualValidator / ConfigValidator / ManualLoader / ManualBuilder | PluginManager の thresholds 型検証（旧L12）修正済み。ConfigValidator に `stealthInvincibleSec` の重複エントリ（無害）。ManualLoader は L5 参照 |
| game/systems | sideScroller / ShootFeature / SurvivalFeature / SpecialFeature / RpgFeature / PuzzleFeature / TetrisFeature / MovementFeature / ParticleSystem / entities | 旧 C2/H2/H3/H5 等は修正済み。衝突対称性・無敵break・stealth無敵・Puzzle/Tetris初期化ガードいずれも対策済み。TetrisFeature は H1〜H9 の修正注記あり。スコア確定は死亡経路（`_die`）・ギブアップ経路（`recalcPlayScore`）双方で scoreFormula 適用を確認 |
| genres | 15 TSプラグイン + JSONフォールバック | 大半は描画のみ。SurvivalPlugin のアイテムドロップ・onGenreLocked 正常。L4 のユーザープラグイン到達性のみ課題 |
| Vue | App.vue / ThrowOverlay / ManualPanel / EndingPanel / ChoicePanel / Hud / GenreRevealOverlay / LoadingScreen / composables | 旧 C1（ローディング）は `@complete` で解消済み。タイマー/リスナーの onUnmounted 後片付け・二重選択ガードいずれも実装済み。M-2 の throwEngine のみ課題 |
| data/scripts | config(21) / genres(22) / cards(51枚) / manuals / preprocess 他 | カードの genreParams 軸・genrePoints 参照は全件妥当。preprocess の重複ID検出（旧L3）修正済み。genre の enableFeatures は全て handle 済み（死に enable なし）。L3/L6 のみ課題 |

---

## 静的解析・自動チェック結果

| コマンド | 結果 |
|---|---|
| `vue-tsc --noEmit`（typecheck） | ✅ エラーなし |
| `node scripts/validate-json.mjs` | ✅ 55 passed, 0 failed |
| `node scripts/run-feature-tests.mjs`（test:features） | ✅ 9/9 passed |
| `vitest run tests/unit`（test:unit 全体） | ✅ 93/93 passed（追加テスト2件含む） |
| `node scripts/genre-reach-sim.mjs .`（reach-sim） | ✅ 全ジャンル到達率 > 0%（最小 bullet_runner 1.1% / tower_def 1.4%） |

※ `eslint` はローカル `node_modules` 未インストールのため未実行。命名規約・`any` 禁止・マジックナンバー等は手動監査（L1/L2）。

---

## 参考: 先行レポート項目の検証結果（すべて修正済みを確認）

| 旧ID | 概要 | 現状 |
|---|---|---|
| C1 | ローディング画面がタイトルを隠す | 修正済（`LoadingScreen @complete` で `isLoading=false`） |
| C2 | Survival: 倒した敵が消えず kills 0 | 修正済（`_onEnemyKilled` が `removeHazardById`/`setKills`） |
| C3 | hack_slash: exp 項が常時 0 | 修正済（`item_pickup` 追加） |
| C4 | hack_slash/tetris 到達率 0.0% | 修正済（閾値調整、reach-sim で >0%） |
| H1 | `onGenreLocked` デッドフック | 修正済（`notifyGenreLocked()` を App.vue:302 から呼出） |
| H2 | 同一フレーム多重ヒットで無敵無効 | 修正済（`if (p.invincible > 0) break`） |
| H3 | stealth_mode 無敵が実質ゼロ | 修正済（`STEALTH.stealthInvincibleSec`） |
| H4 | InputManager フォーカス喪失でキー固着 | 修正済（`blur`/`visibilitychange`） |
| H5 | PuzzleFeature 多重初期化ガード欠如 | 修正済（`_firstInit`） |
| H6 | JSONGenrePlugin 視覚チューニング未転送 | 修正済（委譲先から継承） |
| M1 | `_lockGenre` 二重発火 | 修正済（`!shouldLock` ガード） |
| M2 | 確定後バージョン表示が MAX_ROUNDS 超過 | 修正済（`Math.min`） |
| M3 | 軸切替時にハザード未クリア | 修正済（配列一掃） |
| M5 | glitch/stealth 委譲マッピング欠落 | 修正済（`TO_DELEGATE_ID` 明示） |
| M6 | EndingPanel 重複CSSでテーマ色不追従 | 修正済（コミット `f5800dd`） |
| M7 | テスト5件失敗 + CI対象外 | 修正済（`test:unit:ci = vitest run tests/unit`、全 pass） |
| L12 | PluginManager thresholds 型未検証 | 修正済（number 検証追加） |
| L3(旧) | preprocess の重複ID無警告上書き | 修正済（`seenIds` 検出） |
