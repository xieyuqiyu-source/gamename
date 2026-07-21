<script setup>
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import CampaignHub from './components/CampaignHub.vue'
import SettingsPanel from './components/SettingsPanel.vue'
import UpgradeLab from './components/UpgradeLab.vue'
import { MODE_LABELS } from './config/gameConfig'
import { getChapterLevels, getEndlessLevelConfig, getLevelConfig, LEVELS } from './config/levels'
import { getRunModifiers, getUpgradeCost, UPGRADE_DEFINITIONS } from './config/progressionConfig'
import { detectVisualCapabilities, resolveEffectQuality } from './config/visualSettings'
import { GameEngine } from './engine/GameEngine'
import { useGameStore } from './stores/game'

const store = useGameStore()
store.hydrateSave()
const brandIconUrl = `${import.meta.env.BASE_URL}favicon.svg`

const devPreviewParams = import.meta.env.DEV ? new URLSearchParams(window.location.search) : null
const requestedPreviewQuality = devPreviewParams?.get('quality')
const previewQualityOverride = ['high', 'medium', 'low'].includes(requestedPreviewQuality) ? requestedPreviewQuality : null
const previewShakeOverride = previewQualityOverride && devPreviewParams.has('shake') ? devPreviewParams.get('shake') !== '0' : null
const previewFlashOverride = previewQualityOverride && devPreviewParams.has('reducedFlash') ? devPreviewParams.get('reducedFlash') === '1' : null

const canvasRef = ref(null)
const engineRef = shallowRef(null)
const resetArmed = ref(false)
const previewMode = ref(false)
const visualCapabilities = ref(detectVisualCapabilities(window))
const starSlots = [1, 2, 3]

const modeLabel = computed(() => MODE_LABELS[store.mode] || store.mode)
const isEndless = computed(() => store.runType === 'endless')
const record = computed(() => isEndless.value
  ? { stars: 0, highScore: store.endless.highScore, bestCombo: store.endless.bestCombo, attempts: 0, clears: 0, bestLives: 0 }
  : store.currentRecord)
const isSettlement = computed(() => ['won', 'lost'].includes(store.mode))
const showReturnButton = computed(() => ['briefing', 'won', 'lost'].includes(store.mode))
const currentLevel = computed(() => isEndless.value ? getEndlessLevelConfig(store.wave || 1) : getLevelConfig(store.level))
const bossActive = computed(() => store.screen === 'game' && store.mode !== 'menu' ? store.boss : null)
const canNavigate = computed(() => !['ready', 'playing', 'paused', 'countdown'].includes(store.mode))
const resolvedEffectQuality = computed(() => previewQualityOverride || resolveEffectQuality(store.settings.effectQuality, visualCapabilities.value))
const effectiveScreenShake = computed(() => previewShakeOverride ?? store.settings.screenShake)
const effectiveReducedFlash = computed(() => previewFlashOverride ?? store.settings.reducedFlash)
const saveStatusLabel = computed(() => {
  if (store.savePersistence === 'memory') return '临时内存 · 本地写入受限'
  if (store.saveStatus === 'recovered') return '已恢复新存档'
  if (store.saveSource === 'legacy') return '旧进度已迁移'
  if (store.saveSource === 'new') return '新存档已建立'
  return '存档已同步'
})

const primaryLabel = computed(() => {
  if (store.mode === 'menu') return '进入战役'
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
  if (store.mode === 'menu') openCampaign()
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

function returnToCampaign() {
  resetArmed.value = false
  const selected = getLevelConfig(store.selectedLevel)
  const selectedRecord = store.campaign.levelRecords[String(selected.id)] || { highScore: 0 }
  engineRef.value?.loadProfile({
    coins: store.currency.coins,
    bestScore: selectedRecord.highScore,
    modifiers: getRunModifiers(store.upgrades),
    levelConfig: selected,
  })
  store.showCampaign()
}

function openCampaign() {
  resetArmed.value = false
  store.showCampaign()
}

function openUpgrades() {
  resetArmed.value = false
  engineRef.value?.loadProfile({
    coins: store.currency.coins,
    bestScore: record.value.highScore,
    modifiers: getRunModifiers(store.upgrades),
    levelConfig: currentLevel.value,
  })
  store.showUpgrades()
}

function openSettings() {
  resetArmed.value = false
  store.showSettings()
}

function syncVisualSettings() {
  engineRef.value?.configureVisualSettings({
    effectQuality: resolvedEffectQuality.value,
    screenShake: effectiveScreenShake.value,
    reducedFlash: effectiveReducedFlash.value,
  })
}

function updateVisualSettings(patch) {
  store.updateSettings(patch)
  syncVisualSettings()
}

function handleViewportChange() {
  visualCapabilities.value = detectVisualCapabilities(window)
  if (store.settings.effectQuality === 'auto') syncVisualSettings()
}

function showTitle() {
  resetArmed.value = false
  const level = getLevelConfig(store.selectedLevel)
  const levelRecord = store.campaign.levelRecords[String(level.id)] || { highScore: 0 }
  engineRef.value?.loadProfile({
    coins: store.currency.coins,
    bestScore: levelRecord.highScore,
    modifiers: getRunModifiers(store.upgrades),
    levelConfig: level,
  })
  store.showTitle()
}

function playLevel(level) {
  if (!store.selectLevel(level.id)) return
  previewMode.value = false
  const levelRecord = store.campaign.levelRecords[String(level.id)] || { highScore: 0 }
  engineRef.value?.configureLevel(level, {
    coins: store.currency.coins,
    bestScore: levelRecord.highScore,
    modifiers: getRunModifiers(store.upgrades),
  })
  store.screen = 'game'
}

function playEndless() {
  if (!store.endless.unlocked) return
  previewMode.value = false
  engineRef.value?.configureEndless({
    wave: 1,
    coins: store.currency.coins,
    bestScore: store.endless.highScore,
    modifiers: getRunModifiers(store.upgrades),
  })
  store.screen = 'game'
}

function resetProgress() {
  if (!resetArmed.value) {
    resetArmed.value = true
    return
  }
  store.resetProgress()
  engineRef.value?.loadProfile({ coins: 0, bestScore: 0, modifiers: getRunModifiers(store.upgrades), levelConfig: getLevelConfig(1) })
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
  const screenDetails = store.screen === 'campaign' ? {
    chapter: store.selectedChapter,
    selectedLevel: store.selectedLevel,
    highestUnlockedLevel: store.campaign.highestUnlockedLevel,
    visibleLevels: getChapterLevels(store.selectedChapter).map((level) => ({
      id: level.id,
      name: level.name,
      isBoss: level.isBoss,
      unlocked: level.id <= store.campaign.highestUnlockedLevel,
      stars: store.campaign.levelRecords[String(level.id)]?.stars || 0,
    })),
    availableStarRewards: store.availableStarRewards.map((reward) => reward.id),
    endless: { ...store.endless },
  } : store.screen === 'upgrades' ? {
    coins: store.currency.coins,
    refund: store.upgradeRefund,
    modules: UPGRADE_DEFINITIONS.map((definition) => ({
      key: definition.key,
      level: store.upgrades[definition.key],
      maxLevel: definition.maxLevel,
      nextCost: getUpgradeCost(definition.key, store.upgrades[definition.key]),
    })),
  } : store.screen === 'settings' ? {
    requestedQuality: store.settings.effectQuality,
    resolvedQuality: resolvedEffectQuality.value,
    screenShake: store.settings.screenShake,
    reducedFlash: store.settings.reducedFlash,
    persistence: store.savePersistence,
    capabilities: visualCapabilities.value,
  } : null
  return JSON.stringify({
    ...gameState,
    save: store.saveDebugSummary(),
    ui: {
      primaryAction: primaryLabel.value,
      canReturnToTitle: showReturnButton.value,
      screen: store.screen,
      screenDetails,
      saveStatus: saveStatusLabel.value,
    },
  })
}

onMounted(() => {
  const engine = new GameEngine(canvasRef.value, {
    onStateChange: (snapshot) => store.syncFromEngine(snapshot, { settle: !previewMode.value }),
    startingCoins: store.currency.coins,
    startingBestScore: record.value.highScore,
    effectQuality: resolvedEffectQuality.value,
    screenShake: effectiveScreenShake.value,
    reducedFlash: effectiveReducedFlash.value,
    levelConfig: currentLevel.value,
    modifiers: getRunModifiers(store.upgrades),
    onOpenCampaign: openCampaign,
    isInputEnabled: () => ['title', 'game'].includes(store.screen),
  })
  engineRef.value = engine
  engine.start()
  window.addEventListener('keydown', handleFullscreenKey)
  window.addEventListener('resize', handleViewportChange)
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
        engine.loadProfile({ coins: 0, bestScore: 0, modifiers: getRunModifiers(store.upgrades), levelConfig: getLevelConfig(1) })
        return save
      },
    }
    window.__NEON_BREAKER_PROGRESSION_TEST__ = {
      levels: () => LEVELS.map((level) => ({ ...level, layout: [...level.layout] })),
      openLevel: (levelId) => {
        const level = getLevelConfig(levelId)
        if (level.id > store.campaign.highestUnlockedLevel) return false
        playLevel(level)
        return true
      },
      previewLevel: (levelId) => {
        previewMode.value = true
        const level = getLevelConfig(levelId)
        const levelRecord = store.campaign.levelRecords[String(level.id)] || { highScore: 0 }
        engine.configureLevel(level, {
          coins: store.currency.coins,
          bestScore: levelRecord.highScore,
          modifiers: getRunModifiers(store.upgrades),
        })
        store.screen = 'game'
        return true
      },
      previewEndless: (wave = 1) => {
        previewMode.value = true
        engine.configureEndless({ wave, coins: store.currency.coins, bestScore: store.endless.highScore, modifiers: getRunModifiers(store.upgrades) })
        store.screen = 'game'
        return true
      },
      purchase: (key) => store.purchaseUpgrade(key),
      resetUpgrades: () => store.resetUpgrades(),
      claimReward: (id) => store.claimStarReward(id),
    }

    const previewParams = devPreviewParams
    const previewQuality = previewParams.get('quality')
    if (['high', 'medium', 'low'].includes(previewQuality)) {
      engine.configureVisualSettings({
        effectQuality: previewQuality,
        screenShake: previewParams.get('shake') !== '0',
        reducedFlash: previewParams.get('reducedFlash') === '1',
      })
    }
    const previewLevelId = Number(previewParams.get('preview'))
    if (previewLevelId >= 1 && previewLevelId <= 20) {
      previewMode.value = true
      const previewLevel = getLevelConfig(previewLevelId)
      const previewRecord = store.campaign.levelRecords[String(previewLevel.id)] || { highScore: 0 }
      engine.configureLevel(previewLevel, {
        coins: store.currency.coins,
        bestScore: previewRecord.highScore,
        modifiers: getRunModifiers(store.upgrades),
      })
      store.screen = 'game'
      if (previewParams.get('autostart') === '1') {
        engine.startNewGame()
        if (previewParams.get('ready') !== '1') engine.launch()
        const previewPhase = Math.min(previewLevel.boss?.phases || 1, Math.max(1, Number(previewParams.get('phase')) || 1))
        if (previewLevel.boss && previewPhase > 1) {
          engine.startBossPhase(previewPhase)
          engine.state.boss.hp = previewLevel.boss.maxHp - (previewPhase - 1) * (previewLevel.boss.maxHp / previewLevel.boss.phases)
          engine.touchState(); engine.publish(true); engine.render()
        }
        if (previewLevel.boss && previewParams.get('exposed') === '1') {
          for (const brick of engine.state.bricks) brick.hp = 0
          engine.breakBossShield()
        }

        const previewResult = previewParams.get('result')
        if (previewResult === 'won') {
          if (engine.state.boss) {
            engine.state.boss.hp = 0
            engine.state.boss.defeated = true
            engine.state.boss.shieldActive = false
            engine.state.boss.shieldNodes = 0
          }
          engine.debugWin()
        }
        if (previewResult === 'lost') {
          engine.state.lives = 1
          engine.debugLoseLife()
        }
      }
    }
    if (previewParams.get('endless') === '1') {
      previewMode.value = true
      const previewWave = Math.max(1, Number(previewParams.get('wave')) || 1)
      engine.configureEndless({ wave: previewWave, coins: store.currency.coins, bestScore: store.endless.highScore, modifiers: getRunModifiers(store.upgrades) })
      store.screen = 'game'
      if (previewParams.get('autostart') === '1') {
        engine.startNewGame()
        if (previewParams.get('ready') !== '1') engine.launch()
      }
    }
  }
})

onBeforeUnmount(() => {
  engineRef.value?.destroy()
  window.removeEventListener('keydown', handleFullscreenKey)
  window.removeEventListener('resize', handleViewportChange)
  delete window.render_game_to_text
  delete window.advanceTime
  delete window.__NEON_BREAKER_TEST__
  delete window.__NEON_BREAKER_SAVE_TEST__
  delete window.__NEON_BREAKER_PROGRESSION_TEST__
})
</script>

<template>
  <main class="game-app" :data-mode="store.mode">
    <header class="game-header">
      <div class="brand-lockup">
        <img class="brand-mark" :src="brandIconUrl" alt="" aria-hidden="true" />
        <div>
          <p>NEON ARCADE / RELEASE 1.0</p>
          <h1><span>霓虹破界</span><small>NEON BREAKER</small></h1>
        </div>
      </div>
      <div class="header-actions">
        <nav v-if="canNavigate" class="global-nav" aria-label="全局导航">
          <button type="button" :class="{ active: store.screen === 'title' }" @click="showTitle">标题</button>
          <button type="button" :class="{ active: store.screen === 'campaign' }" @click="openCampaign">战役</button>
          <button type="button" :class="{ active: store.screen === 'upgrades' }" @click="openUpgrades">强化</button>
          <button data-testid="settings-nav" type="button" :class="{ active: store.screen === 'settings' }" @click="openSettings">设置</button>
        </nav>
        <div class="build-status">
          <span class="live-dot"></span>
          正式版 · 全内容上线
        </div>
      </div>
    </header>

    <CampaignHub
      v-if="store.screen === 'campaign'"
      @play="playLevel"
      @endless="playEndless"
      @upgrades="openUpgrades"
      @title="showTitle"
    />
    <UpgradeLab
      v-if="store.screen === 'upgrades'"
      @campaign="openCampaign"
      @title="showTitle"
    />
    <SettingsPanel
      v-if="store.screen === 'settings'"
      :resolved-quality="resolvedEffectQuality"
      :capabilities="visualCapabilities"
      @change="updateVisualSettings"
      @campaign="openCampaign"
      @title="showTitle"
    />

    <section v-show="['title', 'game'].includes(store.screen)" class="game-layout">
      <aside class="side-panel mission-panel">
        <p class="panel-kicker">{{ isEndless ? `ENDLESS / WAVE ${String(store.wave).padStart(2, '0')}` : `MISSION ${String(currentLevel.id).padStart(2, '0')}` }}</p>
        <h2>{{ currentLevel.name }}</h2>
        <p class="chapter-name">{{ isEndless ? 'MAGNETIC SURVIVAL PROTOCOL' : `CHAPTER ${String(currentLevel.chapterId).padStart(2, '0')} / ${currentLevel.chapter}` }}</p>

        <div v-if="!isEndless" class="record-stars" :aria-label="`历史最高 ${record.stars} 星`">
          <i v-for="star in starSlots" :key="star" :class="{ active: star <= record.stars }">★</i>
          <span>历史评价</span>
        </div>
        <div v-else class="endless-wave-card">
          <span>当前波次</span><strong>{{ String(store.wave).padStart(2, '0') }}</strong><small>历史最高 W{{ store.endless.highestWave }}</small>
        </div>

        <dl class="stats-list compact-stats">
          <div><dt>当前得分</dt><dd>{{ String(store.score).padStart(6, '0') }}</dd></div>
          <div><dt>历史最高</dt><dd>{{ String(record.highScore).padStart(6, '0') }}</dd></div>
          <div><dt>最佳连击</dt><dd>{{ record.bestCombo }} COMBO</dd></div>
          <div v-if="!isEndless"><dt>挑战 / 通关</dt><dd>{{ record.attempts }} / {{ record.clears }}</dd></div>
          <div v-else><dt>已清波次</dt><dd>{{ store.wavesCleared }} WAVE</dd></div>
          <div><dt>晶币库存</dt><dd class="coin-value">◈ {{ store.coins }}</dd></div>
        </dl>

        <div class="progress-block">
          <div><span>{{ bossActive ? '当前护盾' : isEndless ? `WAVE ${store.wave} 进度` : '清除进度' }}</span><strong>{{ store.progressPercent }}%</strong></div>
          <div class="progress-track"><span :style="{ width: `${store.progressPercent}%` }"></span></div>
        </div>

        <div class="life-readout">
          <span>剩余生命</span>
          <div aria-label="剩余生命">
            <i v-for="index in store.maxLives" :key="index" :class="{ active: index <= store.lives }"></i>
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
          aria-label="霓虹破界游戏战场"
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
          <p>{{ isEndless ? '无尽协议' : '三星任务' }}</p>
          <template v-if="isEndless">
            <div><i>∞</i><span>清空砖阵后连续进入下一波</span></div>
            <div><i>↗</i><span>球速与强化砖密度逐波提升</span></div>
            <div><i>◆</i><span>失败后保存分数、波次与连击</span></div>
            <small>生命、得分和模块效果跨波保留</small>
          </template>
          <template v-else>
            <div><i>Ⅰ</i><span>{{ currentLevel.isBoss ? (currentLevel.boss?.objective || '击破三阶段棱镜核心') : '清除全部砖块' }}</span></div>
            <div><i>Ⅱ</i><span>至少剩余 2 条生命</span></div>
            <div><i>Ⅲ</i><span>{{ currentLevel.targetScore }} 分或 {{ currentLevel.targetCombo }} 连击</span></div>
            <small>清关奖励 ◈ {{ currentLevel.clearBonus }}</small>
          </template>
          <strong v-if="currentLevel.boss" class="boss-briefing">{{ currentLevel.boss.codename }} · {{ currentLevel.boss.phases }} PHASES · {{ currentLevel.boss.maxHp }} CORE</strong>
        </div>

        <div v-else-if="isSettlement" class="result-panel" :class="store.mode">
          <div v-if="!isEndless" class="result-stars">
            <i v-for="star in starSlots" :key="star" :class="{ active: star <= store.stars }">★</i>
          </div>
          <strong>{{ isEndless ? `抵达 WAVE ${store.wave}` : store.mode === 'won' ? `${store.stars} 星完成` : '挑战未完成' }}</strong>
          <dl>
            <div><dt>最终得分</dt><dd>{{ store.score }}</dd></div>
            <div><dt>最高连击</dt><dd>{{ store.maxCombo }}</dd></div>
            <div><dt>本局晶币</dt><dd>+{{ store.runCoinsEarned }}</dd></div>
            <div v-if="isEndless"><dt>已清波次</dt><dd>{{ store.wavesCleared }}</dd></div>
          </dl>
          <small>{{ saveStatusLabel }}</small>
        </div>

        <template v-else>
          <div v-if="bossActive" class="boss-terminal" :class="{ exposed: !bossActive.shieldActive }">
            <header><span>BOSS SIGNAL</span><strong>P{{ bossActive.phase }} / {{ bossActive.maxPhases }}</strong></header>
            <div><b>{{ bossActive.codename }}</b><small>{{ bossActive.shieldActive ? `护盾节点 ${bossActive.shieldNodes}` : '核心暴露' }}</small></div>
            <p><i :style="{ width: `${bossActive.hp / bossActive.maxHp * 100}%` }"></i></p>
            <footer><span>CORE {{ bossActive.hp }} / {{ bossActive.maxHp }}</span><strong>{{ bossActive.shieldActive ? 'SHIELDED' : 'ATTACK' }}</strong></footer>
            <div v-if="bossActive.modules?.length || bossActive.barrage" class="boss-module-line">
              <span>{{ bossActive.modules?.length ? 'ATTACK MODULES' : 'BARRAGE SIGNAL' }}</span>
              <strong>{{ bossActive.modules?.length ? `${bossActive.modulesAlive} / ${bossActive.modules.length}` : 'ACTIVE' }}</strong>
              <small>{{ store.hazardCount }} THREAT</small>
            </div>
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
            <div><kbd>SPACE</kbd><span>确认 / 发球 / 激光</span></div>
            <div><kbd>P</kbd><span>暂停游戏</span></div>
            <div><kbd>F</kbd><span>切换全屏</span></div>
          </div>
        </template>

        <button id="primary-action" data-testid="primary-action" class="primary-action" type="button" @click="primaryAction">
          {{ primaryLabel }}
        </button>
        <button v-if="store.mode === 'playing' && store.activeEffects.some((effect) => effect.type === 'laser')" class="secondary-action" type="button" @click="pauseAction">暂停游戏</button>
        <button v-if="showReturnButton" data-testid="return-campaign" class="secondary-action" type="button" @click="returnToCampaign">返回战役</button>
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

    <section v-show="['title', 'game'].includes(store.screen)" class="mobile-command-bar">
      <div>
        <span>♥ {{ store.lives }}</span>
        <strong>{{ bossActive ? `BOSS P${bossActive.phase} · ${bossActive.modules?.length ? `模块 ${bossActive.modulesAlive}` : bossActive.barrage && !bossActive.shieldActive ? `弹幕 ${store.hazardCount}` : bossActive.shieldActive ? `盾 ${bossActive.shieldNodes}` : `核 ${bossActive.hp}`}` : isEndless ? `WAVE ${store.wave} · ${store.bricksRemaining} BRICK` : store.combo ? `${store.combo} 连击` : modeLabel }}</strong>
        <span>◈ {{ store.coins }}</span>
      </div>
      <div v-if="isSettlement" class="mobile-result">
        <span v-if="!isEndless"><i v-for="star in starSlots" :key="star" :class="{ active: star <= store.stars }">★</i></span>
        <span v-else>BEST W{{ store.endless.highestWave }}</span>
        <strong>+{{ store.runCoinsEarned }} ◈</strong>
      </div>
      <div v-if="store.activeEffects.length" class="mobile-effects">
        <i v-for="effect in store.activeEffects" :key="effect.type" :style="{ '--effect-color': effect.color }">{{ effect.short }} {{ Math.ceil(effect.remaining) }}s</i>
      </div>
      <button type="button" @click="primaryAction">{{ primaryLabel }}</button>
      <button v-if="store.mode === 'playing' && store.activeEffects.some((effect) => effect.type === 'laser')" class="mobile-secondary" type="button" @click="pauseAction">暂停游戏</button>
      <button v-if="showReturnButton" class="mobile-secondary" type="button" @click="returnToCampaign">返回战役</button>
      <div v-if="['menu', 'won', 'lost'].includes(store.mode)" class="mobile-save-row" :class="store.saveStatus">
        <span>{{ saveStatusLabel }} · {{ store.totalStars }} / 60 ★</span>
        <button class="mobile-reset-save" :class="{ armed: resetArmed }" type="button" @click="resetProgress">
          {{ resetArmed ? '确认清空' : '重置存档' }}
        </button>
      </div>
    </section>

    <footer v-show="['title', 'game'].includes(store.screen)" class="game-footer">
      <span>ARCADE CAMPAIGN COMPLETE</span>
      <p>20 关全章节 · 四大核心 · 组合弹幕 · 双端战斗</p>
      <strong>v1.0.2</strong>
    </footer>
  </main>
</template>
