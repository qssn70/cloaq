// Serialize site-configuration mutations within a popup to avoid resurrecting
// an override when a pending save races with Reset to Global.
export const hasSiteOverride = (siteConfigurations, hostname) =>
  Boolean(
    hostname &&
    siteConfigurations &&
    Object.prototype.hasOwnProperty.call(siteConfigurations, hostname)
  )

export class SiteConfigStore {
  constructor(storage) {
    this.storage = storage
    this.pending = Promise.resolve()
  }

  mutate(operation) {
    const perform = async () => {
      const { siteConfigurations } = await this.storage.get(['siteConfigurations'])
      const next = { ...(siteConfigurations || {}) }
      if (operation(next) === false) return false
      await this.storage.set({ siteConfigurations: next })
      return true
    }
    const result = this.pending.then(perform, perform)
    this.pending = result.catch(() => {})
    return result
  }

  set(hostname, config) {
    if (!hostname) throw new Error('Site hostname is required.')
    return this.mutate(sites => {
      sites[hostname] = config
      return true
    })
  }

  reset(hostname) {
    if (!hostname) throw new Error('Site hostname is required.')
    return this.mutate(sites => {
      if (!hasSiteOverride(sites, hostname)) return false
      delete sites[hostname]
      return true
    })
  }
}
