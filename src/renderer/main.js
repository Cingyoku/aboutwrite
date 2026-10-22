import { createApp } from 'vue'
import App from './App.vue'
import './styles.css'
import { store } from './store'

store.init()

createApp(App).mount('#app')
