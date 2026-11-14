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
  let authOrigin = null
  let authProvider = null

  function isAuthNavigation(url) {
    let target
    try {
      target = new URL(url)
      const callback = new URL(target.searchParams.get('redirect_to'))
      if (target.protocol === 'https:' && /^[a-z0-9-]+\.supabase\.co$/.test(target.hostname) &&
          target.pathname === '/auth/v1/authorize' &&
          ['google', 'apple'].includes(target.searchParams.get('provider')) &&
          callback.origin === new URL(appUrl).origin && callback.pathname === '/api/auth/callback') {
        authOrigin = target.origin
        authProvider = target.searchParams.get('provider')
        return true
      }
    } catch {
      // 継続中の認証遷移には redirect_to がない場合がある。
      try { target = new URL(url) } catch { return false }
    }
    if (!authOrigin || target.protocol !== 'https:') return false
    if (target.origin === authOrigin && target.pathname === '/auth/v1/callback') return true
    return (authProvider === 'google' && target.hostname === 'accounts.google.com') ||
      (authProvider === 'apple' && target.hostname === 'appleid.apple.com')
  }

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
    if (action === 'allow') {
      authOrigin = null
      authProvider = null
      return
    }
    if (isAuthNavigation(url)) return
    authOrigin = null
    authProvider = null
    event.preventDefault()
    if (action === 'external') handleExternal(url)
  }
  webContents.on('will-navigate', handleNavigation)
  webContents.on('will-redirect', handleNavigation)
}

module.exports = { getNavigationAction, registerExternalNavigation }
