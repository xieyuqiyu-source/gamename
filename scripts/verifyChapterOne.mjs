import { FIXED_STEP } from '../src/config/gameConfig.js'
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

function followMostUrgentBall(engine) {
  const active = engine.state.balls.filter((ball) => !ball.stuck)
  if (!active.length) return
  const descending = active.filter((ball) => ball.vy > 0).sort((a, b) => b.y - a.y)
  const target = descending[0] || active.sort((a, b) => b.y - a.y)[0]
  engine.pointerTargetX = target.x
}

function verifyLevel(levelId) {
  const engine = startLevel(levelId)
  const maxFrames = levelId === 5 ? 72000 : 30000
  let frame = 0
  let observedBossPhase = engine.state.boss?.phase || null
  const bossPhases = observedBossPhase ? [observedBossPhase] : []

  while (!['won', 'lost'].includes(engine.state.mode) && frame < maxFrames) {
    if (engine.state.mode === 'ready') engine.launch()
    followMostUrgentBall(engine)
    engine.update(FIXED_STEP)
    const phase = engine.state.boss?.phase
    if (phase && phase !== observedBossPhase) {
      observedBossPhase = phase
      bossPhases.push(phase)
    }
    frame += 1
  }

  return {
    level: levelId,
    name: engine.levelConfig.name,
    mode: engine.state.mode,
    frames: frame,
    seconds: Number((frame * FIXED_STEP).toFixed(1)),
    lives: engine.state.lives,
    score: engine.state.score,
    maxCombo: engine.state.maxCombo,
    bricksRemaining: engine.remainingBricks(),
    bossPhases,
    bossHp: engine.state.boss?.hp ?? null,
  }
}

const results = [1, 2, 3, 4, 5].map(verifyLevel)
const failed = results.filter((result) => result.mode !== 'won')
console.log(JSON.stringify({ results, failed: failed.map((result) => result.level) }, null, 2))
if (failed.length) process.exitCode = 1
