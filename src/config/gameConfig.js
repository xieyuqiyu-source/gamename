export const GAME_WIDTH = 540
export const GAME_HEIGHT = 960
export const FIXED_STEP = 1 / 120

export const COLORS = {
  backgroundTop: '#07131f',
  backgroundBottom: '#10122b',
  cyan: '#55f4dd',
  cyanSoft: '#20bda9',
  purple: '#b980ff',
  magenta: '#ff4da6',
  gold: '#ffd166',
  text: '#effffc',
  muted: '#75949d',
  danger: '#ff5778',
}

export const PADDLE = {
  width: 116,
  height: 18,
  y: 866,
  speed: 560,
}

export const BALL = {
  radius: 9,
  launchSpeed: 440,
  minVerticalSpeed: 190,
  maxSpeed: 650,
  maxCount: 12,
}

export const POWERUPS = {
  multiball: { name: '多球分裂', short: 'M', color: '#ff4da6', duration: 0 },
  expand: { name: '挡板扩展', short: 'W', color: '#55f4dd', duration: 15 },
  pierce: { name: '穿透光球', short: 'P', color: '#ffd166', duration: 8 },
  slow: { name: '时流减速', short: 'S', color: '#55a7ff', duration: 10 },
  laser: { name: '双轨激光', short: 'L', color: '#ff7b54', duration: 10 },
}

export const DROP = {
  itemSpeed: 154,
  coinGravity: 430,
  magnetRange: 112,
  maxDrops: 28,
}

export { LEVEL_ONE } from './levels.js'

export const MODE_LABELS = {
  menu: '等待开始',
  briefing: '任务准备',
  ready: '准备发球',
  playing: '游戏进行中',
  paused: '游戏已暂停',
  countdown: '即将继续',
  won: '关卡完成',
  lost: '挑战失败',
}
