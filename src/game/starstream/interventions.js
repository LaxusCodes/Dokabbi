// Gifts and empowerments: influence spent through probability, never cheating. Pure costs.
export const GIFT_COST = 500;
export const GIFT_INTEREST_COST = 20;
export const EMPOWER_COST = 1000;
export const EMPOWER_FAVOR = 15;

export function giftOffer(interest, balance) {
  if (interest < 80 || balance < GIFT_COST) return null;
  return { kind: 'gift', coins: GIFT_COST, interestCost: GIFT_INTEREST_COST };
}

export function empowerOffer(interest, balance) {
  if (interest < 95 || balance < EMPOWER_COST) return null;
  return { kind: 'empower', coins: EMPOWER_COST, favor: EMPOWER_FAVOR };
}
