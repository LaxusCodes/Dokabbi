// Tiny in-process event bus: the Nebula layer listens to the story, commands stay thin.
// Events: scenario_cleared, scenario_altered, sponsor_signed, sponsor_broken,
// wager_settled, knowledge_shared, combat_finished.
const handlers = new Map();

export function on(event, fn) {
  if (!handlers.has(event)) handlers.set(event, []);
  handlers.get(event).push(fn);
  return () => off(event, fn);
}

export function off(event, fn) {
  const list = handlers.get(event) || [];
  handlers.set(event, list.filter((f) => f !== fn));
}

export function emit(event, payload = {}) {
  for (const fn of handlers.get(event) || []) {
    try {
      fn(payload);
    } catch (e) {
      console.error(`event ${event} handler failed:`, e);
    }
  }
}
