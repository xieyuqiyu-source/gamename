<script setup>
import { computed, ref } from 'vue'
import { getUpgradeCost, UPGRADE_DEFINITIONS } from '../config/progressionConfig'
import { useGameStore } from '../stores/game'

const emit = defineEmits(['campaign', 'title'])
const store = useGameStore()
const resetArmed = ref(false)
const feedback = ref('升级永久生效，并在进入关卡时装载。')

const activeCount = computed(() => UPGRADE_DEFINITIONS.filter((item) => store.upgrades[item.key] > 0).length)

function buy(definition) {
  resetArmed.value = false
  const result = store.purchaseUpgrade(definition.key)
  if (result.ok) feedback.value = `${definition.name}提升至 LV.${result.level}，消耗 ${result.cost} 晶币。`
  else if (result.reason === 'max') feedback.value = `${definition.name}已经达到最高等级。`
  else feedback.value = `晶币不足，还需要 ${Math.max(0, result.cost - store.currency.coins)}。`
}

function resetAll() {
  if (!resetArmed.value) {
    resetArmed.value = true
    feedback.value = `再次确认将重置全部强化，并返还 ${store.upgradeRefund} 晶币。`
    return
  }
  const refund = store.resetUpgrades()
  resetArmed.value = false
  feedback.value = `强化已全部重置，返还 ${refund} 晶币。`
}
</script>

<template>
  <section class="hub-view upgrade-lab">
    <header class="hub-hero upgrade-hero">
      <div>
        <p>PERMANENT UPGRADE LAB / 7 MODULES</p>
        <h2>强化实验室</h2>
        <span>每项强化都会直接改变下一局运行参数</span>
      </div>
      <div class="hub-wallet">
        <span>可用晶币</span>
        <strong>◈ {{ store.currency.coins }}</strong>
        <small>{{ activeCount }} / 7 模块启用</small>
      </div>
    </header>

    <div class="lab-status">
      <span><i></i> LOADOUT ONLINE</span>
      <p>{{ feedback }}</p>
      <strong>已投入 ◈ {{ store.upgradeRefund }}</strong>
    </div>

    <div class="upgrade-grid">
      <article v-for="definition in UPGRADE_DEFINITIONS" :key="definition.key" class="upgrade-card" :class="{ maxed: store.upgrades[definition.key] >= definition.maxLevel }">
        <header>
          <i>{{ definition.glyph }}</i>
          <div><span>{{ definition.category }}</span><h3>{{ definition.name }}</h3></div>
          <b>LV.{{ store.upgrades[definition.key] }} / {{ definition.maxLevel }}</b>
        </header>
        <div class="level-pips">
          <i v-for="level in definition.maxLevel" :key="level" :class="{ active: level <= store.upgrades[definition.key] }"></i>
        </div>
        <p>{{ definition.effect(store.upgrades[definition.key]) }}</p>
        <small>{{ store.upgrades[definition.key] >= definition.maxLevel ? '模块已达到最大输出' : `下一级：${definition.next}` }}</small>
        <button
          type="button"
          :data-testid="`upgrade-${definition.key}`"
          :disabled="store.upgrades[definition.key] >= definition.maxLevel || store.currency.coins < getUpgradeCost(definition.key, store.upgrades[definition.key])"
          @click="buy(definition)"
        >
          <template v-if="store.upgrades[definition.key] >= definition.maxLevel">已满级</template>
          <template v-else>强化 <b>◈ {{ getUpgradeCost(definition.key, store.upgrades[definition.key]) }}</b></template>
        </button>
      </article>
    </div>

    <footer class="lab-footer">
      <div>
        <span>免费重置协议</span>
        <small>返还全部已投入晶币，不收取手续费。</small>
      </div>
      <button type="button" class="reset-upgrades" :class="{ armed: resetArmed }" data-testid="reset-upgrades" @click="resetAll">
        {{ resetArmed ? `确认重置并返还 ◈ ${store.upgradeRefund}` : '重置全部强化' }}
      </button>
      <button type="button" class="lab-back" @click="emit('campaign')">返回战役星图</button>
      <button type="button" class="lab-back" @click="emit('title')">返回标题</button>
    </footer>
  </section>
</template>
