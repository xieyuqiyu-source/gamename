import { FIXED_STEP } from '../src/config/gameConfig.js'
import { GameEngine } from '../src/engine/GameEngine.js'

const canvas = { getContext: () => ({}) }
const engine = new GameEngine(canvas)
engine.render = () => {}
engine.configureEndless({ wave: 1, coins: 0, bestScore: 0 })
engine.state = engine.createInitialState()
engine.state.runId = 1
engine.state.mode = 'ready'
engine.spawnAttachedBall()
engine.launch()

const waveFrames = new Map([[1, 0]])
const maxFrames = 90000
let frame = 0

while (engine.state.mode === 'playing' && engine.state.wave <= 5 && frame < maxFrames) {
  const active = engine.state.balls.filter((ball) => !ball.stuck)
  const descending = active.filter((ball) => ball.vy > 0).sort((a, b) => b.y - a.y)
  const target = descending[0] || active.sort((a, b) => b.y - a.y)[0]
  if (target) engine.pointerTargetX = target.x
  const waveBefore = engine.state.wave
  engine.update(FIXED_STEP)
  waveFrames.set(waveBefore, (waveFrames.get(waveBefore) || 0) + 1)
  frame += 1
}

const result = {
  mode: engine.state.mode,
  reachedWave: engine.state.wave,
  wavesCleared: engine.state.wavesCleared,
  frames: frame,
  seconds: Number((frame * FIXED_STEP).toFixed(1)),
  lives: engine.state.lives,
  score: engine.state.score,
  maxCombo: engine.state.maxCombo,
  waveFrames: Object.fromEntries([...waveFrames].map(([wave, frames]) => [wave, frames])),
  activeEffects: engine.activeEffects().map((effect) => effect.type),
}

console.log(JSON.stringify(result, null, 2))
if (engine.state.wave < 6 || engine.state.mode !== 'playing') process.exitCode = 1
