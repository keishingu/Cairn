const { app, BrowserWindow, session } = require('electron')
const pkg = require('../package.json')

const APP_URL = process.env.DESKTOP_APP_URL || pkg.config?.appUrl || 'https://develop.oss-cairn.com'
const isDev = process.env.NODE_ENV === 'development'

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    title: 'Cairn',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  win.loadURL(APP_URL)

  if (isDev) {
    win.webContents.openDevTools()
  }
}

app.whenReady().then(() => {
  // Web Push (PushManager) の購読・通知許可ダイアログを許可する
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(permission === 'notifications' || permission === 'push')
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
