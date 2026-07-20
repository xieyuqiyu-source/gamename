<script setup>
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import { LEVEL_ONE, MODE_LABELS } from './config/gameConfig'
import { GameEngine } from './engine/GameEngine'
import { useGameStore } from './stores/game'

const store = useGameStore()
store.hydrateSave()

const canvasRef = ref(null)
const engineRef = shallowRef(null)
const resetArmed = ref(false)
const starSlots = [1, 2, 3]

const modeLabel = computed(() => MODE_LABELS[store.mode] || store.mode)
const record = computed(() => store.currentRecord)
const isSettlement = computed(() => ['won', 'lost'].includes(store.mode))
const showReturnButton = computed(() => ['briefing', 'won', 'lost'].includes(store.mode))
const saveStatusLabel = computed(() => {
  if (store.saveStatus === 'recovered') return '已恢复新存档'
  if (store.saveSource === 'legacy') return '旧进度已迁移'
  if (store.saveSource === 'new') return '新存档已建立'
  return '存档已同步'
})

const primaryLabel = computed(() => {
  if (store.mode === 'menu') return '进入任务'
  if (store.mode === 'briefing') return '开始挑战'
  if (store.mode === 'ready') return '发射小球'
  if (store.mode === 'paused') return '继续游戏'
  if (store.mode === 'countdown') return `取消继续 · ${Math.max(1, Math.ceil(store.resumeCountdown))}`
  if (store.mode === 'won') return '再次挑战'
  if (store.mode === 'lost') return '重新挑战'
  if (store.activeEffects.some((effect) => effect.type === 'laser')) return '发射激光'
  return '暂停游戏'
})

function primaryAction() {
  const engine = engineRef.value
  if (!engine) return
  resetArmed.value = false
  if (store.mode === 'menu') engine.openBriefing()
  else if (store.mode === 'briefing') engine.startNewGame()
  else if (store.mode === 'won' || store.mode === 'lost') engine.startNewGame()
  else if (store.mode === 'ready') engine.launch()
  else if (['paused', 'countdown'].includes(store.mode)) engine.togglePause()
  else if (store.activeEffects.some((effect) => effect.type === 'laser')) engine.fireLaser()
  else engine.togglePause()
}

function pauseAction() {
  engineRef.value?.togglePause()
}

function returnToTitle() {
  resetArmed.value = false
  engineRef.value?.loadProfile({
    coins: store.currency.coins,
    bestScore: record.value.highScore,
  })
}

function resetProgress() {
  if (!resetArmed.value) {
    resetArmed.value = true
    return
  }
  store.resetProgress()
  engineRef.value?.loadProfile({ coins: 0, bestScore: 0 })
  resetArmed.value = false
}

function toggleFullscreen() {
  if (!document.fullscreenElement) canvasRef.value?.requestFullscreen?.()
  else document.exitFullscreen?.()
}

function handleFullscreenKey(event) {
  if (event.key.toLowerCase() === 'f') toggleFullscreen()
}

function createTextState(engine) {
  const gameState = JSON.parse(engine.getTextState())
  return JSON.stringify({
    ...gameState,
    save: store.saveDebugSummary(),
    ui: {
      primaryAction: primaryLabel.value,
      canReturnToTitle: showReturnButton.value,
      saveStatus: saveStatusLabel.value,
    },
  })
}

onMounted(() => {
  const engine = new GameEngine(canvasRef.value, {
    onStateChange: (snapshot) => store.syncFromEngine(snapshot),
    startingCoins: store.currency.coins,
    startingBestScore: record.value.highScore,
    effectQuality: store.settings.effectQuality,
  })
  engineRef.value = engine
  engine.start()
  window.addEventListener('keydown', handleFullscreenKey)
  window.render_game_to_text = () => createTextState(engine)
  window.advanceTime = (milliseconds) => engine.advanceTime(milliseconds)
  if (import.meta.env.DEV) {
    window.__NEON_BREAKER_TEST__ = engine
    window.__NEON_BREAKER_SAVE_TEST__ = {
      summary: () => store.saveDebugSummary(),
      export: () => store.exportSave(),
      reload: () => store.hydrateSave(),
      reset: () => {
        const save = store.resetProgress()
        engine.loadProfile({ coins: 0, bestScore: 0 })
        return save
      },
    }
  }
})

onBeforeUnmount(() => {
  engineRef.value?.destroy()
  window.removeEventListener('keydown', handleFullscreenKey)
  delete window.render_game_to_text
  delete window.advanceTime
  delete window.__NEON_BREAKER_TEST__
  delete window.__NEON_BREAKER_SAVE_TEST__
})
</script>

<template>
  <main class="game-app" :data-mode="store.mode">
    <header class="game-header">
      <div class="brand-lockup">
        <span class="brand-mark" aria-hidden="true"></span>
        <div>
          <p>NEON ARCADE / BUILD 0.4</p>
          <h1>NEON BREAKER</h1>
        </div>
      </div>
      <div class="build-status">
        <span class="live-dot"></span>
        第一关完整纵切
      </div>
    </header>

    <section class="game-layout">
      <aside class="side-panel mission-panel">
        <p class="panel-kicker">MISSION 01</p>
        <h2>{{ LEVEL_ONE.name }}</h2>
        <p class="chapter-name">CHAPTER 01 / {{ LEVEL_ONE.chapter }}</p>

        <div class="record-stars" :aria-label="`历史最高 ${record.stars} 星`">
          <i v-for="star in starSlots" :key="star" :class="{ active: star <= record.stars }">★</i>
          <span>历史评价</span>
        </div>

        <dl class="stats-list compact-stats">
          <div><dt>当前得分</dt><dd>{{ String(store.score).padStart(6, '0') }}</dd></div>
          <div><dt>历史最高</dt><dd>{{ String(record.highScore).padStart(6, '0') }}</dd></div>
          <div><dt>最佳连击</dt><dd>{{ record.bestCombo }} COMBO</dd></div>
          <div><dt>挑战 / 通关</dt><dd>{{ record.attempts }} / {{ record.clears }}</dd></div>
          <div><dt>晶币库存</dt><dd class="coin-value">◈ {{ store.coins }}</dd></div>
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
          <strong>SAVE V{{ store.saveVersion }} · 540 × 960</strong>
        </div>
        <canvas
          ref="canvasRef"
          width="540"
          height="960"
          aria-label="霓虹打砖块游戏战场"
        ></canvas>
      </section>

      <aside class="side-panel control-panel">
        <p class="panel-kicker">COMMAND</p>
        <h2>操作终端</h2>

        <div class="status-card">
          <span>当前状态</span>
          <strong>{{ modeLabel }}</strong>
          <small>{{ store.message }}</small>
        </div>

        <div v-if="store.mode === 'briefing'" class="briefing-panel">
          <p>三星任务</p>
          <div><i>Ⅰ</i><span>清除全部砖块</span></div>
          <div><i>Ⅱ</i><span>至少剩余 2 条生命</span></div>
          <div><i>Ⅲ</i><span>{{ LEVEL_ONE.targetScore }} 分或 {{ LEVEL_ONE.targetCombo }} 连击</span></div>
          <small>清关奖励 ◈ {{ LEVEL_ONE.clearBonus }}</small>
        </div>

        <div v-else-if="isSettlement" class="result-panel" :class="store.mode">
          <div class="result-stars">
            <i v-for="star in starSlots" :key="star" :class="{ active: star <= store.stars }">★</i>
          </div>
          <strong>{{ store.mode === 'won' ? `${store.stars} 星完成` : '挑战未完成' }}</strong>
          <dl>
            <div><dt>最终得分</dt><dd>{{ store.score }}</dd></div>
            <div><dt>最高连击</dt><dd>{{ store.maxCombo }}</dd></div>
            <div><dt>本局晶币</dt><dd>+{{ store.runCoinsEarned }}</dd></div>
          </dl>
          <small>{{ saveStatusLabel }}</small>
        </div>

        <template v-else>
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
            <div><kbd>SPACE</kbd><span>确认 / 发球 / 激光</span></div>
            <div><kbd>P</kbd><span>暂停游戏</span></div>
            <div><kbd>F</kbd><span>切换全屏</span></div>
          </div>
        </template>

        <button id="primary-action" data-testid="primary-action" class="primary-action" type="button" @click="primaryAction">
          {{ primaryLabel }}
        </button>
        <button v-if="store.mode === 'playing' && store.activeEffects.some((effect) => effect.type === 'laser')" class="secondary-action" type="button" @click="pauseAction">暂停游戏</button>
        <button v-if="showReturnButton" data-testid="return-title" class="secondary-action" type="button" @click="returnToTitle">返回标题</button>
        <button class="secondary-action" type="button" @click="toggleFullscreen">全屏显示</button>

        <div class="save-readout" :class="store.saveStatus">
          <span><i></i>{{ saveStatusLabel }}</span>
          <strong>V{{ store.saveVersion }} · {{ store.totalStars }} / 60 ★</strong>
        </div>
        <button class="reset-save" :class="{ armed: resetArmed }" type="button" @click="resetProgress">
          {{ resetArmed ? '确认清空全部进度' : '重置本地存档' }}
        </button>
      </aside>
    </section>

    <section class="mobile-command-bar">
      <div>
        <span>♥ {{ store.lives }}</span>
        <strong>{{ store.combo ? `${store.combo} 连击` : modeLabel }}</strong>
        <span>◈ {{ store.coins }}</span>
      </div>
      <div v-if="isSettlement" class="mobile-result">
        <span><i v-for="star in starSlots" :key="star" :class="{ active: star <= store.stars }">★</i></span>
        <strong>+{{ store.runCoinsEarned }} ◈</strong>
      </div>
      <div v-if="store.activeEffects.length" class="mobile-effects">
        <i v-for="effect in store.activeEffects" :key="effect.type" :style="{ '--effect-color': effect.color }">{{ effect.short }} {{ Math.ceil(effect.remaining) }}s</i>
      </div>
      <button type="button" @click="primaryAction">{{ primaryLabel }}</button>
      <button v-if="store.mode === 'playing' && store.activeEffects.some((effect) => effect.type === 'laser')" class="mobile-secondary" type="button" @click="pauseAction">暂停游戏</button>
      <button v-if="showReturnButton" class="mobile-secondary" type="button" @click="returnToTitle">返回标题</button>
      <div v-if="['menu', 'won', 'lost'].includes(store.mode)" class="mobile-save-row" :class="store.saveStatus">
        <span>{{ saveStatusLabel }} · {{ store.totalStars }} / 60 ★</span>
        <button class="mobile-reset-save" :class="{ armed: resetArmed }" type="button" @click="resetProgress">
          {{ resetArmed ? '确认清空' : '重置存档' }}
        </button>
      </div>
    </section>

    <footer class="game-footer">
      <span>CAMPAIGN VERTICAL SLICE</span>
      <p>任务简报 → 发球战斗 → 三星结算 → 正式本地存档</p>
      <strong>v0.4.0</strong>
    </footer>
  </main>
</template>
