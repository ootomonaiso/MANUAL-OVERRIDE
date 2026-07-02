---
name: create-pr
description: Use this skill when the user asks to create or open a pull request for this repo — phrases like "PRを作って", "PR出して", "プルリクエストを作成して", "PR作成", "create a PR", "open a pull request". Runs this project's local quality gates (typecheck/lint/validate-json), drafts a PR body matching .github/pull_request_template.md, and opens it with `gh pr create` against main.
tools: Bash, Read, Grep, Glob
---

# PR作成 (create-pr)

素の `gh pr create` だけでは満たせない、このリポジトリ固有のゲート（型チェック・lint・JSON検証）とPRテンプレートの構造を毎回揃えるための手順。

## 手順

### 1. 現状把握（並列実行）

- `git status`
- `git diff`（staged/unstaged 両方）
- `git rev-parse --abbrev-ref HEAD` と `git status -sb`（現在のブランチ・リモート追跡状況）
- `git log main..HEAD --oneline`（mainから積んだコミット一覧）
- `git diff main...HEAD`（マージされる全差分）

**作業を始める前に、必ず新しいブランチを作成する。** `main` に限らず、既存のfeature/fixブランチ（このセッションで自分が作成したものでない限り）に乗ったまま作業を続けない。理由:

- ブランチ名から別のコントリビューターのものと判定されると `git push` が自動でブロックされる
- ブランチの持ち主が同じ作業ツリーを並行して編集している可能性があり、相手の未コミット変更と衝突・混入するリスクがある（実際に発生した事例あり）

ブランチ名は `claude/<内容を表す短いkebab-case>`（例: `claude/fix-genre-lock-json`）とし、必ず最新の `origin/main` から切る:

```bash
git fetch origin main
git switch -c claude/<slug> origin/main
```

例外は、ユーザーが「このブランチのまま作業して」「〇〇ブランチに直接コミットして」のように明示的に指示した場合のみ。

### 2. ローカル品質ゲートを実行

このプロジェクトのCI（`.github/workflows/ci.yml`）は、typecheck / lint / validate-json が並列実行（Phase 1）→ 3つ完了後にbuild（bundle-sizeはbuildジョブ内の1ステップ、Phase 2）→ e2e / lighthouse が並列実行（Phase 3）というゲート構造。PRを開く前に、変更内容に応じて最低限これを実行する:

```bash
npm run typecheck
npm run lint
npm run validate   # scripts/validate-json.mjs
```

ゲームロジック/UIに触れた変更では追加で:

```bash
npm run build
npm run test:smoke   # 変更が大きい場合は npm test でPlaywright一式
```

失敗した場合は自分で修正するか、ユーザーに報告して指示を仰ぐ。**実行していないチェックを「通過」として報告しない。**

### 3. コミット

ユーザーから明示的に依頼された場合のみ新規コミットを作成する（amendしない）。コミットメッセージは直近のログスタイルに合わせる（`feat:`/`fix:`/`add:`/`update:`/`chore(scope):` 等のプレフィックス + 日本語要約。英語プレフィックスの後にはスペースを入れるのがこのリポジトリでの多数派）。

### 4. push

```bash
git push -u origin <branch>
```
既にリモート追跡している場合は `-u` は不要。

### 5. PR本文を組み立てる

`.github/pull_request_template.md` の構造を省略せずそのまま使う:

```markdown
## 変更の概要

## 変更の種類
- [ ] バグ修正
- [ ] 新機能
- [ ] リファクタリング
- [ ] JSON/コンテンツ更新
- [ ] CI/インフラ
- [ ] ドキュメント

## 影響範囲
- ジャンル分岐:
- スコア計算:
- UI/説明書:
- その他:

## テスト
- [ ] `npm run typecheck` 通過
- [ ] `npm run lint` 通過
- [ ] `node scripts/validate-json.mjs` 通過
- [ ] ローカルで `npm run dev` 動作確認済み
- [ ] 横スクロール → 選択 → ジャンル確定 → 投擲 フローを確認

## スクリーンショット（UI変更の場合）

## 補足
```

ルール:
- チェックボックスは **実際に実行して確認できたものだけ** チェックする
- 「影響範囲」は差分から具体的に埋める（該当なしは「なし」）
- UI変更なのにスクリーンショットが無い場合は空欄のまま残し、補足欄に「未確認」と明記する
- 依存関係更新のみ（dependabot等）のPRでは「テスト」欄は該当項目に「N/A」と書いてよい

### 6. PRを作成

```bash
gh pr create --title "<type>: <日本語要約>" --base main --body "$(cat <<'EOF'
<組み立てた本文>
EOF
)"
```

- タイトルは70文字以内
- 対象ブランチは常に `main`
- ユーザーがドラフトを希望した場合のみ `--draft` を付与

pushとPR作成はユーザー影響のある操作のため、**実行前にタイトル・本文案・対象ブランチを提示し、明確な承認を得てから実行する。**

### 7. 結果報告

作成されたPRのURLを返す。

## 注意事項

- CI全体（e2e/lighthouseまで含む）はローカルで完全再現しなくてよい。静的チェック（typecheck/lint/validate）を最低ラインとする
- ここに書かれた手順が `.github/pull_request_template.md` や `.github/workflows/ci.yml` と食い違ってきたら、実ファイルを正として本Skillを更新する
