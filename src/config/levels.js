export const CHAPTERS = [
  { id: 1, name: '霓虹启程', codename: 'PRISM DAWN', range: [1, 5], accent: '#55f4dd', description: '掌握折射、连击与能量模块。' },
  { id: 2, name: '磁暴街区', codename: 'MAGNET STORM', range: [6, 10], accent: '#55a7ff', description: '高速球路与密集强化砖开始交错。' },
  { id: 3, name: '熔芯回廊', codename: 'CORE FURNACE', range: [11, 15], accent: '#ff7b54', description: '耐久阵列与危险节奏持续升温。' },
  { id: 4, name: '星穹终端', codename: 'ZENITH GRID', range: [16, 20], accent: '#b980ff', description: '向最终核心发起完整霓虹冲击。' },
]

const LEVEL_NAMES = [
  '初次折射', '双棱回声', '流光阶梯', '交错脉冲', '棱镜核心',
  '磁轨入口', '蓝移回环', '极性迷阵', '风暴边界', '磁暴主机',
  '灼热晶格', '熔线折返', '红莲矩阵', '临界回响', '熔芯守卫',
  '星环序列', '紫电穹顶', '终端密钥', '零点折射', '星穹意志',
]

const BASE_PATTERNS = [
  ['001111100', '011111110', '111111111', '111111111', '111111111', '011111110', '001111100'],
  ['101010101', '011111110', '110101011', '111111111', '110101011', '011111110', '101010101'],
  ['111000111', '011101110', '001111100', '111111111', '001111100', '011101110', '111000111'],
  ['011111110', '111111111', '110111011', '011111110', '110111011', '111111111', '011111110'],
  ['111111111', '100010001', '101111101', '101111101', '101111101', '100010001', '111111111'],
]

const FIRST_CHAPTER_LEVELS = [
  {
    name: '初次折射',
    description: '用对称棱镜阵列掌握挡板回弹、强化砖与连击节奏。',
    targetScore: 15000,
    targetCombo: 35,
    clearBonus: 20,
    ballSpeedMultiplier: 1,
    layout: ['001111100', '011222110', '112111211', '121111121', '112111211', '011222110', '001111100'],
  },
  {
    name: '双棱回声',
    description: '击穿左右镜像棱柱，利用中央通道延续高速折返。',
    targetScore: 16800,
    targetCombo: 38,
    clearBonus: 25,
    ballSpeedMultiplier: 1.035,
    layout: ['110000011', '221000122', '112101211', '012222210', '112101211', '221000122', '110000011'],
  },
  {
    name: '流光阶梯',
    description: '沿逐层收束的光阶向上推进，控制大角度回球清理边角。',
    targetScore: 18600,
    targetCombo: 42,
    clearBonus: 30,
    ballSpeedMultiplier: 1.065,
    layout: ['100000001', '210000012', '121000121', '212101212', '121222121', '212111212', '122222221'],
  },
  {
    name: '交错脉冲',
    description: '强化砖组成交叉脉冲阵列，稳定长连击才能迅速瓦解核心。',
    targetScore: 21800,
    targetCombo: 48,
    clearBonus: 38,
    ballSpeedMultiplier: 1.1,
    layout: ['001212100', '001222100', '111222111', '222111222', '111222111', '001222100', '001212100'],
  },
  {
    name: '棱镜核心',
    description: '第一章守关核心：击碎每阶段护盾阵列，再攻击移动核心。',
    targetScore: 30000,
    targetCombo: 55,
    clearBonus: 60,
    ballSpeedMultiplier: 1.12,
    top: 244,
    layout: ['001111100', '012222210', '122000221', '120000021', '011000110', '001111100', '000000000'],
    boss: {
      codename: 'PRISM WARDEN',
      maxHp: 12,
      phases: 3,
      phaseSpeeds: [88, 126, 172],
      phaseLayouts: [
        ['001111100', '012222210', '122000221', '120000021', '011000110', '001111100', '000000000'],
        ['010202010', '121111121', '012222210', '001111100', '012000210', '001222100', '000000000'],
        ['200010002', '120111021', '012222210', '001212100', '010222010', '001111100', '000000000'],
      ],
    },
  },
]

function strengthenLayout(pattern, level) {
  return pattern.map((row, rowIndex) => [...row].map((cell, columnIndex) => {
    if (cell === '0') return '0'
    const reinforcedEvery = Math.max(3, 7 - Math.floor(level / 4))
    return (rowIndex * 3 + columnIndex * 2 + level) % reinforcedEvery === 0 ? '2' : '1'
  }).join(''))
}

function createLevel(level) {
  const chapter = CHAPTERS[Math.floor((level - 1) / 5)]
  const isBoss = level % 5 === 0
  const chapterIndex = (level - 1) % 5
  const chapterOneConfig = level <= 5 ? FIRST_CHAPTER_LEVELS[level - 1] : null
  return {
    id: level,
    name: chapterOneConfig?.name || LEVEL_NAMES[level - 1],
    chapterId: chapter.id,
    chapter: chapter.name,
    chapterCodename: chapter.codename,
    accent: chapter.accent,
    description: chapterOneConfig?.description || (isBoss
      ? `突破${chapter.name}的守关核心。Boss 机制将在对应章节版本中继续强化。`
      : `${chapter.description} 当前威胁等级 ${chapterIndex + 1}。`),
    isBoss,
    targetScore: chapterOneConfig?.targetScore ?? 15000 + (level - 1) * 1800,
    targetCombo: chapterOneConfig?.targetCombo ?? 35 + Math.floor((level - 1) * 1.5),
    clearBonus: chapterOneConfig?.clearBonus ?? 20 + (level - 1) * 3 + (isBoss ? 15 : 0),
    ballSpeedMultiplier: chapterOneConfig?.ballSpeedMultiplier ?? 1 + Math.min(0.22, (level - 1) * 0.012),
    columns: 9,
    rows: 7,
    left: 34,
    top: chapterOneConfig?.top ?? 178,
    gapX: 6,
    gapY: 9,
    brickHeight: 28,
    layout: chapterOneConfig?.layout || strengthenLayout(BASE_PATTERNS[(level - 1) % BASE_PATTERNS.length], level),
    boss: chapterOneConfig?.boss || null,
  }
}

export const LEVELS = Array.from({ length: 20 }, (_, index) => createLevel(index + 1))
export const LEVEL_ONE = LEVELS[0]

export const getLevelConfig = (levelId) => LEVELS.find((level) => level.id === Number(levelId)) || LEVEL_ONE
export const getChapter = (chapterId) => CHAPTERS.find((chapter) => chapter.id === Number(chapterId)) || CHAPTERS[0]
export const getChapterLevels = (chapterId) => LEVELS.filter((level) => level.chapterId === Number(chapterId))
