# PixelArt化 作業要領書（メイン）

指示元: `CLAUDE_OWNER.md`
ブランチ: `draft-change-pixelart`
タスク管理: `CLAUDE_TASKS.md`

## 目的

現在のキャラクター・敵・障害物・背景のイラストを、PixelArt風（ドット絵風）に変更する。
厳密なドット絵（固定グリッド・パレット制約・アンチエイリアス完全排除）である必要はなく、
「PixelArt風」として成立する見た目を目指す。

## 方式

**ピクセルスナップ + スプライト併用**（ユーザー承認済み / 詳細は `00-rendering-system.md`）

- 座標系・canvas 解像度は現状のまま。描画時だけ仮想ピクセルグリッドへ量子化する薄い層を挟む
- 背景・地形・エフェクト → `PixelCanvas` のブロック描画プリミティブへ置換
- キャラクター・敵・アイテム → `src/data/sprites/*.json` のピクセル配列を焼いて `drawImage`
- 当たり判定・物理・スコア・入力・ジャンル遷移は**一切変更しない**

## スコープ

### 対象（26 ファイル）

「見た目（描画）を持ち、ある程度ゲームプレイ上の機能が実装されているファイル」という
`CLAUDE_OWNER.md` の基準に加え、判断に迷った 6 ファイルはユーザー確認の結果すべて対象に含めた。

| 分類 | 件数 | 根拠 |
|---|---|---|
| コア描画 | 2 | `sideScroller.ts` は全描画の起点、`ParticleSystem.ts` は全ジャンル共通のエフェクト |
| ジャンルプラグイン | 15 | `GenrePlugin` の描画フック（背景・プレイヤー・敵）を実装している |
| FeatureSystem | 8 | `render()` を持つ、またはパーティクル経由で見た目に寄与する |
| JSON ジャンルプラグイン | 1 | 描画コードは持たないが 7 ジャンルの描画経路の中継役（Q2 で対象に決定） |

### 対象外

| 対象外 | 理由 |
|---|---|
| Vue 側 DOM UI（`src/components/` `src/App.vue` `src/tutorial/` `src/styles/`） | **Q3 でユーザーが対象外と決定。** 現在の CRT 風 緑×黒（`--green: #00ff41` + 走査線）はそのまま維持する |
| `src/game/InputManager.ts` | 描画コードを一切持たない（入力状態のみ） |
| `src/game/throwEngine.ts` | canvas 描画ゼロ。投擲の見た目は DOM の `ThrowOverlay.vue`（＝ UI 層＝対象外） |
| `src/game/entities.ts` | `draw` メソッドを持たない純粋なデータ保持クラス。ただし色フィールド（`Hazard.color` 等）の**参照元**として仕様書内で言及する |
| `src/genres/index.ts` / `src/game/systems/index.ts` | 登録・配線のみ。描画ゼロ |
| `src/game/systems/tetris-colors.ts` | 色定数のみのデータファイル。描画ゼロ（PixelArt 化でパレットとして再利用する） |
| `src/plugins/PluginManager.ts` / `SoundManager.ts` / `SfxSound.ts` | 描画ゼロ（永続化・音声） |
| `src/data/genres/*.json` | 現状 `theme` と `bgColor` しか視覚キーを持たず、canvas 描画には `bgColor` すら使われていない。変更不要 |

## 対象ファイル一覧

「描画数」は `arc / ellipse / gradient / roundRect / lineTo / stroke / fillRect / fillText` の
**出現行数**の合計。規模の目安として当初調査時のまま残している。

> **注記:** 行単位の集計のため、1 行に複数の呼び出しがある場合を取りこぼしている。
> 全体の正確な出現回数は `00-rendering-system.md` §1 の再集計表を参照
> （arc 63 / ellipse 16 / stroke 73 / fillRect 88 / 文字 23 など）。
> 本表は**ファイル間の相対的な規模**を見るためのものとして扱う。

### コア描画

| ファイルパス | 行数 | 描画数 | 概要 | 個別仕様書 | 状態 |
|---|---|---|---|---|---|
| `src/game/sideScroller.ts` | 1515 | 41 | 全描画の起点。背景・星・地面・障害物・アイテム・HUD・オーバーレイ | [01-sideScroller.md](01-sideScroller.md) | 完了 |
| `src/game/ParticleSystem.ts` | 55 | 1 | 全ジャンル共通のパーティクル（円形） | [02-ParticleSystem.md](02-ParticleSystem.md) | 完了 |

### ジャンルプラグイン（`src/genres/`）

| ファイルパス | 行数 | 描画数 | 概要 | 個別仕様書 | 状態 |
|---|---|---|---|---|---|
| `src/genres/BasePlugin.ts` | 166 | 18 | **描画の土台。** `DarkThemePlugin` が 5 ジャンル分の既定描画を提供 | [03-BasePlugin.md](03-BasePlugin.md) | 完了 |
| `src/genres/StgPlugin.ts` | 473 | 65 | 宇宙背景・自機・敵艦・スキャンライン前景 | [04-StgPlugin.md](04-StgPlugin.md) | 完了 |
| `src/genres/AerialStgPlugin.ts` | 439 | 54 | 縦スクロール空・雲・戦闘機・敵機 | [05-AerialStgPlugin.md](05-AerialStgPlugin.md) | 完了 |
| `src/genres/SurvivalPlugin.ts` | 238 | 23 | 霧の丘・枯木・サバイバー・HUD（空腹/XP） | [06-SurvivalPlugin.md](06-SurvivalPlugin.md) | 完了 |
| `src/genres/AquaticPlugin.ts` | 215 | 28 | 海底岩・光条・珊瑚・海藻・気泡・ダイバー | [07-AquaticPlugin.md](07-AquaticPlugin.md) | 完了 |
| `src/genres/HackSlashPlugin.ts` | 207 | 24 | 廃城・血月・柱・騎士（大剣） | [08-HackSlashPlugin.md](08-HackSlashPlugin.md) | 完了 |
| `src/genres/DungeonPlugin.ts` | 194 | 24 | 石壁・石柱・松明・床石・探索者 | [09-DungeonPlugin.md](09-DungeonPlugin.md) | 完了 |
| `src/genres/BulletRunnerPlugin.ts` | 181 | 22 | ネオン都市・看板・走者（バイザー） | [10-BulletRunnerPlugin.md](10-BulletRunnerPlugin.md) | 完了 |
| `src/genres/ArenaPlugin.ts` | 177 | 22 | コロシアム・松明・剣闘士 | [11-ArenaPlugin.md](11-ArenaPlugin.md) | 完了 |
| `src/genres/RacingPlugin.ts` | 159 | 16 | 観客席・速度線・ガードレール・レースカー | [12-RacingPlugin.md](12-RacingPlugin.md) | 完了 |
| `src/genres/PlatformerPlugin.ts` | 153 | 19 | 白い雲・丸い緑の丘・帽子のキャラ | [13-PlatformerPlugin.md](13-PlatformerPlugin.md) | 完了 |
| `src/genres/RpgPlugin.ts` | 78 | 9 | 霧の丘・木のシルエット・鎧の騎士 | [14-RpgPlugin.md](14-RpgPlugin.md) | 完了 |
| `src/genres/TetrisPlugin.ts` | 77 | 8 | T字テトリミノ型のプレイヤーのみ（背景は空 no-op） | [15-TetrisPlugin.md](15-TetrisPlugin.md) | 完了 |
| `src/genres/PuzzlePlugin.ts` | 73 | 8 | 方眼紙の罫線・青いブロックのプレイヤー | [16-PuzzlePlugin.md](16-PuzzlePlugin.md) | 完了 |
| `src/genres/RhythmPlugin.ts` | 44 | 1 | ビート列の縦帯のみ（他は `DarkThemePlugin` を継承） | [17-RhythmPlugin.md](17-RhythmPlugin.md) | 完了 |
| `src/plugins/JSONGenrePlugin.ts` | 132 | 0 | 描画コードゼロ。7 ジャンル分の描画を他プラグインへ委譲 | [18-JSONGenrePlugin.md](18-JSONGenrePlugin.md) | 完了（差分なし） |

### FeatureSystem（`src/game/systems/`）

| ファイルパス | 行数 | 描画数 | 概要 | 個別仕様書 | 状態 |
|---|---|---|---|---|---|
| `src/game/systems/TetrisFeature.ts` | 728 | 16 | テトリス盤面・ブロック・ゴースト・スコア文字 | [19-TetrisFeature.md](19-TetrisFeature.md) | 完了 |
| `src/game/systems/PuzzleFeature.ts` | 778 | 40 | パズル盤面・壁・ゴール・駒・日本語ヘッダ | [20-PuzzleFeature.md](20-PuzzleFeature.md) | 完了 |
| `src/game/systems/SurvivalFeature.ts` | 279 | 4 | 近接攻撃の斬撃アーク | [21-SurvivalFeature.md](21-SurvivalFeature.md) | 完了 |
| `src/game/systems/SpecialFeature.ts` | 250 | 6 | ステルス外套・タワー砲塔・ボス HP バー | [22-SpecialFeature.md](22-SpecialFeature.md) | 完了 |
| `src/game/systems/ShootFeature.ts` | 240 | 2 | 発光する弾 | [23-ShootFeature.md](23-ShootFeature.md) | 完了 |
| `src/game/systems/RhythmFeature.ts` | 122 | 2 | ビートマーカーの縦破線 | [24-RhythmFeature.md](24-RhythmFeature.md) | 完了 |
| `src/game/systems/MovementFeature.ts` | 210 | 2 | ダッシュ残像・スライド砂埃 | [25-MovementFeature.md](25-MovementFeature.md) | 完了 |
| `src/game/systems/RpgFeature.ts` | 94 | 0 | `render()` を持たず、パーティクル／スコアポップアップ経由でのみ見える | [26-RpgFeature.md](26-RpgFeature.md) | 完了（差分なし） |

## 描画システムへの影響

**衝突あり。** 現状は画像素材ゼロの手続き的ベクター描画であり、
`arc` / グラデーション / `shadowBlur` / 角丸 / `stroke` が全域で使われている。
対応方針の詳細は **[00-rendering-system.md](00-rendering-system.md)（承認必須）** を参照。

要点のみ:

- 新規に `src/game/render/`（`PixelCanvas` / `SpriteRenderer` / `PixelText`）を追加する
- スプライトデータは `src/data/sprites/*.json`、調整値は `src/data/config/pixelart.json`（ハードコーディング禁止ルール準拠）
- `GenrePlugin` / `FeatureSystem` のインターフェースは変更しない。各実装のメソッド本体のみ差し替える

## 実装順序

先行するフェーズが後続の土台になるため、この順で進める。

| Phase | 内容 | 理由 |
|---|---|---|
| P0 | 描画基盤（`src/game/render/` + sprites + schema + config） | 以降すべてがこの API に依存する |
| P1 | `sideScroller.ts` / `ParticleSystem.ts` | 全ジャンル共通の背景・地面・障害物・アイテムを先に固める |
| P2 | `BasePlugin.ts`（`DarkThemePlugin`） | `base` / `runner` / `rhythm` ほか計 5 ジャンルの既定描画を一度に PixelArt 化できる |
| P3 | 残りジャンルプラグイン 14 本 | 描画量の多い `StgPlugin` / `AerialStgPlugin` から着手 |
| P4 | FeatureSystem 8 本 | ジャンル固有の盤面・弾・エフェクト |
| P5 | `JSONGenrePlugin.ts` | 委譲先が全て PixelArt 化された後に整合を確認 |

## 検証方法

各 Phase 完了ごとに以下を実行し、**変更前と同一結果**であることを確認する。

```bash
npm run typecheck      # 型エラーなし
npm run lint           # any 禁止・naming-convention 準拠
npm run validate       # JSON 整合（sprites の検証を追加する）
npm run test:unit      # ドメインロジックの回帰
npm run test:features  # FeatureSystem の回帰
npm run reach-sim      # ジャンル到達率が変化しないこと（描画変更なので不変が期待値）
npm run build          # ビルド成功
npm run bundle-size    # スプライト JSON 追加後もバジェット内
```

加えて `npm run dev` でデバッグ機能（`forceGenre`）を用い、
各ジャンルを実際に表示して目視確認する。

## 不明点とユーザーとのやり取り

### 回答済み

| # | 論点 | ユーザーの回答 |
|---|---|---|
| Q1 | 基本方式（ピクセルスナップ / 低解像度オフスクリーン / スプライトのみ） | ピクセルスナップ + スプライト併用 |
| Q2 | 判断に迷う 6 ファイル（`BasePlugin` / `Tetris`・`Puzzle` プラグイン / `Movement`・`Rpg` Feature / `JSONGenrePlugin`） | 全て対象に含める |
| Q3 | Vue 側 DOM UI（CRT 風 緑×黒）の扱い | 対象外。違和感が出れば後日別途指示 |
| Q4 | スプライトデータの置き場所 | `src/data/sprites/*.json` + `schemas/sprite.schema.json` |

### 回答済み（2026-08-23、S6実装移行時）

| # | 論点 | ユーザーの回答 |
|---|---|---|
| Q5 | `aerial_stg` の自機の向き | **上向きに修正する**。既存の不具合の修正を兼ねる → [05-AerialStgPlugin.md](05-AerialStgPlugin.md) 4. |
| Q6 | `racing` の車の視点変更 | **`racing` は未完成ジャンルのため深く触らない。** 視点変更は行わず最小限の PixelArt 化にとどめる → [12-RacingPlugin.md](12-RacingPlugin.md) |
| Q7 | `rpg` のプレイヤーへのアニメーション追加 | **`rpg` も未完成ジャンルのため行わない。** 現状の静止のまま → [14-RpgPlugin.md](14-RpgPlugin.md) 3. |

### 回答済み（2026-08-23、S8 修正フェーズ）— 実装上の簡略化の追認

独立監査 F-04 の指摘（事後記録は事前承認と同一ではない）を受け、
実装時に判断した簡略化について改めてユーザーの承認を得た。
**ユーザー回答: 「すべて修正してください」＝下記5件を承認済みの仕様として正式に確定する。**

| # | 簡略化した内容 | 該当仕様書 | 承認後の位置づけ |
|---|---|---|---|
| S-1 | `torch.json` / 珊瑚2種 / `seaweed.json` / `castle-ruin.json` / `pillar-broken.json` を作成せず、`px.line`/`px.rect`/`px.circle`/`px.arcBlocks` の直接呼び出しで描く | [07](07-AquaticPlugin.md) / [08](08-HackSlashPlugin.md) / [09](09-DungeonPlugin.md) / [11](11-ArenaPlugin.md) | **正式仕様**。元コードがサイズ・波形をインスタンスごとに手続き的に計算しており、スプライト化の利点が小さいため |
| S-2 | ステルス外套を楕円ではなく矩形のディザで描く | [22](22-SpecialFeature.md) | **正式仕様**。`PixelCanvas` にディザ楕円プリミティブが無いため |
| S-3 | `racing` のホイール2フレーム化・ヘッドライトのハローを実施しない | [12](12-RacingPlugin.md) | **正式仕様**（Q6「深く触らない」の適用範囲として確定） |
| S-4 | `bullet_runner` の脚のネオンラインを省略 | [10](10-BulletRunnerPlugin.md) | **正式仕様**。脚のポーズごとに位置が変わる細部で視覚的影響が小さいため |
| S-5 | `PuzzleFeature` の盤面パネル・駒のドロップシャドウを省略 | [20](20-PuzzleFeature.md) | **正式仕様**。方向性のある影を表す適切なプリミティブが無いため |

なお `sideScroller` のハザードHPバー未変換は **S8 で修正済み**（簡略化ではなくなった）。

## レビュー反映の履歴

外部レビューの指摘により、以下を修正した（いずれも承認前の仕様段階での修正）。

| 指摘 | 対応 |
|---|---|
| `bandGradient` が 2 色固定で 3 ストップの既存描画を再現できない | ストップ配列を受け取る API に変更。`bandRadial` も追加（`00-rendering-system.md` §4） |
| 「1 ピクセル」の単位が曖昧で `_snap(1) === 0` になり細線が消える | 「実px」と「セル」を定義し、位置は `_snapPos`（round）、寸法は `_snapSize`（ceil + 下限 1 セル）に分離（§3） |
| `SpriteRenderer` の API が未定義（`px.sprite()` と `sprites.draw()` が混在） | `PixelCanvas.sprite()` に一本化。シグネチャ・スロット・キャッシュ・異常系を確定（§6） |
| `strokeText` 2 箇所の見落とし、`PixelText` の整列・縁取り・動的文字列の方針欠落 | `PixelText` API を確定（§5）。`PuzzleFeature` の文字 9 箇所を全件表に展開（[20](20-PuzzleFeature.md) 5.） |
| 変換後の座標がグリッドに整列しない | **デバイス空間でスナップする**方式に決定。D1 / D2 が解決（§3） |
| `aerial_stg` の向きが論理矛盾 | 既存の不具合と判明。スプライトは右向きで作る方針に修正し、Q5 としてユーザー確認へ（[05](05-AerialStgPlugin.md) 4.） |
| 全体集計が過少（行単位 grep の取りこぼし） | 全出現回数で再集計（§1） |
| `BasePlugin` のクラス行範囲が誤り | 14-120 / 125-142 / 147-164 に訂正（[03](03-BasePlugin.md)） |
| 「`onResize()` は ctx をリセットしない」が逆 | 訂正。リセットするのは `canvas.width` への代入であり、毎フレーム設定が**必要**である旨に修正（§4） |
| 「両方試す」等の未決記述 | D7 / D8 / D9 として既定を確定し、後退条件を §7 に明文化 |
| `pixelart.json` の実行時検証がない | `validate-json.mjs` / `ConfigValidator` への追加を §8 に明記。sprites の検証項目も定義 |

## 進行状況

**P0〜P5 実装完了 / S7 監査完了 / S8 で検出欠陥を全件修正済み。**

監査文書:
- [report.md](report.md) — 作業者による監査（初版の結論は撤回。**§12 が最終判定**）
- [audit-report.md](audit-report.md) — 独立監査（S7時点の判定: 修正および再監査が必要）

S7 の監査で欠陥8件（F-01〜F-08）が検出され、**S8 ですべて修正した。**

### 修正後の判定

| 項目 | 判定 |
|---|---|
| 要領書との整合 | ✅ **合格** |
| ゲームプレイ非侵害 | ✅ **直接・間接とも影響なし** |
| 実装の完了 | ✅ **S8 時点で既知だった欠陥はすべて解消** |
| 実機での目視確認 | ❌ **その後の実機確認で品質問題2件が判明**（下記 S9） |

主な修正:
- **F-01（実バグ）** — `PixelCanvas.sprite()` が回転を保持していなかった問題を修正。
  縦スクロール時に自機スプライトの画素が回るようになり、
  **Q5 で承認された「`aerial_stg` の自機を上向きに」が達成された**
  （ピクセル実測による検証: [report.md](report.md) §12.6）
- **F-02** — 「描画は乱数を消費しない」方針を確定し、回帰テスト
  `tests/feature-render-purity.test.mjs` で固定
- **F-04** — 実装上の簡略化5件を要領書に正式反映（上記 S-1〜S-5）
- その他 F-03・F-05〜F-08 も対応（詳細は [report.md](report.md) §12.6）

### S9: 実機確認による品質改修（2026-08-24、未着手）

S8 完了後にコミット・push し、**ユーザーが実機で確認**したところ品質問題が 2 件判明した。
仕様は [00-rendering-system.md §11](00-rendering-system.md) に確定済み。**実装は未着手。**

| # | 指摘 | 分類 | 対処方針 |
|---|---|---|---|
| **R-01** | 円形の描画が不安定 | **仕様違反**（§4 はミッドポイント円を指定していたが、実装はスキャンライン平方根方式） | 半径をセル数へ量子化し整数演算でミッドポイント円を実行。`ellipse`/`halfCircle` も同様。**アンチエイリアスは採用しない**（PixelArt 化の目的と矛盾し、かつ沸き立ちが直らないため） |
| **R-02** | 文字がかなり見づらい | **仕様不備**（§6 の方式に成立条件が欠けていた） | 倍率固定をやめ、焼き込み後のフォントサイズに下限（`textMinBakePx`）を設ける。大きい文字のドット感は維持したまま小さい文字の可読性を確保する |

これに伴い **D9（日本語の判読性）は「後退条件に該当」と判定された。**
ただし後退（ドット化の取りやめ）ではなく R-02 の方式で解決する。

### 残る未確認事項

**全ジャンルの実画面での目視確認は、この作業環境では実施できない。**
ブラウザペインが非表示の環境では `window.innerWidth` が 0 になり canvas も 0×0 となるため、
ゲームループ内の描画が発生せず原理的に確認できない。
R-01 / R-02 はユーザーの実機確認によって初めて判明したものであり、
**D7（ビネットの同心縞）・D8（ディザのちらつき）も同様にユーザー確認が必要である。**

詳細な進捗は `CLAUDE_TASKS.md` を参照。
