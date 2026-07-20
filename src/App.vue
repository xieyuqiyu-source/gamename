<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useGameStore } from './stores/game'

const store = useGameStore()
const canvasRef = ref(null)
const frame = ref(0)

const statusText = computed(() => store.lastAction)

function drawStage() {
  const canvas = canvasRef.value
  if (!canvas) return

  const ctx = canvas.getContext('2d')
  const width = canvas.width
  const height = canvas.height

  const background = ctx.createLinearGradient(0, 0, width, height)
  background.addColorStop(0, '#101824')
  background.addColorStop(1, '#162a34')
  ctx.fillStyle = background
  ctx.fillRect(0, 0, width, height)

  ctx.strokeStyle = 'rgba(92, 225, 201, 0.08)'
  ctx.lineWidth = 1
  for (let x = 0; x <= width; x += 48) {
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x, height)
    ctx.stroke()
  }
  for (let y = 0; y <= height; y += 48) {
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(width, y)
    ctx.stroke()
  }

  const pulse = 0.72 + Math.sin(frame.value / 24) * 0.08
  ctx.fillStyle = `rgba(92, 225, 201, ${pulse})`
  ctx.beginPath()
  ctx.arc(width / 2, height / 2 - 42, 28, 0, Math.PI * 2)
  ctx.fill()

  ctx.fillStyle = '#e7f7f2'
  ctx.textAlign = 'center'
  ctx.font = '700 34px system-ui, sans-serif'
  ctx.fillText('GAME STAGE READY', width / 2, height / 2 + 38)
  ctx.fillStyle = '#8aa8a5'
  ctx.font = '18px system-ui, sans-serif'
  ctx.fillText('方向已确定 · 下一阶段构建核心物理', width / 2, height / 2 + 76)
}

function advanceTime(milliseconds = 1000 / 60) {
  frame.value += Math.max(1, Math.round(milliseconds / (1000 / 60)))
  drawStage()
}

function toggleFullscreen() {
  const canvas = canvasRef.value
  if (!document.fullscreenElement) canvas?.requestFullscreen?.()
  else document.exitFullscreen?.()
}

function handleKeydown(event) {
  if (event.key.toLowerCase() === 'f') toggleFullscreen()
}

function renderGameToText() {
  return JSON.stringify({
    coordinateSystem: 'canvas 960x540; origin top-left; x right; y down',
    mode: store.mode,
    projectName: store.projectName,
    framework: ['Vue 3', 'Pinia', 'Vite'],
    saveVersion: store.saveVersion,
    bootCount: store.bootCount,
    lastAction: store.lastAction,
    stage: { width: 960, height: 540, status: 'ready' },
    availableActions: ['test Pinia state', 'reset local state', 'F fullscreen'],
  })
}

watch(() => store.lastAction, drawStage)

onMounted(() => {
  drawStage()
  window.addEventListener('keydown', handleKeydown)
  window.render_game_to_text = renderGameToText
  window.advanceTime = advanceTime
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeydown)
  delete window.render_game_to_text
  delete window.advanceTime
})
</script>

<template>
  <main class="app-shell">
    <header class="topbar">
      <div>
        <p class="eyebrow">PURE FRONTEND GAME STARTER</p>
        <h1>霓虹打砖块开发基线</h1>
      </div>
      <div class="stack-tags" aria-label="技术栈">
        <span>Vue 3</span>
        <span>Pinia</span>
        <span>Vite</span>
      </div>
    </header>

    <section class="workspace">
      <div class="stage-panel">
        <div class="panel-heading">
          <div>
            <span class="status-dot"></span>
            <strong>游戏舞台</strong>
          </div>
          <span>960 × 540</span>
        </div>
        <canvas ref="canvasRef" width="960" height="540" aria-label="空白游戏舞台"></canvas>
      </div>

      <aside class="foundation-panel">
        <p class="eyebrow">FOUNDATION</p>
        <h2>基础能力已接通</h2>
        <ul>
          <li><span>01</span><div><strong>响应式界面</strong><small>Vue 3 Composition API</small></div></li>
          <li><span>02</span><div><strong>全局游戏状态</strong><small>Pinia Store</small></div></li>
          <li><span>03</span><div><strong>本地状态保存</strong><small>localStorage</small></div></li>
          <li><span>04</span><div><strong>Canvas 游戏舞台</strong><small>v0.2.0 开始核心绘制</small></div></li>
        </ul>

        <div class="actions">
          <button id="test-state" class="primary" type="button" @click="store.testState">测试 Pinia 状态</button>
          <button type="button" @click="store.resetTemplate">重置本地状态</button>
        </div>
        <p class="state-output">{{ statusText }}</p>
        <p class="shortcut">按 <kbd>F</kbd> 切换全屏</p>
      </aside>
    </section>

    <footer>
      <span>下一步</span>
      <p>v0.2.0 将实现挡板、小球、砖块、三条生命与完整胜负循环。</p>
    </footer>
  </main>
</template>
