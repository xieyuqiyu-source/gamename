import { defineStore } from 'pinia'

export const useGameStore = defineStore('game', {
  state: () => ({
    mode: 'menu',
    projectName: 'Neon Breaker',
    saveVersion: 1,
    level: 1,
    levelName: '初次折射',
    lives: 3,
    score: 0,
    bestScore: 0,
    bricksRemaining: 0,
    totalBricks: 0,
    message: '准备进入霓虹试炼',
    settings: {
      effectQuality: 'high',
      screenShake: true,
    },
  }),

  getters: {
    progressPercent: (state) => state.totalBricks
      ? Math.round((1 - state.bricksRemaining / state.totalBricks) * 100)
      : 0,
  },

  actions: {
    syncFromEngine(snapshot) {
      this.mode = snapshot.mode
      this.level = snapshot.level
      this.levelName = snapshot.levelName
      this.lives = snapshot.lives
      this.score = snapshot.score
      this.bestScore = Math.max(this.bestScore, snapshot.bestScore)
      this.bricksRemaining = snapshot.bricksRemaining
      this.totalBricks = snapshot.totalBricks
      this.message = snapshot.message
    },
  },
})
