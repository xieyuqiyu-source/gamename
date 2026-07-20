import { defineStore } from 'pinia'
import {
  createDefaultSave,
  getStoragePersistence,
  loadGameSave,
  recordEndlessSettlement,
  recordRunSettlement,
  SAVE_KEY,
  writeGameSave,
} from '../services/saveService.js'
import {
  getUpgradeCost,
  getUpgradeDefinition,
  getUpgradeRefund,
  STAR_REWARDS,
  UPGRADE_DEFINITIONS,
} from '../config/progressionConfig.js'

const defaultSave = createDefaultSave()

export const useGameStore = defineStore('game', {
  state: () => ({
    projectName: 'Neon Breaker',
    saveVersion: defaultSave.saveVersion,
    profile: defaultSave.profile,
    currency: defaultSave.currency,
    campaign: defaultSave.campaign,
    endless: defaultSave.endless,
    upgrades: defaultSave.upgrades,
    settings: defaultSave.settings,
    saveStatus: 'loading',
    saveSource: 'new',
    savePersistence: 'local',
    saveBackupKey: null,
    lastSettledRunId: 0,
    screen: 'title',
    selectedLevel: 1,
    selectedChapter: 1,

    mode: 'menu',
    runType: 'campaign',
    runId: 0,
    level: 1,
    levelName: '初次折射',
    lives: 3,
    maxLives: 3,
    shieldCharges: 0,
    score: 0,
    bestScore: 0,
    coins: 0,
    runCoinsEarned: 0,
    clearBonus: 0,
    stars: 0,
    starBreakdown: { clear: false, survivor: false, mastery: false },
    combo: 0,
    maxCombo: 0,
    ballCount: 0,
    dropCount: 0,
    activeEffects: [],
    bricksRemaining: 0,
    totalBricks: 0,
    message: '准备进入霓虹试炼',
    resumeCountdown: 0,
    levelMeta: { chapter: '霓虹启程', accent: '#55f4dd', isBoss: false, targetScore: 15000, targetCombo: 35 },
    boss: null,
    wave: 0,
    wavesCleared: 0,
    hazardCount: 0,
    runModifiers: {},
  }),

  getters: {
    progressPercent: (state) => state.totalBricks
      ? Math.round((1 - state.bricksRemaining / state.totalBricks) * 100)
      : 0,
    currentRecord: (state) => state.campaign.levelRecords[String(state.level)]
      || { stars: 0, highScore: 0, bestCombo: 0, attempts: 0, clears: 0, bestLives: 0 },
    totalStars: (state) => Object.values(state.campaign.levelRecords)
      .reduce((total, record) => total + Number(record.stars || 0), 0),
    upgradeDefinitions: () => UPGRADE_DEFINITIONS,
    upgradeRefund: (state) => getUpgradeRefund(state.upgrades),
    claimedStarRewards: (state) => state.campaign.claimedStarRewards || [],
    availableStarRewards() {
      return STAR_REWARDS.filter((reward) => this.totalStars >= reward.stars && !this.claimedStarRewards.includes(reward.id))
    },
  },

  actions: {
    applySave(save, metadata = {}) {
      this.saveVersion = save.saveVersion
      this.profile = save.profile
      this.currency = save.currency
      this.campaign = save.campaign
      this.endless = save.endless
      this.upgrades = save.upgrades
      this.settings = save.settings
      this.coins = save.currency.coins
      const record = save.campaign.levelRecords[String(this.level)] || save.campaign.levelRecords[1]
      this.bestScore = record?.highScore || 0
      this.maxCombo = record?.bestCombo || 0
      this.saveSource = metadata.source || this.saveSource
      this.saveBackupKey = metadata.backupKey || null
      if (metadata.persistent === false) this.savePersistence = 'memory'
      else if (metadata.persistent === true) this.savePersistence = 'local'
      this.saveStatus = metadata.recovered ? 'recovered' : 'saved'
      this.selectedLevel = Math.min(this.selectedLevel || 1, save.campaign.highestUnlockedLevel)
      this.selectedChapter = Math.ceil(this.selectedLevel / 5)
    },

    hydrateSave() {
      const result = loadGameSave()
      this.applySave(result.save, result)
      return result
    },

    persistSave() {
      const save = writeGameSave(this.exportSave())
      this.applySave(save, { source: 'formal', persistent: getStoragePersistence() === 'local' })
      return save
    },

    exportSave() {
      return JSON.parse(JSON.stringify({
        saveVersion: this.saveVersion,
        profile: this.profile,
        currency: this.currency,
        campaign: this.campaign,
        endless: this.endless,
        upgrades: this.upgrades,
        settings: this.settings,
      }))
    },

    syncFromEngine(snapshot, { settle = true } = {}) {
      this.mode = snapshot.mode
      this.runType = snapshot.runType || 'campaign'
      this.runId = snapshot.runId
      this.level = snapshot.level
      this.levelName = snapshot.levelName
      this.lives = snapshot.lives
      this.maxLives = snapshot.maxLives || 3
      this.shieldCharges = snapshot.shieldCharges || 0
      this.score = snapshot.score
      this.bestScore = Math.max(this.bestScore, snapshot.bestScore)
      this.coins = snapshot.coins
      this.runCoinsEarned = snapshot.runCoinsEarned
      this.clearBonus = snapshot.clearBonus
      this.stars = snapshot.stars
      this.starBreakdown = snapshot.starBreakdown
      this.combo = snapshot.combo
      this.maxCombo = Math.max(this.maxCombo, snapshot.maxCombo)
      this.ballCount = snapshot.ballCount
      this.dropCount = snapshot.dropCount
      this.activeEffects = snapshot.activeEffects
      this.bricksRemaining = snapshot.bricksRemaining
      this.totalBricks = snapshot.totalBricks
      this.message = snapshot.message
      this.resumeCountdown = snapshot.resumeCountdown || 0
      this.levelMeta = snapshot.levelMeta || this.levelMeta
      this.boss = snapshot.boss || null
      this.wave = snapshot.wave || 0
      this.wavesCleared = snapshot.wavesCleared || 0
      this.hazardCount = snapshot.hazardCount || 0
      this.runModifiers = snapshot.runModifiers || {}

      if (settle && ['won', 'lost'].includes(snapshot.mode) && snapshot.runId > 0 && snapshot.runId !== this.lastSettledRunId) {
        this.settleRun(snapshot)
      }
    },

    settleRun(snapshot) {
      const endlessRun = snapshot.runType === 'endless'
      const updated = endlessRun
        ? recordEndlessSettlement(this.exportSave(), snapshot)
        : recordRunSettlement(this.exportSave(), snapshot)
      const runRecord = endlessRun ? null : updated.campaign.levelRecords[String(snapshot.level)]
      this.applySave(updated, { source: 'formal' })
      this.coins = snapshot.coins
      this.score = snapshot.score
      this.maxCombo = snapshot.maxCombo
      this.stars = snapshot.stars
      this.lastSettledRunId = snapshot.runId
      writeGameSave(updated)
      this.savePersistence = getStoragePersistence()
      this.bestScore = endlessRun ? updated.endless.highScore : runRecord.highScore
      this.saveStatus = 'saved'
    },

    resetProgress() {
      const fresh = writeGameSave(createDefaultSave())
      this.applySave(fresh, { source: 'new', persistent: getStoragePersistence() === 'local' })
      this.lastSettledRunId = 0
      this.mode = 'menu'
      this.runType = 'campaign'
      this.runId = 0
      this.score = 0
      this.runCoinsEarned = 0
      this.clearBonus = 0
      this.stars = 0
      this.starBreakdown = { clear: false, survivor: false, mastery: false }
      this.combo = 0
      this.activeEffects = []
      this.wave = 0
      this.wavesCleared = 0
      this.hazardCount = 0
      this.selectedLevel = 1
      this.selectedChapter = 1
      this.screen = 'title'
      return fresh
    },

    showTitle() { this.screen = 'title' },
    showCampaign() { this.screen = 'campaign' },
    showUpgrades() { this.screen = 'upgrades' },
    showSettings() { this.screen = 'settings' },

    updateSettings(patch = {}) {
      this.settings = { ...this.settings, ...patch }
      this.persistSave()
      return { ...this.settings }
    },

    selectChapter(chapterId) {
      const safe = Math.min(4, Math.max(1, Number(chapterId) || 1))
      this.selectedChapter = safe
      const firstUnlocked = (safe - 1) * 5 + 1
      if (firstUnlocked <= this.campaign.highestUnlockedLevel) this.selectedLevel = firstUnlocked
    },

    selectLevel(levelId) {
      const safe = Math.min(20, Math.max(1, Number(levelId) || 1))
      if (safe > this.campaign.highestUnlockedLevel) return false
      this.selectedLevel = safe
      this.selectedChapter = Math.ceil(safe / 5)
      return true
    },

    purchaseUpgrade(key) {
      const definition = getUpgradeDefinition(key)
      if (!definition) return { ok: false, reason: 'unknown' }
      const currentLevel = Math.min(definition.maxLevel, Number(this.upgrades[key]) || 0)
      if (currentLevel >= definition.maxLevel) return { ok: false, reason: 'max' }
      const cost = getUpgradeCost(key, currentLevel)
      if (this.currency.coins < cost) return { ok: false, reason: 'coins', cost }
      this.currency.coins -= cost
      this.coins = this.currency.coins
      this.upgrades[key] = currentLevel + 1
      this.persistSave()
      return { ok: true, level: currentLevel + 1, cost }
    },

    resetUpgrades() {
      const refund = getUpgradeRefund(this.upgrades)
      for (const definition of UPGRADE_DEFINITIONS) this.upgrades[definition.key] = 0
      this.currency.coins += refund
      this.coins = this.currency.coins
      this.persistSave()
      return refund
    },

    claimStarReward(rewardId) {
      const reward = STAR_REWARDS.find((entry) => entry.id === rewardId)
      if (!reward || this.totalStars < reward.stars || this.claimedStarRewards.includes(reward.id)) return false
      this.campaign.claimedStarRewards.push(reward.id)
      this.currency.coins += reward.coins
      this.coins = this.currency.coins
      this.persistSave()
      return true
    },

    saveDebugSummary() {
      return {
        key: SAVE_KEY,
        version: this.saveVersion,
        source: this.saveSource,
        status: this.saveStatus,
        coins: this.currency.coins,
        highestUnlockedLevel: this.campaign.highestUnlockedLevel,
        levelOne: this.campaign.levelRecords[1],
        totalStars: this.totalStars,
        selectedLevel: this.selectedLevel,
        upgrades: { ...this.upgrades },
        upgradeRefund: this.upgradeRefund,
        claimedStarRewards: [...this.claimedStarRewards],
        endless: { ...this.endless },
        settings: { ...this.settings },
        persistence: this.savePersistence,
        backupKey: this.saveBackupKey,
      }
    },
  },
})
