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
import DebugPanel from './components/DebugPanel.vue'
import { GENRES } from './data/genres'
import type { ThrowResult } from './domain/types'

// ─── 状態 ─────────────────────────────────────────────────────────
const gameState = useGameState()
const manualCtl = useManual(gameState.currentManual)

const canvasRef = ref<HTMLCanvasElement | null>(null)
let scroller: SideScroller | null = null

const snapshot = ref<GameSnapshot>({
  distance: 0, playScore: 0, combo: 0, kills: 0, exp: 0,
  beatHits: 0, survivedSec: 0, hp: 3, maxHp: 3, dead: false, shouldUpdate: null,
  statJumps: 0, statMoveLeft: 0, statMoveRight: 0,
})

// ─── Canvas サイズをウィンドウに合わせる ───────────────────────────
function resizeCanvas() {
  const canvas = canvasRef.value
  if (!canvas) return
  canvas.width  = window.innerWidth
  canvas.height = window.innerHeight
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
  beginSnapshotLoop()
}

// ─── スナップショット監視ループ ──────────────────────────────────
let snapRaf = 0
function beginSnapshotLoop() {
  function loop() {
    if (!scroller) return
    snapshot.value = scroller.getSnapshot()

    // 更新トリガー（tutorial と playing 両方で発火する）
    // 最初のジャンプまで待つ
    const activePlay = gameState.phase.value === 'playing' || gameState.phase.value === 'tutorial'
    if (snapshot.value.shouldUpdate !== null && snapshot.value.firstJumpDone && activePlay) {
      scroller.setPaused(true)
      gameState.triggerUpdate()
    }

    // ゲームオーバー → 投擲フェーズへ自動移行
    const p = gameState.phase.value
    if (snapshot.value.dead && p !== 'throwing' && p !== 'ending' && p !== 'updating') {
      gameState.startThrowing(snapshot.value.playScore)
    }

    snapRaf = requestAnimationFrame(loop)
  }
  snapRaf = requestAnimationFrame(loop)
}

// ─── 選択後の処理 ────────────────────────────────────────────────
function onChoose(choiceId: string) {
  const idx = snapshot.value.shouldUpdate ?? 0
  gameState.choose(choiceId)
  // 新しい説明書を記録（差分演出）
  manualCtl.recordUpdate(gameState.currentManual())
  // ルールをゲームエンジンへ反映
  scroller?.updateRules(gameState.rules)
  // 更新完了を scroller に通知
  scroller?.markUpdated(idx)
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

// ─── 再開フェーズで一時停止解除 ────
watch(gameState.phase, (newPhase) => {
  if (['playing', 'tutorial', 'genreLocked'].includes(newPhase)) {
    scroller?.setPaused(false)
  }
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

        <div class="title-card">
          <!-- 書類風ヘッダー -->
          <div class="title-doc-header">
            <span class="title-doc-tag">GAME MANUAL</span>
            <span class="title-doc-tag">ver.1.0</span>
          </div>

          <div class="title-rule" />

          <div class="title-main">取扱説明書を<br>読むゲーム</div>

          <div class="title-sub">
            説明書が更新されるたびにゲームが変わる。<br>
            あなたはどんなゲームを作りますか？
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

    <!-- ─── ゲームプレイ中 HUD ─── -->
    <template v-if="gameState.phase.value !== 'title' && gameState.phase.value !== 'ending'">
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
        :history="manualCtl.history.value"
        :features="gameState.rules.features"
      />

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

      <!-- ジャンル確定バナー -->
      <Transition name="genre-reveal">
        <div v-if="gameState.phase.value === 'genreLocked'" class="genre-locked-banner">
          <div class="genre-locked-text">
            {{ gameState.lockedGenreDef()?.manualReveal }}
          </div>
        </div>
      </Transition>
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

    <!-- ─── デバッグパネル（開発用） ─── -->
    <DebugPanel
      :choice-history="gameState.choiceHistory"
      :current-manual="gameState.currentManual"
      :locked-genre="gameState.lockedGenre.value"
      :phase="gameState.phase.value"
    />
  </div>
</template>

<style>
@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;600;700&family=Caveat:wght@400;700&display=swap');

/* グローバルリセット */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html, body, #app { width: 100%; height: 100%; overflow: hidden; background: #111; }
button { outline: none; }
body { font-family: 'Noto Sans JP', 'Courier New', sans-serif; }
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
  background: rgba(8, 8, 18, 0.96);
  z-index: 100;
}

/* スキャンライン */
.title-scanlines {
  position: absolute;
  inset: 0;
  background: repeating-linear-gradient(
    to bottom,
    transparent 0px, transparent 3px,
    rgba(0,0,0,0.07) 3px, rgba(0,0,0,0.07) 4px
  );
  pointer-events: none;
}

.title-card {
  text-align: center;
  font-family: 'Courier New', Courier, monospace;
  color: #e8e8ee;
  background: rgba(255,255,255,0.02);
  border: 1px solid rgba(255,255,255,0.10);
  padding: 36px 48px 30px;
  max-width: 480px;
  width: 90%;
  box-shadow:
    0 0 60px rgba(0,0,0,0.8),
    inset 0 1px 0 rgba(255,255,255,0.04);
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
  color: rgba(255,255,255,0.2);
  text-transform: uppercase;
}

.title-rule {
  height: 1px;
  background: linear-gradient(to right, transparent, rgba(255,255,255,0.15), transparent);
  margin-bottom: 22px;
}

.title-main {
  font-size: clamp(24px, 4.5vw, 38px);
  font-weight: bold;
  letter-spacing: 2px;
  margin-bottom: 18px;
  line-height: 1.35;
  color: #ffffff;
  text-shadow: 0 0 30px rgba(255,255,255,0.15);
}

.title-sub {
  font-size: 13px;
  color: rgba(255,255,255,0.45);
  line-height: 2.1;
  margin-bottom: 30px;
  letter-spacing: 0.3px;
}

.title-btn {
  background: transparent;
  color: #fff;
  border: 1.5px solid rgba(255,255,255,0.5);
  padding: 11px 36px;
  font-size: 15px;
  font-family: inherit;
  cursor: pointer;
  letter-spacing: 3px;
  transition: background 0.18s, border-color 0.18s, color 0.18s, box-shadow 0.18s;
  margin-bottom: 20px;
  display: inline-block;
}
.title-btn:hover {
  background: #cc0000;
  border-color: #cc0000;
  color: #fff;
  box-shadow: 0 0 20px rgba(200,0,0,0.4);
}
.title-btn:active { transform: translateY(1px); }
.title-btn-bracket { color: rgba(255,255,255,0.4); }

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
  background: rgba(255,255,255,0.08);
  border: 1px solid rgba(255,255,255,0.18);
  border-bottom-width: 2px;
  color: rgba(255,255,255,0.55);
  font-family: inherit;
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 2px;
  letter-spacing: 0;
}
.ctrl-desc { color: rgba(255,255,255,0.22); letter-spacing: 0.5px; }
.ctrl-sep { color: rgba(255,255,255,0.15); }

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
  background: rgba(255, 255, 255, 0.07);
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-bottom: 2px solid rgba(255, 255, 255, 0.18);
  color: rgba(255, 255, 255, 0.55);
  padding: 7px 20px;
  font-size: 12px;
  font-family: 'Courier New', monospace;
  cursor: pointer;
  border-radius: 3px;
  letter-spacing: 0.5px;
  transition: background 0.15s, border-color 0.15s, color 0.15s;
  white-space: nowrap;
}
.giveup-btn:hover {
  background: rgba(180, 0, 0, 0.35);
  border-color: rgba(200, 50, 50, 0.7);
  color: #fff;
}
.giveup-hint {
  font-size: 10px;
  color: rgba(255, 255, 255, 0.22);
  font-family: monospace;
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

/* ジャンル確定バナー */
.genre-locked-banner {
  position: absolute;
  top: 68px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(0,0,0,0.88);
  border: 1px solid rgba(255,255,255,0.22);
  color: #fff;
  padding: 10px 28px;
  font-family: 'Courier New', monospace;
  font-size: 13px;
  z-index: 20;
  max-width: 520px;
  text-align: center;
  backdrop-filter: blur(6px);
  box-shadow: 0 4px 20px rgba(0,0,0,0.5);
  letter-spacing: 0.3px;
}
.genre-locked-text { line-height: 1.6; }

/* トランジション */
.fade-enter-active, .fade-leave-active { transition: opacity 0.3s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

.genre-reveal-enter-active {
  animation: revealBanner 0.5s ease;
}
.genre-reveal-leave-active {
  transition: opacity 1s 3s;
}
.genre-reveal-leave-to { opacity: 0; }

@keyframes revealBanner {
  0% { opacity: 0; transform: translateX(-50%) translateY(-10px); }
  100% { opacity: 1; transform: translateX(-50%) translateY(0); }
}
</style>
