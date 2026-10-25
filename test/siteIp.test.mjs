import assert from 'node:assert/strict'
import test from 'node:test'
import {isValidIp,parseCloudflareTrace,normalizeIpGeolocation,resolveSiteConfiguration} from '../js/siteIp.mjs'
const trace=(ip,host='example.com')=>`fl=1f23\nh=${host}\nip=${ip}\nts=1700000000\ncolo=SJC\nloc=US\n`
test('read same-site Cloudflare IPv4 and IPv6',()=>{
 assert.equal(parseCloudflareTrace(trace('203.0.113.10'),'example.com'),'203.0.113.10')
 assert.equal(parseCloudflareTrace(trace('2001:db8::10'),'example.com'),'2001:db8::10')
})
test('reject unrelated hosts, HTML, and invalid IP',()=>{
 assert.throws(()=>parseCloudflareTrace(trace('1.2.3.4','another.com'),'example.com'))
 assert.throws(()=>parseCloudflareTrace('<html>ip=1.2.3.4</html>','example.com'))
 assert.equal(isValidIp('999.2.3.4'),false)
})
test('geolocation must match requested IP',()=>{
 const geo={ip:'203.0.113.10',timezone:'Asia/Tokyo',country_code:'JP',latitude:0,longitude:0}
 assert.equal(normalizeIpGeolocation(geo,geo.ip).timezone,'Asia/Tokyo')
 assert.throws(()=>normalizeIpGeolocation(geo,'203.0.113.20'))
})
test('site-specific matching does not leak into global or unrelated site',()=>{
 const storage={configuration:'ipAddress',matchedIp:'1.1.1.1',siteConfigurations:{'a.test':{configuration:'ipAddress',ipSource:'cloudflare',matchedIp:'203.0.113.10',timezone:'Asia/Tokyo'}}}
 assert.equal(resolveSiteConfiguration(storage,'a.test').timezone,'Asia/Tokyo')
 assert.equal(resolveSiteConfiguration(storage,'b.test').configuration,'browserDefault')
})
