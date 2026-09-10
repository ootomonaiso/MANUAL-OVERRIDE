# 06. データ層 / config 層

親: [README.md](README.md)
対象: `src/data/config/{battle,encounter_groups,skill_points}.json` / `src/framework/{config-types,ConfigValidator,ConfigLoader}.ts` /
`src/data/rpg/**` / `src/data/genres/rpg.json`

---

## 0. 数量サマリ（実測）

| ディレクトリ | ファイル数 | 備考 |
|---|---:|---|
| `src/data/rpg/skills/` | 52 | active 30 / passive 22 |
| `src/data/rpg/traits/` | 22 | |
| `src/data/rpg/enemies/` | 22 | うち isBoss は5体 |
| `src/data/rpg/enemy-sets/` | 26 | A:4 B:6 C:8 D:5 E:3（**全件がグループに登録済み**） |
| `src/data/rpg/battle-effects/` | 24 | JSON から参照されるのは6件のみ（§4-3） |
| `src/data/rpg/battle-backgrounds/` | 5 | 通常4 + `bossOnly` 1（`bg_sanctum`） |
| `src/data/rpg/battle-guide.json` | 1 | sections 6 / terms 28 |
| `src/data/config/` | 30 | うち rpg 専用3 |

**参照整合性の結論: dangling ID（未定義参照）は0件。**
`enemy-sets → enemies` / `enemies → skills, traits` / `enemies.actionPattern ⊂ activeSkills` /
`encounter_groups.groups → enemy-sets` / `skills.effects[] → battle-effects` / `skills.transformsInto → skills`
のすべてを実際にクロス参照した結果、違反なし。orphan は §4-3 の battle-effects 18件のみで、
これは TS 側からの文字列参照であるため別種の問題。

---

## 1. `config-types.ts`（727行）の分割

### 1-1. 内訳

ジャンル固有型（rpg 3型 + survival + puzzle + rhythm + stealth）だけで **約200行 = 全体の28%**。
演出系（vfx/background/hazard_vfx/pixelart/camera）が約130行。最大は `SurvivalConfig`（`:434-506`、73行）、
次いで `BattleConfig`（`:356-400`、45行）。

### 1-2.【med】1ファイルにドメインが混在している

1. CLAUDE.md「300行の目安」を2.4倍超過。
2. **rpg 戦闘の型が、横スクロール本体の物理型と同じファイルにある。**
   CLAUDE.md は「`rpg/` 配下は他ジャンルが一切参照しない」というデータ側の分離を謳っているが、
   **型定義側にはその分離が反映されていない**。rpg のバランス項目を1つ足すたびに、全ジャンルが import する巨大ファイルが変更される。
3. `src/domain/battle/battleEngine.ts:9`（`EncounterGroupsConfig`）と `src/game/systems/PuzzleFeature.ts:26`（`PuzzleGridConfig`）が
   `framework/index.ts` を経由せず `config-types` を直接 import している（§1-4）。分割時に破壊しやすい。

### 1-3. 分割案（Phase 4 / import を1行も書き換えない）

`src/framework/config/` を新設し、`config-types.ts` を **re-export barrel に痩せさせる**。
既存の import 文（`from './config-types'` / `from '../framework/config-types'`）は**一切変更しない**。

    src/framework/config/
    ├── core.ts        # PhysicsConfig, ShootConfig, SpawnConfig, ThrowConfig, DifficultyConfig, BossConfig   (~110行)
    ├── visual.ts      # VfxConfig, CameraConfig, BackgroundConfig, HazardVfxConfig, PixelartConfig          (~150行)
    ├── ui.ts          # UiConfig, HudSafezoneConfig                                                          (~40行)
    ├── scoring.ts     # ScoreConfig, GameBalanceConfig                                                       (~45行)
    ├── convergence.ts # BayesConfig, GenreParamsConfig                                                       (~25行)
    ├── features.ts    # SpecialConfig, NearMissConfig, ExtraMovementConfig                                   (~55行)
    ├── genre.ts       # GenreVisualConfig, GenreDefJSON, GenreDefJSONInput, ThemeColorDef, GenresConfig,
    │                  # GenreDefaultsConfig, PaletteDefaultsConfig                                           (~90行)
    └── genres/
        ├── rpg.ts       # BattleConfig, EncounterGroupsConfig, SkillPointsConfig                             (~80行)
        ├── survival.ts  # SurvivalConfig                                                                     (~75行)
        ├── puzzle.ts    # PuzzleGridConfig, PuzzleConfig                                                     (~25行)
        ├── rhythm.ts    # RhythmTuningConfig                                                                 (~20行)
        └── stealth.ts   # StealthConfig                                                                      (~10行)

`config-types.ts` には `export type * from './config/…'` の列と `GameConfigMap`（現行 693-725）だけを残す（約45行）。

- **挙動不変性:** 型のみの移動で実行時コードは1行も動かない。`vue-tsc --noEmit` が通れば等価。
- **副次効果:** `genres/rpg.ts` ができることで「rpg のバランス項目を足す＝rpg のファイルだけ触る」が成立し、
  CLAUDE.md の rpg 分離方針が型側にも及ぶ。

### 1-4.【med】`framework/index.ts` の公開 API が config-types の一部しか再輸出していない

`src/framework/index.ts:31-49` が再輸出しているのは21型。**未輸出は16型**:
`BattleConfig` / `EncounterGroupsConfig` / `SkillPointsConfig` / `PuzzleConfig` / `PuzzleGridConfig` / `SurvivalConfig` /
`PixelartConfig` / `BayesConfig` / `SpecialConfig` / `NearMissConfig` / `HudSafezoneConfig` / `ExtraMovementConfig` /
`GenreDefaultsConfig` / `PaletteDefaultsConfig` / `GenreVisualConfig` / `ThemeColorDef`。

結果として `battleEngine.ts:9` と `PuzzleFeature.ts:26` が barrel を迂回して深いパスを直接 import している。
**公開境界が「index.ts に載っているもの」なのか「config-types にあるものすべて」なのかが曖昧で、
次に型を足す人がどちらに追記すべきか判断できない。**

**修正案:** `index.ts:31-49` の型リストを `export type * from './config-types'` 1行に置き換える。
型のみの再輸出なのでバンドルサイズにも実行時挙動にも影響しない。
その上で `battleEngine.ts:9` / `PuzzleFeature.ts:26` を `from '../../framework'` へ寄せる（任意・別コミット可）。

---

## 2. 設定キーの一貫性 / TS に残るバランス値

### 2-1.【high】`section` 名の命名規則が rpg 3ファイルだけ camelCase

- `encounter_groups.json:3` → `"section": "encounterGroups"`
- `skill_points.json:3` → `"section": "skillPoints"`
- **対する既存27ファイルはすべて snake_case で、かつファイル名と完全一致**
  （`hazard_vfx.json`→`hazard_vfx` / `genre_params.json`→`genre_params` / `near_miss.json`→`near_miss` /
  `extra_movement.json`→`extra_movement` / `palette_defaults.json` / `rhythm_tuning.json` / `hud_safezone.json` /
  `game_balance.json` / `genre_defaults.json`）。
- `config-types.ts:723-724` の `GameConfigMap` も同2つだけ camelCase で、他25キーは snake_case。

**なぜ問題か:**

1. **`ConfigValidator.ts:128` のエラーメッセージが嘘をつく。** `REQUIRED_SECTIONS` に `encounterGroups` を足した瞬間、
   欠損時に「`src/data/config/encounterGroups.json` を確認してください」と、**存在しないファイル名を案内する**。
   他の27セクションではこのメッセージが正しく機能している（section 名 = ファイル名という不変条件に依存している）。
2. 将来「ファイル名 ↔ section 名」を機械的に検証するチェックを足せない。
3. AIエージェント／新規開発者が「新しい config はどちらの記法か」を既存から推論できない。

**修正案（Phase 2 / 挙動不変）:** `section` を `encounter_groups` / `skill_points` に変更し `GameConfigMap` のキーも同名に。
参照箇所は `src/data/tunables.ts:151, :156` と `ConfigValidator.ts:200, :224` の4箇所のみ。
**エクスポート名 `ENCOUNTER_GROUPS` / `SKILL_POINTS` は変えない**ので、利用側
（`battleEngine` / `skillDraft` / `skillPanel` / `stats` / `useBattleState` / `BattleScreen.vue`）は無変更。ランタイム値は完全に同一。

### 2-2.【high】TS に残っている rpg バランス値の全リスト（Phase 6）

CLAUDE.md「ソースコード内に数値リテラルを直書きしない / ゲームバランス値は `src/data/config/*.json` へ」に照らして、
以下は JSON へ移すべき値。**値は1つも変えず、現行リテラルをそのまま写すこと。**

| file:line | 現状 | 何の値か | 提案 |
|---|---|---|---|
| `battleEngine.ts:30-33` | `INITIAL_SKILLS` | **プレイヤーの初期スキルと得意ステータス**。ゲーム開始時のビルドを決める最重要のコンテンツ値。`playerSprite` は `battle.json:26` にあるのに初期スキルだけコード側という非対称 | `battle.json` → `initialSkills`。副次利得として `validate-json.mjs` で「id が実在の active スキル」を検証できるようになる |
| `skillDraft.ts:74, 105` | `3 * a.level` | アクティブのカテゴリ寄与係数（**同じ 3 が2箇所**） | `skill_points.json` → `categoryPointPerActiveLevel` |
| `skillDraft.ts:82, 111` | `1 * p.level` | パッシブの寄与係数（**同じ 1 が2箇所**） | `skill_points.json` → `categoryPointPerPassiveLevel` |
| `skillDraft.ts:52` | `0.75 - 0.25 * (n-2)²` | サブカテゴリ合計重みの曲線。バランス調整の主要ノブ | `skill_points.json` → `subCategoryWeight: { base, curvature, center }` |
| `skillDraft.ts:199, 205` | `3` | **ドラフトの提示枚数（3択）**。ゲームデザインの根幹値がループ条件に埋まっている | `skill_points.json` → `draftOptionCount` |
| `skillDraft.ts:247` | `addActivePoints(existing, 1)` | 重複ドラフト選択時のポイント量 | `skill_points.json` → `duplicatePickPoints`（`duplicateDraftWeight` の隣） |
| `skillDraft.ts:255` / `BattleScreen.vue:158, 516` | `4` | **アクティブ枠数が3箇所に重複**。片方だけ直すと枠がずれる | `battle.json` → `activeSlotCount` |
| `damageCalc.ts:14` | `(def + ref) / 4` | special 属性の防御参照の除数。カット率式（`battle.json:15`）は JSON 化済みなのにこの 4 だけ TS | `battle.json` → `cut.specialDefenseDivisor` |
| `damageCalc.ts:69` | `Math.pow(2, stage)` | 相性1段階あたりの倍率。`battle.json:17` に `affinity.weakStage/resistStage` はあるのに**倍率の底だけ TS** | `battle.json` → `affinity.stageMultiplier` |
| `useBattlePresentation.ts:48` | `timing.flashMs + 80` | クリティカルの画面フラッシュ余韻。他の演出尺は全て `battle.json:27-35` にあるのにこの +80 だけ直書き | `battle.json` → `presentation.criticalFlashTailMs` |
| `BattleScreen.vue:99` | `Math.min(Math.max(count,1),5)` | `enemyScaleByCount` の**キー範囲 1..5 がコード側に二重定義**。**敵6体編成を足す時に JSON だけ直しても効かない** | `Object.keys(BATTLE.enemyScaleByCount.spriteScale)` の最大値から導出 |
| `BattleScreen.vue:103, 107` | `?? 1` / `?? 40` | `battle.json:38-39` の `"1": 1.0` / `"1": 40` と**同値の重複** | 上のキー導出にすれば `??` 自体が不要になる |
| `BattleScreen.vue:75` | `FLOOR_TOP = 0.485` | 床位置。`hud_safezone.json` に比率を置く前例がある | `battle.json` → `layout.floorTopRatio`（**low**） |
| `BattleScreen.vue:92, 110` | `0.34` / `(isBoss ? 0.36 : 0.27)` | スプライト高比率 | `battle.json` → `layout.*`（**low**） |

（domain 側のその他のマジックナンバーは [02-domain.md](02-domain.md) §4 に一覧）

### 2-3.【high】スコア式の重複

→ [01-cross-cutting.md](01-cross-cutting.md) §3-4。
`useBattleState.ts:47` の `RPG_SCORE_FORMULA_FALLBACK` は `src/data/genres/rpg.json:8` と**文字単位で同一**。
`game_balance.json` に既存の `defaultScoreFormula` へ落とし、`rpg.json` を単一の出所にする。

### 2-4.【med】`unlockCondition.points` が22ファイルに散在し `categoryUnlockThresholds` と二重管理

- `battle.json:21` → `"categoryUnlockThresholds": [10, 20, 35]`
- `skills/passive_*_mastery.json`（11ファイル、各 `points: 10`）
- `traits/trait_*_zenith.json`（11ファイル、各 `points: 20`）

**実測すると11件すべてが 10、11件すべてが 20 で例外ゼロ。** つまり「第1段階＝mastery、第2段階＝zenith」という規則が
22ファイルにコピーされている。段階を 10→12 に調整するには22ファイルの一括編集が必要。

さらに **`categoryUnlockThresholds` の第3要素 35 はどこからも使われていない**
（`skillDraft.ts:118-121 nextCategoryThreshold` が UI の「次のしきい値」表示に使うだけ）。
つまり第3段階のコンテンツが未実装なのにしきい値だけ先に入っている＝ stale value。

**修正案:**
(a) **短期（Phase 8）** — 現状維持のうえ `validate-json.mjs` に
「`unlockCondition.points` は `battle.json.categoryUnlockThresholds` のいずれかの値であること」の検証を追加（挙動不変・タイポ防止）。
(b) 中期 — `unlockCondition` を `{ category, tier: 1 }` 形式にし tier→points の解決を `battle.json` 側で行う（→ [07-deferred.md](07-deferred.md)）。
(c) `35` は使われるまで削るか `$comment` で「第3段階は未実装」と明記する。

### 2-5.【med】`battle-guide.json` の説明文がバランス値を日本語で二重管理

`battle-guide.json:66` — `"evadeRate": { … "上限は80%。" }` が `battle.json:16` の `evade.max = 0.8` を日本語で焼き込んでいる。
`max` を 0.75 に調整するとガイドが嘘になる。`:67 critRate` の「上限はなく」も `stats.ts:72-73` のコメント上の仕様に依存。

**修正案:** ガイド本文に `{evadeMax}` のようなプレースホルダを許し `battleGuide.ts` で `BATTLE` から差し込む。
あるいは最低限 `$comment` で「battle.json.evade.max と連動」と明記して検出可能にする。

### 2-6.【low】`CATEGORY_LABEL` が TS と JSON に二重定義

`skillText.ts:13-16`（11件）と `battle-guide.json:69-79`（`terms[id].label` 11件）。**ラベル文字列が一致しているのは現状偶然。**

**修正案:** `skillText.ts` の `CATEGORY_LABEL` を `battle-guide.json` の `terms[id].label` から導出する
（`battleGuide.ts` に移す）。表示文字列は同一なので挙動不変。
> ※ [02-domain.md](02-domain.md) §2-1 の「ラベルは `skillText.ts` に集約する」方針と整合させること。
> 「文字列の出所は JSON、参照点は `skillText.ts`」が両立解。

---

## 3. 検証の三重化

### 3-1. 現状

battle 系 config は **3つの独立した仕組み**で検証されている。

1. `ConfigValidator.ts` — ランタイム（dev のみ。`:259` で `PROD` は即 return）。
   `REQUIRED_SECTIONS`(`:19-24`) / `REQUIRED_NUMBER_FIELDS`(`:26-47`) / `RANGE_CHECKS`(`:49-119`)
   + **battle/encounterGroups/skillPoints は入れ子のため個別の手書きブロック**（`:161-241`、計81行）。
2. `scripts/validate-json.mjs` — CI / `npm run validate`。`SCHEMAS`(`:18-38`) の必須キーリスト +
   `validateEncounterGroups`(`:679-698`) の参照整合性。
3. `schemas/battle-*.schema.json`（6本）— ajv。
   ただし **対象は `src/data/rpg/**` のコンテンツ JSON のみで、`src/data/config/*.json` には JSON Schema が1本も存在しない**
   （実測: `src/data/config/*.json` で `$schema` を持つファイルは 0/30）。

### 3-2.【high】新しい config キーを1つ足すのに最大6箇所

| # | file:line | 忘れるとどうなるか |
|---|---|---|
| 1 | `src/data/config/battle.json` | — |
| 2 | `config-types.ts:357-400 BattleConfig` | TS で参照できない（**コンパイルエラーなので気づける**） |
| 3 | `ConfigValidator.ts:163-178` の `nested` 配列 | **サイレント。** 不正値がそのまま通る |
| 4 | `validate-json.mjs:34-36` の `SCHEMAS['battle.json']` | **サイレント。** キー欠落を CI が見逃す |
| 5 | `framework/index.ts:31-49` | 外部から import できない（新型を足す場合） |
| 6 | `CLAUDE.md:194-220` の設定ファイル表 | ドキュメント drift |

**新しい*セクション*（config ファイル1本）を足す場合はさらに** `ConfigValidator.ts:19-24 REQUIRED_SECTIONS` と
`src/data/tunables.ts` のエクスポートが加わり **8箇所**。

**修正案（Phase 8 / 段階的・挙動不変）:**

1. **まず 3 と 4 の重複を潰す。** `schemas/config-battle.schema.json` 等を新設し、
   `validate-json.mjs` は ajv で、`ConfigValidator.ts` は同じ schema JSON を import して検証する。
   これは `validate-json.mjs:175-177` が `schemas/genre.schema.json` を single source of truth として読んでいる**既存パターン**と同じ。
   編集箇所が「JSON + 型 + スキーマ」の3つに減る。
2. `REQUIRED_SECTIONS` を手書きリストではなく `GameConfigMap` のキー集合と JSON の実在セクションの突き合わせに変える。

### 3-3.【high】`REQUIRED_SECTIONS` に9セクションが欠落し、検証がサイレント無効化されている

`ConfigValidator.ts:19-24` に列挙されているのは21セクション。`GameConfigMap`(`:694-725`) は28セクション。
**欠落:** `hud_safezone` / `bayes` / `special` / `puzzle` / `extra_movement` / `survival` / `near_miss` /
**`encounterGroups`** / **`skillPoints`**。

`encounter_groups.json` を削除／`section` をタイポしても `ConfigValidator` は「セクションが無い」と言わない。
`:200` / `:224` の `if (config.encounterGroups)` は **falsy なら丸ごとスキップ**する設計なので、**検証が静かに無効化される**。
`skillPoints` が欠けると `skillDraft.ts:18` の `SKILL_POINTS.pointsForLevel.length` が実行時に `TypeError` で落ちるが、
その手前で検証が警告を出せない。

**修正案（Phase 2）:** `REQUIRED_SECTIONS` に9件を追記。
挙動としては dev コンソールの検証が強化されるだけで、**正常なリポジトリ状態では出力は変わらない**（追加9セクションはすべて実在）。

### 3-4.【med】`validate-json.mjs` の `SCHEMAS` に `skill_points.json` の項目が無い

`validate-json.mjs:18-38`。`battle.json`(`:34-36`) と `encounter_groups.json`(`:37-38`) はエントリを持つが、
**`skill_points.json` は無い**。`:820` の `SCHEMAS[name] ?? ['section']` により `section` キーの存在しか検証されず、
`pointsForLevel` を消しても CI は緑のまま実行時に落ちる。
加えて `battle.json` のエントリは `postBattleHealRate`（`battle.json:24` に実在）を必須に含めていない。

**修正案（Phase 2）:** `'skill_points.json': ['section','pointsForLevel','levelMultiplierStep','panelIntervalBattles','panelSkillPoints','panelStatPoints','duplicateDraftWeight']` を追加し、
`battle.json` のリストに `postBattleHealRate` を追加。

### 3-5.【med】`encounterGroups` の参照検証が2箇所で重複実装

- `ConfigValidator.ts:200-221`（groupOrder ⊂ groups、spawnWeightTiers.weights ⊂ groupOrder）
- `validate-json.mjs:679-698`（groups の値 ⊂ 実在 enemy-set、spawnWeightTiers.weights ⊂ groupOrder）

重なっているのは spawnWeightTiers のチェックのみで、それ以外は片方にしかない。
つまり**「どちらを見れば全体像が分かるか」が存在しない**。
ConfigValidator 側は `enemy-sets` の実在を見られない（ブラウザ側で glob が要る）ため役割分担としては妥当だが、
**その分担がコメントに書かれていない**。

**修正案（Phase 2）:** 両者のヘッダコメントに「ランタイム側＝構造のみ／ビルド側＝コンテンツ参照整合性」と役割を明記する（コードは変えない）。
将来的には spawnWeightTiers チェックを `validate-json.mjs` に寄せて ConfigValidator 側から削る。

### 3-6.【med】`KNOWN_OP_IDS` と `allowedOps` の二重定義

`registry.ts:60-64` の `KNOWN_OP_IDS` と `schemas/battle-skill.schema.json:9-11` の `allowedOps` は
**15件が完全一致する二重定義**（→ [05-tools.md](05-tools.md) §4-1）。

**修正案（Phase 8 / 挙動不変）:** `validate-json.mjs` が `genre.schema.json` を single source of truth にしている既存パターンに倣い、
`KNOWN_OP_IDS` を `schemas/battle-skill.schema.json` の enum から生成する（Vite の JSON import で可能）。

### 3-7.【low】カテゴリ enum が4箇所に重複

`types.ts:74-80 CategoryId` / `schemas/battle-skill.schema.json` の `mainCategory` enum と `subCategories` enum
（**同一ファイル内でも2回**）/ `battle-guide.json:69-79` の terms / `skillText.ts:13-16 CATEGORY_LABEL`。
カテゴリを1つ足すと5箇所。**修正案:** schema 内は `$defs` + `$ref` で1箇所化（ajv の挙動は不変）。

---

## 4. `src/data/rpg/**` コンテンツの整合性

### 4-1.【—】`$schema` の相対パスは全件一貫している（良好）

`skills`/`traits`/`enemies`/`enemy-sets`/`battle-effects`/`battle-backgrounds` の**全151ファイルが
`"../../../../schemas/battle-*.schema.json"` で統一**。`src/data/genres/*.json` は22件すべて `"../../../schemas/genre.schema.json"`、
`src/data/cards/*.json` は3件すべて `"../../../schemas/cards.schema.json"`。**逸脱ゼロ。**
`contentEditorPlugin.mjs:288` が保存時にこの深さを付与しているため今後も維持される見込み。

**ただし** `src/data/config/*.json` は30件すべてが `$schema` を持たない（§3-1）。
**rpg コンテンツだけがスキーマ駆動で、config はそうでないという非対称がある。**

### 4-2.【med】キー順の揺れと、`effect` / `effects` の紛らわしい命名

- **キー順:** `enemies`(22) / `enemy-sets`(26) / `battle-effects`(24) は**キー順が完全に1種類**で理想的。
  一方 `skills` は **7通り**、`traits` は3通り、`battle-backgrounds` は3通り。
  skills の揺れは任意キー（`minRound` / `transformsInto` / `draftable` / `unlockCondition`）の挿入位置が場当たり的なため。
- **`effect` vs `effects`:**
  - `effect`（単数）= 効果ロジックの op 配列（全52件に存在、必須）
  - `effects`（複数）= 詠唱演出のエフェクトID配列（27件のみ、`timing:"onCast"` 限定）
  - **1文字違いで全く別の概念。** `validate-json.mjs:729-747` にわざわざ長い注意書きが必要になっている時点で、
    命名が説明を要求している。

**修正案:**
- **キー順** — `contentEditorPlugin.mjs` の保存時に schema の `properties` 宣言順へ正規化する処理を足せば、以後自動で揃う（値は不変）。**Phase 8。**
- **`effects` → `castEffects` へのリネーム** — 表示挙動は不変だが27ファイルのマイグレーションを伴う。→ [07-deferred.md](07-deferred.md)。

### 4-3.【high】battle-effects 24件中18件が JSON からは orphan、実際は TS の文字列リテラルから参照されている

- **JSON（`skills[].effects[]`）から参照される6件:** `fx_cast`(1) / `fx_cast_magical`(8) / `fx_cast_none`(5) /
  `fx_cast_physical`(4) / `fx_cast_special`(3) / `fx_slash`(6)
- **TS から文字列リテラルで参照される18件:**

| effect id | 参照元 |
|---|---|
| `fx_hit_physical` / `fx_hit_magical` / `fx_hit_special` / `fx_hit_none` | `effectOps/damage.ts:103`（**テンプレートリテラル** `` fx_hit_${element} ``）/ `useBattlePresentation.ts:108,141,208,221,225` |
| `fx_miss` | `damage.ts:71` / `useBattlePresentation.ts:171` |
| `fx_weakness` | `damage.ts:106` / `useBattlePresentation.ts:190` |
| `fx_resisted` | `damage.ts:107` / `useBattlePresentation.ts:193` |
| `fx_shield_break` | `damage.ts:108` |
| `fx_defeat` | `damage.ts:109` / `battleEngine.ts:470` / `useBattlePresentation.ts:157` |
| `fx_heal` | `effectOps/heal.ts:68` / `useBattlePresentation.ts:111,155` |
| `fx_shield_gain` | `effectOps/shield.ts:40` / `useBattlePresentation.ts:112` |
| `fx_buff` / `fx_debuff` | `effectOps/modifier.ts:60` / `battleEngine.ts:467` |
| `fx_critical` / `fx_super_critical` | `effectOps/criticalFx.ts:13,15` / `useBattlePresentation.ts:178,183,186,226` |
| `fx_guard` / `fx_evade` | `useBattleState.ts:380` |
| `fx_level_up` | **どこからも参照されていない（真の dead data。実測確認済み）** |

**なぜ問題か:**

1. `fx_hit_physical.json` をリネームすると**ビルドもバリデータも通る**が、実行時に演出が無言で消える。
   `validate-json.mjs:729-747 validateBattleEffectReferences` は `skills[].effects[]` しか見ておらず TS 側の文字列を検査しない。
   **18件（=全体の75%）が検査の外にある。**
2. `damage.ts:103` はテンプレートリテラルなので grep でも見つけにくい。
3. `fx_level_up` は完全な dead data。

**修正案（Phase 2 / 挙動不変）:** `src/domain/battle/effectIds.ts` を新設し、TS 側が使う18個の ID を
`export const FX = { hitPhysical: 'fx_hit_physical', … } as const` として1箇所に集約。
各 emit を `FX.hitPhysical` に置換（**値は同一文字列なので挙動不変**）。
そのうえで `validate-json.mjs` に「`effectIds.ts` の値がすべて `battle-effects/` に実在すること」の検査を1本足す（約10行）。
`fx_level_up` は削除するか `$comment` で「未使用（レベルアップ演出の予約）」と明示。

### 4-4.【low】skills の任意フィールドの使用実態（stale / 一点物）

| フィールド | 出現数 | 内訳 |
|---|---:|---|
| `minRound` | **1** | `skill_arcane_bombardment.json` のみ（`=2`） |
| `transformsInto` | 2 | `skill_riichi` ↔ `skill_tsumo` の相互参照のみ |
| `grantsBonusOnTransformUse` | **1** | `skill_riichi.json` のみ |
| `draftable: false` | 4 | `skill_stance_{guard,idle,watch}` + `skill_tsumo` |
| `element` / `cooldown` / `defaultFocus` / `focusRange` | 30 | active 全件（passive 0件）— schema は `required` に入れられず description で「active のみ必須」と書くのみ |
| `sfx` / `effects` | 27 | active 30件中3件（`skill_stance_*`）が欠く |

`minRound` / `grantsBonusOnTransformUse` は**各1ファイルだけのために** schema・`types.ts`・`BattleScreen.vue:156-157`・
`skillText.ts` に分岐が入っている。将来の読み手が「これは汎用機構か、麻雀スキル専用のハックか」を判断できない。

**修正案:** schema の各 description に「現在の唯一の利用者: `skill_arcane_bombardment`」等を書く（挙動不変・純ドキュメント）。
また active/passive を `oneOf` + `if/then` で分岐させれば「active のみ必須」を description ではなく schema で強制でき、
`skill_stance_*` が `sfx`/`effects` を欠いていることの是非も機械的に判定できる。

### 4-5.【—】`battle-backgrounds` の任意キー（問題なし）

`fog` は5件中3件、`bossOnly` は `bg_sanctum` のみ。
`validate-json.mjs:790-793` が「通常2件以上・bossOnly 1件以上」を保証しているので構成としては健全。

---

## 5. ローダ3本

### 5-1.【med】`battleContent.ts` に同一パターンが5回コピーされている

`:27-39`（skills）/ `:42-55`（traits）/ `:71-94`（enemies）/ `:97-109`（enemy-sets）/ `:112-124`（battle-effects）。
5ブロックすべてが「glob → `default ?? mod` → id 検証 → 重複警告 → Map へ set」という同一構造。
CLAUDE.md「同じロジックが2箇所以上に現れたらヘルパー関数に抽出する」に違反（5箇所）。

**修正案（Phase 5 / 挙動不変）:** ファイル内プライベートヘルパー（CLAUDE.md の命名規則より `_` プレフィックス）を1本置く。

    function _collect<T extends { id: string }>(
      modules: Record<string, unknown>,
      kindLabel: string,
      validate: (raw: unknown, path: string) => T | null,
    ): Map<string, T>

各呼び出しは `validate` コールバックだけが異なる（enemies は既定値補完、traits は `mainCategory: null` 注入）。
**ログ文言・上書き順序・スキップ挙動をそのまま移せば出力は完全に同一。**

### 5-2.【high】不正ファイルは「console.error して黙って消える」

`battleContent.ts:32,47,76,102,118` / `battleBackgrounds.ts:20` — どのローダも `console.error(...)` の後 `continue` し、**例外を投げない**。

- スキルJSONの `kind` をタイポすると、そのスキルはドラフト候補から**静かに消える**。ゲームは動き続ける。
- 敵JSONの `stats` を消すと、その敵を含む enemy-set が実行時に「メンバー1体欠けた編成」で戦闘に入る。
- `battleBackgrounds.ts:19` は `sky`/`ground` 欠落でスキップ → 背景が4件になり、
  `validate-json.mjs:790` の「通常2件以上」の保証がランタイムでは効かない。

**CI では守られている**が（`npm run validate` が ajv で全件チェックする）、**content-editor の GUI 保存経路**では
`contentEditorPlugin.mjs` が1ファイル単位のスキーマ検証しかしないため（CLAUDE.md 自身が「保存後は `npm run validate` も実行すること」と注記）、
dev サーバー稼働中に壊れた状態が生まれうる。

**修正案:** `ConfigValidator.ts:259` / `:278` と同じ `if (import.meta.env?.PROD) return` パターンに揃え、**dev ビルドでは throw する**。
本番バンドルの挙動は現行と完全に同一。
> **⚠️ dev の挙動は変わる（黙って消える → 落ちる）ため、[07-deferred.md](07-deferred.md) 送り。**
> 本計画では「スキップ件数の合計を最後にまとめて `console.error` する集約ログ」に留める（現状は個別行が他のログに埋もれる）。

### 5-3.【med】3本のローダで重複検出の方針が食い違う

| ローダ | 重複時 |
|---|---|
| `battleContent.ts:36,50,80,106,121` | `console.warn` して **後勝ちで上書き** |
| `battleBackgrounds.ts:24-26` | `console.warn` して **先勝ちでスキップ**（コメントに「後勝ちにはしません」と明記） |

ファイル名 = id を `validate-json.mjs` が強制しているので実際には重複は起きないが、
**同じ問題に対する答えが2つある**状態は読み手を迷わせる。

**修正案:** `battleBackgrounds.ts:31` にある「glob の列挙順はビルド環境に依存するため ID でソート」という理由づけは
重複ポリシーにも当てはまる。`battleContent.ts` 側も**先勝ち + ソート**に統一する。
現状で重複が発生しない以上、**統一しても挙動は変わらない**。

### 5-4.【med】`battleGuide.ts` に検証が一切ない

`battleGuide.ts:7,20-21` が `raw.sections` / `raw.terms` を**型検証なしでキャスト**して公開。
`battle-guide.json` には **JSON Schema が存在しない**ため `validate-json.mjs` も検査していない
（`walkJson('src/data/rpg/...')` の対象ディレクトリに単体ファイルは含まれない）。
`GlossaryTerm.vue` が存在しない termId を渡すと `BATTLE_GLOSSARY[id]` が `undefined` になる。

**修正案（Phase 8）:** (a) `schemas/battle-guide.schema.json` を追加し `validate-json.mjs` から検査する。
(b) さらに「`GlossaryTerm.vue` / `HelpGuide.vue` から参照される termId がすべて実在すること」を検証すれば §2-6 とも噛み合う。

### 5-5.【low】「安全な default 取り出し」が7箇所に重複

`((mod as { default?: unknown }).default ?? mod)` が `battleContent.ts:30,45,74,100,115` /
`battleBackgrounds.ts:18` / `ConfigLoader.ts:61` に。
**修正案:** `ConfigLoader.ts` に `unwrapGlobModule(mod)` を置き rpg ローダから使う。§5-1 のヘルパー化とセットで解消される。

---

## 6. rpg データ分離の実態

### 6-1.【—】方針は守られている（違反なし）

`src/data/rpg` を import しているのは以下の**7箇所のみ**で、すべて rpg 戦闘専用のコード。

| 参照元 | 対象 |
|---|---|
| `BattleScreen.vue:47` | `BATTLE_CONTENT` |
| `BattleScreen.vue:49` | `findBattleBackground` |
| `HelpGuide.vue:13` | `BATTLE_GUIDE_SECTIONS` / `BATTLE_GLOSSARY` |
| `useBattlePresentation.ts:15` | `BATTLE_EFFECTS` / `BATTLE_CONTENT` |
| `useBattleState.ts:40` | `BATTLE_CONTENT` |
| `useBattleState.ts:41` | `BATTLE_BACKGROUNDS` |
| `contentEditorPlugin.mjs:28-53` / `contentEditor.ts` | 開発ツール（本番ビルド対象外） |

**横スクロール本体（`src/game/`）・他ジャンルプラグイン（`src/genres/`）・`src/domain/`（battle 以外）からの参照はゼロ。**
`backdrop.ts:3` と `types.ts:430` の `src/data/rpg/...` はコメント内の言及のみで import ではない
（domain 層が data 層に依存しない設計が守られている＝良好）。

### 6-2.【med】逆方向は分離できていない — rpg 専用 config が共有ディレクトリにある

`src/data/config/battle.json` / `encounter_groups.json` / `skill_points.json`。
**CLAUDE.md:126 自身が「大半は全ジャンル共通だが battle.json / encounter_groups.json / skill_points.json は rpg 専用」と
例外として注記せざるを得ない状態。**

1. `src/data/config.ts` の `import.meta.glob('./config/*.json')` により、rpg 専用の値が**全ジャンルのバンドルに常時含まれる**。
2. `encounter_groups.json:16-50 groups` の値は **`src/data/rpg/enemy-sets/*.json` の ID** であり、データとしては rpg 側に属する。
   実際 `config-types.ts:404` のコメントが「groups の値は `src/data/rpg/enemy-sets/*.json` の id」と、
   **共有 config から rpg データへの依存を自白している**。
3. 新しいジャンルが同様に専用 config を足すと、`src/data/config/` が「共通」でも「ジャンル別」でもない雑多な袋になる。

**修正案（Phase 3 / 挙動不変・段階的）:**

- **案A（最小・推奨）:** 3ファイルを `src/data/config/rpg/` サブディレクトリへ移し、
  `config.ts` の glob を `'./config/**/*.json'` に広げる。`section` ベースでマージしているのでパスが変わっても `GameConfigMap` は同一。
  `validate-json.mjs:819` の `walkJson('src/data/config')` は再帰なので無変更で通る。
  **ディレクトリを見ただけで「これは rpg 専用」と分かる。**
- **案B（構造的）:** 3ファイルを `src/data/rpg/config/` へ移し `src/data/rpg/battleConfig.ts` から個別 import する。
  rpg のデータ・型・設定が1ツリーに揃う。ただし `tunables.ts` の `BATTLE` / `ENCOUNTER_GROUPS` / `SKILL_POINTS` の出所が変わるため
  import 変更が広く波及する。**案A → 落ち着いたら案B。**

どちらの案でも `encounter_groups.json` の `groups`（= enemy-set の配置情報）は、
本来 `enemy-sets/*.json` 側に `"group": "B"` として持たせ、`encounter_groups.json` は重み・周期だけを持つ形にすると
**「新しい敵セットを足す＝ファイル1個追加」で完結する**（現状は JSON 2ファイルの編集が必須）。
これは挙動不変で実装可能（ローダで逆引きを組み立てる）。→ Phase 8。

---

## 7. 優先度つき推奨アクション

| # | 見出し | severity | 見積 | Phase |
|---|---|---|---|---|
| 1 | `encounterGroups`/`skillPoints` の section 名を snake_case へ（§2-1） | high | 小 | 2 |
| 2 | `REQUIRED_SECTIONS` に欠落9件（§3-3）＋ `SCHEMAS` に `skill_points.json` / `postBattleHealRate`（§3-4） | high | 小 | 2 |
| 3 | `RPG_SCORE_FORMULA_FALLBACK` を削除し `rpg.json` を単一の出所に（§2-3） | high | 小 | 2 |
| 4 | effect ID を `effectIds.ts` に集約し validate へ組み込む（§4-3） | high | 中 | 2 |
| 5 | `skillDraft.ts` / `damageCalc.ts` / `BattleScreen.vue` の balance 数値を JSON へ（§2-2） | high | 中 | 6 |
| 6 | `battleContent.ts` の5重複を `_collect` ヘルパーへ（§5-1） | med | 中 | 5 |
| 7 | `config-types.ts` を `config/` 配下へ分割し barrel 化（§1-3）＋ `index.ts` を `export type *` へ（§1-4） | med | 中 | 4 |
| 8 | rpg 専用 config を `config/rpg/` へ隔離（§6-2 案A） | med | 小 | 3 |
| 9 | `KNOWN_OP_IDS` を schema から生成（§3-6）／カテゴリ enum の `$defs` 化（§3-7） | med | 中 | 8 |
| 10 | `battle-guide.json` に schema を追加（§5-4）／`CATEGORY_LABEL` 一元化（§2-6） | low | 小 | 8 |
