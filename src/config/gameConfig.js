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
}

export const LEVEL_ONE = {
  id: 1,
  name: '初次折射',
  columns: 9,
  rows: 7,
  left: 34,
  top: 178,
  gapX: 6,
  gapY: 9,
  brickHeight: 28,
}

export const MODE_LABELS = {
  menu: '等待开始',
  ready: '准备发球',
  playing: '游戏进行中',
  paused: '游戏已暂停',
  won: '关卡完成',
  lost: '挑战失败',
}
