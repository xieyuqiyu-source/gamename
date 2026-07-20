import assert from 'node:assert/strict'
import test from 'node:test'
import { CHAPTERS, getEndlessLevelConfig, LEVELS } from '../src/config/levels.js'
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

test('第一章五关使用正式独立布局且第五关配置三阶段 Boss', () => {
  const firstChapter = LEVELS.slice(0, 5)
  assert.equal(new Set(firstChapter.map((level) => level.layout.join('|'))).size, 5)
  assert.deepEqual(firstChapter.map((level) => level.ballSpeedMultiplier), [1, 1.035, 1.065, 1.1, 1.12])
  assert.equal(firstChapter[4].boss.codename, 'PRISM WARDEN')
  assert.equal(firstChapter[4].boss.phases, 3)
  assert.equal(firstChapter[4].boss.phaseLayouts.length, 3)
  assert.equal(firstChapter[4].boss.phaseSpeeds.length, 3)
})

test('第二章五关使用正式独立布局且磁暴主机配置攻击模块', () => {
  const secondChapter = LEVELS.slice(5, 10)
  assert.equal(new Set(secondChapter.map((level) => level.layout.join('|'))).size, 5)
  assert.deepEqual(secondChapter.map((level) => level.ballSpeedMultiplier), [1.125, 1.15, 1.175, 1.205, 1.22])
  const boss = secondChapter[4].boss
  assert.deepEqual(secondChapter.slice(1, 4).map((level) => level.movingRows.length), [2, 3, 2])
  assert.equal(boss.codename, 'MAGNETRON IX')
  assert.equal(boss.kind, 'magnetron')
  assert.equal(boss.maxHp, 15)
  assert.deepEqual(boss.attackModules, { count: 2, hp: 3, fireIntervals: [3.8, 2.8, 2.1] })
})

test('第三章五关使用熔芯机关砖且熔芯守卫配置三阶段弹幕', () => {
  const thirdChapter = LEVELS.slice(10, 15)
  assert.equal(new Set(thirdChapter.map((level) => level.layout.join('|'))).size, 5)
  assert.ok(thirdChapter.every((level) => level.layout.join('').includes('3')))
  assert.ok(thirdChapter.every((level) => level.layout.join('').includes('4')))
  assert.deepEqual(thirdChapter.map((level) => level.ballSpeedMultiplier), [1.22, 1.235, 1.25, 1.265, 1.28])
  const boss = thirdChapter[4].boss
  assert.equal(boss.codename, 'FURNACE SERAPH')
  assert.equal(boss.kind, 'furnace')
  assert.equal(boss.maxHp, 18)
  assert.equal(boss.phaseLayouts.length, 3)
  assert.deepEqual(boss.barrage.counts, [1, 3, 5])
})

test('第四章五关组合全部机制且星穹意志配置四阶段终局协议', () => {
  const fourthChapter = LEVELS.slice(15, 20)
  assert.equal(new Set(fourthChapter.map((level) => level.layout.join('|'))).size, 5)
  assert.ok(fourthChapter.slice(0, 4).every((level) => level.movingRows.length > 0))
  assert.deepEqual(fourthChapter.map((level) => level.ballSpeedMultiplier), [1.285, 1.3, 1.315, 1.33, 1.34])
  const boss = fourthChapter[4].boss
  assert.equal(boss.codename, 'ZENITH SINGULARITY')
  assert.equal(boss.kind, 'zenith')
  assert.equal(boss.phases, 4)
  assert.equal(boss.maxHp, 24)
  assert.equal(boss.phaseLayouts.length, 4)
  assert.deepEqual(boss.attackModules, { count: 2, hp: 4, fireIntervals: [5.4, 4.6, 3.8, 3.2] })
  assert.deepEqual(boss.barrage.counts, [1, 3, 5, 7])
})

test('无尽波次会确定性轮换砖阵并逐步增加耐久与球速', () => {
  const wave1 = getEndlessLevelConfig(1)
  const wave4 = getEndlessLevelConfig(4)
  const wave9 = getEndlessLevelConfig(9)
  assert.equal(wave1.endless, true)
  assert.equal(wave1.wave, 1)
  assert.notEqual(wave1.layout.join('|'), wave4.layout.join('|'))
  assert.ok(wave4.ballSpeedMultiplier > wave1.ballSpeedMultiplier)
  assert.ok(wave9.layout.join('').includes('3'))
  assert.ok(wave9.ballSpeedMultiplier > wave4.ballSpeedMultiplier)
  assert.ok(wave9.movingRows.length > 0)
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
