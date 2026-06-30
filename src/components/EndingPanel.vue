<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue'
import type { FinalScore, GenreId, PlayStyleResult, ContradictionState } from '../domain/types'
import { GENRES, GENRE_THEME_COLORS } from '../data/genres'
import { resolveAllMetGenres } from '../domain/genreResolver'
import { generatePlayStyleNarrative, describePlayStyle } from '../domain/playStyleDetector'
import { generateBadEndingMessage, getContradictionSeverity } from '../domain/contradictionTracker'

const props = defineProps<{
  finalScore: FinalScore
  genre: GenreId
  choiceCount: number
  /** プレイスタイル検出結果（Issue #24） */
  playStyleResult?: PlayStyleResult
  /** 矛盾トラッキング状態（Issue #24） */
  contradictionState?: ContradictionState
  /** 累積 genreParams（別ルート計算用） */
  accumulatedParams?: Record<string, number>
}>()

const emit = defineEmits<{ (e: 'restart'): void }>()

const genreDef = GENRES.find(g => g.id === props.genre)
const genreLabel = genreDef?.label ?? 'ゲーム'
const endingFlavor = genreDef?.endingFlavor ?? ''

// バッドエンド判定
const isBadEnding = computed(() => {
  return props.genre === 'glitch' || (props.contradictionState?.badEndingTriggered ?? false)
})

// 矛盾レベル
const contradictionLevel = computed(() => props.contradictionState?.level ?? 0)
const contradictionSeverity = computed(() => getContradictionSeverity(contradictionLevel.value))

// 別ルート: ベイズ事後確率でフィルタリング（candidateThreshold 以上のもののみ）
const otherGenres = computed(() => {
  if (props.accumulatedParams) {
    return resolveAllMetGenres(props.accumulatedParams, GENRES)
      .map(id => GENRES.find(g => g.id === id))
      .filter((g): g is NonNullable<typeof g> => g != null && g.id !== props.genre)
  }
  // fallback: 全ジャンル
  return GENRES.filter(g => g.id !== props.genre && g.id !== 'base' && g.id !== 'glitch')
})

// プレイスタイルナラティブ
const playStyleNarrative = computed(() => {
  if (!props.playStyleResult) return null
  return generatePlayStyleNarrative(props.playStyleResult)
})

// プレイスタイルの説明
const dominantPlayStyle = computed(() => {
  if (!props.playStyleResult?.dominant) return null
  return describePlayStyle(props.playStyleResult.dominant)
})

// バッドエンドメッセージ
const badEndingMessage = computed(() => {
  if (!isBadEnding.value || !props.contradictionState) return null
  return generateBadEndingMessage(props.contradictionState.events)
})

// ── カウントアップ ───────────────────────────────
const displayPlay  = ref(0)
const displayThrow = ref(0)
const displayTotal = ref(0)
const gradeVisible = ref(false)
const altVisible   = ref(false)
const narrativeVisible = ref(false)

function grade(total: number): string {
  if (total >= 8000) return 'S'
  if (total >= 5000) return 'A'
  if (total >= 2500) return 'B'
  if (total >= 1000) return 'C'
  return 'D'
}

const gradeStr = computed(() => grade(props.finalScore.total))

// ジャンルごとのアクセントカラー（JSON 駆動）
function genreToAccent(genre: GenreId): string {
  // GENRE_THEME_COLORS から取得（JSON 定義優先）
  const themeColors = GENRE_THEME_COLORS[genre]
  if (themeColors?.accent) return themeColors.accent
  // フォールバック: ジャンル定義の bgColor
  const def = GENRES.find(g => g.id === genre)
  if (def?.bgColor) return def.bgColor
  return '#cc2222'
}
const accentColor = genreToAccent(props.genre)

// 矛盾レベルに応じたカードスタイル
const cardGlitchClass = computed(() => {
  if (isBadEnding.value) return 'ending-card-glitch'
  if (contradictionSeverity.value === 'severe') return 'ending-card-severe'
  if (contradictionSeverity.value === 'moderate') return 'ending-card-moderate'
  return ''
})

function easeOut(t: number): number {
  return 1 - Math.pow(1 - t, 3)
}

// RAF ID トラッキング（unmount 時にキャンセル）
const animRafs: number[] = []
// setTimeout ID トラッキング（unmount 時にキャンセル）
const animTimers: ReturnType<typeof setTimeout>[] = []

function animateCount(target: number, setter: (v: number) => void, delay: number, duration = 900): void {
  animTimers.push(setTimeout(() => {
    const start = performance.now()
    function step(now: number) {
      const t = Math.min((now - start) / duration, 1)
      setter(Math.round(easeOut(t) * target))
      if (t < 1) {
        const id = requestAnimationFrame(step)
        animRafs.push(id)
      }
    }
    const id = requestAnimationFrame(step)
    animRafs.push(id)
  }, delay))
}

onMounted(() => {
  animateCount(props.finalScore.play,  v => displayPlay.value  = v, 400)
  animateCount(props.finalScore.throw, v => displayThrow.value = v, 900)
  animateCount(props.finalScore.total, v => displayTotal.value = v, 1400, 600)
  animTimers.push(setTimeout(() => { gradeVisible.value = true }, 2200))
  animTimers.push(setTimeout(() => { narrativeVisible.value = true }, 2500))
  animTimers.push(setTimeout(() => { altVisible.value   = true }, 2700))
})

onUnmounted(() => {
  for (const id of animRafs) cancelAnimationFrame(id)
  for (const id of animTimers) clearTimeout(id)
  animRafs.length = 0
  animTimers.length = 0
})
</script>

<template>
  <div class="ending-overlay" :class="{ 'ending-overlay-glitch': isBadEnding }">
    <div class="ending-card" :class="cardGlitchClass">
      <!-- バッドエンド時のエラー風演出 -->
      <Transition name="glitch-flash">
        <div v-if="isBadEnding" class="ending-glitch-header">
          <div class="glitch-error-code">ERROR: MANUAL_CORRUPTION</div>
          <div class="glitch-sub-error">説明書の整合性が崩壊しました</div>
        </div>
      </Transition>

      <!-- ジャンル確定 -->
      <div class="ending-genre-section">
        <div class="ending-genre-label" :class="{ 'glitch-text': isBadEnding }">
          {{ isBadEnding ? 'ゲームが壊れました' : 'ゲームが完成しました' }}
        </div>
        <div class="ending-genre-name" :style="{ '--accent': accentColor }" :class="{ 'glitch-name': isBadEnding }">
          {{ genreLabel }}
        </div>
        <div class="ending-genre-sub">
          {{ choiceCount }} 回の選択で作りました
        </div>
      </div>

      <!-- スコア内訳（バッドエンド時は表示を減らす） -->
      <div v-if="!isBadEnding" class="ending-score-box">
        <div class="score-row">
          <span class="score-label">プレイスコア</span>
          <span class="score-value">{{ displayPlay.toLocaleString() }}</span>
        </div>
        <div class="score-row">
          <span class="score-label">投擲スコア</span>
          <span class="score-value">{{ displayThrow.toLocaleString() }}</span>
        </div>
        <div class="score-divider" />
        <div class="score-row total">
          <span class="score-label">合計</span>
          <span class="score-value">{{ displayTotal.toLocaleString() }}</span>
        </div>
      </div>

      <!-- グレード（バッドエンド時は表示しない） -->
      <Transition name="grade-stamp">
        <div v-if="gradeVisible && !isBadEnding" class="ending-grade" :style="{ '--accent': accentColor }">
          {{ gradeStr }}
        </div>
      </Transition>

      <!-- プレイスタイルナラティブ（Issue #24: 隠しルート） -->
      <Transition name="fade-up">
        <div v-if="narrativeVisible && playStyleNarrative" class="ending-playstyle">
          <div class="playstyle-label">あなたのプレイスタイル</div>
          <div class="playstyle-desc">{{ dominantPlayStyle }}</div>
          <pre class="playstyle-narrative">{{ playStyleNarrative }}</pre>
        </div>
      </Transition>

      <!-- バッドエンドメッセージ（Issue #24: バッドエンド） -->
      <Transition name="fade-up">
        <div v-if="narrativeVisible && badEndingMessage" class="ending-bad-message">
          <pre>{{ badEndingMessage }}</pre>
        </div>
      </Transition>

      <!-- 矛盾レベル表示（Issue #24: 矛盾選択ルート） -->
      <Transition name="fade-up">
        <div v-if="narrativeVisible && contradictionLevel > 0 && !isBadEnding" class="ending-contradiction">
          <div class="contradiction-label">説明書の矛盾レベル</div>
          <div class="contradiction-bar">
            <div class="contradiction-fill" :style="{ width: `${contradictionLevel * 100}%` }" />
          </div>
          <div class="contradiction-hint">
            {{ contradictionLevel >= 0.6 ? 'もう少しで壊れていた…' : '矛盾が蓄積していました' }}
          </div>
        </div>
      </Transition>

      <!-- 別ルート示唆 -->
      <Transition name="fade-up">
        <div v-if="altVisible && otherGenres.length > 0" class="ending-alt">
          <div class="alt-label">別の選択をしていたら…</div>
          <div class="alt-routes">
            <span
              v-for="g in otherGenres"
              :key="g.id"
              class="alt-chip"
            >{{ g.label }}</span>
          </div>
          <div class="alt-hint">になっていたかもしれません。</div>
        </div>
      </Transition>

      <!-- エンディングフレーバー（バッドエンド時は非表示） -->
      <Transition name="fade-up">
        <div v-if="altVisible && endingFlavor && !isBadEnding" class="ending-flavor">
          {{ endingFlavor }}
        </div>
      </Transition>

      <button class="restart-btn" @click="emit('restart')">もう一度遊ぶ</button>
    </div>
  </div>
</template>

<style scoped>
.ending-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.88);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 50;
  backdrop-filter: blur(5px);
}

.ending-overlay-glitch {
  background: rgba(10, 0, 0, 0.95);
  backdrop-filter: blur(8px);
}

.ending-card {
  background: #0d120d;
  border: 2px solid #33aa55;
  border-radius: 2px;
  padding: 30px 38px 24px;
  max-width: 460px;
  width: 92%;
  box-shadow:
    0 0 20px rgba(0,255,65,0.15),
    0 0 60px rgba(0,0,0,0.6);
  font-family: 'M PLUS 1 Code', cursive;
  text-align: center;
  animation: cardIn 0.4s cubic-bezier(0.22, 1, 0.36, 1) both;
  position: relative;
}

.ending-card-moderate {
  border-color: #aa8833;
  box-shadow:
    0 0 20px rgba(170,136,51,0.2),
    0 0 60px rgba(0,0,0,0.6);
}

.ending-card-severe {
  border-color: #aa4433;
  box-shadow:
    0 0 20px rgba(170,68,51,0.25),
    0 0 60px rgba(0,0,0,0.6);
  animation: cardIn 0.4s cubic-bezier(0.22, 1, 0.36, 1) both, subtleShake 3s infinite;
}

.ending-card-glitch {
  background: #0a0000;
  border: 2px solid #ff0000;
  box-shadow:
    0 0 30px rgba(255,0,0,0.3),
    0 0 80px rgba(0,0,0,0.8);
  animation: cardIn 0.4s cubic-bezier(0.22, 1, 0.36, 1) both, glitchShake 0.5s infinite;
}

@keyframes cardIn {
  0%   { opacity: 0; transform: translateY(24px) scale(0.96); }
  100% { opacity: 1; transform: translateY(0) scale(1); }
}

@keyframes subtleShake {
  0%, 95% { transform: translateX(0); }
  96% { transform: translateX(-1px); }
  97% { transform: translateX(1px); }
  98% { transform: translateX(-1px); }
  99% { transform: translateX(0); }
}

@keyframes glitchShake {
  0% { transform: translateX(0) skewX(0); }
  20% { transform: translateX(-2px) skewX(-0.5deg); }
  40% { transform: translateX(2px) skewX(0.5deg); }
  60% { transform: translateX(-1px) skewX(-0.3deg); }
  80% { transform: translateX(1px) skewX(0.3deg); }
  100% { transform: translateX(0) skewX(0); }
}

/* ── バッドエンドヘッダー ── */
.ending-glitch-header {
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid rgba(255,0,0,0.3);
  animation: glitchFlash 2s infinite;
}

.glitch-error-code {
  font-size: 14px;
  color: #ff0000;
  font-family: 'M PLUS 1 Code', monospace;
  letter-spacing: 2px;
  font-weight: bold;
  text-shadow: 0 0 10px rgba(255,0,0,0.5);
}

.glitch-sub-error {
  font-size: 10px;
  color: rgba(255,100,100,0.6);
  margin-top: 4px;
  font-family: 'M PLUS 1 Code', monospace;
}

@keyframes glitchFlash {
  0%, 90%, 100% { opacity: 1; }
  92% { opacity: 0.5; }
  94% { opacity: 1; }
  96% { opacity: 0.3; }
}

.glitch-flash-enter-active {
  animation: glitchFlashIn 0.3s ease both;
}

@keyframes glitchFlashIn {
  0% { opacity: 0; transform: scale(1.1); }
  50% { opacity: 1; transform: scale(0.98); }
  100% { opacity: 1; transform: scale(1); }
}

/* ── ジャンルセクション ── */
.ending-genre-section {
  margin-bottom: 22px;
  border-bottom: 1px solid rgba(0,255,65,0.2);
  padding-bottom: 16px;
}

.ending-card-glitch .ending-genre-section {
  border-bottom-color: rgba(255,0,0,0.3);
}

.ending-genre-label {
  font-size: 10px;
  color: #33aa55;
  letter-spacing: 2px;
  text-transform: uppercase;
  margin-bottom: 6px;
  font-family: 'M PLUS 1 Code', monospace;
}

.glitch-text {
  color: #ff4444;
  animation: textGlitch 3s infinite;
}

@keyframes textGlitch {
  0%, 85%, 100% { opacity: 1; transform: none; }
  86% { opacity: 0.7; transform: translateX(-2px); }
  88% { opacity: 0.9; transform: translateX(2px); }
  90% { opacity: 1; transform: none; }
}

.ending-genre-name {
  font-size: 28px;
  font-weight: bold;
  color: #00ff41;
  letter-spacing: 1px;
  line-height: 1.2;
  margin-bottom: 6px;
  animation: genreReveal 0.6s 0.1s cubic-bezier(0.22, 1, 0.36, 1) both;
  text-shadow: 0 0 12px rgba(0,255,65,0.3);
  font-family: 'M PLUS 1 Code', cursive;
}

.glitch-name {
  color: #ff0000;
  text-shadow: 0 0 12px rgba(255,0,0,0.5);
  animation: genreReveal 0.6s 0.1s cubic-bezier(0.22, 1, 0.36, 1) both, nameGlitch 4s infinite;
}

@keyframes nameGlitch {
  0%, 80%, 100% { transform: scale(1); filter: none; }
  81% { transform: scale(1.02) skewX(-1deg); filter: hue-rotate(90deg); }
  83% { transform: scale(0.98) skewX(1deg); filter: hue-rotate(-90deg); }
  85% { transform: scale(1); filter: none; }
}

@keyframes genreReveal {
  0%   { opacity: 0; transform: scale(0.88); }
  100% { opacity: 1; transform: scale(1); }
}

.ending-genre-sub {
  font-size: 11px;
  color: rgba(184,255,184,0.35);
  letter-spacing: 0.5px;
  font-family: 'M PLUS 1 Code', cursive;
}

/* ── スコアボックス ── */
.ending-score-box {
  background: transparent;
  border: 1px solid rgba(0,255,65,0.2);
  border-radius: 1px;
  padding: 14px 18px;
  margin-bottom: 16px;
  text-align: left;
}

.score-row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  padding: 3px 0;
  font-size: 13px;
  color: #b8ffb8;
  font-family: 'M PLUS 1 Code', cursive;
}

.score-label {
  color: rgba(184,255,184,0.45);
  font-size: 11px;
  letter-spacing: 0.5px;
  font-family: 'M PLUS 1 Code', monospace;
}

.score-value {
  font-weight: bold;
  font-variant-numeric: tabular-nums;
  font-size: 15px;
  color: #00ff41;
  font-family: 'M PLUS 1 Code', monospace;
}

.score-divider {
  height: 1px;
  background: rgba(0,255,65,0.2);
  margin: 6px 0;
}

.score-row.total .score-label {
  font-size: 12px;
  color: #33aa55;
  font-weight: bold;
  letter-spacing: 1px;
  font-family: 'M PLUS 1 Code', monospace;
}

.score-row.total .score-value {
  font-size: 20px;
  color: #00ff41;
  font-family: 'M PLUS 1 Code', monospace;
}

/* ── グレード ── */
.ending-grade {
  font-size: 72px;
  font-weight: bold;
  color: #00ff41;
  line-height: 1;
  margin: 0 0 16px;
  text-shadow: 0 0 20px rgba(0,255,65,0.4);
  font-family: 'M PLUS 1 Code', monospace;
}

.grade-stamp-enter-active {
  animation: gradeStamp 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275) both;
}
@keyframes gradeStamp {
  0%   { opacity: 0; transform: scale(2.2) rotate(-8deg); }
  60%  { opacity: 1; transform: scale(0.9) rotate(1deg); }
  100% { opacity: 1; transform: scale(1) rotate(0deg); }
}

/* ── プレイスタイルナラティブ ── */
.ending-playstyle {
  margin-bottom: 20px;
  padding: 12px 16px;
  background: rgba(0,255,65,0.03);
  border: 1px solid rgba(0,255,65,0.15);
  border-radius: 2px;
  text-align: left;
}

.playstyle-label {
  font-size: 9px;
  color: rgba(0,255,65,0.5);
  letter-spacing: 2px;
  text-transform: uppercase;
  margin-bottom: 6px;
  font-family: 'M PLUS 1 Code', monospace;
}

.playstyle-desc {
  font-size: 11px;
  color: rgba(184,255,184,0.5);
  margin-bottom: 8px;
  font-family: 'M PLUS 1 Code', monospace;
}

.playstyle-narrative {
  font-size: 10.5px;
  color: rgba(184,255,184,0.4);
  font-style: italic;
  line-height: 1.8;
  white-space: pre-wrap;
  font-family: 'M PLUS 1 Code', monospace;
  margin: 0;
}

/* ── バッドエンドメッセージ ── */
.ending-bad-message {
  margin-bottom: 20px;
  padding: 12px 16px;
  background: rgba(255,0,0,0.05);
  border: 1px solid rgba(255,0,0,0.2);
  border-radius: 2px;
  text-align: left;
}

.ending-bad-message pre {
  font-size: 10.5px;
  color: rgba(255,100,100,0.6);
  line-height: 1.8;
  white-space: pre-wrap;
  font-family: 'M PLUS 1 Code', monospace;
  margin: 0;
}

/* ── 矛盾レベル表示 ── */
.ending-contradiction {
  margin-bottom: 20px;
  text-align: left;
}

.contradiction-label {
  font-size: 9px;
  color: rgba(170,136,51,0.6);
  letter-spacing: 1px;
  margin-bottom: 6px;
  font-family: 'M PLUS 1 Code', monospace;
}

.contradiction-bar {
  height: 4px;
  background: rgba(170,136,51,0.15);
  border-radius: 2px;
  overflow: hidden;
  margin-bottom: 4px;
}

.contradiction-fill {
  height: 100%;
  background: linear-gradient(90deg, #aa8833, #aa4433);
  border-radius: 2px;
  transition: width 1s ease;
}

.contradiction-hint {
  font-size: 9px;
  color: rgba(170,136,51,0.4);
  font-style: italic;
  font-family: 'M PLUS 1 Code', monospace;
}

/* ── 別ルート示唆 ── */
.ending-alt {
  margin-bottom: 20px;
  font-size: 11px;
  color: rgba(184,255,184,0.35);
  font-family: 'M PLUS 1 Code', cursive;
}
.alt-label { margin-bottom: 8px; }
.alt-routes {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  justify-content: center;
  margin-bottom: 8px;
}
.alt-chip {
  background: transparent;
  color: #33aa55;
  padding: 2px 8px;
  border-radius: 1px;
  font-size: 10.5px;
  letter-spacing: 0.3px;
  border: 1px solid #33aa55;
  font-family: 'M PLUS 1 Code', monospace;
}
.alt-hint { font-style: italic; color: rgba(184,255,184,0.25); }

.fade-up-enter-active { animation: fadeUp 0.45s ease both; }
@keyframes fadeUp {
  0%   { opacity: 0; transform: translateY(8px); }
  100% { opacity: 1; transform: translateY(0); }
}

/* ── エンディングフレーバー ── */
.ending-flavor {
  font-size: 11px;
  color: rgba(184,255,184,0.35);
  font-style: italic;
  line-height: 1.8;
  margin-bottom: 16px;
  padding: 0 4px;
  border-left: 2px solid rgba(0,255,65,0.2);
  padding-left: 10px;
  text-align: left;
  font-family: 'M PLUS 1 Code', monospace;
}

/* ── リスタートボタン ── */
.restart-btn {
  background: transparent;
  color: #00ff41;
  border: 1px solid #33aa55;
  padding: 11px 36px;
  font-family: 'M PLUS 1 Code', monospace;
  font-size: 13px;
  cursor: pointer;
  border-radius: 1px;
  letter-spacing: 1.5px;
  transition: background 0.15s, transform 0.1s;
  box-shadow: 0 0 8px rgba(0,255,65,0.1);
}
.restart-btn:hover { background: rgba(0,255,65,0.1); box-shadow: 0 0 12px rgba(0,255,65,0.2); }
.restart-btn:active { transform: translateY(2px); box-shadow: 0 0 6px rgba(0,255,65,0.1); }

.ending-card-glitch .restart-btn {
  color: #ff4444;
  border-color: #ff0000;
  box-shadow: 0 0 8px rgba(255,0,0,0.2);
}
.ending-card-glitch .restart-btn:hover {
  background: rgba(255,0,0,0.1);
  box-shadow: 0 0 12px rgba(255,0,0,0.3);
}
</style>
