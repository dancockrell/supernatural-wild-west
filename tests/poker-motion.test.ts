import {describe,it,expect} from 'vitest';
import {handChoreographyIndices} from '../src/client/poker-motion';
describe('hand choreography follows actual card groups',()=>{
 it('keeps interleaved pairs together and leaves the kicker still',()=>{
  expect(handChoreographyIndices([12,11,25,24,0],'Two pair')).toEqual([0,2,1,3]);
 });
 it('stages the three-card group before the pair in an interleaved full house',()=>{
  expect(handChoreographyIndices([11,12,24,25,38],'Full house')).toEqual([1,3,4,0,2]);
 });
});
