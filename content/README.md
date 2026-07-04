# コンテンツ追加ガイド

ここにファイルを置いて `npm run build` を実行するだけでゲームに反映されます。
TypeScript や Vue のコードを触る必要はありません。

---

## ジャンルを追加する → `content/genres/`

`content/genres/` に JSON ファイルを作成してください。

**最小構成（3フィールドのみ）:**
```json
{
  "id": "lava_world",
  "label": "溶岩ワールド",
  "thresholds": { "enemy": 4, "survive": 3 }
}
```

| フィールド | 必須 | 説明 |
|---|---|---|
| `id` | ✅ | 英小文字・数字・_のみ。ファイル名と合わせる |
| `label` | ✅ | ゲーム内で表示されるジャンル名 |
| `thresholds` | ✅ | このジャンルになる条件（どのパラメータがいくつ以上か） |
| `theme` | — | UIテーマ（`plain` / `stg` / `rpg` / `puzzle` / `rhythm` / `horror` / `aquatic` / `runner` / `stealth` / `racing` / `platformer` / `dungeon` / `hack_slash` / `survival` / `tetris`） |
| `bgColor` | — | 背景色（例: `"#0d0d1a"`） |
| `enableFeatures` | — | 有効にする機能（例: `["shoot", "enemy_hp"]`） |
| `disableFeatures` | — | 無効にする機能 |
| `scoreFormula` | — | スコア計算式（例: `"kills * 100 + distance * 0.5"`） |
| `manualReveal` | — | ジャンル確定時のメッセージ（省略すると自動生成） |
| `endingFlavor` | — | エンディングの一言 |
| `visual` | — | 詳細ビジュアル設定（→ `_EXAMPLE.json` 参照） |

**thresholds に使えるパラメータ:**

| パラメータ | 意味 | 使うジャンル例 |
|---|---|---|
| `tempo` | スピード・テンポ感 | runner, rhythm, racing |
| `range` | 射程・遠距離攻撃 | stg, aerial_stg |
| `enemy` | 敵の密度・戦闘激化 | stg, arena, hack_slash |
| `combo` | コンボ・連続成功 | puzzle, hack_slash |
| `growth` | 成長・経験値 | rpg, dungeon |
| `rhythm` | リズム・タイミング | rhythm, sports |
| `stealth` | 隠密・接触回避 | stealth_action, horror |
| `vertical` | 縦移動・縦スクロール | aerial_stg, aquatic |
| `aerial` | 空中・プラットフォーム | platformer |
| `survive` | 耐久・生存 | survival, horror |
| `craft` | 設置・積み上げ | tower_def, idle |
| `speed` | 速度・ダッシュ | racing, sports |

**閾値の目安**（1枚のカードは1軸あたり 1〜3 加算する）:

- 1軸だけ使う場合 → `5` 前後
- 2軸使う場合 → 各 `3` 前後
- 3軸使う場合 → 各 `2` 前後

閾値が高すぎると誰もそのジャンルに到達できず、低すぎると数回の選択で
すぐ確定してしまう。この目安は `src/data/config/genre_params.json` の
`thresholdGuide` と対応している。

---

## 選択肢を追加する → `content/choices/`

`content/choices/` に JSON ファイルを作成してください。
選択肢は「カードプール」に追加され、毎ラウンドの2択に自動的に抽選されます。
どこかのバージョンを指定する必要はありません。

**フォーマット:**
```json
[
  {
    "label": "溶岩エリアに踏み込む",
    "genreParams": { "enemy": 2, "survive": 2 },
    "manualText": ["溶岩エリアが出現するようになりました。"]
  }
]
```

| フィールド | 必須 | 説明 |
|---|---|---|
| `label` | ✅ | 選択肢のテキスト |
| `genreParams` | ✅ | この選択で加算されるパラメータ（上の表参照） |
| `manualText` | — | 選択後に説明書へ追記される行（省略すると `label` がそのまま使われる） |
| `weight` | — | 抽選の出やすさ（省略時 1。大きいほど提示されやすい） |
| `genreAffinity` | — | 向かうジャンルID群。プレイヤーの傾向と合うと提示されやすくなる |
| `conflictsWith` | — | 矛盾するカードID群（相手の説明書行が取り消し線になる） |
| `hint` | — | 開発者向けメモ（ゲームには表示されない） |

より高度なフィールド（`hazards` / `runtimeConfig` など）は
`src/data/cards/TEMPLATE.json` と `schemas/cards.schema.json` を参照してください。
`src/data/cards/` に直接カードファイルを置いても同じように動きます
（`$schema` を付ければエディタで自動補完・検証が効きます）。

---

## コマンド一覧

```bash
npm run build          # ビルド（content/ の内容を自動反映）
npm run dev            # 開発サーバー（content/ を反映してから起動）
npm run preprocess     # content/ の検証・変換のみ（ビルドしない）
npm run new-genre      # 対話式でジャンルファイルを生成
npm run reach-sim      # 全ジャンルの到達しやすさをシミュレーション
```

カードやジャンルを追加・調整したら `npm run reach-sim` を実行すると、
「ランダムに遊んだときのジャンル分布」と「狙ったジャンルへの到達成功率」が
表示されます。到達率が極端に低いジャンルは、閾値が高すぎるか、
その軸を供給するカードが足りていません。

---

## ヒント

- ファイル名は何でもOK（`_` で始まるファイルは無視されます）
- 同じ `id` のジャンルを置くと上書きされます
- エラーは `npm run preprocess` を単独で実行すると分かりやすいです
