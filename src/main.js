import { createApp } from 'vue'
import { createRouter, createWebHashHistory } from 'vue-router'
import './style.css'
import App from './App.vue'
import Dashboard from './views/Dashboard.vue'
import Deck from './views/Deck.vue'
import Study from './views/Study.vue'
import Settings from './views/Settings.vue'
import Quiz from './views/Quiz.vue'
import Reading from './views/Reading.vue'
import Story from './views/Story.vue'

const router = createRouter({
  // Hash history: works on GitHub Pages / any static host without rewrite rules.
  history: createWebHashHistory(),
  routes: [
    { path: '/', component: Dashboard },
    { path: '/deck/:id', component: Deck },
    { path: '/study/:id', component: Study }, // id = deck id, or "all"
    { path: '/quiz/:id', component: Quiz },
    { path: '/reading', component: Reading },
    { path: '/reading/:id', component: Story },
    { path: '/settings', component: Settings }
  ]
})

createApp(App).use(router).mount('#app')
