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
| `theme` | — | UIテーマ: `plain` / `stg` / `rpg` / `puzzle` / `rhythm` / `horror` / `aquatic` |
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

---

## 選択肢を追加する → `content/choices/`

`content/choices/` に JSON ファイルを作成してください。
プレイヤーへの「2択」に新しい選択肢を注入できます。

**フォーマット:**
```json
[
  {
    "addTo": "2.0-a",
    "label": "溶岩エリアに踏み込む",
    "genreParams": { "enemy": 2, "survive": 2 }
  }
]
```

| フィールド | 必須 | 説明 |
|---|---|---|
| `addTo` | ✅ | 追加先バージョンキー（`_SLOTS.md` で確認） |
| `label` | ✅ | 選択肢のテキスト |
| `genreParams` | ✅ | この選択で加算されるパラメータ（上の表参照） |
| `hint` | — | 開発者向けメモ（ゲームには表示されない） |

**注入できるバージョン一覧は `content/choices/_SLOTS.md` で確認できます。**
（`npm run preprocess` を実行すると自動生成されます）

---

## コマンド一覧

```bash
npm run build          # ビルド（content/ の内容を自動反映）
npm run dev            # 開発サーバー（content/ を反映してから起動）
npm run preprocess     # content/ の検証・変換のみ（ビルドしない）
npm run new-genre      # 対話式でジャンルファイルを生成
```

---

## ヒント

- ファイル名は何でもOK（`_` で始まるファイルは無視されます）
- 同じ `id` のジャンルを置くと上書きされます
- エラーは `npm run preprocess` を単独で実行すると分かりやすいです
