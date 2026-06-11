import { useState } from 'react'
import { pluginManager } from '../plugins/PluginManager'

export default function PluginLoader() {
  const [isOpen, setIsOpen] = useState(false)
  const [jsonInput, setJsonInput] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [installed, setInstalled] = useState(() => pluginManager.listInstalled())

  function installPlugin() {
    setErrorMessage('')
    try {
      const json = JSON.parse(jsonInput)
      const result = pluginManager.install(json)
      if (result.success) {
        setInstalled(pluginManager.listInstalled())
        setJsonInput('')
        setTimeout(() => window.location.reload(), 500)
      } else {
        setErrorMessage(result.error ?? 'Unknown error')
      }
    } catch (e) {
      setErrorMessage(`JSON parse error: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  function uninstallPlugin(id: string) {
    if (!confirm(`「${id}」を削除しますか？`)) return
    pluginManager.uninstall(id)
    setInstalled(pluginManager.listInstalled())
    setTimeout(() => window.location.reload(), 500)
  }

  function handleDrop(e: React.DragEvent<HTMLTextAreaElement>) {
    e.preventDefault()
    const file = e.dataTransfer?.files?.[0]
    if (!file) return
    if (!file.name.endsWith('.json')) { setErrorMessage('JSONファイルのみ対応しています'); return }
    const reader = new FileReader()
    reader.onload = ev => setJsonInput(ev.target?.result as string)
    reader.readAsText(file)
  }

  return (
    <div className="plugin-loader-wrapper">
      <button className="gear-button" title="プラグイン設定" onClick={() => setIsOpen(true)}>⚙</button>

      {isOpen && (
        <div className="plugin-modal" onClick={e => { if (e.target === e.currentTarget) setIsOpen(false) }}>
          <div className="modal-content">
            <div className="modal-header">
              <h2>プラグイン管理</h2>
              <button className="close-btn" onClick={() => setIsOpen(false)}>✕</button>
            </div>

            <div className="section">
              <h3>インストール済み</h3>
              {installed.length === 0 ? (
                <div className="empty-state">プラグインはまだインストールされていません</div>
              ) : (
                <div className="plugin-list">
                  {installed.map(p => (
                    <div key={p.id} className="plugin-item">
                      <div className="plugin-info">
                        <div className="plugin-name">{p.id}</div>
                        <div className="plugin-type">{p.type === 'genre' ? 'ジャンル' : 'デッキ拡張'}</div>
                      </div>
                      <button className="delete-btn" onClick={() => uninstallPlugin(p.id)}>削除</button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="section">
              <h3>新しいプラグインをインストール</h3>
              {errorMessage && <div className="error-message">{errorMessage}</div>}
              <textarea
                className="json-input"
                value={jsonInput}
                onChange={e => setJsonInput(e.target.value)}
                placeholder="JSONをここに貼り付けてください..."
                onDrop={handleDrop}
                onDragOver={e => e.preventDefault()}
                onDragEnter={e => e.preventDefault()}
              />
              <button
                className="install-btn"
                onClick={installPlugin}
                disabled={!jsonInput.trim()}
              >
                インストール
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
