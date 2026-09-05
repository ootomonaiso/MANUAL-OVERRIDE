# ArenaPlugin.ts PixelArt化仕様

## 対象ファイル

- `src/genres/ArenaPlugin.ts`（177 行）

### 影響を受けるファイル

| パス | 影響 |
|---|---|
| `src/game/render/PixelCanvas.ts` / `SpriteRenderer.ts` | 新規 |
| `src/data/sprites/player-gladiator.json` | 新規。剣闘士（兜・盾・剣） |
| `src/data/sprites/torch.json` | [09-DungeonPlugin.md](09-DungeonPlugin.md) で作る松明スプライトを**共用する** |
| `src/data/genres/arena.json` | **変更しない** |

## 現状（Before）

計測値: `arc` 4 / `ellipse` 2 / グラデーション 0 / `_roundRect` 2 / `lineTo` 5 /
`stroke` 6 / `fillRect` 3 / `shadowBlur` 2。

| 行 | メソッド | 現状の描画 |
|---|---|---|
| 56-77 | `drawFarLayer` | コロシアムのアーチのシルエット（柱 + アーチ頂部） |
| 78-112 | `drawMidLayer` | 石柱、揺らめく炎の松明 |
| 113-177 | `drawPlayer` | 剣闘士。鎧の帯・羽根飾りの兜・盾・剣 |

`starColor = '#ff4422'`（赤橙）。ゲームロジックは持たない。

## 変更方針（PixelArt化の仕様）

### 1. コロシアムのアーチ（`drawFarLayer`）

アーチは `arc` による半円で描かれており、PixelArt 化の主対象。

| 要素 | 変更 |
|---|---|
| 柱 | 既に矩形に近い。`px.rect()` へ |
| アーチ頂部の半円 | `px.circle()` の上半分（ブロック半円）へ。**階段状のアーチ**になる |

石造建築の階段状アーチは、レトロゲームの背景として自然な表現と考える。
アーチの繰り返し間隔・配置ハッシュは変更しない。

### 2. 石柱・松明（`drawMidLayer`）

- 石柱: `px.rect()` の矩形組み合わせ
- 松明: **[09-DungeonPlugin.md](09-DungeonPlugin.md) 2. で作る `torch.json` を共用する。**
  スプライトを 1 つ作れば 2 ジャンルで使えるため、重複を避ける
  （`CLAUDE.md` の「同じロジックが 2 箇所以上に現れたら抽出」の方針に沿う）
- 炎の揺らぎを駆動する計算式は変更せず、値でフレームを選ぶ

### 3. 剣闘士（`drawPlayer`）→ スプライト

`player-gladiator.json` へ。

- 鎧の帯（`_roundRect` で描かれている横帯）→ 1〜2 セルの水平ライン
- 羽根飾りの兜 → スプライトに含める
- 盾（`ellipse`）→ ブロック楕円としてスプライトに含める
- 剣 → `runCycle` で `run_a` / `run_b` の角度差を表現

### 4. 変更しないもの

- `skyColors` / `groundColors` / `farLayerColor` / `midLayerColor` /
  `starColor` / `palette` の色の値
- `spawnTable`（`arena` は複数敵同時撃破のジャンルであり、スポーン設定は特に重要）
- アーチ・柱・松明の配置ハッシュ
- 炎の揺らぎの計算式

## 実際に行った作業内容（実装後に追記）

2026-08-23、P3 として実装完了。

- アーチのシルエット: 柱は `px.rect`。アーチ上部の半円は、当初このファイル内に専用ヘルパーとして
  実装したが、13-PlatformerPlugin.md の丘でも同じロジックが必要になったため
  `PixelCanvas.halfCircle()`（新規）へ昇格し、本ファイルはそちらを呼ぶ形に修正した
  （重複コード除去。詳細は 13-PlatformerPlugin.md の実装記録を参照）
- 石柱・松明: **`torch.json` は作成せず**、`px.circle` の直接呼び出しに簡略化した
  （09-DungeonPlugin.md と同じ判断。共用スプライトを作るより、両ジャンルで
  それぞれ手続き的に描くほうが炎の色の違いにも自然に対応できるため、
  懸念点2の動的色スロットは不要と判断した）。配置ハッシュ・揺らぎの式は無変更
- プレイヤーは `player_gladiator.json`（`player_base` と同じ2関節脚パターン。兜・羽根飾り・
  金属バンド・盾を含む）に置換。剣は本体ボックスを右へ大きく超えるため
  専用プリミティブ（`px.line`）として残した（04/05/08 と同じ方針）

検証結果: `typecheck` ✅ / `lint` ✅ / `validate`（127 passed、新規スプライト1件含む）✅。
ブラウザで `ArenaPlugin` を動的importし `drawFarLayer`/`drawMidLayer`/`drawPlayer` を実行し
例外なし。

## 懸念点・確認事項

1. **アーチのブロック半円**: 半円が小さい場合、階段が粗すぎて
   アーチに見えなくなる可能性がある。これは**推測**であり、実装後に目視で確認する。
   問題があればアーチだけ `PIXELART.size` より細かい格子で描く案があるが、
   統一感を損なうため最終手段とする。
2. **松明スプライトの共用**: `dungeon` と `arena` で炎の色が異なる場合、
   [04-StgPlugin.md](04-StgPlugin.md) 3. の動的色スロット（`@main`）で対応する。
   実装時に両ジャンルの現行の炎の色を確認してから決める。
