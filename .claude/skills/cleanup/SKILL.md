---
name: cleanup
description: Use this skill when the user asks to tidy up the repo root, check for stray/leftover files, or clean up clutter left behind by previous work sessions — phrases like "ディレクトリ整理して", "散らかってるから片付けて", "clean up the repo", "stray files". Sweeps repo root for known debug/temp patterns and unexpected top-level entries, reports findings, and only deletes what's confirmed safe.
tools: Bash, Read, Grep, Glob
---

# ディレクトリ掃除 (cleanup)

作業セッション中に生まれがちな使い捨てファイル（デバッグスクリプト・スクリーンショット・一時レポート・テスト出力）がリポジトリ直下に溜まっていないか棚卸しする。

## 判断の原則

- **未追跡 + 既知の一時パターンに一致** → 安全に削除してよい
- **未追跡だが内容不明** → 削除せず一覧で報告し、ユーザーに判断を仰ぐ
- **git管理下（tracked）のファイル** → 中身を確認する。調査レポート等の資産価値があるものは `plan/` や `docs/` へ移動を提案し、勝手に消さない
- **`node_modules/` / `dist/` / `.vite/` / `coverage/` など既知のビルド成果物ディレクトリ** → 対象外（既にgitignore済みのはず、対象は「想定外の散らかり」）

## 手順

### 1. リポジトリ直下の棚卸し

```bash
git status --short          # 未追跡・変更中のファイル
git clean -ndx               # gitignore済みも含め、削除候補になりうるものを一覧（実行はしない: -n はドライラン）
```

ルート直下（`ls` 相当）を見て、`src/` `docs/` `plan/` `content/` `schemas/` `scripts/` `tests/` `.github/` `.vscode/` などの既知ディレクトリ・既知の設定ファイル以外に何が増えているかを確認する。

典型的な散らかりパターン:
- `test_*.cjs` / `test_*.mjs` / `debug*.png` / `tmp_screen*.png` / `real_browser_test.png`（.gitignoreに登録済みの使い捨てパターン）
- `playwright-report/` / `test-results/`（Playwrightの既定出力先、再生成可能）
- ルート直下に置かれた `*.md` の調査レポート・メモ（本来 `plan/` や `docs/` に属するもの）

### 2. 参照チェック

削除・移動の前に、他ファイルから参照されていないか確認する:

```bash
grep -rl "<ファイル名>" --include="*.ts" --include="*.md" --include="*.json" --include="*.yml" . 2>/dev/null | grep -v node_modules
```

`package.json` の scripts、`.github/workflows/*.yml`、他のドキュメントから参照されているファイルは削除しない。

### 3. 実行

- 既知の一時パターン・未追跡・無参照 → 削除
- git管理下の資産価値があるファイル → `git mv` で `plan/`（調査・計画系）または `docs/`（利用者向けドキュメント系）へ移動し、リネームはkebab-caseに揃える
- 判断がつかないもの → 削除も移動もせず、一覧をユーザーに提示して指示を仰ぐ

### 4. 再発防止

同じパターンの散らかりが `.gitignore` に登録されていなければ追加を提案する。CLAUDE.mdの「作業ファイルの置き場所」節に沿っていないファイルの生成源（どの作業でこれが生まれたか）が特定できる場合は、併せてユーザーに伝える。

## 注意事項

- `rm -rf` 相当の一括削除はしない。削除対象は個別にファイル名を列挙して実行する
- 削除前に必ず「何を・なぜ削除するか」を一度提示してから実行する（未追跡の既知パターンのみ確認なしで進めてよいが、tracked ファイルの削除・移動は必ず確認を取る）
- スクラッチパッド（環境が用意する一時ディレクトリ）配下は対象外。あくまでリポジトリのワークツリーの掃除が目的
