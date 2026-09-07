# ジャンル実装 — 要件定義書

> 対象: 14 ジャンル + glitch。現状「JSON 定義だけ」のジャンルを、実際にそのジャンルとして
> 遊べて・見えて・到達できる形に実装する。
> 最終更新: 2026-09-05

---

## 1. 背景・現状

`reach-sim`（20000 回ランダム + 各ジャンル 3000 回狙い撃ち）と dev サーバーでの
DebugPanel 強制表示による動画監査の結果:

- 14 ジャンルすべてが**エラーなく描画される**（型チェック・ユニットテスト 416 件パス）
- **6 ジャンルに視覚アイデンティティがない**: `tower_def` / `stealth_action` / `horror` /
  `idle` / `runner` / `sports` は `JSONGenrePlugin` 経由で別ジャンル（base / puzzle / rhythm）
  の見た目に委譲している。HUD にはジャンル名が出るが、画面は汎用テーマのまま
- `glitch` も base に委譲（壊れたゲームの演出がない）
- **8 ジャンルは TS プラグインを持つ**が、到達率が極端に低いものがある:
  `arena` 0.2% / `bullet_runner` 1.7% / `tower_def` 1.9% / `rhythm` 3.7% /
  `dungeon` 4.7% / `horror` 5.6%

つまり「定義は存在するが、ジャンルとして成立していない」状態が大半。

---

## 2. 目標

各ジャンルを、プレイヤーが「これは○○ゲームだ」と一目で理解できる形にする。
具体的には以下の 3 軸をすべて満たすこと。

| 軸 | 意味 |
|---|---|
| **見える (Look)** | 別ジャンルと一目で区別できる視覚アイデンティティ（背景・プレイヤー・ハザード・ジャンル固有 HUD） |
| **遊べる (Play)** | 既存 FeatureSystem でそのジャンルらしい手応えが出る（必要ならジャンル固有の演出・HUD を追加） |
| **到達できる (Reach)** | 狙い撃ち到達率が **10% 以上**（`reach-sim` の focusedRate）。12 軸のゼロサム性と puzzle 回帰ガード（`thresholdReachability.test.ts`）により 20% は達成不可 |

---

## 3. 「実装完了」の定義（受け入れ基準）

各ジャンルについて、**すべて**を満たすこと:

1. `src/genres/<Id>Plugin.ts` に専用プラグインが存在し、`JSONGenrePlugin` への委譲に頼らない
   （`glitch` は特殊。壊れたゲーム演出を `drawForeground` / `onUpdate` で表現）
2. プラグインが描画する背景・プレイヤー・ハザードが、そのジャンルの世界観と一致している
   （他ジャンルと色・構図が重複していない）
3. ジャンル固有の演出要素が最低 1 つ存在する
   （例: tower_def の「守る拠点」、horror の「視界制限・点滅」、runner の「速度ライン」、
   rhythm の「ビートマーカー」、idle の「積み上がり」）
4. `reach-sim` の focusedRate が **10% 以上**（かつ `thresholdReachability.test.ts` がパス）
5. 動画・スクリーンショットで視覚確認済み（`tmp/genre-audit/` に保管）
6. `npm run typecheck` / `npm run lint` / `npm run test:unit` / `npm run validate` がパス

---

## 4. スコープ

### In
- 7 つの専用プラグイン新規作成: `tower_def` / `stealth_action` / `horror` / `idle` / `runner` / `sports` / `glitch`
- 既存 8 プラグインの手直し（アイデンティティ強化・必要ならジャンル固有 HUD）
- 到達率 20% 未満のジャンルの閾値調整 + カード追加（`src/data/genres/*.json` / `src/data/cards/`）
- 検証（動画・スクリーンショット・reach-sim）
- ドキュメント更新（CLAUDE.md のジャンル状態、reach-sim ベースライン）

### Out（今回はやらない）
- 新規 FeatureSystem の追加（既存 Feature で表現できる範囲で対応）
- BGM・効果音の新規制作（既存 SFX / BGM を流用）
- スプライト画像の新規制作（PixelCanvas によるコード描画で対応。既存 `src/data/sprites/*.json` を流用可）
- 投擲・スコア計算式の変更（既存 `scoreFormula` を維持）

---

## 5. 対象ジャンル一覧

| # | ジャンル | グループ | 現状 | 主なギャップ |
|---|---|---|---|---|
| 1 | tower_def | 難 | 委譲(puzzle) | 視覚なし + 到達 1.9% |
| 2 | stealth_action | 難 | 委譲(base) | 視覚なし |
| 3 | dungeon | 難 | プラグイン有 | 到達 4.7% |
| 4 | rhythm | 難 | プラグイン有 | 到達 3.7% |
| 5 | glitch | 易 | 委譲(base) | 壊れた演出なし（特殊） |
| 6 | horror | 易 | 委譲(base) | 視覚なし + 到達 5.6% |
| 7 | idle | 易 | 委譲(puzzle) | 視覚なし |
| 8 | runner | 易 | 委譲(base) | 視覚なし |
| 9 | sports | 易 | 委譲(rhythm) | 視覚なし |
| 10 | racing | 易 | プラグイン有 | 到達 11.6% |
| 11 | arena | 易 | プラグイン有 | 到達 0.2%（要緊急対応） |
| 12 | aquatic | 易 | プラグイン有 | アイデンティティ確認 |
| 13 | hack_slash | 易 | プラグイン有 | アイデンティティ確認 |
| 14 | platformer | 易 | プラグイン有 | 到達 11.8% |
| 15 | bullet_runner | 易 | プラグイン有 | 到達 1.7%（要緊急対応） |

---

## 6. 制約・規約

- JSON 駆動設計を維持。ルール・数値は `src/data/config/*.json` / `src/data/genres/*.json` に置く
- マジックナンバー禁止（`tunables.ts` / config JSON 経由）
- 命名規則・ESLint（`no-explicit-any` error、PascalCase 等）を遵守
- UI・コード・コメント・表示テキストは**日本語**で記述
- 1 ファイル 300 行超で責務分割を検討（`TetrisFeature.ts` をテンプレートにしない）
- 作業ファイル（動画・スクショ・一時スクリプト）は `tmp/`（gitignore 済み）に置く
