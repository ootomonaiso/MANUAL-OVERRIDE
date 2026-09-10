# bullet_runner 実装仕様（簡易版）

元設計: `Bullet_Runner.md`（ユーザー添付）。デザイン指定: 夜のネオン街。

## コア

- 既存の `auto_run` + `shoot` + `enemy_hp` を維持。runner と同じ hole/platform/spring ギミックを流用。
- 敵とギミックを明確に分離する:
  - 敵（`isGimmick:false` の通常ハザード）: `enemy_hp` により複数発必要、HPバーは既存実装
    （`_drawHazard` の `enemy_hp && maxHp>1` 分岐）がそのまま使える。密度を runner より高くする。
  - 障害物・ギミック（穴・足場・バネ・通常の壁）: `isGimmick:true` を付与し、
    `ShootFeature` の弾×ハザード衝突判定から除外（弾が素通りし、破壊されない）。
- 弾は既存の `ShootFeature` をそのまま使用（新規射撃ロジックは作らない）。

## ビジュアル

- 夜のネオン街（既存 `BulletRunnerPlugin` のサイバーシティ夜景をベースに、ネオンの密度・彩度を強調）。
- 敵は既存パレットの danger 色、ギミック（穴・足場・バネ）は runner と共通の描画ロジックを使うが
  ネオン配色に合わせて `colorOverride` で色だけ変える。

## 変更ファイル

- `src/data/genres/bullet_runner.json`（spawnDensity 調整で敵密度を上げる）
- `src/genres/BulletRunnerPlugin.ts`（spawnTable に敵多数 + ギミック少数を再構成）
- `src/game/systems/ShootFeature.ts`（`isGimmick` ハザードを弾衝突から除外）
