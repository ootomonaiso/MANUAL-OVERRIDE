# SpecialFeature.ts PixelArt化仕様

## 対象ファイル

- `src/game/systems/SpecialFeature.ts`（250 行 / 描画は `render()` の **144-186 行のみ**）

### 影響を受けるファイル

| パス | 影響 |
|---|---|
| `src/game/render/PixelCanvas.ts` / `SpriteRenderer.ts` | 新規 |
| `src/data/sprites/tower.json` | 新規。タワーの砲塔 |
| `src/data/config/stealth.json` | **変更しない。** `stealthAlpha` の定義元 |
| `src/data/config/special.json` | **変更しない。** `towerFireIntervalSec` 等の定義元 |
| `src/data/config/boss.json` | **変更しない。** ボスの出現・HP 設定 |
| `src/data/genres/stealth_action.json` / `tower_def.json` | **変更しない** |

## 現状（Before）

計測値: `arc` 0 / `ellipse` 1 / グラデーション 0 / `_roundRect` 0 / `lineTo` 0 /
`stroke` 0 / `fillRect` 5 / `fillText` 0。

**3 つの独立したフィーチャーを 1 ファイルで担当**しており、
`render()` はフィーチャーフラグごとに 3 ブロックに分かれている。

| フィーチャー | 描画（`render()` 内） | 色の出所 |
|---|---|---|
| `stealth_mode` | プレイヤー足下の `ellipse` による青い外套 | `globalAlpha = STEALTH.stealthAlpha`（JSON）/ `fillStyle = '#88ccff'`（**直書き**） |
| `tower` | 砲塔の本体 `fillRect(14×36)` + 上部 `fillRect(20×8)` + リロードバー | `'#7a8a99'` / `'#cfe8ff'` / `'rgba(255,255,255,0.6)'`（**すべて直書き**） |
| `boss` | HP バー（背景 / 塗り / 白枠） | `'rgba(0,0,0,0.5)'` / `'#ff4444'` / `'#ffffff'`（**すべて直書き**） |

**注:** 座標のオフセット（`p.x - 26`、`p.y + p.h - 36`、`boss.y - 14` など）と
サイズ（`14`、`36`、`20`、`8`、`6`）も**すべて直書き**されている。

## 変更方針（PixelArt化の仕様）

### 1. ステルス外套

`ctx.ellipse()` を `px.ellipse()` のブロック楕円へ置換する。
`STEALTH.stealthAlpha` は引き続き JSON から読み、
`px.withAlpha()` で量子化する。

ドット絵のステルス表現としては、**楕円をディザ（市松）で塗る**と
「透けている」感じが出る。**`px.dither()` を既定とする（D8）。** 後退条件は `00-rendering-system.md` §8（スクロール時にちらつく場合のみ `withAlpha` へ後退）。

### 2. タワー → スプライト

砲塔の本体・上部・リロードバーを `tower.json` のスプライト + `px.rect()` に置換する。

| 要素 | 変更 |
|---|---|
| 砲塔本体（`14×36`）・上部（`20×8`） | `tower.json` のスプライトへ。直書きの色 `#7a8a99` / `#cfe8ff` はスプライトの `palette` へ移す |
| リロードバー | `px.rect()`。**幅の計算 `20 * reload` は変更しない**（リロード進捗の表示であり、`towerFireIntervalSec` に連動する） |

**スプライトの転送先サイズには現状と同じ `14×36` / `20×8` を渡す**ため、
見た目のサイズは変わらない。

### 3. ボス HP バー

`fillRect` 2 本 + `strokeRect` 1 本。座標のスナップと以下の置換のみ。

- `strokeRect` → `px.line()` による 1 セルの枠線
- **`boss.hp / boss.maxHp` の比率計算と `boss.w * ratio` の幅計算は変更しない**

### 4. 直書きされた色の扱い

本ファイルには色が 6 箇所直書きされている。

- **タワーの 2 色** → スプライト JSON の `palette` へ移す（PixelArt 化の副次効果）
- **ステルスの `#88ccff`、ボス HP の 3 色** → スプライト化しないため
  JSON への移設が必要になる。`stealth.json` / `boss.json` に
  色キーを追加するのが自然だが、**これは PixelArt 化に必須ではない変更**であり、
  スコープの拡大にあたる → 懸念点参照

座標・サイズの直書き（`26` / `36` / `14` など）も同様の論点を持つ。

### 5. 変更しないもの（**本ファイルは特に厳格に**）

- ステルスの待機タイマー（`_updateStealth`）
- タワーの自動発射クールダウン（`_updateTower`）
- ボスの出現・HP・撃破処理（`onBossSpawn` / `_onBossDefeated`）
- タイムボーナス（`_updateTimeBonus`）
- `onSafeHazardTouch` のスコア加算
- `render()` 冒頭の 3 つのフィーチャーフラグ判定
- `STEALTH` / `SPECIAL` / `BOSS` 設定の値

## 実際に行った作業内容（実装後に追記）

2026-08-23、P4 として実装完了。

- **ステルス外套**: `px.dither()`（既定D8）に置換。ただし `PixelCanvas` に
  ディザ楕円のプリミティブが無いため、**楕円ではなく矩形（バウンディングボックス）を
  ディザで塗る形に簡略化した。** 見た目は完全な楕円ではなく角のある領域になるが、
  透けている印象自体は維持できると判断した。`STEALTH.stealthAlpha` はそのまま
  `px.withAlpha()` に渡している（係数の調整は行っていない）
- **タワー**: 本体(`14×36`)と上部(`20×8`)を1枚の `tower.json` スプライトへ統合。
  2つの矩形の合成バウンディングボックス（`towerX-3, towerY-6, 20, 42`）へ
  同じサイズで転送するため見た目のサイズは変わらない。直書きだった2色
  （`#7a8a99`/`#cfe8ff`）はスプライトの `palette` へ移した。リロードバーは
  `px.rect()` のみに置換し、幅の計算式（`20 * reload`）は無変更
- **ボスHPバー**: `fillRect`2本は `px.rect()`、`strokeRect` は `px.line()` 4本の
  1セル枠線に置換。`boss.hp/boss.maxHp` の比率計算・幅計算は無変更
- **直書きされた色・座標の扱い（懸念点1）**: 仕様通り、タワー以外
  （ステルスの `#88ccff`、ボスHPバーの3色、座標オフセット `26`/`36` 等）は
  変更せず維持した
- ステルスの待機タイマー・タワーの発射クールダウン・ボスの出現/HP/撃破処理・
  タイムボーナス・`onSafeHazardTouch` のスコア加算は無変更

検証結果: `typecheck` ✅ / `lint` ✅ / `validate`（133 passed、新規スプライト1件含む）✅ /
`test:features`（9/9）✅。ブラウザで `render()` を3フィーチャー全て有効な状態で実行し
例外なし。

## 懸念点・確認事項

1. **直書きされた色・数値の JSON 移設**（上記 4.）: タワー分はスプライト化で
   自然に解消するが、ステルスとボス HP バーの色・座標は
   JSON へ移すかどうかが論点になる。
   `CLAUDE_OWNER.md` の「ハードコーディングされた値の追加は禁止」は
   **追加**の禁止であり、既存の直書きの解消までは求めていないと解釈できる。
   **本タスクでは既存の直書きをそのまま残し、報告のみ行う。**
   移設を希望される場合はユーザーの指示を待つ。
2. **`glitch` / `stealth_action` ジャンルの描画**: `stealth_action` は
   `JSONGenrePlugin` 経由で `base` にフォールバックしており
   （[18-JSONGenrePlugin.md](18-JSONGenrePlugin.md) 懸念点 1）、
   本ファイルのステルス外套だけがジャンル固有の見た目になっている。
   これは既存の状態であり、本タスクでは変更しない。
