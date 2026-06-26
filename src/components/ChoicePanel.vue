<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'

const props = defineProps<{
  choices: readonly { id: string; label: string }[]
  version: string
  lockedGenre?: string
}>()

const emit = defineEmits<{
  (e: 'choose', choiceId: string): void
}>()

const selected = ref<string | null>(null)
const revealed = ref(false)

let choiceTimer: ReturnType<typeof setTimeout> | null = null


function pick(choiceId: string) {
  if (selected.value) return
  selected.value = choiceId
  choiceTimer = setTimeout(() => emit('choose', choiceId), 150)
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === '1' && props.choices[0]) pick(props.choices[0].id)
  if (e.key === '2' && props.choices[1]) pick(props.choices[1].id)
}

onMounted(() => {
  revealed.value = true
  window.addEventListener('keydown', onKeydown)
})

onUnmounted(() => {
  if (choiceTimer !== null) clearTimeout(choiceTimer)
  window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <div class="choice-overlay">
    <div class="scanline-overlay" />

    <div class="choice-card" :class="[{ revealed }, lockedGenre ? `genre-${lockedGenre}` : '']">
      <!-- ヘッダー -->
      <div class="choice-header">
        <div class="choice-stamp">UPDATE</div>
        <div class="choice-ver">ver.{{ version }} → ?</div>
        <div class="choice-prompt">
          説明書の内容を選んでください
        </div>
      </div>

      <!-- 選択肢 -->
      <div class="choice-options">
        <button
          v-for="(c, idx) in choices"
          :key="c.id"
          class="choice-btn"
          :data-choice-id="c.id"
          :class="{
            selected: selected === c.id,
            faded:    selected !== null && selected !== c.id,
            staggered: revealed,
          }"
          :style="{ '--delay': idx * 60 + 'ms' }"
          @click="pick(c.id)"
        >
          <span class="choice-index">{{ idx === 0 ? '1' : '2' }}</span>
          <span class="choice-label">{{ c.label }}</span>
          <span class="choice-arrow">→</span>
        </button>
      </div>

      <!-- フッター注記 -->
      <div class="choice-footnote">
        選んだ内容によってゲームが変わります
        <span class="key-hint">[ 1 / 2 キーでも選択 ]</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.choice-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.85);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 30;
  backdrop-filter: blur(3px);
}

.scanline-overlay {
  position: absolute;
  inset: 0;
  background: repeating-linear-gradient(
    to bottom,
    transparent 0px,
    transparent 2px,
    rgba(0, 0, 0, 0.15) 2px,
    rgba(0, 0, 0, 0.15) 3px
  );
  pointer-events: none;
}

/* カード — 初期は横に倒れた状態（裏面）からフリップ */
.choice-card {
  background: #0d120d;
  border: 2px solid #33aa55;
  border-radius: 2px;
  padding: 28px 32px 22px;
  max-width: 420px;
  width: 92%;
  box-shadow:
    0 0 20px rgba(0,255,65,0.15),
    0 0 50px rgba(0,0,0,0.5),
    inset 0 1px 2px rgba(0,255,65,0.05);
  font-family: 'M PLUS 1 Code', cursive;
  animation: cardFlipIn 0.15s cubic-bezier(0.22, 1, 0.36, 1) both;
  perspective: 800px;
}

@keyframes cardFlipIn {
  0%   { opacity: 0.4; transform: rotateY(70deg) scale(0.97); }
  100% { opacity: 1;   transform: rotateY(0deg)  scale(1); }
}

/* ─── ジャンル別文体テーマ (B4) ─── */
.choice-card.genre-stg {
  border-color: #1a66ff;
  box-shadow: 0 0 20px rgba(26,102,255,0.2), 0 0 50px rgba(0,0,0,0.5);
  font-family: 'Courier New', monospace;
}
.choice-card.genre-stg .choice-stamp { color: #4488ff; border-color: #4488ff; }
.choice-card.genre-stg .choice-ver   { color: #4488ff; }
.choice-card.genre-stg .choice-prompt { color: #aaccff; }
.choice-card.genre-stg .choice-btn   { border-color: #1a66ff; background: #000820; }
.choice-card.genre-stg .choice-btn:hover { background: #001040; border-color: #4488ff; }
.choice-card.genre-stg .choice-index { color: #4488ff; border-color: #4488ff; }
.choice-card.genre-stg .choice-label { color: #aaccff; }

.choice-card.genre-rpg {
  border-color: #8b6100;
  box-shadow: 0 0 20px rgba(196,150,10,0.15), 0 0 50px rgba(0,0,0,0.5);
  font-family: 'Georgia', serif;
  background: #120e00;
}
.choice-card.genre-rpg .choice-stamp  { color: #c4960a; border-color: #8b6100; }
.choice-card.genre-rpg .choice-ver    { color: #8b6100; }
.choice-card.genre-rpg .choice-prompt { color: #d4b870; }
.choice-card.genre-rpg .choice-btn    { border-color: #8b6100; background: #0a0800; }
.choice-card.genre-rpg .choice-btn:hover { background: #150f00; border-color: #c4960a; }
.choice-card.genre-rpg .choice-index  { color: #c4960a; border-color: #8b6100; }
.choice-card.genre-rpg .choice-label  { color: #d4b870; }

.choice-card.genre-puzzle {
  border-color: #555;
  box-shadow: 0 0 12px rgba(200,200,200,0.08);
  font-family: 'Courier New', monospace;
  background: #f5f5f0;
  color: #222;
}
.choice-card.genre-puzzle .choice-stamp  { color: #333; border-color: #666; }
.choice-card.genre-puzzle .choice-ver    { color: #555; }
.choice-card.genre-puzzle .choice-prompt { color: #222; }
.choice-card.genre-puzzle .choice-btn    { border-color: #aaa; background: #eee; color: #222; }
.choice-card.genre-puzzle .choice-btn:hover { background: #ddd; border-color: #555; }
.choice-card.genre-puzzle .choice-index  { color: #333; border-color: #999; }
.choice-card.genre-puzzle .choice-label  { color: #222; }
.choice-card.genre-puzzle .choice-footnote { color: #888; border-color: #ccc; }

.choice-card.genre-rhythm {
  border-color: #9900ff;
  box-shadow: 0 0 20px rgba(153,0,255,0.25), 0 0 50px rgba(0,0,0,0.5);
  background: #0a0014;
}
.choice-card.genre-rhythm .choice-stamp  { color: #ee88ff; border-color: #9900ff; }
.choice-card.genre-rhythm .choice-ver    { color: #bb44ff; }
.choice-card.genre-rhythm .choice-prompt { color: #ddaaff; }
.choice-card.genre-rhythm .choice-btn    { border-color: #9900ff; background: #080014; }
.choice-card.genre-rhythm .choice-btn:hover { background: #100020; border-color: #cc44ff; }
.choice-card.genre-rhythm .choice-index  { color: #ee88ff; border-color: #9900ff; }
.choice-card.genre-rhythm .choice-label  { color: #ddaaff; }

.choice-card.genre-horror {
  border-color: #880000;
  box-shadow: 0 0 20px rgba(136,0,0,0.3), 0 0 50px rgba(0,0,0,0.8);
  background: #0a0000;
}
.choice-card.genre-horror .choice-stamp  { color: #cc4444; border-color: #880000; }
.choice-card.genre-horror .choice-ver    { color: #882222; }
.choice-card.genre-horror .choice-prompt { color: #cc6666; }
.choice-card.genre-horror .choice-btn    { border-color: #880000; background: #060000; }
.choice-card.genre-horror .choice-btn:hover { background: #100000; border-color: #cc4444; }
.choice-card.genre-horror .choice-index  { color: #cc4444; border-color: #880000; }
.choice-card.genre-horror .choice-label  { color: #cc6666; }

.choice-card.genre-aquatic {
  border-color: #0088bb;
  box-shadow: 0 0 20px rgba(0,136,187,0.2), 0 0 50px rgba(0,0,0,0.5);
  background: #00090d;
}
.choice-card.genre-aquatic .choice-stamp  { color: #88ccff; border-color: #0088bb; }
.choice-card.genre-aquatic .choice-ver    { color: #0099cc; }
.choice-card.genre-aquatic .choice-prompt { color: #aaddff; }
.choice-card.genre-aquatic .choice-btn    { border-color: #0088bb; background: #000810; }
.choice-card.genre-aquatic .choice-btn:hover { background: #001020; border-color: #44aadd; }
.choice-card.genre-aquatic .choice-index  { color: #88ccff; border-color: #0088bb; }
.choice-card.genre-aquatic .choice-label  { color: #aaddff; }

/* ─── runner ─── */
.choice-card.genre-runner {
  border-color: #ff3333;
  border-left-width: 6px;
  box-shadow: -4px 0 0 #ff3333, 0 2px 8px rgba(0,0,0,0.15);
  background: #ffffff;
  font-family: Impact, 'Arial Black', sans-serif;
  color: #111;
}
.choice-card.genre-runner .choice-stamp  { color: #ff3333; border-color: #ff3333; }
.choice-card.genre-runner .choice-ver    { color: #cc2222; }
.choice-card.genre-runner .choice-prompt { color: #222222; }
.choice-card.genre-runner .choice-btn    { border-color: #ff3333; background: #f8f8f8; color: #222; }
.choice-card.genre-runner .choice-btn:hover { background: #fff0f0; border-color: #cc0000; }
.choice-card.genre-runner .choice-index  { color: #ff3333; border-color: #cc2222; }
.choice-card.genre-runner .choice-label  { color: #222222; }
.choice-card.genre-runner .choice-footnote { color: rgba(50,50,50,0.4); border-color: rgba(0,0,0,0.12); }

/* ─── stealth_action ─── */
.choice-card.genre-stealth_action {
  border-color: rgba(60,60,60,0.4);
  border-style: dashed;
  box-shadow: none;
  background: #050505;
  font-family: 'Courier New', monospace;
}
.choice-card.genre-stealth_action .choice-stamp  { color: rgba(100,100,100,0.55); border-color: rgba(60,60,60,0.4); }
.choice-card.genre-stealth_action .choice-ver    { color: rgba(80,80,80,0.5); }
.choice-card.genre-stealth_action .choice-prompt { color: rgba(155,155,155,0.5); }
.choice-card.genre-stealth_action .choice-btn    { border-color: rgba(60,60,60,0.35); background: #080808; }
.choice-card.genre-stealth_action .choice-btn:hover { background: #0d0d0d; border-color: rgba(100,100,100,0.5); }
.choice-card.genre-stealth_action .choice-index  { color: rgba(100,100,100,0.55); border-color: rgba(60,60,60,0.4); }
.choice-card.genre-stealth_action .choice-label  { color: rgba(155,155,155,0.5); }
.choice-card.genre-stealth_action .choice-footnote { color: rgba(80,80,80,0.3); border-color: rgba(60,60,60,0.2); }

/* ─── racing ─── */
.choice-card.genre-racing {
  border-color: #ff6600;
  border-top-width: 5px;
  box-shadow: 0 -3px 0 #ff6600, 0 0 20px rgba(255,100,0,0.18), 0 0 50px rgba(0,0,0,0.5);
  background: #0f0a00;
  font-family: Impact, 'Arial Black', sans-serif;
}
.choice-card.genre-racing .choice-stamp  { color: #ff6600; border-color: #ff6600; }
.choice-card.genre-racing .choice-ver    { color: #cc4400; }
.choice-card.genre-racing .choice-prompt { color: #ffcc88; }
.choice-card.genre-racing .choice-btn    { border-color: #ff6600; background: #1a0a00; }
.choice-card.genre-racing .choice-btn:hover { background: #250e00; border-color: #ff8800; }
.choice-card.genre-racing .choice-index  { color: #ff6600; border-color: #cc4400; }
.choice-card.genre-racing .choice-label  { color: #ffcc88; }

/* ─── platformer ─── */
.choice-card.genre-platformer {
  border-color: #ffcc00;
  border-width: 3px;
  border-radius: 8px;
  box-shadow: 4px 4px 0 #ffcc00, 0 0 20px rgba(0,80,180,0.2), 0 0 50px rgba(0,0,0,0.5);
  background: #001a4a;
}
.choice-card.genre-platformer .choice-stamp  { color: #ffcc00; border-color: #ffcc00; }
.choice-card.genre-platformer .choice-ver    { color: #ddaa00; }
.choice-card.genre-platformer .choice-prompt { color: #88ddff; }
.choice-card.genre-platformer .choice-btn    { border-color: #ffcc00; background: #001030; }
.choice-card.genre-platformer .choice-btn:hover { background: #001840; border-color: #ffee44; }
.choice-card.genre-platformer .choice-index  { color: #ffcc00; border-color: #ddaa00; }
.choice-card.genre-platformer .choice-label  { color: #88ddff; }

/* ─── dungeon ─── */
.choice-card.genre-dungeon {
  border-color: #6a3800;
  box-shadow: 3px 3px 0 #3a2000, 0 0 20px rgba(180,80,0,0.15), 0 0 50px rgba(0,0,0,0.5);
  background: #0c0800;
  font-family: 'Georgia', serif;
}
.choice-card.genre-dungeon .choice-stamp  { color: #c87020; border-color: #6a3800; }
.choice-card.genre-dungeon .choice-ver    { color: #8a5010; }
.choice-card.genre-dungeon .choice-prompt { color: #c8a060; }
.choice-card.genre-dungeon .choice-btn    { border-color: #6a3800; background: #080500; }
.choice-card.genre-dungeon .choice-btn:hover { background: #110800; border-color: #c87020; }
.choice-card.genre-dungeon .choice-index  { color: #c87020; border-color: #6a3800; }
.choice-card.genre-dungeon .choice-label  { color: #c8a060; }

/* ─── survival ─── */
.choice-card.genre-survival {
  border-color: #2a4a2a;
  box-shadow: 3px 3px 0 #1a3a1a, 0 0 16px rgba(60,100,40,0.1), 0 0 50px rgba(0,0,0,0.5);
  background: #050a05;
}
.choice-card.genre-survival .choice-stamp  { color: #5a9a5a; border-color: #2a4a2a; }
.choice-card.genre-survival .choice-ver    { color: #3a6a3a; }
.choice-card.genre-survival .choice-prompt { color: #88cc88; }
.choice-card.genre-survival .choice-btn    { border-color: #2a4a2a; background: #030803; }
.choice-card.genre-survival .choice-btn:hover { background: #060e06; border-color: #5a9a5a; }
.choice-card.genre-survival .choice-index  { color: #5a9a5a; border-color: #2a4a2a; }
.choice-card.genre-survival .choice-label  { color: #88cc88; }

/* ─── hack_slash ─── */
.choice-card.genre-hack_slash {
  border-color: #880000;
  box-shadow: 5px 5px 0 #440000, 0 0 20px rgba(200,0,0,0.25), 0 0 50px rgba(0,0,0,0.5);
  background: #0a0000;
}
.choice-card.genre-hack_slash .choice-stamp  { color: #ff4444; border-color: #880000; }
.choice-card.genre-hack_slash .choice-ver    { color: #aa2222; }
.choice-card.genre-hack_slash .choice-prompt { color: #ff9999; }
.choice-card.genre-hack_slash .choice-btn    { border-color: #880000; background: #060000; }
.choice-card.genre-hack_slash .choice-btn:hover { background: #100000; border-color: #cc3333; }
.choice-card.genre-hack_slash .choice-index  { color: #ff4444; border-color: #880000; }
.choice-card.genre-hack_slash .choice-label  { color: #ff9999; }

/* ─── arena ─── */
.choice-card.genre-arena {
  border-color: #880000;
  border-width: 3px;
  box-shadow: 5px 5px 0 #440000, 0 0 28px rgba(200,0,0,0.35), 0 0 50px rgba(0,0,0,0.7);
  background: #0f0000;
}
.choice-card.genre-arena .choice-stamp  { color: #ff5555; border-color: #880000; }
.choice-card.genre-arena .choice-ver    { color: #bb2222; }
.choice-card.genre-arena .choice-prompt { color: #ffaaaa; }
.choice-card.genre-arena .choice-btn    { border-color: #880000; background: #080000; }
.choice-card.genre-arena .choice-btn:hover { background: #120000; border-color: #dd3333; }
.choice-card.genre-arena .choice-index  { color: #ff5555; border-color: #880000; }
.choice-card.genre-arena .choice-label  { color: #ffaaaa; }

/* ─── aerial_stg ─── */
.choice-card.genre-aerial_stg {
  border-color: #1a66ff;
  box-shadow: 0 0 20px rgba(26,102,255,0.2), 0 0 50px rgba(0,0,0,0.5);
  font-family: 'Courier New', monospace;
  background: #000820;
}
.choice-card.genre-aerial_stg .choice-stamp  { color: #4488ff; border-color: #4488ff; }
.choice-card.genre-aerial_stg .choice-ver    { color: #4488ff; }
.choice-card.genre-aerial_stg .choice-prompt { color: #aaccff; }
.choice-card.genre-aerial_stg .choice-btn    { border-color: #1a66ff; background: #000820; }
.choice-card.genre-aerial_stg .choice-btn:hover { background: #001040; border-color: #4488ff; }
.choice-card.genre-aerial_stg .choice-index  { color: #4488ff; border-color: #4488ff; }
.choice-card.genre-aerial_stg .choice-label  { color: #aaccff; }

/* ─── bullet_hell ─── */
.choice-card.genre-bullet_hell {
  border-color: #2244cc;
  box-shadow: 0 0 20px rgba(34,68,204,0.25), 0 0 50px rgba(0,0,0,0.6);
  font-family: 'Courier New', monospace;
  background: #000010;
}
.choice-card.genre-bullet_hell .choice-stamp  { color: #3355dd; border-color: #2244cc; }
.choice-card.genre-bullet_hell .choice-ver    { color: #3355dd; }
.choice-card.genre-bullet_hell .choice-prompt { color: #99aaff; }
.choice-card.genre-bullet_hell .choice-btn    { border-color: #2244cc; background: #00000e; }
.choice-card.genre-bullet_hell .choice-btn:hover { background: #00001a; border-color: #4466ff; }
.choice-card.genre-bullet_hell .choice-index  { color: #3355dd; border-color: #2244cc; }
.choice-card.genre-bullet_hell .choice-label  { color: #99aaff; }

/* ─── bullet_runner ─── */
.choice-card.genre-bullet_runner {
  border-color: #5533ff;
  box-shadow: 0 0 20px rgba(85,51,255,0.2), 0 0 50px rgba(0,0,0,0.5);
  font-family: 'Courier New', monospace;
  background: #0a0018;
}
.choice-card.genre-bullet_runner .choice-stamp  { color: #7755ff; border-color: #5533ff; }
.choice-card.genre-bullet_runner .choice-ver    { color: #5533ff; }
.choice-card.genre-bullet_runner .choice-prompt { color: #bbaaff; }
.choice-card.genre-bullet_runner .choice-btn    { border-color: #5533ff; background: #060012; }
.choice-card.genre-bullet_runner .choice-btn:hover { background: #0d0020; border-color: #8866ff; }
.choice-card.genre-bullet_runner .choice-index  { color: #7755ff; border-color: #5533ff; }
.choice-card.genre-bullet_runner .choice-label  { color: #bbaaff; }

/* ─── idle ─── */
.choice-card.genre-idle {
  border-color: #888;
  box-shadow: 2px 2px 0 #aaa;
  font-family: 'Courier New', monospace;
  background: #fafaf8;
  color: #444;
}
.choice-card.genre-idle .choice-stamp  { color: #666; border-color: #888; }
.choice-card.genre-idle .choice-ver    { color: #777; }
.choice-card.genre-idle .choice-prompt { color: #555; }
.choice-card.genre-idle .choice-btn    { border-color: #bbb; background: #f0f0ee; color: #444; }
.choice-card.genre-idle .choice-btn:hover { background: #e8e8e6; border-color: #888; }
.choice-card.genre-idle .choice-index  { color: #666; border-color: #999; }
.choice-card.genre-idle .choice-label  { color: #444; }
.choice-card.genre-idle .choice-footnote { color: rgba(60,60,60,0.4); border-color: #ddd; }

/* ─── tower_def ─── */
.choice-card.genre-tower_def {
  border-color: #558855;
  box-shadow: 2px 2px 0 #558855;
  font-family: 'Courier New', monospace;
  background: #0a0f0a;
  color: #88aa88;
}
.choice-card.genre-tower_def .choice-stamp  { color: #558855; border-color: #558855; }
.choice-card.genre-tower_def .choice-ver    { color: #446644; }
.choice-card.genre-tower_def .choice-prompt { color: #88aa88; }
.choice-card.genre-tower_def .choice-btn    { border-color: #446644; background: #060e06; color: #88aa88; }
.choice-card.genre-tower_def .choice-btn:hover { background: #0a140a; border-color: #558855; }
.choice-card.genre-tower_def .choice-index  { color: #558855; border-color: #446644; }
.choice-card.genre-tower_def .choice-label  { color: #88aa88; }

/* ─── sports ─── */
.choice-card.genre-sports {
  border-color: #cc44ff;
  box-shadow: 0 0 20px rgba(200,68,255,0.2), 0 0 50px rgba(0,0,0,0.5);
  background: #0a001a;
}
.choice-card.genre-sports .choice-stamp  { color: #cc44ff; border-color: #cc44ff; }
.choice-card.genre-sports .choice-ver    { color: #aa33dd; }
.choice-card.genre-sports .choice-prompt { color: #ddaaff; }
.choice-card.genre-sports .choice-btn    { border-color: #9922cc; background: #060012; }
.choice-card.genre-sports .choice-btn:hover { background: #0d001c; border-color: #cc44ff; }
.choice-card.genre-sports .choice-index  { color: #cc44ff; border-color: #aa33dd; }
.choice-card.genre-sports .choice-label  { color: #ddaaff; }

/* ヘッダー */
.choice-header {
  text-align: center;
  margin-bottom: 22px;
  border-bottom: 1px solid rgba(0,255,65,0.2);
  padding-bottom: 14px;
}

.choice-stamp {
  display: inline-block;
  color: #00ff41;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 2px;
  padding: 4px 12px;
  margin-bottom: 8px;
  transform: rotate(-1.8deg);
  border: 1px solid #00ff41;
  border-radius: 1px;
  font-family: 'M PLUS 1 Code', monospace;
}

.choice-ver {
  font-size: 10px;
  color: #33aa55;
  letter-spacing: 1.5px;
  margin-bottom: 8px;
  font-family: 'M PLUS 1 Code', monospace;
}

.choice-prompt {
  font-size: 14px;
  color: #b8ffb8;
  font-weight: 600;
  letter-spacing: 0.4px;
}

/* 選択肢リスト */
.choice-options {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 16px;
}

.choice-btn {
  display: flex;
  align-items: center;
  gap: 12px;
  background: #001a00;
  border: 1px solid #33aa55;
  padding: 14px 18px;
  text-align: left;
  cursor: pointer;
  font-family: 'M PLUS 1 Code', cursive;
  border-radius: 2px;
  transition: background 0.15s, border-color 0.15s, box-shadow 0.15s, transform 0.1s;
  position: relative;
  overflow: hidden;
  box-shadow: 0 2px 6px rgba(0,0,0,0.3);
  opacity: 0;
  transform: translateY(8px);
}

.choice-btn.staggered {
  animation: optionReveal 0.2s cubic-bezier(0.22, 1, 0.36, 1) var(--delay, 0ms) both;
}

@keyframes optionReveal {
  0%   { opacity: 0; transform: translateY(8px); }
  100% { opacity: 1; transform: translateY(0); }
}

.choice-btn:hover {
  background: #002a00;
  border-color: #00ff41;
  box-shadow: 0 4px 12px rgba(0,255,65,0.15);
}

.choice-btn:active { transform: translateY(2px); }

.choice-btn.selected {
  background: #003300;
  border-color: #00ff41;
  box-shadow: 0 6px 16px rgba(0,255,65,0.2);
  animation: selectedFlash 0.25s ease;
}
.choice-btn.selected .choice-label,
.choice-btn.selected .choice-index,
.choice-btn.selected .choice-arrow { color: #00ff41; }

@keyframes selectedFlash {
  0%   { background: #001a00; }
  40%  { background: #002a00; }
  100% { background: #003300; }
}

.choice-btn.faded {
  opacity: 0.22;
  pointer-events: none;
}

.choice-index {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  color: #33aa55;
  font-size: 11px;
  font-weight: 700;
  border-radius: 1px;
  flex-shrink: 0;
  border: 1px solid #33aa55;
  font-family: 'M PLUS 1 Code', monospace;
  transition: background 0.15s, color 0.15s;
}

.choice-btn:hover .choice-index {
  background: rgba(0,255,65,0.1);
  color: #00ff41;
}

.choice-btn.selected .choice-index {
  background: rgba(0,255,65,0.2);
  color: #00ff41;
}

.choice-label {
  flex: 1;
  font-size: 13px;
  font-weight: 500;
  color: #b8ffb8;
  line-height: 1.45;
  transition: color 0.15s;
}

.choice-arrow {
  font-size: 14px;
  color: #33aa55;
  transition: color 0.15s;
  margin-left: 4px;
  font-family: 'M PLUS 1 Code', monospace;
}

/* フッター */
.choice-footnote {
  font-size: 10px;
  color: rgba(184,255,184,0.35);
  text-align: center;
  letter-spacing: 0.5px;
  border-top: 1px solid rgba(0,255,65,0.2);
  padding-top: 12px;
  margin-top: 2px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  flex-wrap: wrap;
}

.key-hint {
  color: rgba(184,255,184,0.25);
  font-size: 9px;
  letter-spacing: 0.5px;
}
</style>
