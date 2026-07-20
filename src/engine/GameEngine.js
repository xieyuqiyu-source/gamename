import {
  BALL, COLORS, DROP, FIXED_STEP, GAME_HEIGHT, GAME_WIDTH,
  LEVEL_ONE, PADDLE, POWERUPS,
} from '../config/gameConfig'

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

function createBricks() {
  const layout = ['001111100', '011222110', '112111211', '121111121', '112111211', '011222110', '001111100']
  const usable = GAME_WIDTH - LEVEL_ONE.left * 2 - LEVEL_ONE.gapX * (LEVEL_ONE.columns - 1)
  const width = usable / LEVEL_ONE.columns
  const bricks = []
  layout.forEach((row, rowIndex) => [...row].forEach((cell, columnIndex) => {
    const hp = Number(cell)
    if (!hp) return
    bricks.push({
      id: `${rowIndex}-${columnIndex}`,
      x: LEVEL_ONE.left + columnIndex * (width + LEVEL_ONE.gapX),
      y: LEVEL_ONE.top + rowIndex * (LEVEL_ONE.brickHeight + LEVEL_ONE.gapY),
      w: width, h: LEVEL_ONE.brickHeight, hp, maxHp: hp, flash: 0,
    })
  }))
  return bricks
}

export class GameEngine {
  constructor(canvas, { onStateChange, startingCoins = 0, effectQuality = 'high' } = {}) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')
    this.onStateChange = onStateChange
    this.startingCoins = startingCoins
    this.effectQuality = effectQuality
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
    this.hitStop = 0
    this.flash = 0
    this.shake = 0
    this.randomSeed = 0x2f6e2b1
    this.nextBallId = 1
    this.nextDropId = 1
    this.stateVersion = 0
    this.lastPublishedVersion = -1
    this.uiPublishTimer = 0
    this.state = this.createInitialState()

    this.handleKeyDown = this.handleKeyDown.bind(this)
    this.handleKeyUp = this.handleKeyUp.bind(this)
    this.handlePointerMove = this.handlePointerMove.bind(this)
    this.handlePointerDown = this.handlePointerDown.bind(this)
    this.handleContextMenu = this.handleContextMenu.bind(this)
    this.loop = this.loop.bind(this)
  }

  createInitialState() {
    return {
      mode: 'menu', level: 1, levelName: LEVEL_ONE.name, lives: 3,
      score: 0, bestScore: 0, coins: this.startingCoins || 0,
      combo: 0, maxCombo: 0, comboTimer: 0, destroyedCount: 0,
      bricks: createBricks(),
      paddle: { x: (GAME_WIDTH - PADDLE.width) / 2, y: PADDLE.y, w: PADDLE.width, h: PADDLE.height, velocityX: 0 },
      balls: [], drops: [], message: '准备进入霓虹试炼', laserCooldown: 0,
      powerups: {
        expand: { remaining: 0, stacks: 0 }, pierce: { remaining: 0 },
        slow: { remaining: 0 }, laser: { remaining: 0 },
      },
    }
  }

  start() {
    window.addEventListener('keydown', this.handleKeyDown)
    window.addEventListener('keyup', this.handleKeyUp)
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
    this.canvas.removeEventListener('pointermove', this.handlePointerMove)
    this.canvas.removeEventListener('pointerdown', this.handlePointerDown)
    this.canvas.removeEventListener('contextmenu', this.handleContextMenu)
  }

  startNewGame() {
    const { bestScore, coins } = this.state
    const maxCombo = this.state.maxCombo
    this.startingCoins = coins
    this.state = this.createInitialState()
    this.state.bestScore = Math.max(bestScore, this.state.score)
    this.state.maxCombo = maxCombo
    this.state.mode = 'ready'
    this.state.message = '移动挡板 · 点击或按空格发球'
    this.clearTransientEffects()
    this.spawnAttachedBall()
    this.touchState(); this.publish(true); this.render()
  }

  clearTransientEffects() {
    this.trail.length = 0
    this.particles.length = 0
    this.waves.length = 0
    this.floaters.length = 0
    this.projectiles.length = 0
    this.hitStop = 0
    this.flash = 0
  }

  newBall(x, y, vx = 0, vy = 0, stuck = false) {
    return { id: this.nextBallId++, x, y, vx, vy, r: BALL.radius, stuck, lastHitBrickId: null, brickHitCooldown: 0 }
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
    ball.vx = 0.58 * BALL.launchSpeed * direction
    ball.vy = -Math.sqrt(BALL.launchSpeed ** 2 - ball.vx ** 2)
    ball.stuck = false
    this.state.mode = 'playing'
    this.state.message = '连击砖块，接住能量胶囊'
    this.touchState(); this.publish(true)
  }

  togglePause() {
    if (this.state.mode === 'playing') {
      this.state.mode = 'paused'; this.state.message = '游戏已暂停'
    } else if (this.state.mode === 'paused') {
      this.state.mode = 'playing'; this.state.message = '继续挑战'
    } else return
    this.touchState(); this.publish(true); this.render()
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
    if (['arrowleft', 'arrowright', 'a', 'd', ' ', 'enter'].includes(key)) event.preventDefault()
    this.keys.add(key)
    if (key === ' ' || key === 'enter') {
      if (['menu', 'won', 'lost'].includes(this.state.mode)) this.startNewGame()
      else if (this.state.mode === 'ready') this.launch()
      else if (this.state.mode === 'paused') this.togglePause()
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
    if (['menu', 'won', 'lost'].includes(this.state.mode)) this.startNewGame()
    else if (this.state.mode === 'ready') this.launch()
    else if (this.state.mode === 'paused') this.togglePause()
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
      this.updateBalls(dt)
      this.updateProjectiles(dt)
      this.updateDrops(dt)
      this.updateCombo(dt)
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
  }

  updateBalls(dt) {
    const slowFactor = this.state.powerups.slow.remaining > 0 ? 0.72 : 1
    const surviving = []
    for (const ball of this.state.balls) {
      if (ball.stuck) { surviving.push(ball); continue }
      const previousX = ball.x
      const previousY = ball.y
      ball.brickHitCooldown = Math.max(0, ball.brickHitCooldown - dt)
      ball.x += ball.vx * dt * slowFactor
      ball.y += ball.vy * dt * slowFactor
      if (ball.x - ball.r <= 14 && ball.vx < 0) { ball.x = 14 + ball.r; ball.vx = Math.abs(ball.vx); this.spawnImpact(ball.x, ball.y, COLORS.cyan, 3) }
      if (ball.x + ball.r >= GAME_WIDTH - 14 && ball.vx > 0) { ball.x = GAME_WIDTH - 14 - ball.r; ball.vx = -Math.abs(ball.vx); this.spawnImpact(ball.x, ball.y, COLORS.cyan, 3) }
      if (ball.y - ball.r <= 112 && ball.vy < 0) { ball.y = 112 + ball.r; ball.vy = Math.abs(ball.vy); this.spawnImpact(ball.x, ball.y, COLORS.cyan, 3) }

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
      if (ball.y - ball.r <= GAME_HEIGHT) {
        surviving.push(ball)
        if (this.state.mode === 'playing') this.trail.push({ id: ball.id, x: ball.x, y: ball.y, life: 0.24 })
      }
    }
    this.state.balls = surviving
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
      this.damageBrick(brick, ball.x, ball.y, 'ball')
      if (!piercing) break
    }
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

  damageBrick(brick, x, y, source) {
    if (brick.hp <= 0) return
    brick.hp -= 1
    brick.flash = 0.14
    const destroyed = brick.hp === 0
    this.state.combo += 1
    this.state.comboTimer = 2.4
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
    this.state.message = this.state.combo >= 10 ? `${this.state.combo} 连击 · 能量过载！` : `${this.state.combo} 连击`
    this.touchState()
    if (this.remainingBricks() === 0) this.winLevel()
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
        if (type === 'expand') { effect.stacks = 0; this.resizePaddle(PADDLE.width) }
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
        this.resizePaddle(PADDLE.width * (1 + effect.stacks * 0.22))
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

  activateMultiball() {
    const originals = this.state.balls.filter((ball) => !ball.stuck)
    if (!originals.length) return
    const additions = []
    for (const ball of originals) {
      for (const rotation of [-0.38, 0.38]) {
        if (this.state.balls.length + additions.length >= 12) break
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
    if (this.state.destroyedCount % 5 === 0 || this.random() < 0.12) {
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
        if (distance < DROP.magnetRange && distance > 1) {
          const pull = (1 - distance / DROP.magnetRange) * 1450
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
    this.state.coins += 1
    this.floaters.push({ x: drop.x, y: paddleTop(this.state.paddle), text: '+1 ◈', life: 0.8, color: COLORS.gold })
    this.spawnBurst(drop.x, drop.y, COLORS.gold, 10)
    this.state.message = `晶币 +1 · 本地持有 ${this.state.coins}`
    this.touchState()
  }

  updateProjectiles(dt) {
    const kept = []
    for (const shot of this.projectiles) {
      shot.y += shot.vy * dt
      let hit = false
      for (const brick of this.state.bricks) {
        if (brick.hp > 0 && rectCollision(shot, brick)) { this.damageBrick(brick, shot.x + shot.w / 2, shot.y, 'laser'); hit = true; break }
      }
      if (!hit && shot.y + shot.h > 112) kept.push(shot)
    }
    this.projectiles = kept
  }

  loseBall() {
    this.state.lives -= 1
    this.state.combo = 0; this.state.comboTimer = 0
    this.state.drops = []; this.projectiles = []
    for (const type of ['expand', 'pierce', 'slow', 'laser']) {
      this.state.powerups[type].remaining = 0
      if (type === 'expand') this.state.powerups[type].stacks = 0
    }
    this.resizePaddle(PADDLE.width)
    this.trail.length = 0; this.shake = 6; this.touchState()
    if (this.state.lives <= 0) {
      this.state.balls = []; this.state.mode = 'lost'; this.state.message = '光能耗尽 · 再试一次'
    } else {
      this.state.mode = 'ready'; this.state.message = `能量重置 · 剩余 ${this.state.lives}`; this.spawnAttachedBall()
    }
    this.publish(true)
  }

  winLevel() {
    if (this.state.mode === 'won') return
    this.state.mode = 'won'; this.state.message = '全部砖块已清除'
    this.state.combo = 0; this.state.comboTimer = 0
    this.state.drops = []; this.projectiles = []
    for (const type of ['expand', 'pierce', 'slow', 'laser']) {
      this.state.powerups[type].remaining = 0
      if (type === 'expand') this.state.powerups[type].stacks = 0
    }
    this.resizePaddle(PADDLE.width)
    this.state.bestScore = Math.max(this.state.bestScore, this.state.score)
    this.shake = 8; this.flash = 0.35
    this.spawnBurst(GAME_WIDTH / 2, 400, COLORS.gold, 90)
    this.touchState(); this.publish(true)
  }

  remainingBricks() { return this.state.bricks.filter((brick) => brick.hp > 0).length }
  spawnImpact(x, y, color, count) { this.spawnBurst(x, y, color, count) }
  spawnBurst(x, y, color, count) {
    const actualCount = this.effectQuality === 'low' ? Math.max(2, Math.ceil(count * 0.42)) : count
    for (let i = 0; i < actualCount; i += 1) {
      const angle = TAU * i / Math.max(1, actualCount) + Math.random() * 0.6
      const speed = 45 + Math.random() * 180
      const particle = this.particlePool.pop() || {}
      Object.assign(particle, { x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: 0.32 + Math.random() * 0.38, maxLife: 0.7, color, size: 2 + Math.random() * 3.5 })
      this.particles.push(particle)
    }
    const particleLimit = this.effectQuality === 'low' ? 240 : 600
    if (this.particles.length > particleLimit) {
      const excess = this.particles.splice(0, this.particles.length - particleLimit)
      this.particlePool.push(...excess)
    }
  }

  updateEffects(dt) {
    for (const brick of this.state.bricks) brick.flash = Math.max(0, brick.flash - dt)
    for (const item of this.trail) item.life -= dt
    this.trail = this.trail.filter((item) => item.life > 0)
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
    for (const floater of this.floaters) { floater.life -= dt; floater.y -= 42 * dt }
    this.floaters = this.floaters.filter((floater) => floater.life > 0)
    this.shake = Math.max(0, this.shake - 18 * dt)
    this.flash = Math.max(0, this.flash - 1.8 * dt)
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

  getSummary() {
    return {
      mode: this.state.mode, level: this.state.level, levelName: this.state.levelName,
      lives: this.state.lives, score: this.state.score, bestScore: this.state.bestScore,
      coins: this.state.coins, combo: this.state.combo, maxCombo: this.state.maxCombo,
      ballCount: this.state.balls.length, dropCount: this.state.drops.length,
      activeEffects: this.activeEffects(), bricksRemaining: this.remainingBricks(),
      totalBricks: this.state.bricks.length, message: this.state.message,
    }
  }

  getTextState() {
    return JSON.stringify({
      coordinateSystem: `canvas ${GAME_WIDTH}x${GAME_HEIGHT}; origin top-left; x right; y down`,
      mode: this.state.mode, level: { id: this.state.level, name: this.state.levelName },
      lives: this.state.lives, score: this.state.score, coins: this.state.coins,
      combo: this.state.combo, maxCombo: this.state.maxCombo, message: this.state.message,
      paddle: { x: +this.state.paddle.x.toFixed(1), y: this.state.paddle.y, width: +this.state.paddle.w.toFixed(1), velocityX: +this.state.paddle.velocityX.toFixed(1) },
      balls: this.state.balls.map((ball) => ({ id: ball.id, x: +ball.x.toFixed(1), y: +ball.y.toFixed(1), vx: +ball.vx.toFixed(1), vy: +ball.vy.toFixed(1), radius: ball.r, stuck: ball.stuck })),
      bricks: this.state.bricks.filter((brick) => brick.hp > 0).map((brick) => ({ id: brick.id, x: +brick.x.toFixed(1), y: brick.y, width: +brick.w.toFixed(1), height: brick.h, hp: brick.hp, maxHp: brick.maxHp })),
      drops: this.state.drops.map((drop) => ({ kind: drop.kind, type: drop.type || 'coin', x: +drop.x.toFixed(1), y: +drop.y.toFixed(1) })),
      projectiles: this.projectiles.length, activeEffects: this.activeEffects(),
      bricksRemaining: this.remainingBricks(), totalBricks: this.state.bricks.length,
      effects: { particles: this.particles.length, pool: this.particlePool.length, waves: this.waves.length, trailPoints: this.trail.length, shake: +this.shake.toFixed(1) },
      availableActions: this.availableActions(),
    })
  }

  availableActions() {
    if (['menu', 'won', 'lost'].includes(this.state.mode)) return ['start or restart', 'F fullscreen']
    if (this.state.mode === 'ready') return ['move paddle', 'launch with click/Space', 'F fullscreen']
    if (this.state.mode === 'paused') return ['resume with click/Space/P', 'F fullscreen']
    const actions = ['move paddle', 'pause with Esc/P', 'F fullscreen']
    if (this.state.powerups.laser.remaining > 0) actions.push('fire laser with click/Space')
    return actions
  }

  render() {
    const ctx = this.ctx
    const sx = this.shake ? (Math.random() - 0.5) * this.shake : 0
    const sy = this.shake ? (Math.random() - 0.5) * this.shake : 0
    ctx.save(); ctx.clearRect(0, 0, GAME_WIDTH, GAME_HEIGHT); ctx.translate(sx, sy)
    this.drawBackground(ctx); this.drawHud(ctx); this.drawBricks(ctx); this.drawTrail(ctx)
    this.drawDrops(ctx); this.drawProjectiles(ctx); this.drawPaddle(ctx); this.drawBalls(ctx)
    this.drawEffects(ctx); this.drawModeOverlay(ctx)
    if (this.flash > 0) { ctx.fillStyle = `rgba(255,255,255,${this.flash})`; ctx.fillRect(-12, -12, GAME_WIDTH + 24, GAME_HEIGHT + 24) }
    ctx.restore()
  }

  drawBackground(ctx) {
    const gradient = ctx.createLinearGradient(0, 0, 0, GAME_HEIGHT)
    gradient.addColorStop(0, COLORS.backgroundTop); gradient.addColorStop(1, COLORS.backgroundBottom)
    ctx.fillStyle = gradient; ctx.fillRect(-12, -12, GAME_WIDTH + 24, GAME_HEIGHT + 24)
    ctx.strokeStyle = 'rgba(85,244,221,.055)'; ctx.lineWidth = 1
    for (let x = 14; x < GAME_WIDTH; x += 44) { ctx.beginPath(); ctx.moveTo(x, 108); ctx.lineTo(x, GAME_HEIGHT); ctx.stroke() }
    for (let y = 112; y < GAME_HEIGHT; y += 44) { ctx.beginPath(); ctx.moveTo(14, y); ctx.lineTo(GAME_WIDTH - 14, y); ctx.stroke() }
    ctx.strokeStyle = 'rgba(85,244,221,.22)'; ctx.lineWidth = 2; ctx.strokeRect(14, 112, GAME_WIDTH - 28, GAME_HEIGHT - 128)
  }

  drawHud(ctx) {
    ctx.fillStyle = 'rgba(8,20,31,.94)'; ctx.fillRect(0, 0, GAME_WIDTH, 112)
    ctx.textAlign = 'left'; ctx.fillStyle = COLORS.cyan; ctx.font = '800 14px system-ui'; ctx.fillText('NEON BREAKER', 24, 27)
    ctx.fillStyle = COLORS.text; ctx.font = '800 24px system-ui'; ctx.fillText(String(this.state.score).padStart(6, '0'), 24, 62)
    ctx.fillStyle = COLORS.muted; ctx.font = '600 11px system-ui'; ctx.fillText(`LV 01 · ${this.remainingBricks()} BRICKS`, 24, 88)
    if (this.state.combo > 1) {
      ctx.textAlign = 'center'; ctx.fillStyle = this.state.combo >= 10 ? COLORS.gold : COLORS.magenta
      ctx.font = `900 ${Math.min(26, 17 + this.state.combo / 3)}px system-ui`; ctx.fillText(`${this.state.combo} COMBO`, GAME_WIDTH / 2, 50)
      ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.fillRect(GAME_WIDTH / 2 - 58, 64, 116, 3)
      ctx.fillStyle = COLORS.magenta; ctx.fillRect(GAME_WIDTH / 2 - 58, 64, 116 * clamp(this.state.comboTimer / 2.4, 0, 1), 3)
    }
    ctx.textAlign = 'right'; ctx.fillStyle = COLORS.gold; ctx.font = '800 13px system-ui'; ctx.fillText(`◈ ${this.state.coins}`, GAME_WIDTH - 24, 28)
    ctx.fillStyle = COLORS.muted; ctx.font = '600 11px system-ui'; ctx.fillText(`${this.state.balls.length} BALL`, GAME_WIDTH - 24, 88)
    for (let i = 0; i < 3; i += 1) {
      const x = GAME_WIDTH - 30 - i * 27
      ctx.save(); ctx.shadowColor = i < this.state.lives ? COLORS.magenta : 'transparent'; ctx.shadowBlur = 12
      ctx.fillStyle = i < this.state.lives ? COLORS.magenta : 'rgba(117,148,157,.18)'; ctx.beginPath(); ctx.arc(x, 56, 8, 0, TAU); ctx.fill(); ctx.restore()
    }
  }

  drawBricks(ctx) {
    for (const brick of this.state.bricks) {
      if (brick.hp <= 0) continue
      const reinforced = brick.maxHp > 1
      ctx.save(); ctx.shadowColor = reinforced ? COLORS.purple : COLORS.cyan; ctx.shadowBlur = brick.flash > 0 ? 26 : 10
      ctx.fillStyle = brick.flash > 0 ? '#fff' : reinforced ? COLORS.purple : COLORS.cyanSoft
      ctx.beginPath(); ctx.roundRect(brick.x, brick.y, brick.w, brick.h, 7); ctx.fill()
      ctx.strokeStyle = reinforced ? '#e0c5ff' : 'rgba(211,255,248,.68)'; ctx.lineWidth = reinforced ? 2 : 1; ctx.stroke()
      if (reinforced) {
        ctx.shadowBlur = 0; ctx.fillStyle = 'rgba(15,10,35,.7)'; ctx.fillRect(brick.x + 9, brick.y + brick.h / 2 - 1, brick.w - 18, 2)
        for (let i = 0; i < brick.maxHp; i += 1) { ctx.fillStyle = i < brick.hp ? COLORS.gold : 'rgba(255,255,255,.16)'; ctx.beginPath(); ctx.arc(brick.x + brick.w / 2 + (i - .5) * 10, brick.y + brick.h / 2, 3, 0, TAU); ctx.fill() }
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
    ctx.save(); ctx.shadowColor = this.state.powerups.laser.remaining > 0 ? POWERUPS.laser.color : COLORS.cyan; ctx.shadowBlur = 25
    const gradient = ctx.createLinearGradient(paddle.x, 0, paddle.x + paddle.w, 0)
    gradient.addColorStop(0, '#1bb9b0'); gradient.addColorStop(.48, '#e9fffb'); gradient.addColorStop(1, '#65ead6')
    ctx.fillStyle = gradient; ctx.beginPath(); ctx.roundRect(paddle.x, paddle.y, paddle.w, paddle.h, 9); ctx.fill()
    if (this.state.powerups.laser.remaining > 0) {
      ctx.fillStyle = POWERUPS.laser.color
      for (const offset of [15, paddle.w - 21]) { ctx.beginPath(); ctx.roundRect(paddle.x + offset, paddle.y - 9, 7, 13, 3); ctx.fill() }
    }
    ctx.restore()
  }

  drawBalls(ctx) {
    for (const ball of this.state.balls) {
      const color = this.state.powerups.pierce.remaining > 0 ? COLORS.gold : COLORS.cyan
      ctx.save(); ctx.shadowColor = color; ctx.shadowBlur = this.state.powerups.pierce.remaining > 0 ? 34 : 26
      const gradient = ctx.createRadialGradient(ball.x - 3, ball.y - 3, 1, ball.x, ball.y, ball.r)
      gradient.addColorStop(0, '#fff'); gradient.addColorStop(.45, '#e9fff7'); gradient.addColorStop(1, color)
      ctx.fillStyle = gradient; ctx.beginPath(); ctx.arc(ball.x, ball.y, ball.r, 0, TAU); ctx.fill(); ctx.restore()
    }
  }

  drawDrops(ctx) {
    for (const drop of this.state.drops) {
      if (drop.kind === 'coin') {
        ctx.save(); ctx.shadowColor = COLORS.gold; ctx.shadowBlur = 18; ctx.fillStyle = COLORS.gold
        ctx.beginPath(); ctx.arc(drop.x, drop.y, drop.r, 0, TAU); ctx.fill(); ctx.strokeStyle = '#fff4bd'; ctx.lineWidth = 2; ctx.stroke()
        ctx.fillStyle = '#7f5811'; ctx.font = '900 10px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('◈', drop.x, drop.y); ctx.restore()
      } else {
        const config = POWERUPS[drop.type]
        ctx.save(); ctx.shadowColor = config.color; ctx.shadowBlur = 18 + Math.sin(drop.pulse * 8) * 5
        ctx.fillStyle = 'rgba(8,20,31,.92)'; ctx.strokeStyle = config.color; ctx.lineWidth = 2
        ctx.beginPath(); ctx.roundRect(drop.x, drop.y, drop.w, drop.h, 12); ctx.fill(); ctx.stroke()
        ctx.fillStyle = config.color; ctx.font = '900 17px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(config.short, drop.x + drop.w / 2, drop.y + drop.h / 2 + 1)
        ctx.restore()
      }
    }
  }

  drawProjectiles(ctx) {
    for (const shot of this.projectiles) {
      ctx.save(); ctx.shadowColor = shot.color; ctx.shadowBlur = 18; ctx.fillStyle = '#fff'; ctx.fillRect(shot.x, shot.y, shot.w, shot.h); ctx.fillStyle = shot.color; ctx.fillRect(shot.x - 2, shot.y + 6, shot.w + 4, shot.h - 4); ctx.restore()
    }
  }

  drawEffects(ctx) {
    for (const wave of this.waves) {
      ctx.save(); ctx.globalAlpha = clamp(wave.life / wave.maxLife, 0, 1); ctx.strokeStyle = wave.color; ctx.lineWidth = 3; ctx.shadowColor = wave.color; ctx.shadowBlur = 12
      ctx.beginPath(); ctx.arc(wave.x, wave.y, wave.radius, 0, TAU); ctx.stroke(); ctx.restore()
    }
    for (const particle of this.particles) {
      ctx.save(); ctx.globalAlpha = clamp(particle.life / particle.maxLife, 0, 1); ctx.fillStyle = particle.color; ctx.shadowColor = particle.color; ctx.shadowBlur = 8; ctx.fillRect(particle.x, particle.y, particle.size, particle.size); ctx.restore()
    }
    for (const floater of this.floaters) {
      ctx.save(); ctx.globalAlpha = clamp(floater.life / .72, 0, 1); ctx.fillStyle = floater.color; ctx.shadowColor = floater.color; ctx.shadowBlur = 8; ctx.font = '900 14px system-ui'; ctx.textAlign = 'center'; ctx.fillText(floater.text, floater.x, floater.y); ctx.restore()
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
      ctx.fillStyle = COLORS.cyan; ctx.font = '800 16px system-ui'; ctx.fillText('CHAPTER 01', GAME_WIDTH / 2, 274)
      ctx.fillStyle = COLORS.text; ctx.font = '900 46px system-ui'; ctx.fillText('NEON', GAME_WIDTH / 2, 340); ctx.fillText('BREAKER', GAME_WIDTH / 2, 391)
      ctx.fillStyle = COLORS.muted; ctx.font = '600 15px system-ui'; ctx.fillText('5 种道具 · 连击 · 晶币掉落', GAME_WIDTH / 2, 432)
      this.drawOverlayButton(ctx, '开始试炼', 632)
    } else if (mode === 'paused') {
      ctx.fillStyle = COLORS.text; ctx.font = '900 40px system-ui'; ctx.fillText('已暂停', GAME_WIDTH / 2, 418)
      ctx.fillStyle = COLORS.muted; ctx.font = '500 15px system-ui'; ctx.fillText('点击、空格或 P 继续', GAME_WIDTH / 2, 456)
    } else if (mode === 'won') {
      ctx.fillStyle = COLORS.gold; ctx.font = '900 42px system-ui'; ctx.fillText('CLEAR!', GAME_WIDTH / 2, 346)
      ctx.fillStyle = COLORS.text; ctx.font = '800 22px system-ui'; ctx.fillText('初次折射 · 完成', GAME_WIDTH / 2, 390)
      ctx.fillStyle = COLORS.muted; ctx.font = '600 15px system-ui'; ctx.fillText(`得分 ${this.state.score} · 晶币 ${this.state.coins}`, GAME_WIDTH / 2, 430); this.drawOverlayButton(ctx, '再次挑战', 600)
    } else if (mode === 'lost') {
      ctx.fillStyle = COLORS.danger; ctx.font = '900 38px system-ui'; ctx.fillText('ENERGY LOST', GAME_WIDTH / 2, 352)
      ctx.fillStyle = COLORS.text; ctx.font = '800 20px system-ui'; ctx.fillText('三次机会已经用尽', GAME_WIDTH / 2, 396)
      ctx.fillStyle = COLORS.muted; ctx.font = '600 15px system-ui'; ctx.fillText(`得分 ${this.state.score} · 晶币保留`, GAME_WIDTH / 2, 434); this.drawOverlayButton(ctx, '重新挑战', 600)
    }
  }

  drawOverlayButton(ctx, label, y) {
    const x = 120; const w = GAME_WIDTH - 240; const h = 58
    const gradient = ctx.createLinearGradient(x, y, x + w, y); gradient.addColorStop(0, COLORS.cyanSoft); gradient.addColorStop(1, COLORS.cyan)
    ctx.save(); ctx.shadowColor = COLORS.cyan; ctx.shadowBlur = 24; ctx.fillStyle = gradient; ctx.beginPath(); ctx.roundRect(x, y, w, h, 14); ctx.fill(); ctx.restore()
    ctx.fillStyle = '#07131f'; ctx.font = '900 19px system-ui'; ctx.fillText(label, GAME_WIDTH / 2, y + h / 2 + 7)
  }

  debugApplyPowerup(type) {
    if (this.state.mode === 'menu') this.startNewGame()
    if (this.state.mode === 'ready') this.launch()
    const result = this.applyPowerup(type); this.publish(true); this.render(); return result
  }
  debugSpawnDrop(type = 'coin', x = GAME_WIDTH / 2, y = 560) {
    if (type === 'coin') this.spawnCoin(x, y)
    else this.spawnItem(type, x, y)
    this.touchState(); this.publish(true); this.render()
  }
  debugLoseLife() { if (!['ready', 'playing'].includes(this.state.mode)) this.startNewGame(); this.state.balls = []; this.loseBall(); this.render() }
  debugWin() { if (this.state.mode === 'menu') this.startNewGame(); for (const brick of this.state.bricks) brick.hp = 0; this.winLevel(); this.render() }
}

function paddleTop(paddle) { return paddle.y - 8 }
