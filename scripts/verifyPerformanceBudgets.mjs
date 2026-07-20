import { getLevelConfig } from '../src/config/levels.js'
import { getEffectProfile } from '../src/config/visualSettings.js'
import { GameEngine } from '../src/engine/GameEngine.js'

const results = []
const failures = []

for (const quality of ['high', 'medium', 'low']) {
  const engine = new GameEngine({ getContext: () => ({}) }, { effectQuality: quality, levelConfig: getLevelConfig(20) })
  const profile = getEffectProfile(quality)
  for (let index = 0; index < 8; index += 1) engine.spawnBurst(270, 400, '#ffffff', 160)
  engine.trail = Array.from({ length: 240 }, (_, index) => ({ id: index, x: index, y: 400, life: 1 }))
  engine.waves = Array.from({ length: 60 }, () => ({ x: 270, y: 400, radius: 5, life: 1, maxLife: 1, color: '#fff' }))
  engine.floaters = Array.from({ length: 60 }, () => ({ x: 270, y: 400, life: 1, color: '#fff', text: '+1' }))
  engine.updateEffects(0)

  const observed = {
    quality,
    particles: engine.particles.length,
    particleLimit: profile.particleLimit,
    trails: engine.trail.length,
    trailLimit: profile.trailLimit,
    waves: engine.waves.length,
    waveLimit: profile.waveLimit,
    floaters: engine.floaters.length,
    floaterLimit: profile.floaterLimit,
    glow: profile.glow,
  }
  results.push(observed)
  for (const [valueKey, limitKey] of [['particles', 'particleLimit'], ['trails', 'trailLimit'], ['waves', 'waveLimit'], ['floaters', 'floaterLimit']]) {
    if (observed[valueKey] > observed[limitKey]) failures.push(`${quality} ${valueKey} 超出预算`)
  }
}

console.log(JSON.stringify({ results, failures }, null, 2))
if (failures.length) process.exitCode = 1
