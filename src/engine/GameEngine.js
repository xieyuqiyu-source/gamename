import {
  BALL,
  COLORS,
  FIXED_STEP,
  GAME_HEIGHT,
  GAME_WIDTH,
  LEVEL_ONE,
  PADDLE,
} from '../config/gameConfig'

const clamp = (value, min, max) => Math.max(min, Math.min(max, value))

function circleRectCollision(ball, rect) {
  const closestX = clamp(ball.x, rect.x, rect.x + rect.w)
  const closestY = clamp(ball.y, rect.y, rect.y + rect.h)
  const dx = ball.x - closestX
  const dy = ball.y - closestY
  return dx * dx + dy * dy <= ball.r * ball.r
}

function createBricks() {
  const level = LEVEL_ONE
  const usableWidth = GAME_WIDTH - level.left * 2 - level.gapX * (level.columns - 1)
  const brickWidth = usableWidth / level.columns
  const layout = [
    '001111100',
    '011222110',
    '112111211',
    '121111121',
    '112111211',
    '011222110',
    '001111100',
  ]

  const bricks = []
  layout.forEach((row, rowIndex) => {
    [...row].forEach((cell, columnIndex) => {
      const hp = Number(cell)
      if (!hp) return
      bricks.push({
        id: `${rowIndex}-${columnIndex}`,
        x: level.left + columnIndex * (brickWidth + level.gapX),
        y: level.top + rowIndex * (level.brickHeight + level.gapY),
        w: brickWidth,
        h: level.brickHeight,
        hp,
        maxHp: hp,
        flash: 0,
      })
    })
  })
  return bricks
}

export class GameEngine {
  constructor(canvas, { onStateChange } = {}) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')
    this.onStateChange = onStateChange
    this.rafId = null
    this.lastTimestamp = 0
    this.accumulator = 0
    this.manualStepping = false
    this.keys = new Set()
    this.pointerTargetX = null
    this.trail = []
    this.particles = []
    this.shake = 0
    this.stateVersion = 0
    this.lastPublishedVersion = -1

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
      mode: 'menu',
      level: 1,
      levelName: LEVEL_ONE.name,
      lives: 3,
      score: 0,
      bestScore: 0,
      bricks: createBricks(),
      paddle: {
        x: (GAME_WIDTH - PADDLE.width) / 2,
        y: PADDLE.y,
        w: PADDLE.width,
        h: PADDLE.height,
        velocityX: 0,
      },
      balls: [],
      message: '准备进入霓虹试炼',
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
    const bestScore = Math.max(this.state.bestScore || 0, this.state.score || 0)
    this.state = this.createInitialState()
    this.state.bestScore = bestScore
    this.state.mode = 'ready'
    this.state.message = '移动挡板 · 点击或按空格发球'
    this.trail.length = 0
    this.particles.length = 0
    this.spawnAttachedBall()
    this.touchState()
    this.publish(true)
    this.render()
  }

  spawnAttachedBall() {
    const paddle = this.state.paddle
    this.state.balls = [{
      id: 1,
      x: paddle.x + paddle.w / 2,
      y: paddle.y - BALL.radius - 5,
      vx: 0,
      vy: 0,
      r: BALL.radius,
      stuck: true,
      lastHitBrickId: null,
      brickHitCooldown: 0,
    }]
  }

  launch() {
    if (this.state.mode !== 'ready') return
    const ball = this.state.balls[0]
    if (!ball) return
    const direction = this.state.paddle.x + this.state.paddle.w / 2 < GAME_WIDTH / 2 ? 1 : -1
    const horizontal = 0.58 * BALL.launchSpeed * direction
    ball.vx = horizontal
    ball.vy = -Math.sqrt(BALL.launchSpeed ** 2 - horizontal ** 2)
    ball.stuck = false
    this.state.mode = 'playing'
    this.state.message = '保持反弹，清空全部砖块'
    this.touchState()
    this.publish(true)
  }

  togglePause() {
    if (this.state.mode === 'playing') {
      this.state.mode = 'paused'
      this.state.message = '游戏已暂停'
    } else if (this.state.mode === 'paused') {
      this.state.mode = 'playing'
      this.state.message = '继续挑战'
    } else {
      return
    }
    this.touchState()
    this.publish(true)
    this.render()
  }

  handleKeyDown(event) {
    const key = event.key.toLowerCase()
    if (['arrowleft', 'arrowright', 'a', 'd', ' ', 'enter'].includes(key)) event.preventDefault()
    this.keys.add(key)

    if (key === ' ' || key === 'enter') {
      if (this.state.mode === 'menu' || this.state.mode === 'won' || this.state.mode === 'lost') this.startNewGame()
      else if (this.state.mode === 'ready') this.launch()
      else if (this.state.mode === 'paused') this.togglePause()
    }
    if (key === 'escape' || key === 'p') this.togglePause()
  }

  handleKeyUp(event) {
    this.keys.delete(event.key.toLowerCase())
  }

  canvasPoint(event) {
    const rect = this.canvas.getBoundingClientRect()
    return {
      x: (event.clientX - rect.left) * GAME_WIDTH / rect.width,
      y: (event.clientY - rect.top) * GAME_HEIGHT / rect.height,
    }
  }

  handlePointerMove(event) {
    const point = this.canvasPoint(event)
    this.pointerTargetX = point.x
  }

  handlePointerDown(event) {
    this.canvas.setPointerCapture?.(event.pointerId)
    const point = this.canvasPoint(event)
    this.pointerTargetX = point.x
    if (this.state.mode === 'menu' || this.state.mode === 'won' || this.state.mode === 'lost') this.startNewGame()
    else if (this.state.mode === 'ready') this.launch()
    else if (this.state.mode === 'paused') this.togglePause()
  }

  handleContextMenu(event) {
    event.preventDefault()
  }

  loop(timestamp) {
    if (!this.lastTimestamp) this.lastTimestamp = timestamp
    const elapsed = Math.min(0.05, (timestamp - this.lastTimestamp) / 1000)
    this.lastTimestamp = timestamp

    if (!this.manualStepping) {
      this.accumulator += elapsed
      while (this.accumulator >= FIXED_STEP) {
        this.update(FIXED_STEP)
        this.accumulator -= FIXED_STEP
      }
      this.render()
    }
    this.rafId = requestAnimationFrame(this.loop)
  }

  advanceTime(milliseconds) {
    this.manualStepping = true
    const steps = Math.max(1, Math.round(milliseconds / (FIXED_STEP * 1000)))
    for (let i = 0; i < steps; i += 1) this.update(FIXED_STEP)
    this.render()
    this.publish()
  }

  update(dt) {
    this.updatePaddle(dt)

    if (this.state.mode === 'ready') {
      const ball = this.state.balls[0]
      if (ball) {
        ball.x = this.state.paddle.x + this.state.paddle.w / 2
        ball.y = this.state.paddle.y - ball.r - 5
      }
    }

    if (this.state.mode === 'playing') this.updateBalls(dt)
    this.updateEffects(dt)
    this.publish()
  }

  updatePaddle(dt) {
    const paddle = this.state.paddle
    const oldX = paddle.x
    const left = this.keys.has('arrowleft') || this.keys.has('a')
    const right = this.keys.has('arrowright') || this.keys.has('d')

    if (left !== right) {
      paddle.x += (right ? 1 : -1) * PADDLE.speed * dt
      this.pointerTargetX = null
    } else if (this.pointerTargetX !== null) {
      const desiredX = this.pointerTargetX - paddle.w / 2
      const delta = desiredX - paddle.x
      const maxMove = PADDLE.speed * 1.8 * dt
      paddle.x += clamp(delta, -maxMove, maxMove)
    }

    paddle.x = clamp(paddle.x, 18, GAME_WIDTH - 18 - paddle.w)
    paddle.velocityX = (paddle.x - oldX) / Math.max(dt, 0.0001)
  }

  updateBalls(dt) {
    const ball = this.state.balls[0]
    if (!ball || ball.stuck) return

    const previousX = ball.x
    const previousY = ball.y
    ball.brickHitCooldown = Math.max(0, (ball.brickHitCooldown || 0) - dt)
    ball.x += ball.vx * dt
    ball.y += ball.vy * dt

    if (ball.x - ball.r <= 14 && ball.vx < 0) {
      ball.x = 14 + ball.r
      ball.vx = Math.abs(ball.vx)
      this.spawnImpact(ball.x, ball.y, COLORS.cyan, 3)
    }
    if (ball.x + ball.r >= GAME_WIDTH - 14 && ball.vx > 0) {
      ball.x = GAME_WIDTH - 14 - ball.r
      ball.vx = -Math.abs(ball.vx)
      this.spawnImpact(ball.x, ball.y, COLORS.cyan, 3)
    }
    if (ball.y - ball.r <= 112 && ball.vy < 0) {
      ball.y = 112 + ball.r
      ball.vy = Math.abs(ball.vy)
      this.spawnImpact(ball.x, ball.y, COLORS.cyan, 3)
    }

    const paddle = this.state.paddle
    if (ball.vy > 0 && circleRectCollision(ball, paddle)) {
      ball.y = paddle.y - ball.r - 0.5
      const relative = clamp((ball.x - (paddle.x + paddle.w / 2)) / (paddle.w / 2), -1, 1)
      const influence = clamp(paddle.velocityX / 900, -0.22, 0.22)
      const angle = clamp(relative * 1.02 + influence, -1.12, 1.12)
      const speed = clamp(Math.hypot(ball.vx, ball.vy) * 1.012, BALL.launchSpeed, BALL.maxSpeed)
      ball.vx = Math.sin(angle) * speed
      ball.vy = -Math.max(Math.cos(angle) * speed, BALL.minVerticalSpeed)
      this.spawnImpact(ball.x, paddle.y, COLORS.cyan, 8)
      this.shake = Math.max(this.shake, 1.2)
    }

    this.collideBricks(ball, previousX, previousY)

    if (ball.y - ball.r > GAME_HEIGHT) this.loseBall()

    if (this.state.mode === 'playing') {
      this.trail.push({ x: ball.x, y: ball.y, life: 0.26 })
      if (this.trail.length > 24) this.trail.shift()
    }
  }

  collideBricks(ball, previousX, previousY) {
    for (const brick of this.state.bricks) {
      if (brick.hp <= 0 || !circleRectCollision(ball, brick)) continue
      if (ball.lastHitBrickId === brick.id && ball.brickHitCooldown > 0) continue

      const cameFromTop = previousY + ball.r <= brick.y
      const cameFromBottom = previousY - ball.r >= brick.y + brick.h
      const cameFromLeft = previousX + ball.r <= brick.x
      const cameFromRight = previousX - ball.r >= brick.x + brick.w

      if (cameFromTop && ball.vy > 0) {
        ball.y = brick.y - ball.r - 0.1
        ball.vy = -Math.abs(ball.vy)
      } else if (cameFromBottom && ball.vy < 0) {
        ball.y = brick.y + brick.h + ball.r + 0.1
        ball.vy = Math.abs(ball.vy)
      } else if (cameFromLeft && ball.vx > 0) {
        ball.x = brick.x - ball.r - 0.1
        ball.vx = -Math.abs(ball.vx)
      } else if (cameFromRight && ball.vx < 0) {
        ball.x = brick.x + brick.w + ball.r + 0.1
        ball.vx = Math.abs(ball.vx)
      } else {
        const overlapLeft = Math.abs(ball.x + ball.r - brick.x)
        const overlapRight = Math.abs(brick.x + brick.w - (ball.x - ball.r))
        const overlapTop = Math.abs(ball.y + ball.r - brick.y)
        const overlapBottom = Math.abs(brick.y + brick.h - (ball.y - ball.r))
        const smallest = Math.min(overlapLeft, overlapRight, overlapTop, overlapBottom)
        if (smallest === overlapLeft || smallest === overlapRight) ball.vx *= -1
        else ball.vy *= -1
      }

      ball.lastHitBrickId = brick.id
      ball.brickHitCooldown = 0.055

      brick.hp -= 1
      brick.flash = 0.14
      this.state.score += brick.hp === 0 ? 180 : 90
      this.state.bestScore = Math.max(this.state.bestScore, this.state.score)
      const destroyed = brick.hp === 0
      this.spawnImpact(ball.x, ball.y, destroyed ? COLORS.magenta : COLORS.purple, destroyed ? 16 : 7)
      this.shake = Math.max(this.shake, destroyed ? 2.6 : 1.2)
      this.touchState()

      if (this.remainingBricks() === 0) this.winLevel()
      break
    }
  }

  loseBall() {
    this.state.lives -= 1
    this.trail.length = 0
    this.shake = 6
    this.touchState()

    if (this.state.lives <= 0) {
      this.state.balls = []
      this.state.mode = 'lost'
      this.state.message = '光能耗尽 · 再试一次'
    } else {
      this.state.mode = 'ready'
      this.state.message = `失去一条生命 · 剩余 ${this.state.lives}`
      this.spawnAttachedBall()
    }
    this.publish(true)
  }

  winLevel() {
    this.state.mode = 'won'
    this.state.message = '全部砖块已清除'
    this.state.bestScore = Math.max(this.state.bestScore, this.state.score)
    this.shake = 8
    this.spawnBurst(GAME_WIDTH / 2, 400, COLORS.gold, 70)
    this.touchState()
    this.publish(true)
  }

  remainingBricks() {
    return this.state.bricks.filter((brick) => brick.hp > 0).length
  }

  spawnImpact(x, y, color, count) {
    this.spawnBurst(x, y, color, count)
  }

  spawnBurst(x, y, color, count) {
    for (let i = 0; i < count; i += 1) {
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.6
      const speed = 45 + Math.random() * 150
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0.32 + Math.random() * 0.32,
        maxLife: 0.64,
        color,
        size: 2 + Math.random() * 3,
      })
    }
    if (this.particles.length > 260) this.particles.splice(0, this.particles.length - 260)
  }

  updateEffects(dt) {
    for (const brick of this.state.bricks) brick.flash = Math.max(0, brick.flash - dt)
    for (const item of this.trail) item.life -= dt
    this.trail = this.trail.filter((item) => item.life > 0)
    for (const particle of this.particles) {
      particle.life -= dt
      particle.x += particle.vx * dt
      particle.y += particle.vy * dt
      particle.vy += 150 * dt
      particle.vx *= 0.985
    }
    this.particles = this.particles.filter((particle) => particle.life > 0)
    this.shake = Math.max(0, this.shake - 18 * dt)
  }

  touchState() {
    this.stateVersion += 1
  }

  publish(force = false) {
    if (!force && this.lastPublishedVersion === this.stateVersion) return
    this.lastPublishedVersion = this.stateVersion
    this.onStateChange?.(this.getSummary())
  }

  getSummary() {
    return {
      mode: this.state.mode,
      level: this.state.level,
      levelName: this.state.levelName,
      lives: this.state.lives,
      score: this.state.score,
      bestScore: this.state.bestScore,
      bricksRemaining: this.remainingBricks(),
      totalBricks: this.state.bricks.length,
      message: this.state.message,
    }
  }

  getTextState() {
    return JSON.stringify({
      coordinateSystem: `canvas ${GAME_WIDTH}x${GAME_HEIGHT}; origin top-left; x right; y down`,
      mode: this.state.mode,
      level: { id: this.state.level, name: this.state.levelName },
      lives: this.state.lives,
      score: this.state.score,
      message: this.state.message,
      paddle: {
        x: Number(this.state.paddle.x.toFixed(1)),
        y: this.state.paddle.y,
        width: this.state.paddle.w,
        velocityX: Number(this.state.paddle.velocityX.toFixed(1)),
      },
      balls: this.state.balls.map((ball) => ({
        x: Number(ball.x.toFixed(1)),
        y: Number(ball.y.toFixed(1)),
        vx: Number(ball.vx.toFixed(1)),
        vy: Number(ball.vy.toFixed(1)),
        radius: ball.r,
        stuck: ball.stuck,
      })),
      bricks: this.state.bricks.filter((brick) => brick.hp > 0).map((brick) => ({
        id: brick.id,
        x: Number(brick.x.toFixed(1)),
        y: brick.y,
        width: Number(brick.w.toFixed(1)),
        height: brick.h,
        hp: brick.hp,
        maxHp: brick.maxHp,
      })),
      bricksRemaining: this.remainingBricks(),
      totalBricks: this.state.bricks.length,
      effects: { particles: this.particles.length, trailPoints: this.trail.length, shake: Number(this.shake.toFixed(1)) },
      availableActions: this.availableActions(),
    })
  }

  availableActions() {
    if (['menu', 'won', 'lost'].includes(this.state.mode)) return ['start or restart', 'F fullscreen']
    if (this.state.mode === 'ready') return ['move paddle', 'launch with click/Space', 'F fullscreen']
    if (this.state.mode === 'paused') return ['resume with click/Space/P', 'F fullscreen']
    return ['move paddle', 'pause with Esc/P', 'F fullscreen']
  }

  render() {
    const ctx = this.ctx
    const shakeX = this.shake ? (Math.random() - 0.5) * this.shake : 0
    const shakeY = this.shake ? (Math.random() - 0.5) * this.shake : 0
    ctx.save()
    ctx.clearRect(0, 0, GAME_WIDTH, GAME_HEIGHT)
    ctx.translate(shakeX, shakeY)
    this.drawBackground(ctx)
    this.drawHud(ctx)
    this.drawBricks(ctx)
    this.drawTrail(ctx)
    this.drawPaddle(ctx)
    this.drawBalls(ctx)
    this.drawParticles(ctx)
    this.drawModeOverlay(ctx)
    ctx.restore()
  }

  drawBackground(ctx) {
    const gradient = ctx.createLinearGradient(0, 0, 0, GAME_HEIGHT)
    gradient.addColorStop(0, COLORS.backgroundTop)
    gradient.addColorStop(1, COLORS.backgroundBottom)
    ctx.fillStyle = gradient
    ctx.fillRect(-12, -12, GAME_WIDTH + 24, GAME_HEIGHT + 24)

    ctx.strokeStyle = 'rgba(85, 244, 221, 0.055)'
    ctx.lineWidth = 1
    for (let x = 14; x < GAME_WIDTH; x += 44) {
      ctx.beginPath()
      ctx.moveTo(x, 108)
      ctx.lineTo(x, GAME_HEIGHT)
      ctx.stroke()
    }
    for (let y = 112; y < GAME_HEIGHT; y += 44) {
      ctx.beginPath()
      ctx.moveTo(14, y)
      ctx.lineTo(GAME_WIDTH - 14, y)
      ctx.stroke()
    }

    ctx.strokeStyle = 'rgba(85, 244, 221, 0.22)'
    ctx.lineWidth = 2
    ctx.strokeRect(14, 112, GAME_WIDTH - 28, GAME_HEIGHT - 128)
  }

  drawHud(ctx) {
    ctx.fillStyle = 'rgba(8, 20, 31, 0.92)'
    ctx.fillRect(0, 0, GAME_WIDTH, 112)
    ctx.fillStyle = COLORS.cyan
    ctx.font = '800 15px system-ui, sans-serif'
    ctx.textAlign = 'left'
    ctx.fillText('NEON BREAKER', 24, 30)
    ctx.fillStyle = COLORS.text
    ctx.font = '800 25px system-ui, sans-serif'
    ctx.fillText(String(this.state.score).padStart(6, '0'), 24, 66)
    ctx.fillStyle = COLORS.muted
    ctx.font = '600 12px system-ui, sans-serif'
    ctx.fillText(`LEVEL ${String(this.state.level).padStart(2, '0')} · ${this.state.levelName}`, 24, 91)

    ctx.textAlign = 'right'
    ctx.fillStyle = COLORS.muted
    ctx.fillText('LIFE', GAME_WIDTH - 24, 29)
    for (let i = 0; i < 3; i += 1) {
      const x = GAME_WIDTH - 30 - i * 27
      ctx.save()
      ctx.shadowColor = i < this.state.lives ? COLORS.magenta : 'transparent'
      ctx.shadowBlur = 12
      ctx.fillStyle = i < this.state.lives ? COLORS.magenta : 'rgba(117,148,157,0.18)'
      ctx.beginPath()
      ctx.arc(x, 57, 8, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    }
    ctx.fillStyle = COLORS.muted
    ctx.font = '600 12px system-ui, sans-serif'
    ctx.fillText(`${this.remainingBricks()} BRICKS`, GAME_WIDTH - 24, 91)
  }

  drawBricks(ctx) {
    for (const brick of this.state.bricks) {
      if (brick.hp <= 0) continue
      const reinforced = brick.maxHp > 1
      const baseColor = reinforced ? COLORS.purple : COLORS.cyanSoft
      ctx.save()
      ctx.shadowColor = reinforced ? COLORS.purple : COLORS.cyan
      ctx.shadowBlur = brick.flash > 0 ? 24 : 10
      ctx.fillStyle = brick.flash > 0 ? '#ffffff' : baseColor
      ctx.beginPath()
      ctx.roundRect(brick.x, brick.y, brick.w, brick.h, 7)
      ctx.fill()
      ctx.strokeStyle = reinforced ? '#e0c5ff' : 'rgba(211,255,248,0.68)'
      ctx.lineWidth = reinforced ? 2 : 1
      ctx.stroke()

      if (reinforced) {
        ctx.shadowBlur = 0
        ctx.fillStyle = 'rgba(15, 10, 35, 0.7)'
        ctx.fillRect(brick.x + 9, brick.y + brick.h / 2 - 1, brick.w - 18, 2)
        for (let i = 0; i < brick.maxHp; i += 1) {
          ctx.fillStyle = i < brick.hp ? COLORS.gold : 'rgba(255,255,255,0.16)'
          ctx.beginPath()
          ctx.arc(brick.x + brick.w / 2 + (i - (brick.maxHp - 1) / 2) * 10, brick.y + brick.h / 2, 3, 0, Math.PI * 2)
          ctx.fill()
        }
      }
      ctx.restore()
    }
  }

  drawPaddle(ctx) {
    const paddle = this.state.paddle
    ctx.save()
    ctx.shadowColor = COLORS.cyan
    ctx.shadowBlur = 24
    const gradient = ctx.createLinearGradient(paddle.x, 0, paddle.x + paddle.w, 0)
    gradient.addColorStop(0, '#1bb9b0')
    gradient.addColorStop(0.48, '#e9fffb')
    gradient.addColorStop(1, '#65ead6')
    ctx.fillStyle = gradient
    ctx.beginPath()
    ctx.roundRect(paddle.x, paddle.y, paddle.w, paddle.h, 9)
    ctx.fill()
    ctx.restore()
  }

  drawTrail(ctx) {
    for (let i = 0; i < this.trail.length; i += 1) {
      const point = this.trail[i]
      const alpha = clamp(point.life / 0.26, 0, 1) * (i / Math.max(1, this.trail.length))
      ctx.fillStyle = `rgba(85, 244, 221, ${alpha * 0.34})`
      ctx.beginPath()
      ctx.arc(point.x, point.y, 2 + alpha * 6, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  drawBalls(ctx) {
    for (const ball of this.state.balls) {
      ctx.save()
      ctx.shadowColor = COLORS.cyan
      ctx.shadowBlur = 26
      const gradient = ctx.createRadialGradient(ball.x - 3, ball.y - 3, 1, ball.x, ball.y, ball.r)
      gradient.addColorStop(0, '#ffffff')
      gradient.addColorStop(0.45, '#bafff5')
      gradient.addColorStop(1, COLORS.cyan)
      ctx.fillStyle = gradient
      ctx.beginPath()
      ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    }
  }

  drawParticles(ctx) {
    for (const particle of this.particles) {
      const alpha = clamp(particle.life / particle.maxLife, 0, 1)
      ctx.save()
      ctx.globalAlpha = alpha
      ctx.fillStyle = particle.color
      ctx.shadowColor = particle.color
      ctx.shadowBlur = 8
      ctx.fillRect(particle.x, particle.y, particle.size, particle.size)
      ctx.restore()
    }
  }

  drawModeOverlay(ctx) {
    const mode = this.state.mode
    if (mode === 'playing') return

    if (mode === 'ready') {
      ctx.fillStyle = 'rgba(6, 14, 24, 0.74)'
      ctx.beginPath()
      ctx.roundRect(72, 686, GAME_WIDTH - 144, 84, 16)
      ctx.fill()
      ctx.strokeStyle = 'rgba(85, 244, 221, 0.35)'
      ctx.stroke()
      ctx.textAlign = 'center'
      ctx.fillStyle = COLORS.text
      ctx.font = '800 19px system-ui, sans-serif'
      ctx.fillText('点击 / SPACE 发球', GAME_WIDTH / 2, 720)
      ctx.fillStyle = COLORS.muted
      ctx.font = '500 13px system-ui, sans-serif'
      ctx.fillText('先移动挡板，决定初始方向', GAME_WIDTH / 2, 747)
      return
    }

    ctx.fillStyle = 'rgba(4, 9, 18, 0.82)'
    ctx.fillRect(14, 112, GAME_WIDTH - 28, GAME_HEIGHT - 128)
    ctx.textAlign = 'center'

    if (mode === 'menu') {
      ctx.fillStyle = COLORS.cyan
      ctx.font = '800 16px system-ui, sans-serif'
      ctx.fillText('CHAPTER 01', GAME_WIDTH / 2, 282)
      ctx.fillStyle = COLORS.text
      ctx.font = '900 46px system-ui, sans-serif'
      ctx.fillText('NEON', GAME_WIDTH / 2, 348)
      ctx.fillText('BREAKER', GAME_WIDTH / 2, 399)
      ctx.fillStyle = COLORS.muted
      ctx.font = '600 15px system-ui, sans-serif'
      ctx.fillText('竖屏霓虹街机打砖块', GAME_WIDTH / 2, 438)
      this.drawOverlayButton(ctx, '开始试炼', 632)
      ctx.fillStyle = COLORS.muted
      ctx.font = '500 13px system-ui, sans-serif'
      ctx.fillText('鼠标 / A D / 方向键控制挡板', GAME_WIDTH / 2, 718)
    } else if (mode === 'paused') {
      ctx.fillStyle = COLORS.text
      ctx.font = '900 40px system-ui, sans-serif'
      ctx.fillText('已暂停', GAME_WIDTH / 2, 418)
      ctx.fillStyle = COLORS.muted
      ctx.font = '500 15px system-ui, sans-serif'
      ctx.fillText('点击、空格或 P 继续', GAME_WIDTH / 2, 456)
    } else if (mode === 'won') {
      ctx.fillStyle = COLORS.gold
      ctx.font = '900 42px system-ui, sans-serif'
      ctx.fillText('CLEAR!', GAME_WIDTH / 2, 354)
      ctx.fillStyle = COLORS.text
      ctx.font = '800 22px system-ui, sans-serif'
      ctx.fillText('初次折射 · 完成', GAME_WIDTH / 2, 398)
      ctx.fillStyle = COLORS.muted
      ctx.font = '600 15px system-ui, sans-serif'
      ctx.fillText(`最终得分 ${this.state.score}`, GAME_WIDTH / 2, 436)
      this.drawOverlayButton(ctx, '再次挑战', 600)
    } else if (mode === 'lost') {
      ctx.fillStyle = COLORS.danger
      ctx.font = '900 38px system-ui, sans-serif'
      ctx.fillText('ENERGY LOST', GAME_WIDTH / 2, 360)
      ctx.fillStyle = COLORS.text
      ctx.font = '800 20px system-ui, sans-serif'
      ctx.fillText('三次机会已经用尽', GAME_WIDTH / 2, 404)
      ctx.fillStyle = COLORS.muted
      ctx.font = '600 15px system-ui, sans-serif'
      ctx.fillText(`本局得分 ${this.state.score}`, GAME_WIDTH / 2, 440)
      this.drawOverlayButton(ctx, '重新挑战', 600)
    }
  }

  drawOverlayButton(ctx, label, y) {
    const x = 120
    const w = GAME_WIDTH - 240
    const h = 58
    const gradient = ctx.createLinearGradient(x, y, x + w, y)
    gradient.addColorStop(0, COLORS.cyanSoft)
    gradient.addColorStop(1, COLORS.cyan)
    ctx.save()
    ctx.shadowColor = COLORS.cyan
    ctx.shadowBlur = 24
    ctx.fillStyle = gradient
    ctx.beginPath()
    ctx.roundRect(x, y, w, h, 14)
    ctx.fill()
    ctx.restore()
    ctx.fillStyle = '#07131f'
    ctx.font = '900 19px system-ui, sans-serif'
    ctx.fillText(label, GAME_WIDTH / 2, y + h / 2 + 1)
  }

  debugLoseLife() {
    if (!['ready', 'playing'].includes(this.state.mode)) this.startNewGame()
    this.loseBall()
    this.render()
  }

  debugWin() {
    if (this.state.mode === 'menu') this.startNewGame()
    for (const brick of this.state.bricks) brick.hp = 0
    this.winLevel()
    this.render()
  }
}
