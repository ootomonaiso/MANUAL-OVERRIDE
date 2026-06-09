# `src/engine/` — プラグインシステム

ジャンルプラグインと Feature システムのインターフェースと中央レジストリ。

---

## `GenrePlugin.ts`

ジャンルプラグインのインターフェース。「見た目・スポーン・ジャンル固有のアップデート」を1クラスに集約。

### インターフェース `GenrePlugin`

| プロパティ/メソッド | 概要 |
|---|---|
| `id: GenreId` | ジャンルID（必須） |
| `skyColors: [string, string]` | 空グラデーション [上端, 下端]（必須） |
| `groundColors: [string, string]` | 地面グラデーション [上端, 下端]（必須） |
| `farLayerColor: string` | 遠景塗り色（必須） |
| `midLayerColor: string` | 中景塗り色（必須） |
| `starColor?: string` | 星フィールド色（undefined = 非表示） |
| `palette: { danger, dangerGlow, safe, safeGlow }` | ハザードパレット（必須） |
| `spawnTable: SpawnEntry[]` | ハザードスポーンテーブル（必須） |
| `parallax?: { stars?, far?, mid? }` | 視差スクロール係数 |
| `starConfig?: { density?, sizeRange?, alphaRange? }` | 星フィールドカスタマイズ |
| `hazardConfig?: { glowBlur?, pulseSpeed?, pulseAmplitude? }` | ハザード演出カスタマイズ |
| `playerScale?: number` | プレイヤー描画スケール（デフォルト 1.0） |
| `particleColors?: { jump?, land?, hit?, death? }` | パーティクル色上書き |
| `groundLineAlpha?: number` | 地面ライン透明度 |
| `groundDashAlpha?: number` | 地面ダッシュ模様透明度 |
| `scrollSpeedBonus?: number` | スクロール速度ボーナス px/s |
| `drawFarLayer(ctx, offsetX, W, gY)` | 遠景描画（必須） |
| `drawMidLayer(ctx, offsetX, W, gY)` | 中景描画（必須） |
| `drawPlayer(ctx, w, h, onGround, runCycle)` | プレイヤー描画（必須） |
| `onGenreLocked?(world)` | ジャンル確定時フック |
| `onUpdate?(world, dt)` | 毎フレームフック |
| `drawHazard?(ctx, hazard, sx, world)` | ハザード描画フック（true = デフォルトスキップ） |
| `drawForeground?(ctx, offsetX, W, H, gY)` | 前景レイヤー描画 |
| `drawGenreHUD?(ctx, world, W, H)` | ジャンル固有 HUD 描画 |
| `onPlayerJump?(world)` | ジャンプ時フック |
| `onPlayerLand?(world)` | 着地時フック |
| `onHazardDestroyed?(world, hazard)` | ハザード撃破時フック |
| `onManualUpdated?(world, versionKey)` | 説明書更新時フック |

---

## `GenrePluginBase.ts`

すべてのジャンルプラグインが継承できる抽象基底クラス。

### 抽象クラス `GenrePluginBase`

`GenrePlugin` を実装。オプショナルフックに no-op デフォルトを提供。サブクラスは必須フィールドと `drawFarLayer` / `drawMidLayer` / `drawPlayer` のみを実装すればよい。

---

## `FeatureSystem.ts`

Feature システムのインターフェース。特定の Feature フラグが有効なときだけ動くゲームメカニクスを1クラスに封じ込める。

### インターフェース `FeatureSystem`

| プロパティ/メソッド | 概要 |
|---|---|
| `handles: FeatureId \| FeatureId[]` | 担当する FeatureId（複数可） |
| `preUpdate?(world, input, dt)` | 物理計算前の更新（移動系が vx をセット） |
| `update(world, input, dt)` | 毎フレーム更新（必須） |
| `render?(ctx, world)` | Canvas 追加描画 |
| `onInit?(world)` | ジャンル確定時初期化 |
| `onPlayerHit?(world)` | 被弾時フック |
| `onSafeHazardTouch?(world, hazard, screenX)` | 安全色接触時フック |
| `onPlayerDeath?(world)` | 死亡時フック |
| `onManualUpdated?(world, versionKey)` | 説明書更新時フック |
| `onComboChange?(world, combo)` | コンボ変化時フック |
| `onItemPickup?(world, itemType)` | アイテム取得時フック |
| `onBossSpawn?(world)` | ボススポーン時フック |
| `onPlayerJump?(world)` | ジャンプ時フック |

---

## `GameRegistry.ts`

ジャンルプラグインと Feature システムの中央レジストリ。

### エクスポート関数

| 関数 | 概要 |
|---|---|
| `registerGenre(plugin: GenrePlugin): void` | ジャンルプラグインを登録 |
| `registerFeature(system: FeatureSystem): void` | Feature システムを登録（handles が配列の場合は各IDに登録） |
| `getGenre(id: GenreId): GenrePlugin` | ジャンルプラグインを取得（見つからない場合は base にフォールバック） |
| `getActiveSystems(active: ReadonlySet<FeatureId>): FeatureSystem[]` | active な Feature に対応するシステムを返す（重複なし） |
| `debugPrint(): void` | 登録状況をコンソール出力 |
| `devValidateRegistry(allFeatureIds: FeatureId[]): void` | 未登録の FeatureId を検出して警告（開発時） |

---

## `types.ts`

ゲームエンジンのコア型定義。

### インターフェース

| 型 | 概要 |
|---|---|
| `GameStats` | ゲーム統計 (`kills`, `combo`, `maxCombo`, `beatHits`, `beatHazardInverted`) |
| `MutableWorld` | システム・プラグインがフレームごと受け取るコンテキスト。プレイヤー/ハザード/アイテムの参照、スコア/パーティクル/ワールド操作、統計書き込みなどを含む |
| `InputSnapshot` | 1フレーム分の入力状態 (`keys`, `justPressed`, `justReleased`) |
| `SpawnEntry` | ハザード出現テーブルの1行 (`shape`, `placement`, `weightStart`, `weightEnd`, `wRange`, `hRange`, `safeChance?`, `hpOverride?`, `floatAmpRange?`, `pulseSpeed?`, `glowBlurOverride?`, `colorOverride?`, `safeColorOverride?`, `collisionGrace?`, `weightMaxDist?`, `isBoss?`, `minDist?`, `maxDist?`, `groupId?`, `spawnCondition?`) |

### エクスポート関数

| 関数 | 概要 |
|---|---|
| `resolveWeight(entry: SpawnEntry, distance: number, maxDist?: number): number` | SpawnEntry の重みを距離で線形補間 |

---

## `index.ts`

一括エクスポート。`GenrePlugin`, `FeatureSystem`, `MutableWorld`, `InputSnapshot`, `SpawnEntry`, `resolveWeight`, `registerGenre`, `registerFeature`, `getGenre`, `getActiveSystems`, `debugPrint`, `devValidateRegistry` を再エクスポート。
