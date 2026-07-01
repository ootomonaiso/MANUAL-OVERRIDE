# 段階的テーマ遷移機能

## 概要

説明書パネルが、収束前のジャンルテーマに向かって段階的に変化していく機能です。
ベイズ収束の進捗率（0.05〜0.98）に応じて、以下の変化が適用されます：

1. **色補間**: plain（緑ターミナル）から目標ジャンルのテーマカラーへ線形補間
2. **ルール補間**: ver 1.0 の features から目標ジャンルの features へ段階的遷移
3. **テキスト補間**: ver 1.0 の説明文本から目標ジャンルの説明文本へ切り替え
4. **フォント切替**: 収束進捗 50% で目標ジャンルのフォントに切り替え

## 動作原理

### 1. 進捗率の計算

`resolveGenreProgress()` が返す `progress` 値（最大事後確率、0〜1）を使用します。

### 2. 補間範囲

- `progress < 0.05`: 補間非活性（plain 表示）
- `0.05 <= progress < 0.99`: 補間活性（線形補間適用）
- `progress >= 0.99`: 補間非活性（目標テーマ完全適用）

### 3. 色補間

JS で RGB 値を lineargRGB 補間し、CSS custom properties として適用します。

```
--blend-bg:      rgb(補間後の背景色)
--blend-color:   rgb(補間後の文字色)
--blend-border:  rgb(補間後の枠線色)
--blend-shadow:  rgb(補間後の影色)
```

CSS 側は `var(--blend-*, fallback)` で参照し、fallback 値として plain テーマの色を指定しています。

### 4. ルール補間（features）

`progress` に応じて、ver 1.0 の features から目標ジャンルの features へ段階的に遷移します。

- `progress < 0.3`: ver 1.0 の features のみ
- `0.3 <= progress < 0.7`: ver 1.0 + 目標ジャンルの features をマージ
- `progress >= 0.7`: 目標ジャンルの features 完全適用

### 5. テキスト補間

`progress` に応じて、ver 1.0 の説明文本から目標ジャンルの説明文本へ切り替えます。

- `progress < 0.5`: ver 1.0 のテキストを完全表示
- `progress >= 0.5`: 目標ジャンルのテキストを完全表示

### 6. フォント切替

`font-family` は文字列プロパティのため補間できません。
`progress >= 0.5` で目標ジャンルのテーマクラス（`.theme-stg` 等）を適用し、フォントを切り替えます。

## 構成ファイル

| ファイル | 役割 |
|---------|------|
| `src/domain/genreBlend.ts` | 色補間ロジック（`computeGenreBlendStyle`, `isBlendActive`, `computeFeaturesBlend`, `computeTextBlend`） |
| `src/App.vue` | 進捗率計算、`genreBlendStyle`/`blendedFeatures`/`blendedManualText` 計算プロパティ |
| `src/components/ManualPanel.vue` | CSS custom properties の適用、transition 設定 |
| `src/components/ChoicePanel.vue` | 収束前ジャンルのヒント表示 |

## 設定

### 補間先テーマカラー

`src/domain/genreBlend.ts` の `GENRE_THEME_COLORS_BLEND` で定義しています。
各ジャンルの代表色（bg, color, border, shadow）を hex 値または rgba 値で指定します。

### 閾値

- 補間開始: `0.05`
- 補間終了: `0.99`
- フォント切替: `0.5`

これらは `isBlendActive()` 関数内でハードコードされていますが、将来的に JSON 化可能です。

## テスト

### ユニットテスト

```bash
npx tsx tests/genreBlend.test.ts
```

- `computeGenreBlendStyle` の境界値（0, 0.5, 1, 負数，1 超）
- `isBlendActive` の閾値動作
- `computeFeaturesBlend` の境界値（0.2, 0.5, 0.8）
- `computeTextBlend` の境界値（0.4, 0.6）
- 全テーマの網羅性

### Playwright テスト

```bash
npx playwright test tests/theme-transition.spec.ts --project=chromium
```

- ManualPanel に transition が設定されている
- blend CSS custom properties が存在する

## 将来の拡張

- 補間アルゴリズムの変更（線形以外に ease-in-out 等）
- シャドウの alpha 値も補間対象に追加
- ジャンルテーマカラーの JSON 外部化
- 補間速度のユーザー設定
- features 補間の細分化（各 feature ごとに異なる遷移タイミング）
- テキスト補間の段階化（完全切り替えではなく、行単位で混在表示）
