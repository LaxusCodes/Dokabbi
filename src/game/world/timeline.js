// Server timeline: the server's own Story, assembled from its history. Pure.
export function buildTimeline({ stream, instances = [], globals = [], events = [], flags = {} }) {
  const lines = ['🌌 **SERVER TIMELINE**'];
  lines.push(`Current: Scenario **${stream?.current_scenario || '001'}**`);
  for (const g of globals) {
    lines.push(`Global #${g.id} (${g.scenario_id}): ${g.consequence || 'open'} — A "${g.a_label}" vs B "${g.b_label}"`);
  }
  for (const i of instances.filter((x) => x.altered)) {
    lines.push(`⚠️ Scenario ${i.scenario_id} altered${i.altered_by ? '' : ''}${i.summary ? ` — ${i.summary}` : ''}`);
  }
  const clears = events.filter((e) => e.kind === 'scenario_clear').length;
  if (clears) lines.push(`✓ ${clears} scenario clears recorded`);
  for (const [k, v] of Object.entries(flags)) lines.push(`• ${k} = ${v}`);
  if (lines.length === 2) lines.push('_Unwritten. Survive something worth remembering._');
  return lines.join('\n');
}
