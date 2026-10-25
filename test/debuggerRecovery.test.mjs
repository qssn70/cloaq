import test from 'node:test'
import assert from 'node:assert/strict'
import {DebuggerManager} from '../js/debugger.mjs'

const makeApi = () => {
  const listeners={}
  const calls=[]
  return {
    calls,listeners,
    onEvent:{addListener(fn){listeners.event=fn}},
    onDetach:{addListener(fn){listeners.detach=fn}},
    async getTargets(){return []},
    async attach(target){calls.push(['attach',target])},
    async detach(target){calls.push(['detach',target]);listeners.detach(target,'canceled_by_user')},
    async sendCommand(target,name){calls.push([name,target])},
  }
}
test('F06 unexpected detach signals recovery and drops ownership',async()=>{
  const api=makeApi(), manager=new DebuggerManager(api), events=[]
  manager.onUnexpectedDetach=(tabId,reason)=>events.push({tabId,reason})
  await manager.configure(41,{timezone:'Asia/Tokyo'})
  api.listeners.detach({tabId:41},'replaced_with_devtools')
  assert.deepEqual(events,[{tabId:41,reason:'replaced_with_devtools'}])
  assert.equal(manager.getStatus(41).attached,false)
  assert.match(manager.getStatus(41).problem,/replaced_with_devtools/)
})
test('F06 deliberate detach does not schedule recovery',async()=>{
  const api=makeApi(), manager=new DebuggerManager(api), events=[]
  manager.onUnexpectedDetach=(id,reason)=>events.push([id,reason])
  await manager.configure(41,{timezone:'Asia/Tokyo'})
  await manager.configure(41,{})
  assert.deepEqual(events,[])
  assert.equal(manager.getStatus(41).attached,false)
})
test('F06 user-canceled debugger reports reason for policy to block auto-reconnect',async()=>{
  const api=makeApi(), manager=new DebuggerManager(api), events=[]
  manager.onUnexpectedDetach=(id,reason)=>events.push([id,reason])
  await manager.configure(41,{locale:'ja-JP'})
  api.listeners.detach({tabId:41},'canceled_by_user')
  assert.deepEqual(events,[[41,'canceled_by_user']])
})
