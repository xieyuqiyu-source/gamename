import assert from 'node:assert/strict'
import test from 'node:test'

import { FIXED_STEP } from '../src/config/gameConfig.js'
import { getLevelConfig } from '../src/config/levels.js'
import { GameEngine } from '../src/engine/GameEngine.js'

function createEngine(levelId) {
  const canvas = { getContext: () => ({}) }
  const engine = new GameEngine(canvas, { levelConfig: getLevelConfig(levelId) })
  engine.state.mode = 'playing'
  return engine
}

function exposeBoss(engine) {
  for (const brick of engine.state.bricks) brick.hp = 0
  assert.equal(engine.breakBossShield(), true)
}

test('熔芯机关砖摧毁后对相邻节点造成一次连锁伤害', () => {
  const engine = createEngine(11)
  const reactor = engine.state.bricks.find((brick) => brick.type === 'reactor')
  const neighbors = engine.state.bricks.filter((brick) => brick.hp > 0 && brick !== reactor
    && Math.abs(brick.x + brick.w / 2 - (reactor.x + reactor.w / 2)) <= reactor.w + engine.levelConfig.gapX + 5
    && Math.abs(brick.y + brick.h / 2 - (reactor.y + reactor.h / 2)) <= reactor.h + engine.levelConfig.gapY + 5)
  const before = new Map(neighbors.map((brick) => [brick.id, brick.hp]))

  assert.equal(engine.damageBrick(reactor, reactor.x, reactor.y, 'ball'), true)
  assert.equal(reactor.hp, 0)
  assert.ok(neighbors.some((brick) => brick.hp === Math.max(0, before.get(brick.id) - 1)))
  assert.ok(engine.state.combo > 1)
  assert.match(engine.state.message, /熔芯引爆/)
})

test('移动砖行偏移后熔芯仍按固定网格八邻连锁', () => {
  const engine = createEngine(12)
  engine.updateBricks(0.8)
  const reactor = engine.state.bricks.find((brick) => brick.id === '1-2')
  const gridNeighbors = engine.state.bricks.filter((brick) => brick.hp > 0 && brick !== reactor
    && Math.abs(brick.row - reactor.row) <= 1
    && Math.abs(brick.column - reactor.column) <= 1)
  const before = new Map(gridNeighbors.map((brick) => [brick.id, brick.hp]))

  assert.equal(engine.damageBrick(reactor, reactor.x, reactor.y, 'ball'), true)
  for (const neighbor of gridNeighbors) {
    assert.equal(neighbor.hp, Math.max(0, before.get(neighbor.id) - 1), `${neighbor.id} 应被固定八邻连锁命中`)
  }
})

test('熔芯守卫破盾后按阶段发射一至五重扇形弹幕', () => {
  const engine = createEngine(15)
  assert.equal(engine.state.boss.kind, 'furnace')
  assert.equal(engine.state.boss.barrageTimer, 5.2)
  exposeBoss(engine)
  engine.state.boss.barrageTimer = 0
  engine.updateBoss(FIXED_STEP)
  assert.equal(engine.hazards.length, 1)
  assert.ok(engine.hazards.every((hazard) => hazard.kind === 'ember'))

  engine.hazards.length = 0
  engine.startBossPhase(3)
  exposeBoss(engine)
  engine.state.boss.barrageTimer = 0
  engine.updateBoss(FIXED_STEP)
  assert.equal(engine.hazards.length, 5)
  assert.equal(new Set(engine.hazards.map((hazard) => hazard.vx)).size, 5)
})

test('星穹意志第四阶段组合双模块齐射与七重核心弹幕', () => {
  const engine = createEngine(20)
  const boss = engine.state.boss
  assert.equal(boss.kind, 'zenith')
  assert.equal(boss.modules.length, 2)
  assert.ok(boss.modules.every((module) => module.hp === 4))
  assert.equal(engine.damageBossModule(boss.modules[0], boss.modules[0].x, boss.modules[0].y), false)

  engine.startBossPhase(4)
  exposeBoss(engine)
  boss.attackTimer = 0
  boss.barrageTimer = 0
  engine.updateBoss(FIXED_STEP)
  assert.equal(engine.hazards.filter((hazard) => hazard.kind === 'magnet').length, 2)
  assert.equal(engine.hazards.filter((hazard) => hazard.kind === 'zenith').length, 7)
  assert.equal(engine.bossSummary().barrage, true)
})

test('高速移动挡板可以招架弹幕并保留永久护盾', () => {
  const engine = createEngine(15)
  engine.state.shieldCharges = 1
  engine.state.paddle.velocityX = 420
  const beforeScore = engine.state.score
  const result = engine.takeBossHazardHit({
    kind: 'ember', x: engine.state.paddle.x, y: engine.state.paddle.y,
    w: 14, h: 22, vx: 0, vy: 250, pulse: 0,
  })
  assert.equal(result, 'parry')
  assert.equal(engine.state.shieldCharges, 1)
  assert.equal(engine.state.lives, 3)
  assert.ok(engine.state.score > beforeScore)
  assert.equal(engine.state.combo, 1)
  assert.match(engine.state.message, /高速招架/)
})

test('滑行动量窗口可以反射模块脉冲并损伤发射模块', () => {
  const engine = createEngine(20)
  exposeBoss(engine)
  const module = engine.state.boss.modules[0]
  engine.state.paddle.velocityX = 0
  engine.state.paddle.guardTimer = 0.12
  const result = engine.takeBossHazardHit({
    kind: 'magnet', sourceModuleId: module.id,
    x: engine.state.paddle.x, y: engine.state.paddle.y,
    w: 14, h: 22, vx: 0, vy: 250, pulse: 0,
  })
  assert.equal(result, 'parry')
  assert.equal(module.hp, 3)
  assert.equal(engine.state.lives, 3)
})

test('反射摧毁最后模块时只清除模块脉冲并保留全部核心弹幕', () => {
  const engine = createEngine(20)
  exposeBoss(engine)
  const [leftModule, rightModule] = engine.state.boss.modules
  leftModule.hp = 0
  leftModule.destroyed = true
  rightModule.hp = 1
  engine.state.paddle.velocityX = 420
  const earlierCore = { id: 'earlier-core', kind: 'zenith', x: 20, y: 100, w: 14, h: 22, vx: 0, vy: 20, pulse: 0 }
  const reflectedModule = {
    id: 'reflected-module', kind: 'magnet', sourceModuleId: rightModule.id,
    x: engine.state.paddle.x, y: engine.state.paddle.y, w: 14, h: 22, vx: 0, vy: 0, pulse: 0,
  }
  const laterCore = { id: 'later-core', kind: 'zenith', x: 40, y: 120, w: 14, h: 22, vx: 0, vy: 20, pulse: 0 }
  engine.hazards = [earlierCore, reflectedModule, laterCore]

  engine.updateHazards(FIXED_STEP)

  assert.equal(rightModule.destroyed, true)
  assert.deepEqual(engine.hazards.map((hazard) => hazard.id), ['earlier-core', 'later-core'])
})
