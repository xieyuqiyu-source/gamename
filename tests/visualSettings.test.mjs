import assert from 'node:assert/strict'
import test from 'node:test'

import { getEffectProfile, normalizeEffectQuality, resolveEffectQuality } from '../src/config/visualSettings.js'
import { getLevelConfig } from '../src/config/levels.js'
import { FIXED_STEP } from '../src/config/gameConfig.js'
import { GameEngine } from '../src/engine/GameEngine.js'

function createEngine(effectQuality) {
  return new GameEngine({ getContext: () => ({}) }, { effectQuality, levelConfig: getLevelConfig(20) })
}

test('自动特效档按动态偏好、设备能力与视口分级', () => {
  assert.equal(resolveEffectQuality('auto', { hardwareConcurrency: 12, deviceMemory: 16, viewportWidth: 1440 }), 'high')
  assert.equal(resolveEffectQuality('auto', { hardwareConcurrency: 8, deviceMemory: 8, viewportWidth: 390 }), 'medium')
  assert.equal(resolveEffectQuality('auto', { hardwareConcurrency: 4, deviceMemory: 4, viewportWidth: 390 }), 'low')
  assert.equal(resolveEffectQuality('auto', { hardwareConcurrency: 12, deviceMemory: 16, viewportWidth: 1440, reducedMotion: true }), 'low')
  assert.equal(resolveEffectQuality('medium', { hardwareConcurrency: 2 }), 'medium')
  assert.equal(normalizeEffectQuality('invalid'), 'auto')
})

test('高、中、低三档粒子与拖尾预算严格递减', () => {
  const high = getEffectProfile('high')
  const medium = getEffectProfile('medium')
  const low = getEffectProfile('low')
  assert.ok(high.particleLimit > medium.particleLimit && medium.particleLimit > low.particleLimit)
  assert.ok(high.trailLimit > medium.trailLimit && medium.trailLimit > low.trailLimit)
  assert.deepEqual([high.particleLimit, medium.particleLimit, low.particleLimit], [600, 360, 180])
})

test('引擎压力爆发不会突破当前档位的粒子预算', () => {
  for (const quality of ['high', 'medium', 'low']) {
    const engine = createEngine(quality)
    engine.spawnBurst(270, 400, '#fff', 1200)
    assert.equal(engine.particles.length, getEffectProfile(quality).particleLimit)
    assert.equal(JSON.parse(engine.getTextState()).effects.quality, quality)
  }
})

test('同一输入轨迹在高、中、低档产生完全一致的玩法状态', () => {
  const states = ['high', 'medium', 'low'].map((quality) => {
    const engine = new GameEngine({ getContext: () => ({}) }, {
      effectQuality: quality, levelConfig: getLevelConfig(11),
    })
    engine.state.mode = 'ready'
    engine.spawnAttachedBall()
    engine.launch()
    for (let frame = 0; frame < 2400; frame += 1) {
      engine.pointerTargetX = 110 + (frame % 600) * 0.52
      engine.update(FIXED_STEP)
      if (engine.state.mode === 'ready') engine.launch()
    }
    const state = JSON.parse(engine.getTextState())
    delete state.effects
    return state
  })
  assert.deepEqual(states[1], states[0])
  assert.deepEqual(states[2], states[0])
})

test('减弱闪光和关闭震屏会反映在可测试状态', () => {
  const engine = new GameEngine({ getContext: () => ({}) }, {
    effectQuality: 'low', screenShake: false, reducedFlash: true, levelConfig: getLevelConfig(11),
  })
  engine.flash = 0.4
  engine.shake = 8
  engine.updateEffects(0)
  const effects = JSON.parse(engine.getTextState()).effects
  assert.equal(engine.flash, 0.12)
  assert.equal(effects.shake, 0)
  assert.equal(effects.reducedFlash, true)
  assert.equal(effects.particleBudget, 180)
})
