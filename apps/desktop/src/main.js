const { app, BrowserWindow, Menu, session, ipcMain, nativeImage, shell } = require('electron')
const path = require('path')
const pkg = require('../package.json')
const { registerExternalNavigation } = require('./external-navigation')
const { isSameOrigin, registerPermissionPolicy } = require('./permission-policy')
const { resolveAppIconFile } = require('./app-icon')

const APP_URL = process.env.DESKTOP_APP_URL || pkg.config?.appUrl || 'https://develop.oss-cairn.com'
const DEPLOYMENT_ENV = pkg.config?.deploymentEnv || 'development'
const isDev = process.env.NODE_ENV === 'development'
const isMac = process.platform === 'darwin'

// サイドメニューへのジャンプ（⌘/Ctrl + 数字）。番号は表示順と一致させる。
// クリック時はフォーカス中ウィンドウへ navigate アクションを送る（preload 経由で Web が受ける）。
const NAV_ITEMS = [
  { label: 'チャット一覧',     accelerator: 'CmdOrCtrl+1', action: 'chats' },
  { label: 'プロジェクト一覧', accelerator: 'CmdOrCtrl+2', action: 'projects' },
  { label: 'カレンダー',       accelerator: 'CmdOrCtrl+3', action: 'calendar' },
  { label: 'カンバン',         accelerator: 'CmdOrCtrl+4', action: 'kanban' },
  { label: 'マイタスク',       accelerator: 'CmdOrCtrl+5', action: 'tasks' },
  { label: 'ファイル',         accelerator: 'CmdOrCtrl+6', action: 'files' },
  { label: 'ギャラリー',       accelerator: 'CmdOrCtrl+7', action: 'gallery' },
  { label: 'AIアシスタント',   accelerator: 'CmdOrCtrl+8', action: 'ai' },
  { label: 'メンバー',         accelerator: 'CmdOrCtrl+9', action: 'members' },
  { label: '設定',             accelerator: 'CmdOrCtrl+,', action: 'settings' },
  // ⌘0 はズームリセット（resetZoom ロール）と衝突するため割り当てない。
  // ユーザーメニュー(⌘⌥0)・サイドバー(⌘B) はキーハンドラ/専用メニューで処理する。
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
        {
          label: 'サイドバーの折りたたみ',
          accelerator: 'CmdOrCtrl+B',
          click: (_item, win) => win?.webContents.send('cairn:toggle-sidebar'),
        },
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

// Windows タスクバーの未読オーバーレイ（赤ドット）。読み込みは一度だけ。
// macOS/Linux では未使用（Web の navigator.setAppBadge が Dock/ランチャーに数字を出す）。
let overlayDot = null
function getOverlayDot() {
  if (!overlayDot) {
    overlayDot = nativeImage.createFromPath(path.join(__dirname, 'assets', 'badge-dot.png'))
  }
  return overlayDot
}

// 未読バッジ数を受け取り、Windows のみタスクバーにオーバーレイを出す。
// Electron の app.badgeCount / navigator.setAppBadge は Windows 非対応のため、
// setOverlayIcon で代替する（今回は件数によらずドット表示。数字化は将来対応）。
function registerBadgeBridge() {
  ipcMain.on('cairn:set-badge', (event, count) => {
    if (process.platform !== 'win32') return
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win || win.isDestroyed()) return
    const n = typeof count === 'number' && Number.isFinite(count) ? count : 0
    if (n > 0) {
      win.setOverlayIcon(getOverlayDot(), `未読 ${n} 件`)
    } else {
      win.setOverlayIcon(null, '')
    }
  })
}

// Web の外観設定（テーマ・アクセント）に合わせて Dock / タスクバーのアイコンを差し替える。
// Finder やスタートメニューに出る同梱アイコンは変えられないため、実行中の表示だけが追従する。
function registerAppIconBridge() {
  ipcMain.on('cairn:set-app-icon', (event, appearance) => {
    // 外部サイトへ遷移したフレームからはアプリのアイコンを変えさせない
    if (!isSameOrigin(event.senderFrame?.url ?? '', APP_URL)) return
    const file = resolveAppIconFile(appearance, DEPLOYMENT_ENV)
    if (!file) return
    const image = nativeImage.createFromPath(file)
    if (image.isEmpty()) {
      console.error(`アプリアイコンを読み込めませんでした: ${file}`)
      return
    }
    if (isMac) {
      app.dock?.setIcon(image)
    } else {
      const win = BrowserWindow.fromWebContents(event.sender)
      if (win && !win.isDestroyed()) win.setIcon(image)
    }
  })
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

  registerExternalNavigation(win.webContents, APP_URL, url => shell.openExternal(url))
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
  // Cairn が使用する権限だけを同一オリジンに許可する。
  // Clipboard API は clipboard-sanitized-write の許可がないと Desktop 版で失敗する。
  registerPermissionPolicy(session.defaultSession, APP_URL)

  registerBadgeBridge()
  registerAppIconBridge()
  buildMenu()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
