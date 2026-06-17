const { app, BrowserWindow, Menu, session } = require('electron')
const path = require('path')
const pkg = require('../package.json')

const APP_URL = process.env.DESKTOP_APP_URL || pkg.config?.appUrl || 'https://develop.oss-cairn.com'
const isDev = process.env.NODE_ENV === 'development'
const isMac = process.platform === 'darwin'

// サイドメニューへのジャンプ（⌘/Ctrl + 数字）。番号は表示順と一致させる。
// クリック時はフォーカス中ウィンドウへ navigate アクションを送る（preload 経由で Web が受ける）。
const NAV_ITEMS = [
  { label: 'プロジェクト一覧', accelerator: 'CmdOrCtrl+1', action: 'projects' },
  { label: 'カレンダー',       accelerator: 'CmdOrCtrl+2', action: 'calendar' },
  { label: 'カンバン',         accelerator: 'CmdOrCtrl+3', action: 'kanban' },
  { label: 'マイタスク',       accelerator: 'CmdOrCtrl+4', action: 'tasks' },
  { label: 'チャット一覧',     accelerator: 'CmdOrCtrl+5', action: 'chats' },
  { label: 'ファイル',         accelerator: 'CmdOrCtrl+6', action: 'files' },
  { label: 'ギャラリー',       accelerator: 'CmdOrCtrl+7', action: 'gallery' },
  { label: 'AIアシスタント',   accelerator: 'CmdOrCtrl+8', action: 'ai' },
  { label: 'メンバー',         accelerator: 'CmdOrCtrl+9', action: 'members' },
  { label: 'プロフィール',     accelerator: 'CmdOrCtrl+0', action: 'settings' },
  { label: '設定',             accelerator: 'CmdOrCtrl+,', action: 'settings' },
]

function buildMenu() {
  const navSubmenu = NAV_ITEMS.map(({ label, accelerator, action }) => ({
    label,
    accelerator,
    click: (_item, win) => win?.webContents.send('cairn:navigate', action),
  }))

  const template = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    { role: 'editMenu' },
    {
      label: '表示',
      submenu: [
        ...navSubmenu,
        { type: 'separator' },
        { role: 'reload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    { role: 'windowMenu' },
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    title: 'Cairn',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  })

  win.loadURL(APP_URL)

  // Desktop 特権: ブラウザがタブ切替に使う Ctrl+Tab / Ctrl+Shift+Tab を横取りし、
  // チャンネル・会話の順送りに割り当てる（Web 版ではブラウザに奪われ実現できない）
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown' || !input.control || input.key !== 'Tab') return
    event.preventDefault()
    win.webContents.send('cairn:seq', input.shift ? 'prev' : 'next')
  })

  if (isDev) {
    win.webContents.openDevTools()
  }
}

app.whenReady().then(() => {
  // Web Push (PushManager) の購読・通知許可ダイアログを許可する
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(permission === 'notifications' || permission === 'push')
  })

  buildMenu()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
