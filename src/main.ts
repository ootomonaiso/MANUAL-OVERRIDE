import { createApp } from 'vue'
import App from './App.vue'
import './styles/global.css'
import { soundManager } from './plugins/SoundManager'
import { SfxSound } from './plugins/SfxSound'

soundManager.register(new SfxSound())

createApp(App).mount('#app')
