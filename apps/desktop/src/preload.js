const { contextBridge, ipcRenderer } = require('electron')

// ネイティブメニュー（⌘+数字）やキー横取り（Ctrl+Tab）からの操作を Web 側へ橋渡しする。
// Web は window.cairnDesktop?.on* を購読して navigate()/順送り を行う（use-app-shortcuts.ts）。
contextBridge.exposeInMainWorld('cairnDesktop', {
  onNavigate: (cb) => {
    const handler = (_event, action) => cb(action)
    ipcRenderer.on('cairn:navigate', handler)
    return () => ipcRenderer.removeListener('cairn:navigate', handler)
  },
  onSeq: (cb) => {
    const handler = (_event, dir) => cb(dir)
    ipcRenderer.on('cairn:seq', handler)
    return () => ipcRenderer.removeListener('cairn:seq', handler)
  },
  onToggleSidebar: (cb) => {
    const handler = () => cb()
    ipcRenderer.on('cairn:toggle-sidebar', handler)
    return () => ipcRenderer.removeListener('cairn:toggle-sidebar', handler)
  },
})
