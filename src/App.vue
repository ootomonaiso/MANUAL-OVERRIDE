<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, computed } from 'vue'
import { useGameState } from './composables/useGameState'
import { useManual } from './composables/useManual'
import { SideScroller } from './game/sideScroller'
import type { GameSnapshot } from './game/sideScroller'
import Hud from './components/Hud.vue'
import ManualPanel from './components/ManualPanel.vue'
import ChoicePanel from './components/ChoicePanel.vue'
import ThrowOverlay from './components/ThrowOverlay.vue'
import EndingPanel from './components/EndingPanel.vue'
import TutorialHints from './components/TutorialHints.vue'
import PluginLoader from './components/PluginLoader.vue'
import { GENRES } from './data/genres'
import type { ThrowResult } from './domain/types'
import { TUTORIAL_ENABLED, TutorialScreen } from './tutorial'

// ─── 状態 ─────────────────────────────────────────────────────────
const gameState = useGameState()
const manualCtl = useManual(gameState.currentManual)

const canvasRef = ref<HTMLCanvasElement | null>(null)
let scroller: SideScroller | null = null

// ─── エラートースト ──────────────────────────────────────────────
const toastMessage = ref<string | null>(null)
let toastTimer: ReturnType<typeof setTimeout> | null = null
function showToast(msg: string) {
  toastMessage.value = msg
  if (toastTimer !== null) clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => { toastMessage.value = null }, 3500)
}

const snapshot = ref<GameSnapshot>({
  distance: 0, playScore: 0, combo: 0, kills: 0, exp: 0,
  beatHits: 0, survivedSec: 0, hp: 3, maxHp: 3, dead: false, shouldUpdate: null,
  statJumps: 0, statMoveLeft: 0, statMoveRight: 0, firstJumpDone: false,
  learningNotification: null, scoreFormulaError: null,
})

// ─── Canvas サイズをウィンドウに合わせる ───────────────────────────
function resizeCanvas() {
  const canvas = canvasRef.value
  if (!canvas) return
  canvas.width  = window.innerWidth
  canvas.height = window.innerHeight
  // canvas.width 変更で ctx 全状態がリセットされるため scroller に通知
  scroller?.onResize()
}

// ─── ゲームスタート ─────────────────────────────────────────────
function startGame() {
  gameState.startGame()
  const canvas = canvasRef.value!
  resizeCanvas()
  scroller = new SideScroller(canvas, gameState.rules)
  // 初期説明書を履歴に登録
  manualCtl.recordUpdate(gameState.currentManual())
  scroller.start()
  // チュートリアル有効時は一時停止（チュートリアル画面の背後で静止）
  if (TUTORIAL_ENABLED) {
    scroller.setPaused(true)
  }
  beginSnapshotLoop()
}

// ─── チュートリアル完了 → ゲームプレイ開始 ────────────────────
function startTutorial() {
  if (TUTORIAL_ENABLED) {
    gameState.startTutorial()
    scroller?.setPaused(false)
  }
}

// ─── スナップショット監視ループ ──────────────────────────────────
let snapRaf = 0
function beginSnapshotLoop() {
  function loop() {
    if (!scroller) return
    snapshot.value = scroller.getSnapshot()

    // 更新トリガー（tutorial, playing, genreLocked で発火する）
    // 最初のジャンプまで待つ
    const activePlay = ['playing', 'tutorial', 'genreLocked'].includes(gameState.phase.value)
    if (snapshot.value.shouldUpdate !== null && snapshot.value.firstJumpDone && activePlay) {
      scroller.setPaused(true)
      gameState.triggerUpdate()
    }

    // ゲームオーバー → 投擲フェーズへ自動移行
    const p = gameState.phase.value
    if (snapshot.value.dead && p !== 'throwing' && p !== 'ending' && p !== 'updating') {
      gameState.startThrowing(snapshot.value.playScore)
    }

    // LearningSystem エフェクト通知
    if (snapshot.value.learningNotification) {
      showToast(`🎯 ${snapshot.value.learningNotification}`)
    }

    // スコア計算式エラー（開発時のみ）
    if (import.meta.env.DEV && snapshot.value.scoreFormulaError) {
      showToast(`⚠ スコア式エラー: ${snapshot.value.scoreFormulaError}`)
    }

    snapRaf = requestAnimationFrame(loop)
  }
  snapRaf = requestAnimationFrame(loop)
}

// ─── 選択後の処理 ────────────────────────────────────────────────
function onChoose(choiceId: string) {
  if (!scroller) {
    showToast('エラー: ゲームが初期化されていません')
    return
  }
  const idx = snapshot.value.shouldUpdate ?? 0
  const chooseError = gameState.choose(choiceId)
  if (chooseError) {
    showToast(`エラー: ${chooseError}`)
    return
  }
  // 新しい説明書を記録（差分演出）
  const currentManual = gameState.currentManual()
  manualCtl.recordUpdate(currentManual)
  // ルールをゲームエンジンへ反映（ManualVersion も渡して learningRules を同期）
  scroller.updateRules(gameState.rules, currentManual)
  // 更新完了を scroller に通知
  scroller.markUpdated(idx)
}

// ─── ギブアップ ───────────────────────────────────────────────────
function giveUp() {
  scroller?.setPaused(true)
  gameState.startThrowing(snapshot.value.playScore)
}

// ─── 投擲完了 ────────────────────────────────────────────────────
function onThrown(result: ThrowResult) {
  gameState.finalizeThrowing(result, snapshot.value.playScore)
}

// ─── リスタート ──────────────────────────────────────────────────
function restart() {
  cancelAnimationFrame(snapRaf)
  scroller?.stop()
  scroller = null
  gameState.restart()
}

// ─── 現在のジャンルテーマ ─────────────────────────────────────────
const currentTheme = computed(() => {
  const genre = gameState.lockedGenre.value
  if (!genre) return 'plain'
  return GENRES.find(g => g.id === genre)?.theme ?? 'plain'
})

// ─── フェーズ遷移で一時停止/再開 ────
watch(gameState.phase, (newPhase) => {
  if (newPhase === 'updating') {
    // 選択肢が表示されるときはゲーム一時停止（スムーズに選択できるように）
    scroller?.setPaused(true)
  } else if (['playing', 'tutorial', 'genreLocked'].includes(newPhase)) {
    // 中央表示アニメーション中は再開しない
    if (!manualCtl.isCentered.value) {
      scroller?.setPaused(false)
    }
  }
  // tutorialIntro は startGame() で既に一時停止済み
})

// ─── 中央表示アニメーション終了でゲーム再開 ───
watch(manualCtl.isCentered, (centered) => {
  if (!centered && ['playing', 'tutorial', 'genreLocked'].includes(gameState.phase.value)) {
    scroller?.setPaused(false)
  } else if (centered) {
    // アニメーション開始時は強制一時停止
    scroller?.setPaused(true)
  }
})

// ─── ジャンル確定時の加速エフェクト ────
let genreLockedBoostTimer: number | null = null
watch(() => gameState.lockedGenre.value, (newGenre) => {
  if (!newGenre || !scroller) return

  // ジャンル確定時、スクロール速度を一時的にアップ（0.8秒間）
  const originalSpeed = gameState.rules.scrollSpeed
  gameState.rules.scrollSpeed = originalSpeed * 1.35  // 35%加速
  scroller.updateRules(gameState.rules, gameState.currentManual())

  if (genreLockedBoostTimer !== null) clearTimeout(genreLockedBoostTimer)
  genreLockedBoostTimer = window.setTimeout(() => {
    gameState.rules.scrollSpeed = originalSpeed
    scroller?.updateRules(gameState.rules, gameState.currentManual())
  }, 800)
})

onMounted(() => {
  window.addEventListener('resize', resizeCanvas)
})
onUnmounted(() => {
  cancelAnimationFrame(snapRaf)
  scroller?.stop()
  window.removeEventListener('resize', resizeCanvas)
})
</script>

<template>
  <div class="app-root">
    <!-- ゲームキャンバス（常に背面） -->
    <canvas ref="canvasRef" class="game-canvas" />

    <!-- ─── タイトル画面 ─── -->
    <Transition name="fade">
      <div v-if="gameState.phase.value === 'title'" class="title-screen">
        <!-- スキャンライン -->
        <div class="title-scanlines" />

        <!-- グリッド背景 -->
        <div class="title-grid-bg" />

        <div class="title-card">
          <!-- 書類風ヘッダー -->
          <div class="title-doc-header">
            <span class="title-doc-tag">GAME MANUAL</span>
            <span class="title-doc-tag">ver.1.0</span>
          </div>

          <div class="title-rule" />

          <div class="title-main">MANUAL<br>OVERRIDE</div>

          <div class="title-sub">
            説明書が更新されるたびにゲームが変わる。<br>
            あなたはどんなゲームを作りますか？<span class="title-cursor">|</span>
          </div>

          <button class="title-btn" @click="startGame">
            <span class="title-btn-bracket">[</span>
            &nbsp;はじめる&nbsp;
            <span class="title-btn-bracket">]</span>
          </button>

          <div class="title-controls">
            <span class="ctrl-group">
              <kbd class="ctrl-key">←</kbd><kbd class="ctrl-key">→</kbd>
              <span class="ctrl-desc">移動</span>
            </span>
            <span class="ctrl-sep">/</span>
            <span class="ctrl-group">
              <kbd class="ctrl-key">SPACE</kbd>
              <span class="ctrl-desc">ジャンプ</span>
            </span>
          </div>
        </div>
      </div>
    </Transition>

    <!-- ─── チュートリアル画面 ─── -->
    <Transition name="fade">
      <TutorialScreen
        v-if="gameState.phase.value === 'tutorialIntro'"
        @start="startTutorial"
      />
    </Transition>

    <!-- ─── ゲームプレイ中 HUD ─── -->
    <template v-if="gameState.phase.value !== 'title' && gameState.phase.value !== 'ending' && gameState.phase.value !== 'tutorialIntro'">
      <Hud
        :distance="snapshot.distance"
        :play-score="snapshot.playScore"
        :kills="snapshot.kills"
        :combo="snapshot.combo"
        :hp="snapshot.hp"
        :max-hp="snapshot.maxHp"
        :beat-hits="snapshot.beatHits"
        :genre="gameState.rules.genre"
        :features="gameState.rules.features"
      />

      <!-- 説明書パネル（投擲中は ThrowOverlay が代替） -->
      <ManualPanel
        v-if="gameState.phase.value !== 'throwing'"
        :manual="gameState.currentManual()"
        :theme="currentTheme"
        :diff-lines="manualCtl.diffLines.value"
        :is-animating="manualCtl.isAnimating.value"
        :is-centered="manualCtl.isCentered.value"
        :history="manualCtl.history.value"
        :features="gameState.rules.features"
        :highlight="gameState.phase.value === 'tutorial'"
      />

      <!-- 説明書更新時のフォーカスオーバーレイ -->
      <Transition name="fade">
        <div v-if="manualCtl.isCentered.value" class="manual-focus-overlay" />
      </Transition>

      <!-- チュートリアルヒント（序盤のみ表示） -->
      <TutorialHints
        v-if="gameState.phase.value === 'tutorial'"
        :survived-sec="snapshot.survivedSec"
        :jumps="snapshot.statJumps"
        :moves-left="snapshot.statMoveLeft"
        :moves-right="snapshot.statMoveRight"
        :distance="snapshot.distance"
      />

      <!-- ギブアップボタン（600m 以降 & genreLocked 時のみ） -->
      <!-- tabindex="-1": Space キーでフォーカス発火しないよう除外 -->
      <Transition name="giveup-reveal">
        <div
          v-if="['playing','genreLocked'].includes(gameState.phase.value) && !snapshot.dead"
          class="giveup-area"
        >
          <button class="giveup-btn" tabindex="-1" @click="giveUp">
            説明書を投げてゲームを終わらせる
          </button>
          <div class="giveup-hint">ドラッグして投げると高スコア</div>
        </div>
      </Transition>

      <!-- ジャンル確定演出 -->
      <div v-if="gameState.phase.value === 'genreLocked'" class="genre-locked-effect">
        <!-- インク滲みエフェクト -->
        <div class="genre-ink-bleed" />

        <!-- ジャンル確定バナー -->
        <Transition name="genre-reveal">
          <div class="genre-locked-banner">
            <div class="genre-locked-text">
              {{ gameState.lockedGenreDef()?.manualReveal }}
            </div>
          </div>
        </Transition>
      </div>
    </template>

    <!-- ─── 2択選択 ─── -->
    <Transition name="fade">
      <ChoicePanel
        v-if="gameState.phase.value === 'updating'"
        :choices="gameState.currentManual().choices"
        :version="gameState.currentManual().version"
        @choose="onChoose"
      />
    </Transition>

    <!-- ─── 投擲フェーズ ─── -->
    <Transition name="fade">
      <ThrowOverlay
        v-if="gameState.phase.value === 'throwing'"
        :manual-version="gameState.currentManual().version"
        :manual-text="gameState.currentManual().manualText"
        @thrown="onThrown"
      />
    </Transition>

    <!-- ─── エンディング ─── -->
    <Transition name="fade">
      <EndingPanel
        v-if="gameState.phase.value === 'ending' && gameState.finalScore.value"
        :final-score="gameState.finalScore.value"
        :genre="gameState.lockedGenre.value ?? 'runner'"
        :choice-count="gameState.choiceHistory.length"
        @restart="restart"
      />
    </Transition>

    <!-- ─── プラグインローダー ─── -->
    <PluginLoader />

    <!-- ─── エラートースト ─── -->
    <Transition name="toast">
      <div v-if="toastMessage" class="error-toast">
        <span class="toast-icon">⚠</span>
        {{ toastMessage }}
      </div>
    </Transition>
  </div>
</template>

<style>
@import url('https://fonts.googleapis.com/css2?family=M+PLUS+1+Code&display=swap');

/* グローバルCSS変数 */
:root {
  --bg:          #0a0a0a;
  --bg-panel:    #0d120d;
  --green:       #00ff41;
  --green-dim:   #33aa55;
  --green-dark:  #001a00;
  --green-glow:  rgba(0, 255, 65, 0.25);
  --text:        #b8ffb8;
  --text-dim:    rgba(184, 255, 184, 0.45);
  --danger:      #ff3333;
  --amber:       #ffbb00;
  --font-mono:   'M PLUS 1 Code', monospace;
  --font-hand:   'M PLUS 1 Code', monospace;
  --scanline: repeating-linear-gradient(
    to bottom,
    transparent 0px, transparent 2px,
    rgba(0, 0, 0, 0.15) 2px, rgba(0, 0, 0, 0.15) 3px
  );
}

/* グローバルリセット */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html, body, #app { width: 100%; height: 100%; overflow: hidden; background: var(--bg); }
button { outline: none; }
body { font-family: var(--font-mono); }
</style>

<style scoped>
.app-root {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
}
.game-canvas {
  position: absolute;
  inset: 0;
  display: block;
}

/* タイトル */
.title-screen {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg);
  z-index: 100;
}

/* スキャンライン */
.title-scanlines {
  position: absolute;
  inset: 0;
  background: var(--scanline);
  pointer-events: none;
}

/* グリッド背景（説明書イメージ） */
.title-grid-bg {
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(to right, rgba(0,255,65,0.04) 1px, transparent 1px),
    linear-gradient(to bottom, rgba(0,255,65,0.04) 1px, transparent 1px);
  background-size: 20px 20px;
  pointer-events: none;
  opacity: 0.5;
}

.title-card {
  text-align: center;
  font-family: var(--font-mono);
  color: var(--text);
  background: var(--bg-panel);
  border: 1px solid var(--green-dim);
  padding: 36px 48px 30px;
  max-width: 480px;
  width: 90%;
  box-shadow:
    0 0 30px var(--green-glow),
    inset 0 1px 0 rgba(0,255,65,0.1);
  animation: titleCardIn 0.6s cubic-bezier(0.22, 1, 0.36, 1) both;
}

@keyframes titleCardIn {
  0%   { opacity: 0; transform: translateY(20px); }
  100% { opacity: 1; transform: translateY(0); }
}

/* 書類ヘッダー */
.title-doc-header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 10px;
}
.title-doc-tag {
  font-size: 9px;
  letter-spacing: 2px;
  color: var(--green-dim);
  text-transform: uppercase;
  font-family: var(--font-mono);
}

.title-rule {
  height: 1px;
  background: linear-gradient(to right, transparent, var(--green-dim), transparent);
  margin-bottom: 22px;
}

.title-main {
  font-size: clamp(28px, 5vw, 42px);
  font-weight: bold;
  letter-spacing: 1px;
  margin-bottom: 18px;
  line-height: 1.35;
  color: var(--green);
  text-shadow: 0 0 20px var(--green-glow);
  font-family: var(--font-hand);
}

.title-sub {
  font-size: 13px;
  color: var(--text-dim);
  line-height: 2.1;
  margin-bottom: 30px;
  letter-spacing: 0.3px;
  font-family: var(--font-mono);
}

.title-btn {
  background: transparent;
  color: var(--green);
  border: 1.5px solid var(--green-dim);
  padding: 11px 36px;
  font-size: 15px;
  font-family: var(--font-mono);
  cursor: pointer;
  letter-spacing: 3px;
  transition: background 0.18s, border-color 0.18s, color 0.18s, box-shadow 0.18s;
  margin-bottom: 20px;
  display: inline-block;
}
.title-btn:hover {
  background: var(--green-dark);
  border-color: var(--green);
  color: var(--green);
  box-shadow: 0 0 20px var(--green-glow);
}
.title-btn:active { transform: translateY(1px); }
.title-btn-bracket { color: var(--green-dim); }

/* 操作説明 */
.title-controls {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-size: 11px;
  color: rgba(255,255,255,0.25);
}
.ctrl-group { display: flex; align-items: center; gap: 4px; }
.ctrl-key {
  display: inline-block;
  background: var(--green-dark);
  border: 1px solid var(--green-dim);
  border-bottom-width: 2px;
  color: var(--green);
  font-family: var(--font-mono);
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 2px;
  letter-spacing: 0;
}
.ctrl-desc { color: var(--text-dim); letter-spacing: 0.5px; }
.ctrl-sep { color: var(--green-dim); }

/* ── ギブアップエリア ── */
.giveup-area {
  position: absolute;
  bottom: 16px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  z-index: 15;
}
.giveup-btn {
  background: transparent;
  border: 1px solid var(--green-dim);
  border-bottom: 2px solid var(--green-dim);
  color: var(--green);
  padding: 7px 20px;
  font-size: 12px;
  font-family: var(--font-mono);
  cursor: pointer;
  border-radius: 3px;
  letter-spacing: 0.5px;
  transition: background 0.15s, border-color 0.15s, color 0.15s, box-shadow 0.15s;
  white-space: nowrap;
}
.giveup-btn:hover {
  background: var(--green-dark);
  border-color: var(--green);
  color: var(--green);
  box-shadow: 0 0 12px var(--green-glow);
}
.giveup-hint {
  font-size: 10px;
  color: var(--text-dim);
  font-family: var(--font-mono);
  letter-spacing: 0.5px;
}

/* ギブアップ表示トランジション */
.giveup-reveal-enter-active {
  animation: giveupSlideUp 0.4s cubic-bezier(0.22, 1, 0.36, 1) both;
}
.giveup-reveal-leave-active { transition: opacity 0.3s; }
.giveup-reveal-leave-to     { opacity: 0; }
@keyframes giveupSlideUp {
  0%   { opacity: 0; transform: translateX(-50%) translateY(10px); }
  100% { opacity: 1; transform: translateX(-50%) translateY(0); }
}

/* ジャンル確定演出 */
.genre-locked-effect {
  position: absolute;
  inset: 0;
  z-index: 25;
  pointer-events: none;
}

/* インク滲みエフェクト */
.genre-ink-bleed {
  position: absolute;
  inset: 0;
  background: radial-gradient(ellipse at center, rgba(0,0,0,0.4) 0%, transparent 70%);
  animation: inkBleedPulse 0.8s ease-out forwards;
}

@keyframes inkBleedPulse {
  0% { opacity: 0; }
  50% { opacity: 1; }
  100% { opacity: 0; }
}

/* ジャンル確定バナー */
.genre-locked-banner {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: var(--bg-panel);
  border: 2px solid var(--green);
  color: var(--green);
  padding: 16px 40px;
  font-family: var(--font-mono);
  font-size: 18px;
  z-index: 26;
  max-width: 520px;
  text-align: center;
  backdrop-filter: blur(6px);
  box-shadow: 0 8px 30px var(--green-glow);
  letter-spacing: 0.5px;
  font-weight: 500;
  animation: genreNameReveal 1.2s cubic-bezier(0.34, 1.56, 0.64, 1) 0.8s both;
}

.genre-locked-text {
  line-height: 1.8;
  clip-path: inset(0 0 0 0);
}

@keyframes genreNameReveal {
  0% {
    opacity: 0;
    transform: translate(-50%, -50%) scale(0.8);
  }
  100% {
    opacity: 1;
    transform: translate(-50%, -50%) scale(1);
  }
}

/* トランジション */
.fade-enter-active, .fade-leave-active { transition: opacity 0.3s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

.genre-reveal-enter-active {
  /* Animation handled by .genre-locked-banner keyframes */
}
.genre-reveal-leave-active {
  transition: opacity 0.5s;
}
.genre-reveal-leave-to { opacity: 0; }

/* グリッド背景（説明書イメージ） */
.title-grid-bg {
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(to right, rgba(255,255,255,0.03) 1px, transparent 1px),
    linear-gradient(to bottom, rgba(255,255,255,0.03) 1px, transparent 1px);
  background-size: 20px 20px;
  pointer-events: none;
  opacity: 0.4;
}

/* ── エラートースト ── */
.error-toast {
  position: absolute;
  top: 56px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(30, 0, 0, 0.92);
  border: 1px solid #ff3333;
  color: #ff8888;
  padding: 8px 18px;
  font-size: 12px;
  font-family: var(--font-mono);
  border-radius: 2px;
  z-index: 80;
  white-space: nowrap;
  display: flex;
  align-items: center;
  gap: 7px;
  box-shadow: 0 0 16px rgba(255, 51, 51, 0.3);
  pointer-events: none;
}
.toast-icon { color: #ff3333; font-size: 14px; }
.toast-enter-active { animation: toastIn 0.25s ease both; }
.toast-leave-active { animation: toastIn 0.3s ease reverse both; }
@keyframes toastIn {
  0%   { opacity: 0; transform: translateX(-50%) translateY(-6px); }
  100% { opacity: 1; transform: translateX(-50%) translateY(0); }
}

/* 点滅カーソル */
.title-cursor {
  display: inline-block;
  animation: titleCursorBlink 1s steps(1, start) infinite;
  color: #e8e8ee;
}

@keyframes titleCursorBlink {
  0%, 49% { opacity: 1; }
  50%, 100% { opacity: 0; }
}

/* 説明書更新時のフォーカスオーバーレイ */
.manual-focus-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  z-index: 40;
  pointer-events: none;
}
</style>
