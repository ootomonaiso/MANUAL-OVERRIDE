# BasePlugin.ts PixelArt化仕様

> **本ファイルは全 26 本の中で最も波及範囲が大きい。**
> `DarkThemePlugin` は 5 ジャンル分の既定描画を提供しているため、
> ここを PixelArt 化するだけで複数ジャンルが一度に切り替わる。P2 として単独フェーズを割り当てる。

## 対象ファイル

- `src/genres/BasePlugin.ts`（166 行 / 3 クラスを含む）
  - `DarkThemePlugin`（abstract, **14-120 行**）— 共通描画の実体
  - `BasePlugin`（**125-142 行**）— 色と `spawnTable` のみ
  - `RunnerPlugin`（**147-164 行**）— 色と `spawnTable` のみ

> 当初版は 22-142 / 147-163 / 168-184 と記載していたが誤り。
> ファイルは 166 行しかなく、168-184 行は存在しなかった。上記が実測値。

### 影響を受けるファイル

| パス | 影響 |
|---|---|
| `src/game/render/PixelCanvas.ts` / `SpriteRenderer.ts` | 新規。本ファイルの全描画が依存する |
| `src/data/sprites/player-base.json` | 新規。既定プレイヤーのスプライト |
| `src/engine/GenrePluginBase.ts` | `_roundRect()` ヘルパーの利用をやめる（**削除はしない**。他プラグインが使用中） |
| `src/genres/RhythmPlugin.ts` | `DarkThemePlugin` を継承し `super.drawMidLayer()` を呼ぶため間接的に変化（[17](17-RhythmPlugin.md)） |
| `src/plugins/JSONGenrePlugin.ts` | `base` へ委譲する 7 ジャンルが間接的に変化（[18](18-JSONGenrePlugin.md)） |
| `src/data/genres/base.json` / `runner.json` | **変更しない** |

### 本ファイルの変更が波及するジャンル

`DarkThemePlugin` の既定描画が実際に画面に出るのは以下。

| ジャンル | 経路 |
|---|---|
| `base` | `BasePlugin`（ゲーム開始直後・収束前の既定ジャンル） |
| `runner` | `RunnerPlugin` |
| `rhythm` | `RhythmPlugin` が継承。`drawMidLayer` のみ上書きし、他は既定のまま |
| `horror` / `idle` ほか JSON ジャンル | `JSONGenrePlugin` が `base` へ委譲 |

**特に `base` は「Phase A のチュートリアルで最初に見える画面」であり、
プレイヤーが最初に受け取る印象を決める。** 最優先で品質を確認する。

## 現状（Before）

計測値: `arc` 3 / `ellipse` 1 / グラデーション 1 / `_roundRect` 1 / `lineTo` 6 / `stroke` 4 / `fillRect` 2。

### `drawFarLayer()`（32-47 行）— 山のシルエット

`sin` 波の合成で山の高さを求め、`moveTo`/`lineTo` でパスを繋いで塗る。

```ts
const mh = Math.sin(wx * 0.006) * 90 + Math.sin(wx * 0.0119) * 45 + Math.sin(wx * 0.0241) * 25 + 110
```

`step = 40` ごとにサンプリングし、`globalAlpha = 0.35` で描画。

### `drawMidLayer()`（49-63 行）— ビル群のシルエット

セクタごとにハッシュ `(s * 2053) & 0xffff` からビルの位置・高さ・幅を決め、
`fillRect` で矩形を並べる。`globalAlpha = 0.55`。
**既に `fillRect` のみで構成されており、PixelArt と親和性が高い。**

### `drawPlayer()`（65-121 行）— 既定の人型ランナー

| 部位 | 現状の描画 |
|---|---|
| 影 | `ellipse(w/2, h+2, w*0.4, 4)` の半透明黒 |
| 胴 | `_roundRect(4, h*0.38, w-8, h*0.38, 4)` の `#e8e8f8` |
| 頭 | `arc(w*0.55, h*0.22, h*0.22)` の `#f0f0ff` |
| 目 | `arc(w*0.64, h*0.20, 3.5)` の `#222244` + `arc(..., 1.2)` の白ハイライト |
| 腕 | `stroke` / `lineWidth=5` / `lineCap='round'`、`Math.sin(t + π)` で振る |
| 脚 | `stroke` / `lineWidth=6`、`Math.sin(t)` で振る |

**色が全て直書き**（`#e8e8f8` / `#f0f0ff` / `#222244` / `#cccce0` / `#aaaacc`）。

### `drawForeground()`（124-131 行）— ビネット

`createRadialGradient` による四隅の暗転。

## 変更方針（PixelArt化の仕様）

### 1. 山のシルエット → 階段状の稜線

`px.ridge()` に置換する。**`sin` 波合成の式は一切変更しない**（地形の形状が変わってしまうため）。
変更するのはサンプリング方法のみ。

```
現状: step=40 ごとにサンプリング → lineTo で斜めに補間（滑らかな稜線）
変更: PIXELART.size ごとの列でサンプリング → 各列を fillRect の縦棒として描く（階段状の稜線）
```

これにより、レトロゲームの背景山らしいドット感が出る。
`globalAlpha = 0.35` は `px.withAlpha()` で量子化する。

### 2. ビル群 → 変更最小

既に `fillRect` のみなので、座標を `_snap` するだけでよい。
ハッシュ計算・セクタ計算・視差は変更しない。
さらに「ドット絵らしさ」を足すため、各ビルに **1〜2 セルの窓の点**を
グリッド整列で描き加える（ハッシュから決定論的に生成し、フレーム間でちらつかせない）。

### 3. プレイヤー → スプライト

`arc` / `ellipse` / `_roundRect` / `stroke` を全廃し、
`src/data/sprites/player-base.json` のスプライトに置き換える。

```ts
drawPlayer(ctx, w, h, onGround, runCycle): void {
  const frame = onGround
    ? (Math.floor(runCycle * FRAME_COUNT) % 2 === 0 ? 'run_a' : 'run_b')
    : 'jump'
  px.sprite('player_base', 0, 0, w, h, { frame })
}
```

> 当初版は `sprites.draw(ctx, ...)` と書いており、
> [01-sideScroller.md](01-sideScroller.md) の `px.sprite()` と表記が食い違っていた。
> `00-rendering-system.md` §5 で **`PixelCanvas.sprite()` に一本化**したため、
> 呼び出し側は `PixelCanvas` だけを見ればよい。

- **既存の引数 `onGround` / `runCycle` だけでフレームを決める。新しい状態は追加しない**
- 転送先サイズには呼び出し元が渡す `w` / `h`（= `Player` の `36 × 52`）をそのまま使うため、
  **当たり判定との一致が保たれる**
- 影の `ellipse` はスプライトに含めず、`px.ellipse()` のブロック楕円として残す
  （プレイヤーは `ctx.translate/scale` された座標系で描かれるため、
  影もその中に置かないと位置がずれる）
- 直書きされていた 5 色はスプライト JSON の `palette` へ移す
  → **ハードコーディング解消にもなる**

腕・脚の振り（`Math.sin`）はスプライトの `run_a` / `run_b` の 2 フレーム差分で表現する。
現状の連続的な揺れよりコマ数は減るが、ドット絵のアニメーションとしてはこちらが自然と考える。

### 4. ビネット → 段階ビネット（**既定を確定済み**）

`createRadialGradient` を `px.bandRadial()` に置換する。
既存の 2 ストップ（`rgba(0,0,0,0)` → `rgba(0,0,0,0.35)`）を
そのまま `stops` 配列として渡し、`PIXELART.gradientSteps` 段の同心リングにする。

```ts
px.bandRadial(W / 2, H / 2, Math.min(W, H) * 0.4, Math.max(W, H) * 0.75,
              [[0, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,0.35)']],
              PIXELART.gradientSteps)
```

**後退条件（`00-rendering-system.md` §8 の D7）:**
同心円状の縞が静止画で明確に視認できる場合のみ、
現状の `createRadialGradient` を維持する（D3 と同じ扱いにする）。
当初版は「実装時に両方試す」とだけ書いており完了条件が不明確だったため、
既定と後退条件を上記の通り確定させた。

### 5. 変更しないもの

- `BasePlugin` / `RunnerPlugin` の `skyColors` / `groundColors` / `farLayerColor` /
  `midLayerColor` / `starColor` / `palette` の**色の値**
- 両クラスの `spawnTable`（**ゲームプレイに直結するため絶対に触らない**）
- `id` / クラス構造 / `export default [new BasePlugin(), new RunnerPlugin()]`
- `GenrePlugin` インターフェースのメソッドシグネチャ

## 実際に行った作業内容（実装後に追記）

2026-08-23、P2 として実装完了。

- `drawFarLayer()`: `sin` 波合成の式は無変更。`moveTo`/`lineTo` によるパス補間を
  `px.ridge(-margin, W+margin, gY, heightAt, farLayerColor)` に置換。
  マージンは旧実装の `step=40` を踏襲しつつセル単位の定数 `FAR_LAYER_MARGIN_CELLS`（10セル）
  として file-scope の const にした。`globalAlpha=0.35` は `px.withAlpha` に置換
- `drawMidLayer()`: ハッシュ・セクタ・視差の計算式は無変更。`ctx.fillRect` を `px.rect` に
  置換（デバイス空間スナップが自動適用される）。加えて、各ビルに 1〜2 セルの「窓の点」を
  ハッシュ由来の決定論的な位置に追加。窓の色は新しい色を追加せず既存の `starColor` を流用した
  （`starColor` が未定義な将来のサブクラス向けに `midLayerColor` へのフォールバックを用意）
- `drawPlayer()`: `arc`/`ellipse`/`_roundRect`/`stroke` を全廃し
  `src/data/sprites/player_base.json` への `px.sprite('player_base', 0, 0, w, h, { frame })`
  に置換。影の `ellipse` のみ `px.ellipse()` としてスプライト外に残した（translate/scale
  された座標系内に描く必要があるため、仕様通り）。フレーム選択は
  `onGround ? (floor(runCycle * RUN_FRAME_COUNT) % 2 === 0 ? 'run_a' : 'run_b') : 'jump'`
  とし、`RUN_FRAME_COUNT = 2`（run_a/run_bの2枚構成に対応する実装固有の定数として
  file-scope const 化）。腕・脚の連続的な `Math.sin` 揺れは、スプライトの
  `run_a`/`run_b`（脚の踏み出しが左右で入れ替わる2フレーム）と `jump`（脚を引き上げた
  静止ポーズ）で表現した
- `drawForeground()`: `createRadialGradient` を `px.bandRadial()` に置換。
  ストップは既存の2ストップ（`rgba(0,0,0,0)` → `rgba(0,0,0,0.35)`）をそのまま渡した
- `BasePlugin`/`RunnerPlugin` の `skyColors`/`groundColors`/`farLayerColor`/`midLayerColor`/
  `starColor`/`palette`/`spawnTable` は無変更。`id`・クラス構造・
  `export default [new BasePlugin(), new RunnerPlugin()]` も無変更
- 新規スプライト `src/data/sprites/player_base.json`。直書きされていた5色
  （`#e8e8f8`/`#f0f0ff`/`#222244`/`#cccce0`/`#aaaacc`）はすべて palette へ移した。
  ファイル名は `id`（`player_base`）と一致させる必要があるため
  （`validate-json.mjs` の `basename === id` チェック）、仕様書中の例示パス
  `player-base.json`（ハイフン区切り）ではなく `player_base.json` で作成した
  （01-sideScroller.md 実装時と同じ理由の記載誤り訂正）
- `_roundRect()`（`GenrePluginBase.ts`）は本ファイルでは未使用になったが、削除していない
  （懸念点2の通り、他プラグインが使用中）

### プレイヤースプライトのデザイン改訂（ユーザーフィードバックによる、2026-08-23）

初版（9×13セル、`00-rendering-system.md` §5 の例示に合わせた解像度）を実装し
ユーザーに提示したところ、「右を向いて走っているように見えない」との指摘を受けた。
以下 2 段階で改訂した。

**v2（18×26セル、2倍解像度）**: 頭部を右に偏心させ全身を右前傾させる構図に変更したが、
「解像度が低すぎるのでは」「ほぼ白一色で陰影がない」という指摘を受けた。

調査の結果、`SpriteRenderer`（[SpriteRenderer.ts:60-61,122](../../src/game/render/SpriteRenderer.ts)）は
スプライト JSON が宣言する `w`×`h` をそのまま焼き込み解像度として使い、実際の転送先サイズ
（`Player` の `36×52`）へ引き伸ばすだけで、**`PIXELART.size`（背景・障害物側のセルサイズ）とは
一切連動していない**ことを確認した。そのため「重要なオブジェクトだけ解像度を上げる」対応は
コード変更なしで実現できる。これを踏まえ、以下を実施:

- 解像度を **27×39セル（3倍）** まで引き上げた（実ボックス36×52に対し1セル≈1.33実px）
- 元の5色に加え、**輪郭色**（`#12121e`、新規1色）と、元の4色それぞれを
  `darken(color, -45)` で暗くした**影色**（4色）を追加した。影色は既存コードの
  `_lighten()` と同じ技法（暗くする方向）で導出しており、直書きの新規色を増やす代わりに
  導出可能な色として扱っている

**v3（脚の生体力学修正、同日）**: v2 では「蹴り脚」が進行方向（右下）へ一様に伸びており、
「地面を蹴る際は進行方向と逆に脚を下ろすはず」「脚が2本あるように見えない」との指摘を受けた。
以下に修正:

- 脚を股関節→膝→足先の2関節構成にし、**前脚は進行方向（右）へ着地に向かう**・
  **後脚は進行方向と逆（左）へ蹴り上げて回復する**、という実際の走行動作に合わせた
- 手前の脚（`L`/明色）と奥の脚（`Ls`/暗色）を**脚の識別に固定**し、
  どちらが前に振り出されるかに関わらず常に同じ脚が明/暗になるようにした
  （遠近を表現し、2本脚であることを常時視認できるようにする狙い）

再生成には使い捨てスクリプト（プロシージャルにカプセル形状を積んで輪郭・影を自動付与する
ジェネレータ）をスクラッチパッドに作成して用いたが、リポジトリには含めていない
（`player_base.json` 自体が成果物であり、スクリプトは一時的な作業ツールのため）。

最終確認はユーザーに画像を提示し「確認しました。一旦これでやりましょう」との承認を得た。

検証結果: `typecheck` ✅ / `lint` ✅ / `validate`（113 passed、`player_base.json` 含む）✅ /
`build` ✅ / `bundle-size`（JS 437.5KB/800KB, CSS 80.4KB/100KB）✅。

ブラウザでの動作確認: Vite の動的 import で `BasePlugin` を直接インスタンス化し、
`drawFarLayer`/`drawMidLayer`/`drawPlayer`（run_a・run_b・jump 全フレーム）/`drawForeground`
を合成 canvas 上で実行しコンソールエラー無し。プレイヤースプライトの見た目そのものは
（実行環境の制約で実機スクリーンショットが撮れないため）Node で PNG を直接レンダリングし
ユーザーに画像として提示して確認を得た。この方法は 01-sideScroller.md / 02-ParticleSystem.md
で報告した「実機未確認」の代替として今回から採用した。

## 懸念点・確認事項

1. **ビネットの扱い**（上記 4.）: 既定は `bandRadial` による段階化で確定。
   後退条件は `00-rendering-system.md` §8 の D7 に明文化した。**同心円の縞が視認できるかは
   実機未確認**。
2. **`_roundRect()` の去就**: 本ファイルでは使わなくなるが、
   `src/engine/GenrePluginBase.ts:40-50` の定義自体は他プラグインが使用中のため削除しない。
   全プラグインの PixelArt 化が完了した時点で未使用になれば、その時に削除を検討する。
3. **`base` ジャンルの重要性**: チュートリアルで最初に表示される画面のため、
   他ジャンルより丁寧に目視確認する。プレイヤースプライトはオフスクリーン合成→PNG化した
   静止画でユーザー確認を得たが、**実際のゲームループ内（スカッシュ&ストレッチ・画面シェイク・
   スクロール中の視認性）での確認は未実施。** ハザードのベベル・ハローの見た目も含め、
   ユーザー側での実機確認を推奨する。
4. 窓の点の色を `starColor` に流用した判断について、意図と異なる場合はご指摘いただきたい
   （別の判断基準があればスプライト同様 palette 化等で対応する）。
5. **スプライト解像度が `PIXELART.size` と独立であることを確認した**（`player_base.json` を
   27×39セルへ引き上げても他の描画箇所へ影響しない）。この知見を `00-rendering-system.md` に
   追記した。今後のジャンルプラグイン（P3）で重要な敵・自機スプライトの解像度を個別に
   上げる余地がある。方針判断はユーザーと都度相談する。
