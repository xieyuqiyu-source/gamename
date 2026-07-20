import assert from 'node:assert/strict'
import test from 'node:test'

import { GameEngine } from '../src/engine/GameEngine.js'

function createInputHarness({ enabled = true, mode = 'menu' } = {}) {
  const engine = Object.create(GameEngine.prototype)
  engine.keys = new Set()
  engine.state = { mode }
  engine.isInputEnabled = () => enabled
  engine.requestCampaignCount = 0
  engine.requestCampaign = () => { engine.requestCampaignCount += 1 }
  engine.togglePauseCount = 0
  engine.togglePause = () => { engine.togglePauseCount += 1 }
  engine.startNewGame = () => {}
  engine.launch = () => {}
  engine.fireLaser = () => {}
  return engine
}

function keyboardEvent({ interactive = false, key = 'Enter' } = {}) {
  return {
    key,
    target: { closest: () => interactive ? {} : null },
    preventDefault() {},
  }
}

test('游戏快捷键不会抢占按钮的 Enter 操作', () => {
  const engine = createInputHarness()
  engine.handleKeyDown(keyboardEvent({ interactive: true }))
  assert.equal(engine.requestCampaignCount, 0)
  assert.equal(engine.keys.size, 0)
})

test('战役与强化页停用常驻引擎快捷键', () => {
  const engine = createInputHarness({ enabled: false })
  engine.handleKeyDown(keyboardEvent())
  assert.equal(engine.requestCampaignCount, 0)
  assert.equal(engine.keys.size, 0)
})

test('标题页仍可用 Enter 进入战役', () => {
  const engine = createInputHarness()
  engine.handleKeyDown(keyboardEvent())
  assert.equal(engine.requestCampaignCount, 1)
  assert.equal(engine.keys.has('enter'), true)
})

test('战斗按钮保留焦点时仍接收移动和暂停快捷键', () => {
  const engine = createInputHarness({ mode: 'playing' })
  engine.handleKeyDown(keyboardEvent({ interactive: true, key: 'ArrowRight' }))
  engine.handleKeyDown(keyboardEvent({ interactive: true, key: 'P' }))
  assert.equal(engine.keys.has('arrowright'), true)
  assert.equal(engine.togglePauseCount, 1)
})
