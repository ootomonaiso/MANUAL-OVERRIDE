# 説明書 JSON スキーマ リファレンス

`src/data/manuals/*.json` のスキーマ完全仕様。コードの変更なしで説明書ルートを追加できる。

---

## ファイル構造

```json
{
  "id": "branch-stg",
  "description": "STG ルートのブランチデッキ（開発者メモ）",
  "entries": [ ... ]
}
```

| フィールド | 必須 | 型 | 説明 |
|---|---|---|---|
| `id` | ✅ | string | ファイル識別子（ファイル名と合わせると分かりやすい） |
| `description` | ─ | string | 開発者向けメモ（プレイヤーには非表示） |
| `entries` | ✅ | ManualEntryJSON[] | バージョンエントリーのリスト |

---

## ManualEntryJSON（1バージョン）

```json
{
  "key": "2.0-stg",
  "version": "2.0",
  "manualText": [
    "Zキーで弾を撃てます。",
    "赤い障害物に当たると死にます。"
  ],
  "image": "v2_stg_illustration.png",
  "imageAlt": "銃を持つキャラクタのイラスト",
  "controls": {
    "jump":      "Space",
    "moveLeft":  "ArrowLeft",
    "moveRight": "ArrowRight",
    "shoot":     "z"
  },
  "hazards": {
    "colors":     ["red", "#e74c3c"],
    "safeColors": ["blue", "#3498db"]
  },
  "tutorialHint": "Zキーで撃てます！",
  "narrative": "ゲームが変わります...",
  "runtimeOverrides": { ... },
  "style": { ... },
  "choices": [ ... ]
}
```

| フィールド | 必須 | 型 | 説明 |
|---|---|---|---|
| `key` | ─ | string | MANUAL_DECK のマップキー。省略時は `version` の値を使用 |
| `version` | ✅ | string | 説明書ヘッダーに表示するバージョン文字列 |
| `manualText` | ✅ | string[] | 説明書本文（行ごと） |
| `image` | ─ | string | イラスト画像ファイル名（`public/manuals/` に配置） |
| `imageAlt` | ─ | string | 画像の代替テキスト |
| `controls` | ─ | Controls | 操作キー。省略時は前バージョンから継承 |
| `hazards` | ─ | object | 危険/安全色の定義。省略時は前バージョンから継承 |
| `tutorialHint` | ─ | string | ゲーム画面に一時表示するヒント |
| `narrative` | ─ | string | バージョン切替演出テキスト（差分アニメ前にフェードイン） |
| `runtimeOverrides` | ─ | RuntimeOverrides | このバージョン中有効なゲームパラメータ上書き |
| `style` | ─ | ManualStyleOverride | 説明書UIのビジュアル上書き |
| `choices` | ─ | ChoiceJSON[] | 次バージョンへの2択。空または省略でジャンル収束 |

---

## ChoiceJSON（選択肢）

```json
{
  "label": "障害物を撃って倒せるようにする",
  "next": "3.0-stg",
  "genreParams": { "range": 2, "enemy": 2 },
  "id": "2.0-a",
  "hint": "STG方向の選択",
  "paramMultiplier": 1.2,
  "displayStyle": {
    "color": "#1a1a3a",
    "textColor": "#88aaff",
    "icon": "🔫"
  }
}
```

| フィールド | 必須 | 型 | 説明 |
|---|---|---|---|
| `label` | ✅ | string | プレイヤーに見せるラベル |
| `next` | ✅ | string | 選択後の遷移先バージョンキー |
| `genreParams` | ✅ | GenreParams | ジャンルパラメータへの加算値 |
| `id` | ─ | string | 内部ID（省略時は自動生成） |
| `hint` | ─ | string | 開発者メモ（プレイヤーには非表示） |
| `paramMultiplier` | ─ | number | genreParams への乗数（デフォルト 1.0） |
| `genrePoints` | ─ | Record<string, number> | ジャンルへの直接ポイント付与（例: `{ "stg": 3, "rpg": 1 }`） |
| `displayStyle` | ─ | ChoiceDisplayStyle | ボタンの見た目上書き |

---

## runtimeOverrides（ゲームパラメータ上書き）

このバージョン期間中だけ有効。次バージョンに移ると解除される。

```json
{
  "runtimeOverrides": {
    "scrollSpeed": 280,
    "gravity": 1400,
    "bpm": 160,
    "forceGenreId": "rhythm",
    "scrollDirection": "vertical",
    "environment": "space",
    "playerMaxHp": 5,
    "timescale": 0.8,
    "colorTouchScore": 400,

    "physics": {
      "jumpVelocity": -720,
      "jumpCutMultiplier": 0.38,
      "gravity": 1600,
      "fallGravityMult": 1.8,
      "runSpeed": 260,
      "slowPreciseRatio": 0.4,
      "coyoteFrames": 8,
      "jumpBufferFrames": 12
    },

    "spawn": {
      "baseInterval": 2000,
      "minInterval": 500,
      "decayRate": 0.0002,
      "itemDropChance": 0.5,
      "enemyHpAmount": 5,
      "floatAmp": 20
    },

    "shoot": {
      "bulletSpeed": 1100,
      "shotCooldown": 0.12,
      "comboResetTime": 3.0,
      "baseScorePerKill": 150,
      "forceThreeWay": true
    }
  }
}
```

### トップレベルの上書き

| フィールド | デフォルト | 説明 |
|---|---|---|
| `scrollSpeed` | tempo依存 | スクロール速度 px/s |
| `gravity` | 1600 | 重力加速度 px/s² |
| `bpm` | tempo依存 | リズム系の BPM |
| `forceGenreId` | null | このバージョン中ジャンルを強制固定 |
| `scrollDirection` | ジャンル依存 | `'horizontal'` \| `'vertical'` \| `'none'` |
| `environment` | ジャンル依存 | 背景環境（`'ground'` 等） |
| `playerMaxHp` | 3 | 最大HP（hp Feature 有効時） |
| `timescale` | 1.0 | 時間スケール（<1でスロー） |
| `colorTouchScore` | 200 | 安全色タッチ時の1スコア |

### physics 上書き

物理定数の細部調整。個別フィールドのみ上書き可能。

### spawn 上書き

スポーン難易度の調整。個別フィールドのみ上書き可能。

### shoot 上書き

射撃メカニクスの調整。個別フィールドのみ上書き可能。

---

## style（説明書UIビジュアル上書き）

ジャンルが近づくにつれてフォントや色を変えることでUIを演出できる。

```json
{
  "style": {
    "fontFamily": "\"Courier New\", monospace",
    "accentColor": "#4a90d9",
    "paperColor": "#fdf6e3",
    "textColor": "#333",
    "borderColor": "#c8a96e",
    "headerTextColor": "#8b6914",
    "diffAddColor": "#2da44e",
    "diffRemoveColor": "#cf222e",
    "boxShadow": "0 4px 24px rgba(0,0,0,0.25)",
    "borderRadius": 12,
    "fontSize": 14,
    "lineHeight": 1.7
  }
}
```

---

## ブランチ構造の例

```
base.json
  "1.0" → choices:
    A → next: "2.0-stg"   (range+2, enemy+2)
    B → next: "2.0-runner" (tempo+3)

stg-branch.json
  "2.0-stg" → choices:
    A → next: "3.0-stg-a"
    B → next: "3.0-stg-b"
  "3.0-stg-a" → choices: []  ← 収束（ジャンル確定）

runner-branch.json
  "2.0-runner" → ...
```

各ブランチは別ファイルに分けられる。`ManualLoader.ts` が `import.meta.glob` で全ファイルを自動収集し、`key` をマップキーとして統合する。

---

## バリデーション（開発時）

`ManualValidator.ts` が以下をチェックする（`PROD` ビルドでは無効）:

- `next` に存在しないキーを指定していないか
- 選択肢が0件または3件以上のエントリがないか
- 必須フィールドの欠如
- `genreParams` に未定義の GenreParam キーがないか
