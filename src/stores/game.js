import { defineStore } from 'pinia'

export const useGameStore = defineStore('game', {
  state: () => ({
    mode: 'planning',
    projectName: 'Neon Breaker',
    saveVersion: 1,
    bootCount: 0,
    lastAction: 'v0.1.0 开发基线已就绪',
    settings: {
      soundEnabled: true,
      fullscreenEnabled: true,
    },
  }),

  actions: {
    testState() {
      this.bootCount += 1
      this.lastAction = `Pinia 状态测试成功 · ${this.bootCount}`
    },

    resetTemplate() {
      this.$reset()
      this.lastAction = '本地模板状态已重置'
    },
  },
})
