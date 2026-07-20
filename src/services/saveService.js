export const SAVE_KEY = 'gamename:save'
export const LEGACY_STORE_KEY = 'gamename:game'
export const SAVE_VERSION = 1

const UPGRADE_KEYS = [
  'paddleWidth', 'itemDropRate', 'coinBonus', 'magnetRange',
  'comboGrace', 'bossShield', 'extraLife',
]

const nonNegativeInt = (value, fallback = 0) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : fallback
}

const timestamp = (value, fallback) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

const clone = (value) => JSON.parse(JSON.stringify(value))

export function createDefaultSave(now = Date.now()) {
  return {
    saveVersion: SAVE_VERSION,
    profile: { createdAt: now, updatedAt: now },
    currency: { coins: 0 },
    campaign: {
      highestUnlockedLevel: 1,
      levelRecords: {
        1: { stars: 0, highScore: 0, bestCombo: 0, attempts: 0, clears: 0, bestLives: 0, lastPlayedAt: 0 },
      },
      lastResult: null,
    },
    endless: { unlocked: false, highScore: 0, highestWave: 0, bestCombo: 0 },
    upgrades: {
      paddleWidth: 0,
      itemDropRate: 0,
      coinBonus: 0,
      magnetRange: 0,
      comboGrace: 0,
      bossShield: 0,
      extraLife: 0,
    },
    settings: { effectQuality: 'high', screenShake: true, controlMode: 'auto' },
  }
}

function normalizeRecord(record = {}) {
  return {
    stars: Math.min(3, nonNegativeInt(record.stars)),
    highScore: nonNegativeInt(record.highScore),
    bestCombo: nonNegativeInt(record.bestCombo),
    attempts: nonNegativeInt(record.attempts),
    clears: nonNegativeInt(record.clears),
    bestLives: nonNegativeInt(record.bestLives),
    lastPlayedAt: nonNegativeInt(record.lastPlayedAt),
  }
}

export function normalizeSave(input, now = Date.now()) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('存档根节点无效')
  if (nonNegativeInt(input.saveVersion, 0) > SAVE_VERSION) throw new Error('存档版本高于当前客户端')

  const base = createDefaultSave(now)
  const records = {}
  const inputRecords = input.campaign?.levelRecords
  if (inputRecords && typeof inputRecords === 'object' && !Array.isArray(inputRecords)) {
    for (const [level, record] of Object.entries(inputRecords)) {
      const levelId = nonNegativeInt(level)
      if (levelId > 0 && levelId <= 20) records[levelId] = normalizeRecord(record)
    }
  }
  if (!records[1]) records[1] = normalizeRecord()

  const upgrades = {}
  for (const key of UPGRADE_KEYS) upgrades[key] = nonNegativeInt(input.upgrades?.[key])

  const lastResult = input.campaign?.lastResult
  const safeLastResult = lastResult && typeof lastResult === 'object' ? {
    runId: nonNegativeInt(lastResult.runId),
    level: Math.max(1, nonNegativeInt(lastResult.level, 1)),
    result: lastResult.result === 'won' ? 'won' : 'lost',
    score: nonNegativeInt(lastResult.score),
    stars: Math.min(3, nonNegativeInt(lastResult.stars)),
    coinsEarned: nonNegativeInt(lastResult.coinsEarned),
    totalCoins: nonNegativeInt(lastResult.totalCoins),
    bestCombo: nonNegativeInt(lastResult.bestCombo),
    lives: nonNegativeInt(lastResult.lives),
    settledAt: timestamp(lastResult.settledAt, now),
  } : null

  return {
    ...base,
    saveVersion: SAVE_VERSION,
    profile: {
      createdAt: timestamp(input.profile?.createdAt, now),
      updatedAt: timestamp(input.profile?.updatedAt, now),
      ...(typeof input.profile?.migratedFrom === 'string' ? { migratedFrom: input.profile.migratedFrom } : {}),
    },
    currency: { coins: nonNegativeInt(input.currency?.coins) },
    campaign: {
      highestUnlockedLevel: Math.min(20, Math.max(1, nonNegativeInt(input.campaign?.highestUnlockedLevel, 1))),
      levelRecords: records,
      lastResult: safeLastResult,
    },
    endless: {
      unlocked: Boolean(input.endless?.unlocked),
      highScore: nonNegativeInt(input.endless?.highScore),
      highestWave: nonNegativeInt(input.endless?.highestWave),
      bestCombo: nonNegativeInt(input.endless?.bestCombo),
    },
    upgrades,
    settings: {
      effectQuality: input.settings?.effectQuality === 'low' ? 'low' : 'high',
      screenShake: input.settings?.screenShake !== false,
      controlMode: ['auto', 'keyboard', 'pointer'].includes(input.settings?.controlMode)
        ? input.settings.controlMode
        : 'auto',
    },
  }
}

export function migrateLegacyStore(legacy, now = Date.now()) {
  const save = createDefaultSave(now)
  save.profile.migratedFrom = 'gamename:game@v0.3'
  save.currency.coins = nonNegativeInt(legacy?.coins)
  save.campaign.levelRecords[1] = normalizeRecord({
    highScore: legacy?.bestScore,
    bestCombo: legacy?.maxCombo,
  })
  save.settings.effectQuality = legacy?.settings?.effectQuality === 'low' ? 'low' : 'high'
  save.settings.screenShake = legacy?.settings?.screenShake !== false
  return save
}

export function writeGameSave(save, storage = window.localStorage, now = Date.now()) {
  const normalized = normalizeSave(save, now)
  normalized.profile.updatedAt = now
  storage.setItem(SAVE_KEY, JSON.stringify(normalized))
  return normalized
}

export function loadGameSave(storage = window.localStorage, now = Date.now()) {
  const raw = storage.getItem(SAVE_KEY)
  if (raw !== null) {
    try {
      const save = normalizeSave(JSON.parse(raw), now)
      storage.setItem(SAVE_KEY, JSON.stringify(save))
      return { save, source: 'formal', recovered: false, backupKey: null }
    } catch {
      const backupKey = `${SAVE_KEY}:corrupt:${now}`
      storage.setItem(backupKey, raw)
      const save = writeGameSave(createDefaultSave(now), storage, now)
      return { save, source: 'recovered', recovered: true, backupKey }
    }
  }

  const legacyRaw = storage.getItem(LEGACY_STORE_KEY)
  if (legacyRaw !== null) {
    try {
      const save = writeGameSave(migrateLegacyStore(JSON.parse(legacyRaw), now), storage, now)
      const backupKey = `${LEGACY_STORE_KEY}:migrated`
      if (storage.getItem(backupKey) === null) storage.setItem(backupKey, legacyRaw)
      storage.removeItem(LEGACY_STORE_KEY)
      return { save, source: 'legacy', recovered: false, backupKey }
    } catch {
      const backupKey = `${LEGACY_STORE_KEY}:corrupt:${now}`
      storage.setItem(backupKey, legacyRaw)
      storage.removeItem(LEGACY_STORE_KEY)
      const save = writeGameSave(createDefaultSave(now), storage, now)
      return { save, source: 'recovered', recovered: true, backupKey }
    }
  }

  const save = writeGameSave(createDefaultSave(now), storage, now)
  return { save, source: 'new', recovered: false, backupKey: null }
}

export function recordRunSettlement(currentSave, result, now = Date.now()) {
  const save = normalizeSave(clone(currentSave), now)
  const level = Math.max(1, nonNegativeInt(result.level, 1))
  const key = String(level)
  const previous = normalizeRecord(save.campaign.levelRecords[key])
  const won = result.mode === 'won'
  const stars = won ? Math.min(3, nonNegativeInt(result.stars)) : 0

  save.currency.coins = nonNegativeInt(result.coins)
  save.campaign.levelRecords[key] = {
    stars: Math.max(previous.stars, stars),
    highScore: Math.max(previous.highScore, nonNegativeInt(result.score)),
    bestCombo: Math.max(previous.bestCombo, nonNegativeInt(result.maxCombo)),
    attempts: previous.attempts + 1,
    clears: previous.clears + (won ? 1 : 0),
    bestLives: won ? Math.max(previous.bestLives, nonNegativeInt(result.lives)) : previous.bestLives,
    lastPlayedAt: now,
  }
  if (won) save.campaign.highestUnlockedLevel = Math.max(save.campaign.highestUnlockedLevel, Math.min(20, level + 1))
  save.campaign.lastResult = {
    runId: nonNegativeInt(result.runId),
    level,
    result: won ? 'won' : 'lost',
    score: nonNegativeInt(result.score),
    stars,
    coinsEarned: nonNegativeInt(result.runCoinsEarned),
    totalCoins: save.currency.coins,
    bestCombo: nonNegativeInt(result.maxCombo),
    lives: nonNegativeInt(result.lives),
    settledAt: now,
  }
  save.profile.updatedAt = now
  return save
}
