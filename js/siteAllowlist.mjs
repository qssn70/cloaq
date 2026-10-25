// Activation allowlist helpers. Entries intentionally match exact hostnames, not wildcard domains.
const WEB_URL_SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i
const VALID_HOSTNAME = /^(?:\[[0-9a-f:.]+\]|[a-z0-9_-]+(?:\.[a-z0-9_-]+)*)$/i

export const normalizeSiteHostname = (value) => {
  if (typeof value !== 'string') return null

  const input = value.trim()
  if (!input || input.length > 2048 || /[\s\\]/.test(input)) return null

  try {
    const url = new URL(WEB_URL_SCHEME.test(input) ? input : `https://${input}`)
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
      return null
    }
    const hostname = url.hostname.toLowerCase()
    return VALID_HOSTNAME.test(hostname) ? hostname : null
  } catch {
    return null
  }
}

export const normalizeEnabledSites = (sites) => {
  if (!Array.isArray(sites)) return []
  return [...new Set(sites.map(normalizeSiteHostname).filter(Boolean))].sort()
}

export const updateEnabledSite = (sites, input, enabled) => {
  const hostname = normalizeSiteHostname(input)
  if (!hostname) throw new Error('Enter a valid domain name or HTTP(S) URL.')

  const next = new Set(normalizeEnabledSites(sites))
  if (enabled) next.add(hostname)
  else next.delete(hostname)
  return [...next].sort()
}

export const collectSiteOptions = (
  tabs = [],
  siteConfigurations = {},
  enabledSites = [],
  currentHostname = null
) => {
  const candidates = new Set(normalizeEnabledSites(enabledSites))
  const add = (input) => {
    const hostname = normalizeSiteHostname(input)
    if (hostname) candidates.add(hostname)
  }

  if (Array.isArray(tabs)) tabs.forEach((tab) => add(tab?.url))
  if (siteConfigurations && typeof siteConfigurations === 'object' && !Array.isArray(siteConfigurations)) {
    Object.keys(siteConfigurations).forEach(add)
  }
  add(currentHostname)

  const current = normalizeSiteHostname(currentHostname)
  return [...candidates].sort((a, b) => {
    if (a === current) return -1
    if (b === current) return 1
    return a.localeCompare(b)
  })
}
