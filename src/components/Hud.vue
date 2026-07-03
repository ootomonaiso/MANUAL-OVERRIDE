<script setup lang="ts">
import { computed, ref, watch, toRef, onUnmounted } from 'vue'
import { GENRES } from '../data/genres'
import { useScoreAnimation } from '../composables/useScoreAnimation'

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

const displayScore = useScoreAnimation(toRef(props, 'playScore'))

const DIST_BAR_MAX = 4000

const genreLabel  = computed(() => GENRES.find(g => g.id === props.genre)?.label ?? '')
const distBar     = computed(() => Math.min(100, (props.distance / DIST_BAR_MAX) * 100))
const COMBO_THRESHOLD_HIGH = 10
const COMBO_THRESHOLD_MED  = 5

const comboColor  = computed(() => {
  if (props.combo >= COMBO_THRESHOLD_HIGH) return '#00ff41'
  if (props.combo >= COMBO_THRESHOLD_MED)  return '#33aa55'
  return '#88ff44'
})

// ── スコア加算ポップアップ ──────────────────────────────────────
interface ScorePopup {
  id: number
  x: number
  y: number
  value: number
  createdAt: number
}

const POPUP_X_MARGIN = 60
const POPUP_Y_MIN = 40
const POPUP_Y_RANGE = 60
const POPUP_LIFETIME_MS = 700

const popupIdCounter = ref(0)
const popups = ref<ScorePopup[]>([])
const prevScore = ref(props.playScore)
const popupTimers = ref<ReturnType<typeof setTimeout>[]>([])

// 前回のスコアを監視
watch(() => props.playScore, (newScore) => {
  if (newScore > prevScore.value) {
    const delta = newScore - prevScore.value
    const popupId = popupIdCounter.value++
    // ポップアップを生成（ランダム位置）
    popups.value.push({
      id: popupId,
      x: POPUP_X_MARGIN + Math.random() * (window.innerWidth - POPUP_X_MARGIN * 2),
      y: POPUP_Y_MIN + Math.random() * POPUP_Y_RANGE,
      value: delta,
      createdAt: performance.now(),
    })
    // POPUP_LIFETIME_MS 後に削除
    const timer = setTimeout(() => {
      popups.value = popups.value.filter(p => p.id !== popupId)
    }, POPUP_LIFETIME_MS)
    popupTimers.value.push(timer)
  }
  prevScore.value = newScore
})

onUnmounted(() => {
  for (const t of popupTimers.value) clearTimeout(t)
  popupTimers.value.length = 0
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

    <!-- スコア加算ポップアップ -->
    <TransitionGroup name="popup">
      <div
        v-for="popup in popups"
        :key="popup.id"
        class="score-popup"
        :style="{ left: popup.x + 'px', top: popup.y + 'px' }"
      >
        +{{ popup.value.toLocaleString() }}
      </div>
    </TransitionGroup>

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
  color: var(--genre-accent, var(--green));
  font-family: var(--genre-font, var(--font-mono));
  letter-spacing: 2px;
  text-shadow:
    0 0 16px var(--genre-glow, var(--green-glow)),
    0 2px 4px rgba(0, 0, 0, 0.6);
  line-height: 1;
  transition: color 0.4s ease, text-shadow 0.4s ease;
}
.hud-dist {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 5px;
}
.hud-dist-bar {
  width: 100px; height: 3px;
  background: var(--genre-glow, var(--green-glow));
  border-radius: 1px;
  overflow: hidden;
}
.hud-dist-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--genre-accent, var(--green-dim)), var(--genre-accent, var(--green)));
  border-radius: 1px;
  transition: width 0.3s ease;
}
.hud-dist-text {
  font-size: 11px;
  color: var(--genre-text, var(--text-dim));
  font-family: var(--genre-font, var(--font-mono));
}

/* ─── スコア加算ポップアップ ─── */
.score-popup {
  position: absolute;
  font-size: 16px;
  font-weight: 900;
  color: var(--genre-accent, var(--green));
  font-family: var(--genre-font, var(--font-mono));
  text-shadow: 0 0 8px var(--genre-glow, var(--green-glow));
  pointer-events: none;
  white-space: nowrap;
  z-index: 11;
}

.popup-enter-active {
  animation: popupIn 0.3s cubic-bezier(0.22, 1, 0.36, 1) both;
}
.popup-leave-active {
  transition: opacity 0.3s ease, transform 0.3s ease;
}
.popup-leave-to {
  opacity: 0;
  transform: translateY(-12px);
}

@keyframes popupIn {
  0%   { opacity: 0; transform: translateY(8px) scale(0.8); }
  60%  { transform: translateY(-4px) scale(1.05); }
  100% { opacity: 1; transform: translateY(0) scale(1); }
}

/* ─── ジャンルバッジ ─── */
.hud-genre-badge {
  position: absolute;
  top: 14px; left: 50%;
  transform: translateX(-50%);
  background: var(--genre-bg, var(--green-subtle));
  backdrop-filter: blur(6px);
  border: 1px solid var(--genre-border, var(--green-dim));
  color: var(--genre-accent, var(--green-dim));
  font-size: 11px;
  padding: 3px 14px;
  border-radius: var(--radius-sm);
  font-family: var(--genre-font, var(--font-mono));
  letter-spacing: 2px;
  text-transform: uppercase;
  transition: all 0.4s ease;
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
  color: var(--danger);
  text-shadow: 0 0 8px var(--danger-dim);
  transition: color 0.2s, text-shadow 0.2s;
}
.hud-hp-heart.empty {
  color: var(--genre-glow, var(--green-glow));
  text-shadow: none;
}
.hud-stat {
  display: flex;
  align-items: baseline;
  gap: 5px;
}
.hud-stat-label {
  font-size: 10px;
  color: var(--genre-text, var(--text-dim));
  font-family: var(--genre-font, var(--font-mono));
  letter-spacing: 1px;
}
.hud-stat-val {
  font-size: 18px;
  font-weight: bold;
  color: var(--genre-accent, var(--green));
  font-family: var(--genre-font, var(--font-mono));
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
  font-family: var(--genre-font, var(--font-mono));
  text-shadow: 0 0 20px currentColor;
  line-height: 1;
}
.hud-combo-label {
  display: block;
  font-size: 12px;
  letter-spacing: 4px;
  opacity: 0.8;
  font-family: var(--genre-font, var(--font-mono));
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
