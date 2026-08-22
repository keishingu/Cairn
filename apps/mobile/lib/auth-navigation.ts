let pending = false

export function beginPostAuthNavigation(): void {
  pending = true
}

export function completePostAuthNavigation(): void {
  pending = false
}

export function isPostAuthNavigationPending(): boolean {
  return pending
}
