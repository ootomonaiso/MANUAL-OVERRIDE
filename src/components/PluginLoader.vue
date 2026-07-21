<template>
  <div class="plugin-loader-wrapper">
    <!-- Gear icon button -->
    <button class="gear-button" @click="isOpen = true" title="プラグイン設定">⚙</button>

    <!-- Modal -->
    <div v-if="isOpen" class="plugin-modal" @click.self="isOpen = false">
      <div class="modal-content">
        <div class="modal-header">
          <h2>プラグイン管理</h2>
          <button class="close-btn" @click="isOpen = false">✕</button>
        </div>

        <!-- Installed plugins list -->
        <div class="section">
          <h3>インストール済み</h3>
          <div v-if="installed.length === 0" class="empty-state">
            プラグインはまだインストールされていません
          </div>
          <div v-else class="plugin-list">
            <div v-for="plugin in installed" :key="plugin.id" class="plugin-item">
              <div class="plugin-info">
                <div class="plugin-name">{{ plugin.id }}</div>
                <div class="plugin-type">{{ plugin.type === 'genre' ? 'ジャンル' : 'デッキ拡張' }}</div>
              </div>
              <button class="delete-btn" @click="uninstallPlugin(plugin.id)">削除</button>
            </div>
          </div>
        </div>

        <!-- Install area -->
        <div class="section">
          <h3>新しいプラグインをインストール</h3>

          <!-- Error message -->
          <div v-if="errorMessage" class="error-message">
            {{ errorMessage }}
          </div>

          <!-- Textarea -->
          <textarea
            v-model="jsonInput"
            class="json-input"
            placeholder="JSONをここに貼り付けてください..."
            @drop="handleDrop"
            @dragover.prevent
            @dragenter.prevent
          ></textarea>

          <!-- Install button -->
          <button
            class="install-btn"
            @click="installPlugin"
            :disabled="!jsonInput.trim()"
          >
            インストール
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue'
import { pluginManager } from '../plugins/PluginManager'

const isOpen = ref(false)
const jsonInput = ref('')
const errorMessage = ref('')
const installed = reactive(pluginManager.listInstalled())

function installPlugin() {
  errorMessage.value = ''

  try {
    const json = JSON.parse(jsonInput.value)
    const result = pluginManager.install(json)

    if (result.success) {
      // Update installed list
      installed.splice(0)
      installed.push(...pluginManager.listInstalled())

      jsonInput.value = ''

      // Reload page
      setTimeout(() => {
        window.location.reload()
      }, 500)
    } else {
      errorMessage.value = result.error || 'Unknown error'
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    errorMessage.value = `JSON parse error: ${msg}`
  }
}

function uninstallPlugin(id: string) {
  if (!confirm(`「${id}」を削除しますか？`)) return

  pluginManager.uninstall(id)
  installed.splice(0)
  installed.push(...pluginManager.listInstalled())

  setTimeout(() => {
    window.location.reload()
  }, 500)
}

function handleDrop(e: DragEvent) {
  e.preventDefault()
  const files = e.dataTransfer?.files
  if (!files) return

  const file = files[0]
  if (!file.name.endsWith('.json')) {
    errorMessage.value = 'JSONファイルのみ対応しています'
    return
  }

  const reader = new FileReader()
  reader.onload = (ev) => {
    jsonInput.value = ev.target?.result as string
  }
  reader.readAsText(file)
}
</script>

<style scoped>
.plugin-loader-wrapper {
  position: fixed;
  bottom: 16px;
  right: 16px;
  z-index: 999;
}

.gear-button {
  width: 48px;
  height: 48px;
  border-radius: 2px;
  background: transparent;
  color: #33aa55;
  border: 1px solid #33aa55;
  cursor: pointer;
  font-size: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.2s;
  box-shadow: 0 0 8px rgba(0,255,65,0.1);
}

.gear-button:hover {
  background: rgba(0,255,65,0.1);
  color: #00ff41;
  border-color: #00ff41;
}

.plugin-modal {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.78);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-content {
  background: #0d120d;
  border-radius: 2px;
  width: 90%;
  max-width: 500px;
  max-height: 80vh;
  overflow-y: auto;
  box-shadow: 0 0 20px rgba(0,255,65,0.15);
  border: 1px solid #33aa55;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  border-bottom: 1px solid rgba(0,255,65,0.2);
  position: sticky;
  top: 0;
  background: #0d120d;
}

.modal-header h2 {
  margin: 0;
  font-size: 18px;
  color: #00ff41;
  font-family: 'M PLUS 1 Code', cursive;
}

.close-btn {
  background: none;
  border: none;
  font-size: 24px;
  cursor: pointer;
  color: #33aa55;
}

.section {
  padding: 16px;
  border-bottom: 1px solid rgba(0,255,65,0.2);
}

.section:last-child {
  border-bottom: none;
}

.section h3 {
  margin: 0 0 12px 0;
  font-size: 14px;
  color: #00ff41;
  font-family: 'M PLUS 1 Code', monospace;
}

.empty-state {
  color: rgba(184,255,184,0.35);
  font-size: 13px;
  padding: 8px;
  font-family: 'M PLUS 1 Code', cursive;
}

.plugin-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.plugin-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px;
  background: rgba(0,255,65,0.05);
  border-radius: 2px;
  border: 1px solid rgba(0,255,65,0.1);
}

.plugin-info {
  flex: 1;
}

.plugin-name {
  font-weight: 600;
  font-size: 13px;
  color: #b8ffb8;
  font-family: 'M PLUS 1 Code', cursive;
}

.plugin-type {
  font-size: 11px;
  color: rgba(184,255,184,0.35);
  margin-top: 2px;
  font-family: 'M PLUS 1 Code', monospace;
}

.delete-btn {
  background: transparent;
  color: #ff3333;
  border: 1px solid #ff3333;
  padding: 4px 12px;
  border-radius: 1px;
  cursor: pointer;
  font-size: 12px;
  font-family: 'M PLUS 1 Code', monospace;
}

.delete-btn:hover {
  background: rgba(255,51,51,0.1);
}

.error-message {
  background: rgba(255,51,51,0.1);
  color: #ff3333;
  padding: 8px;
  border-radius: 2px;
  font-size: 12px;
  margin-bottom: 12px;
  border: 1px solid rgba(255,51,51,0.3);
  font-family: 'M PLUS 1 Code', cursive;
}

.json-input {
  width: 100%;
  height: 200px;
  padding: 8px;
  border: 1px solid rgba(0,255,65,0.2);
  border-radius: 2px;
  font-family: 'M PLUS 1 Code', monospace;
  font-size: 12px;
  resize: vertical;
  box-sizing: border-box;
  background: rgba(0,255,65,0.03);
  color: #b8ffb8;
}

.json-input::placeholder {
  color: rgba(184,255,184,0.25);
}

.install-btn {
  width: 100%;
  padding: 10px;
  margin-top: 12px;
  background: transparent;
  color: #00ff41;
  border: 1px solid #33aa55;
  border-radius: 2px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 600;
  transition: background 0.2s;
  font-family: 'M PLUS 1 Code', monospace;
}

.install-btn:hover:not(:disabled) {
  background: rgba(0,255,65,0.1);
  border-color: #00ff41;
  color: #00ff41;
}

.install-btn:disabled {
  background: transparent;
  border-color: rgba(0,255,65,0.1);
  color: rgba(0,255,65,0.2);
  cursor: not-allowed;
}
</style>
