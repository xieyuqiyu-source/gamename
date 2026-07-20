import { FIXED_STEP, GAME_WIDTH } from '../src/config/gameConfig.js'
import { getLevelConfig } from '../src/config/levels.js'
import { GameEngine } from '../src/engine/GameEngine.js'

function startLevel(levelId) {
  const canvas = { getContext: () => ({}) }
  const engine = new GameEngine(canvas, { levelConfig: getLevelConfig(levelId) })
  engine.state = engine.createInitialState()
  engine.state.runId = 1
  engine.state.mode = 'ready'
  engine.spawnAttachedBall()
  engine.launch()
  return engine
}

function controlPaddle(engine) {
  const active = engine.state.balls.filter((ball) => !ball.stuck)
  if (!active.length) return
  const paddle = engine.state.paddle
  const minCenter = 18 + paddle.w / 2
  const maxCenter = GAME_WIDTH - 18 - paddle.w / 2
  const paddleY = paddle.y
  const descending = active
    .filter((ball) => ball.vy > 0)
    .map((ball) => ({ ball, time: Math.max(0, (paddleY - ball.y) / ball.vy) }))
    .sort((a, b) => a.time - b.time)
  const urgent = descending[0]

  const reflectX = (x, min, max) => {
    const span = max - min
    const offset = ((x - min) % (span * 2) + span * 2) % (span * 2)
    return min + (offset <= span ? offset : span * 2 - offset)
  }
  const ballLandingX = urgent
    ? reflectX(urgent.ball.x + urgent.ball.vx * urgent.time, 14 + urgent.ball.r, GAME_WIDTH - 14 - urgent.ball.r)
    : null
  const incomingHazards = engine.hazards
    .map((hazard) => ({
      hazard,
      time: (paddleY - hazard.y) / hazard.vy,
    }))
    .filter(({ time }) => time >= 0 && time <= 0.72)
    .map(({ hazard, time }) => ({
      x: hazard.x + hazard.w / 2 + hazard.vx * time,
      time,
      halfWidth: hazard.w / 2,
    }))

  let best = { center: paddle.x + paddle.w / 2, score: Infinity }
  for (let center = minCenter; center <= maxCenter; center += 4) {
    let score = Math.abs(center - (paddle.x + paddle.w / 2)) * 0.08
    if (urgent && urgent.time <= 1.1) {
      const catchDistance = Math.max(0, Math.abs(center - ballLandingX) - (paddle.w / 2 - urgent.ball.r - 3))
      score += catchDistance ** 2 * (urgent.time < 0.34 ? 160 : 12)
    } else if (ballLandingX !== null) {
      score += Math.abs(center - ballLandingX) * 0.05
    }
    for (const hazard of incomingHazards) {
      const overlap = paddle.w / 2 + hazard.halfWidth + 4 - Math.abs(center - hazard.x)
      if (overlap > 0) score += overlap ** 2 * (hazard.time < 0.3 ? 42 : 18)
    }
    if (score < best.score) best = { center, score }
  }
  engine.pointerTargetX = best.center
}

function verifyLevel(levelId) {
  const engine = startLevel(levelId)
  let hazardLifeHits = 0
  let lifeLosses = 0
  const takeBossHazardHit = engine.takeBossHazardHit.bind(engine)
  engine.takeBossHazardHit = (hazard) => {
    const result = takeBossHazardHit(hazard)
    if (result === 'life') hazardLifeHits += 1
    return result
  }
  const loseBall = engine.loseBall.bind(engine)
  engine.loseBall = () => { lifeLosses += 1; return loseBall() }
  const maxFrames = levelId === 10 ? 100000 : 42000
  let frame = 0
  let observedBossPhase = engine.state.boss?.phase || null
  const bossPhases = observedBossPhase ? [observedBossPhase] : []
  let peakHazards = 0
  let launchedHazards = 0
  let previousHazards = 0

  while (!['won', 'lost'].includes(engine.state.mode) && frame < maxFrames) {
    if (engine.state.mode === 'ready') engine.launch()
    controlPaddle(engine)
    engine.update(FIXED_STEP)
    if (engine.hazards.length > previousHazards) launchedHazards += engine.hazards.length - previousHazards
    previousHazards = engine.hazards.length
    peakHazards = Math.max(peakHazards, engine.hazards.length)
    const phase = engine.state.boss?.phase
    if (phase && phase !== observedBossPhase) {
      observedBossPhase = phase
      bossPhases.push(phase)
    }
    frame += 1
  }

  return {
    level: levelId,
    name: getLevelConfig(levelId).name,
    mode: engine.state.mode,
    frames: frame,
    seconds: Number((frame * FIXED_STEP).toFixed(1)),
    lives: engine.state.lives,
    score: engine.state.score,
    maxCombo: engine.state.maxCombo,
    bricksRemaining: engine.remainingBricks(),
    bossPhases,
    bossHp: engine.state.boss?.hp ?? null,
    modulesDestroyed: engine.state.boss?.modules.filter((module) => module.destroyed).length ?? 0,
    launchedHazards,
    peakHazards,
    hazardLifeHits,
    missedBalls: Math.max(0, lifeLosses - hazardLifeHits),
  }
}

const results = [6, 7, 8, 9, 10].map(verifyLevel)
const failed = results.filter((result) => result.mode !== 'won')
console.log(JSON.stringify({ results, failed: failed.map((result) => result.level) }, null, 2))
if (failed.length) process.exitCode = 1
