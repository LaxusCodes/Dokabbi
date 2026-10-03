export const SHOP = [
  { id: 'recovery_pill', name: 'Recovery Pill', cost: 100, effect: 'Restores 40 HP' },
  { id: 'skill_ticket', name: 'Skill Ticket', cost: 500, effect: 'Random skill' },
  { id: 'attr_fragment', name: 'Attribute Fragment', cost: 300, effect: 'Toward attribute unlock' },
  { id: 'info_scrap', name: 'Information Scrap', cost: 150, effect: 'Hint for current scenario' },
];
export function buyable(coins, itemId) {
  const item = SHOP.find((i) => i.id === itemId);
  if (!item) throw new Error('Unknown item');
  if (coins < item.cost) throw new Error('Not enough coins');
  return item;
}
