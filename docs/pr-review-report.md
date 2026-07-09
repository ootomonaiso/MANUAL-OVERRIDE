# PR レビュー・コンフリクト・残存バグ調査レポート

対象PR: **#159 / #157 / #156 / #155**
基準ブランチ: `origin/main`（本調査時点の tip = `988342e` "fix: 調査レポートのバグ修正（Critical/High/Medium/Low 計29件）(#154)"）
調査者: Claude（コードリーディング + 実マージ検証 + 静的解析/テスト実行）
方針: **調査・レビューのみ。修正・マージ・コンフリクト解消は行っていない**（検証用の使い捨て worktree 内での暫定マージを除く。実PR/ブランチには一切変更を加えていない）

---

## 0. 検証方法と全体サマリ

### 検証環境

- 使い捨ての git worktree（`../MO-pr-merge-test`）を `origin/main` の detached HEAD で作成し、そこで各PRの `pull/<N>/head` を実マージして検証した。作業ブランチ・実PRには触れていない。
- 品質ゲートは fnm 管理の Node v20.20.2 で実行。

### コンフリクトの全体像

| PR | 単独で main にマージ | 備考 |
|---|---|---|
| #159 | ❌ **CONFLICTING** | `src/components/EndingPanel.vue`, `src/composables/useManual.ts` の2ファイルで衝突 |
| #157 | ✅ clean（BEHIND のみ） | `src/game/sideScroller.ts` |
| #156 | ✅ clean（BEHIND のみ） | `src/domain/genreResolver.ts` |
| #155 | ✅ clean（BEHIND のみ） | `src/game/sideScroller.ts` |

- **#157 ↔ #155**（両者とも `sideScroller.ts` を変更）: **どちらの順序でマージしても** `sideScroller.ts` は Git が自動マージに成功し、コンフリクトは発生しない。編集箇所が離れている（#155=`updateRules` の double_jump 分岐 L190-193、#157=`_keyStack`/`_changeKeyUntil` 周辺 L131・L184・L368・L1410）ため。両fixが共存することも実マージ後のソースで確認済み。

### 4本すべてをマージした想定での品質ゲート結果

`#155→#156→#157` を clean マージ後、`#159` を重ねて **検証目的で暫定的に衝突解決**（`useManual.ts`=main側を採用／`EndingPanel.vue`=#159側を採用）した状態で実行:

| ゲート | 結果 |
|---|---|
| `npm run typecheck` (vue-tsc) | ✅ pass |
| `npm run lint` (eslint) | ✅ 0 error / **2 warning**（#157 の非null断定 `!` × 2, `sideScroller.ts` L390・L1436） |
| `npm run validate` | ✅ 55 passed, 0 failed |
| `npm run test:features` | ✅ 9/9 |
| `npm run test:unit` (vitest) | ✅ **90/90 passed**（従来の resolveGenreProgress 由来の失敗は解消済み。詳細は #156 参照） |
| E2E (`playwright test`) | ✅ **50 passed**（chromium + mobile-chrome）。firefox 25件は failed だが原因は `firefox-1532` ブラウザ**未インストール**の環境要因であり、テストロジックの失敗ではない |

> 注: 上記の #159 暫定衝突解決は「4本マージ想定でゲートを回す」ためのローカル検証専用であり、推奨する解決方法ではない（§ PR #159 参照）。

---

## PR #155 — fix(#21): double_jump 削除時に jumpsLeft をリセット

**変更**: `src/game/sideScroller.ts` の `updateRules()` に `else { this.player.jumpsLeft = Math.min(this.player.jumpsLeft, 1) }` を1箇所追加（+2行）。

### 1. レビュー結果
- Issue #21（double_jump を失ったジャンルでも着地まで2段ジャンプが残る）を**正しく解決している**。
- ロジック検証（コードリーディング）:
  - 従来は `if (features.has('double_jump'))` で `jumpsLeft = max(jumpsLeft, 2)` のみ。double_jump が外れても `jumpsLeft` が2のまま残りうる。
  - 追加された else 節で `min(jumpsLeft, 1)` にクランプ。空中で2段所持中にジャンルが変わっても1段に制限される。着地時リセット（L604 `jumpsLeft = isDouble ? 2 : 1`）、離陸時（L613）とも整合。
  - 通常の単段ジャンプ（`jumpsLeft=1`）に対しても `min(1,1)=1` で無害。
- コード品質: 既存の対称的な if/else パターンに沿っており妥当。

### 2. コンフリクト状況
- **main とは clean**（BEHIND のみ、rebase 相当で解消）。
- **#157 とは非衝突**（同じ `sideScroller.ts` だが編集行が離れており、両順序で自動マージ成功を確認）。

### 3. 残存バグ・懸念点
- 回帰テストが**追加されていない**（挙動確認のユニット/E2Eなし）。将来のリグレッション検出力は上がらない。
- 上記以外に懸念は検出せず。

### 4. 優先度
- 修正内容: **Low**（懸念はテスト欠如のみ。fix 自体は妥当で有益）

### 5. 確信度
- **コードリーディングによる確認**（High）。typecheck/lint/unit が4本マージ状態で pass することも確認済み。実ゲーム操作での再現・目視確認は未実施。

### 6. 再現条件（修正前バグ）
- double_jump を有効化するジャンルへ収束した後、空中でジャンプ回数を使い切る前に double_jump を持たないジャンルへルールが切り替わると、着地するまで2段ジャンプが可能なままになる。

---

## PR #157 — fix(#4): 重複 changeKey エフェクトのキーバインド復元

**変更**: `src/game/sideScroller.ts`。`_changeKeyUntil: Map<string, number>` を廃止し、`_keyStack` を `Map<string, string[]>` → `Map<string, Array<{ key: string; until: number }>>` に統合（+16/−24）。

### 1. レビュー結果
- Issue #4（同一アクションに複数 changeKey が重なると先の解除時刻が上書きされ、誤タイミングで復元）を**正しく解決している**。
- ロジック検証（コードリーディング）:
  - 各エフェクトが「push 時点の現在キー」と「解除時刻 until」をペアでスタックに積む（L1441）。
  - 毎フレーム、スタック末尾（LIFO）から `now >= until` の間ポップして順に復元（L388-393）。LIFO 復元はキー上書きの復元順として正しい。
  - `if (!currentKey) break`（L1431）で存在しないコントロールの changeKey を無視。従来より堅牢。
  - `updateRules()` のリセットで `_keyStack.clear()` を維持（L198）、`_changeKeyUntil.clear()` の削除も整合。

### 2. コンフリクト状況
- **main とは clean**（BEHIND のみ）。
- **#155 とは非衝突**（前述、両順序で自動マージ成功）。

### 3. 残存バグ・懸念点
- **Low（コード品質）**: `this._keyStack.get(action)!` の**非null断定 `!`** が2箇所（L388付近の実体は L390、L1436）。`npm run lint` で `@typescript-eslint/no-non-null-assertion` の **warning が2件**発生する（error ではないので CI は通る想定だが、規約上は非推奨）。直前に `has()` チェック済みなので実害はないが、`??`/早期returnなどで回避余地あり。
- **Low（エッジケース）**: スタック方式は「入れ子(nested)/逐次(sequential)」な区間には正しいが、**同一アクションに区間が交差(overlapping)する2つの changeKey** が積まれた場合、下位（先に積まれ先に期限が来るべき）エントリが上位エントリの期限まで復元されず、上位期限到来時に「既に終了しているはずの下位キー」へ一旦復元されうる。実運用では changeKey の duration が揃っていれば発生しにくい理論的エッジ。従来実装（解除時刻1つのみ保持）よりは明確に改善。

### 4. 優先度
- 修正内容: **Low**（fix は妥当かつ Issue #4 を解決。残るのは lint warning とレアなエッジのみ）

### 5. 確信度
- **コードリーディングによる確認**（High）。lint warning は実際に再現確認済み。changeKey を多重発火させる実プレイでの目視確認は未実施。

### 6. 再現条件（修正前バグ）
- 同一アクション（例: jump）に対する changeKey エフェクトが、前のエフェクトが解除される前に2回以上適用されると、解除時刻が上書きされ誤ったタイミングでキーが元に戻る。

---

## PR #156 — fix(#19): resolveGenreProgress 関数を復元

**変更**: `src/domain/genreResolver.ts` に `resolveGenreProgress(accumulated, genres, _genrePoints?, bayesConfig?)` を**新規追加**（+26/−0）。`computeBayesianPosteriors` の結果から最尤ジャンルと事後確率を返す。

### 1. レビュー結果
- **重要**: Issue #19（`resolveGenreProgress is not a function` で5件のユニットテストが失敗）は、**現 main（#154）で既に別手段により解決済み**である。
  - 現 main の `tests/unit/domain/genreResolver.test.ts` は、L13-14 で「旧 `resolveGenreProgress` は Bayes 収束へのリファクタで廃止されたため**テスト側で再現する**」というコメントとともに、**テストファイル内にローカル関数 `resolveGenreProgress` を定義**している。モジュールからの import はしていない。
  - このため main 単独でも `npm run test:unit` は **90/90 pass**（テスト失敗は既に存在しない）。
- **#156 をマージすると何が起きるか**（実マージで検証）:
  - #156 はソース（`genreResolver.ts`）に `resolveGenreProgress` を export 追加するのみで、テストファイルは変更しない。
  - 現 main のテストは**自前のローカル関数**を使い続けるため、#156 が追加した export 関数は**どこからも参照されない未使用のデッドコード**になる。
  - 実際に4本マージ状態で typecheck/lint/unit すべて pass、かつ `genreResolver` の `resolveGenreProgress` を import する箇所は `src/` に**皆無**であることを `git grep` で確認。
- 補足: #156 のブランチ（旧 main `47e3fd0` 由来）ではテストが `resolveGenreProgress(params, GENRES, undefined, undefined, config)` と**5引数**で呼んでおり、#156 の関数シグネチャ（4引数）と食い違う。現 main へマージする分にはテストが差し替わるため顕在化しないが、#156 が想定していたテストと現行テストが別物であることを示す。

### 2. コンフリクト状況
- **main とは clean**（BEHIND のみ）。テストファイルは #156 が触らず main 側を採用するため衝突しない。
- 他PRとの衝突なし（単独ファイル）。

### 3. 残存バグ・懸念点
- **Low**: 追加関数が**未使用のデッドコード**。かつ「ドメイン層の実装」と「テスト側のローカル再現実装」が二重に存在し、将来的にロジックが**乖離**するリスク（同名だが別実装）。
- 機能上の害はない（未使用なので実行時挙動に影響しない）。

### 4. 優先度
- **Low**（Issue は既に解決済みで、本PRは事実上冗長。マージしても無害だがデッドコードが増える。むしろ「テスト側のローカル再現をやめてドメイン実装を使う」形にテストを更新する方が筋が良い、という設計上の指摘に留まる）

### 5. 確信度
- **コードリーディング + 実マージ + テスト実行で確認**（High）。main 単独 90/90・4本マージ 90/90、`resolveGenreProgress` の未 import を検証済み。

### 6. 再現条件
- 該当なし（現状バグは存在しない。#156 はデッドコードを増やすのみ）。

---

## PR #159 — fix: 衝突判定の対称性修正、テスト更新、CSS重複除去、フォント読み込み（Closes #158）

**変更**: 12ファイル。`index.html`, `EndingPanel.vue`(−127), `useManual.ts`, `useScoreAnimation.ts`, `cardPool.ts`, `entities.ts`, `tests/e2e-helpers.ts` ＋ `tests/*.mjs` 5本。

### 1. レビュー結果（項目別）

#### (a) `entities.ts` — rectsOverlap の対称化 ✅ 妥当（ただし副作用あり）
- grace を `a` だけでなく `a`・`b` 両方に均等適用し、`rectsOverlap(a,b) != rectsOverlap(b,a)` の順序依存を排除。**Issue #158 の対称性問題への修正として妥当**。
- ただし呼び出し側（`sideScroller.ts` L503/L656 の player-vs-hazard、grace=4）では、従来 player（第1引数）だけが4px縮んでいたのが**両方縮む**ため、当たり判定が**より寛容**になる（プレイヤーが約4px 障害物に近づける）。grace=0 呼び出し（ShootFeature/RpgFeature/Survival の一部）は影響なし。
- Player は 36×52、grace=min(4, floor(min(w,h)/2))。多くの hazard では gb=4 で軽微だが、極端に小さい hazard（最小辺 < 8px）では有効判定が痩せる点に留意。
- **注意**: 呼び出し側は常に同じ引数順（player を第1引数）で統一されているため、**旧コードでも順序依存は実際には顕在化していなかった**。したがって本修正の実効果は「対称化」よりも「player-hazard 判定がやや甘くなる」というゲームバランス変化である。

#### (b) `EndingPanel.vue` — 重複CSS除去 ❌ **回帰あり（過剰削除）**
- 主張は「Issue #24 関連CSSブロック約130行の重複削除」。しかし実際には**重複していた surprise-ending 用CSSを「両方とも」削除**しており、テンプレートが今も使用しているスタイルが消えている。
- pr-159 の `EndingPanel.vue` を検査した結果（`grep -cF`）:
  - `.ending-surprise` = **0**、`.surprise-icon` = 0、`.surprise-title` = 0、`.surprise-desc` = 0、`@keyframes glitchPulse` = 0、`@keyframes glitchShake` = 0 → **完全に削除**
  - 一方テンプレートは `<div class="ending-surprise" ...>`（L145）, `.surprise-icon`(L146), `.surprise-title`(L147), `.surprise-desc`(L148) を**使用中**
  - `.ending-meta-section` / `.meta-row` / `.meta-label` / `.meta-value` / `.contradiction-bar` / `.contradiction-fill` は = 1（1コピー残存、こちらは正しく重複解消）
- 結果: **サプライズエンド（Issue #24）発火時、赤枠・背景・グリッチ演出・タイトル配色などが全て失われ、素のテキストで表示される**視覚回帰。
- `.restart-btn:hover` / `:active` も削除（=0）。基底 `.restart-btn` は残るためボタン自体は表示されるが、ホバー/押下フィードバックが消える（軽微）。
- E2E `surprise-ending.spec.ts` は構造・テキストのみ検証しスタイルを見ないため、**このテストは pass するがこの回帰を検出できない**（実際 chromium で pass）。

#### (c) `index.html` — フォント読み込み追加 ⚠️ **オフライン要件違反**
- `fonts.googleapis.com` / `fonts.gstatic.com`（外部CDN）から `M PLUS 1 Code` を読み込む `<link>` を3行追加。
- **CLAUDE.md の必須要件「完全にネットワーク遮断状態でも動作すること。…dist内部のみで完結すること」に違反**。オフライン時はフォントが読み込めずフォールバックに劣化し、外部ネットワーク依存も持ち込む。
- 正しい対処は Google Fonts CDN リンクではなく、フォントを**ローカルに同梱（self-host）**すること。

#### (d) `useManual.ts` — タイマーリーク修正 ⚠️ **main に既存（冗長）**
- `onUnmounted` で `animTimer`/`centerTimer` をクリーンアップ。**現 main は #154 で既に同一の cleanup を実装済み**（コメント付き）。#159 の差分はコメントなしで同じコードを再追加するもの。→ 実質冗長で、コンフリクトの原因（§2 参照）。

#### (e) `useScoreAnimation.ts` — 振動修正 ✅ おおむね妥当
- `lastCommittedSource` を導入し、アニメ途中値ではなく最後に確定した source 値を起点に diff/start を計算。連続更新時のオシレーション防止として妥当。
- 軽微なトレードオフ: 大ジャンプのカウントアップ中に小さな更新が来ると、途中値から目標へ即スナップする（微小な段差）。実害は小さい。

#### (f) `cardPool.ts` — sampleCards 最適化 ✅ 妥当
- 実効重みを事前計算しループ内の二重 `_effectiveWeight` 呼び出しを解消。挙動は等価（サンプリング中に重みは変化しないため）。純粋な最適化で問題なし。末尾ガードのコメントが削られた点は軽微。

#### (g) テスト更新（`e2e-helpers.ts` + `*.mjs`）✅ 動作するが主張は誇張
- `startGame` を「はじめる可視なら押す→canvas待ち」に緩和。チュートリアルイントロ通過は別ヘルパー `bypassTutorial`（"わかった、プレイする"）に分離、という設計で妥当。
- ただし PR説明の「**全テストファイルを修正**／全E2Eの新フロー対応」は**やや誇張**。実際に #159 が変更したのは `e2e-helpers.ts`（利用は2 spec）と standalone `*.mjs` 5本のみ。`smoke.spec.ts` / `tetris.spec.ts` / `puzzle-advance.spec.ts` / `ui-enhancement.spec.ts` は**未変更**。
- 実行結果: 4本マージ状態で **chromium + mobile-chrome の50件すべて pass**。firefox 25件は failed だが**原因はブラウザ未インストールの環境要因**でありテストロジックの失敗ではない（`playwright install` 未実施の環境）。→ #159 の E2E は「実際に通る」ことを確認。

### 2. コンフリクト状況
- **main と CONFLICTING**（`gh` の mergeable=CONFLICTING / DIRTY）。実マージで下記2ファイルが衝突:
  - **`src/composables/useManual.ts`**（衝突箇所: `onUnmounted` 直前）: main が #154 で追加したコメント付き cleanup と、#159 が追加するコメントなし同一 cleanup が衝突。**コード自体は同一**でありコメント行のみの衝突＝実質トリビアル（main 側を採るのが妥当）。
  - **`src/components/EndingPanel.vue`**（衝突箇所: `.restart-btn` 直後〜`</style>`、L614-700 相当）: main は重複CSSの**第1コピーを CSS変数化**（`var(--radius-sm)` / `var(--genre-glow)`）する改修を入れており、#159 は同領域を**全削除**する。両者が同じ範囲を別方向に変更したため衝突。
    - **自動的な片側採用はいずれも不適切**: main側採用→重複が残り#159の目的未達／#159側採用→(b)の surprise CSS 全削除回帰が入る。**「スタイル付きの1コピーだけを残す」手動マージが必要**。
- 他PR（#155/#156/#157）とは変更ファイルが重ならず、相互の直接衝突はなし。

### 3. 残存バグ・懸念点
- **(b) surprise-ending CSS の全削除による視覚回帰**（サプライズエンド演出のスタイル欠落）。
- **(c) Google Fonts CDN 参照によるオフライン要件違反**。
- (a) player-hazard 当たり判定がやや甘くなるバランス変化（要プレイ確認）。
- (d) useManual 修正は main に既存で冗長（コンフリクト源）。
- E2E の「全テストファイル対応」主張は実態と乖離（未変更 spec が存在）。

### 4. 優先度
- **(b) EndingPanel surprise CSS 過剰削除**: **Medium**（進行不能・クラッシュではないが、Issue #24 サプライズエンドという公開機能の演出が丸ごと欠落する明確なUI回帰。High 寄りの Medium）
- **(c) オフライン要件違反（Google Fonts CDN）**: **Medium**（プロジェクトの必須設計制約に違反。フォールバックはあるが規約違反）
- (a) 当たり判定バランス変化: **Medium〜Low**（対称化自体は妥当。実効はバランス変化のため要確認）
- (d) useManual 冗長 / コンフリクト: **Low**
- (e)(f)(g): 問題なし〜**Low**

### 5. 確信度
- (b) surprise CSS 削除・(c) CDN 参照・(d) main 既存・コンフリクト2ファイル: **コード/差分の直接検査で確認（High）**。
- (a) 当たり判定の実効的影響（どの程度甘くなるか）: コードリーディングによる推測。**実プレイでの体感差は未計測**。
- (g) E2E: chromium/mobile-chrome で **50 pass を実行確認（High）**。firefox は環境要因で未評価。main を基準にした「#159 が無いと E2E が落ちるか」の対照実行は未実施。

### 6. 再現条件
- (b): ゲームをサプライズエンド条件まで進めて EndingPanel を表示 → 本来赤枠+グリッチ演出のはずの surprise ブロックが素のテキストで表示される。
- (c): ネットワーク遮断（オフライン）状態で起動 → `M PLUS 1 Code` が読み込めずフォールバックフォント表示。
- (a): player と小さめ hazard の際どいすれ違いで、従来は当たっていた距離で当たらなくなる。

---

## 推奨マージ順序

前提: 修正は行わない立場からの**提案**。#159 のみ CONFLICTING かつ実バグを含むため、扱いを分ける。

1. **#155**（double_jump リセット）→ clean・fix妥当・有益。最初にマージ可。
2. **#157**（changeKey スタック）→ clean・fix妥当・有益。#155 との順序は**どちらでも可**（両順序で `sideScroller.ts` は自動マージ成功を検証済み）。lint warning 2件は許容範囲（必要なら別途 `!` 除去を推奨）。
3. **#156**（resolveGenreProgress 復元）→ clean だが **Issue #19 は既に解決済みでデッドコードを追加するだけ**。優先度は最も低い。マージするなら害はないが、本来は **Close（不要）** か、「テスト側ローカル関数を廃してドメイン実装を使う」形に作り直す方が望ましい。順序は任意（他と非干渉）。
4. **#159** → **最後、かつ現状のままではマージ非推奨**。理由:
   - main と CONFLICTING で、`EndingPanel.vue` は**手動での慎重な衝突解決が必須**（スタイル付き1コピーのみ残す）。
   - (b) surprise CSS 過剰削除の回帰、(c) Google Fonts CDN のオフライン違反、(d) useManual の冗長 を**先に是正**すべき。
   - 有益な部分（rectsOverlap 対称化・useScoreAnimation・cardPool 最適化・E2Eヘルパー整備）は残す価値があるため、**問題箇所を切り出して再構成した上で**取り込むのが理想。
   - #155/#156/#157 を先にマージしても #159 の衝突ファイル（EndingPanel.vue / useManual.ts）とは独立なので、#159 の再作業は並行して進められる。

**まとめ**: `#155` → `#157`（順不同）→（任意で `#156`）→ 是正後の `#159`。

---

## 付録: 主な検証コマンド

- コンフリクト: `git worktree add --detach ../MO-pr-merge-test origin/main` 上で `git merge --no-ff pr-<N>`（`pull/<N>/head` を fetch）
- 順序依存: `main+155→157` と `main+157→155` の双方で `sideScroller.ts` 自動マージ成功を確認
- 品質ゲート: `typecheck` / `lint` / `validate` / `test:features` / `test:unit` / `playwright test`（Node v20.20.2）
- #156 デッドコード: `git grep "resolveGenreProgress" origin/main -- src/`（import 皆無）、main 単独 test:unit 90/90
- #159 CSS: `git show pr-159:src/components/EndingPanel.vue | grep -cF "<selector>"` でテンプレート使用クラスのCSS消失を確認
