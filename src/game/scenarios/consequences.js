// Global consequences: collective behavior becomes permanent world state. Pure.
const TABLE = {
  '002': {
    A: {
      title: 'Survivors were protected',
      text: 'A new faction has formed: the Survivor Community. Future scenarios near the station are safer — and its members remember who stood with them.',
      flags: [['faction.survivor_community', 'formed'], ['area.plaza', 'guarded']],
      cardName: '[The Night the Station Held]',
    },
    B: {
      title: 'The survivors were abandoned',
      text: 'The plaza has become hostile. Scavenger packs roam the exits, and future scenarios here grow more dangerous.',
      flags: [['faction.survivor_community', 'scattered'], ['area.plaza', 'hostile']],
      cardName: '[The Night the Station Fell]',
    },
    divided: {
      title: 'The stream is divided',
      text: 'Half stood guard, half walked away. The plaza simmers — neither safe nor lost. Dokja watches this fracture with unease.',
      flags: [['area.plaza', 'tense']],
      cardName: '[The Night the Stream Split]',
    },
  },
};

export function consequenceFor(scenarioId, winner, { aLabel = 'A', bLabel = 'B' } = {}) {
  const known = TABLE[scenarioId]?.[winner];
  if (known) return known;
  const generic = {
    A: { title: `The stream chose: ${aLabel}`, text: `The majority stood for ${aLabel}. The world shifts to honor it.`, flags: [[`global.${scenarioId}.winner`, 'A']], cardName: `[The Night of ${aLabel}]` },
    B: { title: `The stream chose: ${bLabel}`, text: `The majority stood for ${bLabel}. The world shifts to honor it.`, flags: [[`global.${scenarioId}.winner`, 'B']], cardName: `[The Night of ${bLabel}]` },
    divided: { title: 'The stream is divided', text: 'No path commanded a majority. The world holds its breath.', flags: [[`global.${scenarioId}.winner`, 'divided']], cardName: '[The Night of No Answer]' },
  };
  return generic[winner] || generic.divided;
}
