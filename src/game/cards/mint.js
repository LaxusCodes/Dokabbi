// Cards as a record of the journey: minted from lived scenarios, not just summoned.
export function storyCardFor({ storyId, storyName, scenarioId, choiceId, power = 1 }) {
  const card_id = `${storyId}@${scenarioId}`;
  return {
    card_id,
    name: `[The Day You ${titleFromChoice(choiceId)}]`,
    scenario_id: scenarioId,
    effect: `Born in Scenario ${scenarioId} — ${storyName}. When protecting a party member, gain +${power} Status.`,
    power,
  };
}

function titleFromChoice(choiceId) {
  const map = { help: 'Refused to Run', lure: 'Drew Its Gaze', forewarn: 'Spoke the Future', lead: 'Took the Lead', scout: 'Walked Ahead' };
  return map[choiceId] || 'Stood Your Ground';
}

export function mintStoryCard(db, discordId, def) {
  db.prepare(
    'INSERT OR IGNORE INTO story_cards (card_id, discord_id, name, scenario_id, effect, power) VALUES (?,?,?,?,?,?)'
  ).run(def.card_id, discordId, def.name, def.scenario_id, def.effect, def.power);
}

export function storyCardsOf(db, discordId) {
  return db.prepare('SELECT * FROM story_cards WHERE discord_id = ? ORDER BY rowid').all(discordId);
}
