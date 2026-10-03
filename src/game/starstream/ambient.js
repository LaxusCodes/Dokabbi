import { getDb } from '../../database/db.js';
import { dueEchoes, deliverEcho, getStreamChannel } from '../world/echoes.js';
import { recentEvents } from '../world/store.js';
import { hostFor, commentFor } from './dokkaebis.js';

// The Stream speaks unprompted — but only where invited (stream channel set).
// Called on a timer; every delivery is exactly-once and history-append-only.
export async function pumpGuild(client, guildId) {
  const posted = [];
  const channelId = getStreamChannel(guildId);
  if (!channelId) return posted;
  let channel = null;
  try {
    channel = await client.channels.fetch(channelId);
  } catch {
    return posted;
  }
  if (!channel?.isTextBased()) return posted;
  for (const echo of dueEchoes(guildId)) {
    const delivered = deliverEcho(echo.id);
    if (delivered) {
      await channel.send(delivered.summary).catch(() => null);
      posted.push(delivered.summary);
    }
  }
  // Ambient Dokkaebi voice: at most one quip per pump, only on fresh events.
  const latest = recentEvents(guildId, 1)[0];
  if (latest && Math.random() < 0.3) {
    const quip = commentFor(hostFor(guildId), latest.kind || 'clear', Math.random);
    if (quip) {
      await channel.send(`🎙️ ${quip}`).catch(() => null);
      posted.push(quip);
    }
  }
  return posted;
}

export function configuredGuilds() {
  return getDb().prepare('SELECT guild_id, stream_channel_id FROM guild_config WHERE stream_channel_id IS NOT NULL').all();
}

export async function pumpAll(client) {
  const out = [];
  for (const row of configuredGuilds()) {
    try {
      out.push(...await pumpGuild(client, row.guild_id));
    } catch (e) {
      console.error('pump failed for', row.guild_id, e.message);
    }
  }
  return out;
}
