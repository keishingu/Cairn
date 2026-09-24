import { describe, expect, it } from 'vitest'
import { decideWorkspaceSwitch } from './notification-workspace'

describe('通知先ワークスペースの扱い', () => {
  it('指定が無い、または今と同じなら切り替えない', () => {
    expect(decideWorkspaceSwitch(undefined, 'ws-a', ['ws-a'])).toBe('stay')
    expect(decideWorkspaceSwitch('ws-a', 'ws-a', ['ws-a', 'ws-b'])).toBe('stay')
  })

  it('所属している別ワークスペースへ切り替える', () => {
    expect(decideWorkspaceSwitch('ws-b', 'ws-a', ['ws-a', 'ws-b'])).toBe('switch')
    expect(decideWorkspaceSwitch('ws-b', null, ['ws-b'])).toBe('switch')
  })

  it('未所属の ID は捨てる', () => {
    expect(decideWorkspaceSwitch('ws-x', 'ws-a', ['ws-a'])).toBe('reject')
    expect(decideWorkspaceSwitch('ws-x', null, [])).toBe('reject')
  })
})
