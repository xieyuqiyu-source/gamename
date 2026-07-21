<script setup>
import { computed, ref } from 'vue'
import { CHAPTERS, getChapterLevels, getLevelConfig } from '../config/levels'
import { STAR_REWARDS } from '../config/progressionConfig'
import { useGameStore } from '../stores/game'

const emit = defineEmits(['play', 'endless', 'upgrades', 'title'])
const store = useGameStore()
const previewLevelId = ref(store.selectedLevel)

const chapter = computed(() => CHAPTERS.find((item) => item.id === store.selectedChapter) || CHAPTERS[0])
const chapterLevels = computed(() => getChapterLevels(chapter.value.id))
const selectedLevel = computed(() => {
  const selected = getLevelConfig(previewLevelId.value)
  return selected.chapterId === chapter.value.id ? selected : chapterLevels.value[0]
})
const selectedUnlocked = computed(() => selectedLevel.value.id <= store.campaign.highestUnlockedLevel)
const selectedRecord = computed(() => store.campaign.levelRecords[String(selectedLevel.value.id)] || { stars: 0, highScore: 0, bestCombo: 0 })
const chapterStars = computed(() => chapterLevels.value.reduce((total, level) => total + Number(store.campaign.levelRecords[String(level.id)]?.stars || 0), 0))

function chooseLevel(level) {
  previewLevelId.value = level.id
  if (level.id <= store.campaign.highestUnlockedLevel) store.selectLevel(level.id)
}

function playSelected() {
  if (selectedUnlocked.value && store.selectLevel(selectedLevel.value.id)) emit('play', selectedLevel.value)
}

function bossFeatureLabel(boss) {
  const features = []
  if (boss.attackModules) features.push(`${boss.attackModules.count} 座攻击模块`)
  if (boss.barrage) features.push(`${Math.max(...boss.barrage.counts)} 重弹幕`)
  if (!features.length) features.push('移动护盾')
  return features.join(' · ')
}
</script>

<template>
  <section class="hub-view campaign-hub" :style="{ '--chapter-accent': chapter.accent }">
    <header class="hub-hero">
      <div>
        <p>CAMPAIGN NETWORK / 20 MISSIONS</p>
        <h2>战役星图</h2>
        <span>四个章节 · 顺序解锁 · 每关三星记录</span>
      </div>
      <div class="hub-wallet">
        <span>晶币库存</span>
        <strong>◈ {{ store.currency.coins }}</strong>
        <small>{{ store.totalStars }} / 60 ★</small>
      </div>
    </header>

    <nav class="chapter-rail" aria-label="章节选择">
      <button
        v-for="item in CHAPTERS"
        :key="item.id"
        type="button"
        :class="{ active: item.id === store.selectedChapter, locked: item.range[0] > store.campaign.highestUnlockedLevel }"
        @click="store.selectChapter(item.id)"
      >
        <i>{{ String(item.id).padStart(2, '0') }}</i>
        <span>{{ item.name }}<small>{{ item.codename }}</small></span>
        <b>{{ item.range[0] > store.campaign.highestUnlockedLevel ? 'LOCK' : `${item.range[0]}—${item.range[1]}` }}</b>
      </button>
    </nav>

    <div class="campaign-body">
      <div class="level-grid" :aria-label="`${chapter.name}关卡`">
        <button
          v-for="level in chapterLevels"
          :key="level.id"
          type="button"
          class="level-node"
          :class="{
            selected: level.id === selectedLevel.id,
            locked: level.id > store.campaign.highestUnlockedLevel,
            cleared: (store.campaign.levelRecords[String(level.id)]?.clears || 0) > 0,
            boss: level.isBoss,
          }"
          :data-testid="`level-${level.id}`"
          @click="chooseLevel(level)"
        >
          <span class="level-index">{{ String(level.id).padStart(2, '0') }}</span>
          <strong>{{ level.name }}</strong>
          <small>{{ level.isBoss ? 'BOSS NODE' : 'MISSION NODE' }}</small>
          <div class="node-stars">
            <i v-for="star in 3" :key="star" :class="{ active: star <= (store.campaign.levelRecords[String(level.id)]?.stars || 0) }">★</i>
          </div>
          <b>{{ level.id > store.campaign.highestUnlockedLevel ? '未解锁' : level.isBoss ? '守关核心' : '可部署' }}</b>
        </button>
      </div>

      <aside class="mission-detail">
        <div class="detail-heading">
          <span>{{ chapter.codename }}</span>
          <b>{{ selectedLevel.isBoss ? 'BOSS' : `LV ${String(selectedLevel.id).padStart(2, '0')}` }}</b>
        </div>
        <h3>{{ selectedLevel.name }}</h3>
        <p>{{ selectedLevel.description }}</p>
        <div v-if="selectedLevel.boss" class="boss-preview">
          <span>BOSS PROTOCOL</span>
          <strong>{{ selectedLevel.boss.codename }}</strong>
          <small>{{ selectedLevel.boss.phases }} 阶段 · {{ selectedLevel.boss.maxHp }} 核心耐久 · {{ bossFeatureLabel(selectedLevel.boss) }}</small>
        </div>
        <dl>
          <div><dt>目标分数</dt><dd>{{ selectedLevel.targetScore }}</dd></div>
          <div><dt>目标连击</dt><dd>{{ selectedLevel.targetCombo }}</dd></div>
          <div><dt>清关奖励</dt><dd>◈ {{ selectedLevel.clearBonus }}</dd></div>
          <div><dt>历史最高</dt><dd>{{ selectedRecord.highScore }}</dd></div>
        </dl>
        <div class="detail-stars" :aria-label="`章节星级 ${chapterStars} / 15`">
          <span>章节星级</span><strong><i aria-hidden="true">★</i>{{ chapterStars }} / 15</strong>
        </div>
        <button class="deploy-button" type="button" :disabled="!selectedUnlocked" data-testid="deploy-level" @click="playSelected">
          {{ selectedUnlocked ? '部署此关' : `通关第 ${selectedLevel.id - 1} 关后解锁` }}
        </button>
      </aside>
    </div>

    <div class="hub-lower-grid">
      <section class="reward-track">
        <div class="reward-track-title">
          <span>STAR REWARD PROTOCOL</span>
          <strong>累计星级奖励</strong>
        </div>
        <button
          v-for="reward in STAR_REWARDS"
          :key="reward.id"
          type="button"
          :class="{
            reached: store.totalStars >= reward.stars,
            claimed: store.claimedStarRewards.includes(reward.id),
          }"
          :disabled="store.totalStars < reward.stars || store.claimedStarRewards.includes(reward.id)"
          @click="store.claimStarReward(reward.id)"
        >
          <span>{{ reward.stars }} ★</span>
          <strong>◈ {{ reward.coins }}</strong>
          <small>{{ store.claimedStarRewards.includes(reward.id) ? '已领取' : store.totalStars >= reward.stars ? '点击领取' : '未达成' }}</small>
        </button>
      </section>

      <section class="endless-dock" :class="{ locked: !store.endless.unlocked }">
        <div>
          <span>ENDLESS FIELD</span>
          <strong>{{ store.endless.unlocked ? '无尽磁域已连接' : '通关第 10 关后解锁' }}</strong>
          <small>BEST {{ store.endless.highScore }} · W{{ store.endless.highestWave }} · {{ store.endless.bestCombo }} COMBO</small>
        </div>
        <button type="button" :disabled="!store.endless.unlocked" data-testid="deploy-endless" @click="emit('endless')">
          {{ store.endless.unlocked ? '进入无尽' : 'LOCK' }}
        </button>
      </section>
    </div>

    <footer class="hub-actions">
      <button type="button" @click="emit('title')">返回标题</button>
      <button type="button" @click="emit('upgrades')">进入强化实验室</button>
    </footer>
  </section>
</template>
