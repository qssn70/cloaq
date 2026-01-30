import { attachDebugger } from './debugger.js'

const getHostnameFromUrl = (url) => {
  if (!url) return null
  try {
    const parsedUrl = new URL(url)
    if (parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:') {
      return parsedUrl.hostname
    }
    return null
  } catch (error) {
    return null
  }
}

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.tabs.create({
      active: true,
      url: 'html/info.html',
    })
  }
})

chrome.webNavigation.onBeforeNavigate.addListener((details) => {
  const hostname = getHostnameFromUrl(details.url)
  chrome.storage.local.get(
    [
      'activationMode',
      'enabledSites',
      'timezone',
      'locale',
      'lat',
      'lon',
      'siteConfigurations',
    ],
    (storage) => {
      if (storage.activationMode === 'siteOnly') {
        const enabledSites = storage.enabledSites || {}
        if (!hostname || !enabledSites[hostname]) {
          return
        }
      }
      const siteConfig = hostname
        ? storage.siteConfigurations?.[hostname]
        : null
      const config = siteConfig || storage
      chrome.debugger.getTargets((tabs) => {
        const currentTab = tabs.find((obj) => obj.tabId === details.tabId)
        if (!currentTab?.attached) {
          attachDebugger(
            details.tabId,
            config.timezone,
            config.locale,
            config.lat,
            config.lon
          )
        }
      })
    }
  )
})

// chrome.webNavigation.onCommitted.addListener((details) => {
//   if (
//     details.url?.startsWith('chrome://') ||
//     details.url?.startsWith('chrome-extension://') ||
//     details.url?.startsWith('https://chromewebstore.google.com/')
//   )
//     return

//   chrome.storage.local.get(
//     ['useDebuggerApi', 'timezone', 'lat', 'lon'],
//     (storage) => {
//       if (!storage.useDebuggerApi) {
//         if (storage.timezone) {
//           chrome.scripting.executeScript({
//             target: { tabId: details.tabId, allFrames: true },
//             world: 'MAIN',
//             injectImmediately: true,
//             func: spoofTimezone,
//             args: [storage.timezone],
//           })
//         }

//         if (storage.lat && storage.lon) {
//           chrome.scripting.executeScript({
//             target: { tabId: details.tabId, allFrames: true },
//             world: 'MAIN',
//             injectImmediately: true,
//             func: spoofGeolocation,
//             args: [
//               {
//                 latitude: storage.lat,
//                 longitude: storage.lon,
//               },
//             ],
//           })
//         }
//       }
//     }
//   )
// })
