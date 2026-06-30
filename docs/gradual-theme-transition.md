# 段階的テーマ遷移機能

## 概要

説明書パネルが、収束前のジャンルテーマに向かって段階的に色変化していく機能です。
ベイズ収束の進捗率（0.05〜0.98）に応じて、plain（緑ターミナル）から目標ジャンルのテーマカラーへ線形補間します。

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

### 4. フォント切替

`font-family` は文字列プロパティのため補間できません。
`progress >= 0.5` で目標ジャンルのテーマクラス（`.theme-stg` 等）を適用し、フォントを切り替えます。

## 構成ファイル

| ファイル | 役割 |
|---------|------|
| `src/domain/genreBlend.ts` | 色補間ロジック（`computeGenreBlendStyle`, `isBlendActive`） |
| `src/App.vue` | 進捗率計算、`genreBlendStyle` 計算プロパティ |
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
