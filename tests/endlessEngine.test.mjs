import assert from 'node:assert/strict'
import test from 'node:test'

import { GameEngine } from '../src/engine/GameEngine.js'
import { BALL } from '../src/config/gameConfig.js'

function createEndlessEngine(wave = 1) {
  const canvas = { getContext: () => ({}) }
  const engine = new GameEngine(canvas)
  engine.render = () => {}
  engine.configureEndless({ wave, coins: 12, bestScore: 9000 })
  engine.startNewGame()
  engine.launch()
  return engine
}

test('无尽模式清波后保留运行状态并连续生成下一波', () => {
  const engine = createEndlessEngine(1)
  engine.state.score = 1200
  engine.state.combo = 11
  engine.state.powerups.slow.remaining = 6
  engine.state.drops = [
    { id: 1, kind: 'coin', x: 210, y: 400, r: 8, vx: 0, vy: 40, bounces: 0, life: 5 },
    { id: 2, kind: 'item', type: 'slow', x: 260, y: 360, w: 34, h: 40, vy: 154, pulse: 0 },
  ]
  const lives = engine.state.lives
  const balls = engine.state.balls.length

  assert.equal(engine.advanceEndlessWave(), true)
  assert.equal(engine.state.mode, 'playing')
  assert.equal(engine.state.runType, 'endless')
  assert.equal(engine.state.wave, 2)
  assert.equal(engine.state.wavesCleared, 1)
  assert.equal(engine.state.score, 1700)
  assert.equal(engine.state.combo, 11)
  assert.equal(engine.state.powerups.slow.remaining, 6)
  assert.equal(engine.state.lives, lives)
  assert.equal(engine.state.balls.length, balls)
  assert.deepEqual(engine.state.drops.map((drop) => drop.kind), ['coin', 'item'])
  assert.ok(Math.abs(Math.hypot(engine.state.balls[0].vx, engine.state.balls[0].vy) - BALL.launchSpeed * 1.125) < 1e-9)
  assert.ok(engine.remainingBricks() > 0)
})

test('无尽模式可以从指定波次预览并在失败摘要中报告纪录字段', () => {
  const engine = createEndlessEngine(9)
  assert.equal(engine.state.wave, 9)
  assert.ok(engine.state.bricks.some((brick) => brick.maxHp === 3))
  engine.state.score = 48000
  engine.state.maxCombo = 72
  engine.state.wavesCleared = 8
  engine.state.lives = 1
  engine.debugLoseLife()
  const summary = engine.getSummary()
  assert.equal(summary.mode, 'lost')
  assert.equal(summary.runType, 'endless')
  assert.equal(summary.wave, 9)
  assert.equal(summary.wavesCleared, 8)
  assert.equal(summary.score, 48000)
  assert.equal(summary.maxCombo, 72)
})
