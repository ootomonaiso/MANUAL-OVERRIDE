# ゲームエンジン構造調査レポート

調査日: 2026-06-15  
調査ブランチ: `feature/tk/refactor-gameEngines`  
対象: 読み取り専用・コード実行なし

---

## 調査サマリー

問題は大きく3つの軸に集中している。

**① 縦スクロール3ジャンルの構造的破綻**（`aerial_stg` / `bullet_hell` / `aquatic`）  
物理・型・実装の3層すべてで上下移動が成立しない。`genres.json` に `gravity` を書いても縦モードのコードはそれを一切読まない。`Controls` 型に `moveUp`/`moveDown` が存在しないため、型レベルで実装すら追加できない。

**② スコア計算の経路不整合**  
ジャンル別スコア式（`scoreFormula`）は死亡時にしか走らない。正規の完了手段であるギブアップ→投擲では、加算累積値がそのまま最終スコアになる。仕様で規定されている「ジャンル別計算式」が通常プレイで機能していない。

**③ 設定・コードが実際には効かないデッドゾーンが複数ある**  
`DEFAULT_CONTROLS` の3重定義（うち1つはどこからも import されない）、Vue の `readonly` プロキシをゲームエンジンに渡しているため PuzzleFeature のスクロール停止が無効化、`learningRules` がローダのフィールド欠落で全体が死蔵、など。

---

## 優先度付き問題一覧

優先度基準: **高**=設定・機能が意図どおり動いていないバグレベル / **中**=動作はするが拡張・修正に過大なコストがかかる設計問題 / **低**=保守性向上目的・緊急性なし

| 優先度 | 問題カテゴリ                                 | 対象ファイル                                                                                                                             | 問題の内容                                                                                                                                                                                                                                                                            | 影響範囲                                                                                                                                    |
| ------ | -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| 高     | 物理演算の欠落                               | `src/game/sideScroller.ts`（縦ブロック L402-405）                                                                                        | 縦スクロールモードは `p.y` を画面下端に固定し `p.vy=0` / `p.onGround=true` を毎フレーム強制。`r.gravity` を一切参照しない。`genres.json` に定義した `gravity` 値はすべて無効。                                                                                                        | `aerial_stg` / `bullet_hell` / `aquatic`。genreDef・runtimeConfig・既定値いずれの経路でも重力設定が無効。                                   |
| 高     | 型定義の欠落                                 | `src/domain/types.ts`（`Controls` L126-133）                                                                                             | `Controls` に `moveUp` / `moveDown` が存在しない。縦スクロール時の上下移動を実装しようとしても型レベルで不可能。                                                                                                                                                                      | 縦スクロール3ジャンル全体。上下移動を追加する際のすべての実装に波及。                                                                       |
| 高     | 移動処理の欠落                               | `src/game/systems/MovementFeature.ts`（L35-39）, `src/game/systems/ExtraMovementFeature.ts`（L89-99）                                    | `MovementFeature` の縦分岐は `p.vx`（左右）のみ設定。`vertical_scroll` Feature はハザードの左右ドリフトのみで、プレイヤーの `p.vy`（上下）入力処理が存在しない。                                                                                                                      | 縦3ジャンルが「下端固定・左右のみ・落下物回避」に固定され、`manualReveal`（「上を目指す」「深海を探索」）と乖離。                           |
| 高     | スコア確定経路の不整合                       | `src/game/sideScroller.ts`（`_recalculatePlayScore` は `_die` L685 のみ）, `src/App.vue`（`giveUp` L131-134）                            | ジャンル別 `scoreFormula` による再計算が死亡時にしか走らない。正規の完了手段であるギブアップ→投擲では加算累積値がそのまま最終スコアになる。死亡完了とギブアップ完了でスコアの算出方法・桁が変わり比較不能。                                                                           | 全ジャンル。仕様で規定されている「ジャンル別計算式（70%）」が通常プレイで機能していない。                                                   |
| 高     | readonly プロキシへの書き込みが無効化        | `src/composables/useGameState.ts`（L127 `readonly(rules)`）, `src/App.vue`（L54, L125）, `src/game/systems/PuzzleFeature.ts`（L59, L72） | `SideScroller` が保持する `this.rules` は Vue の readonly リアクティブプロキシ（`toRaw` 未解除）。`PuzzleFeature` の `r.scrollSpeed = 0` は readonly により書き込みが無効化され、grid_stop の「solve フェーズで画面停止」が機能しない。dev ビルドでは毎フレーム readonly 警告も出る。 | `puzzle` ジャンルのコア挙動。スクロールが止まらず障害物が流れ続けるためパズルが成立しない。                                                 |
| 中     | gravity 設定が誤解を招く                     | `src/data/config/genres.json`（縦3ジャンル）                                                                                             | 縦3ジャンルに `gravity:1600` が明示されているが、コードが参照しないため no-op。値を変更しても挙動は変わらない。                                                                                                                                                                       | 定義を読んだ開発者が「gravity を変えれば動く」と誤認するリスク。                                                                            |
| 中     | 縦モードでアイテムが一切スポーンしない       | `src/game/sideScroller.ts`（`_spawnHazard`）                                                                                             | アイテム生成処理が横スクロール分岐（else）の中にのみ存在する。縦分岐はハザードのみ生成。                                                                                                                                                                                              | `aquatic`（`item_pickup`/`hp` 有効・スコア式に `itemsCollected*100`）。アイテムが永久に出現せず HP 回復も不可能。スコア式の該当項が常に 0。 |
| 中     | 弾の当たり判定が退化している                 | `src/game/entities.ts`（`rectsOverlap` 既定 `grace=4`）, `src/game/systems/shootSystem.ts`                                               | 弾は `h=5` だが `rectsOverlap` は上下各 4px を内側に縮める。縮小後の高さが `5-8=-3`（負）になり、弾の縦当たり判定が退化。命中がシビア／不安定。アイテム判定は `grace=0` を明示しているのに弾は未指定のまま。                                                                          | STG 系全ジャンルの射撃命中精度。                                                                                                            |
| 中     | `learningRules` がローダで欠落し全体が死蔵   | `src/framework/ManualLoader.ts`（`parseEntry` L168-179）, `src/data/manuals/action-branch.json`（L60）                                   | `action-branch.json` に `learningRules` が定義されているが、`parseEntry` の返却オブジェクトに `learningRules` フィールドが含まれない。結果 `manual.learningRules` は常に undefined で LearningSystem が一度も発火しない。                                                             | LearningSystem 全体（行動学習によるキー無効化・ハザード反転・フィーチャー強制）。記述済みのデータが死蔵。                                   |
| 中     | 操作のジャンル単位一元管理が不可能           | `src/domain/types.ts`（`GenreDef`）, `src/domain/ruleEngine.ts`（L65）, `src/data/manuals/*.json`                                        | `GenreDef` に `controls` フィールドが無く、`ruleEngine` は説明書バージョンの `controls` をそのまま採用する。ジャンルが確定しても操作を自動で切り替える仕組みがない。※`ManualLoader` の既定マージにより、デフォルト操作のままなら各 JSON の `controls` 省略は可能。                    | ジャンルごとに操作を変えたい場合、到達しうる全説明書バージョンを個別編集する必要がある。                                                    |
| 中     | `DEFAULT_CONTROLS` の3重定義とデッドコード   | `src/data/gameBalance.ts`（L103）, `src/framework/ManualLoader.ts`（L20）, `src/framework/ManualBuilder.ts`（L25）                       | `DEFAULT_CONTROLS` が3ファイルで独立定義。`gameBalance.ts` のものは export されているが import 元がなく、実際に使われているのは Loader / Builder 各自のローカル定義。`gameBalance.ts` を変更しても挙動は変わらない。                                                                  | デフォルトキーバインド変更時に3箇所の同期が必要。`gameBalance.ts` を直しても無反応という罠がある。                                          |
| 低     | 到達不能な条件分岐                           | `src/game/sideScroller.ts`（横ブロック `r.gravity === 0` 分岐 L507）                                                                     | 横モードに無重力分岐（`p.vy *= Math.pow(0.05, dt)`）が存在するが、全ジャンルが `gravity:1600` のため現状到達不能。将来 `gravity:0` の横ジャンルを追加したときに初めてテストされるリグレッション温床。                                                                                 | 現状実害なし。                                                                                                                              |
| 低     | `forceGenreId` と gravity の不整合           | `src/domain/ruleEngine.ts`（L33, L72）                                                                                                   | `forceGenreId` 指定時、`features` は強制先ジャンルで再合成されるが、`gravity` は強制前の `genreDef` 由来になる。強制先ジャンルが異なる gravity を持つ場合に食い違う。                                                                                                                 | `forceGenreId`（テスト・演出用途）使用時のみ発生。                                                                                          |
| 低     | フォールバック移動のデッドコード             | `src/game/systems/ExtraMovementFeature.ts`（L71-78）                                                                                     | `movement` は常時有効で `MovementFeature` が毎フレーム `p.vx` を上書きするため、`ExtraMovementFeature` のフォールバック移動は後勝ちで上書きされ実質デッド。                                                                                                                           | 動作上の実害なし。将来両者のロジックが分岐するとバグ温床になる。                                                                            |
| 低     | readonly 起因の二次故障（潜在）              | `src/game/sideScroller.ts`（`_applyLearningEffect` forceFeature L1304-1308 / changeKey L1313-1316）                                      | `learningRules` 欠落を修正して LearningSystem を有効化しても、`changeKey`（`this.rules.controls.* = ...`）と `forceFeature`（`this.rules.features.add(...)`）は readonly プロキシへの書き込みとなり無効化される。                                                                     | LearningSystem を有効化した際の `changeKey` / `forceFeature` エフェクト。                                                                   |
| 低     | shoot キーの大小文字不整合                   | `src/game/systems/ShootFeature.ts`（L31）, `src/game/sideScroller.ts`（L352）                                                            | `sideScroller.ts` 側は `.toLowerCase()` で正規化するが `ShootFeature.ts` 側は未正規化。`shoot` に大文字 `Z` を設定すると発射不能になる。                                                                                                                                              | 現状の manuals は全て `"z"` のため潜在不具合。                                                                                              |
| 低     | `PuzzleFeature` の RuntimeRules 直接書き換え | `src/game/systems/PuzzleFeature.ts`（L59, L72）                                                                                          | `r.scrollSpeed = 0` / 復元は「毎フレーム読み取り専用」と宣言された共有オブジェクトへの破壊的変更。readonly 問題（上記の高優先度項目）と合わせ、API 設計上の契約違反にもなっている。                                                                                                   | readonly 問題が解消されても、設計上の問題として残る。                                                                                       |
| 低     | `preventDefault` クロージャの固定            | `src/game/sideScroller.ts`（コンストラクタ L137-142）                                                                                    | keydown ハンドラがコンストラクタ引数の `rules.controls` を捕捉。`updateRules` / `changeKey` 後も初期キーのまま更新されず、再マップ後の新キーのブラウザ既定動作が抑止されない。                                                                                                        | キー再マップ・ジャンル変更後。ゲーム入力自体は通るが新キーの既定動作が抑止されない。                                                        |
| 低     | ジャンル収束の単一軸バイアス                 | `src/domain/genreResolver.ts`（`_computeOverflowScore`）                                                                                 | 「全閾値クリア候補のうち超過量合計が最大のジャンルに収束」する実装のため、単一軸・低閾値ジャンルが多軸ジャンルより収束しやすい。バグではないが設計上の偏り。                                                                                                                          | プレイヤーの選択傾向によっては多軸ジャンル（`aerial_stg` 等）に到達しにくい。ジャンル確定の早期化（後述）と複合する。                       |
| 低     | ジャンル確定が早期・貪欲                     | `src/composables/useGameState.ts`（`choose` L78-86）                                                                                     | `resolved !== 'base'` になった瞬間に即 `lockedGenre` を確定する。仕様が想定する2〜4回の選択による多段進行を短絡しうる。                                                                                                                                                               | 低閾値ジャンルに早期収束しやすい。単一軸バイアスと複合して影響が大きくなる。                                                                |
| 低     | 投擲パワーゲージと実速度の式が乖離           | `src/game/throwEngine.ts`（`onDragMove` L46 / `onRelease` L55）                                                                          | ゲージ表示は `dist / powerDistanceDivisor`、実際の初速は `min(maxPower, dist * speedMultiplier)` と別式。ゲージが満タンでも実速度は頭打ちになるケースがある。                                                                                                                         | 投擲フェーズの操作フィードバック（UX）。スコアは実速度ベースなので体感とズレる。                                                            |
| 低     | 未使用フック                                 | `src/engine/FeatureSystem.ts`, `src/game/systems/*.ts`                                                                                   | `onComboChange` / `onItemPickup` / `onPlayerDeath` / `onPlayerJump` は定義・呼び出しはあるが実装クラスが0件。実装漏れなのか意図的な空けなのか判別できない。                                                                                                                           | 保守性への影響のみ。                                                                                                                        |
| 低     | 未実装機能の警告のみ                         | `src/game/systems/ExtraMovementFeature.ts`（L80-85）                                                                                     | `slide` / `gravity_flip` は `console.warn` のみで未実装。現状どのジャンルも有効化していないが、将来ジャンルに割り当てると「押しても何も起きない」不具合に見える。                                                                                                                     | 現状実害なし。                                                                                                                              |
| 低     | `SpawnEntry` の未参照フィールド              | `src/engine/types.ts`（`SpawnEntry`）, `src/game/sideScroller.ts`（`_spawnHazard`）                                                      | `collisionGrace` / `minDist` / `maxDist` / `glowBlurOverride` / 行単位の `pulseSpeed` が JSDoc 付きで機能説明されているが、`_spawnHazard`・衝突判定のどこからも参照されない。特に `collisionGrace` は弾 grace 問題を解決できるはずの項目。                                            | 現状実害なし。JSDoc を信じて設定しても黙って無視される。                                                                                    |
| 低     | `devValidateRegistry` が未呼び出し           | `src/engine/GameRegistry.ts`（`devValidateRegistry`）, `src/engine/index.ts`                                                             | 未登録 FeatureId・`base` ジャンル欠落を検出する関数がエクスポートされているが、どこからも呼ばれていない。`devValidateConfig` は呼ばれているが registry 側は不通。                                                                                                                     | 未登録 Feature（`slide` / `gravity_flip` 等）が開発時にも警告されない。                                                                     |
| 低     | スコア式パーサのサイレント挙動               | `src/domain/scoreCalc.ts`（L69, L97）                                                                                                    | ゼロ除算を黙って 0 に置換、不正数値も `parseFloat` で緩く解釈。式の記述ミスが警告なく通る。                                                                                                                                                                                           | スコア式に除算や不正記述を入れた場合。現状の式群は除算未使用のため潜在的。                                                                  |
| 低     | `ConfigValidator` の検証の隙                 | `src/framework/ConfigValidator.ts`                                                                                                       | `scoreRatioPlay` と `scoreRatioThrow` はそれぞれ [0,1] を個別検証するが、合計が 1.0 になるかは検証されない。`minBpm`/`maxBpm` の大小関係も未検証。                                                                                                                                    | 設定ミスが検証を素通りし、スコア倍率の崩れや BPM 逆転を実行時まで検知できない。                                                             |
| 低     | `useManual` の未解放タイマー                 | `src/composables/useManual.ts`（`recordUpdate` L50-51）                                                                                  | `setTimeout` で `isAnimating`/`isCentered` を戻すが、`restart()` や連続更新時にクリアされない。前の演出タイマーが後から発火して中央表示フラグを誤って解除しうる。                                                                                                                     | 説明書の差分演出の表示タイミングが乱れる可能性（軽微なちらつき）。                                                                          |
| 低     | ビートマーカーの座標がハードコード           | `src/game/systems/rhythmSystem.ts`（L51）                                                                                                | ビートマーカーの X が `Math.random() * 600 + 100`（100〜700px 固定）。canvas 幅に連動しないため、広い画面では左に偏り、幅 700px 未満では画面外に出る。                                                                                                                                | リズム系の視覚演出のみ。                                                                                                                    |

---

## 問題詳細

### [高] 縦スクロールモードの構造的破綻

縦スクロール3ジャンルの上下方向の挙動は、物理・型・実装の3層すべてで成立していない。部分修正では解決しないため、3点をまとめて対応する必要がある。

**（a）物理層 — gravity が参照されない**

`src/game/sideScroller.ts` L402-405:

```ts
// 縦モードでは重力なし。プレイヤーは画面下に固定
p.y = H - BACKGROUND.groundHeight - p.h - 8;
p.vy = 0;
p.onGround = true;
```

プレイヤーの Y 座標が毎フレーム固定値で上書きされ、`r.gravity` は一度も読まれない。`genres.json` に `gravity` を定義しても縦モードでは完全に無効。

**（b）型層 — 上下移動キーが定義されていない**

`src/domain/types.ts` の `Controls`（L126-133）:

```ts
export interface Controls {
  jump: string;
  moveLeft: string;
  moveRight: string;
  shoot?: string;
  dash?: string;
  slide?: string;
}
```

`moveUp` / `moveDown` が存在しない。`RuntimeRules.controls` は `currentVersion.controls` をそのまま使うため、上下移動キーを保持する経路がない。

**（c）実装層 — 移動フィーチャーが上下入力を扱わない**

`MovementFeature.ts` L35-39 の縦分岐は `p.vx`（左右）のみ設定。`ExtraMovementFeature.ts` の `vertical_scroll`（L89-99）はハザードの左右ドリフトのみで、プレイヤーの `p.vy` への入力処理が存在しない。

**影響** — `aerial_stg`（「上を目指す」）・`bullet_hell`・`aquatic`（「深海を探索」）が説明文に反して「下端固定・左右移動のみ・落下物回避」に統一される。

**改善案**

1. `Controls` に `moveUp?: string` / `moveDown?: string` を追加する。
2. `MovementFeature` の縦分岐で `moveUp`/`moveDown` 入力から `p.vy` をセットする。
3. `sideScroller.ts` 縦ブロックの `p.y` 固定を `p.y += p.vy * dt` ＋画面内クランプに変更する。縦モードを意図的に無重力とするなら、後述の gravity 設定問題の仕様判断を先に行うこと。

---

### [高] ジャンル別スコア式がギブアップ完了で無視される

`_recalculatePlayScore()`（`scoreFormula` を `ScoreVars` で評価）は `_die()`（L685）でのみ呼ばれる。

- **死亡経路**: `_die` で `this.playScore` を式の結果に上書き → `finalizeThrowing` で式の値が使われる。
- **ギブアップ経路**: `giveUp()`（`App.vue` L131-134）は `setPaused(true)` 後に `startThrowing` を呼ぶだけ。`_recalculatePlayScore` は走らず、`this.playScore` は `_update` で加算され続けた生の累積値のまま確定する。

通常プレイ（ギブアップ）では `scoreFormula` が一切使われず、式が効くのは死亡時のみという逆転が起きている。

**改善案** — `startThrowing` 直前または `finalizeThrowing` 直前に、生存・死亡を問わず `_recalculatePlayScore()` 相当を確実に通す。`SideScroller` に公開メソッド（例: `getFinalPlayScore()`）を設け、`App.vue` の両経路から呼ぶ。

---

### [高] readonly プロキシにより PuzzleFeature のスクロール停止が無効

`useGameState.ts` は `rules` を readonly で公開し、`App.vue` はそれを `toRaw` 未解除のまま `SideScroller` に渡す。

```ts
// useGameState.ts L127
return { rules: readonly(rules) as RuntimeRules, ... }

// App.vue L54, L125
scroller = new SideScroller(canvas, gameState.rules)
scroller.updateRules(gameState.rules, currentManual)
```

`PuzzleFeature.ts` L59, L72 の `r.scrollSpeed = 0` / 復元は Vue の readonly により **no-op**（dev では毎フレーム警告）。solve フェーズでもスクロールは止まらず、パズル配置が成立しない。`as RuntimeRules` のキャストにより型エラーも出ないため、コンパイル時に気付けない。

**改善案** — `SideScroller` には `toRaw(gameState.rules)` を渡す。あるいはスクロール停止を `rules` の直接変更ではなく `MutableWorld` の専用 API（例: `world.setScrollPaused(true)`）で行い、`rules` を真に不変として扱う。

---

### [中] `genres.json` の gravity 定義が実態と乖離している

縦3ジャンルに `gravity:1600` が明示されているが、縦モードのコードはそれを参照しないため no-op。値を変更しても挙動は変わらない。

**改善案** — 縦スクロールの構造的破綻（上記）の対応と一体で判断する。「縦モードを意図的に無重力とする」仕様なら、縦3ジャンルの `gravity` を削除またはコメントで無効を明記し、`docs/adding-content.md` に注記する。重力を効かせる仕様なら物理修正と合わせて反映する。

---

### [中] 縦スクロールモードでアイテムが一切スポーンしない

`sideScroller.ts` の `_spawnHazard()` は縦/横の分岐構造になっており、アイテム生成処理（`r.features.has('item_pickup')` 判定と `this.items.push(new Item(...))`）が横スクロール分岐（else）の中にのみ存在する。

`aquatic` は `scrollDirection: vertical` かつ `enableFeatures: [hp, item_pickup]`、`scoreFormula: distance * 0.8 + itemsCollected * 100 + survivedSec * 12`。アイテムが永久に出現しないため `itemsCollected` は常に 0 で、スコア式の該当項が死亡し、HP 回復も不可能になる。

**改善案** — 縦分岐にもアイテムスポーン処理を追加する（上端スポーン・落下挙動に合わせる）。または `aquatic` を横スクロール扱いにするか、スコア式と feature を縦モードの実態に合わせる。

---

### [中] 弾の当たり判定 grace が弾の高さを上回り退化している

```ts
// entities.ts
export function rectsOverlap(a: Rect, b: Rect, grace = 4): boolean {
  const ag = { x: a.x + grace, y: a.y + grace, w: a.w - grace * 2, h: a.h - grace * 2 }
  ...
}
```

`shootSystem.ts` は `rectsOverlap(b.rect, h.rect)` を **既定 grace=4 のまま** 呼ぶ。`Bullet.h=5` なので縮小後の高さが `5-8=-3`（負）になり、弾の縦当たり判定が退化する。`RpgFeature` のアイテム判定は `grace=0` を明示しているのに弾は未指定のまま不整合。

**改善案** — `rectsOverlap` 内で `grace` を各辺サイズの半分以下にクランプする、または弾の衝突では `grace` を `0`〜`1` で明示する。

---

### [中] `learningRules` がローダで欠落し LearningSystem が全体で死蔵

`action-branch.json` L60 に `learningRules` が定義されているが、`ManualLoader.parseEntry` の返却オブジェクトに `learningRules` フィールドが含まれない。

結果として:

1. `manual.learningRules` が常に undefined。
2. `sideScroller.updateRules` が `this.learningRules = null` をセット。
3. `_update` の LearningSystem 評価ブロックは `if (this.learningRules)` で常にスキップ。

行動学習（`disableAction` / `invertHazard` / `forceFeature` / `changeKey`）は実プレイで一切発火しない。データ・評価ロジック・適用ロジックは実装済みだが、ローダの1フィールド欠落で全体が不通になっている。

なお修正後は readonly 問題（高優先度）により `changeKey` と `forceFeature` が無効化されるため、concurrent に対応が必要。

**改善案** — `parseEntry` の返却に `learningRules: entry.learningRules` を追加し、`framework/config-types.ts` にも型を定義する。

---

### [中] 操作のジャンル単位管理が不可能な構造

`ruleEngine.ts` L65:

```ts
controls: currentVersion.controls,  // GenreDef は一切関与しない
```

`GenreDef` に `controls` フィールドがないため、「このジャンルになったら操作を変える」をデータ駆動で表現できない。ジャンル別に操作を変えたい場合、到達しうる全説明書バージョンの `controls` を個別に編集する必要がある。

なお `ManualLoader.ts` L121-125 が `{ ...DEFAULT_CONTROLS, ...entry.controls }` でマージするため、デフォルト操作のままなら各 JSON での `controls` 省略は可能。実質的な差分は `shoot:"z"` などを追加している十数件のみ。

**改善案** — `GenreDef` に `controls?: Partial<Controls>` を追加し、`ruleEngine` で `{ ...currentVersion.controls, ...genreDef.controls }` のようにマージする（gravity の優先順位設計と同じ構造）。

---

### [中] `DEFAULT_CONTROLS` の3重定義とデッドコード

```
src/data/gameBalance.ts:L103        export const DEFAULT_CONTROLS  ← import 元なし（デッド）
src/framework/ManualBuilder.ts:L25  const DEFAULT_CONTROLS         ← ローカル定義
src/framework/ManualLoader.ts:L20   const DEFAULT_CONTROLS         ← ローカル定義
```

3ファイルが同一内容を独立定義している。`gameBalance.ts` のものは export されているが import 元が存在せず、実際に使われているのは Loader / Builder 各自のローカル定義。`gameBalance.ts` を変更しても挙動は変わらない。

**改善案** — 共通モジュール（例: `src/domain/defaults.ts`）に1定義にまとめ、Loader / Builder がそれを import する。操作のジャンル単位管理（上記）の改善と同時に着手すると整合しやすい。

---

## 未調査・不明点

- 縦モードを「無重力」とする設計が意図的かどうかは、コードのコメント（「縦モードでは重力なし」）だけでは断定できない。構造的破綻の対応前に仕様の確認が必要。
- `src/data/manuals/` 配下で `runtimeConfig.gravity` に 0 または 1600 以外を設定している JSON があるかは全件確認していない。存在すれば「到達不能分岐」の評価が変わる可能性がある。
- `genreResolver` の単一軸バイアスが実プレイで問題になるかどうかは、各説明書の `genreParams` 配分を定量分析していないため断定できない。
- 本レポートの動的確認は未実施（静的コード確認のみ）。grid_stop 不動作・ギブアップ時スコアの乖離・learningRules 死蔵は実際の画面挙動での再現確認を推奨する。
- UI コンポーネント（`ManualPanel.vue` / `ThrowOverlay.vue` / `EndingPanel.vue` / `ChoicePanel.vue` / `Hud.vue`）、`SoundManager`、`tutorial` 配下は調査対象外。
