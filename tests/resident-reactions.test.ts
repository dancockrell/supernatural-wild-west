import {it,expect} from 'vitest';
import {exteriorNoticesPayout} from '../src/client/resident-reactions';
it('exterior ghosts notice only payouts of one thousand displayed credits or more',()=>{
 for(const payout of [0,1000,99_999,-100_000,NaN,Infinity])expect(exteriorNoticesPayout(payout)).toBe(false);
 expect(exteriorNoticesPayout(100_000)).toBe(true);expect(exteriorNoticesPayout(100_001)).toBe(true);
});
