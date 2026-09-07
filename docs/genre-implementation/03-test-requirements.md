# ジャンル実装 — テスト要件定義

> 各ジャンルの「実装完了」を検証する手順。動画・スクリーンショットでの視覚確認を主軸にする
> （AGENTS.md: 「Design the UI while actually viewing it — utilizing screenshots」）。

---

## 1. 検証の全体像

```
各バッチ完了
   ↓
(1) 静的チェック: typecheck / lint / validate / test:unit
   ↓
(2) 到達性チェック: reach-sim（focusedRate ≥ 20%）
   ↓
(3) 視覚チェック: dev サーバー + DebugPanel 強制表示 → 動画・スクショ
   ↓
(4) 問題があれば該当バッチへ戻す
```

---

## 2. 静的チェック（全バッチ共通）

```bash
npm run typecheck    # vue-tsc --noEmit
npm run lint         # eslint（no-explicit-any / naming-convention）
npm run validate     # JSON スキーマ検証（genre / cards / config）
npm run test:unit    # vitest（416 件以上が維持されること）
```

- 新規プラグインは既存プラグインと同型なので、`tests/unit/genres/thresholdReachability.test.ts`
  等が自動的にカバーする
- カード追加時は `npm run validate` でスキーマ検証が通ること

---

## 3. 到達性チェック（B3 完了後）

```bash
npm run reach-sim
```

**合格基準**: 対象 14 ジャンル（glitch 除く）の **focusedRate がすべて 20% 以上**。

- `arena` / `bullet_runner` / `tower_def` / `rhythm` / `dungeon` / `horror` /
  `racing` / `platformer` / `stealth_action` / `runner` / `sports` を重点確認
- 他ジャンルの randomDist が極端に偏っていないこと（誤収束の検知）
- CI に reach-sim が組み込まれているため（#281）、閾値劣化は回帰検知される

---

## 4. 視覚チェック（動画・スクリーンショット）

### 手順
1. dev サーバー起動（バックグラウンド、ログ出力、PID 記録）
   ```powershell
   $p = Start-Process -FilePath "cmd.exe" -ArgumentList "/c", `
     "npm run dev > .opencode-dev.stdout.log 2> .opencode-dev.stderr.log" -PassThru
   $p.Id | Set-Content ".opencode-dev.pid"
   ```
2. `tmp/genre-audit/capture.mjs <genreId> <seconds>` で各ジャンルを強制表示し、
   動画（webm）+ スクリーンショット（t1.5s / end）を撮影
   ```powershell
   node tmp/genre-audit/capture.mjs tower_def 8
   ```
3. 各ジャンルのスクショを確認し、以下の基準で判定

### 判定基準（各ジャンル）
| # | 基準 | 確認方法 |
|---|---|---|
| 1 | 他ジャンルと一目で区別できる背景・色 | スクショ比較 |
| 2 | プレイヤーがそのジャンルらしい見た目 | スクショ |
| 3 | ジャンル固有演出要素が 1 つ以上見える | スクショ / 動画 |
| 4 | HUD（距離・スコア等）が正しく表示 | スクショ |
| 5 | 説明書パネルがジャンルテーマで表示 | スクショ |
| 6 | 描画エラー・コンソールエラーなし | capture.mjs の errors 出力 |

### 撮影対象（全 14 ジャンル + glitch）
tower_def / stealth_action / dungeon / rhythm / glitch / horror / idle / runner /
sports / racing / arena / aquatic / hack_slash / platformer / bullet_runner

- 各ジャンル **2 枚**（t1.5s / end）+ **動画 1 本**（約 8 秒）
- 死亡して投擲フェーズに入った場合は、t1.5s 以降のフレームでゲームプレイを確認
  （genre lock 演出の直後を捉えるため、必要なら秒数を調整）

---

## 5. 回帰テスト（既存機能の壊れ検知）

- `npm run test:unit` — 416 件以上がすべてパス
- `npm run test:features` — Feature 単体テスト（boss / dash / stealth_mode / tower 等）
- `npm run test:smoke` — Playwright スモーク（ゲーム起動〜プレイ）
- 新規プラグインの追加で `GameRegistry` の登録に競合がないこと
  （`src/genres/index.ts` の自動収集が `id` で重複登録しないこと）

---

## 6. 最終確認チェックリスト

- [ ] 14 ジャンルすべてに専用プラグインが存在（委譲に頼らない）
- [ ] 各ジャンルの focusedRate ≥ 20%（glitch 除く）
- [ ] 各ジャンルの動画・スクショで視覚確認済み（`tmp/genre-audit/` に保管）
- [ ] `typecheck` / `lint` / `validate` / `test:unit` / `test:features` / `test:smoke` がパス
- [ ] `npm run build` が成功（オフライン動作・バンドルサイズ CI チェック通過）
- [ ] CLAUDE.md のジャンル状態・実装完了項目を更新
- [ ] reach-sim のベースライン（focusedRate 表）をドキュメントに記録
