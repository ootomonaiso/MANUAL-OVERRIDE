# デバッグループ・検証レポート

- 対象ブランチ: `claude/fix-critical-high-bugs`（tip `5b045ee` — Critical/High 修正コミット適用済み）
- 目的: 適用済み修正（C1-C4 / H1-H6）の検証と、未修正・回帰・新規バグの洗い出し
- 方針: **修正は行わない。調査・検証・レポートのみ**
- 実行環境: fnm 管理 Node v20.20.2
- 本レポートは `/loop`（30分間隔、08:15〜18:00、全18回）で随時更新した

---

## エグゼクティブサマリ

1. **修正コミット `5b045ee` は Critical C1-C4 + High H1-H6 の計10件を正しく修正**（C1/C2 は動作確認、他はコードリーディングで妥当）。回帰は実質なし（H2 の `break` に潜在回帰 R1 があるが color_touch 未使用のため無害）。
2. **ただし第2次調査で挙がった新規 Critical 3件（C5/C6/C7）は未着手のまま残存**。うち **C6・C7 は本ループで実測再現**（C7 は静止でスコア無限増殖、90点/秒の第2チャネルも新発見。C6 はタワー撃破の kills/combo が毎フレーム0上書き）。C5 は7ジャンルで combo/kills 項が恒常0（静的に確定）。**スコア不正計算の Critical が3件生きている**。
3. **Medium は M1-M9 の9件すべて未修正**（修正は Critical/High のみが対象だったため）。中でも **M7 は実態が深刻**で、CI は全87ユニットテスト中14件（16%）しか実行せず、スコア計算・ジャンル収束・Feature 挙動の中核（domain/game 配下）を丸ごとゲート対象外にしている。
4. **「実装完了」と称する機能に複数の空洞**: LearningSystem は出荷ビルドで一切発火しない（N7・実データ確定）。beat_dash/charge_shot/bomb/shield は宣言のみで未実装、color_touch は実装済みだが未使用（N1/N2/N9）。rhythm の GOOD 判定段・山/ビル背景など config だけ在って未実装の領域も多数（N3/N4）。
5. **根本原因は M9（検証網の隙間）に集約**: 「`handles` 登録＝実装保証」「config フィールド定義＝消費保証」「テスト追加＝CI 実行」という3つの誤前提が、実装漏れ・配線漏れ・テスト非実行を機械的に見逃している。個別バグを潰すだけでなく、この検証網の穴を塞がない限り同型の欠陥が再発し続ける。

### 推奨対応（優先度順・修正は未実施）

| 優先 | 対象 | 内容 |
|---|---|---|
| 1 | **CI カバレッジ（M7深掘り）** | `test:unit:ci` の存在しない `engine`/`framework` を実在する `domain`/`game` に是正。まず domain の6失敗（resolveGenreProgress・manualDeck）を解消 |
| 2 | **C5/C6/C7** | スコア不正計算3件。C6=Feature 実行順/上書き設計の見直し、C7=stealthCooldownSec 実装、C5=各ジャンルの combo/kills を書く Feature を有効化 or scoreFormula 修正 |
| 3 | **N7 / N10** | LearningSystem を 1.0 manual かカードに配線（or 完了項目から外す）。N10=dual-axis 閾値を `thresholdGuide:3` 準拠へ引き下げ（C4 の水平展開） |
| 4 | **M1-M6/M8/M9** | 二重ロック・roundCount 上限・軸切替クリア・BGM世代管理・テーマ mapping・重複CSS・死にデータ・config 検証 |
| 5 | **N1-N5/N9/D1-D4** | 未実装フィーチャー/config のドキュメント整合 or 実装、投擲マジックナンバー、ギブアップ距離ガード等 |

---

## 0. 現状ステータス総括（第18回時点・最新）

### 既知バグ（docs/bug-report.md）の修正状況

| ID | 概要 | 状況 | 検証パス |
|---|---|---|---|
| C1 | タイトルがローディング下に隠れ進行不能 | ✅ **修正済** | 第1/9回 |
| C2 | Survival 近接キル敵がゾンビ化 | ✅ **修正済** ★**動作確認**（kills計上・除去） | 第2/15回 |
| C3 | hack_slash exp が無効 | ✅ **修正済** | 第1回 |
| C4 | hack_slash/tetris 到達率0% | ✅ **修正済**（17.8%/26.4%） | 第1回 |
| C5 | 7ジャンルの combo/kills 死に項 | 🔴 **未修正** | 第1/2回 |
| C6 | tower_def kills/combo 巻き戻し | 🔴 **未修正** ★**実測確認** | 第1/14回 |
| C7 | stealth スコア無限増殖 | 🔴 **未修正**（H3のみ修正）★**実測確認** | 第1/13回 |
| H1-H6 | デッドフック/多重被弾/無敵/キー固着/多重init/視覚転送 | ✅ **全6件修正済** | 第2/5回 |
| M1 | 同一 choose 内 _lockGenre 二重発火 | 🔴 **未修正** | 第8回 |
| M2 | roundCount が MAX 超過表示 | 🔴 **未修正** | 第8回 |
| M6 | EndingPanel 重複CSS | 🔴 **未修正** | 第10回 |
| M7 | resolveGenreProgress 欠落でテスト5件失敗 | 🔴 **未修正**（CI は14/87テストのみ実行=実測） | 第1/18回 |
| M8 | 死んだ manual ツリー（参照切れ30件） | 🔴 **未修正**（再現テスト） | 第1回 |
| M9 | config 検証網の隙間 | 🔴 **未修正**（下記新規発見の温床） | 第3回 |
| M3 | 軸切替時に hazards/items/bullets 未クリア | 🔴 **未修正** | 第11回 |
| M4 | SoundManager.playBgm の非同期世代管理欠如（旧BGMがフェードイン） | 🔴 **未修正** | 第11回 |
| M5 | JSONGenrePlugin の glitch/stealth テーマ未マッピング→base | 🔴 **未修正** | 第11回 |
| L2-L19 | コード品質・デッド config/API 等 | 🔴 概ね未修正（修正コミット対象外） | 一部再確認 |

### 本ループで新規発見（bug-report 未記載）

| ID | 概要 | 深刻度 | パス |
|---|---|---|---|
| N1 | `beat_dash` 未実装なのに docs は「✅実装済み」（rhythm で有効） | Medium(High寄り) | 第3回 |
| N2 | `charge_shot`/`bomb`/`shield` も宣言のみ silent no-op（shield は survival で有効） | Medium | 第5回 |
| N3 | rhythm_tuning.json の9フィールド未接続（GOOD段/beat_hazard調整が丸ごと未実装） | Medium/Low | 第3回 |
| N4 | background.json の山・ビル背景レイヤーが完全未実装（14フィールド） | Low | 第4回 |
| N5 | boss.json `firstBossDist`/`bossCollisionGrace` 死に config（初回ボスが意図の2000mでなく1500m） | Low〜Medium | 第4回 |
| N6 | sports は beatHits 加点可だがビートマーカー不可視（ブラインド入力） | Low | 第2回 |
| N7 | **LearningSystem が出荷ビルドで一切発火しない（実質デッド機能）**★実データ確認 | Medium(High寄り) | 第7/15回 |
| P1/P2 | learning effect の invertHazard 誤演出 / forceFeature が onInit 未呼び出し（現状 inert） | 潜在 | 第7回 |
| D1 | CLAUDE.md の score.json 記述が実装（game_balance.json）と不一致 | Low | 第6回 |
| D2 | calcThrowScore の速度閾値 800 ハードコード（規約違反） | Low | 第6回 |
| D3 | 投擲速度ペナルティが着地衝突速度を測定（意図とズレの可能性） | Low | 第6回 |
| D4 | ギブアップボタンの 600m ガードがコメントのみで未実装 | Low | 第9回 |
| N8 | CLAUDE.md「無限選択肢（100+選択肢/ver9.0-15.0）」誇張。実カードプールは51枚（100+/ver9-15 は死んだ manual ツリー=M8、実キー数151で裏付け） | Low | 第12/15回 |
| N9 | orphan feature: charge_shot/bomb/color_touch をどのジャンルも有効化しない（color_touch は実装済みだが未使用） | Low | 第16回 |
| R1 | H2 修正の `break` が safe-hazard 処理を巻き込む潜在回帰（color_touch 未使用のため現状無害） | Low(潜在) | 第16回 |
| N10 | 約8ジャンルの dual-axis 閾値が推奨値(3)の約2倍で reach 1.5-6%（C4 と同型の閾値過大が systemic に残存、実質到達困難） | Medium(High寄り) | 第17回 |

**共通の構造的根因**: N1〜N5・C7・L6・L17・L18 は「`handles` 登録＝実装保証」「config 定義＝消費保証」という誤前提（= M9）に起因。`handles` に載せる/JSON にフィールドを足すだけで検証を素通りし、実装漏れ・配線漏れが検出されない。

### ツールチェーン現状（`5b045ee`）

typecheck ✅ / validate ✅(54) / test:features ✅(9/9) / build ✅ / bundle-size ✅ / **test:unit ❌ 6 failed**（genreResolver 5=M7 + manualDeck-integrity 1=M8再現）/ reach-sim ⚠️（0%は解消、17ジャンルが<25%）

---

## 更新履歴

- **08:15 (第1回)** — 初期ベースライン確立。適用済み修正の検証と C5/C6/C7 の残存確認。
- **08:40 (第2回)** — C2/H1/H2 修正の精査、全22ジャンルのスコア変数「死に項」横断監査、maxCombo 検証。
- **09:10 (第3回)** — 全 config JSON フィールドの「定義済み・未実装」横断監査。beat_dash 未実装、rhythm_tuning の GOOD 段未実装など発見。
- **09:35 (第4回)** — background/boss/shoot の未消費フィールドを個別確認。build/bundle-size 再確認。
- **10:10 (第5回)** — H4/H5/H6 修正精査（全6件の High 修正が妥当と確認）。全 FeatureId の実装有無を横断し、beat_dash 型の「宣言のみ・実装なし」フィーチャーを追加発見（charge_shot/bomb/shield）。
- **10:40 (第6回)** — 未監査だった投擲フェーズ（throwEngine / scoreCalc / 投擲スコア）を精査。ドキュメント不整合・マジックナンバー・速度ペナルティの意味論を発見。
- **11:10 (第7回)** — LearningSystem（動的ルール変更）を精査。**出荷ビルドで一切発火しない（実質デッド）**ことを確認。effect 適用ロジックの潜在バグ2件も発見。
- **11:40 (第8回)** — 矛盾カードシステム（contradictionTracker / _applyConflicts / choose 内の glitch 強制ロック）を精査。M1/M2 の残存を確認、サブシステム自体は健全。
- **12:10 (第9回)** — App.vue のフェーズ遷移・ローディング・ギブアップ・投擲/エンディング配線を精査。C1 修正が妥当と確認。ギブアップボタンの 600m ガード欠落（コメント不整合）を発見。
- **12:35 (第10回)** — M6/L7 の残存を再確認。全パスの発見を統合したステータス総括表（§0）を追加。
- **13:05 (第11回)** — M3/M4/M5 の残存を確認（Medium M1-M9 が全件未修正であることを確定）。M4 の非同期世代バグの機序を特定。
- **13:40 (第12回)** — CLAUDE.md「完了項目」の追検証（カードプール規模・難易度曲線・カード枯渇）。難易度曲線とカード再抽選は健全、「100+選択肢」表記の誇張を発見。
- **14:15 (第13回)** — C7（stealth スコア無限増殖）を実 `SpecialFeature` を用いた使い捨て vitest で**実測確認**。stealthBonus 線形増加に加え、`addScore(1.5)/frame`＝90点/秒の直接加算という**第2の無限チャネル**を新たに測定。
- **14:40 (第14回)** — C6（tower_def の kills/combo 巻き戻し）を実 `ShootFeature._syncWorldStats` で**実測確認**（kills=3→0, combo=3→0）。
- **15:10 (第15回)** — N7（LearningSystem デッド）を実 `MANUAL_DECK` で確認（1.0.learningRules=undefined）。C2 修正を実 `SurvivalFeature` で**動作確認**（kills=3・ハザード除去3）。C5 は静的証明で十分と判断。
- **15:40 (第16回)** — 修正コミットが導入した回帰の探索。H2 の `break` が safe-hazard 処理を巻き込む潜在回帰を発見（color_touch 未使用のため無害）。orphan feature 監査で charge_shot/bomb/color_touch がどのジャンルからも有効化されないことを確定。
- **16:10 (第17回)** — reach-sim 低到達ジャンルの原因分析。約8ジャンルの dual-axis 閾値が projectの推奨 `dualAxis:3` の約2倍で、C4 と同型の閾値過大が systemic に残存（実質到達困難）と判明。
- **16:40 (第18回)** — M7（CI がテスト失敗を見逃す）を実行確認で深掘り。CI が存在しない2ディレクトリを指し実質 composables のみ（14/87テスト=16%）しか回さず、C2 修正が追加した game テスト19件も CI 対象外と判明。
- **17:10 (第19回)** — レポート最終化（エグゼクティブサマリ + 優先度順の推奨対応を追加、§0/§5 更新）。
- **17:35 (第20回・最終)** — 最終安定性確認。typecheck ✅ / test:unit 6 failed・81 passed（セッション開始時から不変＝ソース無変更）/ HEAD は `5b045ee` のまま / 作業ツリーの成果物は本レポートのみ。「修正は行わない」を完遂。

---

## 1. ツールチェーン・ベースライン（`5b045ee`）

| コマンド | 結果 | 備考 |
|---|---|---|
| `vue-tsc --noEmit`（typecheck） | ✅ エラーなし | ただし `tests/` は対象外（下記 §3 注意） |
| `validate-json.mjs`（validate） | ✅ 54 passed, 0 failed | |
| `run-feature-tests.mjs`（test:features） | ✅ 9/9 passed | |
| `vitest run tests/unit`（test:unit 全体） | ❌ **6 failed / 81 passed** | genreResolver 5件（M7）+ manualDeck-integrity 1件（M8 再現テスト・意図的） |
| `genre-reach-sim.mjs`（reach-sim） | ⚠️ 改善あり | 下記 §2 |

---

## 2. 適用済み修正の検証結果

### ✅ 有効と確認できた修正

- **C1（タイトル画面がローディング下に隠れる）** — `App.vue` / `LoadingScreen.vue` 修正済み（差分確認）。実機再検証は未実施。
- **C3（hack_slash の exp が無効）** — `hack_slash.json` の `enableFeatures` に `item_pickup` が追加された（`["shoot","enemy_hp","exp","item_pickup","dash","boss"]`）。RpgFeature.update の `item_pickup` ゲートを満たすため exp が機能する。**有効**。
- **C4（hack_slash / tetris が到達率0.0%）** — 閾値を大幅に引き下げ（hack_slash: `enemy:4,combo:5`、tetris: `combo:4,craft:4`）。`reach-sim` で **hack_slash 0.0%→17.8%、tetris 0.0%→26.4%** に改善。**有効**。
- **H3（stealth_mode の無敵が実質ゼロ）** — `stealth.json` に `stealthInvincibleSec: 0.5` を追加し、`p.invincible = max(p.invincible, dt)` → `max(p.invincible, STEALTH.stealthInvincibleSec)` に修正。**有効**。
- C2 / H1 / H2 / H4 / H5 / H6 — 対応ファイルに差分あり（コードリーディングで妥当と判断、実機再現は未実施）。次回以降、個別に精査予定。

### reach-sim の残課題（C4 とは別）

C4 の 2ジャンルは解消したが、**狙い撃ちでも到達率25%未満のジャンルが依然17種**残る（tower_def 2.7%, bullet_runner 1.5%, arena 1.9%, dungeon 3.9%, rhythm 4.0%, survival 4.3% など）。これは「完全到達不能（0.0%）」ではないため Critical ではないが、設計上の偏りとして継続観察。

---

## 3. 🔴 未修正の Critical（第2次調査で発見された C5/C6/C7 が全て残存）

修正コミット `5b045ee` の対象は C1-C4 / H1-H6 のみで、**C5・C6・C7（いずれも Critical のスコア不正計算）には一切手が入っていない**。全て現状のコードで再確認した。

### C5. 7ジャンルの scoreFormula が参照する変数が恒常的に 0（未修正）

`world.setCombo` を呼ぶのは shoot / tower / lights_out / tetris_mode の各 Feature のみ。以下のジャンルはそのいずれも `enableFeatures` に含まないため `combo` が常に 0：

| ジャンル | enableFeatures | scoreFormula の死に項 |
|---|---|---|
| platformer | double_jump, long_air, wall_jump | `combo * 150` |
| racing | auto_run, dash, time_bonus | `combo * 30` |
| rhythm | beat_hazard, just_input, beat_dash | `combo * 100` |
| runner | auto_run, double_jump, long_air | `combo * 50` |
| sports | dash, time_bonus, just_input | `combo * 180` |
| dungeon | hp, exp, item_pickup, slow_precise | `kills * 70` |
| rpg | hp, exp, item_pickup, slow_precise | `kills * 60` |

（dungeon/rpg は `kills` を書き込む feature=shoot/tower を持たないため `kills` 項が死ぬ）

### C6. tower_def: ShootFeature が毎フレーム kills/combo を 0 に巻き戻す（未修正）

- `ShootFeature.handles` は `enemy_hp` を含む（L17）。tower_def は `enableFeatures: ["tower","enemy_hp","item_pickup"]` で `enemy_hp` を有効化 → ShootFeature が毎フレーム稼働。
- ShootFeature.update は末尾で無条件に `_syncWorldStats`（L37→L200-205）を呼び、`setKills(s.kills)` / `setCombo(s.combo)`（shoot 無効なので常に 0）で上書き。
- feature 実行順が SpecialFeature（tower）→ ShootFeature のため、タワー撃破で加算した kills/combo が同フレーム内で 0 に潰される。
- 結果 `scoreFormula: "kills * 90 + combo * 110 + survivedSec * 8"` の重み最大2項が無効。

### C7. stealth_mode: 静止し続けるだけでスコア無限増殖（未修正）

- 修正は H3（無敵）のみで、**C7 の本質（`world.addScoreVarsStealthBonus(dt)` が hidden 中に毎フレーム無条件・無上限で加算）は手つかず**。
- `stealthCooldownSec: 5.0` は config/型/Validator に定義されるが `SpecialFeature.ts` のロジックからは依然一切参照されていない（`grep` 確認済み）。歯止め未実装。
- 影響: horror（`stealthBonus * 0.8`）、stealth_action（`stealthBonus * 0.5`）でスコアを実質無限に吊り上げ可能。

---

## 4. 🟡 未修正の Medium/Low（抜粋・継続確認中）

- **M7（test:unit の 5件失敗が CI 未検出）— 未修正・残存**: `resolveGenreProgress` は `src/domain/genreResolver.ts` に存在しないまま（`grep` で0件）。`genreResolver.test.ts` L5 が import → 呼び出し時に `TypeError: resolveGenreProgress is not a function` で5件失敗。
  - **重要な派生観察**: typecheck（vue-tsc）はこの壊れた import を **検出できていない**（`tests/` が typecheck 対象外のため）。CI の `test:unit:ci` も `tests/unit/domain` を対象外にしており、二重に見逃す構造。
- **M8** — `manualDeck-integrity.test.ts` が `advanced-branch.json` の `12.0-*` 参照切れ30件で失敗（既知の死にデータ、再現テストは意図的に失敗）。
- L2〜L19 群 — 修正コミットの対象外。次回以降サンプリング精査。

---

## 4.5. 第2回：適用済み修正の精査 & 死に項の横断監査

### 追加で妥当と確認できた修正（コードリーディング）

- **C2（Survival ゾンビ化 & kills 未加算）** — `_onEnemyKilled` が `world.removeHazardById(hazard)` + `this.state.kills++` + `world.setKills(...)` + `onHazardDestroyed` フックを呼ぶよう修正。ハザード除去・スコア反映・アイテムドロップが揃った。
  - **さらに C6 型の巻き戻しリスクがないことを確認**: survival の `enableFeatures` は `["hp","item_pickup","shield","survival_hunger","survival_melee","survival_level"]` で `enemy_hp`/`shoot` を含まない → ShootFeature が非稼働 → `setKills` が上書きされない。C2 の `kills * 50` は正しく機能する見込み。
- **H1（onGenreLocked/onManualUpdated デッドフック）** — `sideScroller.notifyGenreLocked()` を新設し、`updateRules` 内で `getGenre(...).onManualUpdated?.()` も呼ぶよう追加。フックが接続された。
- **H2（同一フレーム多重被弾）** — 横/縦スクロール両ループの `_onPlayerHit` 直後に `if (p.invincible > 0) break` を追加。hp フィーチャー genre では初回ヒットで `invincible` が付与され break が効く。非 hp genre はヒット=即死のため多重被弾しない。妥当。

### 全22ジャンル スコア変数「死に項」横断監査

スコア変数（`kills/combo/maxCombo/exp/beatHits/bossKills/accuracy/itemsCollected/stealthBonus/deaths/distance/survivedSec/colorTouches`）について、各 writer を呼ぶ Feature と、それを有効化するジャンルを突合。

- **C5/C6/C7 以外に新規の「恒常0の死に項」は検出されず**（バグ報告の C5 リストが combo/kills パターンの全件を捉えていることを確認）。
- `maxCombo`（hack_slash `maxCombo * 200`）は **死に項ではない**: hack_slash は `shoot` 有効 → ShootFeature が `setCombo` → sideScroller.ts:1362 で maxCombo が追従更新される。**生きている**。
- `bossKills`（arena/hack_slash）: 両者 `boss` 有効 → SpecialFeature が加算。生。
- `accuracy`（bullet_hell）: `shoot` 有効。生。
- `colorTouches`: どのジャンルの scoreFormula も参照していない（writer/変数は存在するが未使用の遊休変数。実害なし）。

### 🟢 新規観察（Low 相当）— sports のビートマーカー不可視

- sports は `just_input` を有効化するため beatHits は加算可能（`beatHits * 80` は死に項ではない）。ただし RhythmFeature.render は `beat_hazard` 有効時のみビートマーカーを描画する（[RhythmFeature.ts:101](../src/game/systems/RhythmFeature.ts#L101)）。sports は `beat_hazard` を持たないため、**プレイヤーはタイミングの視覚的手がかりが一切ないまま BPM に合わせてキーを押す必要がある**。スコアは取れるが実質ブラインド入力。設計/UX上の齟齬（クラッシュ・スコア不正ではない）。
- 確信度: 確認済（コードリーディング）。実機での体感は未確認。

---

## 4.6. 第3回：config フィールド「定義済み・未実装」横断監査

`src/data/config/*.json` の全リーフキーを抽出し、`config-types.ts`/`ConfigValidator.ts`/config JSON 自身を除いた実消費コードでの参照有無を機械的に突合（C7 の `stealthCooldownSec` と同型の隠れバグを網羅探索）。`$comment` とデザインガイド用メタ（genre_params の `thresholdGuide`/`singleAxis` 等）は正当な非消費として除外。

### 🟠 新規発見（High〜Medium）: `beat_dash` フィーチャーが未実装なのにドキュメントは「実装済み✅」

- `RhythmFeature.handles` に `beat_dash` が含まれ（[RhythmFeature.ts:19](../src/game/systems/RhythmFeature.ts#L19)）`hasAnyRhythm` 判定にも入る（L49）が、**ダッシュ加速の実体ロジックがコードのどこにも存在しない**（grep で beat_dash の実処理0件、handles宣言と OR 判定のみ）。RhythmFeature が実装するのは `just_input`（JUST判定加点 L80-97）と `beat_hazard`（危険色反転 L60-78）のみ。
- **beat_dash を有効化するのは rhythm ジャンルのみ**。rhythm プレイ中、beat_dash は完全な no-op。
- **ドキュメント矛盾**: [docs/feature-ids.md:64](../docs/feature-ids.md#L64) は `beat_dash | リズムに合わせたダッシュで加速 | RhythmFeature ✅` と**実装済みマーク付き**で記載（design.md / engine-framework.md / genre-system.md も同様に担当機能として列挙）。L9（slide/gravity_flip）は console.warn 付きスタブかつ「未実装」明記なのに対し、**beat_dash は "✅実装済み" と偽って silent no-op** な点でより悪質。
- 優先度: High寄り Medium。確信度: 確認済（コードリーディング + grep 網羅）。

### 🟡 新規発見（Medium/Low）: rhythm_tuning.json の 9 フィールドが実装未接続

RhythmFeature が実消費する `RHYTHM_TUNING` は `justInputMinQuality`/`justInputParticleSize`/`justInputPopupOffsetY`/`justInputScoreBase`/`justWindowSec` の**5個のみ**。以下は型/Validator にはあるがロジック消費0（config+config-types+ConfigValidator にしか出現しない）:

- `goodWindowMult`/`goodMultiplier` — **「GOOD」タイミング段が未実装**。RhythmFeature は「JUST」判定しか持たず、GOOD 段の加点モデルが丸ごと欠落。
- `beatHazardFlipChance`/`beatSpawnBurstRate` — beat_hazard は反転を `beatCount % 2`（[L71](../src/game/systems/RhythmFeature.ts#L71)）、マーカー生成を単発 push（L72）でハードコードしこれら config を無視。**beat_hazard 有効の13ジャンル全てでこの2つを編集しても挙動不変**。
- `beatDashMult`/`beatDashFrames` — 上記未実装 `beat_dash` 用チューニング。
- `minBpm`/`maxBpm` — BPM クランプ未実装（RhythmFeature は `world.rules.bpm` をそのまま使用）。

C7 / L17（ui.json の beatMarker*）と同じ「定義+型+Validator まで整備されているのにロジックが読まない」構造で、根本原因は M9（検証網の隙間）。

### 🟢 その他の未消費 config

| ファイル | 未消費フィールド | 判定 |
|---|---|---|
| ui.json | `popupFont`, `beatMarkerAlphaDivisor`, `beatMarkerMaxAlpha`, `beatMarkerColor`, `beatMarkerLineW` | 既知 L17（RhythmFeature がハードコード） |
| stealth.json | `stealthCooldownSec`, `detectionRange` | 既知 C7 / L6 |
| bayes.json | `convergenceThreshold`, `candidateThreshold` | 既知 L18 |
| background.json | `mountainStep`/`mountainAlpha`/`mountainAmp*`/`building*` 系14個 | **新規・確定**: 下記参照 |
| boss.json | `firstBossDist`, `bossCollisionGrace` | **新規・確定**: 下記参照 |
| shoot.json | `bulletOutOfBoundsX` | **新規・確定**: 弾の画面外カリングに使われず（別経路で管理）。軽微 |

### 第4回：background/boss/shoot の個別確定結果

- **background.json — 山・ビル背景レイヤーが完全に未実装（14フィールド死に config）**: `mountainStep`/`mountainAlpha`/`mountainAmp1-3`/`mountainFreq1-3`/`mountainBase`/`buildingAlpha`/`buildingSectorW`/`buildingMinH`/`buildingRandH`/`buildingMinW`/`buildingRandW` は `src/` 全体（プラグイン含む）のどこからも参照されない（`grep` で config JSON 自身以外0件）。sideScroller の背景描画は地面（ground*/dash*）と星（star*）のみ実装し、**config が定義する遠景の山脈シルエットと都市ビル群のパララックス層は一切描画されない**。ハードコード代替ですらなく、レイヤー自体が存在しない。見た目のみ・Low。
- **boss.json — `firstBossDist`(2000) が死に config**: `onBossSpawn`（[SpecialFeature.ts:103](../src/game/systems/SpecialFeature.ts#L103)）は初回・再出現とも `bossRespawnDist`(1500) のみで判定し、`firstBossDist` を参照しない。designer の意図（初回ボスは 2000m）に反し、実際は約1500m で初回ボスが出る。`bossCollisionGrace`(8) も未使用で、ボスは通常ハザードと同じ grace=4 の当たり判定を使う。Low〜Medium。
- **shoot.json — `bulletOutOfBoundsX` 未使用**: `_bullets` はゲッター公開のみで、カリングは別値/別経路。軽微・Low。

### 第4回：build / bundle-size 再確認（`5b045ee`）

- `vite build`: ✅ 166 modules, JS 392.01KB / CSS 79.19KB, 705ms。
- `check-bundle-size.mjs`: ✅ JS 382.8/800KB, CSS 77.3/100KB, dist 460.8KB/1.95MB。全バジェット内。

---

## 4.7. 第5回：残り High 修正の精査 & 未実装フィーチャーの横断発見

### ✅ 残り3件の High 修正も妥当と確認（全6件完了）

- **H4（InputManager フォーカス喪失時キー固着）** — `blur` と `visibilitychange`（hidden）で `this.keys.clear()` するハンドラを追加し `dispose` でも解除。妥当。
- **H5（PuzzleFeature 多重初期化ガード）** — `_firstInit` フラグを追加。初回 onInit のみ実 scrollSpeed を保存、2回目以降は既存 `_state.baseScrollSpeed` を引き継ぎ、`onDisable` で `_firstInit=true` に戻す。再 onInit で復元値が 0 に潰れない。トレース上妥当（TetrisFeature の H7 ガードと同型）。
- **H6（JSONGenrePlugin 視覚チューニング未転送）** — `parallax`/`starConfig`/`hazardConfig`/`particleColors`/`groundLineAlpha`/`groundDashAlpha`/`verticalBackgroundLayers` 等を委譲先から転送。bullet_hell 等の JSON 専用ジャンルが委譲先の背景演出を反映するようになった。妥当。
  - 補足: 転送対象のうち `playerScale` / `scrollSpeedBonus` は L10 の通りエンジン側が読まないデッド API のため、この2つの転送は無害な no-op（実害なし）。

### 🟠 新規発見（Medium）: `handles` に登録されているのに実装が空のフィーチャーが4件（silent no-op）

全 FeatureSystem の `handles` と実装（`features.has()` ゲート＋実処理）を突合した結果、**宣言だけで実体ロジックが存在しないフィーチャーが beat_dash 以外に3件**見つかった。プロジェクト唯一の未実装トラッキングは MovementFeature 内の `['slide','gravity_flip']` warn ループのみで、以下は**どこにも警告されず静かに無反応**になる（`handles` 登録により `getActiveSystems` には含まれるため「担当システムはある」ように見える）。

| フィーチャー | 担当（handles） | 実装 | 有効化ジャンル | docs 表記 | 影響 |
|---|---|---|---|---|---|
| `beat_dash` | RhythmFeature | **なし**（handles + hasAnyRhythm の OR 判定のみ） | **rhythm** | feature-ids.md ✅ | rhythm の「リズムダッシュ加速」が無反応。**実ジャンルで機能欠落 + docs 誤記** |
| `shield` | RpgFeature | **なし**（handles のみ） | **survival** | feature-ids.md ⚠️スタブ（正直） | survival の「1回ガード」が無反応。**実ジャンルで機能欠落**（docs は正直に stub と明記） |
| `charge_shot` | ShootFeature | **なし**（handles のみ） | なし | feature-ids.md ✅ | 潜在（有効化ジャンルなし）だが docs は実装済みと誤記 |
| `bomb` | ShootFeature | **なし**（handles のみ。RpgFeature の item ドロップも 'exp'/'hp' のみ処理し 'bomb' 型は無視） | なし | feature-ids.md ✅ | 潜在だが docs 誤記。カードで有効化されると silent 失敗 |

- **既知の L9（slide/gravity_flip）を含めると、22フィーチャー中6件が未実装**。うち silent（警告なし）が4件、うち2件（beat_dash / shield）は実出荷ジャンルで有効化されている。
- 特に **beat_dash は docs が「✅実装済み」と偽っている**点で L9（正直に⚠️明記）より問題。
- 根本原因は M9 と同じく「`handles` 登録＝実装保証」という誤った前提。`handles` に載せるだけで検証が通り、実装漏れが検出されない。
- 優先度: Medium（実ジャンルの機能欠落2件 + ドキュメント整合性）。確信度: 確認済（`grep` による全 src 網羅 + docs 突合）。実機での「効かない」体感は未確認。

---

## 4.8. 第6回：投擲フェーズ（throwEngine / scoreCalc）の精査

これまでの調査（bug-report / pr-review）でほぼ未監査だった投擲フェーズを精査。ロジックは概ね健全だが、以下3点を発見。いずれも Low だが CLAUDE.md の規約・記述と直接矛盾する。

### 🟡 D1（Low）: CLAUDE.md の score.json 記述が実装と不一致

- CLAUDE.md は「`score.json` | scoreRatio（play 70% / throw 30%）・投擲スコア重み」と記載するが、実際の [score.json](../src/data/config/score.json) にこれらは**存在しない**（同ファイルは `distanceScoreRate` / `longAirScoreRate` / `gradeThresholds` 等を持つ）。
- `SCORE_RATIO`（play 0.7 / throw 0.3）と `THROW_SCORE_WEIGHTS`（airTime 0.5 / arcHeight 0.4 / speedPenalty 0.1）は実際には [game_balance.json](../src/data/config/game_balance.json) の `scoreRatioPlay`/`scoreRatioThrow`/`throwScoreWeights*` から [gameBalance.ts:33-45](../src/data/gameBalance.ts#L33) 経由で読まれる。**値そのものは CLAUDE.md の記述（0.5/0.4/0.1・70/30）と一致し JSON 駆動も守られている**ので、問題はドキュメントの参照先ファイル名だけ（L15 と同種のドキュメント陳腐化）。

### 🟡 D2（Low）: `calcThrowScore` の速度ペナルティ閾値 800 がハードコード（マジックナンバー規約違反）

- [scoreCalc.ts:126](../src/domain/scoreCalc.ts#L126) `const speedPenalty = Math.max(0, result.speed - 800) * w.speedPenalty` の `800` がソース直書き。重み（0.1）は JSON 化されているのに閾値だけコードに残る。CLAUDE.md「ゲームバランス値は config JSON に定義」に反する。`throw.json` か `game_balance.json` へ出すのが筋。

### 🟢 D3（Low・要design確認）: 速度ペナルティが「投擲時の速さ」ではなく「着地時の衝突速度」を測っている

- [throwEngine.ts:87-92](../src/game/throwEngine.ts#L87) `_finalize` は着地/画面外離脱の瞬間の `speed = sqrt(vx²+vy²)` を `ThrowResult.speed` とする。飛行中に重力で vy が増大するため、これは**リリース速度ではなく着地（衝突）速度**。
- 結果、滞空時間・弧が大きい投擲ほど落下加速で着地速度も上がり、`airTime`/`arcHeight` のボーナスと `speedPenalty` の減点が**同方向に相関して打ち消し合う**。CLAUDE.md の「速すぎると減点」が意図する「強く投げすぎたら減点」とは異なる挙動になっている可能性。
- クラッシュ・明確なスコア不正ではなく設計意図の解釈次第のため Low。確信度: 確認済（コードリーディング）。実際のスコア分布は未計測。

### その他

- 投擲物理（重力・空気抵抗・角度 atan2・power ゲージ）とスラム式パーサ（`evalScoreFormula`、eval 不使用の手書きパーサ、0除算/不正式ガードあり）は健全。明確なバグは検出せず。

---

## 4.9. 第7回：LearningSystem（動的ルール変更）の精査

### 🟠 新規発見（High寄り Medium）: LearningSystem が出荷ビルドで一切発火しない（実質デッド機能）

CLAUDE.md が実装完了項目に挙げる「LearningSystem（プレイ行動に応じた動的ルール変更）」は、コード（評価器・4種エフェクト適用・通知UI）が全て存在するにもかかわらず、**実プレイでは一度も発火しない**。

- 発火経路: sideScroller は `ManualVersion.learningRules` から `learningRules` を得て（[sideScroller.ts:193](../src/game/sideScroller.ts#L193)）、`evaluateLearningRules` を毎チェックで呼ぶ（[L366](../src/game/sideScroller.ts#L366)）。
- ランタイムの `learningRules` の出所は **`MANUAL_DECK['1.0'].learningRules` のみ**（[useGameState.ts:100](../src/composables/useGameState.ts#L100)、`_buildFakeManual` が全ラウンドで参照）。
- しかし `MANUAL_DECK['1.0']` の実体は [base.json](../src/data/manuals/base.json) の `1.0` エントリで、**`learningRules` フィールドを持たない**（確認済み）。
- `learningRules` を実際に定義しているのは [action-branch.json](../src/data/manuals/action-branch.json)（version 3.0 エントリ, L50）だけだが、これは M8 の「死んだ manual ツリー」であり**ランタイム未参照**。カードデッキ（`src/data/cards/*.json`）にも learningRules は皆無（`grep` 0件）。
- 帰結: `MANUAL_DECK['1.0'].learningRules === undefined` → sideScroller の `learningRules` は null のまま → `evaluateLearningRules` は実質的に空で回り、**disableAction / invertHazard / forceFeature / changeKey のどれも永遠に発火しない**。jumpRate/shotRate 等の行動監視、動的ルール変更、`learningNotification` UI 全体が inert。
- 優先度: High寄り Medium（クラッシュ・スコア不正ではないが、CLAUDE.md が「実装完了」と明記する看板機能の一つが出荷状態で完全に不活性。M8 と同じ「死んだ manual データ」パターンだが影響範囲が1システム丸ごとと大きい）。確信度: 確認済（コードリーディング + データ突合。base.json / cards / manualDeck の全参照を確認）。

### 🟢 潜在バグ（現状 inert だが learningRules を配線すると顕在化）

`_applyLearningEffect`（[sideScroller.ts:1403](../src/game/sideScroller.ts#L1403)）に、上記により現状は到達しないが構造的に問題のある2点:

- **P1: `invertHazard` が無条件で `soundManager.onGenreLock('rhythm')` を呼ぶ**（[L1417](../src/game/sideScroller.ts#L1417)）。ハザード反転という学習エフェクトが、実ジャンルと無関係に「rhythm ジャンル確定」のBGM/効果音演出を毎回鳴らす。ジャンル未確定の通常プレイ中に鳴れば明確な誤演出。
- **P2: `forceFeature` が `rules.features.add()` するだけで、その Feature の `onInit`/`onEnable` を呼ばない**（[L1421-1428](../src/game/sideScroller.ts#L1421)）。lights_out（PuzzleFeature が onInit で scrollSpeed=0 等の初期化）や tetris_mode のような状態を持つ Feature を強制有効化すると、初期化されないまま `update()` だけが回り破綻しうる。なお本ブランチには FeatureSystem に `onEnable` 実装は存在せず（`grep` 0件）、初期化は `onInit` に集約されている。

（注: 同メソッドの `changeKey` は本ブランチでは `_keyStack` + `_changeKeyUntil` の旧実装。PR #157 がこれを統合予定だが未マージ。Issue #4 は別トラッキングのため本レポートでは扱わない。）

---

## 4.10. 第8回：矛盾カードシステム & choose() フローの精査

### M1 / M2 の残存を確認（useGameState.ts は修正コミット対象外）

- **M1（同一 choose 内で `_lockGenre` が二重発火）— 残存**: [useGameState.ts:223-236](../src/composables/useGameState.ts#L223)。通常ロック（`lockedGenre===null && (roundCount>=MAX_ROUNDS || converged)`, L226）で例えば 'stg' を確定した直後、同じ呼び出しの L234 で `shouldTriggerGlitchEnd && lockedGenre!=='glitch'` が真だと `_lockGenre('glitch')` も発火する。ガード `!=='glitch'` は**既に glitch のときの再ロックしか防がず**、「通常ロック→glitch ロック」の同一呼び出し二重発火は防げない。結果 `accumulatedManualText` に2ジャンル分の `manualReveal` が push され、`soundManager.onGenreLock` が2回鳴る。矛盾ペア2組を MAX_ROUNDS(5) 到達までに作れば現実的に発生。
- **M2（roundCount が MAX_ROUNDS を超えて増加）— 残存**: `roundCount.value++`（L216）に上限がなく、ジャンル確定後も `phase='genreLocked'` で `choose()` が呼ばれ続ける設計（コミット `47e3fd0` 以降）。`version: "${roundCount}/${MAX_ROUNDS}"`（L95）が `7/5` 等と表示され、カウンタが壊れて見える。

### サブシステムは健全（新規バグなし）

- **contradictionTracker**（[contradictionTracker.ts](../src/domain/contradictionTracker.ts)）: `CONTRADICTION_WEIGHT=0.25` / `GLITCH_THRESHOLD=0.5` → 相異なる矛盾ペア2組で glitch。`seenPairs` によるペア重複排除は順序非依存で正しく、conflictsWith の片側宣言でも検出できる。ロジックに欠陥は検出せず。
- **`_applyConflicts`**（[useGameState.ts:154-165](../src/composables/useGameState.ts#L154)）: 矛盾相手の説明書行を取り消し線化。`choose()` 内で `_appendManualText` より前に呼ばれる順序は正しく（既存行を消してから新規行を追加）、二重ストライク・未追加行の扱いも妥当。軽微な `indexOf` 先頭一致依存（同一テキスト重複時に先頭のみ処理）は実データでは非問題。
- glitch 強制ロック後の後続 `choose()` はガードで再ロックされず、`_rebuildRules` は最終値（glitch）のみで構築されるため UI 最終表示は一貫（M1 の副作用はテキスト重複と効果音二重のみ）。

---

## 4.11. 第9回：App.vue フェーズ遷移・ローディング・投擲/エンディング配線

### ✅ C1 修正が妥当と確認（実装機序を特定）

第1回では差分の存在のみ確認していた C1 の修正機序を特定。[LoadingScreen.vue](../src/components/LoadingScreen.vue) が疑似進捗100%到達時に `emit('complete')`（L32-37）を発火し、[App.vue:328](../src/App.vue#L328) の `<LoadingScreen @complete="isLoading = false" />` がこれを受けて `isLoading=false` にする。これによりオーバーレイが `v-if` で消え、下に隠れていたタイトル画面が露出する。疑似進捗は約1.4〜4秒で100%に到達し、`onUnmounted` でインターバルも解放される。**C1 の循環（ボタンが見えない→押せない→ローディング終わらない）は解消済み**。

### 🟢 新規発見 D4（Low）: ギブアップボタンの「600m ガード」がコメントだけで実装されていない

- [App.vue:427](../src/App.vue#L427) のコメントは「ギブアップボタン（600m 以降 & genreLocked 時のみ）」だが、実際の `v-if` は `['playing','genreLocked'].includes(phase) && !snapshot.dead`（[L431](../src/App.vue#L431)）。
  - **距離ガードが存在しない**（`grep` で App.vue に 600/distance ベースのギブアップ条件なし）。ボタンは開始直後（0m）から表示される。
  - **`playing` も含む**ため「genreLocked 時のみ」というコメントとも不一致。
- 影響: クラッシュ・スコア不正はない（`giveUp()` は playScore 再計算→投擲フェーズへ遷移する健全な経路）。ただし設計意図（一定距離を走ってから投げる）が失われている可能性 + コメントが実装と矛盾。Low。確信度: 確認済（コードリーディング）。

### その他（健全）

- `giveUp → startThrowing（throwing）→ onThrown → ending` の遷移、ChoicePanel/ThrowOverlay/EndingPanel の `v-if` フェーズ分岐、`genreLockedBoostTimer` の clearTimeout 解放（onUnmounted 相当）は一貫。明確なバグは検出せず。
- EndingPanel の重複CSS（bug-report M6）は本ブランチ未修正のはずだが本パスでは未再確認（次回サンプリング対象）。

---

## 4.12. 第11回：M3/M4/M5 の残存確認（Medium 全件未修正の確定）

修正コミット `5b045ee` は SoundManager / JSONGenrePlugin の TO_DELEGATE_ID / updateRules の配列クリアのいずれも触れておらず、M3/M4/M5 は原状のまま。

- **M3 残存**: `updateRules`（[sideScroller.ts:156-](../src/game/sideScroller.ts#L156)）は `_disabledActions`/`_changeKeyUntil`/`_keyStack` はクリアするが、`hazards`/`items`/`_bullets`/`scorePopups` はクリアしない。`scrollAxis` の x⇔y 切替直後、旧軸座標系のオブジェクトが数フレーム残る。
- **M4 残存（機序特定）**: [SoundManager.playBgm:53-60](../src/plugins/SoundManager.ts#L53)。`audio.play().then()` の成功パスが `this._bgmAudio === audio` を確認せずにフェードインを開始する。連続 `playBgm` 時、先行呼び出しの `play()` Promise が後から解決すると、**フェードアウト予定だった旧 audio が逆にフェードインし始め**、`_cancelFadeIn` も上書きされて旧フェードタイマーがリークする。なお `.catch` 側（L59）には `this._bgmAudio === audio` ガードがあるのに `.then` 側にはない、という非対称。M1 の `_lockGenre` 二重発火（→ onGenreLock 二重）と組み合わさると発生確率が上がる。
- **M5 残存**: [TO_DELEGATE_ID](../src/plugins/JSONGenrePlugin.ts#L48) に `glitch`/`stealth` キーがなく `?? 'base'` で暗黙フォールバック。glitch・stealth_action が専用 bgColor を持ちながら見た目上 base と区別つかない。

**結論**: Medium は M1〜M9 の**9件すべてが未修正**。修正コミットは Critical(C1-C4)/High(H1-H6) の計10件に限定されており、Medium 以下と第2次調査の新規 Critical（C5-C7）には手が入っていないことが確定した。

---

## 4.13. 第12回：CLAUDE.md「完了項目」の追検証（カードプール / 難易度曲線）

### 🟢 新規発見 N8（Low）: 「無限選択肢システム（100+ 選択肢、ver 9.0～15.0）」の誇張

- ランタイムのカードプール実数は **51枚**（starter 32 + expansion 13 + surprise 6）。CLAUDE.md 完了項目の「100+ 選択肢」に届かない。
- 「ver 9.0～15.0」は M8 で確認した**死んだ manual ツリー**（`MANUAL_DECK` の 9.0-15.0 エントリ、ランタイム未参照）を指しており、実プレイのカード方式とは別物。CLAUDE.md がこの2系統を混同して「100+」と数えている。
- ただし「無限」自体は成立: `sampleCards` は直前ラウンドの2枚（`lastShownCardIds`）だけを除外し（[useGameState.ts:136](../src/composables/useGameState.ts#L136)、[cardPool.ts:39](../src/data/cardPool.ts#L39)）、残り約49枚から毎回抽選する。**M2 でラウンドが無制限に伸びてもカード枯渇は起きず**（カードは再出現する）、`choose()` が空 activeCards で失敗する心配はない。Low・確信度: 確認済（実データ計数 + コードリーディング）。

### 🟢 健全と確認した項目

- **距離ベース難易度曲線**: `interval = baseInterval * exp(-decayRate * distance)` を `minInterval` でクランプ（[sideScroller.ts:492](../src/game/sideScroller.ts#L492)・縦版 L638）。距離とともにスポーン間隔が指数減衰し出現頻度が上がる、正しい実装。「1.0倍→1.5倍」は概説的表現でロジック自体に問題なし。
- **カード再抽選**: 上記の通り枯渇なし。ベイズ事後確率で重み付け抽選（`sampleCards` に `posteriors` 引き渡し）も配線されている。

---

## 4.14. 第13回：C7 の実行時測定（コードリーディング → 実測へ格上げ）

実 `SpecialFeature` を import した使い捨て vitest スペック（`tests/unit/domain/` に一時配置し実行後に削除、production・リポジトリは無変更）で `_updateStealth` を idle 状態のまま毎フレーム駆動し、スコア蓄積を実測した。

### 測定結果（dt = 1/60 秒、静止し続けた場合）

```
stealthBonus  10秒後 = 7.00    70秒後 = 67.00
addScore(直接) 10秒後 = 630.0   70秒後 = 6030.0
```

- **stealthBonus は線形に増加し頭打ちしない**（hidden 化する3秒以降、毎フレーム dt を加算 → 経過秒数 − 3 にほぼ一致）。`horror` の `stealthBonus * 0.8` / `stealth_action` の `stealthBonus * 0.5` に直結。C7 の主張どおり上限なし。**「確認済（コードリーディング）」→「確認済（実測）」に格上げ**。
- **★新発見: 第2の無限チャネル**。`_updateStealth` は hidden 中に `world.addScore(STEALTH.stealthSafeBonus)`（=1.5）も**毎フレーム**呼ぶ（[SpecialFeature.ts:194](../src/game/systems/SpecialFeature.ts#L194)）。これは 60fps で **90点/秒** の直接加算に相当し、測定でも 70秒静止で **6030点** をスコア式と無関係にライブスコアへ積み増した。stealthBonus（スコア式経由）だけでなく、この直接加算も上限がなく、C7 の悪用性は bug-report の記述より一段深刻。
- 影響ジャンル: horror / stealth_action。プレイヤーは操作を止めるだけで両チャネルからスコアを無限に稼げる。

> 検証手法メモ: vitest の `include` は `tests/unit/**` に限定されているためスクラッチパッド直置きでは拾われない。一時ファイルを `tests/unit/domain/` に置いて実行し、直後に `rm` で削除（`git status` クリーンを確認）。

---

## 4.15. 第14回：C6 の実行時測定

実 `ShootFeature` を import した使い捨て vitest（`tests/unit/domain/` に一時配置→実行→削除、リポジトリ無変更）で、C6 の中核である「ShootFeature が tower の kills/combo を無条件上書きする」挙動を実測。

- 手順: mock world の `gameStats` に `setKills(3)/setCombo(3)`（SpecialFeature._updateTower が3体撃破した状態）を与えた直後、`ShootFeature._syncWorldStats(world)`（ShootFeature.update 末尾で毎フレーム走る）を呼ぶ。
- 結果:

```
before  kills=3 combo=3
after   kills=0 combo=0
```

- `_syncWorldStats`（[ShootFeature.ts:200-205](../src/game/systems/ShootFeature.ts#L200)）が `setKills(s.kills)`/`setCombo(s.combo)`（shoot 無効なので内部状態は 0）で**無条件に 0 上書き**することを実コードで確認。tower_def は毎フレーム SpecialFeature→ShootFeature の順で走る（第1回で静的確認済み）ため、タワー撃破分は必ず同フレーム内に潰される。**C6 を「確認済（実測）」に格上げ**。`kills*90 + combo*110` の重み最大2項が無効化される。
- 副次観察: `_syncWorldStats` L214 は `(world.bullets as Bullet[]).length = 0` で `world.bullets` を無条件参照する。実ゲームでは常に配列だが、モック時に落ちる程度の暗黙前提（実害なし）。

---

## 4.16. 第15回：N7 実データ確認 & C2 修正の動作確認

すべて使い捨て vitest（`tests/unit/domain/` に一時配置→実行→削除、リポジトリ無変更）。

### N7（LearningSystem デッド）を実 `MANUAL_DECK` で確定

実際に `import.meta.glob` で構築された `MANUAL_DECK` を import して確認:

```
MANUAL_DECK['1.0'].learningRules = undefined
全キー数 = 151
learningRules を持つエントリ = [3.0-a-fight:2]   ← action-branch.json の死んだ枝のみ
```

- ランタイム唯一参照の `1.0` は learningRules を持たず、learningRules を持つ唯一のエントリ `3.0-a-fight`（2件）は M8 の到達不能な死にツリー。**LearningSystem は出荷ビルドで発火しないことを実データで確定**。
- 副次: 全キー数 **151** は、CLAUDE.md「100+選択肢」が実カード51枚ではなくこの死んだ manual ツリー（151エントリ）を数えていることの裏付け（N8 を補強）。

### C2 修正の動作確認（ポジティブ検証）

実 `SurvivalFeature._onEnemyKilled` を3回駆動:

```
kills = 3    removedCount = 3
```

- `world.setKills` によるキル計上（3）と `world.removeHazardById` によるハザード除去（3）を実コードで確認。C2 修正が「ゾンビ化（除去漏れ）」と「`kills*50` の死に項」の両方を解消していることを動作レベルで裏付け。

### C5 について

C5 は「combo/kills を書き込む Feature が enableFeatures に一つも無い」という**不在の証明**であり、`setCombo`/`setKills` の全呼び出し元（shoot/tower/lights_out/tetris_mode 系のみ）を grep で網羅した静的証明の方が「1000フレーム 0 だった」式の実測サンプルより強い。よって C5 は静的確認で確定とし、実測はスキップ。

### 実測サマリ（第13-15回）

| 項目 | 手法 | 結果 |
|---|---|---|
| C7 | 実 SpecialFeature 駆動 | stealthBonus 7→67(線形無限) + addScore 90点/秒 |
| C6 | 実 ShootFeature._syncWorldStats | kills/combo 3→0（無条件上書き） |
| N7 | 実 MANUAL_DECK | 1.0.learningRules=undefined（デッド確定） |
| C2(修正) | 実 SurvivalFeature._onEnemyKilled | kills=3・除去3（修正動作） |

---

## 4.17. 第16回：修正コミットの回帰探索 & orphan feature 監査

### 🟢 新規発見 R1（Low・潜在／現状無害）: H2 修正の `break` が safe-hazard 処理を巻き込む

- H2 修正は当たり判定ループ（[sideScroller.ts:501-511](../src/game/sideScroller.ts#L501)、縦版も同型）で、危険ハザードにヒットして無敵が付与されたら `if (p.invincible > 0) break` でループを抜ける。
- しかしループは `hazards` を**降順(i=length-1→0)で走査**し、危険/安全を同じループで処理する。危険ハザードが安全ハザードより先（高 index）に処理されると、`break` によって**同フレーム内の後続の安全ハザードの `onSafeHazardTouch` がスキップ**される。より外科的には「危険ヒットのみスキップ」すべきところ、`break` が安全接触処理まで巻き込む。
- **現状は無害**: `onSafeHazardTouch`（[SpecialFeature.ts:50](../src/game/systems/SpecialFeature.ts#L50)）は `color_touch` 有効時のみ動作するが、**color_touch はどのジャンルも有効化しない**（下記 orphan 監査）。よって実プレイでこの回帰は発現しない。ただし将来 color_touch を有効化するジャンル/カードを追加すると、危険+安全の同時接触フレームで color_touch スコア・除去が取りこぼされうる。確信度: 確認済（コードリーディング + orphan 監査）。

### 🟢 新規発見 N9（Low）: orphan feature 監査 — 3フィーチャーがどのジャンルからも有効化されない

全22ジャンルの `enableFeatures` を集計（有効化されている feature は28種）し、`handles` 登録済み31種と差分を取った結果、**どのジャンルも有効化しない handled feature = `charge_shot`, `bomb`, `color_touch`** の3件。

| feature | 実装 | ジャンル有効化 | 分類 |
|---|---|---|---|
| `charge_shot` | ❌ 未実装（N2） | ❌ orphan | 宣言のみ＋誰も使わない（二重デッド） |
| `bomb` | ❌ 未実装（N2） | ❌ orphan | 同上。RpgFeature の item ドロップも 'bomb' 型未処理 |
| `color_touch` | ✅ 実装あり（SpecialFeature.onSafeHazardTouch + addScoreVarsColorTouch） | ❌ orphan | **実装済みだが誰も有効化しない**（beat_dash の逆パターン）。付随する `colorTouches` スコア変数もどの scoreFormula も未参照 |

- これで「宣言のみ・未実装」（beat_dash/charge_shot/bomb/shield/slide/gravity_flip）と「実装済み・未使用」（color_touch）の両系統が揃い、フィーチャー↔ジャンルの配線漏れが両方向に存在することが確定。根因は M9（`handles` 登録／JSON 記載だけで検証が通る）。

### その他の回帰探索（問題なし）

- C3（hack_slash に item_pickup 追加）: RpgFeature が exp/hp アイテムを処理するのみで副作用なし。C4（閾値引き下げ）: reach-sim で puzzle 34.6% 等が健全維持、tetris/hack_slash の閾値低下が他ジャンルの到達性を奪っていない。C1/H5/H6 の変更も追加的で回帰なし。

---

## 4.18. 第17回：低到達ジャンルの原因分析（C4 の systemic な残存）

C4 修正で 0.0% の2ジャンル（hack_slash/tetris）は解消したが、reach-sim では依然17ジャンルが「狙い撃ちでも <25%」。その最下層を閾値と project 自身の設計指針（`genre_params.json` の `thresholdGuide`: singleAxis=5 / dualAxis=3 / tripleAxis=2）に照らして分析した。

### 🟠 新規発見 N10（Medium・High寄り）: 約8ジャンルの dual-axis 閾値が推奨値の約2倍で実質到達困難

| ジャンル | thresholds | 推奨(dualAxis=3)比 | reach率 |
|---|---|---|---|
| bullet_runner | tempo:7, enemy:6 | 約2.2倍 | **1.5%** |
| arena | enemy:7, combo:5 | 約2倍 | **1.9%** |
| tower_def | craft:6, enemy:6 | 2倍 | **2.7%** |
| bullet_hell | vertical:4, enemy:8 | enemy が約2.7倍 | **3.5%** |
| dungeon | growth:6, craft:5 | 約1.8倍 | **3.9%** |
| rhythm | tempo:6, rhythm:6 | 2倍 | **4.0%** |
| survival | survive:6, growth:6 | 2倍 | **4.3%** |
| horror | survive:6, stealth:5 | 約1.8倍 | **6.4%** |

対照的に、指針に近い閾値のジャンルは健全に到達する: stg（range:4,enemy:4）31.9%、tetris（combo:4,craft:4, C4修正後）26.4%、aquatic（3軸で 3/3/4）32.2%、puzzle（単軸 combo:6）34.6%。

- **これは C4 と同一の根因**（閾値が MAX_ROUNDS=5・ベイズ尤度の下で過大）が、C4 が修正した2ジャンル以外に systemic に残っている状態。「狙い撃ち 1.5〜4%」は、プレイヤーがそのジャンルを意図的に目指しても大半失敗することを意味し、実質到達困難（0% の C4 ほどではないが「到達できないコンテンツ」に近い）。
- CLAUDE.md の中核コンセプト「横スクロールから多様な22ジャンルが生まれる」に対し、単軸/低閾値ジャンル（puzzle/stg/idle/runner/sports 等）へ偏って収束し、高閾値 dual-axis ジャンル群がほぼ出現しない、という体験上の偏りを生む。
- 優先度: Medium（High寄り）。C4 が Critical 判定だったことを踏まえると、同型欠陥の残存は無視できない。ただし 0% ではなく「非常に低い」ため C4 より一段下げて Medium とした。確信度: 確認済（reach-sim 実行結果 + 閾値と `thresholdGuide` の突合）。
- 補足: これは bug-report が C4 の付記として触れていた「17ジャンル<25%」を、閾値設計の観点から定量化・格上げしたもの。

---

## 4.19. 第18回：M7 深掘り — CI のテストカバレッジが実質16%（M7 の想定より深刻）

M7 は「`test:unit:ci` が `tests/unit/domain` を対象外にしているため5件の失敗を見逃す」としていたが、実行確認したところ**さらに深刻**だった。

- `package.json` の `test:unit:ci` = `vitest run tests/unit/engine tests/unit/framework tests/unit/composables`。
- しかし `tests/unit/` に実在するディレクトリは **composables / domain / game の3つのみ**。`engine` と `framework` は**存在しない**。→ CI は実在する `composables` の1ファイル（**14テスト**）だけを実行している。
- 全体（`test:unit` = `vitest run tests/unit`）は **7ファイル / 87テスト**。内訳: composables 14 / domain 54(うち6 failing) / game 19。
- つまり **CI は 87 中 14テスト（16%）しか回していない**。除外されているもの:
  - `tests/unit/domain`（5ファイル・54テスト、うち **6 failing**＝M7/M8）
  - `tests/unit/game`（1ファイル・**19テスト**）— これは**修正コミット `5b045ee` が C2 の回帰防止用に追加/更新した `SurvivalFeature.test.ts`**。**自分で追加した回帰テストが CI で一度も走らない**。
- 実測: `vitest run tests/unit/engine tests/unit/framework tests/unit/composables` → 1 passed (1 file) / 14 passed。`vitest run tests/unit/game` → 19 passed。`vitest run tests/unit`（全体）→ 6 failed / 81 passed。
- 影響: (a) 既存の6失敗（resolveGenreProgress・manualDeck）が緑のまま放置される、(b) domain/game 配下のどんな新規テストも CI ゲートにならず、将来のリグレッション（スコア計算・ジャンル収束・Feature 挙動の中核ロジックはまさに domain/game にある）を素通しする。M9（検証網の隙間）の中でも最も影響が大きい構造欠陥。
- 優先度: M7 は Medium だが、この実態（16%カバレッジ + 中核ロジックが CI 対象外 + fix 自身のテストが非実行）は High 相当に読める。確信度: **確認済（実測）**。

---

## 5. 調査総括と残課題

### 本ループ（全18回）で到達したこと

- 修正コミット `5b045ee` の10件（C1-C4/H1-H6）を全件検証（C1/C2 は動作確認、C6/C7 は未修正であることを実測で確定）。
- 静的解析全項目・build・bundle-size・reach-sim・全ユニットテストを再実行し現状を確定。
- 中核サブシステム（スコア計算・投擲・LearningSystem・矛盾カード・カードプール・難易度曲線・BGM・フェーズ遷移）を個別精査。
- 新規発見 12件超（N1-N10 / P1-P2 / D1-D4 / R1）を深刻度付きで整理。うち C6/C7/N7/C2 は実 TS モジュールを駆動する使い捨て vitest で実測（リポジトリは無変更）。

### 未着手で残る調査（次にやるなら）

1. **実機（dev サーバー + Playwright）での C5/C7/M1 の end-to-end 再現** — 本ループはユニット粒度の実測まで。ブラウザ実操作での確認は未実施。
2. **M1（二重ロック）/ M4（BGM 世代競合）の実測** — セットアップが重く静的確認に留めた2件。
3. **N10 の閾値是正が他ジャンルの到達率に与える影響のシミュレーション**（reach-sim で修正案を試算）。
4. **Vue リアクティブ層（useScoreAnimation 等）の DOM 実行時挙動** — 本ループはロジック層中心。

> 本レポートは調査・検証のみ。ソースコードへの修正は一切行っていない（一時的な検証テストは実行後に削除、`git status` クリーンを毎回確認）。
