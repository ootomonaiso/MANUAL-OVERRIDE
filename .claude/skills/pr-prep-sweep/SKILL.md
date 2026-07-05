---
name: pr-prep-sweep
description: Use when asked to run the noon PR sweep — check open PRs on ootomonaiso/MANUAL-OVERRIDE and dispatch one subagent per PR to prepare it for merge (typecheck/lint/validate, trivial conflict resolution, review comments) WITHOUT merging. Triggered by the daily 12:00 JST scheduled routine, or manually via "PR一斉チェック" / "お昼のPRチェック" / "PRスイープ".
tools: Bash, Read, Grep, Glob, Agent
---

# PR 準備スイープ (pr-prep-sweep)

オープンPRを並行して「マージ可能な状態まで準備する」バッチ処理。**実際の `gh pr merge` はここでは絶対に実行しない。最終承認とマージ実行は必ずユーザー本人が行う。**

## 対象リポジトリ

- `ootomonaiso/MANUAL-OVERRIDE`（origin）

## 手順

### 1. オープンPRの一覧化

```bash
gh pr list --repo ootomonaiso/MANUAL-OVERRIDE --state open --json number,title,headRefName,mergeable,isDraft,reviewDecision,statusCheckRollup
```

- draft PRは対象外（明示的に依頼された場合を除く）
- **0件なら、その旨だけ簡潔に報告して終了する。サブエージェントは起動しない**（クオータの無駄遣いを避けるため、対象PRがある場合のみ委譲する）

### 2. PRごとにサブエージェントへ委譲

1 PR = 1サブエージェント。対象PRが複数ある場合は並列に (`run_in_background: true`) 起動する。各サブエージェントへのプロンプトには必ず以下を明示する:

- PR番号・ブランチ名
- **マージ（`gh pr merge`）・クローズ・強制pushは絶対に実行しない**こと
- **メインの作業ツリー（リポジトリ直下）で直接 `gh pr checkout` しない。** 複数PRを並行処理するため、また誰か（ユーザー本人など）がメインの作業ツリーで並行して作業中の可能性があるため、PRごとに独立した `git worktree` を切って隔離した場所で作業する:
  ```bash
  git fetch origin <headRefName>   # 同一リポジトリ上のブランチの場合
  git worktree add <スクラッチパス>/pr<番号> origin/<headRefName>
  # 作業後は必ず: git worktree remove <スクラッチパス>/pr<番号> --force
  ```
  フォークPRで `maintainerCanModify: true` の場合、修正コミットをpushするなら該当フォークをリモートに追加してから同様にworktreeを切る。メインの作業ツリーのファイルには一切触れない
- 実行してよい作業:
  - 上記worktree内で `gh pr checkout <number> --repo ootomonaiso/MANUAL-OVERRIDE` 相当のチェックアウト
  - `npm run typecheck` / `npm run lint` / `npm run validate`（このリポジトリの最低品質ゲート。詳細は [create-pr](../create-pr/SKILL.md) 参照）
  - 自動解決可能な trivial コンフリクトの解消（ロジック判断が要るものは手を出さず「要人力判断」として報告のみ）
  - CIが落ちている場合の原因調査
  - 気づいた問題があれば `gh pr comment` でレビューコメントを残す（実装修正が必要な指摘に留め、コード変更のコミットはしない）
- 出力フォーマット: 「マージ可否判定（Ready / 要修正 / 要人力判断）」「実行したチェックの結果」「気づいた懸念点」を1PRにつき数行で

### 3. 結果を集約して報告

全サブエージェント完了後、以下の形式でユーザー向けサマリを作成する:

```
## PRスイープ (YYYY-MM-DD HH:mm JST)

- #123 <title> — Ready / 要修正 / 要人力判断（理由を一言）
```

「Ready」と判定したものについては、実行すべきマージコマンド案（例: `gh pr merge 123 --repo ootomonaiso/MANUAL-OVERRIDE --squash`）を提示するに留める。**このコマンドをここで実行してはならない。**

## 注意事項

- このSkillおよび委譲先のサブエージェントは、`gh pr merge` / `gh pr close` / force push など状態変更を伴う操作を一切実行しない
- サブエージェントへのプロンプトには毎回「マージ禁止」を明記する
- 対象PRが0件の場合はサブエージェントを起動せず即終了する
