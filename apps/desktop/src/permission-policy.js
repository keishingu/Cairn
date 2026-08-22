const ALLOWED_PERMISSIONS = new Set([
  'clipboard-sanitized-write',
  'notifications',
  'push',
])

function isSameOrigin(url, appUrl) {
  try {
    return new URL(url).origin === new URL(appUrl).origin
  } catch {
    return false
  }
}

function isPermissionAllowed(permission, requestingUrl, appUrl) {
  return ALLOWED_PERMISSIONS.has(permission) && isSameOrigin(requestingUrl, appUrl)
}

function registerPermissionPolicy(electronSession, appUrl) {
  electronSession.setPermissionCheckHandler((webContents, permission, requestingOrigin, details) => {
    const requestingUrl = details.requestingUrl || requestingOrigin || webContents?.getURL() || ''
    return isPermissionAllowed(permission, requestingUrl, appUrl)
  })

  electronSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
    const requestingUrl = details.requestingUrl || webContents.getURL()
    callback(isPermissionAllowed(permission, requestingUrl, appUrl))
  })
}

module.exports = { isPermissionAllowed, registerPermissionPolicy }
