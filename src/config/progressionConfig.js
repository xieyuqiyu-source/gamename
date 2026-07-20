export const UPGRADE_DEFINITIONS = [
  { key: 'paddleWidth', glyph: 'WD', name: '宽域挡板', category: 'CONTROL', maxLevel: 5, costs: [30, 50, 75, 105, 140], effect: (level) => `挡板宽度 +${level * 6}%`, next: '+6% 挡板宽度' },
  { key: 'itemDropRate', glyph: 'DR', name: '模块寻迹', category: 'DROP', maxLevel: 5, costs: [35, 55, 80, 110, 145], effect: (level) => `胶囊概率 +${level * 2.5}%`, next: '+2.5% 胶囊概率' },
  { key: 'coinBonus', glyph: 'CR', name: '晶币增幅', category: 'ECONOMY', maxLevel: 5, costs: [30, 50, 75, 105, 140], effect: (level) => `晶币收益 +${level * 12}%`, next: '+12% 晶币收益' },
  { key: 'magnetRange', glyph: 'MG', name: '磁吸阵列', category: 'CONTROL', maxLevel: 5, costs: [25, 45, 65, 90, 120], effect: (level) => `磁吸范围 +${level * 14}%`, next: '+14% 磁吸范围' },
  { key: 'comboGrace', glyph: 'CB', name: '连击缓存', category: 'SCORE', maxLevel: 5, costs: [40, 60, 85, 115, 150], effect: (level) => `连击窗口 +${(level * 0.22).toFixed(2)} 秒`, next: '+0.22 秒连击窗口' },
  { key: 'bossShield', glyph: 'SH', name: '能量护盾', category: 'DEFENSE', maxLevel: 3, costs: [70, 115, 175], effect: (level) => level ? `每局抵挡 ${level >= 3 ? 2 : 1} 次掉球` : '每局掉球保护未启用', next: '获得或强化掉球保护' },
  { key: 'extraLife', glyph: 'LF', name: '备用光核', category: 'DEFENSE', maxLevel: 2, costs: [120, 220], effect: (level) => `初始生命 +${level}`, next: '+1 初始生命' },
]

export const STAR_REWARDS = [
  { id: 'stars-3', stars: 3, coins: 30 },
  { id: 'stars-6', stars: 6, coins: 45 },
  { id: 'stars-9', stars: 9, coins: 60 },
  { id: 'stars-12', stars: 12, coins: 80 },
  { id: 'stars-15', stars: 15, coins: 120 },
  { id: 'stars-30', stars: 30, coins: 180 },
  { id: 'stars-45', stars: 45, coins: 260 },
  { id: 'stars-60', stars: 60, coins: 400 },
]

export function getUpgradeDefinition(key) {
  return UPGRADE_DEFINITIONS.find((upgrade) => upgrade.key === key)
}

export function getUpgradeCost(key, currentLevel) {
  const definition = getUpgradeDefinition(key)
  return definition?.costs[currentLevel] ?? null
}

export function getUpgradeRefund(upgrades = {}) {
  return UPGRADE_DEFINITIONS.reduce((total, definition) => {
    const level = Math.min(definition.maxLevel, Math.max(0, Number(upgrades[definition.key]) || 0))
    return total + definition.costs.slice(0, level).reduce((sum, cost) => sum + cost, 0)
  }, 0)
}

export function getRunModifiers(upgrades = {}) {
  const level = (key) => {
    const definition = getUpgradeDefinition(key)
    return Math.min(definition?.maxLevel || 0, Math.max(0, Number(upgrades[key]) || 0))
  }
  return {
    paddleWidthMultiplier: 1 + level('paddleWidth') * 0.06,
    itemDropBonus: level('itemDropRate') * 0.025,
    coinBonusRate: level('coinBonus') * 0.12,
    magnetRangeMultiplier: 1 + level('magnetRange') * 0.14,
    comboGraceBonus: level('comboGrace') * 0.22,
    shieldCharges: level('bossShield') >= 3 ? 2 : level('bossShield') > 0 ? 1 : 0,
    extraLives: level('extraLife'),
  }
}
