// Compact identity panel: one glance at a life. Pure formatter.
// relations: optional sentimentSummary().rows — renders the full
// 🌌 CONSTELLATION RELATIONS section (status shows only the summary).
export function profileText({ name, title, level, status, activeTitle, titles, showcase, companion, nebula, sponsor, divergence, relations }) {
  const lines = [`👤 **${name}** — *${title}*  •  Lv ${level} (${status || 'alive'})`];
  if (activeTitle) lines.push(`🏷️ ${activeTitle}`);
  if (titles?.length) lines.push(`👑 ${titles.length} epithet(s): ${titles.slice(0, 4).join(', ')}${titles.length > 4 ? '…' : ''}`);
  lines.push(`⭐ Sponsor: ${sponsor || 'none'}   🌌 Faction: ${nebula || 'none'}`);
  if (relations?.length) {
    lines.push(`🌌 CONSTELLATION RELATIONS`);
    for (const r of relations) lines.push(`${r.icon || '❓'} ${r.name} — ${r.mark || '— 0'}`);
  }
  if (companion) lines.push(`🤝 Companion: ${companion}`);
  if (showcase?.length) lines.push(`🎴 Showcase: ${showcase.map((s) => s.name).join(' • ')}`);
  if (divergence !== undefined) lines.push(`⚖️ Divergence: ${divergence}`);
  return lines.join('\n');
}
