import {applyDebuggerConfiguration} from './debugger.js'
import {resolveSiteConfiguration} from './siteIp.mjs'
const hostnameFromUrl=url=>{
  try{const parsed=new URL(url);return ['http:','https:'].includes(parsed.protocol)?parsed.hostname:null}catch{return null}
}
const pending=new Map()
const applyForTab=async(tabId,url)=>{
  const hostname=hostnameFromUrl(url)
  if(!hostname){await applyDebuggerConfiguration(tabId);return}
  const storage=await chrome.storage.local.get(['configuration','timezone','locale','lat','lon','siteConfigurations','enableScope','enabledSites'])
  const allowed=(storage.enableScope||'all')==='all'||(storage.enabledSites||[]).includes(hostname)
  await applyDebuggerConfiguration(tabId,allowed?resolveSiteConfiguration(storage,hostname):{})
}
const queue=(tabId,url)=>{
  const previous=pending.get(tabId)||Promise.resolve()
  const next=previous.catch(()=>{}).then(()=>applyForTab(tabId,url))
  pending.set(tabId,next)
  next.catch(error=>console.warn('Cloaq: cannot update tab',tabId,error)).finally(()=>{if(pending.get(tabId)===next)pending.delete(tabId)})
}
chrome.runtime.onInstalled.addListener(details=>{
  if(details.reason==='install')chrome.tabs.create({active:true,url:'html/info.html'})
})
chrome.webNavigation.onBeforeNavigate.addListener(details=>{if(details.frameId===0)queue(details.tabId,details.url)})
chrome.webNavigation.onCommitted.addListener(details=>{if(details.frameId===0)queue(details.tabId,details.url)})
chrome.storage.onChanged.addListener((changes,area)=>{
  if(area!=='local'||!['configuration','timezone','locale','lat','lon','siteConfigurations','enableScope','enabledSites'].some(key=>key in changes))return
  chrome.tabs.query({}).then(tabs=>{
    tabs.forEach(tab=>{if(Number.isInteger(tab.id)&&hostnameFromUrl(tab.url))queue(tab.id,tab.url)})
  }).catch(error=>console.warn('Cloaq: cannot refresh tabs',error))
})
chrome.tabs.onRemoved.addListener(tabId=>pending.delete(tabId))
