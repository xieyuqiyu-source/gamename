<script setup>
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import { MODE_LABELS } from './config/gameConfig'
import { GameEngine } from './engine/GameEngine'
import { useGameStore } from './stores/game'

const store = useGameStore()
const canvasRef = ref(null)
const engineRef = shallowRef(null)

const modeLabel = computed(() => MODE_LABELS[store.mode] || store.mode)
const primaryLabel = computed(() => {
  if (store.mode === 'menu') return '开始游戏'
  if (store.mode === 'ready') return '发射小球'
  if (store.mode === 'paused') return '继续游戏'
  if (store.mode === 'won' || store.mode === 'lost') return '重新挑战'
  if (store.activeEffects.some((effect) => effect.type === 'laser')) return '发射激光'
  return '暂停游戏'
})

function primaryAction() {
  const engine = engineRef.value
  if (!engine) return
  if (store.mode === 'menu' || store.mode === 'won' || store.mode === 'lost') engine.startNewGame()
  else if (store.mode === 'ready') engine.launch()
  else if (store.activeEffects.some((effect) => effect.type === 'laser')) engine.fireLaser()
  else engine.togglePause()
}

function pauseAction() {
  engineRef.value?.togglePause()
}

function toggleFullscreen() {
  if (!document.fullscreenElement) canvasRef.value?.requestFullscreen?.()
  else document.exitFullscreen?.()
}

function handleFullscreenKey(event) {
  if (event.key.toLowerCase() === 'f') toggleFullscreen()
}

onMounted(() => {
  const engine = new GameEngine(canvasRef.value, {
    onStateChange: (snapshot) => store.syncFromEngine(snapshot),
    startingCoins: store.coins,
    effectQuality: store.settings.effectQuality,
  })
  engineRef.value = engine
  engine.start()
  window.addEventListener('keydown', handleFullscreenKey)
  window.render_game_to_text = () => engine.getTextState()
  window.advanceTime = (milliseconds) => engine.advanceTime(milliseconds)
  if (import.meta.env.DEV) window.__NEON_BREAKER_TEST__ = engine
})

onBeforeUnmount(() => {
  engineRef.value?.destroy()
  window.removeEventListener('keydown', handleFullscreenKey)
  delete window.render_game_to_text
  delete window.advanceTime
  delete window.__NEON_BREAKER_TEST__
})
</script>

<template>
  <main class="game-app">
    <header class="game-header">
      <div class="brand-lockup">
        <span class="brand-mark" aria-hidden="true"></span>
        <div>
          <p>NEON ARCADE / BUILD 0.3</p>
          <h1>NEON BREAKER</h1>
        </div>
      </div>
      <div class="build-status">
        <span class="live-dot"></span>
        爽感与道具系统
      </div>
    </header>

    <section class="game-layout">
      <aside class="side-panel mission-panel">
        <p class="panel-kicker">MISSION</p>
        <h2>初次折射</h2>
        <div class="level-number">01</div>

        <dl class="stats-list">
          <div><dt>当前得分</dt><dd>{{ String(store.score).padStart(6, '0') }}</dd></div>
          <div><dt>最高得分</dt><dd>{{ String(store.bestScore).padStart(6, '0') }}</dd></div>
          <div><dt>剩余砖块</dt><dd>{{ store.bricksRemaining }} / {{ store.totalBricks }}</dd></div>
          <div><dt>晶币库存</dt><dd class="coin-value">◈ {{ store.coins }}</dd></div>
          <div><dt>最高连击</dt><dd>{{ store.maxCombo }} COMBO</dd></div>
        </dl>

        <div class="progress-block">
          <div><span>清除进度</span><strong>{{ store.progressPercent }}%</strong></div>
          <div class="progress-track"><span :style="{ width: `${store.progressPercent}%` }"></span></div>
        </div>

        <div class="life-readout">
          <span>剩余生命</span>
          <div aria-label="剩余生命">
            <i v-for="index in 3" :key="index" :class="{ active: index <= store.lives }"></i>
          </div>
        </div>

        <div class="combo-readout" :class="{ hot: store.combo >= 10 }">
          <span>当前连击</span><strong>{{ store.combo }}</strong>
        </div>
      </aside>

      <section class="playfield-shell">
        <div class="playfield-topline">
          <span><i></i>{{ modeLabel }}</span>
          <strong>540 × 960</strong>
        </div>
        <canvas
          ref="canvasRef"
          width="540"
          height="960"
          aria-label="霓虹打砖块游戏战场"
        ></canvas>
      </section>

      <aside class="side-panel control-panel">
        <p class="panel-kicker">CONTROL</p>
        <h2>操作终端</h2>

        <div class="status-card">
          <span>当前状态</span>
          <strong>{{ modeLabel }}</strong>
          <small>{{ store.message }}</small>
        </div>

        <div class="effect-rack">
          <div class="rack-heading"><span>ACTIVE MODULES</span><strong>{{ store.activeEffects.length }}</strong></div>
          <p v-if="!store.activeEffects.length" class="empty-effects">接住胶囊以激活战斗模块</p>
          <div v-for="effect in store.activeEffects" :key="effect.type" class="effect-chip" :style="{ '--effect-color': effect.color }">
            <i>{{ effect.short }}</i>
            <span>{{ effect.name }}<small v-if="effect.stacks"> ×{{ effect.stacks }}</small></span>
            <strong>{{ effect.remaining.toFixed(1) }}s</strong>
          </div>
        </div>

        <div class="control-guide">
          <div><kbd>A</kbd><kbd>D</kbd><span>移动挡板</span></div>
          <div><kbd>←</kbd><kbd>→</kbd><span>移动挡板</span></div>
          <div><kbd>SPACE</kbd><span>发球 / 继续</span></div>
          <div><kbd>SPACE</kbd><span>激光模块射击</span></div>
          <div><kbd>P</kbd><span>暂停游戏</span></div>
          <div><kbd>F</kbd><span>切换全屏</span></div>
        </div>

        <button id="primary-action" data-testid="primary-action" class="primary-action" type="button" @click="primaryAction">
          {{ primaryLabel }}
        </button>
        <button v-if="store.mode === 'playing' && store.activeEffects.some((effect) => effect.type === 'laser')" class="secondary-action" type="button" @click="pauseAction">暂停游戏</button>
        <button class="secondary-action" type="button" @click="toggleFullscreen">全屏显示</button>
      </aside>
    </section>

    <section class="mobile-command-bar">
      <div>
        <span>♥ {{ store.lives }}</span>
        <strong>{{ store.combo ? `${store.combo} 连击` : modeLabel }}</strong>
        <span>◈ {{ store.coins }}</span>
      </div>
      <div v-if="store.activeEffects.length" class="mobile-effects">
        <i v-for="effect in store.activeEffects" :key="effect.type" :style="{ '--effect-color': effect.color }">{{ effect.short }} {{ Math.ceil(effect.remaining) }}s</i>
      </div>
      <button type="button" @click="primaryAction">{{ primaryLabel }}</button>
    </section>

    <footer class="game-footer">
      <span>POWER DROP SYSTEM</span>
      <p>接住胶囊激活 5 种模块 · 晶币会被挡板磁吸 · 多种效果可同时叠加</p>
      <strong>v0.3.0</strong>
    </footer>
  </main>
</template>
