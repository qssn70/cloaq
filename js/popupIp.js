import {isValidIp,lookupIpGeolocation,readSiteEgressIp} from './siteIp.mjs'
import countryLocales from './countryLocales.js'
export const createIpMatcher = ({configurationSelect,scopeSelect,panel,status,detectButton,manualIpInput,manualButton,getActiveSite,setInputs,saveToStorage}) => {
  let matchedIp=null, ipSource=null, matchedAt=null, busy=false
  const metadata=()=>({matchedIp,ipSource,matchedAt})
  const render=()=>{
    const active=configurationSelect.value==='ipAddress'
    panel.classList.toggle('hidden',!active)
    if (!active) return
    const {hostname}=getActiveSite()
    status.textContent=matchedIp
      ? `${ipSource==='manual'?'Manually entered':'Last detected'} IP for ${hostname}: ${matchedIp}. Recheck after proxy changes.`
      : 'Detect this site’s exit IP (Cloudflare sites), or enter its known exit IP.'
  }
  const restore=(config={})=>{
    matchedIp=config.matchedIp||null;ipSource=config.ipSource||null;matchedAt=config.matchedAt||null
    manualIpInput.value=matchedIp||'';render()
  }
  const clear=()=>{matchedIp=null;ipSource=null;matchedAt=null;manualIpInput.value=''}
  const applyIp=async(ip,source)=>{
    const siteBefore=getActiveSite()
    const location=await lookupIpGeolocation(ip)
    const siteAfter=getActiveSite()
    if(siteBefore.hostname!==siteAfter.hostname||siteBefore.tabId!==siteAfter.tabId||configurationSelect.value!=='ipAddress')
      throw new Error('The active website or mode changed during detection.')
    setInputs(location.timezone,countryLocales[location.countryCode]||'',location.lat,location.lon)
    matchedIp=ip;ipSource=source;matchedAt=Date.now()
    scopeSelect.value='site';manualIpInput.value=ip
    await saveToStorage()
    status.textContent=`Saved ${source==='manual'?'manually supplied':'site-observed'} IP ${ip} for ${siteAfter.hostname}. Reload the page to apply on startup.`
  }
  const run=async(action)=>{
    if(busy)return
    busy=true;detectButton.disabled=true;manualButton.disabled=true
    status.textContent='Detecting IP and looking up its location…'
    try{await action()}catch(error){
      status.textContent=`${error.message||'Unable to match IP.'} No unrelated IP was used. You may enter an IP reported by this site.`
    }finally{busy=false;detectButton.disabled=false;manualButton.disabled=false}
  }
  const detect=()=>run(async()=>{
    const {hostname,tabId}=getActiveSite()
    if(!hostname||!Number.isInteger(tabId))throw new Error('Open a regular website first.')
    const ip=await readSiteEgressIp(tabId,hostname)
    if(getActiveSite().tabId!==tabId||getActiveSite().hostname!==hostname)
      throw new Error('Active website changed during detection.')
    await applyIp(ip,'cloudflare')
  })
  const manual=()=>run(async()=>{
    const {hostname}=getActiveSite(),ip=manualIpInput.value.trim()
    if(!hostname)throw new Error('No active website.')
    if(!isValidIp(ip))throw new Error('Enter a valid IPv4 or IPv6 address.')
    await applyIp(ip,'manual')
  })
  detectButton.addEventListener('click',detect);manualButton.addEventListener('click',manual)
  manualIpInput.addEventListener('keydown',event=>{if(event.key==='Enter')manual()})
  return {metadata,render,restore,clear,detect}
}
