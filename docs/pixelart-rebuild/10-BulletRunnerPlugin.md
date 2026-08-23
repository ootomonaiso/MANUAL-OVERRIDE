# BulletRunnerPlugin.ts PixelArt化仕様

## 対象ファイル

- `src/genres/BulletRunnerPlugin.ts`（181 行）

### 影響を受けるファイル

| パス | 影響 |
|---|---|
| `src/game/render/PixelCanvas.ts` / `SpriteRenderer.ts` | 新規 |
| `src/data/sprites/player-cyber-runner.json` | 新規。サイバースーツの走者 |
| `src/data/genres/bullet_runner.json` | **変更しない** |

## 現状（Before）

計測値: `arc` 2 / `ellipse` 1 / グラデーション 0 / `_roundRect` 1 / `lineTo` 9 /
`stroke` 6 / `fillRect` 3 / **`shadowBlur` 4**。

| 行 | メソッド | 現状の描画 |
|---|---|---|
| 62-87 | `drawFarLayer` | ネオン都市のスカイライン・シルエット、窓のネオンの縦線 |
| 88-123 | `drawMidLayer` | 手前のビル群、光る看板、流れる横方向のネオンライン |
| 124-181 | `drawPlayer` | サイバースーツの走者。光るバイザーとネオンの装甲ライン |

`starColor = '#ff88ff'`（マゼンタ）。ゲームロジックは持たない。

## 変更方針（PixelArt化の仕様）

### 1. ネオン都市（`drawFarLayer` / `drawMidLayer`）— **PixelArt との相性が良い**

サイバーパンクのネオン都市は、ドット絵の代表的な題材であり、
現状の構成（矩形のビル + 細い光の線）をほぼそのまま活かせる。

| 要素 | 変更 |
|---|---|
| ビルのシルエット | 既に矩形なので座標の `_snap` のみ |
| 窓のネオン縦線 | `stroke` を `px.rect()`（幅 1〜2 セルの縦棒）へ。**むしろドット絵らしくなる** |
| 光る看板 | `shadowBlur` を `px.halo()` へ。看板本体は `px.rect()` |
| 流れる横ネオンライン | 既に矩形に近い。`px.rect()` へ置換し、流れる位置の計算式は変更しない |

窓の点灯パターンは、現状の決定論的ハッシュを使ったまま、
**点灯／消灯を 1 セル単位の格子で表現**するとドット感が強まる。
配置ハッシュは変更しない（変えると窓が飛ぶ）。

### 2. サイバー走者（`drawPlayer`）→ スプライト

`player-cyber-runner.json` へ。

- スーツ本体・装甲
- **光るバイザー** — `shadowBlur` のグローを、バイザーの明色 1〜2 セル +
  周囲の中間色で表現する（[08-HackSlashPlugin.md](08-HackSlashPlugin.md) 3. の「光る目」と同じ手法）
- ネオンの装甲ライン — 1 セル幅の明色ラインとしてスプライトに含める
- 走行は `runCycle` で `run_a` / `run_b` の 2 フレーム

### 3. 変更しないもの

- `skyColors` / `groundColors` / `farLayerColor` / `midLayerColor` /
  `starColor` / `palette` の色の値
- `spawnTable`
- ビル・窓・看板の配置を決める決定論的ハッシュ
- 横ネオンラインの流れる速度・位置の計算式
- `parallax` 設定

## 実際に行った作業内容（実装後に追記）

2026-08-23、P3 として実装完了。

- ビル・窓・看板は座標を `px.rect`/`px.ridge` へ、看板の `shadowBlur` は `px.halo`
  へ置換。配置ハッシュ・流れる横ネオンラインの速度/位置の式は無変更
- プレイヤーは `player_cyber_runner.json`（`player_base` と同じ2関節脚パターン）に置換。
  バイザーの連続的な色相回転（`hsl((t*2+180)%360, ...)`）は静的にキャッシュされる
  スプライトでは再現できないため、固定の明色シアン系1色に単純化した（懸念点1と関連。
  ハローではなく固定色を選んだのは、色が絶えず変わる演出よりも視認性を優先したため）
- **脚のネオンライン（足首付近の短い光る線）は省略した。** 脚のポーズごとに位置が
  変わる細部であり、実装コストに対して視覚的な影響が小さいと判断した簡略化
  （懸念点2「弾の視認性」への配慮も兼ねる）

検証結果: `typecheck` ✅ / `lint` ✅ / `validate`（126 passed、新規スプライト1件含む）✅。
ブラウザで `BulletRunnerPlugin` を動的importし `drawFarLayer`/`drawMidLayer`/`drawPlayer`
を実行し例外なし。

## 懸念点・確認事項

1. **`shadowBlur` 4 箇所がネオンの「光っている感」の主役**になっている。
   ブロックハローへの置換で光が硬くなり、ネオンらしさが落ちる可能性がある。
   これは**推測**である。対策として `PIXELART.haloSteps` を本ジャンルだけ
   多めにしたくなる可能性があるが、その場合は
   `pixelart.json` にジャンル別上書きの仕組みが必要になる。
   **まずは共通設定で実装し、必要になった時点でユーザーに相談する。**
2. 本ジャンルは弾を避けながら走るため画面が忙しい。
   背景のネオンが派手になりすぎて弾の視認性を下げないか、実装後にプレイして確認する。
