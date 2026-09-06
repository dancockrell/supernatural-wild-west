import { describe, it, expect } from 'vitest';
import { frontierCurve } from '../src/client/frontier-framing';
describe('frontier composition', () => {
  it('retains both source edges and a monotonic symmetric curve at all aspect ratios', () => {
    for (const ratio of [.1,.25,.4,.75,1,2]) {
      const x=frontierCurve(ratio), n=x.length-1;
      expect(x[0]).toBe(0); expect(x[n]).toBeCloseTo(1);
      for(let i=1;i<=n;i++) { expect(x[i]).toBeGreaterThan(x[i-1]); expect(x[i]).toBeCloseTo(1-x[n-i]); }
    }
  });
  it('squeezes the centre much more than the subject regions on narrow views', () => {
    const x=frontierCurve(.3), width=(a:number,b:number)=>x[b]-x[a];
    expect(width(12,24)).toBeGreaterThan(width(58,70)*10);
  });
  it('does not distort a full-width or wider composition', () => {
    for (const ratio of [1,1.8]) frontierCurve(ratio).forEach((x,i)=>expect(x).toBeCloseTo(i/128));
  });
});
