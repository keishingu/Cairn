const { contextBridge, ipcRenderer } = require('electron')

// ネイティブメニュー（⌘+数字）からのナビゲーションを Web 側へ橋渡しする。
// Web は window.cairnDesktop?.onNavigate を購読して navigate() を呼ぶ（use-app-shortcuts.ts）。
contextBridge.exposeInMainWorld('cairnDesktop', {
  onNavigate: (cb) => {
    const handler = (_event, action) => cb(action)
    ipcRenderer.on('cairn:navigate', handler)
    return () => ipcRenderer.removeListener('cairn:navigate', handler)
  },
})
