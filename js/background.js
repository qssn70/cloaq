import { DebuggerManager } from './debugger.mjs'
import { resolveSiteConfiguration } from './siteIp.mjs'

const debuggerManager = new DebuggerManager(chrome.debugger)
const pending = new Map()
const revisions = new Map()

const getHostnameFromUrl = url => {
  try {
    const parsed = new URL(url)
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.hostname : null
  } catch {
    return null
  }
}

const applyForTab = async (tabId, url) => {
  const hostname = getHostnameFromUrl(url)
  if (!hostname) {
    await debuggerManager.configure(tabId)
    return
  }
  const storage = await chrome.storage.local.get([
    'configuration', 'timezone', 'locale', 'lat', 'lon',
    'siteConfigurations', 'enableScope', 'enabledSites',
  ])
  const enabled = (storage.enableScope || 'all') === 'all' ||
    (storage.enabledSites || []).includes(hostname)
  await debuggerManager.configure(
    tabId,
    enabled ? resolveSiteConfiguration(storage, hostname) : {}
  )
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
  pending.delete(tabId)
  revisions.delete(tabId)
  debuggerManager.forget(tabId)
})

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id || message?.type !== 'cloaq:debugger-status') return
  sendResponse(debuggerManager.getStatus(message.tabId))
})
