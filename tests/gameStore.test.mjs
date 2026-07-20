import assert from 'node:assert/strict'
import test from 'node:test'
import { createPinia, setActivePinia } from 'pinia'
import { createDefaultSave } from '../src/services/saveService.js'
import { useGameStore } from '../src/stores/game.js'

class MemoryStorage {
  constructor() { this.data = new Map() }
  getItem(key) { return this.data.has(key) ? this.data.get(key) : null }
  setItem(key, value) { this.data.set(key, String(value)) }
  removeItem(key) { this.data.delete(key) }
}

globalThis.window = { localStorage: new MemoryStorage() }

function createStore(coins = 0) {
  setActivePinia(createPinia())
  const store = useGameStore()
  const save = createDefaultSave(1000)
  save.currency.coins = coins
  store.applySave(save, { source: 'test' })
  return store
}

test('升级购买扣款、持久化并可全额退款', () => {
  const store = createStore(200)
  assert.deepEqual(store.purchaseUpgrade('paddleWidth'), { ok: true, level: 1, cost: 30 })
  assert.equal(store.currency.coins, 170)
  assert.equal(store.upgrades.paddleWidth, 1)
  assert.equal(store.upgradeRefund, 30)

  const refund = store.resetUpgrades()
  assert.equal(refund, 30)
  assert.equal(store.currency.coins, 200)
  assert.equal(store.upgrades.paddleWidth, 0)
})

test('晶币不足、锁定关卡和星级奖励规则正确', () => {
  const store = createStore(0)
  assert.equal(store.purchaseUpgrade('extraLife').reason, 'coins')
  assert.equal(store.selectLevel(2), false)
  store.campaign.levelRecords[1].stars = 3
  assert.equal(store.claimStarReward('stars-3'), true)
  assert.equal(store.currency.coins, 30)
  assert.equal(store.claimStarReward('stars-3'), false)
  assert.equal(store.currency.coins, 30)
})

test('第一章满 15 星奖励只能领取一次', () => {
  const store = createStore(0)
  store.campaign.highestUnlockedLevel = 6
  for (let level = 1; level <= 5; level += 1) {
    store.campaign.levelRecords[String(level)] = { stars: 3, highScore: 20000, bestCombo: 40, attempts: 1, clears: 1, bestLives: 3 }
  }

  assert.equal(store.totalStars, 15)
  assert.equal(store.claimStarReward('stars-15'), true)
  assert.equal(store.currency.coins, 120)
  assert.equal(store.claimStarReward('stars-15'), false)
  assert.equal(store.currency.coins, 120)
})

test('开发预览胜利不会写入正式存档或解锁关卡', () => {
  const store = createStore(151)
  store.persistSave()
  const before = window.localStorage.getItem('gamename:save')
  store.syncFromEngine({
    mode: 'won', runId: 99, level: 5, levelName: '棱镜核心',
    lives: 3, maxLives: 3, shieldCharges: 0,
    score: 50000, bestScore: 50000, coins: 999,
    runCoinsEarned: 848, clearBonus: 60, stars: 3,
    starBreakdown: { clear: true, survivor: true, mastery: true },
    combo: 0, maxCombo: 60, ballCount: 0, dropCount: 0,
    activeEffects: [], bricksRemaining: 0, totalBricks: 32,
    message: '预览胜利', resumeCountdown: 0,
    levelMeta: { chapter: '霓虹启程', accent: '#55f4dd', isBoss: true, targetScore: 30000, targetCombo: 55 },
    boss: { hp: 0, maxHp: 12, phase: 3, maxPhases: 3, shieldActive: false, shieldNodes: 0 },
    runModifiers: {},
  }, { settle: false })

  assert.equal(window.localStorage.getItem('gamename:save'), before)
  assert.equal(store.currency.coins, 151)
  assert.equal(store.campaign.highestUnlockedLevel, 1)
  assert.equal(store.campaign.levelRecords[5], undefined)
})
