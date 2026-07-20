import { defineStore } from 'pinia'
import {
  createDefaultSave,
  loadGameSave,
  recordRunSettlement,
  SAVE_KEY,
  writeGameSave,
} from '../services/saveService'

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
    saveBackupKey: null,
    lastSettledRunId: 0,

    mode: 'menu',
    runId: 0,
    level: 1,
    levelName: '初次折射',
    lives: 3,
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
  }),

  getters: {
    progressPercent: (state) => state.totalBricks
      ? Math.round((1 - state.bricksRemaining / state.totalBricks) * 100)
      : 0,
    currentRecord: (state) => state.campaign.levelRecords[String(state.level)]
      || { stars: 0, highScore: 0, bestCombo: 0, attempts: 0, clears: 0, bestLives: 0 },
    totalStars: (state) => Object.values(state.campaign.levelRecords)
      .reduce((total, record) => total + Number(record.stars || 0), 0),
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
      this.saveStatus = metadata.recovered ? 'recovered' : 'saved'
    },

    hydrateSave() {
      const result = loadGameSave()
      this.applySave(result.save, result)
      return result
    },

    persistSave() {
      const save = writeGameSave(this.exportSave())
      this.applySave(save, { source: 'formal' })
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

    syncFromEngine(snapshot) {
      this.mode = snapshot.mode
      this.runId = snapshot.runId
      this.level = snapshot.level
      this.levelName = snapshot.levelName
      this.lives = snapshot.lives
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

      if (['won', 'lost'].includes(snapshot.mode) && snapshot.runId > 0 && snapshot.runId !== this.lastSettledRunId) {
        this.settleRun(snapshot)
      }
    },

    settleRun(snapshot) {
      const updated = recordRunSettlement(this.exportSave(), snapshot)
      const runRecord = updated.campaign.levelRecords[String(snapshot.level)]
      this.applySave(updated, { source: 'formal' })
      this.coins = snapshot.coins
      this.score = snapshot.score
      this.maxCombo = snapshot.maxCombo
      this.stars = snapshot.stars
      this.lastSettledRunId = snapshot.runId
      writeGameSave(updated)
      this.bestScore = runRecord.highScore
      this.saveStatus = 'saved'
    },

    resetProgress() {
      const fresh = writeGameSave(createDefaultSave())
      this.applySave(fresh, { source: 'new' })
      this.lastSettledRunId = 0
      this.mode = 'menu'
      this.runId = 0
      this.score = 0
      this.runCoinsEarned = 0
      this.clearBonus = 0
      this.stars = 0
      this.starBreakdown = { clear: false, survivor: false, mastery: false }
      this.combo = 0
      this.activeEffects = []
      return fresh
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
        backupKey: this.saveBackupKey,
      }
    },
  },
})
