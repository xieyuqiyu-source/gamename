import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createDefaultSave,
  LEGACY_STORE_KEY,
  loadGameSave,
  recordEndlessSettlement,
  recordRunSettlement,
  SAVE_KEY,
} from '../src/services/saveService.js'

class MemoryStorage {
  constructor(entries = {}) {
    this.data = new Map(Object.entries(entries))
  }

  getItem(key) { return this.data.has(key) ? this.data.get(key) : null }
  setItem(key, value) { this.data.set(key, String(value)) }
  removeItem(key) { this.data.delete(key) }
}

test('首次加载会建立 v2 正式存档', () => {
  const storage = new MemoryStorage()
  const result = loadGameSave(storage, 1000)

  assert.equal(result.source, 'new')
  assert.equal(result.save.saveVersion, 2)
  assert.equal(result.save.currency.coins, 0)
  assert.equal(JSON.parse(storage.getItem(SAVE_KEY)).profile.createdAt, 1000)
})

test('旧 Pinia 快照会迁移并保留原始备份', () => {
  const legacy = JSON.stringify({
    coins: 77,
    bestScore: 12345,
    maxCombo: 29,
    settings: { effectQuality: 'low', screenShake: false },
  })
  const storage = new MemoryStorage({ [LEGACY_STORE_KEY]: legacy })
  const result = loadGameSave(storage, 2000)

  assert.equal(result.source, 'legacy')
  assert.equal(result.save.currency.coins, 77)
  assert.equal(result.save.campaign.levelRecords[1].highScore, 12345)
  assert.equal(result.save.campaign.levelRecords[1].bestCombo, 29)
  assert.equal(result.save.settings.effectQuality, 'low')
  assert.equal(result.save.settings.screenShake, false)
  assert.equal(storage.getItem(LEGACY_STORE_KEY), null)
  assert.equal(storage.getItem(`${LEGACY_STORE_KEY}:migrated`), legacy)
})

test('损坏存档会备份原文并安全恢复', () => {
  const broken = '{broken-json'
  const storage = new MemoryStorage({ [SAVE_KEY]: broken })
  const result = loadGameSave(storage, 3000)

  assert.equal(result.source, 'recovered')
  assert.equal(result.recovered, true)
  assert.equal(storage.getItem(result.backupKey), broken)
  assert.equal(JSON.parse(storage.getItem(SAVE_KEY)).saveVersion, 2)
})

test('v1 正式存档会升级到 v2 并补充星级奖励记录', () => {
  const v1 = createDefaultSave(1000)
  v1.saveVersion = 1
  delete v1.campaign.claimedStarRewards
  v1.upgrades.paddleWidth = 99
  v1.upgrades.extraLife = 99
  const storage = new MemoryStorage({ [SAVE_KEY]: JSON.stringify(v1) })
  const result = loadGameSave(storage, 3500)

  assert.equal(result.save.saveVersion, 2)
  assert.equal(result.save.profile.migratedFromSaveVersion, 1)
  assert.deepEqual(result.save.campaign.claimedStarRewards, [])
  assert.equal(result.save.upgrades.paddleWidth, 5)
  assert.equal(result.save.upgrades.extraLife, 2)
})

test('结算会累计尝试但不会降低历史三星和记录', () => {
  const first = recordRunSettlement(createDefaultSave(1000), {
    mode: 'won', runId: 1, level: 1, score: 16000, maxCombo: 40,
    lives: 3, stars: 3, coins: 20, runCoinsEarned: 20,
  }, 4000)
  const second = recordRunSettlement(first, {
    mode: 'won', runId: 2, level: 1, score: 0, maxCombo: 0,
    lives: 3, stars: 2, coins: 40, runCoinsEarned: 20,
  }, 5000)
  const record = second.campaign.levelRecords[1]

  assert.equal(record.stars, 3)
  assert.equal(record.highScore, 16000)
  assert.equal(record.bestCombo, 40)
  assert.equal(record.attempts, 2)
  assert.equal(record.clears, 2)
  assert.equal(second.currency.coins, 40)
  assert.equal(second.campaign.highestUnlockedLevel, 2)
})

test('第一章顺序通关后解锁第六关并保留五关记录', () => {
  let save = createDefaultSave(1000)
  for (let level = 1; level <= 5; level += 1) {
    save = recordRunSettlement(save, {
      mode: 'won', runId: level, level, score: 20000 + level,
      maxCombo: 40, lives: 3, stars: 3, coins: level * 20, runCoinsEarned: 20,
    }, 5000 + level)
  }

  assert.equal(save.campaign.highestUnlockedLevel, 6)
  assert.deepEqual(Object.keys(save.campaign.levelRecords).map(Number), [1, 2, 3, 4, 5])
  assert.ok(Object.values(save.campaign.levelRecords).every((record) => record.clears === 1 && record.stars === 3))
})

test('第二章通关后解锁无尽模式', () => {
  let save = createDefaultSave(1000)
  for (let level = 1; level <= 10; level += 1) {
    save = recordRunSettlement(save, {
      mode: 'won', runId: level, level, score: 30000 + level,
      maxCombo: 60, lives: 3, stars: 3, coins: level * 30, runCoinsEarned: 30,
    }, 6000 + level)
  }
  assert.equal(save.campaign.highestUnlockedLevel, 11)
  assert.equal(save.endless.unlocked, true)
})

test('完整二十关顺序通关后保留全部记录且解锁上限稳定在第二十关', () => {
  let save = createDefaultSave(1000)
  for (let level = 1; level <= 20; level += 1) {
    save = recordRunSettlement(save, {
      mode: 'won', runId: level, level, score: 20000 + level * 1000,
      maxCombo: 30 + level * 4, lives: 2, stars: 3,
      coins: level * 50, runCoinsEarned: 50,
    }, 7000 + level)
  }
  assert.equal(save.campaign.highestUnlockedLevel, 20)
  assert.equal(Object.keys(save.campaign.levelRecords).length, 20)
  assert.equal(save.campaign.levelRecords[20].clears, 1)
  assert.equal(save.campaign.levelRecords[20].stars, 3)
  assert.equal(save.endless.unlocked, true)
})

test('无尽结算保存最高分、最高波次和最佳连击且不会降低记录', () => {
  const base = createDefaultSave(1000)
  base.endless.unlocked = true
  const first = recordEndlessSettlement(base, { coins: 80, score: 42000, wave: 7, maxCombo: 63 }, 7000)
  const second = recordEndlessSettlement(first, { coins: 95, score: 18000, wave: 4, maxCombo: 29 }, 8000)
  assert.deepEqual(second.endless, { unlocked: true, highScore: 42000, highestWave: 7, bestCombo: 63 })
  assert.equal(second.currency.coins, 95)
})
