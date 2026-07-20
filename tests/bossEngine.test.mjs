import assert from 'node:assert/strict'
import test from 'node:test'

import { GameEngine } from '../src/engine/GameEngine.js'
import { getLevelConfig } from '../src/config/levels.js'
import { FIXED_STEP } from '../src/config/gameConfig.js'

function createBossEngine(effectQuality = 'high') {
  const canvas = { getContext: () => ({}) }
  const engine = new GameEngine(canvas, { levelConfig: getLevelConfig(5), effectQuality })
  engine.state.mode = 'playing'
  return engine
}

function destroyCurrentShield(engine) {
  for (const brick of engine.state.bricks) brick.hp = 0
  engine.updateBoss(0)
}

function hitCore(engine, count) {
  for (let index = 0; index < count; index += 1) {
    engine.state.boss.hitCooldown = 0
    assert.equal(engine.damageBoss(engine.state.boss.x + 80, engine.state.boss.y + 25), true)
  }
}

test('棱镜核心具有移动、护盾和三阶段配置', () => {
  const engine = createBossEngine()
  const boss = engine.state.boss
  assert.equal(boss.codename, 'PRISM WARDEN')
  assert.equal(boss.phase, 1)
  assert.equal(boss.maxPhases, 3)
  assert.equal(boss.hp, 12)
  assert.equal(boss.shieldActive, true)
  assert.ok(engine.state.bricks.length > 0)

  const startX = boss.x
  engine.updateBoss(0.25)
  assert.notEqual(boss.x, startX)
  assert.equal(engine.damageBoss(boss.x, boss.y), false)
  assert.equal(boss.hp, 12)
})

test('击碎每阶段护盾并清空核心后进入胜利', () => {
  const engine = createBossEngine()

  destroyCurrentShield(engine)
  assert.equal(engine.state.boss.shieldActive, false)
  hitCore(engine, 4)
  assert.equal(engine.state.boss.phase, 2)
  assert.equal(engine.state.boss.hp, 8)
  assert.equal(engine.state.boss.shieldActive, true)
  assert.ok(engine.remainingBricks() > 0)

  destroyCurrentShield(engine)
  hitCore(engine, 4)
  assert.equal(engine.state.boss.phase, 3)
  assert.equal(engine.state.boss.hp, 4)
  assert.equal(engine.state.boss.shieldActive, true)

  destroyCurrentShield(engine)
  hitCore(engine, 4)
  assert.equal(engine.state.boss.hp, 0)
  assert.equal(engine.state.boss.defeated, true)
  assert.equal(engine.state.mode, 'won')
})

test('低特效模式下 Boss 护盾破裂使用受控粒子数量', () => {
  const engine = createBossEngine('low')
  destroyCurrentShield(engine)
  assert.equal(engine.state.boss.shieldActive, false)
  assert.equal(engine.particles.length, 14)
  assert.ok(engine.particles.length <= 180)
})

test('小球最终击破核心后不会在胜利态被重新加入场景', () => {
  const engine = createBossEngine()
  destroyCurrentShield(engine)
  engine.state.boss.hp = 1
  engine.state.boss.hitCooldown = 0
  engine.state.balls = [engine.newBall(
    engine.state.boss.x + engine.state.boss.w / 2,
    engine.state.boss.y + engine.state.boss.h + 7,
    0,
    -240,
  )]

  engine.updateBalls(FIXED_STEP)
  assert.equal(engine.state.mode, 'won')
  assert.equal(engine.state.balls.length, 0)
})

test('激光最终击破核心后不会在胜利态残留弹体', () => {
  const engine = createBossEngine()
  destroyCurrentShield(engine)
  engine.state.boss.hp = 1
  engine.state.boss.hitCooldown = 0
  engine.projectiles = [
    { x: engine.state.boss.x + 20, y: engine.state.boss.y + 12, w: 4, h: 18, vy: -780, color: '#fff' },
    { x: 260, y: 500, w: 4, h: 18, vy: -780, color: '#fff' },
  ]

  engine.updateProjectiles(FIXED_STEP)
  assert.equal(engine.state.mode, 'won')
  assert.equal(engine.projectiles.length, 0)
})
