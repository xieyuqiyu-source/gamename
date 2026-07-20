import {
  BALL, COLORS, DROP, FIXED_STEP, GAME_HEIGHT, GAME_WIDTH,
  LEVEL_ONE, PADDLE, POWERUPS,
} from '../config/gameConfig.js'
import { getEndlessLevelConfig } from '../config/levels.js'
import { getEffectProfile, resolveEffectQuality } from '../config/visualSettings.js'

const clamp = (value, min, max) => Math.max(min, Math.min(max, value))
const TAU = Math.PI * 2

function circleRectCollision(ball, rect) {
  const x = clamp(ball.x, rect.x, rect.x + rect.w)
  const y = clamp(ball.y, rect.y, rect.y + rect.h)
  return (ball.x - x) ** 2 + (ball.y - y) ** 2 <= ball.r ** 2
}

function rectCollision(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
}

const DEFAULT_MODIFIERS = {
  paddleWidthMultiplier: 1, itemDropBonus: 0, coinBonusRate: 0,
  magnetRangeMultiplier: 1, comboGraceBonus: 0, shieldCharges: 0, extraLives: 0,
}

function createBricks(levelConfig, layout = levelConfig.layout) {
  const usable = GAME_WIDTH - levelConfig.left * 2 - levelConfig.gapX * (levelConfig.columns - 1)
  const width = usable / levelConfig.columns
  const bricks = []
  layout.forEach((row, rowIndex) => [...row].forEach((cell, columnIndex) => {
    const cellValue = Number(cell)
    if (!cellValue) return
    const type = cellValue === 4 ? 'reactor' : 'standard'
    const hp = type === 'reactor' ? 1 : cellValue
    const moving = levelConfig.movingRows?.includes(rowIndex)
    const x = levelConfig.left + columnIndex * (width + levelConfig.gapX)
    bricks.push({
      id: `${rowIndex}-${columnIndex}`,
      row: rowIndex,
      column: columnIndex,
      x,
      y: levelConfig.top + rowIndex * (levelConfig.brickHeight + levelConfig.gapY),
      w: width, h: levelConfig.brickHeight, hp, maxHp: hp, type, flash: 0,
      moving,
      baseX: x,
      motionPhase: rowIndex * 1.17,
      velocityX: 0,
    })
  }))
  return bricks
}

function createBossState(levelConfig, shieldNodes) {
  const config = levelConfig.boss
  if (!config) return null
  const width = 166
  const bossX = (GAME_WIDTH - width) / 2
  const modules = config.attackModules
    ? Array.from({ length: config.attackModules.count }, (_, index) => ({
      id: `module-${index + 1}`,
      side: index % 2 === 0 ? 'left' : 'right',
      x: index % 2 === 0 ? bossX - 38 : bossX + width + 8,
      y: 138,
      w: 30,
      h: 42,
      hp: config.attackModules.hp,
      maxHp: config.attackModules.hp,
      hitCooldown: 0,
      flash: 0,
      destroyed: false,
    }))
    : []
  return {
    kind: config.kind || 'prism',
    codename: config.codename,
    x: bossX,
    y: 132,
    w: width,
    h: 54,
    vx: config.phaseSpeeds[0],
    hp: config.maxHp,
    maxHp: config.maxHp,
    phase: 1,
    maxPhases: config.phases,
    shieldActive: true,
    shieldNodes,
    hitCooldown: 0,
    pulseTimer: 4.2,
    pulse: 0,
    flash: 0,
    defeated: false,
    modules,
    attackTimer: config.attackModules?.fireIntervals?.[0] || 0,
    barrageTimer: config.barrage?.fireIntervals?.[0] || 0,
  }
}

export class GameEngine {
  constructor(canvas, {
    onStateChange,
    startingCoins = 0,
    startingBestScore = 0,
    effectQuality = 'high',
    screenShake = true,
    reducedFlash = false,
    levelConfig = LEVEL_ONE,
    modifiers = DEFAULT_MODIFIERS,
    onOpenCampaign,
    isInputEnabled = () => true,
  } = {}) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')
    this.onStateChange = onStateChange
    this.startingCoins = startingCoins
    this.startingBestScore = startingBestScore
    this.effectQuality = resolveEffectQuality(effectQuality)
    this.effectProfile = getEffectProfile(this.effectQuality)
    this.screenShake = screenShake !== false
    this.reducedFlash = Boolean(reducedFlash)
    this.levelConfig = levelConfig
    this.modifiers = { ...DEFAULT_MODIFIERS, ...modifiers }
    this.onOpenCampaign = onOpenCampaign
    this.isInputEnabled = isInputEnabled
    this.coinBonusCarry = 0
    this.rafId = null
    this.lastTimestamp = 0
    this.accumulator = 0
    this.manualStepping = false
    this.keys = new Set()
    this.pointerTargetX = null
    this.trail = []
    this.particles = []
    this.particlePool = []
    this.waves = []
    this.floaters = []
    this.projectiles = []
    this.hazards = []
    this.hitStop = 0
    this.flash = 0
    this.shake = 0
    this.randomSeed = 0x2f6e2b1
    this.nextBallId = 1
    this.nextDropId = 1
    this.nextRunId = 1
    this.endlessStartWave = 1
    this.brickMotionTime = 0
    this.chainReactionDepth = 0
    this.stateVersion = 0
    this.lastPublishedVersion = -1
    this.uiPublishTimer = 0
    this.countdownPublishTimer = 0
    this.state = this.createInitialState()

    this.handleKeyDown = this.handleKeyDown.bind(this)
    this.handleKeyUp = this.handleKeyUp.bind(this)
    this.handlePointerMove = this.handlePointerMove.bind(this)
    this.handlePointerDown = this.handlePointerDown.bind(this)
    this.handleContextMenu = this.handleContextMenu.bind(this)
    this.handleVisibilityChange = this.handleVisibilityChange.bind(this)
    this.handleWindowBlur = this.handleWindowBlur.bind(this)
    this.loop = this.loop.bind(this)
  }

  createInitialState() {
    const basePaddleWidth = PADDLE.width * this.modifiers.paddleWidthMultiplier
    const maxLives = 3 + this.modifiers.extraLives
    const bricks = createBricks(this.levelConfig)
    return {
      mode: 'menu', runId: 0, runType: this.levelConfig.endless ? 'endless' : 'campaign',
      level: this.levelConfig.id, levelName: this.levelConfig.name,
      wave: this.levelConfig.endless ? this.levelConfig.wave : 0,
      wavesCleared: 0,
      lives: maxLives, maxLives, shieldCharges: this.modifiers.shieldCharges,
      score: 0, bestScore: this.startingBestScore || 0, coins: this.startingCoins || 0,
      runStartCoins: this.startingCoins || 0, clearBonus: 0, stars: 0,
      starBreakdown: { clear: false, survivor: false, mastery: false },
      combo: 0, maxCombo: 0, comboTimer: 0, destroyedCount: 0,
      bricks,
      boss: createBossState(this.levelConfig, bricks.length),
      paddle: { x: (GAME_WIDTH - basePaddleWidth) / 2, y: PADDLE.y, w: basePaddleWidth, h: PADDLE.height, velocityX: 0, guardTimer: 0 },
      balls: [], drops: [], message: '准备进入霓虹试炼', laserCooldown: 0,
      resumeCountdown: 0,
      powerups: {
        expand: { remaining: 0, stacks: 0 }, pierce: { remaining: 0 },
        slow: { remaining: 0 }, laser: { remaining: 0 },
      },
    }
  }

  start() {
    window.addEventListener('keydown', this.handleKeyDown)
    window.addEventListener('keyup', this.handleKeyUp)
    window.addEventListener('blur', this.handleWindowBlur)
    document.addEventListener('visibilitychange', this.handleVisibilityChange)
    this.canvas.addEventListener('pointermove', this.handlePointerMove)
    this.canvas.addEventListener('pointerdown', this.handlePointerDown)
    this.canvas.addEventListener('contextmenu', this.handleContextMenu)
    this.canvas.style.touchAction = 'none'
    this.publish(true)
    this.render()
    this.rafId = requestAnimationFrame(this.loop)
  }

  destroy() {
    cancelAnimationFrame(this.rafId)
    window.removeEventListener('keydown', this.handleKeyDown)
    window.removeEventListener('keyup', this.handleKeyUp)
    window.removeEventListener('blur', this.handleWindowBlur)
    document.removeEventListener('visibilitychange', this.handleVisibilityChange)
    this.canvas.removeEventListener('pointermove', this.handlePointerMove)
    this.canvas.removeEventListener('pointerdown', this.handlePointerDown)
    this.canvas.removeEventListener('contextmenu', this.handleContextMenu)
  }

  startNewGame() {
    const { bestScore, coins } = this.state
    this.startingCoins = coins
    this.startingBestScore = bestScore
    if (this.levelConfig.endless) this.levelConfig = getEndlessLevelConfig(this.endlessStartWave)
    this.state = this.createInitialState()
    this.brickMotionTime = 0
    this.coinBonusCarry = 0
    this.state.runId = this.nextRunId++
    this.state.runStartCoins = coins
    this.state.mode = 'ready'
    this.state.message = '移动挡板 · 点击或按空格发球'
    this.clearTransientEffects()
    this.spawnAttachedBall()
    this.touchState(); this.publish(true); this.render()
  }

  openBriefing() {
    const { bestScore, coins } = this.state
    this.startingCoins = coins
    this.startingBestScore = bestScore
    this.state = this.createInitialState()
    this.state.mode = 'briefing'
    this.state.message = '确认任务目标后开始挑战'
    this.clearTransientEffects()
    this.touchState(); this.publish(true); this.render()
  }

  configureLevel(levelConfig, { coins = this.state.coins, bestScore = 0, modifiers = this.modifiers } = {}) {
    this.levelConfig = levelConfig || LEVEL_ONE
    this.endlessStartWave = this.levelConfig.endless ? this.levelConfig.wave : 1
    this.modifiers = { ...DEFAULT_MODIFIERS, ...modifiers }
    this.startingCoins = coins
    this.startingBestScore = bestScore
    this.state = this.createInitialState()
    this.brickMotionTime = 0
    this.state.mode = 'briefing'
    this.state.message = '确认任务目标后开始挑战'
    this.clearTransientEffects()
    this.touchState(); this.publish(true); this.render()
  }

  configureEndless({ wave = 1, coins = this.state.coins, bestScore = 0, modifiers = this.modifiers } = {}) {
    this.endlessStartWave = Math.max(1, Math.floor(Number(wave) || 1))
    this.configureLevel(getEndlessLevelConfig(this.endlessStartWave), { coins, bestScore, modifiers })
  }

  configureVisualSettings({ effectQuality = this.effectQuality, screenShake = this.screenShake, reducedFlash = this.reducedFlash } = {}) {
    this.effectQuality = resolveEffectQuality(effectQuality)
    this.effectProfile = getEffectProfile(this.effectQuality)
    this.screenShake = screenShake !== false
    this.reducedFlash = Boolean(reducedFlash)
    if (!this.screenShake) this.shake = 0
    if (this.reducedFlash) this.flash = Math.min(this.flash, 0.12)
    if (this.particles.length > this.effectProfile.particleLimit) {
      const excess = this.particles.splice(0, this.particles.length - this.effectProfile.particleLimit)
      this.particlePool.push(...excess)
    }
    this.trail = this.trail.slice(-this.effectProfile.trailLimit)
    this.waves = this.waves.slice(-this.effectProfile.waveLimit)
    this.floaters = this.floaters.slice(-this.effectProfile.floaterLimit)
    this.touchState(); this.publish(true); this.render()
    return { ...this.effectProfile, screenShake: this.screenShake, reducedFlash: this.reducedFlash }
  }

  requestCampaign() {
    this.onOpenCampaign?.()
  }

  returnToMenu() {
    const { bestScore, coins } = this.state
    this.startingCoins = coins
    this.startingBestScore = bestScore
    this.state = this.createInitialState()
    this.state.message = '存档已同步 · 等待进入任务'
    this.clearTransientEffects()
    this.touchState(); this.publish(true); this.render()
  }

  loadProfile({ coins = 0, bestScore = 0, modifiers = this.modifiers, levelConfig = this.levelConfig } = {}) {
    this.startingCoins = coins
    this.startingBestScore = bestScore
    this.modifiers = { ...DEFAULT_MODIFIERS, ...modifiers }
    this.levelConfig = levelConfig || LEVEL_ONE
    this.state = this.createInitialState()
    this.clearTransientEffects()
    this.touchState(); this.publish(true); this.render()
  }

  clearTransientEffects() {
    this.trail.length = 0
    this.particles.length = 0
    this.waves.length = 0
    this.floaters.length = 0
    this.projectiles.length = 0
    this.hazards.length = 0
    this.hitStop = 0
    this.flash = 0
  }

  newBall(x, y, vx = 0, vy = 0, stuck = false) {
    return { id: this.nextBallId++, x, y, vx, vy, r: BALL.radius, stuck, lastHitBrickId: null, brickHitCooldown: 0, stallTimer: 0 }
  }

  spawnAttachedBall() {
    const paddle = this.state.paddle
    this.state.balls = [this.newBall(paddle.x + paddle.w / 2, paddle.y - BALL.radius - 5, 0, 0, true)]
  }

  launch() {
    if (this.state.mode !== 'ready') return
    const ball = this.state.balls[0]
    if (!ball) return
    const direction = this.state.paddle.x + this.state.paddle.w / 2 < GAME_WIDTH / 2 ? 1 : -1
    const launchSpeed = BALL.launchSpeed * this.levelConfig.ballSpeedMultiplier
    ball.vx = 0.58 * launchSpeed * direction
    ball.vy = -Math.sqrt(launchSpeed ** 2 - ball.vx ** 2)
    ball.stuck = false
    this.state.mode = 'playing'
    this.state.message = '连击砖块，接住能量胶囊'
    this.touchState(); this.publish(true)
  }

  togglePause() {
    if (this.state.mode === 'playing') {
      this.pauseGame('游戏已暂停')
    } else if (this.state.mode === 'paused') {
      this.beginResumeCountdown()
    } else if (this.state.mode === 'countdown') {
      this.pauseGame('已取消继续')
    } else return
  }

  pauseGame(message = '游戏已暂停') {
    if (!['playing', 'countdown'].includes(this.state.mode)) return false
    this.state.mode = 'paused'
    this.state.resumeCountdown = 0
    this.state.message = message
    this.keys.clear()
    this.pointerTargetX = null
    this.touchState(); this.publish(true); this.render()
    return true
  }

  beginResumeCountdown() {
    if (this.state.mode !== 'paused') return false
    this.state.mode = 'countdown'
    this.state.resumeCountdown = 3
    this.countdownPublishTimer = 0
    this.state.message = '3 秒后继续'
    this.keys.clear()
    this.pointerTargetX = null
    this.touchState(); this.publish(true); this.render()
    return true
  }

  handleVisibilityChange() {
    if (document.hidden) this.pauseGame('页面进入后台 · 已自动暂停')
  }

  handleWindowBlur() {
    this.pauseGame('页面失去焦点 · 已自动暂停')
  }

  fireLaser() {
    if (this.state.mode !== 'playing' || this.state.powerups.laser.remaining <= 0 || this.state.laserCooldown > 0) return false
    const paddle = this.state.paddle
    for (const offset of [18, paddle.w - 18]) {
      this.projectiles.push({ x: paddle.x + offset - 2, y: paddle.y - 13, w: 4, h: 18, vy: -780, color: POWERUPS.laser.color })
    }
    this.state.laserCooldown = 0.24
    this.spawnBurst(paddle.x + paddle.w / 2, paddle.y, POWERUPS.laser.color, 8)
    this.state.message = '双轨激光发射'
    this.touchState()
    return true
  }

  handleKeyDown(event) {
    const key = event.key.toLowerCase()
    if (!this.isInputEnabled()) {
      this.keys.clear()
      return
    }
    const interactiveTarget = event.target?.closest?.('button, input, select, textarea, a, [role="button"], [contenteditable="true"]')
    if (interactiveTarget && [' ', 'enter'].includes(key)) return
    if (['arrowleft', 'arrowright', 'a', 'd', ' ', 'enter'].includes(key)) event.preventDefault()
    this.keys.add(key)
    if (key === ' ' || key === 'enter') {
      if (this.state.mode === 'menu') this.requestCampaign()
      else if (this.state.mode === 'briefing') this.startNewGame()
      else if (['won', 'lost'].includes(this.state.mode)) this.startNewGame()
      else if (this.state.mode === 'ready') this.launch()
      else if (['paused', 'countdown'].includes(this.state.mode)) this.togglePause()
      else this.fireLaser()
    }
    if (key === 'escape' || key === 'p') this.togglePause()
  }

  handleKeyUp(event) { this.keys.delete(event.key.toLowerCase()) }
  canvasPoint(event) {
    const rect = this.canvas.getBoundingClientRect()
    return { x: (event.clientX - rect.left) * GAME_WIDTH / rect.width, y: (event.clientY - rect.top) * GAME_HEIGHT / rect.height }
  }
  handlePointerMove(event) { this.pointerTargetX = this.canvasPoint(event).x }
  handlePointerDown(event) {
    this.canvas.setPointerCapture?.(event.pointerId)
    this.pointerTargetX = this.canvasPoint(event).x
    if (this.state.mode === 'menu') this.requestCampaign()
    else if (this.state.mode === 'briefing') this.startNewGame()
    else if (['won', 'lost'].includes(this.state.mode)) this.startNewGame()
    else if (this.state.mode === 'ready') this.launch()
    else if (['paused', 'countdown'].includes(this.state.mode)) this.togglePause()
    else this.fireLaser()
  }
  handleContextMenu(event) { event.preventDefault() }

  loop(timestamp) {
    if (!this.lastTimestamp) this.lastTimestamp = timestamp
    const elapsed = Math.min(0.05, (timestamp - this.lastTimestamp) / 1000)
    this.lastTimestamp = timestamp
    if (!this.manualStepping) {
      this.accumulator += elapsed
      while (this.accumulator >= FIXED_STEP) { this.update(FIXED_STEP); this.accumulator -= FIXED_STEP }
      this.render()
    }
    this.rafId = requestAnimationFrame(this.loop)
  }

  advanceTime(milliseconds) {
    this.manualStepping = true
    const steps = Math.max(1, Math.round(milliseconds / (FIXED_STEP * 1000)))
    for (let i = 0; i < steps; i += 1) this.update(FIXED_STEP)
    this.render(); this.publish()
  }

  update(dt) {
    if (this.state.mode === 'paused') return
    if (this.state.mode === 'countdown') {
      this.state.resumeCountdown = Math.max(0, this.state.resumeCountdown - dt)
      this.countdownPublishTimer += dt
      if (this.state.resumeCountdown <= 0) {
        this.state.resumeCountdown = 0
        this.state.mode = 'playing'
        this.state.message = '继续挑战'
        this.touchState(); this.publish(true)
      } else if (this.countdownPublishTimer >= 0.1) {
        this.countdownPublishTimer = 0
        this.state.message = `${Math.ceil(this.state.resumeCountdown)} 秒后继续`
        this.touchState(); this.publish()
      }
      return
    }
    if (this.hitStop > 0) {
      this.hitStop = Math.max(0, this.hitStop - dt)
      this.updateEffects(dt)
      this.publish()
      return
    }
    this.updatePaddle(dt)
    if (this.state.mode === 'ready') {
      const ball = this.state.balls[0]
      if (ball) { ball.x = this.state.paddle.x + this.state.paddle.w / 2; ball.y = this.state.paddle.y - ball.r - 5 }
    }
    if (this.state.mode === 'playing') {
      this.updatePowerups(dt)
      this.updateBoss(dt)
      this.updateBricks(dt)
      this.updateHazards(dt)
      if (this.state.mode === 'playing') this.updateBalls(dt)
      if (this.state.mode === 'playing') this.updateProjectiles(dt)
      if (this.state.mode === 'playing') this.updateDrops(dt)
      if (this.state.mode === 'playing') this.updateCombo(dt)
    }
    this.updateEffects(dt)
    this.publish()
  }

  updatePaddle(dt) {
    const paddle = this.state.paddle
    const oldX = paddle.x
    const left = this.keys.has('arrowleft') || this.keys.has('a')
    const right = this.keys.has('arrowright') || this.keys.has('d')
    if (left !== right) { paddle.x += (right ? 1 : -1) * PADDLE.speed * dt; this.pointerTargetX = null }
    else if (this.pointerTargetX !== null) {
      const delta = this.pointerTargetX - paddle.w / 2 - paddle.x
      paddle.x += clamp(delta, -PADDLE.speed * 1.8 * dt, PADDLE.speed * 1.8 * dt)
    }
    paddle.x = clamp(paddle.x, 18, GAME_WIDTH - 18 - paddle.w)
    paddle.velocityX = (paddle.x - oldX) / Math.max(dt, 0.0001)
    paddle.guardTimer = Math.abs(paddle.velocityX) >= 220 ? 0.22 : Math.max(0, (paddle.guardTimer || 0) - dt)
  }

  updateBricks(dt) {
    if (!this.levelConfig.motionAmplitude || !this.state.bricks.some((brick) => brick.moving)) return
    this.brickMotionTime += dt
    for (const brick of this.state.bricks) {
      if (!brick.moving) continue
      const oldX = brick.x
      brick.x = brick.baseX + Math.sin(this.brickMotionTime * 1.45 + brick.motionPhase) * this.levelConfig.motionAmplitude
      brick.velocityX = (brick.x - oldX) / Math.max(dt, 0.0001)
    }
  }

  updateBalls(dt) {
    const slowFactor = this.state.powerups.slow.remaining > 0 ? 0.72 : 1
    const surviving = []
    for (const ball of this.state.balls) {
      if (ball.stuck) { surviving.push(ball); continue }
      const previousX = ball.x
      const previousY = ball.y
      ball.brickHitCooldown = Math.max(0, ball.brickHitCooldown - dt)
      ball.stallTimer += dt
      if (ball.stallTimer >= 7) this.breakBallLoop(ball)
      ball.x += ball.vx * dt * slowFactor
      ball.y += ball.vy * dt * slowFactor
      if (ball.x - ball.r <= 14 && ball.vx < 0) { ball.x = 14 + ball.r; ball.vx = Math.abs(ball.vx); this.spawnImpact(ball.x, ball.y, COLORS.cyan, 3) }
      if (ball.x + ball.r >= GAME_WIDTH - 14 && ball.vx > 0) { ball.x = GAME_WIDTH - 14 - ball.r; ball.vx = -Math.abs(ball.vx); this.spawnImpact(ball.x, ball.y, COLORS.cyan, 3) }
      if (ball.y - ball.r <= 112 && ball.vy < 0) { ball.y = 112 + ball.r; ball.vy = Math.abs(ball.vy); this.spawnImpact(ball.x, ball.y, COLORS.cyan, 3) }

      this.collideBoss(ball, previousX, previousY)
      if (this.state.mode !== 'playing') break

      const paddle = this.state.paddle
      if (ball.vy > 0 && circleRectCollision(ball, paddle)) {
        ball.y = paddle.y - ball.r - 0.5
        const relative = clamp((ball.x - (paddle.x + paddle.w / 2)) / (paddle.w / 2), -1, 1)
        const influence = clamp(paddle.velocityX / 900, -0.22, 0.22)
        const angle = clamp(relative * 1.02 + influence, -1.12, 1.12)
        const speed = clamp(Math.hypot(ball.vx, ball.vy) * 1.012, BALL.launchSpeed, BALL.maxSpeed)
        ball.vx = Math.sin(angle) * speed
        ball.vy = -Math.max(Math.cos(angle) * speed, BALL.minVerticalSpeed)
        this.spawnImpact(ball.x, paddle.y, COLORS.cyan, 8); this.shake = Math.max(this.shake, 1.2)
      }
      this.collideBricks(ball, previousX, previousY)
      if (this.state.mode !== 'playing') break
      if (ball.y - ball.r <= GAME_HEIGHT) {
        surviving.push(ball)
        if (this.state.mode === 'playing') {
          this.trail.push({ id: ball.id, x: ball.x, y: ball.y, life: 0.24 })
          if (this.trail.length > this.effectProfile.trailLimit) this.trail.splice(0, this.trail.length - this.effectProfile.trailLimit)
        }
      }
    }
    this.state.balls = this.state.mode === 'playing' ? surviving : []
    if (this.trail.length > 150) this.trail.splice(0, this.trail.length - 150)
    if (this.state.mode === 'playing' && this.state.balls.length === 0) this.loseBall()
  }

  collideBricks(ball, previousX, previousY) {
    for (const brick of this.state.bricks) {
      if (brick.hp <= 0 || !circleRectCollision(ball, brick)) continue
      if (ball.lastHitBrickId === brick.id && ball.brickHitCooldown > 0) continue
      const piercing = this.state.powerups.pierce.remaining > 0
      if (!piercing) this.resolveBrickBounce(ball, brick, previousX, previousY)
      ball.lastHitBrickId = brick.id
      ball.brickHitCooldown = piercing ? 0.025 : 0.055
      ball.stallTimer = 0
      this.damageBrick(brick, ball.x, ball.y, 'ball')
      if (!piercing) break
    }
  }

  collideBoss(ball, previousX, previousY) {
    const boss = this.state.boss
    if (!boss || boss.defeated) return
    for (const module of boss.modules) {
      if (module.destroyed || !circleRectCollision(ball, module)) continue
      this.resolveBrickBounce(ball, module, previousX, previousY)
      if (module.hitCooldown <= 0) this.damageBossModule(module, ball.x, ball.y, 'ball')
      return
    }
    if (!circleRectCollision(ball, boss)) return
    this.resolveBrickBounce(ball, boss, previousX, previousY)
    if (boss.hitCooldown > 0) return
    if (boss.shieldActive) {
      boss.hitCooldown = 0.12
      boss.flash = 0.1
      this.state.message = `护盾在线 · 剩余 ${this.remainingBricks()} 个阵列节点`
      this.spawnImpact(ball.x, ball.y, COLORS.cyan, 7)
      this.touchState()
      return
    }
    this.damageBoss(ball.x, ball.y, 'ball')
  }

  updateBoss(dt) {
    const boss = this.state.boss
    if (!boss || boss.defeated) return
    const speed = this.levelConfig.boss.phaseSpeeds[boss.phase - 1]
    boss.vx = Math.sign(boss.vx || 1) * speed
    boss.x += boss.vx * dt
    const moduleMargin = boss.modules.length ? 38 : 0
    const minX = 28 + moduleMargin
    const maxX = GAME_WIDTH - 28 - boss.w - moduleMargin
    if (boss.x <= minX) { boss.x = minX; boss.vx = Math.abs(boss.vx) }
    if (boss.x >= maxX) { boss.x = maxX; boss.vx = -Math.abs(boss.vx) }
    boss.modules.forEach((module) => {
      module.x = module.side === 'left' ? boss.x - module.w - 8 : boss.x + boss.w + 8
      module.y = boss.y + 6
      module.hitCooldown = Math.max(0, module.hitCooldown - dt)
      module.flash = Math.max(0, module.flash - dt)
    })
    boss.hitCooldown = Math.max(0, boss.hitCooldown - dt)
    boss.flash = Math.max(0, boss.flash - dt)
    boss.pulse = Math.max(0, boss.pulse - dt * 1.8)
    boss.pulseTimer -= dt
    if (boss.pulseTimer <= 0) {
      boss.pulseTimer = Math.max(2.7, 4.6 - boss.phase * 0.55)
      boss.pulse = 1
      this.waves.push({ x: boss.x + boss.w / 2, y: boss.y + boss.h / 2, radius: 20, life: 0.7, maxLife: 0.7, color: this.levelConfig.accent })
      this.shake = Math.max(this.shake, 2.2 + boss.phase * 0.7)
      this.state.message = `${boss.codename} 能量脉冲 · PHASE ${boss.phase}`
      this.touchState()
    }
    if (!boss.shieldActive) {
      if (boss.modules.some((module) => !module.destroyed)) {
        boss.attackTimer -= dt
        if (boss.attackTimer <= 0) this.fireBossModules()
      }
      if (this.levelConfig.boss?.barrage) {
        boss.barrageTimer -= dt
        if (boss.barrageTimer <= 0) this.fireBossBarrage()
      }
    }
    if (boss.shieldActive && this.remainingBricks() === 0) this.breakBossShield()
  }

  fireBossModules() {
    const boss = this.state.boss
    if (!boss || boss.defeated || !this.levelConfig.boss?.attackModules) return false
    const activeModules = boss.modules.filter((module) => !module.destroyed)
    if (!activeModules.length) return false
    const targetX = this.state.paddle.x + this.state.paddle.w / 2
    const moduleColor = boss.kind === 'magnetron' ? '#55a7ff' : this.levelConfig.accent
    for (const module of activeModules) {
      const x = module.x + module.w / 2
      const y = module.y + module.h
      this.hazards.push({
        id: `${module.id}-${this.state.runId}-${Math.round(this.random() * 1e7)}`,
        x: x - 7,
        y,
        w: 14,
        h: 24,
        vx: clamp((targetX - x) * 0.22, -72, 72),
        vy: 220 + boss.phase * 34,
        pulse: this.random() * TAU,
        kind: 'magnet',
        color: this.levelConfig.accent,
        sourceModuleId: module.id,
      })
      this.spawnImpact(x, y, moduleColor, 7)
    }
    const intervals = this.levelConfig.boss.attackModules.fireIntervals
    boss.attackTimer = intervals[boss.phase - 1] || intervals.at(-1) || 2
    this.state.message = `模块齐射 · ${activeModules.length} 个攻击模块在线`
    this.touchState()
    return true
  }

  fireBossBarrage() {
    const boss = this.state.boss
    const barrage = this.levelConfig.boss?.barrage
    if (!boss || boss.defeated || boss.shieldActive || !barrage) return false
    const count = barrage.counts[boss.phase - 1] || barrage.counts.at(-1) || 1
    const speed = barrage.speeds[boss.phase - 1] || barrage.speeds.at(-1) || 250
    const spread = barrage.spread || 42
    const originX = boss.x + boss.w / 2
    const originY = boss.y + boss.h
    const targetX = this.state.paddle.x + this.state.paddle.w / 2
    const color = boss.kind === 'furnace' ? '#ff7b54' : this.levelConfig.accent
    for (let index = 0; index < count; index += 1) {
      const offset = (index - (count - 1) / 2) * spread
      const aimedX = targetX + offset
      this.hazards.push({
        id: `barrage-${boss.phase}-${this.state.runId}-${Math.round(this.random() * 1e7)}`,
        x: originX - 7,
        y: originY,
        w: 14,
        h: 22,
        vx: clamp((aimedX - originX) * 0.3, -168, 168),
        vy: speed,
        pulse: this.random() * TAU,
        kind: boss.kind === 'furnace' ? 'ember' : 'zenith',
        color,
      })
    }
    boss.barrageTimer = barrage.fireIntervals[boss.phase - 1] || barrage.fireIntervals.at(-1) || 3
    this.spawnImpact(originX, originY, color, 10 + count * 2)
    this.state.message = `${boss.codename} · ${count > 1 ? `${count} 重扇形弹幕` : '锁定火种'}`
    this.touchState()
    return true
  }

  damageBossModule(module, x, y, source = 'ball') {
    if (!module || module.destroyed || module.hitCooldown > 0) return false
    const moduleColor = this.state.boss?.kind === 'magnetron' ? '#55a7ff' : this.levelConfig.accent
    if (this.state.boss?.shieldActive) {
      module.hitCooldown = source === 'laser' ? 0.06 : 0.12
      module.flash = 0.1
      this.state.message = this.state.boss.kind === 'zenith'
        ? '星穹护盾联锁中 · 先清除阵列节点'
        : '磁盾联锁中 · 先清除阵列节点'
      this.spawnImpact(x, y, moduleColor, 6)
      this.touchState()
      return false
    }
    module.hp = Math.max(0, module.hp - 1)
    module.hitCooldown = source === 'laser' ? 0.08 : 0.14
    module.flash = 0.18
    const destroyed = module.hp === 0
    module.destroyed = destroyed
    this.state.combo += 1
    this.state.comboTimer = this.comboWindow()
    this.state.maxCombo = Math.max(this.state.maxCombo, this.state.combo)
    const points = destroyed ? 1200 : 420
    this.state.score += points
    this.state.bestScore = Math.max(this.state.bestScore, this.state.score)
    this.floaters.push({ x, y, text: destroyed ? `MODULE DOWN · +${points}` : `MODULE -1 · +${points}`, life: 0.82, color: moduleColor })
    this.spawnBurst(x, y, destroyed ? COLORS.gold : moduleColor, destroyed ? 40 : 16)
    this.shake = Math.max(this.shake, destroyed ? 7 : 3)
    this.flash = Math.max(this.flash, destroyed ? 0.2 : 0.08)
    this.state.message = destroyed ? `${module.side === 'left' ? '左' : '右'}侧攻击模块已摧毁` : `攻击模块耐久 ${module.hp} / ${module.maxHp}`
    if (destroyed && this.state.boss.modules.every((entry) => entry.destroyed)) {
      this.hazards = this.hazards.filter((hazard) => hazard.kind !== 'magnet')
      this.state.message = this.state.boss.kind === 'zenith'
        ? '全部攻击模块离线 · 奇点齐射终止'
        : '全部攻击模块离线 · 磁暴齐射终止'
    }
    this.touchState()
    return true
  }

  updateHazards(dt) {
    if (!this.hazards.length) return
    const initialCount = this.hazards.length
    const kept = []
    let clearedByShield = false
    for (const hazard of this.hazards) {
      hazard.x += hazard.vx * dt
      hazard.y += hazard.vy * dt
      hazard.pulse += dt * 8
      if (rectCollision(hazard, this.state.paddle)) {
        const result = this.takeBossHazardHit(hazard)
        if (this.state.mode !== 'playing') break
        if (result === 'shield') { clearedByShield = true; break }
        continue
      }
      if (hazard.y < GAME_HEIGHT + 30) kept.push(hazard)
    }
    const modulesOffline = this.state.boss?.modules?.length > 0
      && this.state.boss.modules.every((module) => module.destroyed)
    this.hazards = this.state.mode === 'playing' && !clearedByShield
      ? kept.filter((hazard) => !modulesOffline || hazard.kind !== 'magnet')
      : []
    if (this.hazards.length !== initialCount) this.touchState()
  }

  takeBossHazardHit(hazard) {
    const x = hazard.x + hazard.w / 2
    const y = this.state.paddle.y
    const hazardLabel = hazard.kind === 'ember'
      ? '熔火弹幕'
      : hazard.kind === 'zenith'
        ? '星穹弹幕'
        : this.state.boss?.kind === 'zenith' ? '奇点模块脉冲' : '磁暴脉冲'
    if (Math.abs(this.state.paddle.velocityX) >= 220 || this.state.paddle.guardTimer > 0) {
      const points = 240 + (this.state.boss?.phase || 1) * 60
      this.state.score += points
      this.state.bestScore = Math.max(this.state.bestScore, this.state.score)
      this.state.combo += 1
      this.state.comboTimer = this.comboWindow()
      this.state.maxCombo = Math.max(this.state.maxCombo, this.state.combo)
      this.state.message = `高速招架${hazardLabel} · +${points}`
      this.floaters.push({ x, y, text: `PARRY +${points}`, life: 0.82, color: COLORS.gold })
      this.spawnBurst(x, y, COLORS.gold, 28)
      this.waves.push({ x, y, radius: 9, life: 0.46, maxLife: 0.46, color: COLORS.gold })
      this.flash = Math.max(this.flash, 0.12)
      this.shake = Math.max(this.shake, 4)
      const sourceModule = hazard.sourceModuleId
        ? this.state.boss?.modules.find((module) => module.id === hazard.sourceModuleId && !module.destroyed)
        : null
      if (sourceModule && !this.state.boss.shieldActive) {
        sourceModule.hitCooldown = 0
        this.damageBossModule(sourceModule, sourceModule.x + sourceModule.w / 2, sourceModule.y + sourceModule.h / 2, 'parry')
      }
      this.touchState()
      return 'parry'
    }
    if (this.state.shieldCharges > 0) {
      this.state.shieldCharges -= 1
      this.hazards.length = 0
      this.state.message = `能量护盾吸收${hazardLabel} · 剩余 ${this.state.shieldCharges}`
      this.spawnBurst(x, y, COLORS.cyan, 32)
      this.waves.push({ x, y, radius: 12, life: 0.52, maxLife: 0.52, color: COLORS.cyan })
      this.flash = Math.max(this.flash, 0.16)
      this.shake = Math.max(this.shake, 5)
      this.touchState(); this.publish(true)
      return 'shield'
    }
    this.spawnBurst(x, y, COLORS.danger, 36)
    this.flash = Math.max(this.flash, 0.24)
    this.state.balls = []
    this.hazards.length = 0
    this.loseBall()
    if (this.state.mode === 'ready' && this.modifiers.shieldCharges > 0) {
      this.state.shieldCharges = 1
      this.state.message = `${hazardLabel}命中 · 生命 -1 · 护盾恢复 ${this.state.shieldCharges}`
      this.touchState(); this.publish(true)
    }
    return 'life'
  }

  breakBossShield() {
    const boss = this.state.boss
    if (!boss || !boss.shieldActive || boss.defeated) return false
    boss.shieldActive = false
    boss.shieldNodes = 0
    if (boss.modules.some((module) => !module.destroyed)) boss.attackTimer = Math.min(boss.attackTimer, 0.9)
    if (this.levelConfig.boss?.barrage) boss.barrageTimer = Math.min(boss.barrageTimer, boss.modules.length ? 2.1 : 1.1)
    boss.pulse = 1
    this.flash = Math.max(this.flash, 0.22)
    this.shake = Math.max(this.shake, 6)
    this.spawnBurst(boss.x + boss.w / 2, boss.y + boss.h / 2, COLORS.gold, 36)
    this.state.message = `PHASE ${boss.phase} 护盾破裂 · 攻击核心`
    this.touchState(); this.publish(true)
    return true
  }

  damageBoss(x, y, source = 'ball') {
    const boss = this.state.boss
    if (!boss || boss.defeated || boss.shieldActive || boss.hitCooldown > 0) return false
    const activeModules = boss.modules.filter((module) => !module.destroyed)
    if (boss.hp <= 1 && activeModules.length) {
      boss.hitCooldown = 0.14
      boss.flash = 0.12
      this.state.message = `核心锁定 · 先摧毁 ${activeModules.length} 个攻击模块`
      this.spawnImpact(x, y, boss.kind === 'magnetron' ? '#55a7ff' : this.levelConfig.accent, 10)
      this.touchState()
      return false
    }
    boss.hp = Math.max(0, boss.hp - 1)
    boss.hitCooldown = source === 'laser' ? 0.09 : 0.16
    boss.flash = 0.18
    this.state.combo += 1
    this.state.comboTimer = this.comboWindow()
    this.state.maxCombo = Math.max(this.state.maxCombo, this.state.combo)
    const points = 700 + boss.phase * 180 + Math.min(900, this.state.combo * 30)
    this.state.score += points
    this.state.bestScore = Math.max(this.state.bestScore, this.state.score)
    this.floaters.push({ x, y, text: `CORE -1 · +${points}`, life: 0.82, color: COLORS.gold })
    this.spawnBurst(x, y, COLORS.gold, 24)
    this.waves.push({ x, y, radius: 8, life: 0.42, maxLife: 0.42, color: COLORS.gold })
    this.flash = Math.max(this.flash, 0.12)
    this.shake = Math.max(this.shake, 4.5)
    this.state.message = `${boss.codename} · CORE ${boss.hp} / ${boss.maxHp}`
    if (boss.hp <= 0) {
      boss.defeated = true
      boss.shieldActive = false
      this.state.message = `${boss.codename} 已击破`
      this.touchState()
      this.winLevel()
      return true
    }
    const hpPerPhase = boss.maxHp / boss.maxPhases
    const nextPhase = Math.min(boss.maxPhases, Math.floor((boss.maxHp - boss.hp) / hpPerPhase) + 1)
    if (nextPhase > boss.phase) this.startBossPhase(nextPhase)
    this.touchState()
    return true
  }

  startBossPhase(phase) {
    const boss = this.state.boss
    if (!boss || phase > boss.maxPhases) return false
    const layout = this.levelConfig.boss.phaseLayouts[phase - 1]
    this.state.bricks = createBricks(this.levelConfig, layout)
    boss.phase = phase
    boss.shieldActive = true
    boss.shieldNodes = this.state.bricks.length
    boss.x = (GAME_WIDTH - boss.w) / 2
    boss.vx = (phase % 2 ? 1 : -1) * this.levelConfig.boss.phaseSpeeds[phase - 1]
    boss.hitCooldown = 0.45
    boss.attackTimer = this.levelConfig.boss.attackModules?.fireIntervals?.[phase - 1] || boss.attackTimer
    boss.barrageTimer = this.levelConfig.boss.barrage?.fireIntervals?.[phase - 1] || boss.barrageTimer
    boss.pulseTimer = Math.max(2.7, 4.6 - phase * 0.55)
    boss.pulse = 1
    this.state.message = `PHASE ${phase} · 护盾阵列重构`
    this.spawnBurst(boss.x + boss.w / 2, boss.y + boss.h / 2, this.levelConfig.accent, 54)
    this.flash = Math.max(this.flash, 0.28)
    this.shake = Math.max(this.shake, 7)
    this.touchState(); this.publish(true)
    return true
  }

  resolveBrickBounce(ball, brick, previousX, previousY) {
    const top = previousY + ball.r <= brick.y
    const bottom = previousY - ball.r >= brick.y + brick.h
    const left = previousX + ball.r <= brick.x
    const right = previousX - ball.r >= brick.x + brick.w
    if (top && ball.vy > 0) { ball.y = brick.y - ball.r - 0.1; ball.vy = -Math.abs(ball.vy) }
    else if (bottom && ball.vy < 0) { ball.y = brick.y + brick.h + ball.r + 0.1; ball.vy = Math.abs(ball.vy) }
    else if (left && ball.vx > 0) { ball.x = brick.x - ball.r - 0.1; ball.vx = -Math.abs(ball.vx) }
    else if (right && ball.vx < 0) { ball.x = brick.x + brick.w + ball.r + 0.1; ball.vx = Math.abs(ball.vx) }
    else {
      const overlaps = [Math.abs(ball.x + ball.r - brick.x), Math.abs(brick.x + brick.w - (ball.x - ball.r)), Math.abs(ball.y + ball.r - brick.y), Math.abs(brick.y + brick.h - (ball.y - ball.r))]
      if (Math.min(...overlaps) === overlaps[0] || Math.min(...overlaps) === overlaps[1]) ball.vx *= -1
      else ball.vy *= -1
    }
  }

  breakBallLoop(ball) {
    const rotation = ball.id % 2 ? 0.19 : -0.19
    const cos = Math.cos(rotation); const sin = Math.sin(rotation)
    const vx = ball.vx * cos - ball.vy * sin
    const vy = ball.vx * sin + ball.vy * cos
    const speed = Math.hypot(vx, vy)
    ball.vx = vx
    ball.vy = Math.abs(vy) < BALL.minVerticalSpeed
      ? Math.sign(vy || -1) * BALL.minVerticalSpeed
      : vy
    const adjustedSpeed = Math.hypot(ball.vx, ball.vy)
    ball.vx *= speed / adjustedSpeed
    ball.vy *= speed / adjustedSpeed
    ball.stallTimer = 0
    this.spawnImpact(ball.x, ball.y, this.levelConfig.accent, 4)
  }

  detonateReactor(brick) {
    const centerX = brick.x + brick.w / 2
    const centerY = brick.y + brick.h / 2
    const nearby = this.state.bricks.filter((candidate) => candidate.hp > 0
      && candidate !== brick
      && Math.abs(candidate.row - brick.row) <= 1
      && Math.abs(candidate.column - brick.column) <= 1)
    this.spawnBurst(centerX, centerY, '#ff9b54', 48)
    this.waves.push({ x: centerX, y: centerY, radius: 10, life: 0.56, maxLife: 0.56, color: '#ff7b54' })
    this.shake = Math.max(this.shake, 7)
    this.flash = Math.max(this.flash, 0.2)
    for (const candidate of nearby) {
      this.damageBrick(candidate, candidate.x + candidate.w / 2, candidate.y + candidate.h / 2, 'reactor')
    }
    return nearby.length
  }

  damageBrick(brick, x, y, source) {
    if (brick.hp <= 0) return false
    brick.hp -= 1
    brick.flash = 0.14
    const destroyed = brick.hp === 0
    this.state.combo += 1
    this.state.comboTimer = this.comboWindow()
    this.state.maxCombo = Math.max(this.state.maxCombo, this.state.combo)
    const multiplier = 1 + Math.min(2, Math.floor(this.state.combo / 5) * 0.25)
    const points = Math.round((destroyed ? 180 : 90) * multiplier)
    this.state.score += points
    this.state.bestScore = Math.max(this.state.bestScore, this.state.score)
    const color = destroyed ? COLORS.magenta : COLORS.purple
    this.spawnImpact(x, y, color, destroyed ? 20 : 8)
    this.waves.push({ x, y, radius: 5, life: destroyed ? 0.38 : 0.22, maxLife: destroyed ? 0.38 : 0.22, color })
    this.floaters.push({ x, y, text: `+${points}`, life: 0.72, color: this.state.combo >= 5 ? COLORS.gold : COLORS.text })
    this.shake = Math.max(this.shake, destroyed ? 3.4 : 1.4)
    this.hitStop = Math.max(this.hitStop, destroyed ? 0.025 : 0.012)
    this.flash = Math.max(this.flash, destroyed ? 0.13 : 0.05)
    if (destroyed) {
      this.state.destroyedCount += 1
      this.spawnRewards(brick.x + brick.w / 2, brick.y + brick.h / 2)
    }
    let reactorHits = 0
    if (destroyed && brick.type === 'reactor') {
      this.chainReactionDepth += 1
      reactorHits = this.detonateReactor(brick)
      this.chainReactionDepth -= 1
    }
    this.state.message = reactorHits > 0
      ? `熔芯引爆 · 波及 ${reactorHits} 个节点`
      : this.state.combo >= 10 ? `${this.state.combo} 连击 · 能量过载！` : `${this.state.combo} 连击`
    this.touchState()
    if (this.chainReactionDepth === 0 && this.state.mode === 'playing' && this.remainingBricks() === 0) {
      if (this.state.boss) this.breakBossShield()
      else if (this.state.runType === 'endless') this.advanceEndlessWave()
      else this.winLevel()
    }
    return true
  }

  advanceEndlessWave() {
    if (this.state.runType !== 'endless' || this.state.mode !== 'playing') return false
    const completedWave = this.state.wave
    this.state.wavesCleared = Math.max(this.state.wavesCleared, completedWave)
    this.state.score += 500 * completedWave
    this.state.bestScore = Math.max(this.state.bestScore, this.state.score)
    this.state.wave += 1
    this.levelConfig = getEndlessLevelConfig(this.state.wave)
    this.state.bricks = createBricks(this.levelConfig)
    this.brickMotionTime = 0
    this.state.destroyedCount = 0
    for (const ball of this.state.balls) {
      const current = Math.max(1, Math.hypot(ball.vx, ball.vy))
      const waveBaseSpeed = BALL.launchSpeed * this.levelConfig.ballSpeedMultiplier
      const speed = Math.min(BALL.maxSpeed, Math.max(current, waveBaseSpeed))
      ball.vx = ball.vx / current * speed
      ball.vy = ball.vy / current * speed
      ball.lastHitBrickId = null
      ball.brickHitCooldown = 0
    }
    this.state.message = `WAVE ${completedWave} 清除 · 磁域重构至 WAVE ${this.state.wave}`
    this.spawnBurst(GAME_WIDTH / 2, 328, '#55a7ff', 64)
    this.waves.push({ x: GAME_WIDTH / 2, y: 328, radius: 18, life: 0.78, maxLife: 0.78, color: '#55a7ff' })
    this.flash = Math.max(this.flash, 0.26)
    this.shake = Math.max(this.shake, 7)
    this.touchState(); this.publish(true)
    return true
  }

  updateCombo(dt) {
    if (this.state.combo <= 0) return
    this.state.comboTimer -= dt
    if (this.state.comboTimer <= 0) { this.state.combo = 0; this.state.comboTimer = 0; this.touchState() }
  }

  updatePowerups(dt) {
    this.uiPublishTimer += dt
    if (this.uiPublishTimer >= 0.1) {
      this.uiPublishTimer = 0
      if (this.activeEffects().length) this.touchState()
    }
    for (const type of ['expand', 'pierce', 'slow', 'laser']) {
      const effect = this.state.powerups[type]
      if (effect.remaining <= 0) continue
      effect.remaining = Math.max(0, effect.remaining - dt)
      if (effect.remaining === 0) {
        if (type === 'expand') { effect.stacks = 0; this.resizePaddle(this.basePaddleWidth()) }
        this.state.message = `${POWERUPS[type].name}已结束`
        this.touchState()
      }
    }
    this.state.laserCooldown = Math.max(0, this.state.laserCooldown - dt)
  }

  applyPowerup(type) {
    const config = POWERUPS[type]
    if (!config) return false
    if (type === 'multiball') this.activateMultiball()
    else {
      const effect = this.state.powerups[type]
      effect.remaining = config.duration
      if (type === 'expand') {
        effect.stacks = Math.min(2, effect.stacks + 1)
        this.resizePaddle(this.basePaddleWidth() * (1 + effect.stacks * 0.22))
      }
    }
    this.state.message = `${config.name} · 已激活`
    this.waves.push({ x: this.state.paddle.x + this.state.paddle.w / 2, y: this.state.paddle.y, radius: 12, life: 0.55, maxLife: 0.55, color: config.color })
    this.spawnBurst(this.state.paddle.x + this.state.paddle.w / 2, this.state.paddle.y, config.color, 30)
    this.flash = 0.22; this.shake = Math.max(this.shake, 4); this.touchState()
    return true
  }

  resizePaddle(width) {
    const center = this.state.paddle.x + this.state.paddle.w / 2
    this.state.paddle.w = width
    this.state.paddle.x = clamp(center - width / 2, 18, GAME_WIDTH - 18 - width)
  }

  basePaddleWidth() { return PADDLE.width * this.modifiers.paddleWidthMultiplier }
  comboWindow() { return 2.4 + this.modifiers.comboGraceBonus }

  activateMultiball() {
    const originals = this.state.balls.filter((ball) => !ball.stuck)
    if (!originals.length) return
    const additions = []
    for (const ball of originals) {
      for (const rotation of [-0.38, 0.38]) {
        if (this.state.balls.length + additions.length >= BALL.maxCount) break
        additions.push(this.rotatedBall(ball, rotation))
      }
    }
    this.state.balls.push(...additions)
  }

  rotatedBall(ball, angle) {
    const cos = Math.cos(angle); const sin = Math.sin(angle)
    return this.newBall(ball.x, ball.y, ball.vx * cos - ball.vy * sin, ball.vx * sin + ball.vy * cos)
  }

  spawnRewards(x, y) {
    if (this.state.drops.length >= DROP.maxDrops) return
    const roll = this.random()
    if (roll < 0.76) {
      const amount = roll < 0.12 ? 3 : roll < 0.35 ? 2 : 1
      for (let i = 0; i < amount; i += 1) this.spawnCoin(x, y, i, amount)
    }
    if (this.state.destroyedCount % 5 === 0 || this.random() < 0.12 + this.modifiers.itemDropBonus) {
      const types = Object.keys(POWERUPS)
      this.spawnItem(types[Math.floor(this.random() * types.length)], x, y)
    }
  }

  random() {
    this.randomSeed = (1664525 * this.randomSeed + 1013904223) >>> 0
    return this.randomSeed / 4294967296
  }

  spawnCoin(x, y, index = 0, amount = 1) {
    const spread = (index - (amount - 1) / 2) * 74
    this.state.drops.push({ id: this.nextDropId++, kind: 'coin', x, y, r: 8, vx: spread + (this.random() - 0.5) * 42, vy: -145 - this.random() * 70, bounces: 0, life: 7 })
  }

  spawnItem(type, x, y) {
    this.state.drops.push({ id: this.nextDropId++, kind: 'item', type, x: x - 17, y, w: 34, h: 40, vy: DROP.itemSpeed, pulse: 0 })
  }

  updateDrops(dt) {
    const paddle = this.state.paddle
    const kept = []
    for (const drop of this.state.drops) {
      if (drop.kind === 'coin') {
        drop.life -= dt
        const targetX = paddle.x + paddle.w / 2
        const targetY = paddle.y + paddle.h / 2
        const dx = targetX - drop.x; const dy = targetY - drop.y
        const distance = Math.hypot(dx, dy)
        const magnetRange = DROP.magnetRange * this.modifiers.magnetRangeMultiplier
        if (distance < magnetRange && distance > 1) {
          const pull = (1 - distance / magnetRange) * 1450
          drop.vx += dx / distance * pull * dt
          drop.vy += dy / distance * pull * dt
        } else drop.vy += DROP.coinGravity * dt
        drop.x += drop.vx * dt; drop.y += drop.vy * dt; drop.vx *= 0.995
        if (drop.y + drop.r >= paddle.y && drop.y - drop.r <= paddle.y + paddle.h && drop.x >= paddle.x && drop.x <= paddle.x + paddle.w) {
          this.collectCoin(drop); continue
        }
        if (drop.y + drop.r >= GAME_HEIGHT - 18 && drop.bounces < 1) { drop.y = GAME_HEIGHT - 18 - drop.r; drop.vy = -Math.abs(drop.vy) * 0.42; drop.bounces += 1 }
        if (drop.life > 0 && drop.y < GAME_HEIGHT + 30) kept.push(drop)
      } else {
        drop.pulse += dt
        drop.y += drop.vy * dt
        if (rectCollision(drop, paddle)) { this.applyPowerup(drop.type); continue }
        if (drop.y < GAME_HEIGHT + 45) kept.push(drop)
      }
    }
    if (kept.length !== this.state.drops.length) this.touchState()
    this.state.drops = kept
  }

  collectCoin(drop) {
    this.coinBonusCarry += this.modifiers.coinBonusRate
    const bonus = Math.floor(this.coinBonusCarry + 1e-9)
    const amount = 1 + bonus
    this.coinBonusCarry = Math.max(0, this.coinBonusCarry - bonus)
    this.state.coins += amount
    this.floaters.push({ x: drop.x, y: paddleTop(this.state.paddle), text: `+${amount} ◈`, life: 0.8, color: COLORS.gold })
    this.spawnBurst(drop.x, drop.y, COLORS.gold, 10)
    this.state.message = `晶币 +${amount} · 本地持有 ${this.state.coins}`
    this.touchState()
  }

  updateProjectiles(dt) {
    const kept = []
    for (const shot of this.projectiles) {
      if (this.state.mode !== 'playing') break
      shot.y += shot.vy * dt
      let hit = false
      for (const brick of this.state.bricks) {
        if (brick.hp > 0 && rectCollision(shot, brick)) { this.damageBrick(brick, shot.x + shot.w / 2, shot.y, 'laser'); hit = true; break }
      }
      const boss = this.state.boss
      if (!hit && boss && !boss.defeated) {
        const module = boss.modules.find((entry) => !entry.destroyed && rectCollision(shot, entry))
        if (module) {
          this.damageBossModule(module, shot.x + shot.w / 2, shot.y, 'laser')
          hit = true
        }
      }
      if (!hit && boss && !boss.defeated && rectCollision(shot, boss)) {
        if (!boss.shieldActive) this.damageBoss(shot.x + shot.w / 2, shot.y, 'laser')
        else this.spawnImpact(shot.x, shot.y, COLORS.cyan, 5)
        hit = true
      }
      if (!hit && shot.y + shot.h > 112) kept.push(shot)
    }
    this.projectiles = this.state.mode === 'playing' ? kept : []
  }

  loseBall() {
    this.state.combo = 0; this.state.comboTimer = 0
    this.state.drops = []; this.projectiles = []; this.hazards = []
    for (const type of ['expand', 'pierce', 'slow', 'laser']) {
      this.state.powerups[type].remaining = 0
      if (type === 'expand') this.state.powerups[type].stacks = 0
    }
    this.resizePaddle(this.basePaddleWidth())
    this.trail.length = 0; this.shake = 6; this.touchState()
    if (this.state.shieldCharges > 0) {
      this.state.shieldCharges -= 1
      this.state.mode = 'ready'
      this.state.message = `能量护盾抵挡掉球 · 剩余 ${this.state.shieldCharges}`
      this.spawnAttachedBall()
      this.publish(true)
      return
    }
    this.state.lives -= 1
    if (this.state.lives <= 0) {
      this.state.balls = []; this.state.mode = 'lost'; this.state.message = '光能耗尽 · 本局收益已保存'
      this.state.stars = 0
      this.state.starBreakdown = { clear: false, survivor: false, mastery: false }
    } else {
      this.state.mode = 'ready'; this.state.message = `能量重置 · 剩余 ${this.state.lives}`; this.spawnAttachedBall()
    }
    this.publish(true)
  }

  winLevel() {
    if (this.state.mode === 'won') return
    const starBreakdown = {
      clear: true,
      survivor: this.state.lives >= 2,
      mastery: this.state.score >= this.levelConfig.targetScore || this.state.maxCombo >= this.levelConfig.targetCombo,
    }
    this.state.stars = Object.values(starBreakdown).filter(Boolean).length
    this.state.starBreakdown = starBreakdown
    this.state.clearBonus = Math.round(this.levelConfig.clearBonus * (1 + this.modifiers.coinBonusRate))
    this.state.coins += this.state.clearBonus
    this.state.balls = []
    this.state.mode = 'won'; this.state.message = `任务完成 · ${this.state.stars} 星评价`
    this.state.combo = 0; this.state.comboTimer = 0
    this.state.drops = []; this.projectiles = []; this.hazards = []
    for (const type of ['expand', 'pierce', 'slow', 'laser']) {
      this.state.powerups[type].remaining = 0
      if (type === 'expand') this.state.powerups[type].stacks = 0
    }
    this.resizePaddle(this.basePaddleWidth())
    this.state.bestScore = Math.max(this.state.bestScore, this.state.score)
    this.shake = 8; this.flash = 0.35
    this.spawnBurst(GAME_WIDTH / 2, 400, COLORS.gold, 90)
    this.touchState(); this.publish(true)
  }

  remainingBricks() { return this.state.bricks.filter((brick) => brick.hp > 0).length }
  spawnImpact(x, y, color, count) { this.spawnBurst(x, y, color, count) }
  spawnBurst(x, y, color, count) {
    const actualCount = Math.max(2, Math.ceil(count * this.effectProfile.particleMultiplier))
    for (let i = 0; i < actualCount; i += 1) {
      const angle = TAU * i / Math.max(1, actualCount) + Math.random() * 0.6
      const speed = 45 + Math.random() * 180
      const particle = this.particlePool.pop() || {}
      Object.assign(particle, { x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: 0.32 + Math.random() * 0.38, maxLife: 0.7, color, size: 2 + Math.random() * 3.5 })
      this.particles.push(particle)
    }
    const particleLimit = this.effectProfile.particleLimit
    if (this.particles.length > particleLimit) {
      const excess = this.particles.splice(0, this.particles.length - particleLimit)
      this.particlePool.push(...excess)
    }
  }

  updateEffects(dt) {
    for (const brick of this.state.bricks) brick.flash = Math.max(0, brick.flash - dt)
    for (const item of this.trail) item.life -= dt
    this.trail = this.trail.filter((item) => item.life > 0)
    if (this.trail.length > this.effectProfile.trailLimit) this.trail.splice(0, this.trail.length - this.effectProfile.trailLimit)
    const alive = []
    for (const particle of this.particles) {
      particle.life -= dt
      if (particle.life > 0) {
        particle.x += particle.vx * dt; particle.y += particle.vy * dt
        particle.vy += 155 * dt; particle.vx *= 0.985; alive.push(particle)
      } else this.particlePool.push(particle)
    }
    this.particles = alive
    for (const wave of this.waves) { wave.life -= dt; wave.radius += 190 * dt }
    this.waves = this.waves.filter((wave) => wave.life > 0)
    if (this.waves.length > this.effectProfile.waveLimit) this.waves.splice(0, this.waves.length - this.effectProfile.waveLimit)
    for (const floater of this.floaters) { floater.life -= dt; floater.y -= 42 * dt }
    this.floaters = this.floaters.filter((floater) => floater.life > 0)
    if (this.floaters.length > this.effectProfile.floaterLimit) this.floaters.splice(0, this.floaters.length - this.effectProfile.floaterLimit)
    this.shake = Math.max(0, this.shake - 18 * dt)
    this.flash = Math.max(0, this.flash - 1.8 * dt)
    if (this.reducedFlash) this.flash = Math.min(this.flash, 0.12)
  }

  touchState() { this.stateVersion += 1 }
  publish(force = false) {
    if (!force && this.lastPublishedVersion === this.stateVersion) return
    this.lastPublishedVersion = this.stateVersion
    this.onStateChange?.(this.getSummary())
  }

  activeEffects() {
    return Object.entries(this.state.powerups).filter(([, value]) => value.remaining > 0).map(([type, value]) => ({ type, name: POWERUPS[type].name, short: POWERUPS[type].short, color: POWERUPS[type].color, remaining: Number(value.remaining.toFixed(1)), stacks: value.stacks || 0 }))
  }

  bossSummary() {
    const boss = this.state.boss
    if (!boss) return null
    return {
      codename: boss.codename,
      kind: boss.kind,
      hp: boss.hp,
      maxHp: boss.maxHp,
      phase: boss.phase,
      maxPhases: boss.maxPhases,
      shieldActive: boss.shieldActive,
      shieldNodes: boss.shieldActive ? this.remainingBricks() : 0,
      x: +boss.x.toFixed(1),
      y: boss.y,
      width: boss.w,
      defeated: boss.defeated,
      modules: boss.modules.map((module) => ({
        id: module.id,
        side: module.side,
        hp: module.hp,
        maxHp: module.maxHp,
        destroyed: module.destroyed,
        x: +module.x.toFixed(1),
        y: module.y,
      })),
      modulesAlive: boss.modules.filter((module) => !module.destroyed).length,
      hazards: this.hazards.length,
      barrage: Boolean(this.levelConfig.boss?.barrage),
    }
  }

  getSummary() {
    return {
      mode: this.state.mode, runId: this.state.runId, runType: this.state.runType,
      level: this.state.level, levelName: this.state.levelName,
      wave: this.state.wave, wavesCleared: this.state.wavesCleared,
      lives: this.state.lives, maxLives: this.state.maxLives, shieldCharges: this.state.shieldCharges,
      score: this.state.score, bestScore: this.state.bestScore,
      coins: this.state.coins,
      runCoinsEarned: Math.max(0, this.state.coins - this.state.runStartCoins),
      clearBonus: this.state.clearBonus,
      stars: this.state.stars,
      starBreakdown: { ...this.state.starBreakdown },
      combo: this.state.combo, maxCombo: this.state.maxCombo,
      ballCount: this.state.balls.length, dropCount: this.state.drops.length,
      activeEffects: this.activeEffects(), bricksRemaining: this.remainingBricks(),
      totalBricks: this.state.bricks.length, message: this.state.message,
      resumeCountdown: Number(this.state.resumeCountdown.toFixed(1)),
      levelMeta: {
        chapter: this.levelConfig.chapter, accent: this.levelConfig.accent, isBoss: this.levelConfig.isBoss,
        targetScore: this.levelConfig.targetScore, targetCombo: this.levelConfig.targetCombo,
      },
      boss: this.bossSummary(), hazardCount: this.hazards.length,
      runModifiers: { ...this.modifiers },
    }
  }

  getTextState() {
    return JSON.stringify({
      coordinateSystem: `canvas ${GAME_WIDTH}x${GAME_HEIGHT}; origin top-left; x right; y down`,
      mode: this.state.mode, runId: this.state.runId, runType: this.state.runType,
      wave: this.state.wave, wavesCleared: this.state.wavesCleared,
      level: {
        id: this.state.level,
        name: this.state.levelName,
        chapter: this.levelConfig.chapter,
        isBoss: this.levelConfig.isBoss,
        targetScore: this.levelConfig.targetScore,
        targetCombo: this.levelConfig.targetCombo,
      },
      lives: this.state.lives, maxLives: this.state.maxLives, shieldCharges: this.state.shieldCharges,
      score: this.state.score, coins: this.state.coins,
      runCoinsEarned: Math.max(0, this.state.coins - this.state.runStartCoins),
      settlement: {
        stars: this.state.stars,
        starBreakdown: this.state.starBreakdown,
        clearBonus: this.state.clearBonus,
      },
      combo: this.state.combo, maxCombo: this.state.maxCombo, message: this.state.message,
      resumeCountdown: Number(this.state.resumeCountdown.toFixed(1)),
      paddle: { x: +this.state.paddle.x.toFixed(1), y: this.state.paddle.y, width: +this.state.paddle.w.toFixed(1), velocityX: +this.state.paddle.velocityX.toFixed(1), guardTimer: +(this.state.paddle.guardTimer || 0).toFixed(2) },
      balls: this.state.balls.map((ball) => ({ id: ball.id, x: +ball.x.toFixed(1), y: +ball.y.toFixed(1), vx: +ball.vx.toFixed(1), vy: +ball.vy.toFixed(1), radius: ball.r, stuck: ball.stuck, stallTimer: +ball.stallTimer.toFixed(1) })),
      bricks: this.state.bricks.filter((brick) => brick.hp > 0).map((brick) => ({ id: brick.id, type: brick.type, x: +brick.x.toFixed(1), y: brick.y, width: +brick.w.toFixed(1), height: brick.h, hp: brick.hp, maxHp: brick.maxHp, moving: brick.moving, velocityX: +brick.velocityX.toFixed(1) })),
      drops: this.state.drops.map((drop) => ({ kind: drop.kind, type: drop.type || 'coin', x: +drop.x.toFixed(1), y: +drop.y.toFixed(1) })),
      projectiles: this.projectiles.length,
      hazards: this.hazards.map((hazard) => ({ kind: hazard.kind || 'magnet', x: +hazard.x.toFixed(1), y: +hazard.y.toFixed(1), vx: +hazard.vx.toFixed(1), vy: hazard.vy })),
      activeEffects: this.activeEffects(),
      bricksRemaining: this.remainingBricks(), totalBricks: this.state.bricks.length,
      effects: {
        quality: this.effectQuality,
        particleBudget: this.effectProfile.particleLimit,
        particles: this.particles.length,
        pool: this.particlePool.length,
        waves: this.waves.length,
        trailPoints: this.trail.length,
        shake: this.screenShake ? +this.shake.toFixed(1) : 0,
        reducedFlash: this.reducedFlash,
      },
      boss: this.bossSummary(),
      runModifiers: { ...this.modifiers },
      availableActions: this.availableActions(),
    })
  }

  availableActions() {
    if (this.state.mode === 'menu') return ['open campaign', 'F fullscreen']
    if (this.state.mode === 'briefing') return ['start level', 'return to campaign', 'F fullscreen']
    if (['won', 'lost'].includes(this.state.mode)) return ['retry level', 'return to campaign', 'F fullscreen']
    if (this.state.mode === 'ready') return ['move paddle', 'launch with click/Space', 'F fullscreen']
    if (this.state.mode === 'paused') return ['resume with 3-second countdown', 'F fullscreen']
    if (this.state.mode === 'countdown') return ['wait for countdown', 'cancel resume with click/Space/P', 'F fullscreen']
    const actions = ['move paddle', 'pause with Esc/P', 'F fullscreen']
    if (this.state.powerups.laser.remaining > 0) actions.push('fire laser with click/Space')
    return actions
  }

  render() {
    const ctx = this.ctx
    const canShake = this.screenShake && ['ready', 'playing'].includes(this.state.mode)
    const sx = canShake && this.shake ? (Math.random() - 0.5) * this.shake : 0
    const sy = canShake && this.shake ? (Math.random() - 0.5) * this.shake : 0
    ctx.save(); ctx.clearRect(0, 0, GAME_WIDTH, GAME_HEIGHT); ctx.translate(sx, sy)
    this.drawBackground(ctx); this.drawHud(ctx); this.drawBoss(ctx); this.drawBricks(ctx); this.drawTrail(ctx)
    this.drawDrops(ctx); this.drawProjectiles(ctx); this.drawHazards(ctx); this.drawPaddle(ctx); this.drawBalls(ctx)
    this.drawEffects(ctx); this.drawModeOverlay(ctx)
    if (this.flash > 0) {
      const flashAlpha = this.reducedFlash ? Math.min(0.12, this.flash) : this.flash
      ctx.fillStyle = `rgba(255,255,255,${flashAlpha})`; ctx.fillRect(-12, -12, GAME_WIDTH + 24, GAME_HEIGHT + 24)
    }
    ctx.restore()
  }

  drawBackground(ctx) {
    const gradient = ctx.createLinearGradient(0, 0, 0, GAME_HEIGHT)
    gradient.addColorStop(0, COLORS.backgroundTop); gradient.addColorStop(1, COLORS.backgroundBottom)
    ctx.fillStyle = gradient; ctx.fillRect(-12, -12, GAME_WIDTH + 24, GAME_HEIGHT + 24)
    ctx.save(); ctx.strokeStyle = this.levelConfig.accent; ctx.globalAlpha = .055; ctx.lineWidth = 1
    for (let x = 14; x < GAME_WIDTH; x += 44) { ctx.beginPath(); ctx.moveTo(x, 108); ctx.lineTo(x, GAME_HEIGHT); ctx.stroke() }
    for (let y = 112; y < GAME_HEIGHT; y += 44) { ctx.beginPath(); ctx.moveTo(14, y); ctx.lineTo(GAME_WIDTH - 14, y); ctx.stroke() }
    ctx.globalAlpha = .28; ctx.lineWidth = 2; ctx.strokeRect(14, 112, GAME_WIDTH - 28, GAME_HEIGHT - 128); ctx.restore()
  }

  drawHud(ctx) {
    ctx.fillStyle = 'rgba(8,20,31,.94)'; ctx.fillRect(0, 0, GAME_WIDTH, 112)
    ctx.textAlign = 'left'; ctx.fillStyle = COLORS.cyan; ctx.font = '800 14px system-ui'; ctx.fillText('NEON BREAKER', 24, 27)
    ctx.fillStyle = COLORS.text; ctx.font = '800 24px system-ui'; ctx.fillText(String(this.state.score).padStart(6, '0'), 24, 62)
    ctx.fillStyle = COLORS.muted; ctx.font = '600 11px system-ui'; ctx.fillText(this.state.runType === 'endless'
      ? `WAVE ${String(this.state.wave).padStart(2, '0')} · ${this.remainingBricks()} BRICKS`
      : `LV ${String(this.state.level).padStart(2, '0')} · ${this.remainingBricks()} BRICKS`, 24, 88)
    if (this.state.combo > 1) {
      ctx.textAlign = 'center'; ctx.fillStyle = this.state.combo >= 10 ? COLORS.gold : COLORS.magenta
      ctx.font = `900 ${Math.min(26, 17 + this.state.combo / 3)}px system-ui`; ctx.fillText(`${this.state.combo} COMBO`, GAME_WIDTH / 2, 50)
      ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.fillRect(GAME_WIDTH / 2 - 58, 64, 116, 3)
      ctx.fillStyle = COLORS.magenta; ctx.fillRect(GAME_WIDTH / 2 - 58, 64, 116 * clamp(this.state.comboTimer / this.comboWindow(), 0, 1), 3)
    }
    ctx.textAlign = 'right'; ctx.fillStyle = COLORS.gold; ctx.font = '800 13px system-ui'; ctx.fillText(`◈ ${this.state.coins}`, GAME_WIDTH - 24, 28)
    ctx.fillStyle = COLORS.muted; ctx.font = '600 11px system-ui'; ctx.fillText(`${this.state.balls.length} BALL`, GAME_WIDTH - 24, 88)
    for (let i = 0; i < this.state.maxLives; i += 1) {
      const x = GAME_WIDTH - 30 - i * 27
      ctx.save(); ctx.shadowColor = i < this.state.lives ? COLORS.magenta : 'transparent'; ctx.shadowBlur = 12
      ctx.fillStyle = i < this.state.lives ? COLORS.magenta : 'rgba(117,148,157,.18)'; ctx.beginPath(); ctx.arc(x, 56, 8, 0, TAU); ctx.fill(); ctx.restore()
    }
    const boss = this.state.boss
    if (boss && !boss.defeated) {
      const barX = GAME_WIDTH / 2 - 78
      const hpRatio = boss.hp / boss.maxHp
      ctx.textAlign = 'center'; ctx.fillStyle = boss.shieldActive ? COLORS.cyan : COLORS.gold
      const moduleSignal = boss.modules.length ? ` · M${boss.modules.filter((module) => !module.destroyed).length}` : ''
      ctx.font = '800 9px ui-monospace, monospace'; ctx.fillText(`BOSS P${boss.phase}/${boss.maxPhases} · ${boss.shieldActive ? `SHIELD ${this.remainingBricks()}` : `CORE ${boss.hp}`}${moduleSignal}`, GAME_WIDTH / 2, 82)
      ctx.fillStyle = 'rgba(255,255,255,.1)'; ctx.fillRect(barX, 91, 156, 4)
      const bar = ctx.createLinearGradient(barX, 0, barX + 156, 0)
      bar.addColorStop(0, COLORS.magenta); bar.addColorStop(1, COLORS.gold)
      ctx.fillStyle = bar; ctx.fillRect(barX, 91, 156 * hpRatio, 4)
    }
  }

  drawBoss(ctx) {
    const boss = this.state.boss
    if (!boss || boss.defeated || ['menu', 'briefing'].includes(this.state.mode)) return
    const cx = boss.x + boss.w / 2
    const cy = boss.y + boss.h / 2
    ctx.save()
    if (boss.pulse > 0) {
      ctx.globalAlpha = boss.pulse * 0.34
      ctx.strokeStyle = this.levelConfig.accent
      ctx.lineWidth = 3
      ctx.shadowColor = this.levelConfig.accent
      ctx.shadowBlur = 24
      ctx.beginPath(); ctx.ellipse(cx, cy, boss.w * (0.58 + (1 - boss.pulse) * 0.18), 40 + (1 - boss.pulse) * 20, 0, 0, TAU); ctx.stroke()
      ctx.globalAlpha = 1
    }
    for (const module of boss.modules) {
      const moduleColor = boss.kind === 'magnetron' ? '#55a7ff' : this.levelConfig.accent
      ctx.save()
      ctx.globalAlpha = module.destroyed ? .22 : 1
      ctx.shadowColor = module.destroyed ? COLORS.danger : moduleColor
      ctx.shadowBlur = module.destroyed ? 5 : 20
      ctx.fillStyle = module.flash > 0 ? '#ffffff' : module.destroyed ? 'rgba(62,32,48,.82)' : 'rgba(13,35,58,.98)'
      ctx.strokeStyle = module.destroyed ? COLORS.danger : moduleColor
      ctx.lineWidth = 2
      ctx.beginPath(); ctx.roundRect(module.x, module.y, module.w, module.h, 8); ctx.fill(); ctx.stroke()
      ctx.fillStyle = module.destroyed ? '#50303c' : moduleColor
      ctx.beginPath(); ctx.arc(module.x + module.w / 2, module.y + 13, 6, 0, TAU); ctx.fill()
      ctx.fillStyle = 'rgba(255,255,255,.1)'; ctx.fillRect(module.x + 5, module.y + module.h - 9, module.w - 10, 3)
      ctx.fillStyle = module.destroyed ? COLORS.danger : moduleColor
      ctx.fillRect(module.x + 5, module.y + module.h - 9, (module.w - 10) * module.hp / module.maxHp, 3)
      ctx.restore()
    }
    ctx.shadowColor = boss.shieldActive ? COLORS.cyan : this.levelConfig.accent
    ctx.shadowBlur = boss.flash > 0 ? 38 : 22
    ctx.fillStyle = boss.flash > 0 ? '#ffffff' : 'rgba(13, 29, 48, .98)'
    ctx.strokeStyle = boss.shieldActive ? COLORS.cyan : this.levelConfig.accent
    ctx.lineWidth = 2
    ctx.beginPath(); ctx.roundRect(boss.x, boss.y, boss.w, boss.h, 16); ctx.fill(); ctx.stroke()
    ctx.fillStyle = boss.kind === 'furnace' ? 'rgba(255,123,84,.3)' : 'rgba(185,128,255,.28)'
    ctx.beginPath(); ctx.moveTo(boss.x + 18, cy); ctx.lineTo(boss.x - 18, boss.y + 8); ctx.lineTo(boss.x - 7, boss.y + boss.h - 5); ctx.closePath(); ctx.fill()
    ctx.beginPath(); ctx.moveTo(boss.x + boss.w - 18, cy); ctx.lineTo(boss.x + boss.w + 18, boss.y + 8); ctx.lineTo(boss.x + boss.w + 7, boss.y + boss.h - 5); ctx.closePath(); ctx.fill()
    const core = ctx.createRadialGradient(cx - 5, cy - 6, 2, cx, cy, 22)
    const coreColor = boss.kind === 'furnace' ? '#ff7b54' : boss.kind === 'zenith' ? '#b980ff' : COLORS.gold
    const edgeColor = boss.kind === 'furnace' ? '#8f251d' : '#7135b9'
    core.addColorStop(0, '#fff'); core.addColorStop(.28, boss.shieldActive ? COLORS.cyan : coreColor); core.addColorStop(1, edgeColor)
    ctx.fillStyle = core
    ctx.beginPath(); ctx.moveTo(cx, cy - 20); ctx.lineTo(cx + 20, cy); ctx.lineTo(cx, cy + 20); ctx.lineTo(cx - 20, cy); ctx.closePath(); ctx.fill()
    if (boss.shieldActive) {
      ctx.globalAlpha = .58
      ctx.strokeStyle = COLORS.cyan
      ctx.lineWidth = 2
      ctx.beginPath(); ctx.ellipse(cx, cy, boss.w / 2 + 12, boss.h / 2 + 12, 0, 0, TAU); ctx.stroke()
      ctx.globalAlpha = 1
    }
    ctx.textAlign = 'center'; ctx.fillStyle = '#effffc'; ctx.font = '900 8px ui-monospace, monospace'
    ctx.fillText(`${boss.codename} · P${boss.phase}`, cx, boss.y - 9)
    ctx.restore()
  }

  drawHazards(ctx) {
    for (const hazard of this.hazards) {
      const cx = hazard.x + hazard.w / 2
      const cy = hazard.y + hazard.h / 2
      ctx.save()
      ctx.translate(cx, cy)
      ctx.rotate(Math.sin(hazard.pulse) * (hazard.kind === 'ember' ? .28 : .16))
      const color = hazard.color || '#55a7ff'
      const pale = hazard.kind === 'ember' ? '#fff1d6' : hazard.kind === 'zenith' ? '#f1e6ff' : '#d8ecff'
      ctx.shadowColor = color; ctx.shadowBlur = 22
      const gradient = ctx.createLinearGradient(0, -12, 0, 12)
      gradient.addColorStop(0, pale); gradient.addColorStop(.35, color); gradient.addColorStop(1, hazard.kind === 'ember' ? '#d92f45' : '#704dff')
      ctx.fillStyle = gradient
      ctx.beginPath(); ctx.moveTo(0, -13); ctx.lineTo(8, 0); ctx.lineTo(0, 13); ctx.lineTo(-8, 0); ctx.closePath(); ctx.fill()
      ctx.strokeStyle = 'rgba(218,239,255,.8)'; ctx.lineWidth = 1; ctx.stroke()
      ctx.restore()
    }
  }

  drawBricks(ctx) {
    for (const brick of this.state.bricks) {
      if (brick.hp <= 0) continue
      const reactor = brick.type === 'reactor'
      const reinforced = brick.maxHp > 1
      ctx.save(); ctx.shadowColor = reactor ? '#ff7b54' : reinforced ? COLORS.purple : this.levelConfig.accent; ctx.shadowBlur = this.effectProfile.glow ? (brick.flash > 0 ? 26 : reactor ? 18 : 10) : 0
      ctx.fillStyle = brick.flash > 0 ? '#fff' : reactor ? '#ff7b54' : reinforced ? COLORS.purple : this.levelConfig.accent
      ctx.beginPath(); ctx.roundRect(brick.x, brick.y, brick.w, brick.h, 7); ctx.fill()
      ctx.strokeStyle = reactor ? '#ffe2a8' : reinforced ? '#e0c5ff' : 'rgba(211,255,248,.68)'; ctx.lineWidth = reactor || reinforced ? 2 : 1; ctx.stroke()
      if (reactor) {
        const cx = brick.x + brick.w / 2
        const cy = brick.y + brick.h / 2
        ctx.shadowBlur = this.effectProfile.glow ? 12 : 0; ctx.shadowColor = COLORS.gold; ctx.fillStyle = '#fff2c7'
        ctx.beginPath(); ctx.moveTo(cx, cy - 8); ctx.lineTo(cx + 8, cy); ctx.lineTo(cx, cy + 8); ctx.lineTo(cx - 8, cy); ctx.closePath(); ctx.fill()
        ctx.strokeStyle = 'rgba(98,20,24,.72)'; ctx.lineWidth = 1
        ctx.beginPath(); ctx.moveTo(brick.x + 5, cy); ctx.lineTo(cx - 9, cy); ctx.moveTo(cx + 9, cy); ctx.lineTo(brick.x + brick.w - 5, cy); ctx.stroke()
      } else if (reinforced) {
        ctx.shadowBlur = 0; ctx.fillStyle = 'rgba(15,10,35,.7)'; ctx.fillRect(brick.x + 9, brick.y + brick.h / 2 - 1, brick.w - 18, 2)
        for (let i = 0; i < brick.maxHp; i += 1) { ctx.fillStyle = i < brick.hp ? COLORS.gold : 'rgba(255,255,255,.16)'; ctx.beginPath(); ctx.arc(brick.x + brick.w / 2 + (i - (brick.maxHp - 1) / 2) * 10, brick.y + brick.h / 2, 3, 0, TAU); ctx.fill() }
      }
      if (brick.moving) {
        ctx.shadowBlur = 0; ctx.fillStyle = 'rgba(218,239,255,.78)'
        ctx.beginPath(); ctx.moveTo(brick.x + 7, brick.y + 5); ctx.lineTo(brick.x + 12, brick.y + 5); ctx.lineTo(brick.x + 9.5, brick.y + 8); ctx.closePath(); ctx.fill()
        ctx.beginPath(); ctx.moveTo(brick.x + brick.w - 7, brick.y + 5); ctx.lineTo(brick.x + brick.w - 12, brick.y + 5); ctx.lineTo(brick.x + brick.w - 9.5, brick.y + 8); ctx.closePath(); ctx.fill()
      }
      ctx.restore()
    }
  }

  drawTrail(ctx) {
    for (const point of this.trail) {
      const alpha = clamp(point.life / .24, 0, 1)
      ctx.fillStyle = this.state.powerups.pierce.remaining > 0 ? `rgba(255,209,102,${alpha * .42})` : `rgba(85,244,221,${alpha * .3})`
      ctx.beginPath(); ctx.arc(point.x, point.y, 2 + alpha * 5, 0, TAU); ctx.fill()
    }
  }

  drawPaddle(ctx) {
    const paddle = this.state.paddle
    const guardActive = paddle.guardTimer > 0
    ctx.save(); ctx.shadowColor = guardActive ? COLORS.gold : this.state.powerups.laser.remaining > 0 ? POWERUPS.laser.color : COLORS.cyan; ctx.shadowBlur = this.effectProfile.glow ? (guardActive ? 34 : 25) : 6
    const gradient = ctx.createLinearGradient(paddle.x, 0, paddle.x + paddle.w, 0)
    gradient.addColorStop(0, guardActive ? '#ff9b54' : '#1bb9b0'); gradient.addColorStop(.48, '#fff'); gradient.addColorStop(1, guardActive ? '#ffd166' : '#65ead6')
    ctx.fillStyle = gradient; ctx.beginPath(); ctx.roundRect(paddle.x, paddle.y, paddle.w, paddle.h, 9); ctx.fill()
    if (guardActive) {
      ctx.strokeStyle = 'rgba(255,226,151,.85)'; ctx.lineWidth = 2
      ctx.beginPath(); ctx.roundRect(paddle.x - 3, paddle.y - 3, paddle.w + 6, paddle.h + 6, 12); ctx.stroke()
    }
    if (this.state.powerups.laser.remaining > 0) {
      ctx.fillStyle = POWERUPS.laser.color
      for (const offset of [15, paddle.w - 21]) { ctx.beginPath(); ctx.roundRect(paddle.x + offset, paddle.y - 9, 7, 13, 3); ctx.fill() }
    }
    ctx.restore()
  }

  drawBalls(ctx) {
    for (const ball of this.state.balls) {
      const color = this.state.powerups.pierce.remaining > 0 ? COLORS.gold : COLORS.cyan
      ctx.save(); ctx.shadowColor = color; ctx.shadowBlur = this.effectProfile.glow ? (this.state.powerups.pierce.remaining > 0 ? 34 : 26) : 6
      const gradient = ctx.createRadialGradient(ball.x - 3, ball.y - 3, 1, ball.x, ball.y, ball.r)
      gradient.addColorStop(0, '#fff'); gradient.addColorStop(.45, '#e9fff7'); gradient.addColorStop(1, color)
      ctx.fillStyle = gradient; ctx.beginPath(); ctx.arc(ball.x, ball.y, ball.r, 0, TAU); ctx.fill(); ctx.restore()
    }
  }

  drawDrops(ctx) {
    for (const drop of this.state.drops) {
      if (drop.kind === 'coin') {
        ctx.save(); ctx.shadowColor = COLORS.gold; ctx.shadowBlur = this.effectProfile.glow ? 18 : 4; ctx.fillStyle = COLORS.gold
        ctx.beginPath(); ctx.arc(drop.x, drop.y, drop.r, 0, TAU); ctx.fill(); ctx.strokeStyle = '#fff4bd'; ctx.lineWidth = 2; ctx.stroke()
        ctx.fillStyle = '#7f5811'; ctx.font = '900 10px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('◈', drop.x, drop.y); ctx.restore()
      } else {
        const config = POWERUPS[drop.type]
        ctx.save(); ctx.shadowColor = config.color; ctx.shadowBlur = this.effectProfile.glow ? 18 + Math.sin(drop.pulse * 8) * 5 : 4
        ctx.fillStyle = 'rgba(8,20,31,.92)'; ctx.strokeStyle = config.color; ctx.lineWidth = 2
        ctx.beginPath(); ctx.roundRect(drop.x, drop.y, drop.w, drop.h, 12); ctx.fill(); ctx.stroke()
        ctx.fillStyle = config.color; ctx.font = '900 17px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(config.short, drop.x + drop.w / 2, drop.y + drop.h / 2 + 1)
        ctx.restore()
      }
    }
  }

  drawProjectiles(ctx) {
    for (const shot of this.projectiles) {
      ctx.save(); ctx.shadowColor = shot.color; ctx.shadowBlur = this.effectProfile.glow ? 18 : 4; ctx.fillStyle = '#fff'; ctx.fillRect(shot.x, shot.y, shot.w, shot.h); ctx.fillStyle = shot.color; ctx.fillRect(shot.x - 2, shot.y + 6, shot.w + 4, shot.h - 4); ctx.restore()
    }
  }

  drawEffects(ctx) {
    for (const wave of this.waves) {
      ctx.save(); ctx.globalAlpha = clamp(wave.life / wave.maxLife, 0, 1); ctx.strokeStyle = wave.color; ctx.lineWidth = 3; ctx.shadowColor = wave.color; ctx.shadowBlur = this.effectProfile.glow ? 12 : 0
      ctx.beginPath(); ctx.arc(wave.x, wave.y, wave.radius, 0, TAU); ctx.stroke(); ctx.restore()
    }
    for (const particle of this.particles) {
      ctx.save(); ctx.globalAlpha = clamp(particle.life / particle.maxLife, 0, 1); ctx.fillStyle = particle.color; ctx.shadowColor = particle.color; ctx.shadowBlur = this.effectProfile.glow ? 8 : 0; ctx.fillRect(particle.x, particle.y, particle.size, particle.size); ctx.restore()
    }
    for (const floater of this.floaters) {
      ctx.save(); ctx.globalAlpha = clamp(floater.life / .72, 0, 1); ctx.fillStyle = floater.color; ctx.shadowColor = floater.color; ctx.shadowBlur = this.effectProfile.glow ? 8 : 0; ctx.font = '900 14px system-ui'; ctx.textAlign = 'center'; ctx.fillText(floater.text, floater.x, floater.y); ctx.restore()
    }
  }

  drawModeOverlay(ctx) {
    const mode = this.state.mode
    if (mode === 'playing') return
    if (mode === 'ready') {
      ctx.fillStyle = 'rgba(6,14,24,.74)'; ctx.beginPath(); ctx.roundRect(72, 686, GAME_WIDTH - 144, 84, 16); ctx.fill(); ctx.strokeStyle = 'rgba(85,244,221,.35)'; ctx.stroke()
      ctx.textAlign = 'center'; ctx.fillStyle = COLORS.text; ctx.font = '800 19px system-ui'; ctx.fillText('点击 / SPACE 发球', GAME_WIDTH / 2, 720)
      ctx.fillStyle = COLORS.muted; ctx.font = '500 13px system-ui'; ctx.fillText('能量已重置，准备下一轮', GAME_WIDTH / 2, 747); return
    }
    ctx.fillStyle = 'rgba(4,9,18,.82)'; ctx.fillRect(14, 112, GAME_WIDTH - 28, GAME_HEIGHT - 128); ctx.textAlign = 'center'
    if (mode === 'menu') {
      ctx.fillStyle = COLORS.cyan; ctx.font = '800 14px system-ui'; ctx.fillText('CAMPAIGN / 20 MISSIONS', GAME_WIDTH / 2, 252)
      ctx.fillStyle = COLORS.text; ctx.font = '900 48px system-ui'; ctx.fillText('NEON', GAME_WIDTH / 2, 326); ctx.fillText('BREAKER', GAME_WIDTH / 2, 379)
      ctx.fillStyle = COLORS.muted; ctx.font = '600 15px system-ui'; ctx.fillText('原创霓虹街机 · 本地单机存档', GAME_WIDTH / 2, 423)
      ctx.strokeStyle = 'rgba(85,244,221,.18)'; ctx.beginPath(); ctx.moveTo(142, 472); ctx.lineTo(GAME_WIDTH - 142, 472); ctx.stroke()
      ctx.fillStyle = COLORS.gold; ctx.font = '800 13px system-ui'; ctx.fillText(`◈ ${this.state.coins} 晶币已同步`, GAME_WIDTH / 2, 507)
      this.drawOverlayButton(ctx, '进入战役', 632)
      ctx.fillStyle = COLORS.muted; ctx.font = '500 12px system-ui'; ctx.fillText('点击战场或按 ENTER', GAME_WIDTH / 2, 718)
    } else if (mode === 'briefing') {
      if (this.state.runType === 'endless') { this.drawEndlessBriefing(ctx); return }
      ctx.fillStyle = this.levelConfig.accent; ctx.font = '900 13px system-ui'; ctx.fillText(`${this.levelConfig.chapterCodename} / MISSION BRIEFING`, GAME_WIDTH / 2, 208)
      ctx.fillStyle = COLORS.text; ctx.font = '900 34px system-ui'; ctx.fillText(`${String(this.state.level).padStart(2, '0')} · ${this.state.levelName}`, GAME_WIDTH / 2, 260)
      const briefingSubtitle = this.levelConfig.boss?.barrage
        ? '高速横移挡板可招架弹幕并反射模块脉冲'
        : this.levelConfig.isBoss ? '守关核心预备战 · 高额清关奖励' : this.levelConfig.chapter
      ctx.fillStyle = this.levelConfig.boss?.barrage ? COLORS.gold : COLORS.muted
      ctx.font = '500 12px system-ui'; ctx.fillText(briefingSubtitle, GAME_WIDTH / 2, 292)

      const criteria = [
        ['Ⅰ', '完成关卡', this.levelConfig.isBoss ? (this.levelConfig.boss?.objective || '击破三阶段棱镜核心') : '清除全部砖块', COLORS.cyan],
        ['Ⅱ', '保持能量', '剩余至少 2 条生命', COLORS.magenta],
        ['Ⅲ', '达成精通', `${this.levelConfig.targetScore} 分或 ${this.levelConfig.targetCombo} 连击`, COLORS.gold],
      ]
      criteria.forEach(([number, title, detail, color], index) => {
        const y = 346 + index * 78
        ctx.fillStyle = 'rgba(9,25,36,.86)'; ctx.strokeStyle = `${color}55`; ctx.lineWidth = 1
        ctx.beginPath(); ctx.roundRect(76, y, GAME_WIDTH - 152, 60, 12); ctx.fill(); ctx.stroke()
        ctx.textAlign = 'left'; ctx.fillStyle = color; ctx.font = '900 15px system-ui'; ctx.fillText(number, 96, y + 26)
        ctx.fillStyle = COLORS.text; ctx.font = '800 13px system-ui'; ctx.fillText(title, 132, y + 24)
        ctx.fillStyle = COLORS.muted; ctx.font = '500 11px system-ui'; ctx.fillText(detail, 132, y + 43)
      })
      ctx.textAlign = 'center'; this.drawOverlayButton(ctx, '开始挑战', 626)
      ctx.fillStyle = COLORS.muted; ctx.font = '500 12px system-ui'; ctx.fillText(`${this.state.maxLives} 条生命 · 通关奖励 ${Math.round(this.levelConfig.clearBonus * (1 + this.modifiers.coinBonusRate))} 晶币`, GAME_WIDTH / 2, 714)
    } else if (mode === 'paused') {
      ctx.fillStyle = COLORS.text; ctx.font = '900 40px system-ui'; ctx.fillText('已暂停', GAME_WIDTH / 2, 418)
      ctx.fillStyle = COLORS.muted; ctx.font = '500 15px system-ui'; ctx.fillText('点击、空格或 P 启动恢复倒计时', GAME_WIDTH / 2, 456)
    } else if (mode === 'countdown') {
      ctx.fillStyle = COLORS.cyan; ctx.font = '900 16px system-ui'; ctx.fillText('READY TO RESUME', GAME_WIDTH / 2, 360)
      ctx.fillStyle = COLORS.text; ctx.font = '950 92px ui-monospace, monospace'; ctx.fillText(String(Math.max(1, Math.ceil(this.state.resumeCountdown))), GAME_WIDTH / 2, 468)
      ctx.fillStyle = COLORS.muted; ctx.font = '500 14px system-ui'; ctx.fillText('再次点击、空格或 P 可取消', GAME_WIDTH / 2, 512)
    } else if (mode === 'won') {
      this.drawSettlement(ctx, true)
    } else if (mode === 'lost') {
      if (this.state.runType === 'endless') this.drawEndlessSettlement(ctx)
      else this.drawSettlement(ctx, false)
    }
  }

  drawEndlessBriefing(ctx) {
    ctx.textAlign = 'center'
    ctx.fillStyle = '#55a7ff'; ctx.font = '900 13px system-ui'; ctx.fillText('ENDLESS MAGNETIC FIELD', GAME_WIDTH / 2, 202)
    ctx.fillStyle = COLORS.text; ctx.font = '900 37px system-ui'; ctx.fillText('无尽磁域', GAME_WIDTH / 2, 258)
    ctx.fillStyle = COLORS.muted; ctx.font = '500 12px system-ui'; ctx.fillText('生命、分数、晶币和模块效果跨波保留', GAME_WIDTH / 2, 292)
    const criteria = [
      ['∞', '连续波次', '清空砖阵后立即进入下一波', '#55a7ff'],
      ['↗', '动态威胁', '球速与强化砖密度逐波提升', COLORS.magenta],
      ['◆', '本地纪录', '保存最高分、波次与最高连击', COLORS.gold],
    ]
    criteria.forEach(([number, title, detail, color], index) => {
      const y = 346 + index * 78
      ctx.fillStyle = 'rgba(9,25,36,.86)'; ctx.strokeStyle = `${color}55`; ctx.lineWidth = 1
      ctx.beginPath(); ctx.roundRect(76, y, GAME_WIDTH - 152, 60, 12); ctx.fill(); ctx.stroke()
      ctx.textAlign = 'left'; ctx.fillStyle = color; ctx.font = '900 15px system-ui'; ctx.fillText(number, 96, y + 26)
      ctx.fillStyle = COLORS.text; ctx.font = '800 13px system-ui'; ctx.fillText(title, 132, y + 24)
      ctx.fillStyle = COLORS.muted; ctx.font = '500 11px system-ui'; ctx.fillText(detail, 132, y + 43)
    })
    ctx.textAlign = 'center'; this.drawOverlayButton(ctx, '进入无尽磁域', 626)
    ctx.fillStyle = COLORS.muted; ctx.font = '500 12px system-ui'; ctx.fillText(`${this.state.maxLives} 条生命 · 失败后自动保存纪录`, GAME_WIDTH / 2, 714)
  }

  drawEndlessSettlement(ctx) {
    ctx.textAlign = 'center'
    ctx.fillStyle = '#55a7ff'; ctx.font = '900 13px system-ui'; ctx.fillText('ENDLESS RUN COMPLETE', GAME_WIDTH / 2, 206)
    ctx.fillStyle = COLORS.text; ctx.font = '900 34px system-ui'; ctx.fillText(`抵达 WAVE ${this.state.wave}`, GAME_WIDTH / 2, 260)
    ctx.fillStyle = COLORS.muted; ctx.font = '600 12px system-ui'; ctx.fillText(`已清除 ${this.state.wavesCleared} 波磁域`, GAME_WIDTH / 2, 294)
    const stats = [
      ['最终得分', String(this.state.score).padStart(6, '0'), '#55a7ff'],
      ['最高连击', `${this.state.maxCombo}`, COLORS.magenta],
      ['本局晶币', `+${Math.max(0, this.state.coins - this.state.runStartCoins)}`, COLORS.gold],
    ]
    stats.forEach(([label, value, color], index) => {
      const x = 66 + index * 140
      ctx.fillStyle = 'rgba(9,25,36,.88)'; ctx.strokeStyle = `${color}44`; ctx.lineWidth = 1
      ctx.beginPath(); ctx.roundRect(x, 360, 128, 90, 12); ctx.fill(); ctx.stroke()
      ctx.fillStyle = COLORS.muted; ctx.font = '600 10px system-ui'; ctx.fillText(label, x + 64, 391)
      ctx.fillStyle = color; ctx.font = '900 20px ui-monospace, monospace'; ctx.fillText(value, x + 64, 426)
    })
    ctx.fillStyle = 'rgba(85,167,255,.07)'; ctx.strokeStyle = 'rgba(85,167,255,.3)'
    ctx.beginPath(); ctx.roundRect(96, 502, GAME_WIDTH - 192, 56, 11); ctx.fill(); ctx.stroke()
    ctx.fillStyle = '#9bd0ff'; ctx.font = '800 12px system-ui'; ctx.fillText('最高纪录与本局晶币已保存', GAME_WIDTH / 2, 536)
    this.drawOverlayButton(ctx, '再次进入', 626)
    ctx.fillStyle = COLORS.muted; ctx.font = '500 11px system-ui'; ctx.fillText('可从操作终端返回战役大厅', GAME_WIDTH / 2, 714)
  }

  drawSettlement(ctx, won) {
    ctx.textAlign = 'center'
    ctx.fillStyle = won ? COLORS.gold : COLORS.danger
    ctx.font = '900 13px system-ui'
    ctx.fillText(won ? 'MISSION COMPLETE' : 'MISSION FAILED', GAME_WIDTH / 2, 208)
    ctx.fillStyle = COLORS.text; ctx.font = '900 31px system-ui'
    ctx.fillText(won ? `${this.state.levelName} · 已完成` : `${this.state.levelName} · 能量耗尽`, GAME_WIDTH / 2, 256)

    for (let index = 0; index < 3; index += 1) {
      this.drawStarIcon(ctx, GAME_WIDTH / 2 + (index - 1) * 66, 322, 24, won && index < this.state.stars)
    }

    ctx.fillStyle = COLORS.muted; ctx.font = '700 11px system-ui'; ctx.fillText('FINAL SCORE', GAME_WIDTH / 2, 382)
    ctx.fillStyle = COLORS.text; ctx.font = '900 37px ui-monospace, monospace'; ctx.fillText(String(this.state.score).padStart(6, '0'), GAME_WIDTH / 2, 425)

    const stats = [
      ['最高连击', `${this.state.maxCombo}`, COLORS.magenta],
      ['本局晶币', `+${Math.max(0, this.state.coins - this.state.runStartCoins)}`, COLORS.gold],
      ['剩余生命', `${this.state.lives}`, COLORS.cyan],
    ]
    stats.forEach(([label, value, color], index) => {
      const x = 66 + index * 140
      ctx.fillStyle = 'rgba(9,25,36,.88)'; ctx.strokeStyle = `${color}44`; ctx.lineWidth = 1
      ctx.beginPath(); ctx.roundRect(x, 466, 128, 76, 12); ctx.fill(); ctx.stroke()
      ctx.fillStyle = COLORS.muted; ctx.font = '600 10px system-ui'; ctx.fillText(label, x + 64, 491)
      ctx.fillStyle = color; ctx.font = '900 21px ui-monospace, monospace'; ctx.fillText(value, x + 64, 522)
    })

    if (won) {
      ctx.fillStyle = 'rgba(255,209,102,.08)'; ctx.strokeStyle = 'rgba(255,209,102,.28)'
      ctx.beginPath(); ctx.roundRect(96, 568, GAME_WIDTH - 192, 48, 10); ctx.fill(); ctx.stroke()
      ctx.fillStyle = COLORS.gold; ctx.font = '800 12px system-ui'; ctx.fillText(`清关奖励 +${this.state.clearBonus} 晶币 · 记录已保存`, GAME_WIDTH / 2, 598)
    } else {
      ctx.fillStyle = COLORS.muted; ctx.font = '600 12px system-ui'; ctx.fillText('已获得晶币和最高记录均已保存', GAME_WIDTH / 2, 596)
    }
    this.drawOverlayButton(ctx, won ? '再次挑战' : '重新挑战', 650)
    ctx.fillStyle = COLORS.muted; ctx.font = '500 11px system-ui'; ctx.fillText('可从操作终端返回战役大厅', GAME_WIDTH / 2, 738)
  }

  drawStarIcon(ctx, x, y, radius, active) {
    ctx.save()
    ctx.beginPath()
    for (let point = 0; point < 10; point += 1) {
      const angle = -Math.PI / 2 + point * Math.PI / 5
      const distance = point % 2 === 0 ? radius : radius * 0.45
      const px = x + Math.cos(angle) * distance
      const py = y + Math.sin(angle) * distance
      if (point === 0) ctx.moveTo(px, py)
      else ctx.lineTo(px, py)
    }
    ctx.closePath()
    ctx.fillStyle = active ? COLORS.gold : 'rgba(117,148,157,.12)'
    ctx.strokeStyle = active ? '#fff0ac' : 'rgba(117,148,157,.32)'
    ctx.lineWidth = 2
    if (active) { ctx.shadowColor = COLORS.gold; ctx.shadowBlur = 20 }
    ctx.fill(); ctx.stroke(); ctx.restore()
  }

  drawOverlayButton(ctx, label, y) {
    const x = 120; const w = GAME_WIDTH - 240; const h = 58
    const gradient = ctx.createLinearGradient(x, y, x + w, y); gradient.addColorStop(0, COLORS.cyanSoft); gradient.addColorStop(1, COLORS.cyan)
    ctx.save(); ctx.shadowColor = COLORS.cyan; ctx.shadowBlur = 24; ctx.fillStyle = gradient; ctx.beginPath(); ctx.roundRect(x, y, w, h, 14); ctx.fill(); ctx.restore()
    ctx.fillStyle = '#07131f'; ctx.font = '900 19px system-ui'; ctx.fillText(label, GAME_WIDTH / 2, y + h / 2 + 7)
  }

  debugApplyPowerup(type) {
    if (['menu', 'briefing', 'won', 'lost'].includes(this.state.mode)) this.startNewGame()
    if (this.state.mode === 'ready') this.launch()
    const result = this.applyPowerup(type); this.publish(true); this.render(); return result
  }
  debugSpawnDrop(type = 'coin', x = GAME_WIDTH / 2, y = 560) {
    if (type === 'coin') this.spawnCoin(x, y)
    else this.spawnItem(type, x, y)
    this.touchState(); this.publish(true); this.render()
  }
  debugLoseLife() { if (!['ready', 'playing'].includes(this.state.mode)) this.startNewGame(); this.state.balls = []; this.loseBall(); this.render() }
  debugWin() { if (!['ready', 'playing'].includes(this.state.mode)) this.startNewGame(); for (const brick of this.state.bricks) brick.hp = 0; this.winLevel(); this.render() }
}

function paddleTop(paddle) { return paddle.y - 8 }
