<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import type { ManualTheme } from '../domain/types'

const props = defineProps<{
  genreLabel: string
  manualReveal: string
  theme: ManualTheme
}>()

const emit = defineEmits<{
  (e: 'dismissed'): void
}>()

let _dismissTimer: ReturnType<typeof setTimeout>
onMounted(() => { _dismissTimer = setTimeout(() => emit('dismissed'), 2800) })
onUnmounted(() => clearTimeout(_dismissTimer))
</script>

<template>
  <div class="gr-root" :class="`gr-${theme}`">
    <!-- テーマ別背景レイヤー -->
    <div class="gr-bg" />

    <!-- STG/弾幕系: スキャンライン -->
    <div v-if="theme === 'stg'" class="gr-scanlines" />

    <!-- パズル系: グリッドライン -->
    <div v-if="theme === 'puzzle'" class="gr-grid" />

    <!-- ホラー系: ノイズレイヤー -->
    <div v-if="theme === 'horror'" class="gr-noise" />

    <!-- コンテンツ -->
    <div class="gr-content">
      <div class="gr-stamp">GENRE LOCKED</div>
      <div class="gr-label">{{ genreLabel }}</div>
      <div class="gr-desc">{{ manualReveal }}</div>
    </div>

    <!-- フラッシュ演出（入場時） -->
    <div class="gr-flash" />
  </div>
</template>

<style scoped>
/* ── ルート ───────────────────────────────────────────── */
.gr-root {
  position: fixed;
  inset: 0;
  z-index: 200;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  pointer-events: none;
  animation: grRootIn 0.25s ease-out both, grRootOut 0.55s 2.25s ease-in both;
}

@keyframes grRootIn {
  0%   { opacity: 0; }
  100% { opacity: 1; }
}
@keyframes grRootOut {
  0%   { opacity: 1; transform: scale(1); }
  100% { opacity: 0; transform: scale(1.04); }
}

/* ── 背景 ─────────────────────────────────────────────── */
.gr-bg {
  position: absolute;
  inset: 0;
  animation: grBgPulse 0.4s ease-out both;
}
@keyframes grBgPulse {
  0%   { transform: scale(1.15); opacity: 0; }
  100% { transform: scale(1);    opacity: 1; }
}

/* ── テーマ別背景色 ──────────────────────────────────── */
.gr-plain  .gr-bg { background: #0a0a0a; }
.gr-stg    .gr-bg { background: radial-gradient(ellipse at center, #0a0a2a 0%, #000010 60%); }
.gr-rpg    .gr-bg { background: radial-gradient(ellipse at center, #2a1600 0%, #0a0800 60%); }
.gr-puzzle .gr-bg { background: #f8f8f8; }
.gr-rhythm .gr-bg { background: radial-gradient(ellipse at center, #1a0035 0%, #050010 60%); }
.gr-horror .gr-bg { background: radial-gradient(ellipse at center, #1a0000 0%, #020000 60%); }
.gr-aquatic .gr-bg { background: radial-gradient(ellipse at center, #001a3a 0%, #000a1f 60%); }

/* ── STG: スキャンライン ─────────────────────────────── */
.gr-scanlines {
  position: absolute;
  inset: 0;
  background: repeating-linear-gradient(
    to bottom,
    transparent 0px, transparent 3px,
    rgba(0, 80, 255, 0.06) 3px, rgba(0, 80, 255, 0.06) 4px
  );
  pointer-events: none;
  animation: grScanMove 1.2s linear infinite;
}
@keyframes grScanMove {
  0%   { background-position-y: 0; }
  100% { background-position-y: 8px; }
}

/* ── パズル: グリッドライン ──────────────────────────── */
.gr-grid {
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(to right, rgba(0,0,0,0.12) 1px, transparent 1px),
    linear-gradient(to bottom, rgba(0,0,0,0.12) 1px, transparent 1px);
  background-size: 40px 40px;
  pointer-events: none;
  animation: grGridIn 0.6s ease-out both;
}
@keyframes grGridIn {
  0%   { opacity: 0; }
  100% { opacity: 1; }
}

/* ── ホラー: ノイズ ──────────────────────────────────── */
.gr-noise {
  position: absolute;
  inset: 0;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.06'/%3E%3C/svg%3E");
  pointer-events: none;
  mix-blend-mode: overlay;
  animation: grNoiseFlicker 0.12s steps(1) infinite;
}
@keyframes grNoiseFlicker {
  0%, 100% { opacity: 0.8; }
  50%       { opacity: 0.4; }
}

/* ── フラッシュ ───────────────────────────────────────── */
.gr-flash {
  position: absolute;
  inset: 0;
  pointer-events: none;
  animation: grFlash 0.5s ease-out both;
}
.gr-plain  .gr-flash { background: #ffffff; }
.gr-stg    .gr-flash { background: #1a66ff; }
.gr-rpg    .gr-flash { background: #c4960a; }
.gr-puzzle .gr-flash { background: #333333; }
.gr-rhythm .gr-flash { background: #cc00ff; }
.gr-horror .gr-flash { background: #aa0000; }
.gr-aquatic .gr-flash { background: #0055aa; }

@keyframes grFlash {
  0%   { opacity: 0.9; }
  100% { opacity: 0; }
}

/* ── コンテンツ ───────────────────────────────────────── */
.gr-content {
  position: relative;
  z-index: 2;
  text-align: center;
  padding: 40px 60px;
  animation: grContentIn 0.6s 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) both;
}
@keyframes grContentIn {
  0%   { opacity: 0; transform: scale(0.8) translateY(12px); }
  100% { opacity: 1; transform: scale(1)   translateY(0); }
}

/* STAMP テキスト */
.gr-stamp {
  font-size: 11px;
  letter-spacing: 4px;
  margin-bottom: 18px;
  opacity: 0.7;
  animation: grStampIn 0.4s 0.5s ease-out both;
}
@keyframes grStampIn {
  0%   { opacity: 0; letter-spacing: 10px; }
  100% { opacity: 0.7; letter-spacing: 4px; }
}

/* ジャンル名 */
.gr-label {
  font-size: clamp(28px, 5vw, 52px);
  font-weight: 900;
  letter-spacing: 1px;
  line-height: 1.2;
  margin-bottom: 16px;
  animation: grLabelIn 0.7s 0.6s cubic-bezier(0.22, 1, 0.36, 1) both;
}
@keyframes grLabelIn {
  0%   { opacity: 0; transform: translateY(-20px) scaleY(1.3); }
  100% { opacity: 1; transform: translateY(0)     scaleY(1); }
}

/* 説明文 */
.gr-desc {
  font-size: 14px;
  line-height: 1.9;
  letter-spacing: 0.4px;
  animation: grDescIn 0.6s 1.0s ease-out both;
  max-width: 480px;
  margin: 0 auto;
}
@keyframes grDescIn {
  0%   { opacity: 0; transform: translateY(8px); }
  100% { opacity: 0.9; transform: translateY(0); }
}

/* ── テーマ別テキスト色 ───────────────────────────────── */
.gr-plain   { --gr-accent: #00ff41; --gr-text: #e8e8e8; --gr-font: 'M PLUS 1 Code', monospace; }
.gr-stg     { --gr-accent: #1a66ff; --gr-text: #a8d8ff; --gr-font: 'Courier New', monospace; }
.gr-rpg     { --gr-accent: #c4960a; --gr-text: #f5ddb0; --gr-font: 'Georgia', 'Times New Roman', serif; }
.gr-puzzle  { --gr-accent: #222222; --gr-text: #333333; --gr-font: 'Courier New', monospace; }
.gr-rhythm  { --gr-accent: #cc00ff; --gr-text: #ee88ff; --gr-font: 'Courier New', monospace; }
.gr-horror  { --gr-accent: #cc0000; --gr-text: #cc8888; --gr-font: 'Courier New', monospace; }
.gr-aquatic { --gr-accent: #00aadd; --gr-text: #88ccff; --gr-font: 'M PLUS 1 Code', monospace; }

.gr-stamp  { color: var(--gr-accent); font-family: var(--gr-font); }
.gr-label  { color: var(--gr-accent); font-family: var(--gr-font); text-shadow: 0 0 30px var(--gr-accent); }
.gr-desc   { color: var(--gr-text);   font-family: var(--gr-font); }

/* ── STG: ボーダーグロー ─────────────────────────────── */
.gr-stg .gr-content {
  border: 1px solid rgba(26, 102, 255, 0.4);
  box-shadow: 0 0 40px rgba(26, 102, 255, 0.25), inset 0 0 20px rgba(26, 102, 255, 0.05);
  background: rgba(0, 0, 30, 0.6);
  backdrop-filter: blur(4px);
}

/* ── RPG: 羊皮紙風枠 ────────────────────────────────── */
.gr-rpg .gr-content {
  border: 3px double rgba(196, 150, 10, 0.5);
  box-shadow: 5px 5px 0 rgba(196, 150, 10, 0.3), 0 0 40px rgba(196, 150, 10, 0.15);
  background: rgba(30, 18, 0, 0.7);
  backdrop-filter: blur(2px);
}

/* ── パズル: 罫線枠 ─────────────────────────────────── */
.gr-puzzle .gr-content {
  border: 2px solid #aaa;
  box-shadow: 2px 2px 0 #888;
  background: rgba(248, 248, 248, 0.92);
}
.gr-puzzle .gr-stamp { letter-spacing: 2px; }

/* ── リズム: ネオングロー ───────────────────────────── */
.gr-rhythm .gr-content {
  border: 1px solid rgba(204, 0, 255, 0.5);
  box-shadow:
    0 0 30px rgba(204, 0, 255, 0.4),
    0 0 60px rgba(204, 0, 255, 0.15),
    inset 0 0 20px rgba(204, 0, 255, 0.08);
  background: rgba(15, 0, 35, 0.7);
  backdrop-filter: blur(4px);
}
.gr-rhythm .gr-label {
  animation: grLabelIn 0.7s 0.6s cubic-bezier(0.22, 1, 0.36, 1) both, grRhythmPulse 0.8s 1.3s ease-in-out infinite alternate;
}
@keyframes grRhythmPulse {
  0%   { text-shadow: 0 0 20px #cc00ff; }
  100% { text-shadow: 0 0 40px #cc00ff, 0 0 80px rgba(204,0,255,0.5); }
}

/* ── ホラー: グリッチ ───────────────────────────────── */
.gr-horror .gr-content {
  border: 1px solid rgba(170, 0, 0, 0.4);
  box-shadow: 0 0 20px rgba(170, 0, 0, 0.3);
  background: rgba(8, 0, 0, 0.8);
}
.gr-horror .gr-label {
  animation: grLabelIn 0.7s 0.6s both, grHorrorGlitch 0.15s 1.2s steps(2) 6;
}
@keyframes grHorrorGlitch {
  0%   { transform: translateX(0); filter: none; }
  33%  { transform: translateX(-4px); filter: hue-rotate(90deg); }
  66%  { transform: translateX(4px);  filter: hue-rotate(-90deg); }
  100% { transform: translateX(0); filter: none; }
}

/* ── 水中: 波紋 ─────────────────────────────────────── */
.gr-aquatic .gr-content {
  border: 1px solid rgba(0, 170, 221, 0.4);
  box-shadow: 0 0 30px rgba(0, 170, 221, 0.2), 0 0 60px rgba(0, 100, 200, 0.1);
  background: rgba(0, 10, 30, 0.7);
  backdrop-filter: blur(4px);
}
.gr-aquatic .gr-label {
  animation: grLabelIn 0.7s 0.6s both, grAquaticRipple 2s 1.0s ease-in-out infinite;
}
@keyframes grAquaticRipple {
  0%, 100% { letter-spacing: 1px; }
  50%       { letter-spacing: 3px; }
}
</style>
