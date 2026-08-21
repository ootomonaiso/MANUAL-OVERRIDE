# P1 設計書 — 目標 / 記録 / スキン（進捗・達成・カスタマイズ）

> 対象: MANUAL-OVERRIDE（横スクロール × 説明書編集ゲーム）
> 前提: P0（ドーパミン強化）は `main` にマージ済み・承認済み。P1 は P0 を土台に拡張する。
> 方針: JSON 駆動・MVVM 維持・ネットワーク不要（localStorage 永続化のみ）・既存テスト/CI を壊さない。

---

## 0. 目的

P0 で「一回のプレイの中」の快感（BGM / 効果音 / 撃破演出 / コンボ / ニアミス / 速度感）を強化した。
P1 は「プレイを繰り返す理由」を作る 3 機能を実装する。

| 機能 | 効果 | ドーパミン |
|---|---|---|
| **記録（Records）** | 自己ベストの可視化・更新 | 「前回より上回った」達成感 |
| **目標（Goals）** | セッション中に狙える目標 | 「もう少しで届く」没入感 |
| **スキン（Skins）** | 記録で外見を解放・選択 | 「集めた・育てた」所有感 |

---

## 1. スコープ

### In scope（P1）
1. **記録**: 自己ベスト（全体 / ジャンル別）・プレイ回数・総距離を localStorage に保存。
   - エンディング画面に記録セクション + 「NEW RECORD!」バッジ
   - タイトル画面に「ベストスコア」表示
   - 新記録更新時の効果音
2. **目標**: ゲーム開始時に記録に基づいて 1 つのセッション目標を設定。
   - HUD に目標進捗バー
   - 達成時に効果音 + 「GOAL!」通知 + ボーナスコア
3. **スキン**: プレイヤーキャラクターの色テーマ。
   - `skins.json` で 6 種定義（1 種無料 + 5 種記録解放）
   - タイトル画面にスキン選択 UI
   - 選択は localStorage に永続化
   - 解放条件は記録に連動
   - 選択時に効果音
   - プレイヤー描画に反映（全ジャンルプラグイン対応）

### Out of scope（P2 以降）
- スキンの形状変更（色のみ。形状は各プラグインの描画ロジックに依存し高リスク）
- 記録のクラウド同期 / リーダーボード
- 目標の複数同時達成・実績バッジ集
- スキンの購入経済（通貨）

---

## 2. 既存アーキテクチャとの整合

- **設定**: `src/data/config/*.json` は `import.meta.glob` で自動収集 → `GAME_CONFIG`（`src/data/config.ts`）。
  新セクションは JSON を置く + `config-types.ts` に型 + `GameConfigMap` に追加 + `tunables.ts` から export。
- **純粋ロジック**: `src/domain/` に副作用なしの関数群（ruleEngine / scoreCalc と同列）。
- **ViewModel**: `src/composables/use*.ts`（useGameState / useManual と同列）。
- **UI**: `src/components/*.vue`（Hud / EndingPanel と同列）。
- **描画**: プレイヤーは `getGenre(genre).drawPlayer(ctx, w, h, onGround, runCycle)` に委譲
  （`sideScroller.ts:_drawPlayer`）。スキンは各プラグインが参照する `playerSkin` フィールドで渡す。
- **サウンド**: `SoundManager`（フック）+ `WebAudioSound`（手続き生成 SFX レシピ）。新 SFX はここに追加。

---

## 3. データ設計（JSON）

### 3.1 `src/data/config/records.json`（新規）
```json
{
  "storageKey": "mo_records_v1",
  "skinStorageKey": "mo_skin_v1",
  "goalBonusEnabled": true,
  "newRecordSound": true,
  "display": {
    "titleBestLabel": "ベストスコア",
    "recordLabel": "記録",
    "newRecordLabel": "NEW RECORD!"
  }
}
```

### 3.2 `src/data/config/goals.json`（新規）
```json
{
  "goals": [
    { "id": "dist_300",   "label": "300m 到達",   "metric": "distance",    "target": 300,  "bonus": 100 },
    { "id": "dist_500",   "label": "500m 到達",   "metric": "distance",    "target": 500,  "bonus": 200 },
    { "id": "dist_1000",  "label": "1000m 到達",  "metric": "distance",    "target": 1000, "bonus": 400 },
    { "id": "score_1000", "label": "スコア 1000", "metric": "score",       "target": 1000, "bonus": 150 },
    { "id": "score_3000", "label": "スコア 3000", "metric": "score",       "target": 3000, "bonus": 300 },
    { "id": "survive_60", "label": "60秒サバイブ","metric": "survivedSec", "target": 60,   "bonus": 200 }
  ],
  "selection": {
    "strategy": "stretch",
    "stretchFactor": 1.25,
    "starterGoalId": "dist_300"
  }
}
```

### 3.3 `src/data/skins.json`（新規・data 直下）
> config/ ではなく data/ 直下に置く（「定義データ」でありチューニング値ではないため）。
> `src/domain/skins.ts` で `import skinsJson from '../data/skins.json'` して読む。

```json
{
  "skins": [
    { "id": "default", "name": "デフォルト",
      "body": "#e8e8f8", "head": "#f0f0ff", "limb": "#aaaacc", "eye": "#222244", "accent": "#8888ff",
      "unlock": { "type": "free" } },
    { "id": "neon", "name": "ネオン",
      "body": "#00ffcc", "head": "#66ffee", "limb": "#00cc99", "eye": "#003322", "accent": "#00ffcc",
      "unlock": { "type": "record", "metric": "totalDistance", "threshold": 3000 } },
    { "id": "fire", "name": "ファイア",
      "body": "#ff6633", "head": "#ffaa66", "limb": "#cc4422", "eye": "#331100", "accent": "#ffcc00",
      "unlock": { "type": "record", "metric": "overallBestTotal", "threshold": 2000 } },
    { "id": "ghost", "name": "ゴースト",
      "body": "#ccccdd", "head": "#eeeeff", "limb": "#9999bb", "eye": "#444466", "accent": "#ffffff",
      "unlock": { "type": "record", "metric": "playCount", "threshold": 5 } },
    { "id": "gold", "name": "ゴールド",
      "body": "#ffd700", "head": "#ffeb99", "limb": "#cc9900", "eye": "#443300", "accent": "#fff200",
      "unlock": { "type": "record", "metric": "overallBestTotal", "threshold": 5000 } }
  ]
}
```

---

## 4. 型定義（`src/domain/types.ts` に追加）

```ts
// ── 記録 ──
export interface BestEntry {
  total: number
  play: number
  throw: number
  genre: GenreId
  distance: number
  date: string            // ISO 8601
}
export interface SaveRecords {
  overallBest: BestEntry | null
  perGenre: Record<string, BestEntry>   // genreId -> BestEntry
  playCount: number
  totalDistance: number
  totalPlayTime: number                 // 秒
}
export interface GameResult {
  genre: GenreId
  total: number
  play: number
  throw: number
  distance: number
  survivedSec: number
}
export interface RecordUpdateResult {
  records: SaveRecords
  newOverall: boolean
  newGenre: boolean
}

// ── 目標 ──
export type GoalMetric = 'distance' | 'score' | 'survivedSec'
export interface GoalDef {
  id: string
  label: string
  metric: GoalMetric
  target: number
  bonus: number
}
export interface GoalSelectionConfig {
  strategy: 'stretch'
  stretchFactor: number
  starterGoalId: string
}

// ── スキン ──
export interface PlayerSkin {
  id: string
  name: string
  body: string
  head: string
  limb: string
  eye: string
  accent: string
}
export type SkinUnlock =
  | { type: 'free' }
  | { type: 'record'; metric: 'totalDistance' | 'overallBestTotal' | 'playCount' | 'totalPlayTime'; threshold: number }
export interface SkinDef extends PlayerSkin {
  unlock: SkinUnlock
}
```

> 既存の `FinalScore { play, throw, total }` / `ThrowResult` / `ActionStats` はそのまま使う。
> `GameResult` はそれらを記録用にまとめた型。

---

## 5. 機能 1: 記録（Records）

### 5.1 `src/domain/records.ts`（新規・純粋関数 + localStorage 薄ラッパー）
```ts
export const DEFAULT_RECORDS: SaveRecords = { overallBest: null, perGenre: {}, playCount: 0, totalDistance: 0, totalPlayTime: 0 }

export function loadRecords(key: string): SaveRecords
// localStorage から読込。壊れていれば DEFAULT_RECORDS を返す（try/catch）。

export function saveRecords(key: string, r: SaveRecords): void
// 保存。QuotaExceeded 等は console.warn して無視（ゲームを止めない）。

export function recordGame(prev: SaveRecords, result: GameResult): RecordUpdateResult
// - playCount+1, totalDistance+=result.distance, totalPlayTime+=result.survivedSec
// - overallBest: result.total > prev.overallBest.total で更新（newOverall=true）
// - perGenre[result.genre]: result.total > 旧値 で更新（newGenre=true）
// - 純粋関数。副作用なし（保存は呼び出し側が saveRecords で行う）。
```

### 5.2 `src/composables/useRecords.ts`（新規）
```ts
export function useRecords() {
  const records = ref<SaveRecords>(loadRecords(RECORDS.storageKey))
  const lastUpdate = ref<RecordUpdateResult | null>(null)   // NEW RECORD 判定用

  function recordGame(result: GameResult): RecordUpdateResult {
    const res = recordGamePure(records.value, result)
    records.value = res.records
    saveRecords(RECORDS.storageKey, res.records)
    lastUpdate.value = res
    if (res.newOverall || res.newGenre) soundManager.onRecordUpdate()
    return res
  }
  function reset(): void { /* テスト用 */ }
  return { records: readonly(records), lastUpdate: readonly(lastUpdate), recordGame, reset }
}
```

### 5.3 統合ポイント
- **記録の取り込み**: `useGameState.finalizeThrowing()`（`useGameState.ts:304`）の
  `finalScore.value = calcFinalScore(...)` の直後で、`GameResult` を組み立てて記録に渡す。
  - 実装方針: `useGameState` から `onFinalScore?: (result: GameResult) => void` のフックを返す、
    または App.vue 側で `finalizeThrowing` 呼び出し後に `useRecords.recordGame(...)` を呼ぶ。
  - **採用**: App.vue の `onThrown()`（`App.vue:241`）で、`gameState.finalizeThrowing(...)` の直後に
    `records.recordGame(buildGameResult(...))` を呼ぶ（useGameState の純粋性を保つため）。
  - `buildGameResult(finalScore, genre, snapshot)` は App.vue 内の小ヘルパー。
    `distance` / `survivedSec` は `snapshot.value` から取る。
- **NEW RECORD 音**: `useRecords.recordGame` 内で `soundManager.onRecordUpdate()`（新フック）。

### 5.4 UI
- **`EndingPanel.vue`**: スコアボックスの下に記録セクションを追加。
  - `records` prop（`SaveRecords`）+ `isNewRecord` prop（boolean）を追加。
  - 表示: 全体ベスト / 本ゲームのジャンルのベスト / プレイ回数 / 総距離。
  - `isNewRecord` のとき「NEW RECORD!」バッジ（アニメ付き・アクセントカラー）。
- **タイトル画面（`App.vue:424-460`）**: `title-card` 内に「ベストスコア」1 行を追加
  （`records.overallBest` が null なら「—」表示）。

---

## 6. 機能 2: 目標（Goals）

### 6.1 `src/domain/goals.ts`（新規・純粋関数）
```ts
export function pickGoal(records: SaveRecords, cfg: { goals: GoalDef[]; selection: GoalSelectionConfig }): GoalDef
// - records.overallBest が無い / 距離情報が無い → selection.starterGoalId の目標
// - ある → 現ベスト距離の stretchFactor 倍を超える最小の distance 目標
//   （存在しなければ最大の distance 目標）。スコア目標は補完として混在させない（距離優先）。

export function goalProgress(goal: GoalDef, s: { distance: number; playScore: number; survivedSec: number }): number
// min(1, s[goal.metric] / goal.target)。target<=0 なら 1。

export function isGoalAchieved(goal: GoalDef, s: { distance: number; playScore: number; survivedSec: number }): boolean
// goalProgress >= 1。

export function goalBonus(goal: GoalDef | null, achieved: boolean): number
// achieved && goal ? goal.bonus : 0
```

### 6.2 `src/composables/useGoals.ts`（新規）
```ts
export function useGoals() {
  const currentGoal = ref<GoalDef | null>(null)
  const achieved = ref(false)

  function start(records: SaveRecords): void {
    currentGoal.value = pickGoal(records, GOALS)
    achieved.value = false
  }
  function progressFor(s: { distance: number; playScore: number; survivedSec: number }): number {
    return currentGoal.value ? goalProgress(currentGoal.value, s) : 0
  }
  function markAchieved(): void { achieved.value = true }
  function bonus(): number { return goalBonus(currentGoal.value, achieved.value) }
  function reset(): void { currentGoal.value = null; achieved.value = false }
  return { currentGoal: readonly(currentGoal), achieved: readonly(achieved), progressFor, start, markAchieved, bonus, reset }
}
```

### 6.3 統合ポイント
- **目標設定**: `App.vue:startGame()`（`App.vue:108`）で `goals.start(records.records.value)`。
- **進捗監視**: `App.vue` のスナップショットループ（`beginSnapshotLoop`, `App.vue:161`）で、
  毎フレーム `goals.progressFor(snapshot.value)` を見て、未達成かつ `>= 1` のとき
  `goals.markAchieved()` + `soundManager.onGoalAchieved()` + `showToast('🎯 GOAL! ' + goal.label)`。
  （1 ゲーム 1 回のみ。`achieved` フラグでガード。）
- **ボーナスコア**: `App.vue:onThrown()`（`App.vue:241`）で
  `gameState.finalizeThrowing(result, snapshot.value.playScore + goals.bonus(), gameStats)`。
  （ゴールボーナスをプレイスコアに上乗せして最終スコアへ反映。）

### 6.4 UI（`Hud.vue`）
- HUD に「目標」バーを追加（NEXT バーと並列・別物）。
  - `:goal-label` / `:goal-progress`（0〜1）props を追加。
  - 達成時（progress>=1）はバーをアクセント色で埋め + 「達成」ラベル。
  - 表示例: `GOAL 500m ────▮▮▮▮▯ 80%`
- 既存の NEXT（説明書更新進捗）バーと混同しないよう、ラベル・色を明確に区別。

---

## 7. 機能 3: スキン（Skins）

### 7.1 `src/domain/skins.ts`（新規）
```ts
import skinsJson from '../data/skins.json'

export function loadSkins(): SkinDef[]                 // skinsJson.skins を返す（型キャスト）
export function getSkinById(id: string): SkinDef | undefined
export function loadSelectedSkinId(key: string): string   // 未設定/無効 id なら 'default'
export function saveSelectedSkinId(key: string, id: string): void
export function isSkinUnlocked(skin: SkinDef, records: SaveRecords): boolean
// - free → true
// - record → records[skin.unlock.metric] >= skin.unlock.threshold
export function toPlayerSkin(skin: SkinDef): PlayerSkin   // 描画用に unlock を落とした型
```

### 7.2 `src/composables/useSkins.ts`（新規）
```ts
export function useSkins() {
  const skins = ref<SkinDef[]>(loadSkins())
  const selectedId = ref<string>(loadSelectedSkinId(RECORDS.skinStorageKey))

  const selectedSkin = computed<SkinDef>(() => getSkinById(selectedId.value) ?? skins.value[0])
  const unlocked = computed(() => new Set(skins.value.filter(s => isSkinUnlocked(s, recordsRef.value)).map(s => s.id)))

  function select(id: string): boolean {
    if (!unlocked.value.has(id)) return false
    selectedId.value = id
    saveSelectedSkinId(RECORDS.skinStorageKey, id)
    soundManager.onSkinSelect()
    return true
  }
  return { skins: readonly(skins), selectedId: readonly(selectedId), selectedSkin, unlocked, select }
}
```
> `recordsRef` は useRecords の records を受け取る（解放判定の依存）。
> 実装は `useSkins(records: Ref<SaveRecords>)` の形で records を引数で受け取る。

### 7.3 描画への反映（最重要・最高リスク）
**方針**: 各ジャンルプラグインが `this.playerSkin` を参照してプレイヤーの色を描く。

1. `src/engine/GenrePluginBase.ts` に `playerSkin: PlayerSkin` フィールドを追加
   （デフォルト = `default` スキンの色。`DEFAULT_PLAYER_SKIN` 定数として同ファイルに定義）。
2. `src/genres/BasePlugin.ts` の `DarkThemePlugin.drawPlayer`（`BasePlugin` が使うベース実装、
   同ファイル 57–109 行）で、現在ハードコードされている色（`#e8e8f8` / `#f0f0ff` / `#cccce0` /
   `#aaaacc` / `#222244`）を `this.playerSkin.body / head / limb / eye` に置き換える。
3. `drawPlayer` を **オーバーライドしている 13 のプラグイン**（AerialStg / Arena / Aquatic /
   BulletRunner / Dungeon / HackSlash / Platformer / Puzzle / Racing / Rpg / Survival /
   Stg / Tetris）も、プレイヤー本体の色を `this.playerSkin.*` に置き換える。
   - **最低限**: 胴体（body）の色は必ずスキン色にする。
   - 可能なら head / limb / eye も。複雑な描画で困難な箇所は body のみで可（フォールバック）。
4. `src/game/sideScroller.ts`:
   - `playerSkin: PlayerSkin` プロパティ + `setPlayerSkin(skin: PlayerSkin): void` を追加。
   - `_drawPlayer()`（`sideScroller.ts:1241`）で `getGenre(this.rules.genre).playerSkin = this.playerSkin`
     を `drawPlayer` 呼び出しの直前に設定（ジャンル確定でプラグインが切り替わっても常に正しい）。
   - 毎フレームの代入だが参照代入なのでコストは無視可能。
5. `App.vue:startGame()`（`App.vue:116`）で `scroller.setPlayerSkin(toPlayerSkin(skins.selectedSkin.value))`。

**フォールバック（重要）**:
- どのプラグインの drawPlayer も `this.playerSkin` が undefined にならないよう、
  `GenrePluginBase` で必ずデフォルト値を初期化する。
- 未対応プラグイン（色を置き換え忘れたもの）はデフォルト色で描画される（クラッシュしない）。
  → スキン反映は「ベストエフォート」。全プラグイン対応が理想だが、一部漏れてもゲームは動く。

### 7.4 UI（`src/components/SkinSelector.vue` 新規）
- タイトル画面（`App.vue` の `title-card` 内・「はじめる」ボタンの下）に配置。
- 6 種のスキンをグリッド表示（各スキンはプレイヤーのミニプレビュー = 色付きの小さな図形）。
  - 解放済み: クリックで選択（選択中はハイライト枠）。
  - 未解放: グレイアウト + ロックアイコン + 解放条件のヒント（例「総距離 3000m で解放」）。
- `@select` emit（id）→ App.vue が `skins.select(id)` を呼ぶ。
- 選択音は `skins.select` 内で `soundManager.onSkinSelect()`。

---

## 8. サウンド（`SoundManager` + `WebAudioSound`）

### 8.1 新フック（`SoundManager` / SoundHooks）
```ts
onGoalAchieved(): void    // 目標達成（明るい上昇音・2〜3ノートのアセンディング）
onRecordUpdate(): void    // 新記録（ファンファーレ風・短め）
onSkinSelect(): void      // スキン選択（クリック + 短いピッチ）
```

### 8.2 実装（`WebAudioSound`）
- P0 で追加した SFX レシピ（oscillator + gain エンベロープ）と同じパターンで 3 種追加。
- 音量は `SOUND.sfxVolume` に従う（既存の mute / volume 制御を再利用）。
- AudioContext は既存の `_ensureCtx` で遅延生成（autoplay 制限対策は P0 済み）。

---

## 9. 設定の配線（config-types / tunables）

1. `src/framework/config-types.ts`:
   - `RecordsConfig` / `GoalDef`（config 用）/ `GoalsConfig` インターフェースを追加。
   - `GameConfigMap` に `records: RecordsConfig` / `goals: GoalsConfig` を追加。
2. `src/data/config/records.json` / `goals.json` を作成（§3.1 / §3.2）。
3. `src/data/tunables.ts`:
   - `export const RECORDS = _c.records`
   - `export const GOALS = _c.goals`
4. `src/data/skins.json` は config/ に入れないため `tunables` には載せない（`skins.ts` が直接 import）。

---

## 10. 変更ファイル一覧

### 新規
| ファイル | 内容 |
|---|---|
| `src/domain/records.ts` | 記録の純粋関数 + localStorage ラッパー |
| `src/domain/goals.ts` | 目標の純粋関数 |
| `src/domain/skins.ts` | スキンの読み込み・解放判定 |
| `src/composables/useRecords.ts` | 記録 ViewModel |
| `src/composables/useGoals.ts` | 目標 ViewModel |
| `src/composables/useSkins.ts` | スキン ViewModel |
| `src/components/SkinSelector.vue` | タイトル画面のスキン選択 UI |
| `src/components/RecordsPanel.vue` | エンディングの記録セクション（EndingPanel に組み込む代替可） |
| `src/data/config/records.json` | 記録設定 |
| `src/data/config/goals.json` | 目標設定 |
| `src/data/skins.json` | スキン定義 |
| `tests/unit/records.test.ts` | 記録のユニットテスト |
| `tests/unit/goals.test.ts` | 目標のユニットテスト |
| `tests/unit/skins.test.ts` | スキンのユニットテスト |
| `tests/p1_features.spec.ts` | Playwright 統合テスト |

### 修正
| ファイル | 変更 |
|---|---|
| `src/domain/types.ts` | `BestEntry` / `SaveRecords` / `GameResult` / `RecordUpdateResult` / `GoalDef` / `GoalMetric` / `PlayerSkin` / `SkinDef` / `SkinUnlock` を追加 |
| `src/framework/config-types.ts` | `RecordsConfig` / `GoalsConfig` + `GameConfigMap` に追加 |
| `src/data/tunables.ts` | `RECORDS` / `GOALS` を export |
| `src/engine/GenrePluginBase.ts` | `playerSkin` フィールド + `DEFAULT_PLAYER_SKIN` |
| `src/genres/BasePlugin.ts` | `DarkThemePlugin.drawPlayer` をスキン色化 |
| `src/genres/*.ts`（13 種・BasePlugin 以外） | `drawPlayer` の本体色を `this.playerSkin.*` に |
| `src/game/sideScroller.ts` | `playerSkin` / `setPlayerSkin` + `_drawPlayer` でプラグインへ設定 |
| `src/composables/useGameState.ts` | （任意）`finalizeThrowing` で GameResult を返す / フック |
| `src/App.vue` | useRecords / useGoals / useSkins の配線・startGame/onThrown/スナップショットループ・タイトル UI・EndingPanel への props |
| `src/components/Hud.vue` | 目標バー（`goal-label` / `goal-progress` props） |
| `src/components/EndingPanel.vue` | 記録セクション + NEW RECORD バッジ（`records` / `isNewRecord` props） |
| `src/plugins/SoundManager.ts` | 新フック 3 種 |
| `src/plugins/WebAudioSound.ts` | 新 SFX 3 種 |

---

## 11. テスト要件

### 11.1 ユニットテスト（Vitest）
- **records.test.ts**
  - `recordGame`: 初回（overallBest null → 設定・newOverall=true）
  - `recordGame`: 高スコアで overallBest 更新（newOverall=true）
  - `recordGame`: 低スコアで更新されない（newOverall=false）
  - `recordGame`: ジャンル別ベストの独立更新（newGenre）
  - `recordGame`: playCount / totalDistance / totalPlayTime の累積
  - `loadRecords`: 壊れた JSON → DEFAULT_RECORDS（例外投げない）
- **goals.test.ts**
  - `pickGoal`: 記録なし → starterGoal
  - `pickGoal`: ベスト距離あり → stretch 目標（stretchFactor 倍超の最小 distance）
  - `goalProgress`: 0 / 中間 / 1 以上で 1 にクランプ
  - `isGoalAchieved` / `goalBonus`: 達成・未達成
- **skins.test.ts**
  - `isSkinUnlocked`: free → true
  - `isSkinUnlocked`: record 条件を満たす / 満たさない
  - `loadSelectedSkinId`: 未設定 → 'default'、無効 id → 'default'
  - `toPlayerSkin`: unlock を落として返す

### 11.2 統合テスト（Playwright `p1_features.spec.ts`）
- **記録**: ゲーム 1 周（投擲まで）→ エンディングに記録セクション表示・NEW RECORD バッジ表示。
  リスタート → タイトルにベストスコア表示。
- **目標**: ゲーム開始 → HUD に目標バー表示。距離を進めて達成 → 「GOAL!」トースト表示。
- **スキン**: タイトルでスキン選択 UI 表示。無料スキン選択 → 反映（選択枠ハイライト）。
  未解放スキンはロック表示。
- 既存の `p0_dopamine.spec.ts` / `smoke` を壊さないこと。

### 11.3 品質ゲート
- `npm run ci` 全緑（typecheck / lint / validate / test:unit:ci / build / bundle-size / test:features）。
- bundle-size 予算（JS 800KB / CSS 100KB / dist 2MB）を超過しない。
- ESLint: `no-explicit-any` 禁止・命名規則・`prefer-const`・`eqeqeq`。

---

## 12. GitHub デリバリー

> P0 と「同様に」送付する（fork push + gh-pages デプロイ + 動作検証）。

1. **ブランチ**: 従来決定に従い P1 は別ブランチ。
   - `main`（P0 済み）から `feat/p1-progress` を作成。
2. **実装 → レビュー → 修正**: このブランチで完了。
3. **push**: `git push fork feat/p1-progress`。
4. **PR 作成**: `feat/p1-progress` → `main`（レビュー・マージ用）。`gh pr create`。
5. **gh-pages デプロイ**: P1 ビルド（`npm run build`）を `fork/gh-pages` に配置
   （`dist/*` + `.nojekyll`、fast-forward push）。→ `https://mccbena.github.io/MANUAL-OVERRIDE/` で P1 が遊べる状態。
6. **検証**: Pages の index / JS / CSS が 200、Playwright ライブ検証（起動・プレイ・pageerror 0）、
   タイトル / gameplay / エンディングのスクリーンショット。

> 備考: `main`（P0）と `gh-pages`（P1 プレビュー）が一時乖離するが、
> PR マージ後に `main` = P1 となり一致する。

---

## 13. リスクと対策

| リスク | 影響 | 対策 |
|---|---|---|
| 13 プラグインの drawPlayer 色置換で見た目が崩れる | 高 | body 色を最優先・他はベストエフォート。`DEFAULT_PLAYER_SKIN` で undefined 防止。スクリーンショットで全ジャンルの見た目確認 |
| スキンがジャンル切り替えで反映されない | 中 | `_drawPlayer` 毎フレーム `plugin.playerSkin = this.playerSkin` で強制同期 |
| localStorage クォータ / 壊れたデータでクラッシュ | 中 | load 時 try/catch → DEFAULT。save 時 try/catch → warn のみ |
| ゴールボーナスがスコア計算と二重反映 | 中 | ボーナスは `onThrown` で playScore に 1 回だけ上乗せ。scroller 側は変更しない |
| bundle-size 超過 | 低 | 追加は JSON + 小関数 + 3 SFX。CI の bundle-size チェックで監視 |
| 既存テストの破壊 | 中 | 既存 props は追加のみ（変更しない）。`npm run ci` 必須 |

---

## 14. 実装順序（Implementer 用）

1. 型定義（`types.ts`）+ 設定（`records.json` / `goals.json` / `skins.json` / `config-types.ts` / `tunables.ts`）
2. 純粋ロジック（`records.ts` / `goals.ts` / `skins.ts`）+ ユニットテスト
3. ViewModel（`useRecords` / `useGoals` / `useSkins`）
4. サウンド（`SoundManager` / `WebAudioSound` の新フック 3 種）
5. 描画（`GenrePluginBase` / `BasePlugin.ts` の `DarkThemePlugin` / 13 プラグイン / `sideScroller`）
6. UI（`Hud.vue` 目標バー / `EndingPanel.vue` 記録 / `SkinSelector.vue` / `App.vue` 配線）
7. 統合テスト（`p1_features.spec.ts`）
8. `npm run ci` 全緑確認
