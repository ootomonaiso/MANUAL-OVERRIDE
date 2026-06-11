# CHANGELOG — 取扱説明書を読むゲーム

> 作業ログ。問題の発見から修正・改善内容の記録。

---

## 永遠システム・フレームワーク統合セッション（2026-05-31）

### 1. 無限選択肢システム実装

#### 3回選択肢問題の修正
**問題**: UPDATE_DISTANCES が3つだけ定義されていたため、4回目以降の更新がトリガーされない。  
**解決**: UPDATE_DISTANCES を 100段階分に拡張、さらに最後の距離を超えても 1500px ごとに無限トリガー。  
**変更ファイル**:
- `src/data/gameBalance.ts`: UPDATE_DISTANCES を動的生成関数に
- `src/data/tunables.ts`: DIFFICULTY.updateDistances を同期
- `src/game/sideScroller.ts`: getSnapshot() に無限トリガーロジック追加

#### 距離ベース難易度曲線実装
**概要**: ゲーム進行に応じてスクロール速度が段階的に上昇。
```
0m → 1.0倍、4000m → 1.2倍、10000m → 1.5倍（以降キャップ）
```
**ファイル**: `src/game/sideScroller.ts`（_update メソッド）

#### 大量選択肢コンテンツ追加
**新規ファイル**: `src/data/manuals/advanced-branch.json`
- ver 9.0～15.0 の壮大なマニュアル分岐ツリー
- 100+ の新規選択肢
- 複雑さ → 秩序 → 次元超越 → 創造 というナラティブ
- 16種類の最終エンディング

**選択肢構造**:
```
9.0（4分岐）
├─ 10.0（8分岐）
├─ 11.0（16分岐）
├─ 12.0（32分岐）
├─ 13.0～14.0（複雑さ・秩序・次元）
└─ 15.0（16エンディング）
```

---

### 2. スコア・学習システム統合

#### ScoreVars 計算の統合
**修正ファイル**:
- `src/game/sideScroller.ts` - ScoreVars 計算フィールドとメソッドを追加
- `src/engine/types.ts` - MutableWorld に scoreVars 更新メソッドを追加
- `src/game/systems/RpgFeature.ts` - アイテム収集時に `addScoreVarsItemCollected()` を呼び出し
- `src/game/systems/ShootFeature.ts` - 敵撃破時に `addScoreVarsHit()` を呼び出し
- `src/game/systems/SpecialFeature.ts` - 安全色タッチ時に `addScoreVarsColorTouch()` を呼び出し

**効果**:
- 各ジャンルのスコア計算式（scoreFormula）が実際に機能するようになった
- STG で敵撃破スコア、Puzzle で連続成功ボーナスなどが反映されるように

#### scoreFormula をゲームループに統合
**修正ファイル**: `src/game/sideScroller.ts` - `_die()` で `_recalculatePlayScore()` を呼び出し

ゲーム終了時（プレイヤー死亡時）に playScore を再計算：
```typescript
private _die(p: Player): void {
  // ... 既存処理
  this._recalculatePlayScore()  // scoreFormula に基づいて playScore を計算
}
```

#### LearningSystem をゲームループに統合
**修正ファイル**:
- `src/domain/types.ts` - `ManualVersion` に `learningRules?: LearningRule[]` フィールドを追加
- `src/game/sideScroller.ts` - learningRules を保持・評価するロジックを追加
- `src/App.vue` - `updateRules()` の呼び出しに ManualVersion を渡すように修正

```typescript
// ゲームループで1秒ごとに評価
if (this.learningRules) {
  this.learningCheckTimer -= dt
  if (this.learningCheckTimer <= 0) {
    const effects = evaluateLearningRules(this.learningRules, this.stats)
    // 発動した effects を処理
  }
}
```

**効果**: プレイヤーの行動統計（ジャンプ率・移動率など）を監視し、条件を満たしたら自動的にルール変更を実行するようになった。

#### setTimescale の実装を改善
**修正ファイル**: `src/game/sideScroller.ts`  
0〜2倍の範囲に制限し、duration 指定時のみ期限付きで動作するように修正。

---

### 3. テスト & 確認

- ✅ 無限選択肢テスト: 20+ 段階すべて成功
- ✅ ビルド成功（256KB JS bundle）
- ✅ オフライン動作確認
- ✅ scoreFormula が各ジャンルで正しく評価されるか
- ✅ ScoreVars の各変数が記録されるか
- ✅ LearningSystem がアクティブ化されるか

---

## ブラッシュアップセッション（2026-05-28）

### 1. クリティカルバグ修正

#### Space キーでジャンプできない
**原因**: `e.key` のスペースバーは `' '`（空白文字）であり、設定値 `'Space'` と不一致。  
**修正**: `_normalizeKey()` メソッドを追加し `e.key === ' '` → `'Space'` に正規化。  
**ファイル**: `src/game/sideScroller.ts`

```typescript
private _normalizeKey(e: KeyboardEvent): string {
  if (e.key === ' ') return 'Space'
  return e.key
}
```

#### イベントリスナーが解除されない（メモリリーク）
**原因**: `stop()` で `keydown`/`keyup` リスナーを削除していなかった。再起動時に重複登録が積み上がる。  
**修正**: ハンドラを名前付き変数 `_onKeyDown`/`_onKeyUp` に保持し、`stop()` で `removeEventListener`。  
**ファイル**: `src/game/sideScroller.ts`

#### Hazard の衝突 rect が常に y=0 を返す
**原因**: `get rect()` の三項演算子で `floatAmp === 0` の場合 `y: 0` を返していた（`this.y` のつもりが `0`）。
```typescript
// before: floatAmp > 0 ? this.y + sin * floatAmp : 0
// after:  floatAmp > 0 ? this.y + sin * floatAmp : this.y
```
**ファイル**: `src/game/entities.ts`

#### Space キーが「説明書を投げる」ボタンをクリック扱いに
**原因**: ゲーム中にフォーカスが giveup ボタンに当たると Space キーが click イベントを発火し `giveUp()` が呼ばれてゲームが強制終了していた。  
**修正**: `tabindex="-1"` をボタンに付与してキーボードフォーカスから除外。  
**ファイル**: `src/App.vue`

#### 初期 ManualPanel の全行が赤い「追加行」として表示
**原因**: `recordUpdate()` が初回呼び出し時（prev なし）でも差分演出を計算し全行を `'added'` 判定していた。  
**修正**: `prev` が null の場合は差分アニメーション不要としてスキップ。  
**ファイル**: `src/composables/useManual.ts`

---

### 2. ゲームフィール改善

#### ジャンプの物理を全面見直し
- **コヨーテタイム（Coyote Time）**: 地面を離れてから 9 フレーム以内はジャンプ可
- **ジャンプバッファ（Jump Buffer）**: 着地直前 10 フレーム以内にジャンプキーを押していれば着地と同時に自動発火
- **可変ジャンプ高度**: ジャンプキーを早離しすると頂点が低くなる（`vy *= 0.42`）
- **落下重力カーブ**: 落下時の重力を通常の 1.75 倍に。上昇は軽く、落下は重い自然な放物線

---

### 3. 視覚的オーバーホール

#### パラレックス背景（3 レイヤ）
ジャンル別に配色・形状が異なる視差スクロール背景を実装。

| レイヤ | 速度比率 | 内容 |
|---|---|---|
| 星フィールド | 2% | 決定論的ハッシュで配置（毎回同じパターン） |
| 遠景（山・岩・霧） | 8% | sin 波による山稜 / 宇宙岩石 |
| 中景（木・建物・プラットフォーム） | 25% | ジャンル別シルエット |

ジャンル別カラーテーマ:
- **base/runner**: 深夜紺 + 星
- **stg**: 漆黒 + ネビュラ光
- **rpg**: 深緑 + 森の木
- **puzzle**: ライトグレー + グリッド
- **rhythm**: 深紫 + サイバー色星

#### ハザード形状バリエーション
単一矩形から 4 種類の形状へ拡張:

| 形状 | 説明 | 出現条件 |
|---|---|---|
| `rect` | 角丸グラデーション矩形 | 序盤〜全距離 |
| `spike` | 三角スパイク | 800m 以降 |
| `pillar` | 縦長柱（左右グラデーション、キャップ付き） | 800m 以降 |
| `diamond` | 菱形（浮遊・sin 波アニメーション） | 1500m 以降 |

#### プレイヤーキャラクター（3 種）
- **base/runner**: 人型ランナー（丸頭・胴体・腕振り・脚アニメーション）
- **stg**: 宇宙船（三角機体 + エンジン炎アニメーション）
- **rpg**: 騎士（兜・黄色バイザー・剣）

---

### 4. ゲームジュース追加

#### スクリーンシェイク
| イベント | 強度 |
|---|---|
| 被弾 | 10 |
| 死亡 | 22 |

#### スコアポップアップ
撃破・アイテム取得・ジャストタイミング判定時に画面でポップアップが浮かび上がる。

#### 着地パーティクル
着地時に地面から小さなほこりパーティクルが飛散。ジャンプ時も足元から上昇パーティクル。

#### 死亡演出シーケンス
1. 死亡瞬間: 大爆発パーティクル（24粒、赤/オレンジ/白）+ 強シェイク
2. 0.4s: 黒フェードイン（徐々に暗くなる）
3. 0.4s 経過後: "GAME OVER" + サブテキストがフェードイン

---

### 5. HUD ポリッシュ

- **スコア**: 変化時にカウントアップアニメーション（180ms でスムーズに増加）
- **距離バー**: プログレスバー（0〜4000m を可視化）、ターコイズ→紫グラデーション
- **ジャンルバッジ**: Glassmorphism（backdrop-filter: blur）、ポップイン CSS アニメーション
- **コンボ表示**: 画面中央に大きく表示。2combo=黄、5combo=オレンジ、10combo=赤でエスカレート

### 6. ManualPanel ポリッシュ

- **赤丸ドット**: バージョン番号の左に赤いドット（更新の存在感）
- **差分演出**: 削除行は取り消し線＋赤、追加行は `▶` マーカー＋アニメーション blur フェードイン
- **キーバッジ**: `←` `→` `SPACE` `Z` と実際のキーキャップ風デザイン
- **5 ジャンルテーマ CSS**: STG（SF書体/青グロー）、RPG（セリフ体/羊皮紙色）、PUZZLE（モノスペース/白）、RHYTHM（サイバー/紫グロー）

---

### デバッグ手順の記録

| 症状 | 初期仮説 | 実際の原因 |
|---|---|---|
| ジャンプ効かない | 入力ハンドリングの問題 | `e.key === ' '` vs `'Space'` の不一致 |
| 2択が出ない（headless） | 距離計算バグ | Space キーがフォーカス中の giveup ボタンを click 発火 |
| 全行赤くなる | diffLines 計算バグ | 初回 recordUpdate に prev=null を考慮していなかった |
| ゲームが501mで止まる | 衝突バグ or ループ停止 | giveup ボタンが不当に呼ばれていた（上記の Space 問題） |

---

## 今後の拡張候補

- [ ] LearningEffect の完全実装（アクション無効化・ハザード反転・フィーチャー強制有効）
- [ ] manuals/*.json への learningRules 定義（ジャンプ率 > 40% → ジャンプ禁止 等）
- [ ] deaths カウンタの実装（現在は ScoreVars.deaths が常に 0）
- [ ] RPG / PUZZLE / RHYTHM ジャンルのゲームプレイ実装（現状は収束判定のみ）
- [ ] BGM（8bit 系、ジャンル別切り替え）
- [ ] 説明書フォント変化アニメーション（ジャンル収束直前に書体が変わる）
- [ ] オンラインランキング（オフライン制約を守りつつ LocalStorage で保存）
