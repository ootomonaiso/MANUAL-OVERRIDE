# `src/genres/` — ジャンルプラグイン実装

各ジャンルの視覚テーマ・スポーンテーブル・描画ロジックを実装する。

---

## `index.ts`

全ジャンルプラグインを GameRegistry に一括登録。新しいジャンルを追加するにはこのファイルに2行追加するだけ。

---

## `BasePlugin.ts`

### 抽象クラス `DarkThemePlugin`

`GenrePluginBase` を継承。暗色系テーマの共通描画ロジックを提供。

| メソッド | 概要 |
|---|---|
| `drawFarLayer()` | 山シルエット（sin 波合成） |
| `drawMidLayer()` | 建物シルエット（ハッシュ生成） |
| `drawPlayer()` | 人物（頭・体・腕・脚、ランニングアニメ付き） |

### クラス `BasePlugin`

**id:** `base` — ゲーム開始直後・収束前のデフォルト。

| 特性 | 値 |
|---|---|
| 背景 | 暗青系 (`#0f0f23` → `#1a1a3e`) |
| 星 | 白 (`#ffffff`) |
| ハザード | 赤 (`#e74c3c`) / 青 (`#3498db`) |
| スポーン | rect(ground), spike(ground), pillar(ground), diamond(float) |

### クラス `RunnerPlugin`

**id:** `runner` — エンドレスランナー。

| 特性 | 値 |
|---|---|
| 背景 | 暗青系 (`#0d0d1e` → `#1e1e3e`) |
| 星 | 白 (`#ffffff`) |
| ハザード | 赤 (`#e74c3c`) / 水色 (`#00cec9`) |
| スポーン | rect(ground+air), spike(ground), pillar(ground) |

---

## `StgPlugin.ts`

**id:** `stg` — 横スクロールSTG。

| 特性 | 値 |
|---|---|
| 背景 | 宇宙 (`#000005` → `#05050f`) |
| 星 | 白 (`#ffffff`) |
| ハザード | オレンジ (`#e17055`) / 青 (`#0984e3`) |
| 遠景 | ネビュラ光（放射グラデーション） |
| 中景 | 浮遊岩石（ハッシュ生成） |
| プレイヤー | 宇宙船（機体・エンジン炎・コックピット） |
| スポーン | rect(ground+air), diamond(float), pillar(air) |

---

## `RpgPlugin.ts`

**id:** `rpg` — RPG（森/中世ファンタジー）。

| 特性 | 値 |
|---|---|
| 背景 | 暗緑 (`#0a1a05` → `#12280a`) |
| 星 | なし（森） |
| ハザード | 紫 (`#6c5ce7`) / 緑 (`#00b894`) |
| 遠景 | 霧感のある丘 |
| 中景 | 木のシルエット（ハッシュ生成） |
| プレイヤー | 騎士（鎧・ヘルメット・剣） |
| スポーン | rect(ground), pillar(ground), spike(ground), rect(air) |

---

## `RhythmPlugin.ts`

**id:** `rhythm` — リズムゲーム（サイバーパンク）。`DarkThemePlugin` を継承。

| 特性 | 値 |
|---|---|
| 背景 | 暗紫 (`#0a0015` → `#150028`) |
| 星 | 紫 (`#cc88ff`) |
| ハザード | ピンク (`#e84393`) / 紫 (`#6c5ce7`) |
| 中景 | 縦ラインの光（ビート感）+ 親クラスの建物 |
| スポーン | rect(ground), diamond(float), spike(ground), rect(air) |

---

## `PuzzlePlugin.ts`

**id:** `puzzle` — パズル（白背景・グリッド）。`DarkThemePlugin` を継承。

| 特性 | 値 |
|---|---|
| 背景 | 白系 (`#e8e8f0` → `#d0d0e0`) |
| 星 | なし |
| ハザード | ピンク (`#e84393`) / 青 (`#0984e3`) |
| 遠景 | なし（白背景で視認性優先） |
| 中景 | グリッドライン（方眼紙風） |
| プレイヤー | 箱型キャラクター（白目付き） |
| スポーン | rect(ground), pillar(ground), rect(air) |

---

## `AerialStgPlugin.ts`

**id:** `aerial_stg` — 縦スクロールSTG。

| 特性 | 値 |
|---|---|
| 背景 | 暗宇宙 (`#000008` → `#000418`) |
| 星 | 白（高密度: 28/sector, サイズ 1〜3） |
| ハザード | 赤 (`#ff3333`) / 青 (`#00aaff`) |
| 遠景 | 星雲（複数放射グラデーション） |
| 中景 | 小惑星群（楕円ハッシュ生成） |
| プレイヤー | 小型戦闘機（三角・エンジン炎2色・コックピット） |
| スポーン | rect(ground), diamond(float), pillar(air), spike(ground) |

---

## `SurvivalPlugin.ts`

**id:** `survival` — サバイバルゲーム。

| 特性 | 値 |
|---|---|
| 背景 | 暗緑 (`#050e05` → `#0a1a08`) |
| 星 | なし |
| ハザード | 橙 (`#cc4400`) / 緑 (`#22aa44`) |
| 遠景 | 霧の丘シルエット |
| 中景 | 枯れ木（幹+枝） |
| プレイヤー | サバイバー（リュック・ヘルメット） |
| スポーン | rect(ground+air), pillar(ground), spike(ground) — safeChance 高め |

---

## `BulletRunnerPlugin.ts`

**id:** `bullet_runner` — 弾幕ランナー。

| 特性 | 値 |
|---|---|
| 背景 | 暗紫 (`#060010` → `#100025`) |
| 星 | ピンク (`#ff88ff`) |
| ハザード | ピンク (`#ff2266`) / 水色 (`#00ffcc`) |
| 遠景 | ネオン都市シルエット + ビル窓の縦ライン |
| 中景 | ネオン看板付きビル + 横ネオンライン |
| プレイヤー | サイバースーツ（ネオンアーマーライン・バイザー） |
| スポーン | rect(ground+air), diamond(float), spike(ground) |

---

## `PlatformerPlugin.ts`

**id:** `platformer` — プラットフォーマー。`DarkThemePlugin` を継承。

| 特性 | 値 |
|---|---|
| 背景 | 青空 (`#1a88e8` → `#4db8ff`) / 緑の地面 |
| 星 | なし |
| ハザード | 赤 (`#e84040`) / 黄 (`#ffcc00`) |
| 遠景 | 雲（白いふわふわ） |
| 中景 | 草地の丘 |
| プレイヤー | キャップ付きキャラクター（赤いジャンパー・青いパンツ） |
| スポーン | rect(ground+air), spike(ground), diamond(float) — safeChance 高め |

---

## `RacingPlugin.ts`

**id:** `racing` — レーシングゲーム。

| 特性 | 値 |
|---|---|
| 背景 | 暗オレンジ (`#0f0a00` → `#1a1500`) |
| 星 | なし |
| ハザード | 赤 (`#ff4444`) / 黄 (`#ffcc00`) |
| 遠景 | 山脈のシルエット |
| 中景 | 道路のマーキングライン |
| プレイヤー | レースカー（ボディ・タイヤ・ウィング） |
| スポーン | rect(ground+air), spike(ground), diamond(float) |

---

## `ArenaPlugin.ts`

**id:** `arena` — アリーナバトル。

| 特性 | 値 |
|---|---|
| 背景 | 暗赤 (`#0f0000` → `#1a0505`) |
| 星 | なし |
| ハザード | 赤 (`#ff2222`) / 橙 (`#ff8800`) |
| 遠景 | 闘技場の壁 |
| 中景 | 観客席のシルエット |
| プレイヤー | 戦士（鎧・盾・剣） |
| スポーン | rect(ground+air), pillar(ground), spike(ground) — boss 出現 |

---

## `AquaticPlugin.ts`

**id:** `aquatic` — 水中アドベンチャー。`DarkThemePlugin` を継承。

| 特性 | 値 |
|---|---|
| 背景 | 深海 (`#000f2a` → `#001a3a`) |
| 星 | 青 (`#4488ff`) |
| ハザード | 紫 (`#6c5ce7`) / 青 (`#00b894`) |
| 遠景 | 光のシャフト（水面からの光） |
| 中景 | 海藻・サンゴのシルエット |
| プレイヤー | ダイバー（タンク・フィン） |
| スポーン | rect(ground+air), diamond(float), pillar(air) — vertical scroll |

---

## `DungeonPlugin.ts`

**id:** `dungeon` — ダンジョン探索。

| 特性 | 値 |
|---|---|
| 背景 | 暗茶 (`#0a0a00` → `#151500`) |
| 星 | なし |
| ハザード | 紫 (`#6c5ce7`) / 緑 (`#00b894`) |
| 遠景 | 石壁のシルエット |
| 中景 | 松明の明かり（ハッシュ生成） |
| プレイヤー | 探検家（マント・松明） |
| スポーン | rect(ground), pillar(ground), spike(ground), rect(air) |

---

## `HackSlashPlugin.ts`

**id:** `hack_slash` — ハックアンドスラッシュ。

| 特性 | 値 |
|---|---|
| 背景 | 暗赤 (`#150000` → `#200000`) |
| 星 | なし |
| ハザード | 赤 (`#ff2222`) / 橙 (`#ff8800`) |
| 遠景 | 炎のシルエット |
| 中景 | 剣の軌跡エフェクト |
| プレイヤー | 剣士（鎧・剣・コンボエフェクト） |
| スポーン | rect(ground+air), pillar(ground), spike(ground) — boss 出現 |

---

## `index.ts` — 登録一覧

| 順 | クラス | ジャンルID |
|---|---|---|
| 1 | `BasePlugin` | `base` |
| 2 | `RunnerPlugin` | `runner` |
| 3 | `StgPlugin` | `stg` |
| 4 | `RpgPlugin` | `rpg` |
| 5 | `RhythmPlugin` | `rhythm` |
| 6 | `PuzzlePlugin` | `puzzle` |
| 7 | `AerialStgPlugin` | `aerial_stg` |
| 8 | `SurvivalPlugin` | `survival` |
| 9 | `BulletRunnerPlugin` | `bullet_runner` |
| 10 | `PlatformerPlugin` | `platformer` |
| 11 | `RacingPlugin` | `racing` |
| 12 | `ArenaPlugin` | `arena` |
| 13 | `AquaticPlugin` | `aquatic` |
| 14 | `DungeonPlugin` | `dungeon` |
| 15 | `HackSlashPlugin` | `hack_slash` |

※ `bullet_hell`, `stealth_action`, `tower_def`, `sports`, `idle`, `horror` はまだプラグイン未実装。
