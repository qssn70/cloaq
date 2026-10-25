import assert from 'node:assert/strict'
import test from 'node:test'
import {
  normalizeSiteHostname,
  normalizeEnabledSites,
  updateEnabledSite,
  collectSiteOptions,
} from '../js/siteAllowlist.mjs'

test('parse domains and HTTP(S) URLs into exact hostnames', () => {
  assert.equal(normalizeSiteHostname(' HTTPS://WWW.Example.COM:8443/path?q=1 '), 'www.example.com')
  assert.equal(normalizeSiteHostname('example.com/path'), 'example.com')
  assert.equal(normalizeSiteHostname('localhost:3000'), 'localhost')
  assert.equal(normalizeSiteHostname('https://[2001:db8::1]/'), '[2001:db8::1]')
  assert.equal(normalizeSiteHostname('https://例子.测试/'), 'xn--fsqu00a.xn--0zwm56d')
})

test('reject unsupported pages, malformed domains and wildcard patterns', () => {
  for (const input of [
    '',
    'chrome://extensions/',
    'file:///tmp/page.html',
    'https://user:password@example.com/',
    '*.example.com',
    'example.com other.com',
    'ftp://example.com',
    'https://example.com\\@different.test',
    'javascript:alert(1)',
  ]) assert.equal(normalizeSiteHostname(input), null, input)
})

test('normalize old allowlist entries without duplicates or accidental subdomain matching', () => {
  assert.deepEqual(
    normalizeEnabledSites(['EXAMPLE.com', 'https://example.com/a', 'sub.example.com', 'chrome://settings', null]),
    ['example.com', 'sub.example.com']
  )
  const selected = updateEnabledSite(['example.com'], 'sub.example.com', true)
  assert.deepEqual(selected, ['example.com', 'sub.example.com'])
  assert.deepEqual(updateEnabledSite(selected, 'example.com', false), ['sub.example.com'])
  assert.throws(() => updateEnabledSite(selected, '*', true))
})

test('site selection combines open tabs, stored configurations and selected sites', () => {
  const options = collectSiteOptions(
    [{url: 'chrome://extensions/'}, {url: 'https://b.example/path'}, {url: 'https://a.example/'}],
    {'c.example': {configuration:'custom'}, 'a.example': {}},
    ['saved.example'],
    'a.example'
  )
  assert.deepEqual(options, ['a.example', 'b.example', 'c.example', 'saved.example'])
})

test('empty or malformed stored lists are safe', () => {
  assert.deepEqual(normalizeEnabledSites(null), [])
  assert.deepEqual(collectSiteOptions(undefined, undefined, null), [])
})
