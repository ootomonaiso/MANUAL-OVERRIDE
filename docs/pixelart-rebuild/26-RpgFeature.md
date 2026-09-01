# RpgFeature.ts PixelArt化仕様

> **判断に迷ったファイル（Q2）。ユーザー確認の結果、対象に含めることが決定した。**
> ただし本ファイルは **`render()` メソッドを持たず、描画プリミティブが 0 箇所**。
> 実質的な作業は「間接的な見た目への影響の確認」になる。

## 対象ファイル

- `src/game/systems/RpgFeature.ts`（94 行 / 描画プリミティブ **0 箇所**）

### 影響を受けるファイル

| パス | 影響 |
|---|---|
| `src/game/ParticleSystem.ts` | **本ファイルの見た目はここ経由でのみ現れる**（[02](02-ParticleSystem.md)） |
| `src/game/sideScroller.ts` | スコアポップアップの描画元（[01](01-sideScroller.md) 7.） |
| `src/genres/RpgPlugin.ts` | 同ジャンルの背景・プレイヤー（[14](14-RpgPlugin.md)）。本ファイルとは別 |
| `src/data/config/vfx.json` | **変更しない。** 被弾パーティクルの色の定義元 |
| `src/data/genres/rpg.json` | **変更しない** |

## 現状（Before）

計測値: `arc` 0 / `ellipse` 0 / グラデーション 0 / `_roundRect` 0 / `lineTo` 0 /
`stroke` 0 / `fillRect` 0 / `fillText` 0 / `shadowBlur` 0。

**`FeatureSystem.render()` を実装していない。** `ctx` に触れるコードが 1 行もない。

| メソッド | 内容 | 分類 |
|---|---|---|
| `onPlayerHit()`（22-67 行） | シールドによる吸収（フィーチャーフラグを消費）、HP ダメージ、無敵時間、画面シェイク、**被弾パーティクルの生成** | ゲームロジック |
| `update()`（68-94 行） | アイテム取得 → EXP / HP / スコア加算、`onItemPickup` の他システムへの通知 | ゲームロジック |

**本ファイルの「見た目」は 2 つの間接経路でのみ画面に現れる。**

```
RpgFeature.onPlayerHit()
   ├─► world.addParticle(...)  ──► ParticleSystem.render()  ──► 円形の粒子
   └─► world.shake(...)        ──► sideScroller の translate

RpgFeature.update()
   └─► world.addScorePopup(...) ──► sideScroller の fillText  ──► スコア文字
```

**スコープ判断の根拠:** ゲームロジックは実装済みだが、
自前の描画コードはゼロ。`CLAUDE_OWNER.md` の
「見た目の変更が一切行われていないファイル」に該当するとも解釈できたため判断に迷った。
Q2 でユーザーが対象に含めると判断した。

## 変更方針（PixelArt化の仕様）

### 1. コードの変更は原則なし

**本ファイルに描画コードが存在しないため、直接の変更対象がない。**
見た目の PixelArt 化は以下によって自動的に達成される。

| 経路 | 対応する仕様書 |
|---|---|
| 被弾パーティクル → ブロック粒子 | [02-ParticleSystem.md](02-ParticleSystem.md) |
| スコアポップアップ → ドット文字 | [01-sideScroller.md](01-sideScroller.md) 7. |
| 画面シェイク | 対象外（座標変換であり描画表現ではない） |

### 2. P4 で行う検証

コードは変えないが、以下を**実際に確認する**のが本ファイルの作業内容。

1. デバッグ機能の `forceGenre=rpg` で被弾し、パーティクルがブロック化されているか確認
2. アイテム取得時のスコアポップアップがドット文字になっているか確認
3. シールド吸収時（フィーチャーフラグ消費）の挙動が変わっていないか確認
4. `npm run test:features` で回帰がないことを確認

### 3. パーティクルの生成パラメータ

`onPlayerHit()` が生成する粒子の**個数・速度・寿命・色は変更しない。**

ブロック化により見た目の密度が変わる可能性はあるが、
生成パラメータを調整するのは「見た目の変更」の範囲を超え、
**ゲームの手触りに関わる**ため行わない。

### 4. 変更しないもの（**本ファイルは全体が該当**）

- シールドによる吸収と**フィーチャーフラグの消費**
- HP ダメージ、無敵時間（i-frame）
- 画面シェイクの呼び出し
- パーティクル生成のパラメータ
- アイテム取得時の EXP / HP / スコア加算
- `onItemPickup` の他システムへの通知
- `update()` の処理順

## 実際に行った作業内容（実装後に追記）

2026-08-23、P4 として検証完了。**予告通り、コード変更はゼロ。**

- `src/game/systems/RpgFeature.ts` を再確認し、`render()` 未実装・`ctx` への参照ゼロを
  改めて確認した。差分なしと判断した理由は本書 1. の通り
- 間接経路の確認: `onPlayerHit()` の被弾パーティクルは `ParticleSystem.render()`
  （02-ParticleSystem.md で P1 実装済み、ブロック粒子化）、`update()` の
  スコアポップアップ（`+EXP`/`+HP`）は `sideScroller._render()` の `px.text()`
  （01-sideScroller.md で P1 実装済み、ドット文字化）を経由することを確認した。
  いずれも本ファイルのコードを一切変更せずに PixelArt 化が反映されている
- シールド吸収（`world.rules.features.delete('shield')`）・HP減算・無敵時間・
  EXP/HP付与・`onItemPickup` 通知の各ゲームロジックは無変更

検証結果: `typecheck` ✅ / `lint` ✅ / `test:features`（9/9）✅。`git diff` で
`RpgFeature.ts` に差分がないことを確認済み。

## 懸念点・確認事項

1. **本ファイルはコード変更ゼロで完了する見込み。**
   その場合「実際に行った作業内容」には検証結果のみを記載する。
   `CLAUDE_OWNER.md` の「仕様と実装に差異があれば理由も明記」に該当するため、
   「変更不要と判断した理由」として本書 1. を引用する。
2. **`render()` を追加すべきか**: RPG ジャンルには HP / EXP / Lv の HUD があってもよいが、
   **現状は存在しない。新規に追加するのは仕様追加**であり
   `CLAUDE_OWNER.md` のスコープ外。行わない。
   （なお `SurvivalPlugin.drawGenreHUD` には同種の HUD が既にあるため、
   RPG に無いのは意図的な設計と**推測**する）
3. Q2 の判断により対象に含めたが、結果として**差分ゼロになる可能性が高い**ことを
   あらかじめ共有しておく。
