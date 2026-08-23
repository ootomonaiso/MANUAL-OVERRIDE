# JSONGenrePlugin.ts PixelArt化仕様

> **判断に迷ったファイル（Q2）。ユーザー確認の結果、対象に含めることが決定した。**
> ただし本ファイルは**描画コードを 1 行も持たない**。実質的な作業は「委譲先の確認」であり、
> P5（最終フェーズ）で整合を検証する位置づけになる。

## 対象ファイル

- `src/plugins/JSONGenrePlugin.ts`（132 行 / 描画プリミティブ **0 箇所**）

### 影響を受けるファイル

| パス | 影響 |
|---|---|
| `src/genres/BasePlugin.ts` | 委譲先（[03](03-BasePlugin.md)）。最も多くのジャンルがここへ落ちる |
| `src/genres/StgPlugin.ts` | 委譲先（[04](04-StgPlugin.md)） |
| `src/genres/PuzzlePlugin.ts` | 委譲先（[16](16-PuzzlePlugin.md)） |
| `src/genres/RhythmPlugin.ts` | 委譲先（[17](17-RhythmPlugin.md)） |
| `src/genres/index.ts` | **変更しない。** 登録ロジックの確認のみ |
| `src/data/genres/*.json` | **変更しない** |

## 現状（Before）

**自前の描画コードはゼロ。** `GenrePlugin` の描画フェイスをすべて
他の登録済みプラグインへ委譲する中継役。

```ts
const TO_DELEGATE_ID: Record<string, string> = {
  // template名
  runner: 'base',  space: 'stg',   dungeon: 'rpg',
  rhythm: 'rhythm', puzzle: 'puzzle', aquatic: 'aquatic',
  // theme名
  plain: 'base',   stg: 'stg',     rpg: 'rpg',  horror: 'base',
}
// 81行目
const delegateId = (TO_DELEGATE_ID[templateKey] ?? 'base') as GenreId
```

- `drawFarLayer` / `drawMidLayer` / `drawPlayer` / `drawHazard` → `this._delegate` へ転送
- `drawForeground` / `drawGenreHUD` → 空実装
- 色（`skyColors` / `palette` 等）のみ JSON から上書きし、未指定なら委譲先から継承

### 実際に本プラグインが使われるジャンル（調査で確定）

`src/genres/index.ts:64-73` の `if (hasGenre(def.id)) continue` により、
**TS プラグインが存在するジャンルは本プラグインを使わない。**
`src/data/genres/*.json` 23 件のうち TS プラグインが無いのは以下の 7 件。

| ジャンル | `theme` | 委譲先 | 備考 |
|---|---|---|---|
| `bullet_hell` | `stg` | `StgPlugin` | |
| `idle` | `puzzle` | `PuzzlePlugin` | |
| `tower_def` | `puzzle` | `PuzzlePlugin` | |
| `sports` | `rhythm` | `RhythmPlugin` | |
| `horror` | `horror` | `BasePlugin` | マップに `horror: 'base'` あり |
| `glitch` | `glitch` | `BasePlugin` | **マップに無く `?? 'base'` へフォールバック** |
| `stealth_action` | `stealth` | `BasePlugin` | **マップに無く `?? 'base'` へフォールバック** |

**`src/data/genres/*.json` の中で `visual` ブロックを使っているファイルはゼロ**
（`grep -l 'visual' src/data/genres/*.json` が空）。
したがって色の上書きも現状は一切効いておらず、
**7 ジャンルすべてが委譲先の色をそのまま使っている。**

## 変更方針（PixelArt化の仕様）

### 1. コードの変更は原則なし

本ファイルは描画コードを持たないため、**委譲先 4 プラグインの
PixelArt 化が完了すれば、7 ジャンルすべてが自動的に PixelArt 化される。**

```
BasePlugin  が PixelArt 化 → horror / glitch / stealth_action が自動対応
StgPlugin   が PixelArt 化 → bullet_hell が自動対応
PuzzlePlugin が PixelArt 化 → idle / tower_def が自動対応
RhythmPlugin が PixelArt 化 → sports が自動対応
```

### 2. P5 で行う検証

コードは変えないが、以下を**実際に確認する**のが本ファイルの作業内容。

1. デバッグ機能の `forceGenre` で 7 ジャンルすべてを表示する
2. 委譲先の PixelArt 描画が正しく反映されているか目視で確認する
3. `drawForeground` / `drawGenreHUD` が空実装のため、
   委譲先がこれらで描いていた要素（例: `StgPlugin` のスキャンライン）が
   `bullet_hell` では**表示されない**ことを確認する（既存の挙動であり、変更しない）

### 3. 変更しないもの

- `TO_DELEGATE_ID` のマッピング
- `?? 'base'` のフォールバック
- 色の上書きロジック
- `drawForeground` / `drawGenreHUD` の空実装
- `GenreJsonDef` インターフェース
- `spawnDensity` の受け渡し（**ゲームプレイに直結**）

## 実際に行った作業内容（実装後に追記）

2026-08-23、P5 として検証完了。**予告通り、コード変更はゼロ**（`git diff` で無変更を確認済み）。

- 7ジャンル全てについて、`JSONGenrePlugin` を実際にインスタンス化し
  `drawFarLayer`/`drawMidLayer`/`drawPlayer` を実行して確認した:
  - `bullet_hell`（theme:`stg`）→ `StgPlugin` へ委譲。`skyColors` が
    `StgPlugin` の値（`#000005`/`#05050f`）と一致することを確認
  - `idle`/`tower_def`（theme:`puzzle`）→ `PuzzlePlugin` へ委譲。`skyColors` が
    `PuzzlePlugin` の値（`#f4f4f8`/`#e9e9f2`）と一致することを確認
  - `sports`（theme:`rhythm`）→ `RhythmPlugin` へ委譲。`skyColors`/`starColor` が
    `RhythmPlugin` の値（`#0a0015`/`#150028`、`#cc88ff`）と一致することを確認
  - `horror`（theme:`horror`、マップ経由）/ `glitch`・`stealth_action`
    （マップに無く `?? 'base'` でフォールバック）→ いずれも `BasePlugin` へ委譲。
    `skyColors` が `BasePlugin` の値（`#0f0f23`/`#1a1a3e`）と一致することを確認
  - 7シナリオすべてでコンソールエラー・例外なし
- `TO_DELEGATE_ID` マッピング・`?? 'base'` フォールバック・色の上書きロジック・
  `drawForeground`/`drawGenreHUD` の空実装・`spawnDensity` の受け渡しは無変更
  （変更していないため確認のみ）

検証結果: `typecheck` ✅ / `lint` ✅ / `test:features`（9/9）✅。7ジャンル全てについて
委譲先のPixelArt化（P2/P3で実装済み）が `JSONGenrePlugin` 経由で正しく反映されることを
確認した。

これでPixelArt化仕様書26本すべて（P0〜P5）の実装・検証が完了した。

## 懸念点・確認事項

1. **`glitch` / `stealth_action` が `base` にフォールバックしている。**
   `glitch` は「グリッチ表現」、`stealth_action` は「ステルス」という
   固有の見た目を期待させるジャンル名だが、実際には
   `base` の普通の横スクロール描画が出ている。
   これは PixelArt 化以前からの既存の挙動であり、
   **本タスクのスコープ（見た目の PixelArt 化）を超える仕様上の論点**のため、
   修正せず**報告のみ行う**。専用の見た目が必要であればユーザーに判断を仰ぐ。
2. **`visual` ブロックが全 JSON で未使用。**
   `GenreJsonDef` は `visual.skyColors` 等の上書きに対応しているが、
   実際に使っている JSON がゼロのため、この機能は現状デッドコードに近い。
   これも既存の状態であり、本タスクでは変更しない。
3. 本ファイルは**コード変更ゼロで完了する可能性が高い。**
   その場合「実際に行った作業内容」には検証結果のみを記載する。
