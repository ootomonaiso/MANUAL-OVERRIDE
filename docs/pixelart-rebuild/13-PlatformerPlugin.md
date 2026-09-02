# PlatformerPlugin.ts PixelArt化仕様

> **本ジャンルは「ドット絵の原点」に最も近い。** 明るい空・丸い緑の丘・帽子のキャラクターという
> 構成は 8bit / 16bit 期のプラットフォーマーそのものであり、
> PixelArt 化の効果が最も分かりやすく出る。品質の基準として先に仕上げたい。

## 対象ファイル

- `src/genres/PlatformerPlugin.ts`（153 行）

### 影響を受けるファイル

| パス | 影響 |
|---|---|
| `src/game/render/PixelCanvas.ts` / `SpriteRenderer.ts` | 新規 |
| `src/data/sprites/player-platformer.json` | 新規。帽子のキャラクター |
| `src/data/sprites/cloud-fluffy.json` | 新規。白い雲 |
| `src/plugins/JSONGenrePlugin.ts` | `theme: 'platformer'` は `TO_DELEGATE_ID` に無く `base` へフォールバックする（[18](18-JSONGenrePlugin.md) 参照） |
| `src/data/genres/platformer.json` | **変更しない** |

## 現状（Before）

計測値: **`arc` 8**（ジャンルプラグイン中最多）/ `ellipse` 1 / グラデーション 0 /
`_roundRect` 1 / `lineTo` 4 / `stroke` 4 / `fillRect` 1 / `fillText` 1。

**他ジャンルと異なり明るい配色**を持つ唯一のプラグイン。

```ts
skyColors    = ['#1a88e8', '#4db8ff']   // 明るい青空
groundColors = ['#2d7a2d', '#1a5c1a']   // 緑の地面
starColor    = undefined                 // 昼なので星なし
```

| メソッド | 現状の描画 |
|---|---|
| `drawFarLayer` | ふわふわした白い雲（`arc` の塊） |
| `drawMidLayer` | 丸い緑の丘（`arc` で描かれた半円） |
| `drawPlayer` | 赤いジャンパー（★ロゴ付き、`fillText` で描画）、肌色の頭、赤い帽子、大きな目、青いズボン、振られる手足 |

`arc` が 8 箇所と多いのは、**雲・丘・キャラの頭部と目がすべて円**だから。
PixelArt 化で最も変化が大きいファイルの一つ。

## 変更方針（PixelArt化の仕様）

### 1. 雲（`drawFarLayer`）→ スプライト

`arc` の塊で作られたふわふわした雲を `cloud-fluffy.json` のスプライトへ置換する。

ドット絵の雲は「白い塊 + 下側に 1 段暗いグレー」の 2 階調が定番。
現状の半透明の重なりを、この 2 階調表現に置き換える。
サイズ違いで同じスプライトを使い回し、配置ハッシュは変更しない。

### 2. 丸い丘（`drawMidLayer`）→ ブロック半円

`arc` の半円を `px.circle()` の上半分に置換する。
**階段状の丸い丘**になり、レトロプラットフォーマーの背景そのものになる。

丘の頂点に 1〜2 セルの明色ハイライトを足すと立体感が出るため、追加する。
丘の配置・サイズを決める計算は変更しない。

### 3. キャラクター（`drawPlayer`）→ スプライト（**最重要**）

`player-platformer.json` へ。以下を含める。

| 部位 | 現状 | 変更後 |
|---|---|---|
| 赤いジャンパー | `_roundRect` | スプライト。角丸は角落としで表現 |
| ★ロゴ | **`fillText` で星の文字を描画** | スプライト内に 5〜7 セルの星形として直接描く |
| 頭 | `arc`（肌色） | ブロック円 |
| 赤い帽子 | パス | スプライトに含める。つばを 1 セルの段差で表現 |
| 大きな目 | `arc` | 2〜3 セルの黒 + 1 セルの白ハイライト |
| 青いズボン・手足 | `stroke` | スプライトに含め、`run_a` / `run_b` で振りを表現 |

**★ロゴの `fillText` はスプライト化により不要になる。**
文字として描くよりドット絵として描いた方が自然であり、
`PixelText` を通す必要もなくなる。

### 4. 変更しないもの

- `skyColors` / `groundColors` / `farLayerColor` / `midLayerColor` / `palette` の色の値
- `starColor = undefined`
- `spawnTable`
- 雲・丘の配置を決める計算
- `runCycle` / `onGround` の使い方

## 実際に行った作業内容（実装後に追記）

2026-08-23、P3 として実装完了。

- 雲は `cloud_fluffy.json`（3つの円を重ねた白い塊 + 下側の影1段）に置換し、
  `drawImage` の転送先サイズを変えるだけでサイズ違いに対応（配置の計算式は無変更）
- 丘は `px.halfCircle()`（新規、後述）でブロック半円化。頂点に半透明の白ハイライトを追加
  （仕様通り、立体感のための許容範囲の追加）。配置・サイズの計算式は無変更
- **`PixelCanvas` に `halfCircle(cx, cy, r, dir, color)` を追加した。**
  理由: 11-ArenaPlugin.md のアーチ上部でも同じ「ブロック円の上半分」ロジックが
  必要になり、当初は各ファイルの private メソッドとして重複実装していたが、
  `CLAUDE.md` の「同じロジックが2箇所以上に現れたらヘルパーへ抽出」に従い
  `PixelCanvas` 本体（`src/game/render/PixelCanvas.ts`）へ昇格させ、両ファイルから
  `px.halfCircle()` として呼ぶよう修正した
- プレイヤーは `player_platformer.json`（`player_base` と同じ2関節脚パターン。
  帽子・大きな目・星ロゴを含む）に置換。★ロゴの `fillText` は不要になり、
  スプライト内にドット絵の星形として直接焼き込んだ（仕様通り）

検証結果: `typecheck` ✅ / `lint` ✅ / `build` ✅ / `validate`（130 passed、新規スプライト2件
含む）✅。ブラウザで `PlatformerPlugin`/`ArenaPlugin` を同時に動的importし、両方が
`px.halfCircle()` を共有した状態で例外なく実行できることを確認した。
プレイヤースプライトは個別にPNGレンダリングして目視確認済み（懸念点2の「既存キャラクターとの
類似」については意匠を変更せず現状のデザインを踏襲した）。

## 懸念点・確認事項

1. **本ファイルを P3 の最初に着手したい。** 明るい配色でドット絵の
   出来不出来が最も分かりやすいため、ここで品質基準を固めてから
   他ジャンルへ展開するのが効率的と考える。
   P3 の中で本ファイルを最初に実装し、一度ユーザーに見せて方向性を確認したい。
2. **キャラクターのデザイン**: 現状は既存の有名プラットフォーマーを
   想起させる意匠（赤い帽子・赤いジャンパー・大きな目）になっている。
   ドット絵にすると元ネタとの類似がより明確になる可能性がある。
   これは**推測**だが、意匠を変える／変えないの判断は
   本タスクのスコープを超えるため、**現状のデザインを踏襲する**にとどめ、
   気になる場合はユーザーに判断を仰ぐ。
