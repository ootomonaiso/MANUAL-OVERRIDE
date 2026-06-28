# `src/genres/` — ジャンルプラグイン実装

各ジャンルの視覚テーマ・スポーンテーブル・描画ロジックを実装する。

---

## `index.ts`

`src/genres/*.ts` の default export を `import.meta.glob` で自動収集して GameRegistry に登録する。新しい TSプラグインを追加してもこのファイルの編集は不要（ファイル末尾で `export default new MyGenrePlugin()` するだけ）。詳細は末尾の[登録の仕組み](#indexts--登録の仕組み)を参照。

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

**id:** `racing` — レーシング。`GenrePluginBase` を継承。

| 特性 | 値 |
|---|---|
| 背景 | 暗色（`#08060a` → `#100c14`） |
| 星 | 黄 (`#ffee88`) |
| ハザード | 橙 (`#ff8800`) / 水色 (`#44ddff`) |

---

## `ArenaPlugin.ts`

**id:** `arena` — アリーナバトル。`GenrePluginBase` を継承。

| 特性 | 値 |
|---|---|
| 背景 | 暗赤（`#0a0000` → `#180000`） |
| 星 | 赤 (`#ff4422`) |
| ハザード | 赤 (`#cc0000`) / 橙 (`#ffaa00`) |

---

## `AquaticPlugin.ts`

**id:** `aquatic` — 水中アドベンチャー。`GenrePluginBase` を継承。

| 特性 | 値 |
|---|---|
| 背景 | 深海青（`#000a1a` → `#001428`） |
| 星 | 青緑 (`#44ffdd`) |
| ハザード | ピンク (`#ff3366`) / 青緑 (`#00ffcc`) |

---

## `DungeonPlugin.ts`

**id:** `dungeon` — ダンジョン探索。`GenrePluginBase` を継承。

| 特性 | 値 |
|---|---|
| 背景 | 暗褐（`#060500` → `#0e0900`） |
| 星 | なし（地下） |
| ハザード | 橙褐 (`#bb5500`) / 黄 (`#ddcc44`) |

---

## `HackSlashPlugin.ts`

**id:** `hack_slash` — ハックアンドスラッシュ。`GenrePluginBase` を継承。

| 特性 | 値 |
|---|---|
| 背景 | 暗赤（`#0a0000` → `#150000`） |
| 星 | 赤 (`#ff6644`) |
| ハザード | 赤 (`#dd0000`) / 橙 (`#ffaa00`) |

---

## `TetrisPlugin.ts`

**id:** `tetris` — テトリス（暗色系・グリッド線）。`GenrePluginBase` を継承。

| 特性 | 値 |
|---|---|
| 背景 | 暗灰（`#0a0a0a` → `#111111`） |
| 星 | なし |
| ハザード | 赤 (`#e74c3c`) / 青 (`#3498db`) |

> 実際のゲームロジック（グリッド・テトリミノ・ライン消去）は `TetrisFeature`（`tetris_mode`）が担当する。プラグインは視覚テーマを提供する。詳細は [tetris-genre.md](../tetris-genre.md) を参照。

---

## `index.ts` — 登録の仕組み

`index.ts` は `import.meta.glob('./*.ts')` で各プラグインの default export を自動収集して登録する（手動の登録リストは持たない）。`BasePlugin.ts` のように複数クラスを配列で default export することもできる。さらに、TSプラグインが存在しない JSON 定義ジャンルには `JSONGenrePlugin` のフォールバックが自動生成される。

### TSプラグインで実装済みのジャンル（16 クラス）

| クラス | ジャンルID |
|---|---|
| `BasePlugin` | `base` |
| `RunnerPlugin` | `runner` |
| `StgPlugin` | `stg` |
| `RpgPlugin` | `rpg` |
| `RhythmPlugin` | `rhythm` |
| `PuzzlePlugin` | `puzzle` |
| `AerialStgPlugin` | `aerial_stg` |
| `SurvivalPlugin` | `survival` |
| `BulletRunnerPlugin` | `bullet_runner` |
| `PlatformerPlugin` | `platformer` |
| `RacingPlugin` | `racing` |
| `ArenaPlugin` | `arena` |
| `AquaticPlugin` | `aquatic` |
| `DungeonPlugin` | `dungeon` |
| `HackSlashPlugin` | `hack_slash` |
| `TetrisPlugin` | `tetris` |

※ `bullet_hell`, `stealth_action`, `tower_def`, `sports`, `idle`, `horror` は専用 TSプラグインを持たず、`JSONGenrePlugin` フォールバックで描画される。
