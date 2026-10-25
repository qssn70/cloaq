import {evaluateFingerprint} from './fingerprintChecks.mjs'
import {parseCoordinate} from './coordinates.mjs'
import {readSiteEgressIp} from './siteIp.mjs'
import { createIpMatcher } from './popupIp.js'
import locationsConfigurations from './locationsConfigurations.js'
import countryLocales from './countryLocales.js'
import { normalizeSiteHostname, normalizeEnabledSites, updateEnabledSite, collectSiteOptions } from './siteAllowlist.mjs'

const extensionVersion = chrome.runtime.getManifest().version
document.getElementById('extensionVersion').textContent = `v${extensionVersion}`

const reloadButton = document.getElementById('reloadButton')
const infoButton = document.getElementById('infoButton')
const scopeSelect = document.querySelector('select[name="scope"]')
const siteScopeOption = document.getElementById('siteScopeOption')
const siteScopeLabel = document.getElementById('siteScopeLabel')
const activationScopeSelect = document.querySelector(
  'select[name="activationScope"]'
)
const enableSiteCheckbox = document.getElementById('enableSiteCheckbox')
const enableSiteLabel = document.getElementById('enableSiteLabel')
const enableSiteNote = document.getElementById('enableSiteNote')
const siteSelectionPanel = document.getElementById('siteSelectionPanel')
const siteSelectionList = document.getElementById('siteSelectionList')
const siteSelectionInput = document.getElementById('siteSelectionInput')
const addSelectedSiteButton = document.getElementById('addSelectedSiteButton')
const siteSelectionFeedback = document.getElementById('siteSelectionFeedback')
const configurationSelect = document.querySelector(
  'select[name="configuration"]'
)
const locationsOptGroup = document.getElementById('locationsOptGroup')
const timeZoneInput = document.querySelector('input[name="timeZone"]')
const localeInput = document.querySelector('input[name="locale"]')
const latitudeInput = document.querySelector('input[name="latitude"]')
const longitudeInput = document.querySelector('input[name="longitude"]')
// const debuggerApiModeCheckbox = document.querySelector(
//   'input[name="debuggerApiMode"]'
// )

let currentTabId = null
let ipMatcher = null
let currentHostname = null
let isLoading = false
let enabledSites = []
let siteOptions = []

// Add location options to the select menu
Object.entries(locationsConfigurations).forEach(([key, location]) => {
  const option = document.createElement('option')
  option.value = key
  option.textContent = location.name
  locationsOptGroup.appendChild(option)
})

const handleConfigurationChange = () => {
  if (isLoading) return

  const configuration = configurationSelect.value

  if (configuration !== 'ipAddress') ipMatcher.cancel()
  if (configuration === 'browserDefault' || configuration === 'custom') {
    clearInputs()
  } else if (configuration === 'ipAddress') {
    // Detection is provisional: never overwrite global settings before success.
    ipMatcher.begin()
    return
  } else {
    const selectedLocation = locationsConfigurations[configuration]
    if (selectedLocation) {
      setInputs(
        selectedLocation.timezone,
        selectedLocation.locale,
        selectedLocation.lat,
        selectedLocation.lon
      )
    } else {
      console.error('Unrecognized configuration. Please select a valid option.')
    }
  }

  saveToStorage()
}

const clearInputs = () => setInputs('', '', '', '')

const setInputs = (timezone, locale, lat, lon) => {
  timeZoneInput.value = timezone ?? ''
  localeInput.value = locale ?? ''
  latitudeInput.value = lat ?? ''
  longitudeInput.value = lon ?? ''
}

const applyConfig = (config = {}) => {
  configurationSelect.value = config.configuration || 'browserDefault'
  setInputs(config.timezone, config.locale, config.lat, config.lon)
  ipMatcher?.restore(config)
}

const renderSiteSelectionList = () => {
  const isAllowlist = activationScopeSelect.value === 'allowlist'
  siteSelectionPanel.classList.toggle('hidden', !isAllowlist)
  siteSelectionList.replaceChildren()
  if (!isAllowlist) return

  if (!siteOptions.length) {
    const empty = document.createElement('p')
    empty.className = 'text-xs text-lightGrey py-2'
    empty.textContent = 'No sites found. Open a website or add a domain below.'
    siteSelectionList.appendChild(empty)
    return
  }

  siteOptions.forEach((hostname) => {
    const row = document.createElement('label')
    row.className = 'flex items-center gap-2 px-2 py-2 border-b border-borderLight cursor-pointer'
    const checkbox = document.createElement('input')
    checkbox.type = 'checkbox'
    checkbox.className = 'input-checkbox h-4 w-4 cursor-pointer'
    checkbox.checked = enabledSites.includes(hostname)
    checkbox.setAttribute('aria-label', `Enable Cloaq on ${hostname}`)
    checkbox.addEventListener('change', async () => {
      enabledSites = updateEnabledSite(enabledSites, hostname, checkbox.checked)
      await saveActivationSettings()
      updateEnableSiteControls()
      siteSelectionFeedback.textContent = checkbox.checked
        ? `Enabled on ${hostname}.`
        : `Disabled on ${hostname}.`
    })
    const name = document.createElement('span')
    name.className = 'min-w-0 break-all'
    name.textContent = hostname
    if (hostname === currentHostname) {
      const current = document.createElement('span')
      current.className = 'text-xs text-lightGrey ml-auto shrink-0'
      current.textContent = 'Current'
      row.append(checkbox, name, current)
    } else row.append(checkbox, name)
    siteSelectionList.appendChild(row)
  })
}

const refreshSiteOptions = async (siteConfigurations = null) => {
  try {
    const [tabs, storage] = await Promise.all([
      chrome.tabs.query({}),
      siteConfigurations ? Promise.resolve({ siteConfigurations }) : chrome.storage.local.get(['siteConfigurations']),
    ])
    siteOptions = collectSiteOptions(tabs, storage.siteConfigurations, enabledSites, currentHostname)
  } catch (error) {
    console.warn('Cannot load candidate websites:', error)
    siteOptions = collectSiteOptions([], siteConfigurations || {}, enabledSites, currentHostname)
  }
  renderSiteSelectionList()
}

const addSelectedSite = async () => {
  const hostname = normalizeSiteHostname(siteSelectionInput.value)
  if (!hostname) {
    siteSelectionFeedback.textContent = 'Enter a valid domain or HTTP(S) URL.'
    return
  }
  enabledSites = updateEnabledSite(enabledSites, hostname, true)
  if (!siteOptions.includes(hostname)) siteOptions.push(hostname)
  siteOptions.sort((a, b) => a.localeCompare(b))
  siteSelectionInput.value = ''
  await saveActivationSettings()
  updateEnableSiteControls()
  siteSelectionFeedback.textContent = `Enabled on ${hostname}.`
}

const updateEnableSiteControls = () => {
  const isAllowlist = activationScopeSelect.value === 'allowlist'
  renderSiteSelectionList()
  if (!currentHostname) {
    enableSiteCheckbox.checked = false
    enableSiteCheckbox.disabled = true
    enableSiteNote.textContent =
      'Allowlist management is unavailable on this page.'
    return
  }

  enableSiteCheckbox.disabled = !isAllowlist
  enableSiteCheckbox.checked = enabledSites.includes(currentHostname)
  enableSiteNote.textContent = isAllowlist
    ? `Enable Cloaq only on ${currentHostname}.`
    : 'Switch to "Only specified sites" to manage the allowlist.'
}

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

const getActiveHostname = async () => {
  const [activeTab] = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  })
  currentTabId = activeTab?.id ?? null
  return getHostnameFromUrl(activeTab?.url)
}

const saveToStorage = async () => {
  if (isLoading) return

  // IP matching is saved only after the site IP and geolocation are validated.
  if (configurationSelect.value === 'ipAddress' && !ipMatcher.isReady()) return

  const config = {
    configuration: configurationSelect.value,
    timezone: timeZoneInput.value || null,
    locale: localeInput.value || null,
    lat: parseCoordinate(latitudeInput.value, 'latitude'),
    lon: parseCoordinate(longitudeInput.value, 'longitude'),
    ...(configurationSelect.value === 'ipAddress' ? ipMatcher.metadata() : {}),
    // useDebuggerApi: debuggerApiModeCheckbox.checked,
  }

  if (scopeSelect.value === 'site' && currentHostname) {
    const storage = await chrome.storage.local.get(['siteConfigurations'])
    const siteConfigurations = storage.siteConfigurations || {}
    siteConfigurations[currentHostname] = config
    await chrome.storage.local.set({ siteConfigurations })
  } else {
    await chrome.storage.local.set(config)
  }
}

const saveActivationSettings = async () => {
  if (isLoading) return

  await chrome.storage.local.set({
    enableScope: activationScopeSelect.value,
    enabledSites,
  })
}

const loadFromStorage = async () => {
  try {
    isLoading = true
    const storage = await chrome.storage.local.get([
      'configuration',
      'timezone',
      'locale',
      'lat',
      'lon',
      'siteConfigurations',
      'enableScope',
      'enabledSites',
      // 'useDebuggerApi',
    ])
    const globalConfig = {
      configuration: storage.configuration || 'browserDefault',
      timezone: storage.timezone,
      locale: storage.locale,
      lat: storage.lat,
      lon: storage.lon,
    }
    const siteConfig = currentHostname
      ? storage.siteConfigurations?.[currentHostname]
      : null

    enabledSites = normalizeEnabledSites(storage.enabledSites)
    activationScopeSelect.value = storage.enableScope || 'all'

    if (siteConfig) {
      scopeSelect.value = 'site'
      applyConfig(siteConfig)
    } else {
      scopeSelect.value = 'global'
      applyConfig(globalConfig)
    }
    await refreshSiteOptions(storage.siteConfigurations)
    updateEnableSiteControls()
    ipMatcher.render()
    // debuggerApiModeCheckbox.checked = storage.useDebuggerApi || false
    isLoading = false
  } catch (error) {
    isLoading = false
    console.error('Error loading from storage:', error)
  }
}

// Debounce function to limit frequent save calls
const debounce = (func, delay) => {
  let timeoutId
  return (...args) => {
    clearTimeout(timeoutId)
    timeoutId = setTimeout(() => func(...args), delay)
  }
}

const debouncedSaveToStorage = debounce(saveToStorage, 300)

const handleInputChange = () => {
  if (isLoading) return

  configurationSelect.value = 'custom'
  ipMatcher.cancel()
  ipMatcher.render()
  debouncedSaveToStorage()
}

const handleScopeChange = async () => {
  if (isLoading) return

  const storage = await chrome.storage.local.get([
    'configuration',
    'timezone',
    'locale',
    'lat',
    'lon',
    'siteConfigurations',
  ])
  const globalConfig = {
    configuration: storage.configuration || 'browserDefault',
    timezone: storage.timezone,
    locale: storage.locale,
    lat: storage.lat,
    lon: storage.lon,
  }
  const siteConfig = currentHostname
    ? storage.siteConfigurations?.[currentHostname]
    : null

  ipMatcher.cancel()
  if (scopeSelect.value === 'site') {
    if (siteConfig) {
      isLoading = true
      applyConfig(siteConfig)
      isLoading = false
    } else {
      await saveToStorage()
    }
  } else {
    isLoading = true
    applyConfig(globalConfig)
    isLoading = false
  }
}

const handleActivationScopeChange = async () => {
  if (isLoading) return

  await saveActivationSettings()
  updateEnableSiteControls()
}

const handleEnableSiteChange = async () => {
  if (isLoading || !currentHostname) return

  const hasSite = enabledSites.includes(currentHostname)
  if (enableSiteCheckbox.checked && !hasSite) {
    enabledSites = [...enabledSites, currentHostname]
  } else if (!enableSiteCheckbox.checked && hasSite) {
    enabledSites = enabledSites.filter((site) => site !== currentHostname)
  }

  await saveActivationSettings()
  updateEnableSiteControls()
}

const initScope = async () => {
  currentHostname = await getActiveHostname()
  if (currentHostname) {
    siteScopeOption.disabled = false
    siteScopeOption.textContent = `This site (${currentHostname})`
    siteScopeLabel.textContent = `Apply configuration only to ${currentHostname}.`
    enableSiteLabel.textContent = `Enable on ${currentHostname}`
  } else {
    siteScopeOption.disabled = true
    siteScopeOption.textContent = 'This site (unavailable)'
    siteScopeLabel.textContent =
      'Site-specific configuration is unavailable on this page.'
    enableSiteLabel.textContent = 'Enable on this site (unavailable)'
  }
}

reloadButton.addEventListener('click', () => chrome.tabs.reload())
infoButton.addEventListener('click', () =>
  chrome.tabs.create({ url: 'html/info.html' })
)
scopeSelect.addEventListener('change', handleScopeChange)
activationScopeSelect.addEventListener('change', handleActivationScopeChange)
enableSiteCheckbox.addEventListener('change', handleEnableSiteChange)
addSelectedSiteButton.addEventListener('click', addSelectedSite)
siteSelectionInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') addSelectedSite()
})
configurationSelect.addEventListener('change', handleConfigurationChange)
timeZoneInput.addEventListener('input', handleInputChange)
localeInput.addEventListener('input', handleInputChange)
latitudeInput.addEventListener('input', handleInputChange)
longitudeInput.addEventListener('input', handleInputChange)
// debuggerApiModeCheckbox.addEventListener('change', saveToStorage)

await initScope()
ipMatcher = createIpMatcher({
  configurationSelect, scopeSelect,
  panel: document.getElementById('siteIpPanel'),
  status: document.getElementById('siteIpStatus'),
  detectButton: document.getElementById('detectSiteIp'),
  manualIpInput: document.getElementById('manualSiteIp'),
  manualButton: document.getElementById('useManualSiteIp'),
  getActiveSite: () => ({ hostname: currentHostname, tabId: currentTabId }),
  setInputs, saveToStorage,
})
await loadFromStorage()

const diagnosticsPanel = document.getElementById('diagnosticsPanel')
const diagnosticsResults = document.getElementById('diagnosticsResults')
document.getElementById('runFingerprintCheck').addEventListener('click', async () => {
  const runButton = document.getElementById('runFingerprintCheck')
  runButton.disabled = true
  diagnosticsPanel.classList.remove('hidden')
  diagnosticsResults.replaceChildren()
  const hint = document.createElement('p')
  hint.textContent = 'Checking the current page…'
  diagnosticsResults.append(hint)
  try {
    const [tab] = await chrome.tabs.query({active:true,currentWindow:true})
    if (!tab?.id || !getHostnameFromUrl(tab.url)) throw Error('Open a normal HTTP(S) website.')
    const storage = await chrome.storage.local.get(['configuration','timezone','locale','lat','lon','matchedIp','siteConfigurations','enableScope','enabledSites'])
    const hostname = getHostnameFromUrl(tab.url)
    const allowed = storage.enableScope !== 'allowlist' || (storage.enabledSites || []).includes(hostname)
    const config = allowed ? (storage.siteConfigurations?.[hostname] || storage) : {}
    // Execute in MAIN world: isolated extension world can hide modifications to page APIs.
    const [page] = await chrome.scripting.executeScript({
      target:{tabId:tab.id},world:'MAIN',
      func:()=>({
        timezone:Intl.DateTimeFormat().resolvedOptions().timeZone,
        intlLocale:Intl.DateTimeFormat().resolvedOptions().locale,
        language:navigator.language,
      })
    })
    const debuggerStatus = await chrome.runtime.sendMessage({type:'cloaq:debugger-status',tabId:tab.id})
    let ipObservation={note:'The current site does not expose a compatible IP echo.'}
    try { ipObservation={ip:await readSiteEgressIp(tab.id,hostname)} } catch(error) {
      ipObservation={note:error.message}
    }
    const current=await chrome.tabs.get(tab.id)
    if(current.url!==tab.url)throw Error('The page changed while checking. Please retry.')
    const rows = evaluateFingerprint(page.result || {},config,debuggerStatus,ipObservation)
    if (!allowed) rows.unshift({name:'Activation',state:'unknown',expected:'Enabled',actual:'Disabled on this site',note:'This website is excluded by Activation.'})
    diagnosticsResults.replaceChildren()
    for (const row of rows) {
      const element = document.createElement('div')
      element.className = 'py-2 border-b border-borderLight text-xs'
      const title = document.createElement('p')
      title.className = 'font-semibold'
      title.textContent = `${row.state === 'pass' ? '✓' : row.state === 'mismatch' ? '!' : '?'} ${row.name}: ${row.state}`
      const values = document.createElement('p')
      values.className = 'break-all text-lightGrey'
      values.textContent = `Expected: ${row.expected} | Observed: ${row.actual}`
      element.append(title,values)
      if(row.note) {
        const note = document.createElement('p')
        note.className = 'text-lightGrey'
        note.textContent = row.note
        element.append(note)
      }
      diagnosticsResults.append(element)
    }
  } catch(error) {
    diagnosticsResults.textContent = `Self-check unavailable: ${error.message}`
  } finally {runButton.disabled=false}
})
