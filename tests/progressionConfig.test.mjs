import assert from 'node:assert/strict'
import test from 'node:test'
import { CHAPTERS, LEVELS } from '../src/config/levels.js'
import { getRunModifiers, getUpgradeRefund, UPGRADE_DEFINITIONS } from '../src/config/progressionConfig.js'

test('20 关按四章完整建模且每关都有可玩砖阵', () => {
  assert.equal(CHAPTERS.length, 4)
  assert.equal(LEVELS.length, 20)
  assert.deepEqual(LEVELS.filter((level) => level.isBoss).map((level) => level.id), [5, 10, 15, 20])
  for (const level of LEVELS) {
    assert.equal(level.layout.length, 7)
    assert.ok(level.layout.every((row) => row.length === 9))
    assert.ok(level.layout.join('').replaceAll('0', '').length > 0)
  }
})

test('升级退款等于全部已购等级成本之和', () => {
  const upgrades = Object.fromEntries(UPGRADE_DEFINITIONS.map((definition) => [definition.key, Math.min(2, definition.maxLevel)]))
  const expected = UPGRADE_DEFINITIONS.reduce((total, definition) => total + definition.costs.slice(0, Math.min(2, definition.maxLevel)).reduce((sum, cost) => sum + cost, 0), 0)
  assert.equal(getUpgradeRefund(upgrades), expected)
})

test('七类升级全部映射到当前运行参数', () => {
  const modifiers = getRunModifiers({ paddleWidth: 2, itemDropRate: 2, coinBonus: 2, magnetRange: 2, comboGrace: 2, bossShield: 3, extraLife: 2 })
  assert.ok(modifiers.paddleWidthMultiplier > 1)
  assert.ok(modifiers.itemDropBonus > 0)
  assert.ok(modifiers.coinBonusRate > 0)
  assert.ok(modifiers.magnetRangeMultiplier > 1)
  assert.ok(modifiers.comboGraceBonus > 0)
  assert.equal(modifiers.shieldCharges, 2)
  assert.equal(modifiers.extraLives, 2)

  const capped = getRunModifiers(Object.fromEntries(UPGRADE_DEFINITIONS.map((definition) => [definition.key, 99])))
  assert.equal(capped.paddleWidthMultiplier, 1.3)
  assert.equal(capped.extraLives, 2)
})
