# JSON 駆動 SE（効果音）システム 設計書

> **ブランチの注記**: 本実装は `origin/main` をベースに `feat/sfx-json` ブランチで実装される。
> P1 由来の 3 フック（`onGoalAchieved` / `onRecordUpdate` / `onSkinSelect`）は、
> SFX JSON データとしては `src/data/sfx/` に保持してよいが、
> standalone SFX の `SoundManager` / `SfxSound` public hook には含めない。
> ゲームロジックからの呼び出しは P1 側に属するため本 PR には含めない。

## 1. 背景・課題

現状の効果音は `src/plugins/SfxSound.ts` のメソッドにハードコードされている。
`onJump()` が `playSfx('jump')` を直接呼ぶように、
これには2つの問題がある:

1. **SEが不足している** — プレイヤーに見えるイベントの多くに効果音が未接続のものが多い。
   多量に存在する（テトリス操作のラインクリア・敵撃破・アイテム取得・レベルアップ・
   ボス出現/撃破・説明書更新・投擲リリース 等、調査で37個以上を特定）。
2. **追加・調整が難しい** — 音の追加は都度 TS を書き換える必要があり、
   「波の種類（sine/triangle/square/sawtooth）」「秒数」「周波数」「音量」を
   直感的に調整できない。

## 2. 目標

- **JSON で SE を定義する**: 波の種類、秒数、周波数、音量、遅延、フィルタ を JSON で記述する。
- **設定ファイルを大量に作って読み込む**: 1ファイル=1SE の JSON を `src/data/sfx/` に置き、`import.meta.glob` で自動収集する。
  **新しい SE を足す = 1つの JSON ファイルを追加するだけで OK**（TS 不要）。
- **既存の SE を JSON 化しつつ挙動を維持する**: 51 種（ベース + ジャンル別 + UI 系）。
- **不足している SE を追加**し、ゲームロジックに配線する。
- **完全オフライン動作**を維持する（WebAudio 手続き生成のみ、音声ファイル不使用）。

## 3. 非目標

- BGM シーケンサの JSON 化（今回は SE のみ、BGM は既存のシーケンサを維持する）。
- 音声ファイル（mp3/wav 等）の読み込み（オフライン完結とバンドル軽量化のため排除する）。
- 音のリアルタイム編集 UI（開発者向けの拡張は今後の課題とする）。
- P0 由来フック（`onMilestone` / `onNearMiss` / `startBgm` / `stopBgm` / `setMuted` / `muted`）の追加。
- P1 由来フック（`onGoalAchieved` / `onRecordUpdate` / `onSkinSelect`）のゲームロジック配線。

## 4. 設計

### 4.1 SE 定義スキーマ

`src/framework/sfx-types.ts` に型を定義する。

```ts
export type WaveType = 'sine' | 'triangle' | 'square' | 'sawtooth'

/** 帯域フィルタ（任意）。freqEnd を与えると帯域スweepになる。*/
export interface SfxFilter {
  type: 'lowpass' | 'highpass' | 'bandpass'
  freq: number
  freqEnd?: number
  q?: number
}

/** オシレーター1音 */
export interface SfxOscTrack {
  kind: 'osc'
  wave: WaveType
  freq: number          // Hz
  freqEnd?: number      // 最終ランプの目標周波数（任意）
  durationSec: number
  volume: number        // 0〜1
  delaySec?: number     // 開始オフセット（任意）
  filter?: SfxFilter
}

/** ノイズ1音（白ノイズバッファ + 任意フィルタ）*/
export interface SfxNoiseTrack {
  kind: 'noise'
  durationSec: number
  volume: number
  delaySec?: number
  filter?: SfxFilter
}

export type SfxTrack = SfxOscTrack | SfxNoiseTrack

export interface SfxDef {
  id: string
  tracks: SfxTrack[]
}
```

### 4.2 読み込み

`src/framework/SfxLoader.ts` で `import.meta.glob` を使い、`src/data/sfx/*.json` を自動収集する。

```ts
const raw = import.meta.glob('../data/sfx/*.json', { eager: true })
export const SFX_DEFS: Record<string, SfxDef> = {}
for (const [path, raw] of Object.entries(raw)) {
  const id = basename(path, '.json')
  SFX_DEFS[id] = raw as SfxDef
}
```

### 4.3 再生エンジン

`src/plugins/SfxSound.ts` に WebAudio 専用 SFX プレイヤーを実装する。

- `playSfx(id: string, freqScale = 1): void` を公開。
- AudioContext は lazy 生成（ユーザー操作トリガー時）。
- `webkitAudioContext` フォールバック。
- 未知の id は PROD 以外で `console.warn`、PROD では no-op。
- `volume: 0` 等の JSON で `exponentialRampToValueAtTime` が例外を投げる場合でも no-op になるよう、
  トラック再生ループ全体を try/catch で守る。

### 4.4 Combo 周波数計算

combo SE の freqScale は動的に計算される:

```
COMBO_BASE_FREQ = SFX_DEFS['combo'].tracks[0] の freq base
addedFreq = min(count * 12, COMBO_MAX_FREQ - COMBO_BASE_FREQ)
freqScale = (COMBO_BASE_FREQ + addedFreq) / COMBO_BASE_FREQ
```

- 上限: 1500 Hz
- freqScale が 1 未満の場合、再生周波数が 440 Hz 未満になるのを防ぐ（WebAudio osc が 20Hz 以下で例外を投げるため）

### 4.5 SoundManager への配線

`src/plugins/SoundManager.ts` に SFX 専用 optional hooks を追加する:

- P0 由来の `onMilestone` / `onNearMiss` / `startBgm` / `stopBgm` / `setMuted` / `muted` は含めない。
- P1 由来の `onGoalAchieved` / `onRecordUpdate` / `onSkinSelect` は SFX JSON データとしては保持するが、
  `SoundManager` / `SfxSound` public hook には含めない。

### 4.6 ゲームロジックへの配線

各 FeatureSystem / UI コンポーネントから `soundManager.onXxx()` を呼び出す:

- **ShootFeature**: `onEnemyDestroyed`, `onEnemyHit`
- **TetrisFeature**: `onTetrisMove`, `onTetrisRotate`, `onTetrisHardDrop`, `onTetrisLock`, `onLineClear`
- **PuzzleFeature**: `onPuzzleSlide`, `onPuzzleClear`
- **MovementFeature**: `onDash`, `onSlide`, `onWallJump`
- **RhythmFeature**: `onBeat`, `onJustHit`
- **SurvivalFeature**: `onHungerDamage`, `onMeleeAttack`, `onMeleeHit`, `onLevelUp`, `onItemPickup`
- **RpgFeature**: `onItemPickup`, `onShieldAbsorb`
- **SpecialFeature**: `onColorTouch`, `onTowerFire`, `onTimeBonus`, `onBossSpawn`, `onBossDefeated`, `onStealthActivate`
- **UI**: `onChoiceReveal`, `onChoiceSelect`, `onThrowStart`, `onThrowLand`, `onThrowRelease`, `onThrowGrab`, `onScoreReveal`, `onGradeStamp`, `onSurpriseEnding`, `onPauseToggle`, `onManualUpdate`, `onLearningEffect`

## 5. 実装完了項目

### Core
- [x] SFX 定義スキーマ（`sfx-types.ts`）
- [x] JSON 自動収集（`SfxLoader.ts`）
- [x] WebAudio 再生エンジン（`SfxSound.ts`）
- [x] 51 個の SFX JSON ファイル（`src/data/sfx/`）
- [x] SoundManager への SFX 専用 hooks 配線
- [x] ゲームロジックへの配線（8 feature files + UI）
- [x] JSON 検証スクリプト（`validate-json.mjs`）
- [x] 単体テスト（4 files）

### 高度な機能
- [x] AudioContext lazy 生成 + `webkitAudioContext` フォールバック
- [x] combo 周波数ダイナミック計算（純粋関数 `computeComboFreqScale` として export）
- [x] 未知 id への console.warn（PROD では no-op）
- [x] トラック再生ループの try/catch（堅牢性）
- [x] id とファイル名の一致検証
- [x] id 重複検出

## 6. 禁止事項

- `plan/p0-dopamine-design.md` をコミットしない。
- `.openhands/skills/pr-safe-change.md` をコミットしない。
- `src/plugins/WebAudioSound.ts` をコミットしない（既存ファイルの上書きも不可）。
- `src/data/config/sound.json` をコミットしない。
- P0 由来フック（`onMilestone` / `onNearMiss` / `startBgm` / `stopBgm` / `setMuted` / `muted`）を追加しない。
- P1 由来フック（`onGoalAchieved` / `onRecordUpdate` / `onSkinSelect`）をゲームロジックから呼び出さない。
- `any` 型を原則使用しない。

## 7. 将来の PR #230 との競合回避

本ブランチは `origin/main` をベースにしている。PR #230（P0 ドーパミン強化 + P1 進捗機能）は
別ブランチで並行開発されるが、以下の点に注意:

- `src/plugins/SoundManager.ts`: 本 PR は SFX 専用 optional hooks のみを追加。P0/P1 由来フックは追加しない。
- `src/main.ts`: 本 PR は `SfxSound` のみ登録。
- `src/data/config/sound.json`: 本 PR は作成・変更しない。

これにより、両 PR を merge しても最小限の競合で収まる。
