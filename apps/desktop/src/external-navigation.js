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
  webContents.setWindowOpenHandler(({ url }) => {
    const action = getNavigationAction(url, appUrl)

    if (action === 'external') {
      void openExternal(url).catch(error => {
        console.error(`Failed to open external URL: ${url}`, error)
      })
    }

    return { action: action === 'allow' ? 'allow' : 'deny' }
  })
}

module.exports = { getNavigationAction, registerExternalNavigation }
