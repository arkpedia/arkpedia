import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chibiBodyBounds } from '../../lib/operators/chibiFrame';
const body = [{left:-90,bottom:0,right:40,top:250},{left:-70,bottom:200,right:90,top:450}];
test('detached skin scenery cannot shrink or recenter the character', () => {
  const expected = {left:-90,bottom:0,right:90,top:450};
  assert.deepEqual(chibiBodyBounds(body), expected);
  assert.deepEqual(chibiBodyBounds([{left:-965,bottom:-52,right:-591,top:496},...body]), expected);
  assert.deepEqual(chibiBodyBounds([...body,{left:1000,bottom:0,right:2000,top:1000}]), expected);
});
test('connected costume parts remain in the frame, invalid geometry is ignored', () => {
  assert.deepEqual(chibiBodyBounds([...body,{left:80,bottom:300,right:180,top:400},{left:NaN,bottom:0,right:1,top:2}]), {left:-90,bottom:0,right:180,top:450});
  assert.equal(chibiBodyBounds([]), undefined);
});

test('small disconnected accessories preserve the existing frame', () => {
  assert.deepEqual(chibiBodyBounds([...body,{left:100,bottom:100,right:120,top:150}]), {left:-90,bottom:0,right:120,top:450});
});
