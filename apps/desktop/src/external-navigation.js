function getNavigationAction(url, appUrl) {
  try {
    const target = new URL(url)
    if (target.username || target.password) return 'deny'
    if (target.origin === new URL(appUrl).origin) return 'allow'
    if (target.protocol === 'http:' || target.protocol === 'https:') return 'external'
  } catch {}
  return 'deny'
}

function isAuthSender(event, webContents, appUrl) {
  return event.sender === webContents && event.senderFrame === webContents.mainFrame &&
    getNavigationAction(event.senderFrame?.url ?? '', appUrl) === 'allow'
}

function registerExternalNavigation(webContents, appUrl, openExternal) {
  let auth = null
  const providerHost = { google: 'accounts.google.com', apple: 'appleid.apple.com' }
  const safeUrl = url => {
    try {
      const parsed = new URL(url)
      if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.port) return null
      return parsed
    } catch { return null }
  }
  const isProvider = (url, provider) => url.hostname === providerHost[provider]
  const clearAuth = () => { auth = null }
  const handleExternal = url => {
    void openExternal(url).catch(error => console.error('Failed to open external URL', error))
  }
  async function loadAuth(target, attempt) {
    auth = attempt
    try {
      await webContents.loadURL(target.href)
    } catch (error) {
      if (auth === attempt) clearAuth()
      throw error
    }
  }

  // Web 側で SDK が生成した URL と設定済み Supabase origin を受け取り、開始先を検証する。
  async function startAuth(url, supabaseUrl, provider) {
    clearAuth()
    const target = safeUrl(url)
    const supabase = safeUrl(supabaseUrl)
    if (!target || !supabase || !providerHost[provider] ||
        supabase.pathname !== '/' || supabase.search || supabase.hash) throw new Error('Invalid OAuth configuration')
    let validStart = isProvider(target, provider)
    if (target.origin === supabase.origin && target.pathname === '/auth/v1/authorize' && target.searchParams.get('provider') === provider) {
      try {
        const callback = new URL(target.searchParams.get('redirect_to'))
        validStart = !callback.username && !callback.password && callback.origin === new URL(appUrl).origin && callback.pathname === '/api/auth/callback'
      } catch { validStart = false }
    }
    if (!validStart) throw new Error('Invalid OAuth URL')
    await loadAuth(target, { origin: supabase.origin, provider, expires: Date.now() + 10 * 60 * 1000 })
  }

  async function startCalendarAuth(url) {
    clearAuth()
    const target = safeUrl(url)
    try {
      const callback = new URL(target?.searchParams.get('redirect_uri'))
      if (!target || !isProvider(target, 'google') || target.pathname !== '/o/oauth2/v2/auth' ||
          callback.username || callback.password || callback.origin !== new URL(appUrl).origin ||
          callback.pathname !== '/api/calendar/google/callback') throw new Error('Invalid calendar OAuth URL')
    } catch { throw new Error('Invalid calendar OAuth URL') }
    await loadAuth(target, { origin: null, provider: 'google', expires: Date.now() + 10 * 60 * 1000 })
  }

  webContents.setWindowOpenHandler(({ url }) => {
    const action = getNavigationAction(url, appUrl)
    if (action === 'external') { clearAuth(); handleExternal(url) }
    return { action: action === 'allow' ? 'allow' : 'deny' }
  })
  const handleNavigation = event => {
    if (!event.isMainFrame) return
    const { url } = event
    const action = getNavigationAction(url, appUrl)
    if (action === 'allow') { clearAuth(); return }
    const target = safeUrl(url)
    if (auth && Date.now() < auth.expires && target &&
        ((target.origin === auth.origin && target.pathname === '/auth/v1/callback') || isProvider(target, auth.provider))) return
    clearAuth()
    event.preventDefault()
    if (action === 'external') handleExternal(url)
  }
  webContents.on('will-navigate', handleNavigation)
  webContents.on('will-redirect', handleNavigation)
  return { startAuth, startCalendarAuth }
}

module.exports = { getNavigationAction, isAuthSender, registerExternalNavigation }
