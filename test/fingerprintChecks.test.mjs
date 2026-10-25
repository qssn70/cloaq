import assert from 'node:assert/strict'
import test from 'node:test'
import {evaluateFingerprint} from '../js/fingerprintChecks.mjs'

test('separates verified values from unverified headers and geolocation',()=>{
  const rows=evaluateFingerprint({timezone:'Asia/Tokyo',intlLocale:'ja-JP',language:'ja-JP'},
    {timezone:'Asia/Tokyo',locale:'ja-JP',lat:35,lon:139,matchedIp:'203.0.113.1'},
    {attached:true,children:['iframe'],errors:[]},{ip:'203.0.113.1'})
  assert.equal(rows.find(r=>r.name==='JavaScript timezone').state,'pass')
  assert.equal(rows.find(r=>r.name==='HTTP Accept-Language').state,'unknown')
  assert.equal(rows.find(r=>r.name==='Geolocation').state,'unknown')
  assert.equal(rows.find(r=>r.name==='Current site exit IP').state,'pass')
  assert.equal(rows.find(r=>r.name==='Child frame / Worker coverage').state,'unknown')
})
test('flags stale IP and locale mismatch',()=>{
 const rows=evaluateFingerprint({timezone:'Europe/Paris',intlLocale:'fr-FR',language:'en-US'},
 {timezone:'Asia/Tokyo',locale:'ja-JP',matchedIp:'1.1.1.1'},
 {attached:false,errors:['Unsupported command']},{ip:'8.8.8.8'})
 assert.ok(rows.filter(r=>r.state==='mismatch').length>=4)
})
