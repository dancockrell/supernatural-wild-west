/** Integer minor units: 1,000.00 displayed credits, not 1,000 cents. */
export function exteriorNoticesPayout(payout:number){return Number.isSafeInteger(payout)&&payout>=100_000;}
