import { existsSync, readFileSync } from 'node:fs'
import { BALL, DROP, POWERUPS } from '../src/config/gameConfig.js'
import { CHAPTERS, getEndlessLevelConfig, LEVELS } from '../src/config/levels.js'
import { STAR_REWARDS, UPGRADE_DEFINITIONS } from '../src/config/progressionConfig.js'
import {
  createDefaultSave,
  recordEndlessSettlement,
  recordRunSettlement,
  SAVE_VERSION,
} from '../src/services/saveService.js'

const failures = []
const checks = []
const check = (condition, name, evidence) => {
  checks.push({ name, passed: Boolean(condition), evidence })
  if (!condition) failures.push(name)
}

const powerupKeys = Object.keys(POWERUPS)
const bossLevels = LEVELS.filter((level) => level.isBoss)
const bossCodenames = bossLevels.map((level) => level.boss?.codename)

check(CHAPTERS.length === 4, '四章主线', `${CHAPTERS.length} chapters`)
check(LEVELS.length === 20, '二十关主线', `${LEVELS.length} levels`)
check(bossLevels.map((level) => level.id).join(',') === '5,10,15,20', '四个守关 Boss', bossCodenames.join(' / '))
check(new Set(bossCodenames).size === 4 && bossCodenames.every(Boolean), 'Boss 独立身份', `${new Set(bossCodenames).size} unique codenames`)
check(powerupKeys.length === 5, '五种正面道具', powerupKeys.join(', '))
check(UPGRADE_DEFINITIONS.length === 7, '七类永久升级', UPGRADE_DEFINITIONS.map((item) => item.name).join(', '))
check(BALL.maxCount === 12 && DROP.maxDrops === 28, '玩法实体上限', `balls ${BALL.maxCount}, drops ${DROP.maxDrops}`)

let save = createDefaultSave(1)
let coins = 0
for (const level of LEVELS) {
  coins += level.clearBonus
  save = recordRunSettlement(save, {
    runId: level.id,
    level: level.id,
    mode: 'won',
    stars: 3,
    coins,
    score: level.targetScore,
    maxCombo: level.targetCombo,
    lives: 3,
    runCoinsEarned: level.clearBonus,
  }, 1000 + level.id)
}

const records = Object.values(save.campaign.levelRecords)
const totalStars = records.reduce((sum, record) => sum + record.stars, 0)
check(SAVE_VERSION === 3 && save.saveVersion === 3, '版本化本地存档', `SAVE V${save.saveVersion}`)
check(save.campaign.highestUnlockedLevel === 20 && records.length === 20, '新档顺序推进至第 20 关', `${records.length} records, unlocked ${save.campaign.highestUnlockedLevel}`)
check(totalStars === 60 && records.every((record) => record.clears === 1), '新档主线完整结算', `${totalStars}/60 stars`)
check(save.endless.unlocked, '第 10 关后解锁无尽模式', `unlocked=${save.endless.unlocked}`)

save = recordEndlessSettlement(save, { coins: coins + 25, score: 88000, wave: 6, maxCombo: 144 }, 2000)
check(save.endless.highScore === 88000 && save.endless.highestWave === 6 && save.endless.bestCombo === 144, '无尽纪录结算', JSON.stringify(save.endless))

const wave3 = getEndlessLevelConfig(3)
const wave9 = getEndlessLevelConfig(9)
check(wave3.movingRows.length > 0 && wave9.layout.join('').includes('3'), '无尽波次成长', `wave3 moving ${wave3.movingRows.length}, wave9 tier3 bricks`)

const guaranteedCoins = LEVELS.reduce((sum, level) => sum + level.clearBonus, 0)
  + STAR_REWARDS.reduce((sum, reward) => sum + reward.coins, 0)
const fullUpgradeCost = UPGRADE_DEFINITIONS.reduce((sum, item) => sum + item.costs.reduce((subtotal, cost) => subtotal + cost, 0), 0)
check(guaranteedCoins >= fullUpgradeCost, '金币与永久成长闭环', `${guaranteedCoins} income / ${fullUpgradeCost} cost`)

const requiredFiles = [
  'README.md',
  'CHANGELOG.md',
  'docs/完整开发文档.md',
  'docs/部署说明.md',
  'docs/v1.0.0验收报告.md',
  'docs/v1.0.0发行说明.md',
  'public/favicon.svg',
  'public/manifest.webmanifest',
]
check(requiredFiles.every(existsSync), '中文发行文档与品牌资产', requiredFiles.filter(existsSync).length + '/' + requiredFiles.length)

const packageJson = JSON.parse(readFileSync('package.json', 'utf8'))
const manifest = JSON.parse(readFileSync('public/manifest.webmanifest', 'utf8'))
const html = readFileSync('index.html', 'utf8')
const appSource = readFileSync('src/App.vue', 'utf8')
const styleSource = readFileSync('src/style.css', 'utf8')
const viteSource = readFileSync('vite.config.js', 'utf8')
check(packageJson.name === 'neon-breaker' && packageJson.version === '1.0.2', '正式包身份', `${packageJson.name}@${packageJson.version}`)
check(manifest.name.includes('霓虹破界') && manifest.orientation === 'portrait-primary', '竖屏 Web App 清单', manifest.name)
check(html.includes('霓虹破界：Neon Breaker') && html.includes('manifest.webmanifest'), '发行元信息', 'title + description + manifest')
check(viteSource.includes("base: './'"), '便携静态部署路径', "Vite base './'")
check(appSource.includes('window.render_game_to_text') && appSource.includes('window.advanceTime') && appSource.includes('<canvas'), '网页游戏测试接口', 'canvas + text state + fixed stepping')
check(styleSource.includes('safe-area-inset') && styleSource.includes('@media (max-width: 390px)') && styleSource.includes('min-width: 320px'), '双端与安全区样式', 'safe area + 720/390/320 breakpoints')

console.log(JSON.stringify({
  release: '霓虹破界：Neon Breaker v1.0.2',
  summary: { passed: checks.filter((item) => item.passed).length, total: checks.length, failures },
  checks,
}, null, 2))

if (failures.length) process.exitCode = 1
