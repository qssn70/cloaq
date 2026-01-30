import { detachDebugger } from './debugger.js'
import locationsConfigurations from './locationsConfigurations.js'
import countryLocales from './countryLocales.js'

const extensionVersion = chrome.runtime.getManifest().version
document.getElementById('extensionVersion').textContent = `v${extensionVersion}`

const reloadButton = document.getElementById('reloadButton')
const infoButton = document.getElementById('infoButton')
const scopeSelect = document.querySelector('select[name="scope"]')
const siteScopeOption = document.getElementById('siteScopeOption')
const siteScopeLabel = document.getElementById('siteScopeLabel')
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

let ipData = null
let currentHostname = null
let isLoading = false

// Add location options to the select menu
Object.entries(locationsConfigurations).forEach(([key, location]) => {
  const option = document.createElement('option')
  option.value = key
  option.textContent = location.name
  locationsOptGroup.appendChild(option)
})

const fetchIpData = async () => {
  try {
    const response = await fetch(
      'http://ip-api.com/json?fields=status,message,countryCode,lat,lon,timezone,query'
    )
    const data = await response.json()
    if (data.status === 'success') {
      ipData = data
    } else {
      console.error(`Failed to reload IP information: ${data.message}`)
    }
  } catch (error) {
    console.error('Error fetching IP information:', error)
  }
}

const handleConfigurationChange = () => {
  if (isLoading) return

  const configuration = configurationSelect.value

  if (configuration === 'browserDefault' || configuration === 'custom') {
    clearInputs()
  } else if (configuration === 'ipAddress') {
    if (ipData) {
      setInputs(
        ipData.timezone,
        countryLocales[ipData.countryCode],
        ipData.lat,
        ipData.lon
      )
    }
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
  timeZoneInput.value = timezone || ''
  localeInput.value = locale || ''
  latitudeInput.value = lat || ''
  longitudeInput.value = lon || ''
}

const applyConfig = (config = {}) => {
  configurationSelect.value = config.configuration || 'browserDefault'
  setInputs(config.timezone, config.locale, config.lat, config.lon)
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
  return getHostnameFromUrl(activeTab?.url)
}

const saveToStorage = async () => {
  if (isLoading) return

  detachDebugger()
  const config = {
    configuration: configurationSelect.value,
    timezone: timeZoneInput.value || null,
    locale: localeInput.value || null,
    lat: parseFloat(latitudeInput.value) || null,
    lon: parseFloat(longitudeInput.value) || null,
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

    if (siteConfig) {
      scopeSelect.value = 'site'
      applyConfig(siteConfig)
    } else {
      scopeSelect.value = 'global'
      applyConfig(globalConfig)
    }
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

const initScope = async () => {
  currentHostname = await getActiveHostname()
  if (currentHostname) {
    siteScopeOption.disabled = false
    siteScopeOption.textContent = `This site (${currentHostname})`
    siteScopeLabel.textContent = `Apply configuration only to ${currentHostname}.`
  } else {
    siteScopeOption.disabled = true
    siteScopeOption.textContent = 'This site (unavailable)'
    siteScopeLabel.textContent =
      'Site-specific configuration is unavailable on this page.'
  }
}

reloadButton.addEventListener('click', () => chrome.tabs.reload())
infoButton.addEventListener('click', () =>
  chrome.tabs.create({ url: 'html/info.html' })
)
scopeSelect.addEventListener('change', handleScopeChange)
configurationSelect.addEventListener('change', handleConfigurationChange)
timeZoneInput.addEventListener('input', handleInputChange)
localeInput.addEventListener('input', handleInputChange)
latitudeInput.addEventListener('input', handleInputChange)
longitudeInput.addEventListener('input', handleInputChange)
// debuggerApiModeCheckbox.addEventListener('change', saveToStorage)

await initScope()
await loadFromStorage()
await fetchIpData()
