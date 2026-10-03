// Negotiation: constellations bargain the way they wager. Pure.
export function negotiate(persona, offer, term, priorCount = 0) {
  if (priorCount >= 2) {
    return { ok: false, response: 'The constellation is displeased by the haggling. The offer stands as written — take it or leave it.', locked: true };
  }
  const flavor = {
    cautious: 'The constellation weighs every word twice before answering.',
    steadfast: 'The constellation nods slowly. Honor matters more than coin.',
    reckless: 'The constellation laughs. Bold! It likes bold.',
    manipulative: 'The constellation smiles like a closing ledger.',
  };
  const pre = flavor[persona] || flavor.cautious;
  if (term === 'coins') {
    const bump = persona === 'reckless' ? 1000 : persona === 'manipulative' ? 500 : 250;
    return { ok: true, response: `${pre} Counter-offer: +${bump} coins, and it expects to be remembered.`, counter: { coins: offer.coins + bump } };
  }
  if (term === 'duration') {
    if (persona === 'cautious' || persona === 'steadfast') {
      return { ok: false, response: `${pre} It refuses: "A short bond proves nothing. Three scenarios."` };
    }
    return { ok: true, response: `${pre} Counter-offer: prove yourself in 2 scenarios instead of ${offer.duration} — but the expectation stands.`, counter: { duration: 2 } };
  }
  if (term === 'requirement') {
    if (persona === 'manipulative') {
      return { ok: true, response: `${pre} "Less of that... and more of this." The requirement shifts, and the price quietly rises elsewhere.`, counter: { expectation_required: Math.max(1, offer.expectation_required - 1), coins: offer.coins - 250 } };
    }
    return { ok: false, response: `${pre} "That requirement IS the contract." It will not bend on this.` };
  }
  return { ok: false, response: 'The constellation does not understand the proposal. (Terms: coins, duration, requirement.)' };
}
