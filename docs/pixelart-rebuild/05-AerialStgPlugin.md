# AerialStgPlugin.ts PixelArt化仕様

## 対象ファイル

- `src/genres/AerialStgPlugin.ts`（439 行 / 描画量は全体 2 位）

### 影響を受けるファイル

| パス | 影響 |
|---|---|
| `src/game/render/PixelCanvas.ts` / `SpriteRenderer.ts` | 新規 |
| `src/data/sprites/player-aerial.json` | 新規。自機（真上から見た戦闘機） |
| `src/data/sprites/enemy-aerial-fighter.json` / `enemy-aerial-bomber.json` / `enemy-aerial-missile.json` | 新規。敵 3 種 |
| `src/game/sideScroller.ts` | `verticalBackgroundLayers = true` の分岐（`_drawBackground` 869-880 行）を経由する。**分岐自体は変更しない** |
| `src/data/genres/aerial_stg.json` | **変更しない** |

## 現状（Before）

計測値: `arc` 2 / `ellipse` 3 / グラデーション 6 / `_roundRect` 2 / `lineTo` 36（全ファイル中最多）/
`stroke` 2 / `fillRect` 5 / `shadowBlur` 2。

**唯一の縦スクロール専用プラグイン。** `verticalBackgroundLayers = true` を持つため、
`sideScroller._drawBackground()` の縦モード分岐で遠景・中景が描かれる
（横モードとは `gY` に渡る値が異なり、全画面高が入る）。

| 行 | メソッド | 現状の描画 |
|---|---|---|
| 119-152 | `drawFarLayer` | 遠くのすじ雲 |
| 153-176 | `drawMidLayer` | 中景の雲の層（`_drawCloud` を並べる） |
| 177-199 | `drawForeground` | ビネット + 四隅の HUD ブラケット |
| 200-209 | `_drawCloud` | `arc` の塊で雲を作る |
| 210-218 | `_rand` | 決定論的な擬似乱数（雲の配置用） |
| 219-300 | `drawPlayer` | 真上から見たジェット戦闘機。後退翼 + エンジン炎 |
| 301-325 | `drawHazard` | 敵の種類を判定して 3 種へ振り分け、`true` を返す |
| 326-358 | `_drawEnemyFighter` | 敵戦闘機 |
| 359-389 | `_drawBomber` | 爆撃機 |
| 390-421 | `_drawMissile` | ミサイル |
| 422-439 | `_drawHpBar` | HP ピップ |

`lineTo` が 36 箇所と突出しているのは、**機体の輪郭を多角形パスで描いているため**。
これは PixelArt 化で全てスプライトに置き換わり、最も効果が大きい部分。

## 変更方針（PixelArt化の仕様）

### 1. 空（`sideScroller` 側のグラデーション）

縦モードの空グラデーションは `sideScroller._drawBackground()` が描くため、
本ファイルではなく [01-sideScroller.md](01-sideScroller.md) 2. で帯グラデーション化される。
本ファイルは `skyColors` を提供するだけで、**値は変更しない**。

### 2. 雲（`_drawCloud`）→ ブロック雲

`arc` の塊で作られた雲を、`px.circle()` のブロック円の塊に置換する。

ドット絵の雲は「輪郭がはっきりした塊」で表現されるため、
現状の `globalAlpha` によるふんわりした重なりを、
**2〜3 段の明度差を持つブロック塊**に置き換える。

```
現状: 半透明の円を複数重ねてふわっとした雲
変更: 明色のブロック塊 + その下に暗色の影ブロック（2 階調）
```

`_rand()` による決定論的配置は**一切変更しない**（変えると雲が飛ぶ）。

### 3. 自機・敵 → スプライト（本ファイル最大の変更）

`lineTo` 36 箇所の多角形パスを、4 つのスプライトに置き換える。

| 現状 | スプライト |
|---|---|
| `drawPlayer` の戦闘機 | `player-aerial.json`（`idle` / `flame_a` / `flame_b`） |
| `_drawEnemyFighter` | `enemy-aerial-fighter.json` |
| `_drawBomber` | `enemy-aerial-bomber.json` |
| `_drawMissile` | `enemy-aerial-missile.json` |

敵の色は引数 `color`（= `hazard.color`）で動的に変わるため、
[04-StgPlugin.md](04-StgPlugin.md) 3. と同じ**動的色スロット（`@main` / `@shade`）**を使う。

**転送先サイズには既存の引数 `w` / `h` をそのまま渡す**ため、当たり判定は変わらない。

### 4. 縦向きの扱い（**当初版に論理矛盾があったため全面的に書き直した**）

#### 回転の仕組み（実測で確定）

`src/data/genres/aerial_stg.json` は `"scrollDirection": "vertical"` を持ち、
`ruleEngine.ts:61` が `scrollAxis: 'y'` に変換する。
その結果 `sideScroller._drawPlayer()`（999-1003 行）が**無条件に `-90°` 回転を適用する。**

回転の意図は同箇所のコメントに明記されている:
「縦スクロール時は進行（射撃）方向が上になるため、**右向き固定のスプライト**を
中心周りに -90° 回して上を向かせる」。

つまり `-90°` 回転は「**ローカル座標で右を向いているキャラクター**」を前提としている。
実際、ベクトル `(1, 0)`（右）は `-90°` 回転で `(0, -1)`（上）に写り、意図通り動作する。

#### 現状の矛盾

しかし `AerialStgPlugin.drawPlayer()` は**機体を最初から上向きに描いている**
（`AerialStgPlugin.ts:266` の `moveTo(cx, 0)` と、コメント「機体（機首は上）」）。

上向きベクトル `(0, -1)` を `-90°` 回転すると `(-1, 0)` = **左向き**になる。

> **結論（推測ではなく座標変換の帰結）: 現在の `aerial_stg` の自機は、
> 画面上で機首が左を向いて表示されているはず。**
> これは PixelArt 化以前から存在する不具合であり、本タスクが持ち込むものではない。
> ただしコードから導いた結論のため、**実装前に開発サーバーの
> `forceGenre=aerial_stg` で目視確認する。**

同じ `scrollDirection: "vertical"` を持つジャンルは他に `aquatic` と `bullet_hell` があるが、
両者とも**右向きのキャラクターを描いている**ため（`AquaticPlugin.ts:153-` のダイバー、
`bullet_hell` は `JSONGenrePlugin` 経由で `StgPlugin` の自機）、
回転は意図通りに働く。**矛盾しているのは `aerial_stg` だけ。**

#### 本タスクでの扱い

**スプライトは「右向き」で作る。** 理由:

- `sideScroller` 側の回転（ゲームプレイ側のコード）に手を入れずに済む
- 他の 2 ジャンルと前提が揃い、`GenrePlugin` の暗黙の契約
  （「`drawPlayer` は右向きで描く」）に沿う
- 結果として、画面上で機首が正しく**上**を向く

これは**現状の見た目を変える**（左向き → 上向き）。**ユーザー確認済み（Q5、2026-08-23）:
上向きに修正する方針で承認された。** 既存の不具合の修正を兼ねる旨も報告済み。
実装前に開発サーバーの `forceGenre=aerial_stg` で現状の向き（左向きのはず）を目視確認し、
修正後に上向きになったことも確認する。

### 5. HP バー・前景

- `_drawHpBar`: 座標スナップと角丸除去のみ。**HP 計算には触れない**
- `drawForeground`: ビネットは [03-BasePlugin.md](03-BasePlugin.md) 4. と同じ判断。
  HUD ブラケットは `px.line()` に置換

### 6. 変更しないもの

- `skyColors` / `groundColors` / `starColor` / `palette` の色の値
- `verticalBackgroundLayers = true` のフラグ
- `spawnTable` / `spawnDensity`
- `drawHazard` の敵種別の判定条件と戻り値 `true`
- `_rand()` の実装

## 実際に行った作業内容（実装後に追記）

2026-08-23、P3 として実装完了。

- **自機の向き（Q5・承認済み）: 仕様通りスプライトを右向きで作成した。** これにより
  `sideScroller._drawPlayer()` の `-90°` 回転後、機首が正しく上を向く
  （修正前は機首が左を向く既存不具合があった）
- 雲（`_drawCloud`）: `ctx.arc` → `px.circle` のブロック塊に置換。`_rand()` による
  決定論的配置・タイル分割・スクロール計算は無変更
- 自機・敵3種をスプライト化（`player_aerial.json` / `enemy_aerial_fighter.json` /
  `enemy_aerial_bomber.json` / `enemy_aerial_missile.json`）。敵3種は動的色スロット
  （`@main`/`@shade`、一部 `@light`）を使用
- エンジン炎・ミサイルの噴射炎は、当たり判定ボックスの外へはみ出すため
  スプライトに含めず別プリミティブ（`px.tri`）として残した（04と同じ方針）。
  爆撃機のエンジン光点（4点）も同様の理由で `px.circle` を別描画
- HP バー: `ctx.fillRect` → `px.rect`
- 前景: HUDブラケット → `px.line`、ビネット → `px.bandRadial`
- `verticalBackgroundLayers = true` のフラグ・`spawnTable`・`drawHazard` の判定条件と
  戻り値 `true`・`_rand()` の実装は無変更

検証結果: `typecheck` ✅ / `lint` ✅ / `validate`（120 passed、新規スプライト4件含む）✅。
ブラウザで `AerialStgPlugin` を動的importし、`drawFarLayer`/`drawMidLayer`/`drawPlayer`/
`drawHazard`（diamond・rect・pillar 全形状、HPバー込み）/`drawForeground` を実行し
コンソールエラー無し。スプライト4種は個別にPNGレンダリングして目視確認した
（自機が右向きに描かれていることを確認済み。回転後に上向きになるかは実機での
最終確認が必要、懸念点3を参照）。

## 懸念点・確認事項

1. **縦スクロールは弾幕が多く画面が忙しい。** ドット化により敵と背景の
   コントラストが下がると視認性が落ちる可能性がある。これは**推測**であり、
   実装後に実際にプレイして確認する。視認性が落ちた場合は
   スプライトのパレット側で輪郭色を強めて対処する（ゲームバランスは変更しない）。
2. **439 行**あり `CLAUDE.md` の 300 行目安を超える。スプライト化で減る見込みだが、
   減らなければ `_drawEnemyFighter` / `_drawBomber` / `_drawMissile` の分離を検討する。
3. **自機の向きの既存不具合（Q5・回答済み）**: コードの座標変換から導くと、
   現在 `aerial_stg` の自機は**機首が左を向いて**表示されている。
   **ユーザーの判断: 上向きに修正する（本仕様の既定通り）。**
   実装前後で開発サーバー（`forceGenre=aerial_stg`）による目視確認を行う。
4. 敵機（`_drawEnemyFighter` / `_drawBomber` / `_drawMissile`）は
   `drawHazard` から呼ばれ、`sideScroller._drawPlayer()` の回転は**適用されない**
   （回転はプレイヤー描画にのみ掛かる）。したがって敵機スプライトは
   **現状の描画と同じ向き（下向き＝プレイヤーに向かう向き）で作る。**
   自機とは扱いが異なる点に注意する。
