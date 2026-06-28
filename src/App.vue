<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, computed, toRaw } from 'vue'
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
import GenreRevealOverlay from './components/GenreRevealOverlay.vue'
import { GENRES, GENRE_THEME_COLORS } from './data/genres'
import { GENRE_LOCKED_BOOST } from './data/gameBalance'
import type { ThrowResult, RuntimeRules } from './domain/types'
import { TUTORIAL_ENABLED, TutorialScreen } from './tutorial'
import { soundManager } from './plugins/SoundManager'
import { DEBUG_MODE } from './debug/const'
import { useDebugSettings } from './debug/useDebugSettings'
import DebugPanel from './debug/DebugPanel.vue'
import type { DebugSettings } from './debug/types'

// ─── 状態 ─────────────────────────────────────────────────────────
const gameState = useGameState()
const manualCtl = useManual(gameState.currentManual)
const debugCtl = useDebugSettings()

/** readonly() ラッパーを剥がして RuntimeRules として返す */
function getRules(): RuntimeRules {
  const raw = toRaw(gameState.rules)
  // toRaw の戻り値型は DeepReadonly だが、実際のオブジェクトはミュータブル
  return raw as RuntimeRules
}

/** getRules の結果をディープコピー（Set 参照も複製）して返す */
function cloneRules(): RuntimeRules {
  const raw = getRules()
  return {
    ...raw,
    controls: { ...raw.controls },
    hazardColors: new Set(raw.hazardColors),
    safeColors: new Set(raw.safeColors),
    features: new Set(raw.features),
  }
}

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
  const canvas = canvasRef.value
  if (!canvas) {
    showToast('エラー: キャンバスが初期化されていません')
    return
  }
  resizeCanvas()
  scroller = new SideScroller(canvas, getRules())
  // 初期説明書を履歴に登録
  manualCtl.recordUpdate(gameState.currentManual())
  scroller.start()
  // チュートリアル有効時は一時停止（チュートリアル画面の背後で静止）
  if (TUTORIAL_ENABLED) {
    scroller.setPaused(true)
  }

  // デバッグ: ジャンル強制（lockedGenre の watch が scroller へルールを反映する）
  if (debugCtl.debugSettings.forceGenre) {
    gameState.debugForceGenre(debugCtl.debugSettings.forceGenre)
    // チュートリアルをスキップして genreLocked へ直行するため明示的に再開する。
    // phase が title→genreLocked と遷移し shouldPause が変化しないため watch では再開されない。
    scroller.setPaused(false)
  }

  beginSnapshotLoop()
}

// ─── デバッグパネル「OK」: 設定を反映して通常フローでゲーム開始 ───
function onDebugApply(settings: DebugSettings) {
  debugCtl.applyDebug(settings)
  startGame()
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
    // scroller が存在しない（タイトル画面等）場合はループ継続のみ
    if (!scroller) {
      snapRaf = requestAnimationFrame(loop)
      return
    }
    snapshot.value = scroller.getSnapshot()

    // 更新トリガー（tutorial / playing / genreLocked で発火）
    // genreLocked 後もカード選択は続く（ジャンルは固定のまま説明書テキストだけ追記）
    // 最初のジャンプまで待つ
    const activePlay = ['playing', 'tutorial', 'genreLocked'].includes(gameState.phase.value)
    if (snapshot.value.shouldUpdate !== null && snapshot.value.firstJumpDone && activePlay) {
      scroller.setPaused(true)
      if (!gameState.triggerUpdate()) {
        // カードプールが枯渇した場合はスキップしてゲームを続行
        scroller.markUpdated(snapshot.value.shouldUpdate)
        scroller.setPaused(false)
      }
    }

    // ゲームオーバー → 投擲フェーズへ自動移行
    const p = gameState.phase.value
    if (snapshot.value.dead && p !== 'throwing' && p !== 'ending' && p !== 'updating') {
      gameState.startThrowing()
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
function onChoose(cardId: string) {
  if (!scroller) {
    showToast('エラー: ゲームが初期化されていません')
    return
  }
  const idx = snapshot.value.shouldUpdate ?? 0
  const chooseError = gameState.choose(cardId)
  if (chooseError) {
    showToast(`エラー: ${chooseError}`)
    return
  }
  // 新しい説明書を記録（差分演出）
  const currentManual = gameState.currentManual()
  manualCtl.recordUpdate(currentManual)
  // ルールをゲームエンジンへ反映
  scroller.updateRules(getRules(), currentManual)
  // 更新完了を scroller に通知
  scroller.markUpdated(idx)
}

// ─── ギブアップ ───────────────────────────────────────────────────
function giveUp() {
  scroller?.recalcPlayScore()  // 死亡経路と同様に scoreFormula を適用して確定
  scroller?.setPaused(true)
  gameState.startThrowing()
}

// ─── 投擲完了 ────────────────────────────────────────────────────
function onThrown(result: ThrowResult) {
  scroller?.stop()  // 投擲後はscrollerループを停止
  gameState.finalizeThrowing(result, snapshot.value.playScore)
}

// ─── リスタート ──────────────────────────────────────────────────
function restart() {
  if (genreLockedBoostTimer !== null) {
    clearTimeout(genreLockedBoostTimer)
    genreLockedBoostTimer = null
  }
  cancelAnimationFrame(snapRaf)
  scroller?.stop()
  scroller = null
  revealActive.value = false
  soundManager.stopBgm(600)
  gameState.restart()
  // タイトルへ戻る際にデバッグ設定をクリア（DebugPanel 再マウント時の表示と一致させる）
  debugCtl.resetDebug()
}

// ─── 現在のジャンルテーマ ─────────────────────────────────────────
const currentTheme = computed(() => {
  const genre = gameState.lockedGenre.value
  if (!genre) return 'plain'
  return GENRES.find(g => g.id === genre)?.theme ?? 'plain'
})

// ─── ゲームプレイ中UIの表示判定（フェーズ追加時の保守性向上） ─────
const showGameUI = computed(() => {
  const p = gameState.phase.value
  return !['title', 'ending', 'tutorialIntro'].includes(p)
})

// ─── ジャンル別テーマカラー CSS 変数（JSON 駆動 #36） ─────────────
const giveupThemeStyle = computed(() => {
  const colors = GENRE_THEME_COLORS[currentTheme.value]
  if (!colors) return {}
  return {
    '--genre-btn-accent': colors.accent,
    '--genre-btn-border': colors.border,
    '--genre-hint-color': colors.hint ?? 'var(--text-dim)',
    '--genre-btn-font':   colors.font  ?? 'var(--font-mono)',
    '--genre-btn-bg':     colors.bg    ?? 'var(--green-dark)',
    '--genre-btn-glow':   colors.glow  ?? 'var(--green-glow)',
  }
})

// ─── フェーズ遷移で一時停止/再開 ────
// 2つのwatchを統合し、一時停止/再開の競合状態を防ぐ
// 一時停止条件:
//   - phase === 'updating'（選択肢表示中）
//   - isCentered === true（説明書中央表示アニメーション中）
//   - phase === 'tutorialIntro'（チュートリアル画面中）
// 再開条件:
//   - phase が playing/tutorial/genreLocked かつ isCentered === false
const shouldPause = computed(() => {
  const p = gameState.phase.value
  if (p === 'updating') return true
  if (p === 'tutorialIntro') return true
  // 説明書非表示時はセンタリング演出が見えないため停止もしない
  if (manualCtl.isCentered.value && debugCtl.debugSettings.showManual) return true
  return false
})


watch(shouldPause, (paused) => {
  scroller?.setPaused(paused)
})

// ─── ジャンル確定オーバーレイ ────
const revealActive = ref(false)

// ─── ジャンル確定時: 加速エフェクト + BGM + オーバーレイ ────
let genreLockedBoostTimer: ReturnType<typeof setTimeout> | null = null
watch(() => gameState.lockedGenre.value, (newGenre) => {
  if (!newGenre || !scroller) return

  // 演出オーバーレイ表示
  revealActive.value = true

  // BGM 起動
  const genreDef = gameState.lockedGenreDef()
  if (genreDef?.bgm) {
    soundManager.playBgm(genreDef.bgm)
  }

  // 前のタイマーをクリア（重複防止）
  if (genreLockedBoostTimer !== null) clearTimeout(genreLockedBoostTimer)

  // cloneRules で Set 参照も複製し、元の rules に影響しないようにする
  const rawRules = cloneRules()
  rawRules.scrollSpeed = rawRules.scrollSpeed * GENRE_LOCKED_BOOST.mult
  scroller.updateRules(rawRules, gameState.currentManual())

  genreLockedBoostTimer = window.setTimeout(() => {
    genreLockedBoostTimer = null
    scroller?.updateRules(getRules(), gameState.currentManual())
  }, GENRE_LOCKED_BOOST.durationMs)
})

onMounted(() => {
  window.addEventListener('resize', resizeCanvas)
})
onUnmounted(() => {
  cancelAnimationFrame(snapRaf)
  scroller?.stop()
  if (genreLockedBoostTimer !== null) clearTimeout(genreLockedBoostTimer)
  if (toastTimer !== null) clearTimeout(toastTimer)
  window.removeEventListener('resize', resizeCanvas)
})
</script>

<template>
  <div class="app-root" :class="gameState.lockedGenre.value ? `genre-locked-root theme-global-${currentTheme}` : ''"  >
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

    <!-- ─── デバッグパネル（DEBUG_MODE 時のみ・タイトル画面に重畳） ─── -->
    <DebugPanel
      v-if="DEBUG_MODE && gameState.phase.value === 'title'"
      @apply="onDebugApply"
    />

    <!-- ─── チュートリアル画面 ─── -->
    <Transition name="fade">
      <TutorialScreen
        v-if="gameState.phase.value === 'tutorialIntro'"
        @start="startTutorial"
      />
    </Transition>

    <!-- ─── ゲームプレイ中 HUD ─── -->
    <template v-if="showGameUI">
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
        v-if="gameState.phase.value !== 'throwing' && debugCtl.debugSettings.showManual"
        :manual="gameState.currentManual()"
        :theme="currentTheme"
        :diff-lines="manualCtl.diffLines.value"
        :is-animating="manualCtl.isAnimating.value"
        :is-centered="manualCtl.isCentered.value"
        :history="manualCtl.history.value"
        :features="gameState.rules.features"
        :controls="gameState.rules.controls"
        :highlight="gameState.phase.value === 'tutorial'"
      />

      <!-- 説明書更新時のフォーカスオーバーレイ -->
      <Transition name="fade">
        <div v-if="manualCtl.isCentered.value && debugCtl.debugSettings.showManual" class="manual-focus-overlay" />
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
          :style="giveupThemeStyle"
        >
          <button class="giveup-btn" tabindex="-1" @click="giveUp">
            説明書を投げてゲームを終わらせる
          </button>
          <div class="giveup-hint">ドラッグして投げると高スコア</div>
        </div>
      </Transition>

      <!-- ジャンル確定オーバーレイ（2.8秒で自動退場） -->
      <Transition name="fade">
        <GenreRevealOverlay
          v-if="revealActive"
          :genre-label="gameState.lockedGenreDef()?.label ?? ''"
          :manual-reveal="gameState.lockedGenreDef()?.manualReveal ?? ''"
          :theme="currentTheme"
          @dismissed="revealActive = false"
        />
      </Transition>
    </template>

    <!-- ─── 2択選択 ─── -->
    <Transition name="fade">
      <ChoicePanel
        v-if="gameState.phase.value === 'updating'"
        :choices="gameState.activeCards.value"
        :version="gameState.currentManual().version"
        :locked-genre="gameState.lockedGenre.value ?? undefined"
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
  --font-mono:   'Courier New', 'Consolas', 'Liberation Mono', monospace;
  --font-hand:   'Courier New', 'Consolas', 'Liberation Mono', monospace;
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
  border: 1px solid var(--genre-btn-border, var(--green-dim));
  border-bottom: 2px solid var(--genre-btn-border, var(--green-dim));
  color: var(--genre-btn-accent, var(--green));
  padding: 7px 20px;
  font-size: 12px;
  font-family: var(--genre-btn-font, var(--font-mono));
  cursor: pointer;
  border-radius: 3px;
  letter-spacing: 0.5px;
  transition: background 0.15s, border-color 0.15s, color 0.15s, box-shadow 0.15s;
  white-space: nowrap;
}
.giveup-btn:hover {
  background: var(--genre-btn-bg, var(--green-dark));
  border-color: var(--genre-btn-accent, var(--green));
  color: var(--genre-btn-accent, var(--green));
  box-shadow: 0 0 12px var(--genre-btn-glow, var(--green-glow));
}
.giveup-hint {
  font-size: 10px;
  color: var(--genre-hint-color, var(--text-dim));
  font-family: var(--genre-btn-font, var(--font-mono));
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
