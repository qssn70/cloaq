import test from 'node:test'
import assert from 'node:assert/strict'
import {parseCoordinate} from '../js/coordinates.mjs'

test('zero, negative zero, and bounds survive parsing',()=>{
 for (const axis of ['latitude','longitude']) {
  assert.equal(parseCoordinate('0',axis),0)
  assert.ok(Object.is(parseCoordinate('-0',axis),-0))
  assert.equal(parseCoordinate(0,axis),0)
 }
 assert.equal(parseCoordinate('-90','latitude'),-90)
 assert.equal(parseCoordinate('90','latitude'),90)
 assert.equal(parseCoordinate('-180','longitude'),-180)
 assert.equal(parseCoordinate('180','longitude'),180)
})
test('empty values are null rather than zero',()=>{
 assert.equal(parseCoordinate('', 'latitude'),null)
 assert.equal(parseCoordinate('   ', 'longitude'),null)
 assert.equal(parseCoordinate(null, 'latitude'),null)
})
test('invalid, infinite or out-of-bounds coordinates are rejected',()=>{
 for(const value of ['NaN','Infinity','91','-91','garbage'])
  assert.throws(()=>parseCoordinate(value,'latitude'),RangeError)
 for(const value of ['181','-181','-Infinity'])
  assert.throws(()=>parseCoordinate(value,'longitude'),RangeError)
})
