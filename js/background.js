import { DebuggerManager } from './debugger.mjs'
import { resolveSiteConfiguration } from './siteIp.mjs'

const debuggerManager = new DebuggerManager(chrome.debugger)
const pending = new Map()
const revisions = new Map()
const retryAttempts = new Map()
const blockedTabs = new Set()
const RETRY_PREFIX = 'cloaq-reconnect-'
const MAX_RETRIES = 3
const recoveryAlarm = tabId => `${RETRY_PREFIX}${tabId}`
const cancelRecovery = tabId => {
  retryAttempts.delete(tabId)
  chrome.alarms.clear(recoveryAlarm(tabId)).catch(() => {})
}
const scheduleRecovery = (tabId, reason) => {
  if (blockedTabs.has(tabId)) return
  const attempts = retryAttempts.get(tabId) || 0
  if (attempts >= MAX_RETRIES) {
    console.warn('Cloaq: automatic debugger reconnect exhausted', tabId, reason)
    return
  }
  retryAttempts.set(tabId, attempts + 1)
  chrome.alarms.create(recoveryAlarm(tabId), {delayInMinutes: 0.5 * (attempts + 1)})
}
debuggerManager.onUnexpectedDetach = (tabId, reason) => {
  if (reason === 'canceled_by_user' || reason === 'target_closed') {
    cancelRecovery(tabId)
    if (reason === 'canceled_by_user') blockedTabs.add(tabId)
    return
  }
  scheduleRecovery(tabId, reason)
}
chrome.alarms.onAlarm.addListener(async alarm => {
  if (!alarm.name.startsWith(RETRY_PREFIX)) return
  const tabId = Number(alarm.name.slice(RETRY_PREFIX.length))
  if (!Number.isInteger(tabId) || blockedTabs.has(tabId)) return
  let tab
  try { tab = await chrome.tabs.get(tabId) } catch { cancelRecovery(tabId); return }
  if (!getHostnameFromUrl(tab.url)) { cancelRecovery(tabId); return }
  queueTab(tabId, tab.url)
  const queued = pending.get(tabId)
  if (queued) await queued.catch(() => {})
  const state = debuggerManager.getStatus(tabId)
  if (state.attached) cancelRecovery(tabId)
  else if (/already attached|another extension|DevTools/i.test(state.problem || '')) {
    cancelRecovery(tabId)
    blockedTabs.add(tabId)
  } else if (retryAttempts.has(tabId)) scheduleRecovery(tabId, state.problem)
})


const getHostnameFromUrl = url => {
  try {
    const parsed = new URL(url)
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.hostname : null
  } catch {
    return null
  }
}

const applyForTab = async (tabId, url) => {
  if (blockedTabs.has(tabId)) return
  const hostname = getHostnameFromUrl(url)
  if (!hostname) {
    cancelRecovery(tabId)
    await debuggerManager.configure(tabId)
    return
  }
  const storage = await chrome.storage.local.get([
    'configuration', 'timezone', 'locale', 'lat', 'lon',
    'siteConfigurations', 'enableScope', 'enabledSites',
  ])
  const enabled = (storage.enableScope || 'all') === 'all' ||
    (storage.enabledSites || []).includes(hostname)
  const config = enabled ? resolveSiteConfiguration(storage, hostname) : {}
  if (!enabled || (!config.timezone && !config.locale && !(config.lat != null && config.lon != null))) {
    cancelRecovery(tabId)
    blockedTabs.delete(tabId)
  }
  await debuggerManager.configure(tabId, config)
}

const queueTab = (tabId, url) => {
  if (!Number.isInteger(tabId)) return
  const revision = (revisions.get(tabId) || 0) + 1
  revisions.set(tabId, revision)
  const previous = pending.get(tabId) || Promise.resolve()
  const next = previous.catch(() => {}).then(() => {
    if (revisions.get(tabId) !== revision) return
    return applyForTab(tabId, url)
  })
  pending.set(tabId, next)
  next.catch(error => console.warn('Cloaq: cannot configure tab', tabId, error))
    .finally(() => {
      if (pending.get(tabId) === next) pending.delete(tabId)
    })
}

const refreshTabs = () => chrome.tabs.query({}).then(tabs => {
  for (const tab of tabs) {
    if (Number.isInteger(tab.id)) queueTab(tab.id, tab.url)
  }
}).catch(error => console.warn('Cloaq: cannot refresh tabs', error))

chrome.runtime.onInstalled.addListener(details => {
  if (details.reason === 'install') chrome.tabs.create({ active: true, url: 'html/info.html' })
  refreshTabs()
})
chrome.runtime.onStartup.addListener(refreshTabs)

for (const event of [
  chrome.webNavigation.onBeforeNavigate,
  chrome.webNavigation.onCommitted,
  chrome.webNavigation.onHistoryStateUpdated,
]) {
  event.addListener(details => {
    if (details.frameId === 0) queueTab(details.tabId, details.url)
  })
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return
  const relevant = [
    'configuration', 'timezone', 'locale', 'lat', 'lon',
    'siteConfigurations', 'enableScope', 'enabledSites',
  ]
  if (relevant.some(key => key in changes)) refreshTabs()
})

chrome.tabs.onRemoved.addListener(tabId => {
  cancelRecovery(tabId)
  blockedTabs.delete(tabId)
  pending.delete(tabId)
  revisions.delete(tabId)
  debuggerManager.forget(tabId)
})

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) return
  if (message?.type === 'cloaq:debugger-status') {
    sendResponse({...debuggerManager.getStatus(message.tabId), attempts:retryAttempts.get(message.tabId) || 0, blocked:blockedTabs.has(message.tabId)})
    return
  }
  if (message?.type === 'cloaq:retry-debugger') {
    const tabId = message.tabId
    if (!Number.isInteger(tabId)) { sendResponse({error:'Invalid tab'});return }
    blockedTabs.delete(tabId)
    cancelRecovery(tabId)
    chrome.tabs.get(tabId).then(tab => {
      if (!getHostnameFromUrl(tab.url)) throw new Error('Open a website first')
      queueTab(tabId,tab.url)
      sendResponse({ok:true})
    }).catch(error => sendResponse({error:error.message}))
    return true
  }
})
