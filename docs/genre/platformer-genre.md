# プラットフォームアクション（縦スクロール）ジャンル実装ドキュメント

## 概要

MANUAL-OVERRIDE ゲームに「縦スクロールプラットフォームアクション」ジャンルを追加しました。
横スクロールの面影を残したまま、重力・一方通行プラットフォーム・二段ジャンプ・溶岩上昇を
軸としたクライムアクション（Icy Tower / Doodle Jump 風）へと変貌します。
プレイヤーは上から降ってくるプラットフォームを二段ジャンプで駆け上がり、
下から上昇する溶岩から逃げ続けます。

## アーキテクチャ

### ファイル構成

```
src/
├── data/
│   ├── config/platformer.json        # プラットフォーム固有パラメータ（重力・溶岩・漂動）
│   └── genres/platformer.json        # ジャンル定義（収束閾値・features・スコア式）
├── genres/
│   └── PlatformerPlugin.ts           # 視覚テーマ（青空・雲、spawnTable 全 safe 化）
├── game/
│   ├── systems/
│   │   ├── PlatformerFeature.ts      # ゲームロジック（重力・着地・溶岩・漂動）
│   │   └── MovementFeature.ts        # 縦モード p.vy スキップガード（修正）
│   └── render/
│       └── PixelCanvas.ts            # 溶岩描画用（既存）
├── engine/
│   └── types.ts                      # MutableWorld（既存）
├── framework/
│   ├── config-types.ts               # PlatformerConfig インターフェース追加
│   └── ConfigValidator.ts            # RANGE_CHECKS 追加
├── data/
│   ├── tunables.ts                   # PLATFORMER 定数追加
│   └── gameBalance.ts                # PLAYER_PHYSICS 共有（既存）
└── plugins/
    └── SoundManager.ts               # onJump 共有（既存）

tests/
├── unit/game/PlatformerFeature.test.ts  # ユニットテスト（31 ケース）
└── platformer-vertical.spec.ts          # Playwright E2E

docs/genre/
├── platformer-genre.md              # このファイル
└── README.md                        # 索引に追加
```

## ジャンル収束条件

| パラメータ | 閾値 |
|-----------|------|
| `aerial`  | 5 以上 |
| `combo`   | 4 以上 |

両方のパラメータが閾値を超えるとプラットフォームアクションジャンルに収束します。
ベイズ収束システム（`bayes.json` のハイパーパラメータ）も併用され、
`aerial` 軸と `combo` 軸の乖離量から事後確率が計算されます。

### 収束パスの例

`starter-cards.json` の選択肢を通じて aerial / combo 軸が加算され、
閾値到達時にジャンル確定。横スクロールの面影を残しながら
「重力のある縦方向の登り」へとルールが書き換わります。

## ゲーム仕様

### 操作方法

| キー | 動作 |
|------|------|
| ← → | 水平移動（480px/s。platformer.json 固有の runSpeed） |
| Space | ジャンプ（二段ジャンプ対応。double_jump feature 有効時） |
| ↑ ↓ | 無効（縦モードの自由移動は platformer feature が握る） |

### 物理パラメータ

| 項目 | 値 | 出典 |
|------|----|------|
| 重力 | 1500 px/s² | `PLATFORMER.gravity` |
| ジャンプ初速 | -720 px/s | `PLAYER_PHYSICS.jumpVelocity`（両ジャンプとも同一） |
| 二段ジャンプ速度 | -720 px/s | `PLAYER_PHYSICS.jumpVelocity`（両ジャンプとも同一） |
| 端末速度 | 1200 px/s | `PLATFORMER.maxFallSpeed` |
| 水平速度 | 480 px/s | `PLATFORMER.runSpeed` |
| 着地バンド | 24 px | `PLATFORMER.platformLandingThreshold` |
| 溶岩上昇速度 | 15 px/s | `PLATFORMER.lavaRiseRate` |
| 溶岩初期位置 | 画面下端より 100px 下（`lavaStartOffset` だけ画面外、相対オフセット管理） | `PLATFORMER.lavaStartOffset` |
| 漂動振幅 | 60 px | `PLATFORMER.movingPlatformDriftAmp` |
| 漂動周波数 | 0.8 Hz | `PLATFORMER.movingPlatformDriftFreq` |

### 一方通行プラットフォーム着地

safe ハザードのみがプラットフォームとして機能。
着地は 2 方式で判定：

1. **swept（掃引）**: 前フレームのプレイヤー底辺がプラットフォーム頂上より上、
   現在底辺が頂上以下 → 本フレームに頂上を通過した
2. **banded（バンド）**: プレイヤー底辺が [頂上, 頂上 + 24px] の範囲内

swept 方式により、端末速度（1200px/s = 20px/frame）でも 24px バンドを
飛び越えて着地できます。

### スコア計算

```
distance * 0.8 + survivedSec * 5
```

**注意**: 全ハザードが safe 化されており `near_miss_combo` が無効のため、
`maxCombo` 項は廃止。distance 項は縦モードでもスクロール距離として計算されます。

### スコア式各項の意味

- `distance * 0.8`: 移動距離ボーナス（縦スクロールの進行距離）
- `survivedSec * 5`: 生存時間ボーナス

## 設定パラメータ（platformer.json）

| キー | 既定値 | 内容 |
|------|--------|------|
| `gravity` | 1500 | 重力加速度（px/s²） |
| `runSpeed` | 480 | 水平移動速度（px/s）。フルウィンドウ幅対応のため PLAYER_PHYSICS.runSpeed(240) より高速 |
| `maxFallSpeed` | 1200 | 落下速度の上限（px/s）。swept 着地判定の安全域確保 |
| `lavaRiseRate` | 15 | 溶岩上昇速度（px/s） |
| `lavaStartOffset` | 100 | 溶岩初期位置の canvas 下端からの距離（px、下端より下=オフスクリーン）。縦モードに床がないためプレイヤーは下端で静止し、このオフセットが最初のプラットフォーム到達（約3.1秒）までの猶予（= lavaStartOffset / lavaRiseRate ≈ 6.7秒）となる |
| `lavaHeight` | 60 | 溶岩描画の高さ（px）。グロー/熱帯の基準 |
| `lavaColor` | `#ff4400` | 溶岩本体の色 |
| `lavaGlowColor` | `#ffaa00` | 溶岩表面の明線色 |
| `platformLandingThreshold` | 24 | 着地バンドの幅（px）。頂上からの許容スナップ距離 |
| `movingPlatformDriftAmp` | 60 | 漂動の振幅（px）。sin 波の最大横ずれ |
| `movingPlatformDriftFreq` | 0.8 | 漂動の周波数（Hz）。sin 波の角速度 |

## 実装上の注意点

1. **preUpdate 実行順序 = enableFeatures 配列の順序**
   `getActiveSystems` は `RuntimeRules.features`（Set）を反復してシステムを返す。
   `buildRuntimeRules` での構築順序は `[...genre.enableFeatures]` → `movement` → 履歴。
   したがって `platformer` を `enableFeatures` **末尾**に置くことで、
   PlatformerFeature.preUpdate が MovementFeature.preUpdate より後に実行され、
   重力積分が MovementFeature の自由移動 vy 設定に上書きされない。

2. **MovementFeature の p.vy スキップガード**
   縦モード（`scrollAxis === 'y'`）では MovementFeature が毎フレーム p.vy を
   自由移動値（moveUp/moveDown）で上書きする。`r.features.has('platformer')` の
   ときだけこの代入をスキップし、p.vy を PlatformerFeature の重力積分が独占する。

3. **onInit は実行時に呼ばれない + firstInit / _lastPlayer パターン**
   エンジンが呼ぶのは `onManualUpdated`（updateRules 時）と `onDisable` のみ。
   `onManualUpdated` で `firstInit` フラグまたは `_lastPlayer !== world.player`
   （新ゲーム検出）をチェックし、初回または新ゲームのみ `onInit` を実行する。
   同一ゲーム中の説明書更新では lavaY を保持し続ける（#179 型バグ回避）。

4. **Feature は GameRegistry 上のシングルトン**
   各 `SideScroller`（ゲーム毎）で feature インスタンスを共有するため、
   `world.player` のインスタンス同一性で新ゲームとプレイ中を区別する。

5. **着地固定（carry-while-standing）**
    プラットフォームに着地すると、プレイヤーがプラットフォームに固定される。
    プラットフォームが下降してもプレイヤーの底辺はプラットフォームの頂上に
    スナップされ、一緒に下降する。ジャンプまたは水平移動でプラットフォームから
    外れると固定が解除される。これにより、接地中の微小振動が完全に解消される。

6. **頭上スナップ（最大 24px）**

7. **頭上スナップ（最大 24px）**
   プラットフォームがプレイヤー頭上を通過する際、底辺がバンド内（0〜24px 頭上）に
   入るとプレイヤーが最大 24px 上にスナップする。拾い上げ効果として許容。

8. **genre `gravity: 1600` vs `PLATFORMER.gravity: 1500` の乖離**
   platformer.json の `gravity: 1600` は横モード / updateRules 用の値。
   縦モードの実効重力は `PLATFORMER.gravity`（1500）が正。
   両者の違いはドキュメントのみでコード上は別々に使われる。

9. **スポーン間隔の導出**
   縦モードでは `_spawnHazard` が全ハザードを画面上端から出現させる。
   実効間隔 = `spawnDensity.interval(ms) / 1000 × scrollSpeed(px/s)`。
   基準（300px/s, 550ms）= 165px/個（maxGapY 170 内）。

10. **溶岩描画の薄い要素は rgba 直接**
    `PixelCanvas.withAlpha` は alphaSteps=8 で量子化（0.0625 未満は消える）。
    溶岩グロー等の薄い要素は `rgba(...)` 色文字列を直接 `px.rect` に渡す。

## テスト

### ユニットテスト（`tests/unit/game/PlatformerFeature.test.ts`）

31 ケース全テスト通過:

| # | テスト | 結果 |
|---|--------|------|
| 1 | onInit: lavaSurfaceGap 初期値（画面下端からの相対オフセット） | ✅ PASS |
| 2 | onInit: prevBottom 初期値 | ✅ PASS |
| 3 | preUpdate: 重力積分（累積） | ✅ PASS |
| 4 | preUpdate: 重力積分（端末速度クランプ） | ✅ PASS |
| 5-7 | preUpdate: 水平移動（右 / 左 / 無入力） | ✅ PASS |
| 8 | preUpdate: ジャンプ（接地、jumpsLeft リセット） | ✅ PASS |
| 9 | preUpdate: 二段ジャンプ（空中） | ✅ PASS |
| 10 | preUpdate: ジャンプしない（jumpsLeft=0 且つ非接地） | ✅ PASS |
| 11 | preUpdate: ジャンプ時に addJump で統計記録 | ✅ PASS |
| 12 | update: 着地（バンド内） | ✅ PASS |
| 13 | update: 着地（swept 高速落下） | ✅ PASS |
| 14 | update: 上昇中は通過 | ✅ PASS |
| 15 | update: 水平非重なりで着地しない | ✅ PASS |
| 16 | update: 着地固定（carry-while-standing、60 フレーム接地維持） | ✅ PASS |
| 17 | update: ジャンプで着地固定解除 | ✅ PASS |
| 18 | update: 溶岩上昇（lavaSurfaceGap 減少） | ✅ PASS |
| 19 | update: 溶岩衝突で即死（1 回のみ） | ✅ PASS |
| 20 | update: 溶岩が画面外（gap>=0）では死亡しない | ✅ PASS |
| 21 | update: 溶岩猶予（画面底辺静止 → gap=0 まで約 6.67s 生存） | ✅ PASS |
| 22 | update: 溶岩が上昇して gap=0 で死亡 | ✅ PASS |
| 23 | onManualUpdated: 同一 player で溶岩位置保持 | ✅ PASS |
| 24 | onManualUpdated: 新 player で初期化 | ✅ PASS |
| 25 | onDisable: 状態リセット | ✅ PASS |
| 26-28 | feature 非アクティブ（preUpdate / update / render） | ✅ PASS |
| 29 | render: 可視範囲（gap<0）で本体色 + 表面明線を描画 | ✅ PASS |
| 30 | render: オフスクリーン（gap>=0）では描画しない | ✅ PASS |
| 31 | render: 例外を投げない | ✅ PASS |

### Playwright E2E テスト（`tests/platformer-vertical.spec.ts`）

- デバッグパネルで `forceGenre: platformer` を設定しゲーム開始
- キー入力（← → Space）でのクラッシュなし
- スクリーンショット: プラットフォーム（黄色 safe rect）・溶岩（橙赤）
- コンソールエラーなし

## 実装経緯

- `feature/platformer-genre` ブランチで実装
- 既存の横スクロール platformer 定義（青空・雲テーマ）は視覚テーマとして維持
- `scrollDirection: vertical` + 新 Feature `platformer` で挙動を完全に書き換え
- 既存の `platformer.json` ジャンル定義に `scrollDirection` と `spawnDensity` を追加
- `platformer` を enableFeatures 末尾に追加（preUpdate 順序要件のため）

## レビュー履歴

### Iteration 1 (実装時)
- 設計書と実装の整合性を確認（preUpdate 順序、MovementFeature guard、firstInit/lastPlayer）
- ユニットテスト全通過を確認

### Iteration 2 (レビュー修正)
レビューサブエージェントが 1 HIGH / 3 MEDIUM / 9 LOW を指摘。すべて修正済み:
- **[HIGH] wall_jump 無制限ジャンプ漏れ**: 縦モードでは壁ジャンプのトリガー領域（`x >= 0.38·W`）が画面右 62% をカバーし、空中で無限ジャンプ可能（唯一の死因である溶岩が無効化）→ `enableFeatures` から `wall_jump` を削除
- **[MEDIUM] 着地 bob**: 着地後 ~0.38s / ~27px の浮遊再スナップ → carry-while-standing（`standingOn` で固定、毎フレーム再スナップ）を実装
- **[MEDIUM] ジャンプ統計未記録**: `MutableWorld.addJump()` API を追加し、feature のジャンプ分岐で呼ぶ（play-style 判定・説明書更新の `firstJumpDone` に反映）
- **[MEDIUM] near_miss_combo 不活性 + 死スコア項**: `enableFeatures` から `near_miss_combo` を削除、`scoreFormula` から `maxCombo * 150` 項を削除
- **[LOW] リサイズ安全**: 溶岩位置を画面下端からの相対オフセット（`lavaSurfaceGap`）で管理（絶対 Y の `lavaY` から変更）
- **[LOW] その他**: 未使用設定（platformMinGapY/MaxGapY）削除、溶岩描画比率の定数化、`_lastPlayer`→`lastPlayer` 改名、ドキュメント修正
- テスト 31 ケース全通過（carry / addJump / 溶岩猶予 / render を追加）

## 今後の改善候補

- **コンベヤベルト**: プラットフォーム上で左右に動くベルト（移動速度ブースト）
- **バネ**: ジャンプ力を増幅するプラットフォーム
- **高さによる背景テーマ変化**: 上昇するにつれて空→雲→宇宙へ背景が変化
- **雲の垂直方向スクロール**: 縦モードで雲がゆっくり下降する視差効果
- **danger プラットフォーム**: safe ハザード以外の危険ハザードを追加し near_miss / コンボを有効化（現在は全 safe で溶岩のみ死因）
- **ドラッグ&ドロップ投擲フェーズ**: 説明書 UI をドラッグして投げるギミック
- **BGM 対応**: platformer.json に bgm セクションを追加
- **溶岩の視覚的演出**: パーティクル・シェイク・画面赤めき
- **二段ジャンプの空中制御**: 空中で ← → の移動効率が地上と異なる
