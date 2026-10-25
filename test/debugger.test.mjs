import assert from 'node:assert/strict'
import test from 'node:test'
import { DebuggerManager, hasOverrides } from '../js/debugger.mjs'

const mockDebugger = ({ foreignAttached = false, rejects = [] } = {}) => {
  let onEvent, onDetach
  const calls = []
  const api = {
    onEvent: { addListener(handler) { onEvent = handler } },
    onDetach: { addListener(handler) { onDetach = handler } },
    async getTargets() { return [{ tabId: 10, attached: foreignAttached }] },
    async attach(target) { calls.push(['attach', target]); if (foreignAttached) throw Error('occupied') },
    async detach(target) { calls.push(['detach', target]) },
    async sendCommand(target, method, parameters) {
      calls.push([method, target, parameters])
      if (rejects.includes(method)) throw Error('unsupported')
    },
  }
  return { api, calls, dispatch: (source, method, params) => onEvent(source, method, params),
    detachEvent: (source, reason) => onDetach(source, reason) }
}

test('only valid config requires a debugger', () => {
  assert.equal(hasOverrides({}), false)
  assert.equal(hasOverrides({ lat: 0, lon: 0 }), true)
  assert.equal(hasOverrides({ lat: 'NaN', lon: 42 }), false)
})

test('attaches once, configures main target, and detaches on browser default', async () => {
  const mock = mockDebugger()
  const manager = new DebuggerManager(mock.api)
  await manager.configure(10, { timezone: 'Asia/Tokyo', locale: 'ja-JP', lat: 0, lon: 0 })
  assert.equal(mock.calls.filter(c => c[0] === 'attach').length, 1)
  assert.ok(mock.calls.some(c => c[0] === 'Target.setAutoAttach' && c[2].flatten === true))
  assert.ok(mock.calls.some(c => c[0] === 'Emulation.setGeolocationOverride' && c[2].latitude === 0))
  await manager.configure(10, { timezone: 'Europe/London' })
  assert.equal(mock.calls.filter(c => c[0] === 'attach').length, 1)
  assert.ok(mock.calls.some(c => c[0] === 'Emulation.clearGeolocationOverride'))
  await manager.configure(10, {})
  assert.equal(mock.calls.filter(c => c[0] === 'detach').length, 1)
  assert.equal(manager.getStatus(10).attached, false)
})

test('does not detach or send commands to a debugger owned by someone else', async () => {
  const mock = mockDebugger({ foreignAttached: true })
  const manager = new DebuggerManager(mock.api)
  await manager.configure(10, { locale: 'fr-FR' })
  await manager.configure(10, {})
  assert.equal(mock.calls.length, 0)
  assert.match(manager.getStatus(10).problem || '', /already attached|^$/)
})

test('auto-attach configures iframe and worker sessions, then resumes them', async () => {
  const mock = mockDebugger()
  const manager = new DebuggerManager(mock.api)
  await manager.configure(10, { timezone: 'Asia/Seoul' })
  await manager.handleEvent({ tabId: 10 }, 'Target.attachedToTarget', {
    sessionId: 'frame-1', waitingForDebugger: true, targetInfo: { type: 'iframe' },
  })
  await manager.handleEvent({ tabId: 10, sessionId: 'frame-1' }, 'Target.attachedToTarget', {
    sessionId: 'worker-2', waitingForDebugger: true, targetInfo: { type: 'worker' },
  })
  assert.deepEqual(manager.getStatus(10).children.sort(), ['iframe', 'worker'])
  for (const sessionId of ['frame-1', 'worker-2']) {
    assert.ok(mock.calls.some(c => c[0] === 'Emulation.setTimezoneOverride' && c[1].sessionId === sessionId))
    assert.ok(mock.calls.some(c => c[0] === 'Runtime.runIfWaitingForDebugger' && c[1].sessionId === sessionId))
  }
  await manager.handleEvent({ tabId: 10 }, 'Target.detachedFromTarget', { sessionId: 'worker-2' })
  assert.deepEqual(manager.getStatus(10).children, ['iframe'])
})

test('unsupported worker override still allows resume and records a warning', async () => {
  const mock = mockDebugger({ rejects: ['Emulation.setLocaleOverride'] })
  const manager = new DebuggerManager(mock.api)
  await manager.configure(10, { locale: 'en-US' })
  await manager.handleEvent({ tabId: 10 }, 'Target.attachedToTarget', {
    sessionId: 'worker-1', waitingForDebugger: true, targetInfo: { type: 'worker' },
  })
  assert.ok(mock.calls.some(c => c[0] === 'Runtime.runIfWaitingForDebugger' && c[1].sessionId === 'worker-1'))
  assert.ok(manager.getStatus(10).errors.some(e => e.includes('setLocaleOverride')))
  mock.detachEvent({ tabId: 10 }, 'replaced_with_devtools')
  assert.equal(manager.getStatus(10).attached, false)
  assert.match(manager.getStatus(10).problem, /replaced_with_devtools/)
})
