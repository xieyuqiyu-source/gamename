import { BALL, DROP } from '../src/config/gameConfig.js'
import { CHAPTERS, LEVELS } from '../src/config/levels.js'
import { STAR_REWARDS, UPGRADE_DEFINITIONS } from '../src/config/progressionConfig.js'

const failures = []
const assert = (condition, message) => { if (!condition) failures.push(message) }
const nonDecreasing = (values) => values.every((value, index) => index === 0 || value >= values[index - 1])

const chapterSummaries = CHAPTERS.map((chapter) => {
  const levels = LEVELS.filter((level) => level.chapterId === chapter.id)
  assert(levels.length === 5, `${chapter.name}必须包含5关`)
  assert(nonDecreasing(levels.map((level) => level.targetScore)), `${chapter.name}目标分数必须逐关提高`)
  assert(nonDecreasing(levels.map((level) => level.targetCombo)), `${chapter.name}目标连击必须逐关提高`)
  assert(nonDecreasing(levels.map((level) => level.clearBonus)), `${chapter.name}清关奖励必须逐关提高`)
  assert(nonDecreasing(levels.map((level) => level.ballSpeedMultiplier)), `${chapter.name}球速必须逐关提高`)
  assert(levels.at(-1).isBoss, `${chapter.name}第五关必须为Boss`)
  assert(levels.at(-1).clearBonus >= levels.at(-2).clearBonus * 1.25, `${chapter.name}Boss奖励必须体现风险溢价`)
  return {
    chapter: chapter.id,
    name: chapter.name,
    speed: [levels[0].ballSpeedMultiplier, levels.at(-1).ballSpeedMultiplier],
    mastery: [levels[0].targetScore, levels.at(-1).targetScore],
    clearCoins: levels.reduce((sum, level) => sum + level.clearBonus, 0),
  }
})

assert(nonDecreasing(LEVELS.map((level) => level.ballSpeedMultiplier)), '20关基础球速不可逆向下降')
assert(DROP.maxDrops === 28, '同屏掉落物预算应固定为28')
assert(BALL.maxCount === 12, '同屏小球预算应固定为12')

const totalClearCoins = LEVELS.reduce((sum, level) => sum + level.clearBonus, 0)
const totalStarCoins = STAR_REWARDS.reduce((sum, reward) => sum + reward.coins, 0)
const totalUpgradeCost = UPGRADE_DEFINITIONS.reduce((sum, upgrade) => sum + upgrade.costs.reduce((subtotal, cost) => subtotal + cost, 0), 0)
const chapterOneIncome = chapterSummaries[0].clearCoins
  + STAR_REWARDS.filter((reward) => reward.stars <= 15).reduce((sum, reward) => sum + reward.coins, 0)
const firstUpgradeTierCost = UPGRADE_DEFINITIONS.reduce((sum, upgrade) => sum + upgrade.costs[0], 0)

assert(totalClearCoins + totalStarCoins >= totalUpgradeCost, '全主线与满星固定收益必须足以购买全部永久强化')
assert(chapterOneIncome >= firstUpgradeTierCost, '第一章固定收益必须足以购买全部一级强化')
assert(totalClearCoins + totalStarCoins <= totalUpgradeCost * 1.12, '固定收益不应过度溢出完整强化成本')

const report = {
  chapterSummaries,
  economy: {
    totalClearCoins,
    totalStarCoins,
    guaranteedCoins: totalClearCoins + totalStarCoins,
    totalUpgradeCost,
    surplus: totalClearCoins + totalStarCoins - totalUpgradeCost,
    chapterOneIncome,
    firstUpgradeTierCost,
  },
  limits: { drops: DROP.maxDrops, balls: BALL.maxCount },
  failures,
}

console.log(JSON.stringify(report, null, 2))
if (failures.length) process.exitCode = 1
