# aquatic 実装仕様（簡易版）

元設計: `aquatic.md`（ユーザー添付）。デザイン指定: 深海・地形は岩。

## コア

- 縦スクロール（`scrollDirection: vertical`）。プレイヤーは4方向自由移動、地面なし。
- ハザードは画面下から出現し上へ流れる（新規: `SpawnEntry.direction: 'left'` を「下から出現・上へスクロール」の意味で流用）。
- 酸素ゲージ = `player.hp`/`maxHp` を流用（HUDは既存HPバー表示を「酸素」ラベルで表示）。
  - 時間経過で毎フレーム減少（`world.modifyPlayerHp(-rate*dt)`）。
  - 0 になった時点で既存の `modifyPlayerHp` 内部処理がそのまま `_die()` を呼ぶ（追加実装不要)。
- 地形（岩）・危険生物・回復サンゴは全て `isSafe:true` として生成し、`_onPlayerHit` の
  即死フォールバックを迂回する（危険生物との接触を「酸素の大幅減少」で表現するため）。
  実際の効果は新規 `AquaticFeature.update()` が毎フレーム重なり判定して処理する。
  - `interactionKind: 'terrain'`（岩）: 重なっている間、上方向へ押し戻す（`player.y -= pushSpeed*dt`）。
  - `interactionKind: 'creature'`（危険生物・構造物）: 重なっている間、酸素を高レートで減少。
  - `interactionKind: 'heal'`（サンゴ）: 重なっている間、酸素を回復。継続的に泡パーティクル。
- 画面上端から完全に出た場合（`player.y + player.h <= 0`）: 即ゲームオーバー
  （`world.modifyPlayerHp(-9999)` で既存の死亡経路に載せる）。

## ビジュアル

- 深海の岩壁（地形）はゴツゴツした岩のシルエット（既存の珊瑚描画とは別に岩ブロックを追加）。
- 危険生物は棘・牙を思わせる形状、サンゴは既存実装の泡演出を流用。

## スコア

`scoreFormula` は既存のまま（`distance`=潜行深度として流用、`itemsCollected`, `survivedSec`）。

## 変更ファイル

- `src/data/genres/aquatic.json`（enableFeatures に `oxygen` 追加、`hp`/`slow_precise` は整理）
- `src/genres/AquaticPlugin.ts`（spawnTable に岩・危険生物・サンゴを再構成、岩の描画追加）
- `src/game/systems/AquaticFeature.ts`（新規）
- `src/game/systems/index.ts`（登録）
- `src/data/config/aquatic.json`（新規: 酸素減少率・押し戻し速度・回復率・生物ダメージ率）
- `src/game/sideScroller.ts`（縦スクロールの `direction:'left'` = 下から出現対応）
