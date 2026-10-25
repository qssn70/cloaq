// CDP session ownership belongs to this extension. Never command/detach a foreign debugger.
const CHILD_TYPES = new Set(['page', 'iframe', 'worker', 'shared_worker', 'service_worker'])
const hasNumber = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value))
const validPosition = config => hasNumber(config.lat) && hasNumber(config.lon) &&
  Number(config.lat) >= -90 && Number(config.lat) <= 90 &&
  Number(config.lon) >= -180 && Number(config.lon) <= 180

export const hasOverrides = (config = {}) =>
  Boolean(config.timezone || config.locale || validPosition(config))

export class DebuggerManager {
  constructor(api) {
    this.api = api
    this.owned = new Map()
    this.problems = new Map()
    api.onEvent.addListener((source, method, params) => {
      this.handleEvent(source, method, params).catch(error => {
        this.record(source.tabId, 'CDP event', error)
      })
    })
    api.onDetach.addListener((source, reason) => {
      if (!Number.isInteger(source.tabId)) return
      if (this.owned.delete(source.tabId)) {
        this.problems.set(source.tabId, `Debugger detached: ${reason}`)
      }
    })
  }

  record(tabId, context, error) {
    const message = `${context}: ${error?.message || String(error)}`
    const state = this.owned.get(tabId)
    if (state) {
      state.errors.push(message)
      if (state.errors.length > 15) state.errors.shift()
    } else {
      this.problems.set(tabId, message)
    }
    console.warn('Cloaq:', message)
  }

  async send(tabId, sessionId, method, parameters = {}) {
    const target = sessionId ? { tabId, sessionId } : { tabId }
    return this.api.sendCommand(target, method, parameters)
  }

  async applyTarget(state, sessionId, type = 'page') {
    const config = state.config
    const targetName = sessionId ? `${type} (${sessionId})` : 'main page'
    const commands = [
      ['Emulation.setTimezoneOverride', { timezoneId: config.timezone || '' }],
      ['Emulation.setLocaleOverride', { locale: config.locale || '' }],
      validPosition(config)
        ? ['Emulation.setGeolocationOverride', {
            latitude: Number(config.lat), longitude: Number(config.lon), accuracy: 1,
          }]
        : ['Emulation.clearGeolocationOverride', {}],
    ]
    // A worker may not implement every Emulation method. Keep applying the others.
    for (const [method, parameters] of commands) {
      try {
        await this.send(state.tabId, sessionId, method, parameters)
      } catch (error) {
        this.record(state.tabId, `${targetName} ${method}`, error)
      }
    }
  }

  async configure(tabId, config = {}) {
    if (!Number.isInteger(tabId)) return
    let state = this.owned.get(tabId)
    if (!hasOverrides(config)) {
      if (state) {
        this.owned.delete(tabId)
        try {
          await this.api.detach({ tabId })
        } catch (error) {
          this.record(tabId, 'Detach', error)
        }
      }
      this.problems.delete(tabId)
      return
    }

    if (!state) {
      // "attached" does not mean it is OUR debugger. Never steal that session.
      const targets = await this.api.getTargets()
      if (targets.some(target => target.tabId === tabId && target.attached)) {
        this.problems.set(tabId, 'A debugger is already attached to this tab. Cloaq did not take control.')
        return
      }
      try {
        await this.api.attach({ tabId }, '1.3')
      } catch (error) {
        this.problems.set(tabId, `Cannot attach (DevTools or another extension may be using this tab): ${error.message}`)
        return
      }
      state = { tabId, config, children: new Map(), errors: [] }
      this.owned.set(tabId, state)
      this.problems.delete(tabId)
      await this.applyTarget(state)
      try {
        // Child targets (OOPIFs, workers) need their own CDP sessions and overrides.
        // Pausing newly attached children prevents early scripts using the old values.
        await this.send(tabId, null, 'Target.setAutoAttach', {
          autoAttach: true, waitForDebuggerOnStart: true, flatten: true,
        })
      } catch (error) {
        this.record(tabId, 'Enable child target attachment', error)
      }
      return
    }

    state.config = config
    state.errors = []
    await this.applyTarget(state)
    for (const [sessionId, type] of state.children) {
      await this.applyTarget(state, sessionId, type)
    }
  }

  async handleEvent(source, method, params = {}) {
    const tabId = source?.tabId
    const state = this.owned.get(tabId)
    if (!state) return

    if (method === 'Target.detachedFromTarget') {
      if (params.sessionId) state.children.delete(params.sessionId)
      return
    }
    if (method !== 'Target.attachedToTarget' || !params.sessionId) return

    const sessionId = params.sessionId
    const type = params.targetInfo?.type || 'other'
    const supported = CHILD_TYPES.has(type)
    if (supported) state.children.set(sessionId, type)

    try {
      if (supported) {
        await this.applyTarget(state, sessionId, type)
        try {
          // Auto-attach is hierarchical: children may spawn their own workers.
          await this.send(tabId, sessionId, 'Target.setAutoAttach', {
            autoAttach: true, waitForDebuggerOnStart: true, flatten: true,
          })
        } catch (error) {
          this.record(tabId, `Nested auto-attach for ${type}`, error)
        }
      }
    } finally {
      // Do not strand a newly attached target paused, even when an override fails.
      if (params.waitingForDebugger) {
        try {
          await this.send(tabId, sessionId, 'Runtime.runIfWaitingForDebugger')
        } catch (error) {
          this.record(tabId, `Resume ${type}`, error)
        }
      }
    }
  }

  getStatus(tabId) {
    const state = this.owned.get(tabId)
    if (!state) {
      return { attached: false, children: [], errors: [], problem: this.problems.get(tabId) || null }
    }
    return {
      attached: true,
      children: [...state.children.values()],
      errors: [...state.errors],
      problem: null,
    }
  }

  forget(tabId) {
    this.owned.delete(tabId)
    this.problems.delete(tabId)
  }
}
