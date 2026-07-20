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

const SECOND_CHAPTER_LEVELS = [
  {
    name: '磁轨入口',
    description: '沿双轨磁道切入蓝色街区，利用纵向通道建立高速连击。',
    targetScore: 23800,
    targetCombo: 50,
    clearBonus: 44,
    ballSpeedMultiplier: 1.125,
    layout: ['211000112', '122000221', '112101211', '012222210', '112101211', '122000221', '211000112'],
  },
  {
    name: '蓝移回环',
    description: '上下磁轨周期横移，环形强化阵列持续改变回球角度。',
    targetScore: 25600,
    targetCombo: 54,
    clearBonus: 50,
    ballSpeedMultiplier: 1.15,
    movingRows: [1, 5],
    motionAmplitude: 14,
    layout: ['012222210', '120111021', '201000102', '211000112', '201000102', '120111021', '012222210'],
  },
  {
    name: '极性迷阵',
    description: '三层磁轨反向横移，连续破坏交错强化节点才能打开球路。',
    targetScore: 27800,
    targetCombo: 58,
    clearBonus: 56,
    ballSpeedMultiplier: 1.175,
    movingRows: [0, 3, 6],
    motionAmplitude: 16,
    layout: ['212101212', '121212121', '012121210', '201212102', '012121210', '121212121', '212101212'],
  },
  {
    name: '风暴边界',
    description: '双层磁墙横向巡弋并压缩安全角度，为守关主机做最终预演。',
    targetScore: 30400,
    targetCombo: 64,
    clearBonus: 64,
    ballSpeedMultiplier: 1.205,
    movingRows: [1, 4],
    motionAmplitude: 18,
    layout: ['222111222', '211222112', '122111221', '212222212', '122111221', '211222112', '222111222'],
  },
  {
    name: '磁暴主机',
    description: '摧毁双侧攻击模块，穿透三层磁盾并终止主机的脉冲轰炸。',
    targetScore: 42000,
    targetCombo: 72,
    clearBonus: 90,
    ballSpeedMultiplier: 1.22,
    top: 252,
    layout: ['210111012', '122222221', '012101210', '001222100', '012000210', '001111100', '000000000'],
    boss: {
      kind: 'magnetron',
      codename: 'MAGNETRON IX',
      objective: '摧毁攻击模块并击破三阶段主机',
      maxHp: 15,
      phases: 3,
      phaseSpeeds: [108, 148, 194],
      attackModules: { count: 2, hp: 3, fireIntervals: [3.8, 2.8, 2.1] },
      phaseLayouts: [
        ['210111012', '122222221', '012101210', '001222100', '012000210', '001111100', '000000000'],
        ['201020102', '121222121', '212101212', '012222210', '001212100', '010111010', '000000000'],
        ['220101022', '112222211', '021212120', '102222201', '012111210', '001222100', '000000000'],
      ],
    },
  },
]

const THIRD_CHAPTER_LEVELS = [
  {
    name: '灼热晶格',
    description: '击穿三重熔晶并引爆橙色熔芯，学习用连锁冲击撕开高耐久阵列。',
    targetScore: 33000,
    targetCombo: 68,
    clearBonus: 72,
    ballSpeedMultiplier: 1.22,
    layout: ['330111033', '221442122', '112111211', '041222140', '112111211', '221442122', '330111033'],
  },
  {
    name: '熔线折返',
    description: '两条热流轨道往返巡弋，熔芯爆破会在移动阵列中持续改写球路。',
    targetScore: 35200,
    targetCombo: 72,
    clearBonus: 78,
    ballSpeedMultiplier: 1.235,
    movingRows: [1, 5],
    motionAmplitude: 15,
    layout: ['123000321', '214111412', '321222123', '014333410', '321222123', '214111412', '123000321'],
  },
  {
    name: '红莲矩阵',
    description: '高耐久红莲包围连锁熔芯，选择正确的引爆点可让整片矩阵连续坍缩。',
    targetScore: 38600,
    targetCombo: 78,
    clearBonus: 84,
    ballSpeedMultiplier: 1.25,
    movingRows: [3],
    motionAmplitude: 17,
    layout: ['334141433', '223222322', '142333241', '411222114', '142333241', '223222322', '334141433'],
  },
  {
    name: '临界回响',
    description: '三条临界热轨夹持三耐久节点，连锁爆破与高速折返必须同时控制。',
    targetScore: 42800,
    targetCombo: 84,
    clearBonus: 92,
    ballSpeedMultiplier: 1.265,
    movingRows: [0, 3, 6],
    motionAmplitude: 19,
    layout: ['343222343', '232444232', '123333321', '414222414', '123333321', '232444232', '343222343'],
  },
  {
    name: '熔芯守卫',
    description: '引爆三阶段熔盾，在核心暴露窗口穿越扇形火雨并终止过载守卫。',
    targetScore: 56000,
    targetCombo: 92,
    clearBonus: 120,
    ballSpeedMultiplier: 1.28,
    top: 254,
    layout: ['340111043', '123333321', '214000412', '041222140', '012444210', '001333100', '000000000'],
    boss: {
      kind: 'furnace',
      codename: 'FURNACE SERAPH',
      objective: '引爆熔盾并穿越三阶段扇形火雨',
      maxHp: 18,
      phases: 3,
      phaseSpeeds: [124, 164, 208],
      barrage: { fireIntervals: [5.2, 4.4, 3.6], counts: [1, 3, 5], speeds: [238, 258, 280], spread: 48 },
      phaseLayouts: [
        ['340111043', '123333321', '214000412', '041222140', '012444210', '001333100', '000000000'],
        ['304010403', '143333341', '021444120', '412222214', '014333410', '001414100', '000000000'],
        ['430101034', '214333412', '142444241', '013333310', '041222140', '003414300', '000000000'],
      ],
    },
  },
]

const FOURTH_CHAPTER_LEVELS = [
  {
    name: '星环序列',
    description: '紫色星环组合移动磁轨、三重耐久与熔芯连锁，进入最终规则混合区。',
    targetScore: 46800,
    targetCombo: 88,
    clearBonus: 100,
    ballSpeedMultiplier: 1.285,
    movingRows: [2, 4],
    motionAmplitude: 16,
    layout: ['303141303', '232333232', '124222421', '341111143', '124222421', '232333232', '303141303'],
  },
  {
    name: '紫电穹顶',
    description: '三层紫电穹顶反向横移，连续引爆星核才能打开不断变化的安全通道。',
    targetScore: 50800,
    targetCombo: 94,
    clearBonus: 110,
    ballSpeedMultiplier: 1.3,
    movingRows: [0, 3, 6],
    motionAmplitude: 18,
    layout: ['343404343', '234333432', '142222241', '414333414', '142222241', '234333432', '343404343'],
  },
  {
    name: '终端密钥',
    description: '四枚终端密钥藏在三耐久阵列中，连锁冲击会逐段解开星穹访问协议。',
    targetScore: 55200,
    targetCombo: 100,
    clearBonus: 120,
    ballSpeedMultiplier: 1.315,
    movingRows: [1, 5],
    motionAmplitude: 20,
    layout: ['333141333', '241333142', '134222431', '413333314', '134222431', '241333142', '333141333'],
  },
  {
    name: '零点折射',
    description: '终局前的零点阵列将移动、强化与爆破压缩到最高密度，考验完整资源循环。',
    targetScore: 61800,
    targetCombo: 110,
    clearBonus: 135,
    ballSpeedMultiplier: 1.33,
    movingRows: [0, 2, 4, 6],
    motionAmplitude: 21,
    layout: ['343434343', '234333432', '341444143', '423333324', '341444143', '234333432', '343434343'],
  },
  {
    name: '星穹意志',
    description: '击破四阶段终极意志：熔盾、双侧模块、组合弹幕与高速核心将同时上线。',
    targetScore: 80000,
    targetCombo: 120,
    clearBonus: 180,
    ballSpeedMultiplier: 1.34,
    top: 258,
    layout: ['340111043', '123333321', '214000412', '041222140', '012444210', '001333100', '000000000'],
    boss: {
      kind: 'zenith',
      codename: 'ZENITH SINGULARITY',
      objective: '摧毁双模块并击破四阶段终极意志',
      maxHp: 24,
      phases: 4,
      phaseSpeeds: [142, 182, 224, 266],
      attackModules: { count: 2, hp: 4, fireIntervals: [5.4, 4.6, 3.8, 3.2] },
      barrage: { fireIntervals: [6.2, 5.4, 4.6, 4], counts: [1, 3, 5, 7], speeds: [248, 268, 288, 308], spread: 42 },
      phaseLayouts: [
        ['340111043', '123333321', '214000412', '041222140', '012444210', '001333100', '000000000'],
        ['304010403', '143333341', '021444120', '412222214', '014333410', '001414100', '000000000'],
        ['430101034', '214333412', '142444241', '013333310', '041222140', '003414300', '000000000'],
        ['404030404', '134444431', '243333342', '412444214', '034333430', '001434100', '000000000'],
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
  const chapterTwoConfig = level >= 6 && level <= 10 ? SECOND_CHAPTER_LEVELS[level - 6] : null
  const chapterThreeConfig = level >= 11 && level <= 15 ? THIRD_CHAPTER_LEVELS[level - 11] : null
  const chapterFourConfig = level >= 16 && level <= 20 ? FOURTH_CHAPTER_LEVELS[level - 16] : null
  const formalConfig = chapterOneConfig || chapterTwoConfig || chapterThreeConfig || chapterFourConfig
  return {
    id: level,
    name: formalConfig?.name || LEVEL_NAMES[level - 1],
    chapterId: chapter.id,
    chapter: chapter.name,
    chapterCodename: chapter.codename,
    accent: chapter.accent,
    description: formalConfig?.description || (isBoss
      ? `突破${chapter.name}的守关核心。Boss 机制将在对应章节版本中继续强化。`
      : `${chapter.description} 当前威胁等级 ${chapterIndex + 1}。`),
    isBoss,
    targetScore: formalConfig?.targetScore ?? 15000 + (level - 1) * 1800,
    targetCombo: formalConfig?.targetCombo ?? 35 + Math.floor((level - 1) * 1.5),
    clearBonus: formalConfig?.clearBonus ?? 20 + (level - 1) * 3 + (isBoss ? 15 : 0),
    ballSpeedMultiplier: formalConfig?.ballSpeedMultiplier ?? 1 + Math.min(0.22, (level - 1) * 0.012),
    columns: 9,
    rows: 7,
    left: 34,
    top: formalConfig?.top ?? 178,
    gapX: 6,
    gapY: 9,
    brickHeight: 28,
    movingRows: formalConfig?.movingRows || [],
    motionAmplitude: formalConfig?.motionAmplitude || 0,
    layout: formalConfig?.layout || strengthenLayout(BASE_PATTERNS[(level - 1) % BASE_PATTERNS.length], level),
    boss: formalConfig?.boss || null,
  }
}

export const LEVELS = Array.from({ length: 20 }, (_, index) => createLevel(index + 1))
export const LEVEL_ONE = LEVELS[0]

export const getLevelConfig = (levelId) => LEVELS.find((level) => level.id === Number(levelId)) || LEVEL_ONE
export const getChapter = (chapterId) => CHAPTERS.find((chapter) => chapter.id === Number(chapterId)) || CHAPTERS[0]
export const getChapterLevels = (chapterId) => LEVELS.filter((level) => level.chapterId === Number(chapterId))

export function getEndlessLevelConfig(wave = 1) {
  const safeWave = Math.max(1, Math.floor(Number(wave) || 1))
  const base = SECOND_CHAPTER_LEVELS[(safeWave - 1) % 4].layout
  const layout = base.map((row, rowIndex) => [...row].map((cell, columnIndex) => {
    const hp = Number(cell)
    if (!hp) return '0'
    if (safeWave >= 9 && (rowIndex * 5 + columnIndex * 3 + safeWave) % 4 === 0) return '3'
    if (safeWave >= 4 && hp === 1 && (rowIndex + columnIndex + safeWave) % 3 === 0) return '2'
    return String(hp)
  }).join(''))
  return {
    id: 0,
    name: '无尽磁域',
    chapterId: 2,
    chapter: '磁暴街区',
    chapterCodename: 'ENDLESS MAGNETIC FIELD',
    accent: '#55a7ff',
    description: `第 ${safeWave} 波磁域正在重构，生命、分数和模块效果会跨波保留。`,
    isBoss: false,
    endless: true,
    wave: safeWave,
    targetScore: 0,
    targetCombo: 0,
    clearBonus: 0,
    ballSpeedMultiplier: Math.min(1.46, 1.1 + (safeWave - 1) * 0.025),
    columns: 9,
    rows: 7,
    left: 34,
    top: 178,
    gapX: 6,
    gapY: 9,
    brickHeight: 28,
    movingRows: safeWave >= 3 ? [safeWave % 6, (safeWave + 3) % 7] : [],
    motionAmplitude: Math.min(19, 10 + safeWave),
    layout,
    boss: null,
  }
}
