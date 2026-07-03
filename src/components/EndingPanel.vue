<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue'
import type { FinalScore, GenreId, PlayStyleResult, ContradictionState, SurpriseEnding } from '../domain/types'
import { GENRES } from '../data/genres'
import { SCORE } from '../data/tunables'

/** EndingPanel で矛盾状態を表示するためのインターフェース（readonly 対応） */
interface ContradictionDisplay {
  pairs: ReadonlyArray<{ idA: string; idB: string }>
  score: number
  hasEffect: boolean
}

const props = defineProps<{
  finalScore: FinalScore
  genre: GenreId
  choiceCount: number
  /** Issue #24: プレイスタイル検出結果 */
  playStyle?: PlayStyleResult | null
  /** Issue #24: 矛盾状態（readonly 対応のため専用インターフェース） */
  contradiction?: ContradictionDisplay | null
  /** Issue #24: サプライズエンド情報 */
  surpriseEnding?: SurpriseEnding | null
}>()

const emit = defineEmits<{ (e: 'restart'): void }>()

const genreDef = GENRES.find(g => g.id === props.genre)
const genreLabel = genreDef?.label ?? 'ゲーム'
const endingFlavor = genreDef?.endingFlavor ?? ''

const otherGenres = GENRES.filter(g => g.id !== props.genre && g.id !== 'base')

// ── Issue #24: プレイスタイルラベル ────────────────────────────
const playStyleLabels: Record<string, string> = {
  aggressive: '攻撃的',
  defensive: '防御的',
  explorer: '探索的',
  balanced: '均衡',
  chaotic: '混沌',
  passive: '消極的',
}
const detectedPlayStyle = computed(() => {
  if (!props.playStyle) return null
  return {
    label: playStyleLabels[props.playStyle.style] ?? props.playStyle.style,
    confidence: Math.round(props.playStyle.confidence * 100),
  }
})

// ── Issue #24: 矛盾バー ────────────────────────────────────────
const contradictionPercentage = computed(() => {
  if (!props.contradiction) return 0
  return Math.round(props.contradiction.score * 100)
})

// ── カウントアップ ───────────────────────────────
const displayPlay  = ref(0)
const displayThrow = ref(0)
const displayTotal = ref(0)
const gradeVisible = ref(false)
const altVisible   = ref(false)
const flavorVisible = ref(false)

function grade(total: number): string {
  const t = SCORE.gradeThresholds
  if (total >= t.S) return 'S'
  if (total >= t.A) return 'A'
  if (total >= t.B) return 'B'
  if (total >= t.C) return 'C'
  return 'D'
}

const gradeStr = computed(() => grade(props.finalScore.total))

// ジャンルごとのアクセントカラー（GENRES の bgColor から派生）
function genreToAccent(genre: GenreId): string {
  const def = GENRES.find(g => g.id === genre)
  if (def?.bgColor) return def.bgColor
  // fallback: ジャンルIDから色を導出
  const fallbacks: Record<string, string> = {
    runner: '#4488ff', stg: '#44aaff', rpg: '#aa8844',
    puzzle: '#444444', rhythm: '#cc44ff',
  }
  return fallbacks[genre] ?? '#cc2222'
}
const accentColor = computed(() => genreToAccent(props.genre))

// ジャンル別背景エフェクトクラス（_ を - に置換）
const genreBgClass = computed(() => {
  return `ending-bg-${props.genre.replace(/_/g, '-')}`
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
  animTimers.push(setTimeout(() => { altVisible.value   = true }, 2700))
  animTimers.push(setTimeout(() => { flavorVisible.value = true }, 3200))
})

onUnmounted(() => {
  for (const id of animRafs) cancelAnimationFrame(id)
  for (const id of animTimers) clearTimeout(id)
  animRafs.length = 0
  animTimers.length = 0
})
</script>

<template>
  <div class="ending-overlay">
    <!-- ジャンル別背景エフェクト -->
    <div class="ending-bg" :class="genreBgClass" />

    <div class="ending-card">
      <!-- ジャンル確定 -->
      <div class="ending-genre-section">
        <!-- Issue #24: サプライズエンド表示 -->
        <div v-if="surpriseEnding" class="ending-surprise" :class="'surprise-' + surpriseEnding.type">
          <div class="surprise-icon">⚠</div>
          <div class="surprise-title">{{ surpriseEnding.title }}</div>
          <div class="surprise-desc">{{ surpriseEnding.description }}</div>
        </div>

        <div class="ending-genre-label">ゲームが完成しました</div>
        <div class="ending-genre-name" :style="{ '--accent': accentColor }">
          {{ genreLabel }}
        </div>
        <div class="ending-genre-sub">
          {{ choiceCount }} 回の選択で作りました
        </div>
      </div>

      <!-- Issue #24: プレイスタイル・矛盾表示 -->
      <div v-if="detectedPlayStyle || contradiction" class="ending-meta-section">
        <div v-if="detectedPlayStyle" class="meta-row">
          <span class="meta-label">プレイスタイル</span>
          <span class="meta-value">{{ detectedPlayStyle.label }} <span class="meta-conf">（{{ detectedPlayStyle.confidence }}%）</span></span>
        </div>
        <div v-if="contradiction" class="meta-row">
          <span class="meta-label">矛盾レベル</span>
          <div class="contradiction-bar">
            <div class="contradiction-fill" :style="{ width: contradictionPercentage + '%' }"></div>
          </div>
          <span class="meta-value">{{ contradictionPercentage }}%</span>
        </div>
      </div>

      <!-- スコア内訳 -->
      <div class="ending-score-box">
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

      <!-- グレード -->
      <Transition name="grade-stamp">
        <div v-if="gradeVisible" class="ending-grade" :style="{ '--accent': accentColor }">
          {{ gradeStr }}
        </div>
      </Transition>

      <!-- 別ルート示唆 -->
      <Transition name="fade-up">
        <div v-if="altVisible" class="ending-alt">
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

      <!-- エンディングフレーバー -->
      <Transition name="fade-up">
        <div v-if="flavorVisible && endingFlavor" class="ending-flavor">
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

/* ── ジャンル別背景エフェクト ── */
.ending-bg {
  position: absolute;
  inset: 0;
  pointer-events: none;
  opacity: 0.3;
  transition: opacity 1s ease;
}

.ending-bg-runner {
  background: radial-gradient(ellipse at 30% 50%, rgba(255, 50, 50, 0.25) 0%, transparent 60%);
}
.ending-bg-stg,
.ending-bg-aerial-stg,
.ending-bg-bullet-hell,
.ending-bg-bullet-runner {
  background:
    radial-gradient(1px 1px at 20% 30%, rgba(100, 150, 255, 0.6), transparent),
    radial-gradient(1px 1px at 40% 70%, rgba(100, 150, 255, 0.4), transparent),
    radial-gradient(1px 1px at 60% 20%, rgba(100, 150, 255, 0.5), transparent),
    radial-gradient(1px 1px at 80% 50%, rgba(100, 150, 255, 0.3), transparent),
    radial-gradient(1px 1px at 10% 80%, rgba(100, 150, 255, 0.4), transparent),
    radial-gradient(2px 2px at 50% 50%, rgba(80, 120, 255, 0.3), transparent);
}
.ending-bg-rpg,
.ending-bg-dungeon {
  background: radial-gradient(ellipse at 50% 40%, rgba(196, 150, 10, 0.2) 0%, transparent 55%);
}
.ending-bg-puzzle,
.ending-bg-idle,
.ending-bg-tower-def {
  background:
    linear-gradient(rgba(100, 100, 100, 0.05) 1px, transparent 1px),
    linear-gradient(90deg, rgba(100, 100, 100, 0.05) 1px, transparent 1px);
  background-size: 40px 40px;
}
.ending-bg-rhythm,
.ending-bg-sports {
  background: radial-gradient(ellipse at 50% 50%, rgba(153, 0, 255, 0.2) 0%, transparent 50%);
}
.ending-bg-horror {
  background: radial-gradient(ellipse at 50% 60%, rgba(136, 0, 0, 0.3) 0%, transparent 50%);
}
.ending-bg-aquatic {
  background:
    radial-gradient(ellipse at 40% 60%, rgba(0, 136, 187, 0.2) 0%, transparent 50%),
    radial-gradient(ellipse at 70% 30%, rgba(0, 100, 160, 0.15) 0%, transparent 40%);
}
.ending-bg-stealth-action {
  background: radial-gradient(ellipse at 50% 50%, rgba(50, 50, 50, 0.3) 0%, transparent 60%);
}
.ending-bg-racing {
  background: linear-gradient(90deg, transparent 0%, rgba(255, 100, 0, 0.15) 50%, transparent 100%);
}
.ending-bg-platformer {
  background: radial-gradient(ellipse at 50% 70%, rgba(255, 200, 0, 0.15) 0%, transparent 50%);
}
.ending-bg-hack-slash,
.ending-bg-arena {
  background:
    radial-gradient(ellipse at 30% 40%, rgba(200, 0, 0, 0.25) 0%, transparent 45%),
    radial-gradient(ellipse at 70% 60%, rgba(200, 0, 0, 0.15) 0%, transparent 40%);
}
.ending-bg-survival {
  background: radial-gradient(ellipse at 50% 50%, rgba(80, 130, 40, 0.2) 0%, transparent 50%);
}
.ending-bg-tetris {
  background:
    repeating-linear-gradient(0deg, rgba(160, 0, 240, 0.05) 0px, rgba(160, 0, 240, 0.05) 1px, transparent 1px, transparent 20px),
    repeating-linear-gradient(90deg, rgba(160, 0, 240, 0.05) 0px, rgba(160, 0, 240, 0.05) 1px, transparent 1px, transparent 20px);
}
.ending-bg-glitch {
  background:
    repeating-linear-gradient(
      0deg,
      rgba(255, 0, 64, 0.08) 0px,
      transparent 1px,
      transparent 3px,
      rgba(255, 0, 64, 0.04) 3px,
      rgba(255, 0, 64, 0.04) 4px,
      transparent 4px,
      transparent 6px
    );
  animation: glitchBgShift 3s steps(4) infinite;
}

@keyframes glitchBgShift {
  0%   { transform: translateX(0); }
  25%  { transform: translateX(-2px); }
  50%  { transform: translateX(1px); }
  75%  { transform: translateX(-1px); }
  100% { transform: translateX(0); }
}

/* ── カード ── */
.ending-card {
  background: var(--genre-bg, var(--bg-panel));
  border: 2px solid var(--genre-border, var(--green-dim));
  border-radius: var(--radius-md);
  padding: 30px 38px 24px;
  max-width: 460px;
  width: 92%;
  box-shadow:
    0 0 20px var(--genre-glow, var(--green-glow)),
    0 0 60px rgba(0, 0, 0, 0.6);
  font-family: var(--genre-font, var(--font-main));
  color: var(--genre-text, var(--text));
  text-align: center;
  animation: cardIn 0.4s cubic-bezier(0.22, 1, 0.36, 1) both;
  position: relative;
  transition: border-color 0.4s ease, background 0.4s ease, box-shadow 0.4s ease, color 0.4s ease;
}

@keyframes cardIn {
  0%   { opacity: 0; transform: translateY(24px) scale(0.96); }
  100% { opacity: 1; transform: translateY(0) scale(1); }
}

/* ── ジャンルセクション ── */
.ending-genre-section {
  margin-bottom: 22px;
  border-bottom: 1px solid var(--genre-border, var(--green-dim));
  padding-bottom: 16px;
  opacity: 0.9;
  transition: border-color 0.4s ease;
}

.ending-genre-label {
  font-size: 10px;
  color: var(--genre-accent, var(--green-dim));
  letter-spacing: 2px;
  text-transform: uppercase;
  margin-bottom: 6px;
  font-family: var(--genre-font, var(--font-mono));
  transition: color 0.4s ease;
}

.ending-genre-name {
  font-size: 28px;
  font-weight: bold;
  color: var(--genre-accent, var(--green));
  letter-spacing: 1px;
  line-height: 1.2;
  margin-bottom: 6px;
  animation: genreReveal 0.6s 0.1s cubic-bezier(0.22, 1, 0.36, 1) both;
  text-shadow: 0 0 12px var(--genre-glow, var(--green-glow));
  font-family: var(--genre-font, var(--font-display));
  transition: color 0.4s ease, text-shadow 0.4s ease;
}

@keyframes genreReveal {
  0%   { opacity: 0; transform: scale(0.88); }
  100% { opacity: 1; transform: scale(1); }
}

.ending-genre-sub {
  font-size: 11px;
  color: var(--genre-text, var(--text-muted));
  letter-spacing: 0.5px;
  font-family: var(--genre-font, var(--font-main));
  transition: color 0.4s ease;
}

/* ── メタ情報セクション ── */
.ending-meta-section {
  margin-bottom: 14px;
  padding: 8px 12px;
  border: 1px solid var(--genre-border, var(--green-dim));
  border-radius: var(--radius-sm);
  background: var(--genre-glow, rgba(0, 255, 65, 0.03));
  transition: border-color 0.4s ease, background 0.4s ease;
}
.meta-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 4px 0;
  font-size: 12px;
  font-family: var(--genre-font, var(--font-mono));
}
.meta-label {
  color: var(--genre-text, var(--text-dim));
  font-size: 11px;
  letter-spacing: 0.5px;
  opacity: 0.7;
  font-family: var(--genre-font, var(--font-mono));
  transition: color 0.4s ease;
}
.meta-value {
  color: var(--genre-text, var(--text));
  font-size: 12px;
  font-family: var(--genre-font, var(--font-mono));
  transition: color 0.4s ease;
}
.meta-conf {
  color: var(--genre-text, var(--text-muted));
  font-size: 10px;
  font-family: var(--genre-font, var(--font-mono));
  transition: color 0.4s ease;
}
.contradiction-bar {
  width: 80px;
  height: 6px;
  background: var(--genre-glow, rgba(0, 255, 65, 0.1));
  border-radius: 3px;
  overflow: hidden;
  margin: 0 8px;
  transition: background 0.4s ease;
}
.contradiction-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--genre-accent, var(--green-dim)), var(--danger, #ff3333));
  border-radius: 3px;
  transition: width 0.6s ease;
}

/* ── スコアボックス ── */
.ending-score-box {
  background: transparent;
  border: 1px solid var(--genre-border, var(--green-dim));
  border-radius: var(--radius-sm);
  padding: 14px 18px;
  margin-bottom: 16px;
  text-align: left;
  transition: border-color 0.4s ease;
}

.score-row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  padding: 3px 0;
  font-size: 13px;
  color: var(--genre-text, var(--text));
  font-family: var(--genre-font, var(--font-mono));
  transition: color 0.4s ease;
}

.score-label {
  color: var(--genre-text, var(--text-dim));
  font-size: 11px;
  letter-spacing: 0.5px;
  font-family: var(--genre-font, var(--font-mono));
  opacity: 0.7;
  transition: color 0.4s ease;
}

.score-value {
  font-weight: bold;
  font-variant-numeric: tabular-nums;
  font-size: 15px;
  color: var(--genre-accent, var(--green));
  font-family: var(--genre-font, var(--font-mono));
  transition: color 0.4s ease;
}

.score-divider {
  height: 1px;
  background: var(--genre-border, var(--green-dim));
  margin: 6px 0;
  opacity: 0.5;
  transition: background 0.4s ease;
}

.score-row.total .score-label {
  font-size: 12px;
  color: var(--genre-accent, var(--green-dim));
  font-weight: bold;
  letter-spacing: 1px;
  font-family: var(--genre-font, var(--font-mono));
  transition: color 0.4s ease;
}

.score-row.total .score-value {
  font-size: 20px;
  color: var(--genre-accent, var(--green));
  font-family: var(--genre-font, var(--font-mono));
  transition: color 0.4s ease;
}

/* ── グレード ── */
.ending-grade {
  font-size: 72px;
  font-weight: bold;
  color: var(--genre-accent, var(--green));
  line-height: 1;
  margin: 0 0 16px;
  text-shadow: 0 0 20px var(--genre-glow, var(--green-glow));
  font-family: var(--genre-font, var(--font-display));
  transition: color 0.4s ease, text-shadow 0.4s ease;
}

.grade-stamp-enter-active {
  animation: gradeStamp 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275) both;
}
@keyframes gradeStamp {
  0%   { opacity: 0; transform: scale(2.2) rotate(-8deg); }
  60%  { opacity: 1; transform: scale(0.9) rotate(1deg); }
  100% { opacity: 1; transform: scale(1) rotate(0deg); }
}

/* ── 別ルート示唆 ── */
.ending-alt {
  margin-bottom: 20px;
  font-size: 11px;
  color: var(--genre-text, var(--text-muted));
  font-family: var(--genre-font, var(--font-main));
  transition: color 0.4s ease;
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
  color: var(--genre-accent, var(--green-dim));
  padding: 2px 8px;
  border-radius: var(--radius-sm);
  font-size: 10.5px;
  letter-spacing: 0.3px;
  border: 1px solid var(--genre-accent, var(--green-dim));
  font-family: var(--genre-font, var(--font-mono));
  transition:
    color 0.4s ease,
    border-color 0.4s ease,
    background var(--transition-fast);
}
.alt-chip:hover {
  background: var(--genre-glow, rgba(0, 255, 65, 0.1));
}
.alt-hint { font-style: italic; color: var(--genre-text, var(--text-muted)); opacity: 0.7; }

.fade-up-enter-active { animation: fadeUp 0.45s ease both; }
@keyframes fadeUp {
  0%   { opacity: 0; transform: translateY(8px); }
  100% { opacity: 1; transform: translateY(0); }
}

/* ── エンディングフレーバー ── */
.ending-flavor {
  font-size: 11px;
  color: var(--genre-text, var(--text-muted));
  font-style: italic;
  line-height: 1.8;
  margin-bottom: 16px;
  padding: 0 4px;
  border-left: 2px solid var(--genre-accent, var(--green-dim));
  padding-left: 10px;
  text-align: left;
  font-family: var(--genre-font, var(--font-mono));
  transition: border-color 0.4s ease, color 0.4s ease;
}

/* ── リスタートボタン ── */
.restart-btn {
  background: transparent;
  color: var(--genre-accent, var(--green));
  border: 1px solid var(--genre-border, var(--green-dim));
  padding: 11px 36px;
  font-family: var(--genre-font, var(--font-mono));
  font-size: 13px;
  cursor: pointer;
  border-radius: var(--radius-sm);
  letter-spacing: 1.5px;
  transition:
    background var(--transition-fast),
    border-color var(--transition-fast),
    color var(--transition-fast),
    box-shadow var(--transition-fast),
    transform var(--transition-fast);
  box-shadow: 0 0 8px var(--genre-glow, var(--green-glow));
}
.restart-btn:hover {
  background: var(--genre-glow, rgba(0, 255, 65, 0.1));
  box-shadow: 0 0 12px var(--genre-glow, var(--green-glow));
}
.restart-btn:active { transform: translateY(2px); box-shadow: 0 0 6px var(--genre-glow, var(--green-glow)); }

/* ── Issue #24: サプライズエンド ── */
.ending-surprise {
  margin-bottom: 14px;
  padding: 10px 12px;
  border: 1px solid #ff0040;
  border-radius: var(--radius-sm);
  background: rgba(255, 0, 64, 0.08);
  animation: glitchPulse 2s infinite;
}
@keyframes glitchPulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.85; }
}
.surprise-icon {
  font-size: 18px;
  margin-bottom: 4px;
  animation: glitchShake 0.3s infinite;
}
@keyframes glitchShake {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-2px); }
  75% { transform: translateX(2px); }
}
.surprise-title {
  font-size: 15px;
  font-weight: bold;
  color: #ff0040;
  margin-bottom: 4px;
  font-family: 'Courier New', monospace;
  letter-spacing: 1px;
}
.surprise-desc {
  font-size: 11px;
  color: rgba(255, 100, 120, 0.7);
  line-height: 1.6;
  font-family: var(--font-main);
}
</style>
