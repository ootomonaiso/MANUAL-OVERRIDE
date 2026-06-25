<script setup lang="ts">
import { computed, ref, watch, onUnmounted } from 'vue'
import { GENRES } from '../data/genres'

const props = defineProps<{
  distance: number
  playScore: number
  kills: number
  combo: number
  hp: number
  maxHp: number
  beatHits: number
  genre: string
  features: Set<string> | ReadonlySet<string>
}>()

// スコアカウントアップアニメーション
const displayScore = ref(0)
let scoreRaf = 0
watch(() => props.playScore, (next, prev) => {
  cancelAnimationFrame(scoreRaf)
  const start = prev
  const end = next
  const duration = 180
  const t0 = performance.now()
  function tick(t: number) {
    const p = Math.min(1, (t - t0) / duration)
    displayScore.value = Math.round(start + (end - start) * p)
    if (p < 1) scoreRaf = requestAnimationFrame(tick)
  }
  scoreRaf = requestAnimationFrame(tick)
})

onUnmounted(() => {
  cancelAnimationFrame(scoreRaf)
})

const genreLabel = computed(() => GENRES.find(g => g.id === props.genre)?.label ?? '')

const distBar = computed(() => {
  // 最大距離 4000px を想定
  return Math.min(100, (props.distance / 4000) * 100)
})

// コンボカラー
const comboColor = computed(() => {
  if (props.combo >= 10) return '#00ff41'
  if (props.combo >= 5)  return '#33aa55'
  return '#88ff44'
})
</script>

<template>
  <div class="hud">
    <!-- スコア（左上） -->
    <div class="hud-score-block">
      <div class="hud-score">{{ displayScore.toLocaleString() }}</div>
      <div class="hud-dist">
        <div class="hud-dist-bar">
          <div class="hud-dist-fill" :style="{ width: distBar + '%' }" />
        </div>
        <span class="hud-dist-text">{{ Math.floor(distance) }}m</span>
      </div>
    </div>

    <!-- ジャンルバッジ（中央上） -->
    <Transition name="badge-pop">
      <div v-if="genre !== 'base'" class="hud-genre-badge">
        {{ genreLabel }}
      </div>
    </Transition>

    <!-- 右上: HP / コンボ / 統計 -->
    <div class="hud-right">
      <!-- HP バー（hp feature あり時） -->
      <div v-if="features.has('hp')" class="hud-hp-row">
        <span
          v-for="i in maxHp"
          :key="i"
          class="hud-hp-heart"
          :class="{ empty: i > hp }"
        >♥</span>
      </div>

      <!-- STG: Kill / Combo -->
      <template v-if="features.has('shoot') || features.has('enemy_hp')">
        <div class="hud-stat">
          <span class="hud-stat-label">KILLS</span>
          <span class="hud-stat-val">{{ kills }}</span>
        </div>
      </template>

      <!-- Rhythm: Beat hits -->
      <template v-if="features.has('beat_hazard')">
        <div class="hud-stat">
          <span class="hud-stat-label">JUST</span>
          <span class="hud-stat-val">{{ beatHits }}</span>
        </div>
      </template>
    </div>

    <!-- コンボ表示（大きく中央下） -->
    <Transition name="combo-pop">
      <div v-if="combo >= 2" class="hud-combo" :style="{ color: comboColor }">
        <span class="hud-combo-num">×{{ combo }}</span>
        <span class="hud-combo-label">COMBO</span>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.hud {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 10;
}

/* ─── スコア ─── */
.hud-score-block {
  position: absolute;
  top: 14px; left: 18px;
}
.hud-score {
  font-size: 30px;
  font-weight: 900;
  color: #00ff41;
  font-family: 'M PLUS 1 Code', monospace;
  letter-spacing: 2px;
  text-shadow: 0 0 16px rgba(0,255,65,0.4), 0 2px 4px rgba(0,0,0,0.6);
  line-height: 1;
}
.hud-dist {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 5px;
}
.hud-dist-bar {
  width: 100px; height: 3px;
  background: rgba(0,255,65,0.15);
  border-radius: 1px;
  overflow: hidden;
}
.hud-dist-fill {
  height: 100%;
  background: linear-gradient(90deg, #33aa55, #00ff41);
  border-radius: 1px;
  transition: width 0.3s ease;
}
.hud-dist-text {
  font-size: 11px;
  color: rgba(184,255,184,0.45);
  font-family: 'M PLUS 1 Code', monospace;
}

/* ─── ジャンルバッジ ─── */
.hud-genre-badge {
  position: absolute;
  top: 14px; left: 50%;
  transform: translateX(-50%);
  background: rgba(0,255,65,0.08);
  backdrop-filter: blur(6px);
  border: 1px solid rgba(0,255,65,0.2);
  color: #33aa55;
  font-size: 11px;
  padding: 3px 14px;
  border-radius: 2px;
  font-family: 'M PLUS 1 Code', monospace;
  letter-spacing: 2px;
  text-transform: uppercase;
}

/* ─── 右上ブロック ─── */
.hud-right {
  position: absolute;
  top: 14px; right: 18px;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 6px;
}
.hud-hp-row { display: flex; gap: 3px; }
.hud-hp-heart {
  font-size: 20px;
  color: #ff3333;
  text-shadow: 0 0 8px #ff3333;
  transition: color 0.2s, text-shadow 0.2s;
}
.hud-hp-heart.empty {
  color: rgba(0,255,65,0.15);
  text-shadow: none;
}
.hud-stat {
  display: flex;
  align-items: baseline;
  gap: 5px;
}
.hud-stat-label {
  font-size: 10px;
  color: rgba(184,255,184,0.45);
  font-family: 'M PLUS 1 Code', monospace;
  letter-spacing: 1px;
}
.hud-stat-val {
  font-size: 18px;
  font-weight: bold;
  color: #00ff41;
  font-family: 'M PLUS 1 Code', monospace;
}

/* ─── コンボ ─── */
.hud-combo {
  position: absolute;
  bottom: 100px;
  left: 50%;
  transform: translateX(-50%);
  text-align: center;
  pointer-events: none;
}
.hud-combo-num {
  display: block;
  font-size: 42px;
  font-weight: 900;
  font-family: 'M PLUS 1 Code', monospace;
  text-shadow: 0 0 20px currentColor;
  line-height: 1;
}
.hud-combo-label {
  display: block;
  font-size: 12px;
  letter-spacing: 4px;
  opacity: 0.8;
  font-family: 'M PLUS 1 Code', monospace;
}

/* ─── トランジション ─── */
.badge-pop-enter-active { animation: badgePop 0.4s ease; }
.badge-pop-leave-active { transition: opacity 0.3s; }
.badge-pop-leave-to    { opacity: 0; }
@keyframes badgePop {
  0%   { opacity: 0; transform: translateX(-50%) scale(0.7); }
  60%  { transform: translateX(-50%) scale(1.1); }
  100% { opacity: 1; transform: translateX(-50%) scale(1); }
}

.combo-pop-enter-active { animation: comboPop 0.2s ease; }
.combo-pop-leave-active { transition: opacity 0.4s; }
.combo-pop-leave-to    { opacity: 0; }
@keyframes comboPop {
  0%   { transform: translateX(-50%) scale(0.5); opacity: 0; }
  70%  { transform: translateX(-50%) scale(1.15); }
  100% { transform: translateX(-50%) scale(1); opacity: 1; }
}
</style>
