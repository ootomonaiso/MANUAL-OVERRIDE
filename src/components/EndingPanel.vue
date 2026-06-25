<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue'
import type { FinalScore, GenreId } from '../domain/types'
import { GENRES } from '../data/genres'

const props = defineProps<{
  finalScore: FinalScore
  genre: GenreId
  choiceCount: number
}>()

const emit = defineEmits<{ (e: 'restart'): void }>()

const genreDef = GENRES.find(g => g.id === props.genre)
const genreLabel = genreDef?.label ?? 'ゲーム'
const endingFlavor = genreDef?.endingFlavor ?? ''

const otherGenres = GENRES.filter(g => g.id !== props.genre && g.id !== 'base')

// ── カウントアップ ───────────────────────────────
const displayPlay  = ref(0)
const displayThrow = ref(0)
const displayTotal = ref(0)
const gradeVisible = ref(false)
const altVisible   = ref(false)

function grade(total: number): string {
  if (total >= 8000) return 'S'
  if (total >= 5000) return 'A'
  if (total >= 2500) return 'B'
  if (total >= 1000) return 'C'
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
const accentColor = genreToAccent(props.genre)

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
    <div class="ending-card">
      <!-- ジャンル確定 -->
      <div class="ending-genre-section">
        <div class="ending-genre-label">ゲームが完成しました</div>
        <div class="ending-genre-name" :style="{ '--accent': accentColor }">
          {{ genreLabel }}
        </div>
        <div class="ending-genre-sub">
          {{ choiceCount }} 回の選択で作りました
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
        <div v-if="altVisible && endingFlavor" class="ending-flavor">
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

@keyframes cardIn {
  0%   { opacity: 0; transform: translateY(24px) scale(0.96); }
  100% { opacity: 1; transform: translateY(0) scale(1); }
}

/* ── ジャンルセクション ── */
.ending-genre-section {
  margin-bottom: 22px;
  border-bottom: 1px solid rgba(0,255,65,0.2);
  padding-bottom: 16px;
}

.ending-genre-label {
  font-size: 10px;
  color: #33aa55;
  letter-spacing: 2px;
  text-transform: uppercase;
  margin-bottom: 6px;
  font-family: 'M PLUS 1 Code', monospace;
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
</style>
