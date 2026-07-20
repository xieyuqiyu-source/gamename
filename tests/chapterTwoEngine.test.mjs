import assert from 'node:assert/strict'
import test from 'node:test'

import { GameEngine } from '../src/engine/GameEngine.js'
import { FIXED_STEP } from '../src/config/gameConfig.js'
import { getLevelConfig } from '../src/config/levels.js'

function createMagnetronEngine({ shieldCharges = 0 } = {}) {
  const canvas = { getContext: () => ({}) }
  const engine = new GameEngine(canvas, {
    levelConfig: getLevelConfig(10),
    modifiers: { shieldCharges },
  })
  engine.state.mode = 'playing'
  return engine
}

test('第二章移动磁轨按整行往返且保持砖块间距', () => {
  const canvas = { getContext: () => ({}) }
  const engine = new GameEngine(canvas, { levelConfig: getLevelConfig(8) })
  engine.state.mode = 'playing'
  const row = engine.state.bricks.filter((brick) => brick.moving && brick.id.startsWith('0-'))
  const before = row.map((brick) => brick.x)
  const gaps = before.slice(1).map((x, index) => Number((x - before[index]).toFixed(3)))
  engine.updateBricks(0.5)
  const after = row.map((brick) => brick.x)
  assert.ok(after.some((x, index) => x !== before[index]))
  assert.deepEqual(after.slice(1).map((x, index) => Number((x - after[index]).toFixed(3))), gaps)
  assert.ok(row.every((brick) => Math.abs(brick.velocityX) > 0))
})

test('磁暴主机拥有两座可破坏攻击模块并按阶段发射脉冲', () => {
  const engine = createMagnetronEngine()
  const boss = engine.state.boss
  assert.equal(boss.kind, 'magnetron')
  assert.equal(boss.codename, 'MAGNETRON IX')
  assert.equal(boss.hp, 15)
  assert.equal(boss.modules.length, 2)
  assert.ok(boss.modules.every((module) => module.hp === 3 && !module.destroyed))
  assert.equal(engine.damageBossModule(boss.modules[0], boss.modules[0].x, boss.modules[0].y), false)
  assert.equal(boss.modules[0].hp, 3)

  for (const brick of engine.state.bricks) brick.hp = 0
  engine.breakBossShield()
  boss.attackTimer = 0
  engine.updateBoss(FIXED_STEP)
  assert.equal(engine.hazards.length, 2)
  assert.equal(engine.bossSummary().modulesAlive, 2)
  assert.equal(engine.bossSummary().hazards, 2)
})

test('摧毁攻击模块会停止对应炮火且模块不会随阶段重构复活', () => {
  const engine = createMagnetronEngine()
  for (const brick of engine.state.bricks) brick.hp = 0
  engine.breakBossShield()
  const [left, right] = engine.state.boss.modules
  for (const module of [left, right]) {
    for (let hit = 0; hit < 3; hit += 1) {
      module.hitCooldown = 0
      assert.equal(engine.damageBossModule(module, module.x, module.y), true)
    }
  }
  assert.ok(engine.state.boss.modules.every((module) => module.destroyed))
  assert.equal(engine.hazards.length, 0)

  engine.startBossPhase(2)
  engine.state.boss.attackTimer = 0
  engine.updateBoss(FIXED_STEP)
  assert.ok(engine.state.boss.modules.every((module) => module.destroyed))
  assert.equal(engine.hazards.length, 0)
})

test('磁暴脉冲优先消耗护盾，无护盾时扣除生命并重置球局', () => {
  const shielded = createMagnetronEngine({ shieldCharges: 1 })
  shielded.hazards = [
    { x: 40, y: 500, w: 14, h: 24, vx: 0, vy: 250, pulse: 0 },
    { x: shielded.state.paddle.x, y: shielded.state.paddle.y, w: 14, h: 24, vx: 0, vy: 250, pulse: 0 },
  ]
  shielded.updateHazards(FIXED_STEP)
  assert.equal(shielded.state.shieldCharges, 0)
  assert.equal(shielded.state.lives, 3)
  assert.equal(shielded.state.mode, 'playing')
  assert.equal(shielded.hazards.length, 0)

  const exposed = createMagnetronEngine()
  exposed.state.balls = [exposed.newBall(270, 700, 100, -300)]
  exposed.hazards = [{ x: exposed.state.paddle.x, y: exposed.state.paddle.y, w: 14, h: 24, vx: 0, vy: 250, pulse: 0 }]
  exposed.updateHazards(FIXED_STEP)
  assert.equal(exposed.state.lives, 2)
  assert.equal(exposed.state.mode, 'ready')
  assert.equal(exposed.hazards.length, 0)
  assert.equal(exposed.state.balls.length, 1)
  assert.equal(exposed.state.balls[0].stuck, true)

  shielded.hazards = [{ x: shielded.state.paddle.x, y: shielded.state.paddle.y, w: 14, h: 24, vx: 0, vy: 250, pulse: 0 }]
  shielded.updateHazards(FIXED_STEP)
  assert.equal(shielded.state.lives, 2)
  assert.equal(shielded.state.shieldCharges, 1)
  assert.equal(shielded.state.mode, 'ready')
})

test('磁暴主机最后一点核心耐久必须在攻击模块全毁后才能击破', () => {
  const engine = createMagnetronEngine()
  for (const brick of engine.state.bricks) brick.hp = 0
  engine.breakBossShield()
  engine.state.boss.hp = 1
  engine.state.boss.hitCooldown = 0
  assert.equal(engine.damageBoss(engine.state.boss.x, engine.state.boss.y), false)
  assert.equal(engine.state.boss.hp, 1)
  assert.equal(engine.state.mode, 'playing')

  for (const module of engine.state.boss.modules) {
    module.hp = 0
    module.destroyed = true
  }
  engine.state.boss.hitCooldown = 0
  assert.equal(engine.damageBoss(engine.state.boss.x, engine.state.boss.y), true)
  assert.equal(engine.state.boss.hp, 0)
  assert.equal(engine.state.mode, 'won')
})

test('磁暴主机移动边界会为两侧攻击模块保留完整战场空间', () => {
  const engine = createMagnetronEngine()
  const boss = engine.state.boss
  boss.x = 999
  boss.vx = 200
  engine.updateBoss(FIXED_STEP)
  assert.ok(boss.modules.every((module) => module.x >= 14 && module.x + module.w <= 526))
  boss.x = -999
  boss.vx = -200
  engine.updateBoss(FIXED_STEP)
  assert.ok(boss.modules.every((module) => module.x >= 14 && module.x + module.w <= 526))
})
