// Read a site-specific exit IP; never substitute the IP of a third-party service.
export const isValidIp = value => {
  if (typeof value !== 'string' || !value || value !== value.trim()) return false
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(value))
    return value.split('.').every(part => Number(part) <= 255 && (part === '0' || !part.startsWith('0')))
  if (value.includes(':') && /^[0-9a-f:.]+$/i.test(value)) {
    try { return new URL(`http://[${value}]/`).hostname.startsWith('[') } catch { return false }
  }
  return false
}
export const parseCloudflareTrace = (body, hostname) => {
  if (typeof body !== 'string' || body.length > 4096 || !hostname) throw new Error('Invalid site IP response.')
  const trace = Object.fromEntries(body.split(/\r?\n/).filter(line => line.includes('=')).map(line => {
    const index = line.indexOf('=')
    return [line.slice(0, index), line.slice(index + 1)]
  }))
  if (!trace.fl || !trace.colo || !trace.ts || !trace.h || trace.h.toLowerCase() !== hostname.toLowerCase() || !isValidIp(trace.ip))
    throw new Error('This site does not expose a compatible /cdn-cgi/trace IP response.')
  return trace.ip
}
export const normalizeIpGeolocation = (data, requestedIp) => {
  if (!data || data.error || !isValidIp(requestedIp) || !isValidIp(data.ip))
    throw new Error('IP geolocation lookup failed.')
  const normalize = ip => ip.includes(':') ? new URL(`http://[${ip}]/`).hostname : ip
  if (normalize(data.ip) !== normalize(requestedIp))
    throw new Error('The geolocation provider returned a different IP.')
  const lat = Number(data.latitude), lon = Number(data.longitude)
  if (typeof data.timezone !== 'string' || !data.timezone || !Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180)
    throw new Error('No usable location for this IP.')
  return { timezone: data.timezone, countryCode: data.country_code || data.country, lat, lon }
}
export const lookupIpGeolocation = async ip => {
  if (!isValidIp(ip)) throw new Error('Invalid IP address.')
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 8000)
  try {
    const response = await fetch(`https://ipapi.co/${encodeURIComponent(ip)}/json/`, {cache:'no-store', signal:controller.signal})
    if (!response.ok) throw new Error(`IP location lookup returned HTTP ${response.status}.`)
    return normalizeIpGeolocation(await response.json(), ip)
  } finally { clearTimeout(timeout) }
}
export const readSiteEgressIp = async (tabId, hostname) => {
  if (!Number.isInteger(tabId) || !hostname) throw new Error('Open a normal website first.')
  const [result] = await chrome.scripting.executeScript({
    target: {tabId},
    func: async () => {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 8000)
      try {
        const response = await fetch(`${location.origin}/cdn-cgi/trace`, {
          cache:'no-store',credentials:'omit',mode:'same-origin',redirect:'error',signal:controller.signal
        })
        if (!response.ok) throw new Error(`Website returned HTTP ${response.status}.`)
        return {origin:location.origin, body:(await response.text()).slice(0,4097)}
      } finally {clearTimeout(timeout)}
    }
  })
  if (!result?.result || new URL(result.result.origin).hostname !== hostname)
    throw new Error('Active site changed or did not return an IP.')
  return parseCloudflareTrace(result.result.body, hostname)
}
export const resolveSiteConfiguration = (storage, hostname) => {
  const siteConfig = hostname ? storage.siteConfigurations?.[hostname] : null
  const config = siteConfig || storage
  if (config.configuration !== 'ipAddress') return config
  if (!siteConfig || !siteConfig.ipSource || !isValidIp(siteConfig.matchedIp))
    return {configuration:'browserDefault'}
  return siteConfig
}
