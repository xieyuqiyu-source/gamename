export const EFFECT_QUALITY_OPTIONS = [
  { key: 'auto', name: '自动调节', short: 'AUTO', description: '按设备能力、视口与系统动态效果偏好选择档位。' },
  { key: 'high', name: '全效霓虹', short: 'HIGH', description: '完整粒子、拖尾、冲击波与辉光，适合桌面设备。' },
  { key: 'medium', name: '平衡模式', short: 'MID', description: '保留主要命中反馈，降低同屏粒子和拖尾密度。' },
  { key: 'low', name: '性能优先', short: 'LOW', description: '压缩高频特效预算，保留玩法信息和关键反馈。' },
]

export const EFFECT_PROFILES = {
  high: { key: 'high', label: '全效霓虹', particleMultiplier: 1, particleLimit: 600, trailLimit: 150, waveLimit: 28, floaterLimit: 36, glow: true },
  medium: { key: 'medium', label: '平衡模式', particleMultiplier: 0.68, particleLimit: 360, trailLimit: 96, waveLimit: 20, floaterLimit: 28, glow: true },
  low: { key: 'low', label: '性能优先', particleMultiplier: 0.38, particleLimit: 180, trailLimit: 56, waveLimit: 12, floaterLimit: 20, glow: false },
}

export function normalizeEffectQuality(value, fallback = 'auto') {
  return EFFECT_QUALITY_OPTIONS.some((option) => option.key === value) ? value : fallback
}

export function detectVisualCapabilities(source = globalThis) {
  const navigatorLike = source?.navigator || {}
  const viewportWidth = Number(source?.innerWidth) || 1280
  const reducedMotion = Boolean(source?.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches)
  return {
    hardwareConcurrency: Math.max(1, Number(navigatorLike.hardwareConcurrency) || 8),
    deviceMemory: Math.max(0, Number(navigatorLike.deviceMemory) || 0),
    viewportWidth,
    reducedMotion,
  }
}

export function resolveEffectQuality(requested, capabilities = {}) {
  const normalized = normalizeEffectQuality(requested)
  if (normalized !== 'auto') return normalized
  const cores = Math.max(1, Number(capabilities.hardwareConcurrency) || 8)
  const memory = Math.max(0, Number(capabilities.deviceMemory) || 0)
  const viewportWidth = Math.max(320, Number(capabilities.viewportWidth) || 1280)
  if (capabilities.reducedMotion || cores <= 4 || (memory > 0 && memory <= 4)) return 'low'
  if (viewportWidth <= 720 || cores <= 6 || (memory > 0 && memory <= 6)) return 'medium'
  return 'high'
}

export function getEffectProfile(quality) {
  return EFFECT_PROFILES[normalizeEffectQuality(quality, 'high')] || EFFECT_PROFILES.high
}
