// Server story cards: history owned by the entire Star Stream.
export function serverStoryCardFor({ globalId, scenarioId, name, participantCount, cause }) {
  return {
    card_id: `server_${globalId}`,
    name,
    scenario_id: scenarioId,
    effect: `Created by ${participantCount} incarnations. Cause: ${cause}. This Story belongs to the entire Star Stream.`,
    power: 5,
  };
}
