# ParticleSystem.ts PixelArt化仕様

## 対象ファイル

- `src/game/ParticleSystem.ts`（55 行 / 描画は `render()` の **41〜52 行**のみ）

### 影響を受けるファイル

| パス | 影響 |
|---|---|
| `src/game/render/PixelCanvas.ts` | 新規。`rect()` と `withAlpha()` を使用 |
| `src/data/config/pixelart.json` | 新規。`size` / `alphaSteps` を参照 |
| `src/game/sideScroller.ts` | **変更しない**（`particles.render(ctx)` の呼び出しはそのまま） |
| `src/data/config/vfx.json` | **変更しない**（`jumpParticleColor` / `landParticleColor` / `deathParticleColors` をそのまま使う） |

## 現状（Before）

パーティクルの生成・更新・描画を担う 55 行のクラス。描画は 11 行しかない。

```ts
render(ctx: CanvasRenderingContext2D): void {
  for (const p of this.particles) {
    const alpha = p.life / p.maxLife
    const size  = p.size * (0.5 + alpha * 0.5)
    ctx.globalAlpha = alpha
    ctx.fillStyle = p.color
    ctx.beginPath()
    ctx.arc(p.x, p.y, size, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.globalAlpha = 1
}
```

- **円形のみ**。バッチングなし（1 粒ごとに `beginPath`/`fill`）
- アルファは寿命に比例した連続値
- サイズも寿命に比例して連続的に縮小する

呼び出し元（すべて `src/game/sideScroller.ts`、生成のみ）:

| 行 | 用途 | 個数 |
|---|---|---|
| 1327 | ジャンプ | 7 |
| 1340 | 着地 | 7 |
| 1353 | 死亡爆発 | 24 |

加えて各 FeatureSystem（`RpgFeature` の被弾、`SurvivalFeature` のレベルアップ、
`SpecialFeature` のボス撃破、`PuzzleFeature` の正解演出など）が `world` 経由で粒子を追加する。
**つまり本ファイルは全ジャンル共通のエフェクト基盤であり、
ここを PixelArt 化すると全ジャンルに一括で効く。**

## 変更方針（PixelArt化の仕様）

### 1. 円 → ブロック

`ctx.arc()` を `px.rect()` に置換する。半径 `size` の円ではなく、
**仮想ピクセルグリッドに整列した正方形**として描く。

```
現状:  ●  （アンチエイリアスされた円）
変更:  ■  （PIXELART.size に整列した正方形）
```

粒子は小さく大量に出るため、円（`px.circle`）ではなく
単純な正方形で十分にドット絵らしくなる、と判断した。

### 2. サイズの量子化

現状の `p.size * (0.5 + alpha * 0.5)` は連続値のため、
描画サイズが `PIXELART.size` の整数倍になるよう丸める。

```ts
const raw  = p.size * (0.5 + alpha * 0.5)
const cells = Math.max(1, Math.round(raw / PIXELART.size))   // 最低 1 セル
```

`Math.max(1, ...)` により、消える直前でも 1 セルは残る。
これによりサイズ変化が「なめらかな縮小」から「段階的な縮小」になり、
ドット絵のエフェクトらしい表現になる。

### 3. アルファの量子化

`ctx.globalAlpha = alpha` を `px.withAlpha(alpha, ...)` に置換し、
`PIXELART.alphaSteps` 段に量子化する。

**完全な不透明化（アルファ廃止）はしない。** アルファを 0/1 の 2 値にすると
パーティクルが唐突に消えて不自然になるため（`00-rendering-system.md` D4）。

### 4. 変更しないもの

- `update()` / `updateSlow()` の物理計算（速度・重力・寿命の減衰）
- `add()` のシグネチャと引数
- `Particle` インターフェースの定義
- 粒子の色（`vfx.json` およびジャンルプラグインの `particleColors` から来る値）
- `clear()`

**`render()` メソッドのみの変更で完結する。**
パーティクルの個数・寿命・速度はゲームの手触りに関わるが、
本タスクでは一切触らない。

## 実際に行った作業内容（実装後に追記）

2026-08-23、P1 として実装完了。

- `render(ctx)` の引数・呼び出し元シグネチャは無変更（`sideScroller.ts` 側の
  `particles.render(ctx)` はそのまま）。メソッド内部で `new PixelCanvas(ctx)` を
  1 回生成して使用する。`SpriteRenderer` / `PixelText` のキャッシュはモジュールスコープの
  `Map` で保持されるため、毎フレーム `PixelCanvas` を再生成しても焼き込みキャッシュは失われない
- `ctx.arc` による円を `px.rect(x - cells/2, y - cells/2, cells, cells, color)` の正方形に置換
- サイズ量子化: `raw = p.size * (0.5 + alpha * 0.5)` を
  `cells = Math.max(1, Math.round(raw / PIXELART.size)) * PIXELART.size` でセル単位に丸め、
  最低 1 セル（消滅直前も 1 セルは残る）を保証
- アルファ: `ctx.globalAlpha = alpha` を `px.withAlpha(alpha, ...)` に置換し
  `PIXELART.alphaSteps` 段に量子化。完全な不透明化はしない（仕様通り）
- `update()` / `updateSlow()` / `add()` / `Particle` インターフェース / `clear()` は無変更

検証結果: `typecheck` ✅ / `lint` ✅ / `build` ✅ / `test:features`（9/9）✅ /
`test:unit`（既存の無関係な失敗3件を除き全パス）。ブラウザの動的 import で
`PixelCanvas.rect` / `withAlpha` の単体動作を確認済み（01-sideScroller.md の
「実際に行った作業内容」末尾を参照）。パーティクル自体の実機描画確認は
実行環境の制約により未実施。

## 懸念点・確認事項

1. **描画コスト**: 実装後の目視・プロファイリングは実行環境の制約により未実施。
   `fillRect` 1 コールへの単純化自体は完了しているため、理論上は軽くなる**見込み**のまま。
2. `PIXELART.size` を大きくしすぎると粒子が大きなブロックとして目立ちすぎる可能性がある点は
   未検証のまま。`particleSizeScale` の追加要否はユーザーの目視確認後に判断する。
