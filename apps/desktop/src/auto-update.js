const { app, dialog } = require('electron')

// 起動時と、その後この間隔ごとに更新を確認する
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000

// 自動更新は本番ビルドのインストール版だけで動かす。
// dev ビルドは更新の配布先（electron-builder の publish）を持たず、
// `electron .` で起動した開発中のアプリは更新対象のパッケージではないため。
function isAutoUpdateEnabled({ isPackaged, deploymentEnv }) {
  return isPackaged === true && deploymentEnv === 'production'
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error)
}

// electron-updater は読み込むだけで app-update.yml を探しにいくため、有効なときだけ require する
function setupAutoUpdate({ deploymentEnv }) {
  if (!isAutoUpdateEnabled({ isPackaged: app.isPackaged, deploymentEnv })) {
    return { enabled: false, checkManually: null }
  }

  const { autoUpdater } = require('electron-updater')
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  // 「アップデートを確認」から始めた確認の結果だけをダイアログで返す。
  // 定期確認の失敗（オフラインなど）でダイアログを出し続けないよう、そちらはログに残す。
  let manualCheckInProgress = false

  autoUpdater.on('error', (error) => {
    console.error('アップデートの確認に失敗しました:', error)
    if (!manualCheckInProgress) return
    manualCheckInProgress = false
    dialog.showErrorBox('アップデートを確認できませんでした', errorMessage(error))
  })

  autoUpdater.on('update-not-available', () => {
    if (!manualCheckInProgress) return
    manualCheckInProgress = false
    dialog.showMessageBox({
      type: 'info',
      message: '最新のバージョンです',
      detail: `Cairn ${app.getVersion()} をお使いです。`,
    })
  })

  autoUpdater.on('update-available', (info) => {
    if (!manualCheckInProgress) return
    manualCheckInProgress = false
    dialog.showMessageBox({
      type: 'info',
      message: `新しいバージョン ${info.version} をダウンロードしています`,
      detail: 'ダウンロードが終わったら、再起動して更新するか確認します。',
    })
  })

  autoUpdater.on('update-downloaded', async (info) => {
    const { response } = await dialog.showMessageBox({
      type: 'info',
      buttons: ['再起動して更新', 'あとで'],
      defaultId: 0,
      cancelId: 1,
      message: `Cairn ${info.version} の準備ができました`,
      detail: '「あとで」を選んだ場合は、次にアプリを終了したときに更新されます。',
    })
    if (response === 0) autoUpdater.quitAndInstall()
  })

  const check = () => {
    autoUpdater.checkForUpdates().catch(() => {
      // 失敗は 'error' イベントで扱う（ここで握りつぶしているわけではない）
    })
  }

  check()
  setInterval(check, CHECK_INTERVAL_MS)

  return {
    enabled: true,
    checkManually: () => {
      manualCheckInProgress = true
      check()
    },
  }
}

module.exports = { isAutoUpdateEnabled, setupAutoUpdate }
