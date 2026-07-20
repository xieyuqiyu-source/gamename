import { createApp } from 'vue'
import { createPinia } from 'pinia'
import './style.css'
import App from './App.vue'

const app = createApp(App)
const pinia = createPinia()

pinia.use(({ store }) => {
  const storageKey = `gamename:${store.$id}`
  const cached = localStorage.getItem(storageKey)

  if (cached) {
    try {
      store.$patch(JSON.parse(cached))
    } catch {
      localStorage.removeItem(storageKey)
    }
  }

  store.$subscribe((_mutation, state) => {
    localStorage.setItem(storageKey, JSON.stringify(state))
  })
})

app.use(pinia)
app.mount('#app')
