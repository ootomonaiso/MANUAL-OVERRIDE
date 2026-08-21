# JSON SFX standalone 化設計（PR #231 / PR #230 分離）

## 目的

PR #231（JSON 駆動 SE）を、PR #230 に含まれるコミット（add skills / P0 ドーパミン強化 / P1 進捗機能 等）から完全に分離する。

- 対象 PR: `https://github.com/ootomonaiso/MANUAL-OVERRIDE/pull/231`
- 分離対象 PR: `https://github.com/ootomonaiso/MANUAL-OVERRIDE/pull/230`
- 基準: `origin/main`（`59ed274` 時点）
- 旧実装参照: `e6f6733` / `backup/feat-sfx-json-p0-based`

## 制約

1. PR #231 の diff に PR #230 由来コミットを含めない。
   - `8cc4275` add skills
   - `280b24c` P0ドーパミン強化
   - `d19324c` debug パネル左上配置修正
   - `42a639d` P1 進捗機能
   - `f91a1a4` P1 レビュー指摘修正
2. `origin/main` に存在しない P0/P1 前提のコードを依存しない。
   - `src/plugins/WebAudioSound.ts`（P0 版）
   - `SOUND` tunable / `src/data/config/sound.json`
   - P0 版 `SoundHooks`（`onMilestone`, `onNearMiss`, `startBgm`, `stopBgm`, `setMuted`, `muted` 等）
   - P0/P1 由来フック（`onGoalAchieved`, `onRecordUpdate`, `onSkinSelect`, `onComboMilestone` 等）
3. SFX 機能は `origin/main` 単体で typecheck / lint / test / build / validate が通ること。
4. 将来的に PR #230 が先にマージされた場合も、SFX 側が JSON SFX の責務を保持しやすい形にする。

## 方針

- `origin/main` をベースに SFX のみを実装する。
- 旧 `e6f6733` の SFX JSON / loader / validator / 配線は可能な限り再利用する。
- P0 版 `WebAudioSound.ts` を流用しない。
- 新規に `src/plugins/SfxSound.ts` を作成し、JSON SFX 再生専用の WebAudio 実装とする。
  - BGM シーケンサは含めない（BGM は `origin/main` のファイル BGM を維持）。
  - P0 版の mute / BGM volume 連携は含めない。
  - `playSfx(id, freqScale = 1)` を公開し、`SoundHooks` 各フックから JSON SFX を再生する。
- `SoundManager` に追加するフックは、`origin/main` で配線可能な SFX 専用フックに限定する。
  - P0 由来の `onMilestone` / `onNearMiss` / `startBgm` / `stopBgm` / `setMuted` / `muted` は追加しない。
  - P1 由来の `onGoalAchieved` / `onRecordUpdate` / `onSkinSelect` / `onComboMilestone` は追加しない。
- `src/data/sfx/*.json` は旧実装の 51 定義を保持してよい。
  - 未配線 ID（P0/P1 依存 ID）が存在しても、SFX データとして無害なら保持可。
  - ただし `SoundManager` / `SfxSound` の public hook には含めない。

## 実装範囲

### 追加

- `src/framework/sfx-types.ts`
- `src/framework/SfxLoader.ts`
- `src/plugins/SfxSound.ts`
- `src/data/sfx/*.json`（51 件）
- `tests/unit/sfxLoader.test.ts`
- `tests/unit/sfxWiring.test.ts`
- `tests/unit/SfxSound.test.ts`
- 必要に応じて `tests/unit/featureRegression.test.ts`（SFX 起因の二重再生防止のみ）

### 修正

- `src/framework/ConfigValidator.ts`
  - `devValidateSfx()` を追加
- `src/framework/index.ts`
  - `SFX_DEFS` / SFX 型を export
- `src/data/config.ts`
  - `devValidateSfx(SFX_DEFS)` を呼ぶ
- `scripts/validate-json.mjs`
  - `validateSfx()` を追加
- `src/plugins/SoundManager.ts`
  - SFX 専用 optional hooks を追加
  - ファイル BGM 既存ロジックは維持
- `src/main.ts`
  - `soundManager.register(new SfxSound())` を 1 回だけ登録
- ゲーム / UI 配線
  - `src/composables/useGameState.ts`
  - `src/game/sideScroller.ts`
  - `src/game/systems/RhythmFeature.ts`
  - `src/game/systems/PuzzleFeature.ts`
  - `src/game/systems/ShootFeature.ts`
  - `src/game/systems/SurvivalFeature.ts`
  - `src/game/systems/MovementFeature.ts`
  - `src/game/systems/RpgFeature.ts`
  - `src/game/systems/SpecialFeature.ts`
  - `src/game/systems/TetrisFeature.ts`
  - `src/App.vue`
  - `src/components/ThrowOverlay.vue`
  - `src/components/EndingPanel.vue`
- `plan/json-sfx-design.md`
  - standalone 化の前提を反映

## 配線方針

`origin/main` に既に存在するイベントはそのまま利用する。

- `onJump`
- `onLand`
- `onShoot`
- `onHit`
- `onDeath`
- `onGenreLock`
- `onChoiceReveal`
- `onChoiceSelect`
- `onThrowStart`
- `onThrowLand`
- `onBeat`
- `onCombo`

SFX 専用として追加するフックは、以下に限定する。

- `onTetrisMove`
- `onTetrisRotate`
- `onTetrisHardDrop`
- `onTetrisLock`
- `onLineClear`
- `onPuzzleSlide`
- `onPuzzleClear`
- `onJustHit`
- `onEnemyDestroyed`
- `onEnemyHit`
- `onMeleeAttack`
- `onMeleeHit`
- `onDash`
- `onSlide`
- `onWallJump`
- `onItemPickup`
- `onColorTouch`
- `onTowerFire`
- `onTimeBonus`
- `onLevelUp`
- `onHungerDamage`
- `onBossSpawn`
- `onBossDefeated`
- `onStealthActivate`
- `onShieldAbsorb`
- `onManualUpdate`
- `onLearningEffect`
- `onThrowRelease`
- `onThrowGrab`
- `onScoreReveal`
- `onGradeStamp`
- `onSurpriseEnding`
- `onPauseToggle`

以下は standalone SFX PR では配線しない（P0/P1 依存のため）。

- `onMilestone`
- `onNearMiss`
- `onComboMilestone`
- `onGoalAchieved`
- `onRecordUpdate`
- `onSkinSelect`

## 検証

- `npm run typecheck`
- `npm run lint`
- `npm run check-doc-links`
- `npm run test:unit:ci`
- `npm run test:features`
- `npm run build`
- `npm run bundle-size`
- `npm run validate`
- `npx playwright test tests/smoke.spec.ts --project=chromium`

## 完了条件

- `git log origin/main..HEAD` に PR #230 由来コミットが含まれない。
- `git merge-base origin/main HEAD` が `origin/main` を指す。
- PR #231 の diff に `plan/p0-dopamine-design.md` / `.openhands/skills/pr-safe-change.md` / P0 版 `WebAudioSound.ts` が含まれない。
- `origin/main` ベースで上記検証がすべて通る。
- SFX JSON 駆動方式が維持される。
