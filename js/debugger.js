const hasCoordinate = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value))
export const applyDebuggerConfiguration = async (tabId, config={}) => {
  const timezone=config.timezone||'',locale=config.locale||''
  const hasPosition=hasCoordinate(config.lat)&&hasCoordinate(config.lon)&&Number(config.lat)>=-90&&Number(config.lat)<=90&&Number(config.lon)>=-180&&Number(config.lon)<=180
  const shouldAttach=Boolean(timezone||locale||hasPosition)
  const targets=await chrome.debugger.getTargets()
  const attached=targets.some(target=>target.tabId===tabId&&target.attached)
  const target={tabId}
  if(!shouldAttach){if(attached)await chrome.debugger.detach(target);return}
  if(!attached)await chrome.debugger.attach(target,'1.3')
  await chrome.debugger.sendCommand(target,'Emulation.setTimezoneOverride',{timezoneId:''})
  if(timezone)await chrome.debugger.sendCommand(target,'Emulation.setTimezoneOverride',{timezoneId:timezone})
  await chrome.debugger.sendCommand(target,'Emulation.setLocaleOverride',{locale})
  if(hasPosition)await chrome.debugger.sendCommand(target,'Emulation.setGeolocationOverride',{latitude:Number(config.lat),longitude:Number(config.lon),accuracy:1})
  else await chrome.debugger.sendCommand(target,'Emulation.clearGeolocationOverride')
}
