// Probability pressure: too many eyes bend the world. Pure.
export function disturbanceDeltaFor(eventKind) {
  const map = {
    altered: 15, gambit: 10, collision: 8, clash: 8, underdog: 10,
    intervention: -12, defer: -3,
  };
  return map[eventKind] ?? 1;
}

export function pressureLevel(disturbance) {
  if (disturbance >= 60) return 'warning';
  if (disturbance >= 30) return 'watch';
  return 'calm';
}

export function pressureLine(level) {
  if (level === 'warning') return '⚠️ PROBABILITY WARNING — too many eyes are focused. Unusual intervention detected. The Director adds +10% rewards while the storm lasts.';
  if (level === 'watch') return '👁 Probability stirs under the audience glare.';
  return null;
}
