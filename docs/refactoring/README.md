# リファクタリング計画（feature/rpg-roguelike-battle）

**作成日:** 2026-09-06
**対象ブランチ:** `feature/rpg-roguelike-battle`（`main` から +26,884行 / 264ファイル）
**基点コミット:** `bb6675b`（第8フェーズのWIPを確定させたチェックポイント）

---

## 0. 本計画の目的と、絶対条件

本ブランチは当初の設計文書（[../genre/rpg/rpg-genre.md](../genre/rpg/rpg-genre.md)）に対し、実装中に2件の大きな追加要件
（敵グループ/難易度スケーリング、スキルポイント制度）が後付けされ、さらに戦闘UIのフィードバック対応が
6回以上重ねられた。その結果、**設計としては正しいが、継ぎ足しの痕跡がそのまま構造として残っている**箇所が多い。

本計画の目的は、後続のAIエージェント・開発者が迷わないコードにすること。**機能追加は一切行わない。**

### 絶対条件（すべての作業に適用）

1. **可視挙動を変えない。** 画面の見た目（DOM構造・算出CSS）、ゲームの進行・数値・演出のタイミング、
   JSONの値、コンソール出力のいずれも変えない。
2. 挙動が変わりうる提案は本計画では実施せず、[07-deferred.md](07-deferred.md) に隔離する。

> **例外（2026-09-06）:** ユーザーの指示により、[07-deferred.md](07-deferred.md) の A〜C に隔離していた
> **既知の不具合の修正だけは、可視の変更を伴うことを承知のうえで先に実施した**（進捗表の「既知バグ修正」の行）。
> バグ修正で実際に見え方が変わったのは以下の3点のみで、いずれも 07-deferred.md に記録してある。
> - エフェクトの発光・揺れの尺が一律220msから各エフェクトの `durationMs`（240〜420ms）になった
> - クリティカル時の画面フラッシュが 300ms で切られず 380ms 最後まで再生されるようになった
> - ヘルプ／用語パネルの開閉状態がラン再開に持ち越されなくなった
>
> **Phase 2 以降は再び「可視挙動を変えない」が絶対条件に戻る。**
3. 各フェーズの完了時に §2 の検証ゲートを通す。通らなければそのフェーズは未完了とする。
4. 1フェーズ = 1コミット。フェーズをまたいだ変更を1コミットに混ぜない。

---

## 1. ベースライン（2026-09-06 / `bb6675b` 時点の実測）

| コマンド | 結果 |
|---|---|
| `npm run typecheck` | ✅ 通過 |
| `npm run lint` | ✅ 通過 |
| `npm run validate` | ✅ 通過 |
| `npm run test:unit` | ⚠️ **962件中 3件失敗**（下記） |
| `npm run build` / `bundle-size` | ✅ 通過 |

### 既知の失敗3件（本計画の Phase 0 で解消する）

| テスト | 症状 |
|---|---|
| `tests/unit/composables/useBattleState.test.ts`（敵の手番） | `actorId` が `enemy_goblin#0` ではなく `enemy_bat#1` |
| `tests/unit/composables/useBattlePresentation.test.ts` × 2 | 多段ヒットの段階表示が初手から0になる |

**原因は確定済み。** 前コミット `b663462` では3件とも通過する。`bb6675b` で追加したコンテンツにより
`rng = () => 0.5` が引くエンカウントが2体編成（`set_goblin_bat_duo`）になり、`buildTurnQueue` が AGI 降順で並べるため
`enemy_bat`(agi 650) が `enemy_goblin`(agi 420) より先に動くようになった。
**テストが実データ `BATTLE_CONTENT` に依存していたことによる期待値ドリフトであり、製品バグではない。**

ただし `useBattlePresentation` の2件は、その裏にある実在の設計脆弱性を露出させている
（announce のたびに再生中の表示HPを無条件で真値に上書きする。→ [03-composables.md](03-composables.md) §4-1）。
テスト側の修正とプロダクト側のガードの両方が必要。

---

## 2. 検証ゲート（各フェーズの完了条件）

```bash
npm run typecheck && npm run lint && npm run validate && npm run test:unit && npm run build && npm run bundle-size
```

加えて、作業領域に応じて以下を追加する。

| 領域 | 追加の検証 |
|---|---|
| `src/components/battle/**` の CSS/DOM に触れた | ビルド出力CSSの before/after 比較（`data-v-*` ハッシュ除去後、宣言ブロックの集合一致）。Phase 0 で用意する |
| `src/tools/**`（content-editor） | dev サーバーで手動確認（新規作成 → 保存 → 見出しから「（新規）」が消え、削除ボタンが出て、成功メッセージが残る） |
| `src/data/config/**` の値に触れた | **値は1つも変えない**。キー名・配置のみの変更に限る |

**テスト失敗数は「3件」を上限とし、Phase 0 完了後は「0件」を上限とする。** 増やしてはならない。

### CSS の同一性検証（`src/components/**` に触れたら必須）

```bash
npm run build && npm run css-snapshot tmp/css-before.txt
# （作業）
npm run build && npm run css-snapshot tmp/css-after.txt
node scripts/css-snapshot.mjs --diff tmp/css-before.txt tmp/css-after.txt
```

[scripts/css-snapshot.mjs](../../scripts/css-snapshot.mjs) は postcss でビルド後CSSを解析し、
Vue の scoped ハッシュ（`data-v-*`）とルールの出現順を正規化して「セレクタと宣言の集合」として比較する。
差分ゼロなら描画は変わっていない。
**限界: カスケード順序だけが変わったケースは検知できない。** 順序に関わる変更では実画面の目視確認も併せて行うこと。

---

## 3. 問題の要約（詳細は各ファイル）

| # | 領域 | 最も重い問題 | 詳細 |
|---|---|---|---|
| 1 | 横断 | `rpg` が `GenrePlugin` 抽象を迂回し、`App.vue` に `isBattleMode` 分岐が散在。設計文書が「未実装」と誤表示 | [01-cross-cutting.md](01-cross-cutting.md) |
| 2 | domain | 「所持特性・パッシブの `effect[]` を集計する」同型ループが7箇所。`battleEngine.ts` が8関心の神モジュール | [02-domain.md](02-domain.md) |
| 3 | composables | `useBattleState.ts` が7責務の god-composable（626行 / 公開API 37個） | [03-composables.md](03-composables.md) |
| 4 | components | `BattleScreen.vue` の `<script setup>` 568行が「第2のViewModel」。折りたたみパネルの殻が3回コピペ | [04-components.md](04-components.md) |
| 5 | tools | `contentEditor.ts` 1396行が16責務を9個のグローバルで結合。新 op がエディタから静かに消える罠 | [05-tools.md](05-tools.md) |
| 6 | data/config | `section` 命名破り、`REQUIRED_SECTIONS` に9件欠落で検証がサイレント無効化、effect ID 18件が検査外 | [06-data-config.md](06-data-config.md) |
| — | 除外 | 挙動が変わるため本計画では実施しない項目（既知バグ2件を含む） | [07-deferred.md](07-deferred.md) |

### CLAUDE.md「300行の目安」違反の全数

CLAUDE.md は `src/game/systems/TetrisFeature.ts`（716行）を「悪い前例。テンプレートにするな」と名指ししている。
**本ブランチはその規約が明文化された後に、それを上回る1396行・930行のファイルを新造した。**

**A. ブランチ新規の本番コード（本計画の直接対象・12件）**

| 行 | ファイル | 超過 | 分割案 |
|---:|---|---:|---|
| 1396 | `src/tools/contentEditor.ts` | 4.7x | [05-tools.md](05-tools.md) §1 |
| 930 | `src/components/battle/BattleScreen.vue` | 3.1x | [04-components.md](04-components.md) §1 |
| 648 | `src/components/battle/CharacterFrame.vue` | 2.2x | [04-components.md](04-components.md) §5-3 |
| 626 | `src/composables/useBattleState.ts` | 2.1x | [03-composables.md](03-composables.md) §1 |
| 564 | `src/domain/battle/battleEngine.ts` | 1.9x | [02-domain.md](02-domain.md) §2-4 |
| 519 | `src/domain/battle/types.ts` | 1.7x | [02-domain.md](02-domain.md) §2-5 |
| 383 | `src/components/battle/SkillPanel.vue` | 1.3x | [04-components.md](04-components.md) |
| 367 | `src/tools/contentEditorForm.ts` | 1.2x | [05-tools.md](05-tools.md) §1-2 |
| 343 | `src/components/battle/SkillDraftPanel.vue` | 1.1x | [04-components.md](04-components.md) |
| 326 | `src/domain/battle/backdrop.ts` | 1.1x | [02-domain.md](02-domain.md) §2-3（層の移動が先） |
| 325 | `scripts/contentEditorPlugin.mjs` | 1.1x | [05-tools.md](05-tools.md) §5 |
| 324 | `src/components/battle/InfoPanel.vue` | 1.1x | [04-components.md](04-components.md) §2-3 |

**B. ブランチで肥大化した既存ファイル（差分ぶんが責任範囲・6件）**

| main → HEAD | ファイル | 増分 |
|---|---|---:|
| 533 → 902 | `scripts/validate-json.mjs` | +369 (+69%) |
| 259 → 342 | `src/framework/ConfigValidator.ts` | +83 (+32%) |
| 646 → 727 | `src/framework/config-types.ts` | +81 |
| 991 → 1049 | `src/App.vue` | +58 |
| 765 → 784 | `src/components/ManualPanel.vue` | +19 |
| 431 → 437 | `src/domain/types.ts` | +6 |

**C. ブランチ新規のテスト（300行超7件・任意）**
`battleEngine.test.ts`(784) / `useBattleState.test.ts`(746) / `effectOps.test.ts`(630) / `BattleScreen.test.ts`(597) /
`battleContent.test.ts`(383) / `skillDraft.test.ts`(311) / `damageCalc.test.ts`(302)。
テストは1テーマ1ファイルで大きくなりやすく、300行ルールの主眼（責務の混在）とは事情が異なる。
上位2件のみ `describe` 単位の分割余地あり。**優先度は最低。**

**D. 元から300行超（ブランチ無関係＝本計画のスコープ外・17件）**
`sideScroller.ts`(1667) / `TetrisFeature.ts`(716) / `PuzzleFeature.ts`(695) / `EndingPanel.vue`(625) /
`PixelCanvas.ts`(531) / `GenreRevealOverlay.vue`(447) / `ThrowOverlay.vue`(443) / `TutorialScreen.vue`(396) /
`genreLab.ts`(388) / `useGameState.ts`(382) / `ChoicePanel.vue`(371) / `PluginLoader.vue`(336) /
`SfxSound.ts`(324) / `AerialStgPlugin.ts`(317) ほかテスト3件。
**本ブランチのツギハギとは無関係なので着手しない。** 別タスクとして記録するに留める。

---

## 4. 実施フェーズ

リスクの低い順に並べてある。**この順序を守ること。** 特に Phase 0 を飛ばして Phase 4 以降に着手しない。

| Phase | 内容 | 挙動変更 | 主な根拠 |
|---|---|---|---|
| **0** | **安全網の整備**（失敗3件の解消 + 未カバー領域へのテスト追加 + CSS差分スクリプト） | なし（テスト追加のみ） | 全ファイル §テストカバレッジ |
| **1** | デッドコード削除 | なし | 各 §デッドコード |
| **2** | 1対1の統合・定数の一元化（重複定義を1本に寄せる） | なし | 02 §1-2/1-4/1-9, 04 §4, 05 §3 |
| **3** | 層の是正（ファイル移動と import 付け替えのみ） | なし | 02 §2-2/2-3, 03 §2, 04 §6 |
| **4** | 300行超ファイルの分割（バレル/facade を残して内部だけ差し替え） | なし | 各 §分割案 |
| **5** | 重複ロジックの集約（ヘルパへの抽出） | なし | 02 §1-1/1-6, 03 §6, 05 §2, 06 §5-1 |
| **6** | マジックナンバーの JSON 化（**値は現行リテラルをそのまま写す**） | なし | 02 §4, 06 §2-2 |
| **7** | 型設計の是正 | なし | 02 §3 |
| **8** | 拡張点の整備（op 追加コストの削減、検証の一本化） | なし | 02 §7, 05 §4/§5, 06 §3 |
| **9** | ドキュメント同期（設計文書の「未実装」表記の是正を含む） | なし | 01 §2 |

### フェーズ間の依存

```
0 ──┬─→ 1 ─→ 2 ─→ 3 ─→ 4 ─→ 5 ─→ 6 ─→ 7
    └─────────────────────────────────→ 8
                                        9（いつでも可。ただし 1〜8 の結果を反映するため最後が望ましい）
```

- Phase 4（分割）は Phase 3（層の是正）の後。先に分割すると、移動すべきコードを分割先へ持ち込んでしまう。
- Phase 7（型）は最後。`BattleState` のネスト化だけは `useBattleState` と `BattleScreen.vue` の
  両方に波及するため、[02-domain.md](02-domain.md) §3-8 のとおり**本計画では実施しない**（[07-deferred.md](07-deferred.md) 送り）。

---

## 5. 見込み効果

| 指標 | 現状 | 目標 |
|---|---:|---:|
| 300行超の本番ファイル（ブランチ新規） | 12件 | 0件 |
| `BattleScreen.vue` | 930行 | 約150行 + 子4本 + composable 10本 |
| `useBattleState.ts` | 626行 | 約150行（facade）+ 6モジュール |
| `contentEditor.ts` | 1396行 | 最大250行 × 12ファイル |
| 新しい effect op の追加に必要な編集箇所 | 10箇所 / 6ファイル | 2〜4箇所 |
| 新しいステータスの追加に必要な編集箇所 | 11箇所 | 4箇所 |
| 新しい戦闘エフェクトの追加に必要な編集箇所 | 9ファイル | JSON 1ファイル（Phase 8 完了時） |
| 新しい config キーの追加に必要な編集箇所 | 6箇所 | 3箇所 |

---

## 6. 進捗

| Phase | 状態 | コミット |
|---|---|---|
| 0 安全網 | **完了**（失敗3件→0件、テスト 962 → **1154**、`npm run css-snapshot` 追加） | `6d6e9f4` |
| 1 削除 | **完了**（本番コード -232行 / +158行。テスト 1152、削除した死にコードのテスト2件ぶん減。CSSは 1084ルールで差分ゼロ） | `341beca` |
| **既知バグ修正** | **完了**（[07-deferred.md](07-deferred.md) の A〜C。テスト **1166**）。※フェーズ番号の外。ユーザー指示による割り込み | `fcded2b` |
| 2 一元化 | 未着手 | |
| 3 層の是正 | 未着手 | |
| 4 分割 | 未着手 | |
| 5 集約 | 未着手 | |
| 6 JSON化 | 未着手 | |
| 7 型 | 未着手 | |
| 8 拡張点 | 未着手 | |
| 9 ドキュメント | 未着手 | |
