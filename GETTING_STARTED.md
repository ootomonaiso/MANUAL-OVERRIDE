# 開発者向けセットアップガイド

このドキュメントは、新規開発者がプロジェクトに参加する際の最小手順を示します。

## 環境セットアップ

### 前提条件
- Node.js 18+
- npm

### インストール＆起動

```bash
# 1. リポジトリをクローン
git clone <repo>
cd <repo>

# 2. 依存関係をインストール
npm install

# 3. 開発サーバー起動
npm run dev
# → http://localhost:5173 で起動

# 4. ビルド（本番）
npm run build
# → dist/ に静的ファイル生成
```

## プロジェクト構成（5分で理解する）

```
src/
  components/       Vue UI パーツ（Hud, ManualPanel, ChoicePanel など）
  game/            Canvas ゲーム本体（sideScroller.ts）
  domain/          ビジネスロジック（型定義、ルール計算、スコア計算）
  data/            ゲームデータ（ジャンル定義、説明書、バランス定義）
  genres/          ジャンル別プラグイン（STG, RPG など）
  plugins/         拡張システム（PluginManager）
```

### 核となる 3つのファイル

| ファイル | 役割 |
|---------|------|
| src/game/sideScroller.ts | Canvas ゲームループ・物理エンジン・衝突判定 |
| src/domain/genreResolver.ts | 選択パラメータの蓄積 → ジャンル判定 |
| src/composables/useGameState.ts | フェーズ管理・状態ハブ |

## よくある作業フロー

### 新しいジャンルを追加する

1. ジャンル定義を追加 (src/data/genres.ts)
   ```typescript
   {
     id: 'my_new_genre',
     label: 'My Genre',
     thresholds: { tempo: 5, enemy: 3 },
     // ...
   }
   ```

2. プラグインを実装 (src/genres/MyNewGenrePlugin.ts)
   ```typescript
   export class MyNewGenrePlugin extends GenrePluginBase {
     readonly id = 'my_new_genre'
     readonly skyColors = ['#000080']
     // ... 描画ロジックをオーバーライド
   }
   ```

3. プラグインを登録 (src/genres/index.ts)
   ```typescript
   registerGenre(new MyNewGenrePlugin())
   ```

詳細: [docs/genre-plugin.md](./docs/genre-plugin.md)

### 新しいフィーチャーを追加する

1. FeatureId 型を拡張 (src/domain/types.ts)
2. System を実装 (src/game/systems/MyFeature.ts)
3. 登録 (src/game/systems/index.ts)

詳細: [docs/feature-system.md](./docs/feature-system.md)

### 説明書ルートを追加する

1. JSON ファイルを追加 (src/data/manuals/my-route.json)
   ```json
   {
     "id": "X.Y",
     "entries": [
       {
         "key": "X.Y",
         "version": "X.Y",
         "manualText": ["..."],
         "choices": [...]
       }
     ]
   }
   ```

コード修正は不要です。JSON を追加するだけで自動認識されます。

詳細: [docs/manual-json.md](./docs/manual-json.md)

## テスト実行

```bash
# Playwright 統合テスト
npx playwright test

# 無限選択肢テスト（スクリプト実行）
node test_massive_choices.mjs
```

## 重要な設計原則

1. JSON ドリブン - すべてのルール定義は JSON で管理
2. プラグイン設計 - 新機能追加時にコア修正は避ける
3. 型安全 - TypeScript で全型定義
4. オフライン完全 - 外部 API 不要、dist 内自己完結

## トラブルシューティング

### npm run dev がうまくいかない
```bash
rm -rf node_modules package-lock.json
npm install
npm run dev
```

### ビルド後、dist が空っぽ
```bash
npm run build
# dist/ が生成されているか確認
ls dist/
```

### Canvas がレンダリングされない
1. ブラウザコンソールでエラーを確認
2. src/App.vue の canvas ref が正しくマウントされているか確認

## 次のステップ

- アーキテクチャ全体図: [docs/README.md](./docs/README.md)
- コアシステムの実装詳細: [docs/core-systems.md](./docs/core-systems.md)
- 各ドキュメント: [docs/](./docs/)
- 詳細な設計書: [docs/DESIGN_ARCHIVED.md](./docs/DESIGN_ARCHIVED.md)（参考資料）

---

質問や問題があれば、GitHub Issues で報告してください。
