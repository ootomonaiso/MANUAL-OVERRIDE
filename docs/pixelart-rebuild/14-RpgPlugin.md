# RpgPlugin.ts PixelArt化仕様

> **Q7・ユーザー回答済み（2026-08-23）: `rpg` は未完成ジャンルのため深く触らない。**
> アニメーションの追加は行わず、現状通り静止 1 フレームのままとする。

## 対象ファイル

- `src/genres/RpgPlugin.ts`（78 行）

### 影響を受けるファイル

| パス | 影響 |
|---|---|
| `src/game/render/PixelCanvas.ts` / `SpriteRenderer.ts` | 新規 |
| `src/data/sprites/player-knight.json` | 新規。鎧の騎士 |
| `src/data/sprites/tree-round.json` | 新規。丸い樹冠の木 |
| `src/plugins/JSONGenrePlugin.ts` | **`theme: 'dungeon'` の JSON ジャンルが本プラグインへ委譲される**（[18](18-JSONGenrePlugin.md)）。波及あり |
| `src/game/systems/RpgFeature.ts` | 同ジャンルのロジック（[26](26-RpgFeature.md)）。本ファイルとは別 |
| `src/data/genres/rpg.json` / `dungeon.json` | **変更しない** |

## 現状（Before）

計測値: `arc` 1 / `ellipse` 0 / グラデーション 0 / `_roundRect` 1 / `lineTo` 3 /
`stroke` 1 / `fillRect` 3。

**描画量が少なく、コードもシンプル**（78 行）。

| 行 | メソッド | 現状の描画 |
|---|---|---|
| 29-43 | `drawFarLayer` | 霧のかかった低い丘 |
| 44-60 | `drawMidLayer` | 木のシルエット（幹の矩形 + `arc` の丸い樹冠） |
| 61-78 | `drawPlayer` | 騎士。丸みのある鎧の胴・兜・金色のバイザー帯・縦に振られる剣 |

`starColor = undefined`（コメントに「星なし（森なので）」と明記）。
ゲームロジックは持たない。

## 変更方針（PixelArt化の仕様）

### 1. 丘（`drawFarLayer`）

`px.ridge()` による階段状の稜線へ。
霧は [06-SurvivalPlugin.md](06-SurvivalPlugin.md) 1. と同じくディザリングで表現する。

### 2. 木（`drawMidLayer`）→ スプライト

幹の矩形 + `arc` の丸い樹冠を `tree-round.json` のスプライトへ。

ドット絵の木は「丸い塊 + 内側に 1 段暗い影 + 幹」の 3 階調が定番。
現状は単色シルエットのため、**階調を足すことで密度感が上がる**と考える。
サイズ違いで使い回し、配置ハッシュは変更しない。

### 3. 騎士（`drawPlayer`）→ スプライト

`player-knight.json` へ。

| 部位 | 現状 | 変更後 |
|---|---|---|
| 鎧の胴 | `_roundRect` の丸み | 角落としの矩形としてスプライトに含める |
| 兜 | パス | スプライトに含める |
| 金色のバイザー帯 | 横帯 | 1〜2 セルの金色ライン |
| 剣 | `stroke` の縦線 | スプライトに含め、単一フレームで表現 |

**Q7 の回答により、アニメーションは追加しない。** `drawPlayer` の引数は現状
`_onGround` / `_runCycle` の両方が未使用（`_` プレフィックス付き）で、
アニメーションしていない。スプライト化後もこれを維持し、
`frames` は `idle` の 1 種類のみを用意する。

### 4. 変更しないもの

- `skyColors` / `groundColors` / `farLayerColor` / `midLayerColor` / `palette` の色の値
- `starColor = undefined`
- `spawnTable`
- 丘・木の配置を決める計算

## 実際に行った作業内容（実装後に追記）

2026-08-23、P3 として実装完了。Q7 の通りアニメーションは追加せず静止1フレームのまま。

- 丘 → `px.ridge`。木 → `tree_round.json`（幹+明色の樹冠+内側の影の3階調。
  いずれも `midLayerColor`（`#081a08`）から `darken()` で派生させた色のみを使用し、
  新しい色の値は導入していない）
- プレイヤーは `player_knight.json`（単一 `idle` フレーム。胴・兜・バイザー帯・剣を含む）
  に置換。剣は当たり判定ボックス内（`w*0.85` 以内）に収まるため、他ジャンルと異なり
  スプライトにそのまま含められた（04/05/08/11 のような別プリミティブ化は不要）

検証結果: `typecheck` ✅ / `lint` ✅ / `validate`（132 passed、新規スプライト2件含む）✅。
ブラウザで `RpgPlugin` を動的importし `drawFarLayer`/`drawMidLayer`/`drawPlayer` を実行し
例外なし。

## 懸念点・確認事項

1. ~~アニメーションの追加~~ → **Q7 の回答により解消。** 静止 1 フレームのまま実装する。
2. **`JSONGenrePlugin` からの委譲**: `TO_DELEGATE_ID` には
   `dungeon: 'rpg'` と `rpg: 'rpg'` の 2 経路が本プラグインを指している。
   ただし `src/genres/index.ts:64-73` の確認により、
   **TS プラグインが存在するジャンルは `hasGenre()` で除外され
   `JSONGenrePlugin` が生成されない**ことを確定した。
   したがって `rpg` / `dungeon` 両ジャンルとも専用の TS プラグインが使われ、
   本プラグインが `dungeon` ジャンルに使われることはない。
   `dungeon: 'rpg'` の経路は、`visual.template: 'dungeon'` を指定した
   ユーザー追加ジャンルでのみ到達する（現在該当する JSON はゼロ）。
