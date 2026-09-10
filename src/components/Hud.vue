<script setup lang="ts">
import { computed, toRef } from 'vue'
import { useScoreAnimation } from '../composables/useScoreAnimation'
import { classifyHudLayout } from '../domain/hudLayout'
import type { SafeZone } from '../domain/hudLayout'

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
  scrollAxis: 'x' | 'y'
  gravity: number
  safeZone: SafeZone
}>()

const displayScore = useScoreAnimation(toRef(props, 'playScore'))

const DIST_BAR_MAX = 4000

// コンボ表示のデフォルト下端オフセット（px）と、下側セーフゾーンとの最小マージン
const COMBO_BASE_BOTTOM = 100
const COMBO_ZONE_MARGIN = 40

const layout = computed(() => classifyHudLayout({
  scrollAxis: props.scrollAxis,
  gravity: props.gravity,
  genre: props.genre,
  features: props.features,
}))

// コンボは中央のプレイフィードバックとして維持しつつ、下側セーフゾーンに
// かぶらない高さへ自動調整する（仕様 4-3 #6）
const comboBottom = computed(() =>
  Math.max(COMBO_BASE_BOTTOM, Math.round(props.safeZone.bottom) + COMBO_ZONE_MARGIN),
)

const distBar     = computed(() => Math.min(100, (props.distance / DIST_BAR_MAX) * 100))
const COMBO_THRESHOLD_HIGH = 10
const COMBO_THRESHOLD_MED  = 5

// コンボ量による強調は色ではなくグロー強度で表現する。色を緑固定にすると
// idle など明背景ジャンルで可読性が落ちるため、色はジャンルテーマ(--genre-accent)
// に委ね、コンボの伸びは text-shadow のぼかし半径で示す（#172）。
const comboGlow = computed(() => {
  if (props.combo >= COMBO_THRESHOLD_HIGH) return '48px'
  if (props.combo >= COMBO_THRESHOLD_MED)  return '32px'
  return '20px'
})

// スコア加算の演出は各 Feature が world.addScorePopup() で個別に発火する
// （ShootFeature の撃破 "+N" 等）。playScore の差分監視で汎用ポップアップを
// 出す仕組みは、距離スコアなどの毎フレーム微小加算にも反応して大量発生する
// ため廃止した。
</script>

<template>
  <div class="hud" :class="'layout-' + layout">
    <!-- スコア（レイアウトに応じ左上 / 右上） -->
    <div class="hud-score-block">
      <div class="hud-score">{{ displayScore.toLocaleString() }}</div>
      <div class="hud-dist">
        <div class="hud-dist-bar">
          <div class="hud-dist-fill" :style="{ width: distBar + '%' }" />
        </div>
        <span class="hud-dist-text">{{ Math.floor(distance) }}m</span>
      </div>
    </div>

    <!-- ジャンルバッジは中央上部浮遊を廃止し ControlHintBadge のゾーンへ統合（仕様 2-G） -->

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

    <!-- コンボ表示（大きく中央下・下側セーフゾーンを避ける） -->
    <Transition name="combo-pop">
      <div v-if="combo >= 2" class="hud-combo" :style="{ '--combo-glow': comboGlow, bottom: comboBottom + 'px' }">
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
/* 対象レイアウト（横スクロール/横STG/縦STG）はスコアを右上へ統一（ユーザー調整）。
   対象外ジャンルは従来どおり左上のまま。 */
.layout-hbase .hud-score-block,
.layout-hstg .hud-score-block,
.layout-vstg .hud-score-block {
  left: auto; right: 18px;
  text-align: right;
}
.layout-hbase .hud-dist,
.layout-hstg .hud-dist,
.layout-vstg .hud-dist { justify-content: flex-end; }
/* スコアが右上へ来るレイアウトでは統計（HP/KILLS）をその下へ送る */
.layout-hbase .hud-right,
.layout-hstg .hud-right,
.layout-vstg .hud-right { top: 66px; }
.hud-score {
  font-size: 34px;
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

/* ─── 右上ブロック（HP/KILLS） ─── */
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
  color: var(--genre-accent, var(--green));
}
.hud-combo-num {
  display: block;
  font-size: 42px;
  font-weight: 900;
  font-family: var(--genre-font, var(--font-mono));
  text-shadow: 0 0 var(--combo-glow, 20px) currentColor;
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
.combo-pop-enter-active { animation: comboPop 0.2s ease; }
.combo-pop-leave-active { transition: opacity 0.4s; }
.combo-pop-leave-to    { opacity: 0; }
@keyframes comboPop {
  0%   { transform: translateX(-50%) scale(0.5); opacity: 0; }
  70%  { transform: translateX(-50%) scale(1.15); }
  100% { transform: translateX(-50%) scale(1); opacity: 1; }
}
</style>
