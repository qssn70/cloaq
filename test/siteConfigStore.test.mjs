import test from 'node:test'
import assert from 'node:assert/strict'
import { SiteConfigStore, hasSiteOverride } from '../js/siteConfigStore.mjs'
import { resolveSiteConfiguration } from '../js/siteIp.mjs'

const createStorage = initial => {
  const data = structuredClone(initial)
  let writes = 0
  return {
    data,
    get writes() { return writes },
    async get(keys) { return Object.fromEntries(keys.map(key => [key, structuredClone(data[key])])) },
    async set(changes) {
      writes++
      Object.assign(data, structuredClone(changes))
    },
  }
}

test('F04 reset deletes only one hostname and restores global inheritance', async () => {
  const storage = createStorage({
    configuration: 'custom',
    timezone: 'Europe/Paris',
    siteConfigurations: {
      'a.example': { configuration: 'custom', timezone: 'Asia/Tokyo' },
      'b.example': { configuration: 'custom', timezone: 'America/New_York' },
    },
  })
  const store = new SiteConfigStore(storage)
  assert.equal(hasSiteOverride(storage.data.siteConfigurations, 'a.example'), true)
  assert.equal(await store.reset('a.example'), true)
  assert.equal(hasSiteOverride(storage.data.siteConfigurations, 'a.example'), false)
  assert.equal(storage.data.siteConfigurations['b.example'].timezone, 'America/New_York')
  assert.equal(storage.data.timezone, 'Europe/Paris')
  assert.equal(resolveSiteConfiguration(storage.data, 'a.example').timezone, 'Europe/Paris')
  assert.equal(await store.reset('a.example'), false)
  assert.equal(storage.writes, 1)
})

test('F04 read-only scope switching leaves inherited site without an override', () => {
  const sites = {}
  assert.equal(hasSiteOverride(sites, 'example.com'), false)
  const storage = {configuration:'custom',timezone:'Asia/Tokyo',siteConfigurations:sites}
  assert.equal(resolveSiteConfiguration(storage, 'example.com').timezone, 'Asia/Tokyo')
  assert.equal(Object.keys(sites).length, 0)
})

test('F04 pending site save is serialized before reset and cannot resurrect override', async () => {
  const storage = createStorage({siteConfigurations:{}})
  const store = new SiteConfigStore(storage)
  const write = store.set('a.example', {timezone:'Asia/Seoul'})
  const reset = store.reset('a.example')
  await Promise.all([write, reset])
  assert.equal(hasSiteOverride(storage.data.siteConfigurations,'a.example'), false)
  assert.equal(storage.writes, 2)
})

test('F04 invalid host reset throws synchronously without changing other site configurations', () => {
  const storage = createStorage({siteConfigurations:{'b.example':{locale:'en-US'}}})
  const store = new SiteConfigStore(storage)
  assert.throws(() => store.reset(''), /hostname/)
  assert.equal(storage.data.siteConfigurations['b.example'].locale, 'en-US')
  assert.equal(storage.writes, 0)
})
