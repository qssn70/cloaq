import test from 'node:test'
import assert from 'node:assert/strict'
import {createIpMatcher} from '../js/popupIp.js'

const setup = () => {
  const handlers = new Map()
  const button = name => ({
    disabled:false,
    addEventListener(event,fn) {handlers.set(name+':'+event,fn)}
  })
  const configurationSelect={value:'ipAddress'}
  const scopeSelect={value:'global'}
  const panel={classList:{toggle(){}}}
  const status={textContent:''}
  const detectButton=button('detect')
  const manualButton=button('manual')
  const manualIpInput=button('input')
  manualIpInput.value='203.0.113.1'
  let global={configuration:'custom',timezone:'Europe/Paris'}
  const sites={}
  let fields=null, writes=0
  const matcher=createIpMatcher({
    configurationSelect,scopeSelect,panel,status,detectButton,
    manualButton,manualIpInput,
    getActiveSite:()=>({tabId:11,hostname:'site.example'}),
    setInputs:(timezone,locale,lat,lon)=>{fields={timezone,locale,lat,lon}},
    saveToStorage:async()=>{
      writes++
      if(scopeSelect.value==='global')global={configuration:'ipAddress',...fields}
      else sites['site.example']={configuration:'ipAddress',...fields,...matcher.metadata()}
    },
  })
  return {matcher,handlers,configurationSelect,scopeSelect,status,sites,getGlobal:()=>global,getWrites:()=>writes}
}

test('F01 failed IP lookup leaves global and site storage untouched',async()=>{
  const oldFetch=globalThis.fetch
  globalThis.fetch=async()=>{throw Error('offline')}
  try {
    const ctx=setup()
    await ctx.handlers.get('manual:click')()
    assert.deepEqual(ctx.getGlobal(),{configuration:'custom',timezone:'Europe/Paris'})
    assert.deepEqual(ctx.sites,{})
    assert.equal(ctx.getWrites(),0)
    assert.equal(ctx.scopeSelect.value,'global')
  }finally{globalThis.fetch=oldFetch}
})

test('F01 successful IP lookup commits only site config',async()=>{
  const oldFetch=globalThis.fetch
  globalThis.fetch=async()=>({ok:true,json:async()=>({
    ip:'203.0.113.1',timezone:'Asia/Tokyo',country_code:'JP',latitude:0,longitude:0
  })})
  try {
    const ctx=setup()
    await ctx.handlers.get('manual:click')()
    assert.deepEqual(ctx.getGlobal(),{configuration:'custom',timezone:'Europe/Paris'})
    assert.equal(ctx.scopeSelect.value,'site')
    assert.equal(ctx.sites['site.example'].timezone,'Asia/Tokyo')
    assert.equal(ctx.sites['site.example'].lat,0)
    assert.equal(ctx.sites['site.example'].lon,0)
    assert.equal(ctx.getWrites(),1)
  }finally{globalThis.fetch=oldFetch}
})
