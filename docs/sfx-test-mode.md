# sfx-test — 効果音テスト再生ツール

`src/data/sfx/*.json` に定義された効果音を、**本番ゲームと同一の再生ロジック**で試聴する開発者専用ツール。

- 実装: `tools/sfx-test.html`（エントリ）/ `src/tools/sfxTest.ts`（UI）/ `src/tools/sfxTestLogic.ts`（ロジック）
- 開発専用。本番ビルドは `index.html` のみを入力とするため、**dist には含まれない**
- 効果音そのものの仕様は [sound-system.md](sound-system.md) を参照

---

## 起動方法

```bash
npm run sfx-test
```

dev サーバーが起動し、ブラウザで `tools/sfx-test.html` が自動的に開く。手動で開く場合は dev サーバー起動中に **http://localhost:5173/tools/sfx-test.html** へアクセスする（ポート番号は環境により変わる）。

`npm run dev -- --open /tools/sfx-test.html` でも同じ結果になる。

> **通常の `npm run dev` は今まで通り本番ゲームを起動する。** sfx-test へ自動遷移することはない。

---

## 画面の見方

### 1. SFX選択ドロップダウン

`SFX_DEFS` の全 51 件を ID 順に列挙する。選択すると JSON の `$comment`・バッジ・トラック内訳が即座に更新される。

一覧はハードコードされておらず `Object.keys(SFX_DEFS)` から生成されるため、`src/data/sfx/` に JSON を追加すれば**自動的に選択肢へ現れる**。

### 2. 再生ボタン

選択中の SFX を `SfxSound.playSfx()` で鳴らす。連打しても壊れない（[sound-system.md §3.3](sound-system.md#33-同時再生の安全性)）。

### 3. コンボ数入力（`combo` 選択時のみ表示）

`combo` は本番で `playSfx('combo', computeComboFreqScale(count))` と呼ばれ、**コンボ数に応じてピッチが変わる**唯一の SFX。そのため `combo` を選んだときだけコンボ数の入力欄が現れ、指定した値で本番と同じピッチを再現する。

コンボ数 0 のときが `freqScale = 1`（＝引数なしで鳴らしたときの音）に相当する。

### 4. 最近使った候補

選択・再生した ID が新しい順に最大8件たまる。`localStorage`（キー: `sfxTest.recentIds`）に保存されるため、ページを再読み込みしても残る。

**クリックすると選択状態だけが変わり、再生はされない。** 選択操作と再生操作を分離しているため、聞き比べのために候補を行き来しても意図せず音が鳴ることがない。

### 5. 選択中SFXの内容

選択中の `SfxDef` の `tracks` をテーブル表示する。`kind` / `wave` / `freq`（`freqEnd` があれば `→` で併記）/ `durationSec` / `volume` / `delaySec` / `filter` を一覧できる。

JSON を編集すると Vite の HMR で即座に反映されるため、**エディタで数値を変えながら試聴する**使い方ができる。

### 6. バッジ

| バッジ | 意味 |
|---|---|
| `未配線（PR #230 待ち）` | どのゲームイベントからも再生されない SFX（[sound-system.md §6](sound-system.md#6-未配線の-sfx6件)） |
| `定義に警告 N件` | `devValidateSfx` が警告を出す定義。ホバーで内容を表示 |

---

## 設計上の制約

このツールには、実装・変更時に必ず守るべき3つの制約がある。

### 制約1・2: 本番とテストモードは経路を共有しない

テスト再生モードは本番ゲームのロジック（`sideScroller` / `GameRegistry` / `FeatureSystem` / `useGameState` 等）を一切呼ばず、逆に本番コードもテストモードの実装を一切参照しない。

これを**実行時の `if` 分岐ではなくビルド構成上の物理的分離**で保証している。実行時分岐は将来の変更で条件を壊しうるが、モジュールグラフが交わらなければ壊れようがない。

具体的には:

- [vite.config.ts](../vite.config.ts) は `build.rollupOptions.input` を指定していないため、`npm run build` はルートの `index.html` のみを入力とする。`tools/sfx-test.html` は `public/` にも置かないので **dist に一切含まれない**
- `src/main.ts` は `src/tools/` を import しない。逆も同様
- `SfxSound` 自体のランタイム依存は `SFX_DEFS` だけ（他は `import type` で型消去される）ため、**このツールを作ってもゲームロジックは1バイトも引き込まれない**

機械的な保証を二重にかけている:

1. **ESLint**: [eslint.config.js](../eslint.config.js) で `src/tools/**` を `ignores` に置いた上で `src/tools/` への import を `no-restricted-imports` により禁止
2. **回帰テスト**: [sfxTestIsolation.test.ts](../tests/unit/sfxTestIsolation.test.ts) が `src/tools/` を除く `src/**` 全ファイルを走査し、`src/tools/` への import 文字列が存在しないことを検証

### 制約3: 本番で鳴る音とテスト再生で鳴る音は同一

テスト再生専用の音声合成ロジックを新規に書かない。実装を二重化すると後から乖離するため、**同じ関数を呼ぶ**ことで構造的に保証する。

| 用途 | 使う本番実装 |
|---|---|
| 効果音を鳴らす | `SfxSound.playSfx()` |
| 効果音一覧を取得する | `SFX_DEFS`（[SfxLoader.ts](../src/framework/SfxLoader.ts)） |
| 不正な定義を警告する | `devValidateSfx`（[ConfigValidator.ts](../src/framework/ConfigValidator.ts)） |
| コンボ音のピッチ算出 | `computeComboFreqScale()` |

> **`freqScale` を汎用スライダーとして全 SFX に付けてはいけない。** 本番で `freqScale` が可変なのは `combo` だけであり、他の SFX に任意のスケールを掛けられるようにすると「本番では絶対に鳴らない音」を試聴できてしまい、このツールの前提（テスト再生＝本番の再現）が崩れる。

---

## ファイル構成

```
tools/sfx-test.html          # 独立したHTMLエントリ（本番 index.html とは無関係）
src/tools/sfxTest.ts         # UI層: DOM操作のみ。import した時点で init() が走る
src/tools/sfxTestLogic.ts    # ロジック層: DOM非依存の純粋関数
```

UI とロジックを分けているのは、[genre-lab](genre-lab.md) の `genreLab.ts` / `genreLabSim.ts` 分離と同じ理由による。ロジックだけを [sfxTestLogic.test.ts](../tests/unit/tools/sfxTestLogic.test.ts) から素の関数として import してテストできるようにするため。`sfxTest.ts` は import された時点で DOM 操作を開始するため、**テストコードから直接 import しない**。

`sfxTestLogic.ts` の主な公開物:

| エクスポート | 概要 |
|---|---|
| `pushRecent(recent, id, limit?)` | 「最近使った」リストへの追加（重複排除・上限切り捨て） |
| `collectSfxWarnings(defs)` | `devValidateSfx` の警告出力を ID ごとに集約 |
| `UNWIRED_SFX_IDS` | 未配線 SFX の ID 集合（手動保守。§参照先は sound-system.md §6） |
| `RECENT_STORAGE_KEY` / `RECENT_LIMIT` | localStorage キーと上限件数 |

---

## `preprocess` を含めない理由

`dev` / `build` は `node scripts/preprocess.mjs` を前置しているが、`sfx-test` は前置しない。これは省略ミスではなく意図的な判断。

[preprocess.mjs](../scripts/preprocess.mjs) は `content/` を `src/data/genres/` `src/data/cards/` へ変換するスクリプトで、SFX とは無関係。前置すると `content/` 側の不備だけで `preprocess` が `process.exit(1)` し、**SFX と無関係な理由で効果音の試聴ができなくなる**。SFX 作業を content の状態から独立させるため、あえて外している。

---

## CI との関係

`ci` スクリプト自体の変更は不要。既存ステップがそのままカバーする:

| 対象 | カバーするステップ |
|---|---|
| `src/tools/*.ts` の型 | `typecheck`（引数なし `vue-tsc` は `src/tools/` も対象。バンドルされないが型検査はされる） |
| ESLint 隔離ルール | `lint` |
| `sfxTestIsolation.test.ts` / `sfxTestLogic.test.ts` | `test:unit:ci` |
| SFX JSON | `validate` |
| このドキュメントのリンク | `check-doc-links` |
| バンドルへの非混入 | `bundle-size`（tools はグラフ外なので数値は変わらないはず。変動したら混入を疑うシグナルになる） |

---

## トラブルシューティング

### `EPERM: operation not permitted, rmdir 'node_modules/.vite/deps'`

Vite の依存キャッシュはプロジェクト単位で共有されるため、**別の dev サーバーが既に起動していると競合する**。既存の dev サーバー（`npm run dev` / `npm run sfx-test` の別ウィンドウ）を停止してから再実行する。

それでも直らない場合はキャッシュを削除する:

```bash
rm -rf node_modules/.vite
```

### 音が鳴らない

ブラウザの自動再生ポリシーにより、**ユーザー操作が一度も発生していないページでは AudioContext が起動しない**。再生ボタンをクリックすれば起動するため、通常は問題にならない。`SfxSound` は AudioContext を生成できない場合すべて no-op になるので、例外は発生しない。
