# ジャンル確定後の説明書自動更新停止修正

## 概要

ジャンルが確定した後も説明書が更新され続ける問題を修正した。

## 問題の説明

ゲームプレイ中にベイズ収束システムによってジャンルが確定すると、`phase`が`'genreLocked'`に遷移する。
このフェーズではプレイヤーはゲームを続行するか、ギブアップ（説明書の投擲）によってエンディングに進むことができる。

しかし、`App.vue`のスナップショット監視ループ内で`triggerUpdate()`の呼び出し条件に`'genreLocked'`が含まれていたため、
ジャンル確定後もカード選択が自動で発生し、説明書が無限に更新され続けていた。

## 原因

`src/App.vue` 116行目:

```typescript
// 更新トリガー（tutorial / playing / genreLocked で発火）
const activePlay = ['playing', 'tutorial', 'genreLocked'].includes(gameState.phase.value)
```

`genreLocked`フェーズ中も`activePlay`が`true`になるため、`triggerUpdate()`が呼び出され、
`phase`が`'updating'`に遷移し、ChoicePanelが表示される状態になっていた。

## 修正内容

`activePlay`配列から`'genreLocked'`を削除した。

```typescript
// 更新トリガー（tutorial / playing のみ）
// genreLocked 後は triggerUpdate() を呼ばない（説明書の自動更新を止める）
const activePlay = ['playing', 'tutorial'].includes(gameState.phase.value)
```

## 動作変更

### 修正前

1. ジャンル確定 → `phase = 'genreLocked'`
2. スナップショットループが`triggerUpdate()`を呼び出し → `phase = 'updating'`
3. ChoicePanelが表示される
4. プレイヤーがカードを選択 → `phase = 'genreLocked'`（`choose()`が設定）
5. 2に戻る（無限ループ）

### 修正後

1. ジャンル確定 → `phase = 'genreLocked'`
2. `triggerUpdate()`は呼び出されない（`activePlay`が`false`）
3. ChoicePanelは表示されない
4. プレイヤーはギブアップボタンで投擲フェーズに進むか、ゲームを続行

## テスト

### ユニットテスト

`tests/unit/composables/useGameState.test.ts`:

- `MAX_ROUNDS` 回数選択すると`lockedGenre`が確定すること
- 確定後、`choose()`しても`phase`が`genreLocked`に保持されること
- 確定後、`roundCount`が増加すること（説明書テキスト追記は有効）
- 複数回のカード選択で`lockedGenre`が維持されること
- `restart()`で全状態が初期値に戻ることを検証

### Playwrightテスト

`tests/genre-lock-no-update.spec.ts`:

- ジャンル確定後、ChoicePanelが出現しないこと
- ジャンル確定後、ゲーム状態が正常に保持されること
- ジャンル確定後、ゲームがクラッシュせずに継続すること

## 影響範囲

- `src/App.vue`: 1行の変更（`activePlay`配列から`'genreLocked'`を削除）
- `useGameState.choose()`: 変更なし（`genreLocked`時の動作は既に正しかった）
- 他のコンポーネント: 影響なし
