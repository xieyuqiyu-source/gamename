<script setup>
import { computed } from 'vue'
import { EFFECT_QUALITY_OPTIONS, getEffectProfile } from '../config/visualSettings'
import { useGameStore } from '../stores/game'

const props = defineProps({
  resolvedQuality: { type: String, default: 'high' },
  capabilities: { type: Object, default: () => ({}) },
})

const emit = defineEmits(['change', 'campaign', 'title'])
const store = useGameStore()
const profile = computed(() => getEffectProfile(props.resolvedQuality))
const persistenceLabel = computed(() => store.savePersistence === 'local' ? '浏览器本地存储' : '临时内存模式')
const sourceLabel = computed(() => ({
  formal: '正式档案', legacy: '迁移档案', recovered: '恢复档案', new: '新建档案',
}[store.saveSource] || '正式档案'))

function update(patch) {
  emit('change', patch)
}
</script>

<template>
  <section class="hub-view settings-hub">
    <header class="hub-hero settings-hero">
      <div>
        <p>SYSTEM CALIBRATION / VISUAL CORE</p>
        <h2>系统与画面</h2>
        <span>特效预算、动态反馈与本地存储均会立即保存</span>
      </div>
      <div class="settings-signal" :class="resolvedQuality">
        <span>ACTIVE PROFILE</span>
        <strong>{{ profile.label }}</strong>
        <small>{{ resolvedQuality.toUpperCase() }} · {{ profile.particleLimit }} PARTICLES</small>
      </div>
    </header>

    <div class="settings-grid">
      <article class="settings-card visual-settings-card">
        <header class="settings-card-heading">
          <div><span>01 / EFFECT BUDGET</span><h3>特效性能分档</h3></div>
          <b>{{ store.settings.effectQuality.toUpperCase() }}</b>
        </header>
        <p>档位只改变粒子、拖尾、辉光和冲击波预算，不改变碰撞、速度、掉落或得分。</p>

        <div class="quality-options" role="group" aria-label="特效性能分档">
          <button
            v-for="option in EFFECT_QUALITY_OPTIONS"
            :key="option.key"
            type="button"
            :class="{ active: store.settings.effectQuality === option.key }"
            :aria-pressed="store.settings.effectQuality === option.key"
            @click="update({ effectQuality: option.key })"
          >
            <i aria-hidden="true"><span></span><span></span><span></span></i>
            <b>{{ option.short }}</b>
            <strong>{{ option.name }}</strong>
            <small>{{ option.description }}</small>
          </button>
        </div>
      </article>

      <aside class="performance-terminal">
        <header><span>RUNTIME PROFILE</span><b>LIVE</b></header>
        <strong>{{ profile.label }}</strong>
        <dl>
          <div><dt>粒子上限</dt><dd>{{ profile.particleLimit }}</dd></div>
          <div><dt>拖尾采样</dt><dd>{{ profile.trailLimit }}</dd></div>
          <div><dt>冲击波上限</dt><dd>{{ profile.waveLimit }}</dd></div>
          <div><dt>逻辑步进</dt><dd>120 HZ</dd></div>
        </dl>
        <div class="budget-bars" aria-label="当前特效预算">
          <i :style="{ '--budget': `${profile.particleLimit / 6}%` }"></i>
          <i :style="{ '--budget': `${profile.trailLimit / 1.5}%` }"></i>
          <i :style="{ '--budget': `${profile.waveLimit / 0.28}%` }"></i>
        </div>
        <p v-if="store.settings.effectQuality === 'auto'">自动档当前解析为 <b>{{ resolvedQuality.toUpperCase() }}</b></p>
        <p v-else>固定档位已锁定，不随视口改变。</p>
      </aside>

      <article class="settings-card feedback-settings-card">
        <header class="settings-card-heading">
          <div><span>02 / ACCESSIBILITY</span><h3>动态反馈</h3></div>
          <b>SAFE FX</b>
        </header>
        <p>关闭震屏或减弱全屏闪光不会削弱砖块耐久标记、危险弹幕轮廓和招架提示。</p>
        <div class="setting-switches">
          <button type="button" :class="{ active: store.settings.screenShake }" :aria-pressed="store.settings.screenShake" @click="update({ screenShake: !store.settings.screenShake })">
            <i aria-hidden="true"><span></span></i>
            <span><b>画面震动</b><small>命中、爆破和 Boss 阶段转换的位移反馈</small></span>
            <strong>{{ store.settings.screenShake ? 'ON' : 'OFF' }}</strong>
          </button>
          <button type="button" :class="{ active: store.settings.reducedFlash }" :aria-pressed="store.settings.reducedFlash" @click="update({ reducedFlash: !store.settings.reducedFlash })">
            <i aria-hidden="true"><span></span></i>
            <span><b>减弱闪光</b><small>把全屏白闪透明度限制在 12% 以内</small></span>
            <strong>{{ store.settings.reducedFlash ? 'ON' : 'OFF' }}</strong>
          </button>
        </div>
      </article>

      <article class="settings-card compatibility-card">
        <header class="settings-card-heading">
          <div><span>03 / DEVICE &amp; SAVE</span><h3>设备与存档</h3></div>
          <b :class="{ warning: store.savePersistence !== 'local' }">{{ store.savePersistence === 'local' ? 'STABLE' : 'VOLATILE' }}</b>
        </header>
        <div class="compatibility-grid">
          <div><span>逻辑核心</span><strong>{{ capabilities.hardwareConcurrency || 0 }} THREAD</strong><small>用于自动档位判断</small></div>
          <div><span>设备内存</span><strong>{{ capabilities.deviceMemory ? `${capabilities.deviceMemory} GB` : 'UNKNOWN' }}</strong><small>不支持时不会阻断运行</small></div>
          <div><span>动态偏好</span><strong>{{ capabilities.reducedMotion ? 'REDUCED' : 'STANDARD' }}</strong><small>系统减少动态效果设置</small></div>
          <div><span>档案通道</span><strong>{{ persistenceLabel }}</strong><small>{{ sourceLabel }} · SAVE V{{ store.saveVersion }}</small></div>
        </div>
        <p v-if="store.savePersistence !== 'local'" class="storage-warning">浏览器拒绝本地写入，游戏已切换到临时内存以避免中断；关闭页面前请勿清理当前会话。</p>
        <p v-else class="storage-ok">本地存储读写正常；解析失败会保留原文备份并建立安全档案。</p>
      </article>
    </div>

    <footer class="hub-actions settings-actions">
      <button type="button" @click="emit('title')">返回标题</button>
      <button type="button" @click="emit('campaign')">进入战役</button>
    </footer>
  </section>
</template>
