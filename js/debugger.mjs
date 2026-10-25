// CDP session ownership belongs to this extension. Never command/detach a foreign debugger.
const CHILD_TYPES = new Set(['page', 'iframe', 'worker', 'shared_worker', 'service_worker'])
const hasNumber = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value))
const isWorker = type => ['worker', 'shared_worker', 'service_worker'].includes(type)
const errorMessage = error => error?.message || String(error)
const sessionGone = error => /Session with given id not found|No session with given id|session.*(closed|not found)/i.test(errorMessage(error))
const unsupported = error => /wasn't found|Method not found|not supported/i.test(errorMessage(error))
const localeConflict = error => /Another locale override is already in effect/i.test(errorMessage(error))
const languageTag = locale => locale?.replaceAll('_', '-') || ''
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
    this.onUnexpectedDetach = null
    this.expectedDetach = new Set()
    this.notices = new Map()
    api.onEvent.addListener((source, method, params) => {
      this.handleEvent(source, method, params).catch(error => {
        this.record(source.tabId, 'CDP event', error)
      })
    })
    api.onDetach.addListener((source, reason) => {
      if (!Number.isInteger(source.tabId)) return
      const expected = this.expectedDetach.delete(source.tabId)
      this.notices.delete(source.tabId)
      if (this.owned.delete(source.tabId) && !expected) {
        this.problems.set(source.tabId, `Debugger detached: ${reason}`)
        this.onUnexpectedDetach?.(source.tabId, reason)
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

  notice(tabId, message) {
    const notes = this.notices.get(tabId) || []
    if (!notes.includes(message)) notes.push(message)
    if (notes.length > 12) notes.shift()
    this.notices.set(tabId, notes)
  }

  async nativeIdentity(tabId) {
    // Read from the extension's own browser context, never from the spoofed site.
    // Capture UA-CH so a language override does not accidentally remove it.
    const identity = { userAgent: navigator.userAgent }
    try {
      const data = navigator.userAgentData
      if (data) {
        const high = await data.getHighEntropyValues([
          'architecture', 'bitness', 'model', 'platformVersion',
          'fullVersionList', 'wow64',
        ])
        identity.userAgentMetadata = {
          brands: data.brands, mobile: data.mobile, platform: data.platform,
          ...high,
        }
      }
    } catch (error) {
      this.notice(tabId, 'UA Client Hints could not be read; language override may affect Client Hints.')
    }
    return identity
  }

  async applyTarget(state, sessionId, type = 'page') {
    if (sessionId && !state.children.has(sessionId)) return
    const config = state.config
    const worker = isWorker(type)
    const targetName = sessionId ? `${type} (${sessionId})` : 'main page'
    const commands = [
      ['Emulation.setTimezoneOverride', { timezoneId: config.timezone || '' }],
      // Chromium may share the locale override across worker targets.
      ...(worker ? [] : [['Emulation.setLocaleOverride', { locale: config.locale || '' }]]),
    ]
    if (!worker) {
      if (config.locale) {
        const identity = state.identity || await this.nativeIdentity(state.tabId)
        state.identity = identity
        commands.push(['Emulation.setUserAgentOverride', {
          ...identity, acceptLanguage: languageTag(config.locale),
        }])
      }
      commands.push(
        ['Network.enable', {}],
        ['Network.setExtraHTTPHeaders', { headers: {} }],
        validPosition(config)
          ? ['Emulation.setGeolocationOverride', {
              latitude: Number(config.lat), longitude: Number(config.lon), accuracy: 1,
            }]
          : ['Emulation.clearGeolocationOverride', {}],
      )
    }
    for (const [method, parameters] of commands) {
      if (sessionId && !state.children.has(sessionId)) break
      try {
        await this.send(state.tabId, sessionId, method, parameters)
      } catch (error) {
        if (sessionId && sessionGone(error)) {
          state.children.delete(sessionId)
          this.notice(state.tabId, `${type} session closed during configuration; skipped remaining commands.`)
          break
        }
        if (unsupported(error) && worker) {
          this.notice(state.tabId, `${type} does not support ${method}; skipped.`)
          continue
        }
        if (localeConflict(error)) {
          this.notice(state.tabId, `${type} locale override already active; command skipped.`)
          continue
        }
        this.record(state.tabId, `${targetName} ${method}`, error)
      }
    }
  }

  async configure(tabId, config = {}) {
    if (!Number.isInteger(tabId)) return
    let state = this.owned.get(tabId)
    if (!hasOverrides(config)) {
      if (state) {
        this.expectedDetach.add(tabId)
        this.owned.delete(tabId)
        try {
          await this.api.detach({ tabId })
        } catch (error) {
          this.expectedDetach.delete(tabId)
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
      state = { tabId, config, children: new Map(), errors: [], identity: null }
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
    this.notices.delete(tabId)
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
          if (!sessionGone(error) && !unsupported(error)) this.record(tabId, `Nested auto-attach for ${type}`, error)
        }
      }
    } finally {
      // Do not strand a newly attached target paused, even when an override fails.
      if (params.waitingForDebugger) {
        try {
          await this.send(tabId, sessionId, 'Runtime.runIfWaitingForDebugger')
        } catch (error) {
          if (!sessionGone(error)) this.record(tabId, `Resume ${type}`, error)
        }
      }
    }
  }

  getStatus(tabId) {
    const state = this.owned.get(tabId)
    if (!state) {
      return { attached: false, children: [], errors: [], notices: this.notices.get(tabId) || [], problem: this.problems.get(tabId) || null }
    }
    return {
      attached: true,
      children: [...state.children.values()],
      errors: [...state.errors],
      notices: [...(this.notices.get(tabId) || [])],
      problem: null,
    }
  }

  forget(tabId) {
    this.owned.delete(tabId)
    this.expectedDetach.delete(tabId)
    this.problems.delete(tabId)
    this.notices.delete(tabId)
  }
}
