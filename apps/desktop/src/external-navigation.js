function getNavigationAction(url, appUrl) {
  let target
  let appOrigin

  try {
    target = new URL(url)
    appOrigin = new URL(appUrl).origin
  } catch {
    return 'deny'
  }

  if (target.origin === appOrigin) return 'allow'
  if (target.protocol === 'http:' || target.protocol === 'https:') return 'external'
  return 'deny'
}

function registerExternalNavigation(webContents, appUrl, openExternal) {
  function handleExternal(url) {
    void openExternal(url).catch(error => {
      console.error('Failed to open external URL', error)
    })
  }

  webContents.setWindowOpenHandler(({ url }) => {
    const action = getNavigationAction(url, appUrl)

    if (action === 'external') {
      handleExternal(url)
    }

    return { action: action === 'allow' ? 'allow' : 'deny' }
  })

  // 同一ウィンドウのリンクと HTTP リダイレクトも新規ウィンドウと同じ境界で扱う。
  const handleNavigation = (event) => {
    if (!event.isMainFrame) return
    const { url } = event
    const action = getNavigationAction(url, appUrl)
    if (action === 'allow') return
    event.preventDefault()
    if (action === 'external') handleExternal(url)
  }
  webContents.on('will-navigate', handleNavigation)
  webContents.on('will-redirect', handleNavigation)
}

module.exports = { getNavigationAction, registerExternalNavigation }
