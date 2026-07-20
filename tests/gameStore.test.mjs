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
