export const evaluateFingerprint = (observed, config, debuggerStatus, ipObservation) => {
  const results = []
  const item = (name, expected, actual, note = '') => {
    const state = actual == null ? 'unknown' : expected === actual ? 'pass' : 'mismatch'
    results.push({name, state, expected:expected ?? 'Not configured', actual:actual ?? 'Unavailable', note})
  }
  if (config.timezone) item('JavaScript timezone', config.timezone, observed.timezone)
  if (config.locale) {
    const normalize = value => typeof value === 'string' ? value.toLowerCase().replace('_', '-') : value
    item('Intl locale', normalize(config.locale), normalize(observed.intlLocale))
    item('navigator.language', normalize(config.locale), normalize(observed.language))
    results.push({name:'HTTP Accept-Language',state:'unknown',
      expected:config.locale,actual:'Not echoed by this site',
      note:'CDP requests this header, but the page cannot verify what the server received.'})
  }
  const coords = [config.lat, config.lon]
  if (coords.every(value => value !== null && value !== undefined && Number.isFinite(Number(value)))) {
    results.push({name:'Geolocation',state:'unknown',expected:coords.join(', '),
      actual:'Not read (would request site geolocation permission)',
      note:'The override was requested; user permission and actual coordinates were not verified.'})
  }
  results.push({
    name:'Current site exit IP',
    state: ipObservation?.ip ? (
      config.matchedIp ? (ipObservation.ip === config.matchedIp ? 'pass' : 'mismatch') : 'unknown'
    ) : 'unknown',
    expected:config.matchedIp || 'No site-specific IP configured',
    actual:ipObservation?.ip || 'Not available',
    note:ipObservation?.note || 'Only same-site Cloudflare IP echo is supported.',
  })
  results.push({name:'Debugger ownership',state: debuggerStatus?.attached?'pass':'unknown',
    expected:'Cloaq attached',actual:debuggerStatus?.attached?'Attached':'Not attached',
    note:debuggerStatus?.problem || ''})
  results.push({name:'Child frame / Worker coverage',state:'unknown',
    expected:'Relevant subtargets',actual:(debuggerStatus?.children || []).join(', ') || 'No child session reported',
    note:'Session attachment is not proof that all website execution contexts were covered.'})
  for (const notice of debuggerStatus?.notices || [])
    results.push({name:'CDP compatibility',state:'unknown',expected:'Supported commands',actual:notice,note:'Informational; this is not proof of a fingerprint mismatch.'})
  for (const warning of debuggerStatus?.errors || [])
    results.push({name:'CDP warning',state:'mismatch',expected:'No command failures',actual:warning,note:''})
  return results
}
