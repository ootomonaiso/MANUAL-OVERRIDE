# 07. データ定義とバリデーション

対象範囲: 設計文書「敵定義（データ設計）」「スキル・特性定義（データ設計）」

---

## 方針

**いつでも数を増やせる構成**にする。`src/data/sfx/*.json` と同じ「JSON をディレクトリに足すだけで拡張できる」流儀に従う。

| ディレクトリ | 内容 | 1ファイルの単位 |
|---|---|---|
| `src/data/rpg/skills/` | アクティブ・パッシブスキル | 1スキル |
| `src/data/rpg/traits/` | 特性 | 1特性 |
| `src/data/rpg/enemies/` | 敵 | 1種 |
| `src/data/rpg/battle-effects/` | エフェクト定義 | 1エフェクト（[09-effects.md](09-effects.md)） |

`import.meta.glob` による一括ロードとし、`index` ファイルへの手動登録を不要にする（`src/data/sprites.ts` が既に同方式）。

---

## スキル定義

### アクティブスキル

```jsonc
{
  "$schema": "../../../schemas/battle-skill.schema.json",
  "id": "skill_triple_strike",
  "label": "三連撃",
  "flavorText": "三度目に賭ける。それが作法だと教わった。",
  "kind": "active",
  "element": "physical",
  "mainCategory": "combo",
  "subCategories": ["might"],
  "cooldown": 2,
  "defaultFocus": "enemy",
  "focusRange": "single",
  "effects": ["fx_slash", "fx_hit_physical"],
  "effect": [
    {
      "op": "repeat",
      "times": 3,
      "body": [
        { "op": "damage", "element": "physical", "scale": { "stat": "str", "rate": 0.8 } }
      ],
      "onLastIteration": [
        { "op": "modifier", "stat": "critRate", "amount": 0.5, "scope": "thisHit" }
      ]
    }
  ]
}
```

### パッシブスキル

```jsonc
{
  "id": "passive_iron_will",
  "label": "鉄の意志",
  "flavorText": "折れないことだけが取り柄だった。",
  "kind": "passive",
  "mainCategory": "guard",
  "subCategories": [],
  "effect": [
    { "op": "statBoost", "stat": "def", "amount": 800 }
  ]
}
```

### フィールド一覧

| キー | 必須 | 型 | 適用 | 内容 |
|---|---|---|---|---|
| `id` | ✅ | string | 全 | 一意識別子。`skill_` プレフィックス |
| `label` | ✅ | string | 全 | 表示名 |
| `flavorText` | ✅ | string | 全 | フレーバー。**ゲームプレイに影響しない** |
| `kind` | ✅ | `'active'｜'passive'` | 全 | 種別 |
| `mainCategory` | ✅ | `CategoryId` | 全 | メインカテゴリ |
| `subCategories` | ✅ | `CategoryId[]` | 全 | サブ。空配列可 |
| `effect` | ✅ | `EffectNode[]` | 全 | 効果オペレーション |
| `element` | ✅ | `Element` | active | 属性。**サポート系も必須** |
| `cooldown` | ✅ | number ≥ 0 | active | クールタイム |
| `defaultFocus` | ✅ | `'enemy'｜'self'｜'ally'` | active | 既定の対象side |
| `focusRange` | ✅ | `'single'｜'all'｜'adjacent3'` | active | 対象範囲 |
| `effects` | — | string[] | active | 発動時に再生するエフェクトID。**`timing: "onCast"` のもののみ**（着弾側は効果オペレーションが自動で出す） |
| `sfx` | — | `{cast?, impact?}` | active | このスキル専用の効果音。`src/data/sfx/*.json` の id。未指定ならエフェクト定義の `sfx` を使う |
| `unlockCondition` | — | `{category, points}` | 全 | カテゴリ特化で解放される場合のみ |

---

## 特性定義

```jsonc
{
  "id": "trait_weak_physical",
  "label": "物理弱点",
  "flavorText": "殴られると、思ったより効く。",
  "kind": "trait",
  "effect": [
    { "op": "elementAffinity", "element": "physical", "affinity": "weak" }
  ]
}
```

| キー | 必須 | 内容 |
|---|---|---|
| `id` / `label` / `flavorText` / `kind` / `effect` | ✅ | スキルと同様 |
| `mainCategory` / `subCategories` | **禁止** | **特性はカテゴリを持たない** |
| `cooldown` / `element` / `defaultFocus` / `focusRange` | **禁止** | アクティブ専用 |
| `unlockCondition` | — | カテゴリ特化で解放される場合のみ |
| `draftable` | — | `false` なら通常ドラフトに出さない（弱点・耐性はこれ） |

### 弱点・耐性は `draftable: false`

**弱点・耐性の特性は原則ドラフトに出現しない。** 敵が初期から持つもの、またはスキルで付与されるものとして扱う。

```jsonc
{ "id": "trait_weak_physical", "draftable": false, ... }
```

---

## 敵定義

```jsonc
{
  "id": "enemy_slime",
  "label": "スライム",
  "flavorText": "説明書の余白から染み出してきた。",
  "sprite": "battle_slime",
  "stats": {
    "hp": 7000, "str": 650, "def": 2200, "int": 400, "ref": 1800, "agi": 900,
    "hitRate": 0.95, "evadeRate": 0.0, "critRate": 0.05, "critDamageMultiplier": 2.0
  },
  "traits": ["trait_weak_physical"],
  "activeSkills": ["skill_bite", { "id": "skill_roar", "level": 3 }],
  "passiveSkills": ["passive_thick_hide"],
  "actionPattern": ["skill_bite", "skill_bite", "skill_roar"],
  "isBoss": false
}
```

| キー | 必須 | 内容 |
|---|---|---|
| `id` / `label` / `flavorText` | ✅ | — |
| `sprite` | ✅ | 見た目。`src/data/sprites/*.json` の id を**名前で参照**する。`idle` / `attack` の2フレームが必須 |
| `stats` | ✅ | 10ステータスの**基礎値**。`evadeRate` は導出値のため 0 固定 |
| `traits` | ✅ | 特性IDの配列（0個以上） |
| `activeSkills` | ✅ | 所持アクティブスキル。文字列またはオブジェクト（後述） |
| `passiveSkills` | ✅ | 所持パッシブスキル。同上 |
| `actionPattern` | ✅ | 行動パターン。**ループする**。文字列IDのみ。`activeSkills` に含まれるIDのみ |
| `isBoss` | ✅ | ボスフラグ。撃破でランがクリア終了 |

### 見た目の一元管理（`sprite`）

敵の絵は**敵定義とは別ファイル**（`src/data/sprites/*.json`）に置き、敵定義からは**名前で参照**する。
スキル・ステータスと同じ場所（敵JSON）に1行足すだけで見た目が追従するため、絵の差し替えは
スプライト側の編集だけで完結し、逆に敵の使い回しも容易になる。

```jsonc
// src/data/rpg/enemies/enemy_goblin.json
{ "id": "enemy_goblin", "sprite": "battle_goblin", ... }
```

```jsonc
// src/data/sprites/battle_goblin.json（既存の PixelArt スプライト形式をそのまま使う）
{
  "id": "battle_goblin",
  "w": 22, "h": 22,
  "palette": { "O": "#141a10", "G": "#5f8a3a" },
  "frames": {
    "idle":   ["...", "..."],
    "attack": ["...", "..."]
  }
}
```

`idle` / `attack` の2フレームが必須。攻撃中は `attack` に差し替わり、CSS で相手側へ踏み込む。
プレイヤーのスプライトIDは `src/data/config/battle.json` の `playerSprite` で指定する。

---

## 背景定義

1ファイル1背景（`src/data/rpg/battle-backgrounds/bg_*.json`、スキーマは `schemas/battle-background.schema.json`）。
戦闘が始まるたびに、ボス戦なら `bossOnly: true` の中から、通常戦ならそれ以外の中から、
**直前と違うもの**が選ばれる。

```jsonc
{
  "id": "bg_wasteland",
  "label": "禍々しい荒れ地",
  "sky": { "top": "#2a0e1c", "bottom": "#7a2331" },
  "glow": { "color": "#ff6a4a", "x": 0.5, "y": 0.22, "r": 0.16 },
  "ground": { "top": "#4a2028", "bottom": "#170a10", "baseline": 0.65 },
  "layers": [{ "shape": "spikes", "color": "#3a1220", "baseline": 0.58, "height": 0.22, "segments": 13 }],
  "props": [{ "kind": "crystal", "color": "#a8324a", "count": 6, "size": 0.13, "baseline": 0.66 }],
  "fog": { "color": "#ff4a3a", "opacity": 0.1 },
  "accent": "#ff8f6a",
  "panel": "#25101a"
}
```

| キー | 必須 | 内容 |
|---|---|---|
| `sky` / `ground` | ✅ | 空と地面のグラデーション。`ground.baseline` は地平線の高さ（画面高に対する比） |
| `floor` | ✅ | キャラクターが立つ**手前の床**。背景写真とは別の平面として描く |
| `clouds` | — | 空に浮かべる雲。矩形の塊として描く |
| `layers` | ✅ | 稜線。`hills` / `dunes` / `spikes` / `ruins` の4種 |
| `props` | — | 地面に置く小物。`tree` / `cactus` / `pillar` / `bone` / `crystal` / `tuft` |
| `glow` / `fog` | — | 光源と空気感 |
| `accent` / `panel` | ✅ / — | **その場に合わせてUIの色を変える**（`--battle-accent` / `--battle-panel`） |
| `bossOnly` | — | true ならボス戦専用 |

稜線・雲・小物の実際の座標は `src/domain/battle/backdrop.ts` が id 由来の擬似乱数から組み立てる。
同じ背景は毎回同じ地形になる（戦うたびに形が変わると「同じ場所」に見えないため）。

描画は 320×180 のキャンバスへ行い、CSS で拡大する（[08-ui.md](08-ui.md)「ドット絵として描く」）。
座標はすべて整数へ丸めてあるので、拡大してもドットの境界がぼけない。

---

### `evadeRate` を書く理由

`evadeRate` は `agi` から導出されるため、値は使われない。ただし**10ステータスの器として型を揃える**ため必須とし、**常に 0** を書く。検証で 0 以外を弾く。

### 敵ステータスの目安（重要）

**戦闘間でHPが回復しない**（Q4）ため、**敵をプレイヤーと同格に作るとランが1〜2戦で終わる。** 実際に検算すると次のようになる。

**同格の敵を置いた場合（破綻例）**

| 前提 | 値 |
|---|---|
| プレイヤー | HP 7000 / STR 800 / DEF 700 |
| 敵 | HP 7000 / STR 650 / DEF 2200 |

```
プレイヤーの与ダメージ = 800 × 0.8 × (1 - 0.06) ≒ 602/ラウンド
  → 敵撃破まで  7000 / 602 ≒ 12 ラウンド

敵の与ダメージ       = 650 × 0.8 × (1 - 0)    = 520/ラウンド
  → 1戦で受ける総量  12 × 520 = 6240
```

**プレイヤーHP 7000 に対し1戦で 6240 を失う。** 2戦目の序盤で力尽き、ボス（暫定10戦目）には到底届かない。

**序盤の敵は、プレイヤーより大幅に弱く作る必要がある。**

| 段階 | HP の目安 | STR の目安 | 想定ラウンド数 | 1戦の被ダメージ目安 |
|---|---|---|---|---|
| 序盤 | 1500〜2500 | 350〜450 | 3〜4 | 900〜1400 |
| 中盤 | 3000〜4500 | 500〜600 | 5〜7 | 2000〜3000 |
| 終盤 | 5000〜7000 | 650〜800 | 8〜11 | 4000〜6000 |
| ボス | 上記より大幅に強く | — | — | — |

この配分なら、成長（ドラフト）が追いつく限り10戦程度は持ちこたえられる。

> **注意**: 上表は**現時点の暫定値**であり、実際の調整は実装後にプレイして行う。ボス出現戦数が確定していないため（実装後に持ち越し）、確定的な数値は置けない。ここで示すのは「同格の敵を並べてはいけない」という**設計上の制約**である。
>
> 本文書の JSON 例（HP 7000 / STR 650）は**書式を示すためのもので、序盤の敵としては強すぎる**。実際の敵定義を作る際は上表に従うこと。

### 敵のスキルレベル

敵の所持スキルは**レベルを指定でき、既定値は 1** とする。

`activeSkills` / `passiveSkills` は、**文字列（ID のみ）**と**オブジェクト（ID + レベル）**の両方を受け付ける。

```jsonc
{
  "activeSkills": [
    "skill_bite",                          // 文字列 → Lv1
    { "id": "skill_roar", "level": 3 }     // オブジェクト → Lv3
  ],
  "passiveSkills": [
    { "id": "passive_thick_hide", "level": 2 }
  ]
}
```

```ts
export type EnemySkillRef = string | { id: string; level: number }

export function normalizeSkillRef(ref: EnemySkillRef): { id: string; level: number } {
  return typeof ref === 'string' ? { id: ref, level: 1 } : ref
}
```

レベルの効果は**プレイヤーと同一**（`2 ^ レベル - 1` の倍率が連続量に掛かる）。

ボスに高レベルスキルを持たせることで、`stats` だけに頼らない強さの表現ができる。

**検証**: `level` は 1〜4 の整数のみ許可する。`actionPattern` は文字列IDのみを取る（レベルは `activeSkills` 側で決まるため）。

---

## JSON Schema

既存の `schemas/` に3ファイルを追加する。

| ファイル | 対象 |
|---|---|
| `schemas/battle-skill.schema.json` | `src/data/rpg/skills/*.json` |
| `schemas/battle-trait.schema.json` | `src/data/rpg/traits/*.json` |
| `schemas/battle-enemy.schema.json` | `src/data/rpg/enemies/*.json` |

`$schema` をファイル先頭に書き、エディタ補完を効かせる（既存の `genre.schema.json` と同じ運用）。

---

## バリデーション（`scripts/validate-json.mjs`）

既存の `validateSprites()` が `schemas/sprite.schema.json` を**単一の情報源として実際に読み込んで**検証している（`validate-json.mjs:93`）。同じ方式に倣う。

### 検証項目

| # | 項目 | 失敗条件 |
|---|---|---|
| 1 | 必須キーの存在 | 欠落 |
| 2 | `id` の一意性 | スキル・特性・敵それぞれの名前空間内で重複 |
| 3 | `kind` の整合 | `traits/` に `kind !== 'trait'`、`skills/` に `kind === 'trait'` |
| 4 | 特性の禁止フィールド | 特性に `mainCategory` / `element` / `cooldown` 等がある |
| 5 | `mainCategory` / `subCategories` | 11種の `CategoryId` 以外 |
| 6 | `subCategories` の重複 | 同じIDが複数、または `mainCategory` と同一 |
| 7 | `element` | `physical` / `magical` / `special` 以外 |
| 8 | `cooldown` | 負の値・非整数 |
| 9 | **`op` の実在** | `effectOps` レジストリに存在しない `op` |
| 10 | `scale.stat` | `StatKey` 以外 |
| 11 | `repeat.times` | 1未満・非整数 |
| 12 | **参照整合（敵）** | `traits` / `activeSkills` / `passiveSkills` / `actionPattern` が実在しないIDを指す |
| 13 | `actionPattern` ⊂ `activeSkills` | `activeSkills` に無いIDが `actionPattern` にある |
| 14 | `actionPattern` の長さ | 0件（空だと行動できない） |
| 15 | 敵の `evadeRate` | 0 以外 |
| 16 | `unlockCondition.category` | 11種以外 |
| 17 | `effects`（エフェクトID） | `battle-effects/` に存在しないID、または `timing !== "onCast"` のID |
| 18 | ボスの存在 | `isBoss: true` の敵が**1体もない**とランがクリアできない |
| 19 | **参照整合（スプライト）** | 敵の `sprite` が `src/data/sprites/` に無い、または `idle` / `attack` フレームを欠く |
| 20 | **参照整合（効果音）** | エフェクトの `sfx`・スキルの `sfx.cast` / `sfx.impact` が `src/data/sfx/` に無い |
| 21 | 背景の最低構成 | 通常戦用の背景が2種未満、または `bossOnly` の背景が無い |

### `op` の実在検証について

**検証スクリプトは Node で動き、`effectOps` レジストリは TypeScript 側にある。** 直接 import できないため、**許可された `op` の一覧を JSON Schema 側の `enum` として持つ**。

```jsonc
// schemas/battle-skill.schema.json（抜粋）
{ "allowedOps": ["damage", "heal", "shield", "repeat", "modifier",
                 "statBoost", "elementAffinity", "cutRate",
                 "replaceGuard", "healBetweenBattles"] }
```

**新しいオペレーションを追加したら、スキーマの `allowedOps` にも追記する必要がある。** この二重管理を避けるため、TS 側にも同じ配列を置き、ユニットテストで**スキーマとレジストリの一致を検証する**。

```ts
// tests で検証
expect(new Set(registryIds)).toEqual(new Set(schema.allowedOps))
```

---

## ローダ

```ts
// src/data/battleContent.ts
const skillModules = import.meta.glob<SkillDef>('./skills/*.json', { eager: true, import: 'default' })
export const SKILLS: ReadonlyMap<string, SkillDef> = ...
export const TRAITS: ReadonlyMap<string, TraitDef> = ...
export const ENEMIES: ReadonlyMap<string, EnemyDef> = ...
```

ロード時に**実行時検証**も行う（`validate-json.mjs` はビルド前チェックであり、ユーザーがプラグインで追加する経路をカバーしないため）。

不正な定義は**そのエントリのみ除外**し、コンソールに警告する。戦闘全体を落とさない。

---

## `rpg.json` の変更

`src/data/genres/rpg.json` の `enableFeatures` は戦闘モードでは参照されない。ただし**ジャンル確定の瞬間に一度 `buildRuntimeRules` を通る**ため、既存 Feature を壊さない値にする。

```jsonc
{
  "id": "rpg",
  "enableFeatures": ["hp"],          // 最小限。確定直後の1フレームで例外を出さないため
  "disableFeatures": ["auto_run", "beat_hazard"],
  "scoreFormula": "battlesWon * 300 + bossDefeated * 3000 + maxSkillLevel * 200 + traitsAcquired * 150",
  ...
}
```

**`theme` / `bgColor` / `visual` / `controls` 等の描画・操作系フィールドはそのまま残す。** ジャンル確定前（`playing` 中）は横スクロールで進行するため（[01-architecture.md](01-architecture.md)）。

`melee_kill` / `exp` / `item_pickup` / `slow_precise` を外すことで `dungeon` との `enableFeatures` 完全一致が解消される。

> **注意**: `dungeon` 側は**変更しない**。`dungeon` は現行の横スクロール仕様のまま残す。

---

## エッジケース

| ケース | 扱い |
|---|---|
| スキルが1つも無い | `validate-json.mjs` で失敗させる（ドラフトが成立しない） |
| 敵が1体も無い | 同上 |
| `isBoss: true` の敵が複数 | 許容する。出現するのは1体のみ（選択はランダム） |
| 循環参照 | 発生しない（スキルが他スキルを参照する仕組みを持たないため） |
| `unlockCondition` を持つものが通常候補にも出る | 出さない。`unlockCondition` があれば条件達成まで候補外 |

---

## 影響を受ける既存ファイル

| ファイル | 変更 |
|---|---|
| `schemas/battle-skill.schema.json` 他2件 | 新規 |
| `scripts/validate-json.mjs` | 検証関数を3つ追加 |
| `src/data/battleContent.ts` | 新規（ローダ） |
| `src/data/genres/rpg.json` | `enableFeatures` / `scoreFormula` |
| `src/framework/ConfigValidator.ts` | `battle` を必須セクションへ |

---

## 実装後の記録

（実装完了後に追記）
