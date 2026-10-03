// Dokkaebi hosts: operators with taste. Pure commentary.
import hosts from '../../../data/dokkaebis.json' with { type: 'json' };

export const listHosts = () => hosts;

export function hostFor(guildId) {
  const h = [...String(guildId)].reduce((s, ch) => s + ch.charCodeAt(0), 0);
  return hosts[h % hosts.length];
}

const QUIPS = {
  chaotic: {
    liked: ['"OH. OH NO. KEEP GOING."', '"The stream just stood up."', '"Clip that. CLIP THAT."'],
    disliked: ['"Anyone else bored? Just me? Right?"', '"Safe. Predictable. Yawn."'],
  },
  dramatic: {
    liked: ['"A star is born tonight."', '"The narrative bends — beautifully."'],
    disliked: ['"The audience did not come for silence."'],
  },
  ominous: {
    liked: ['"...noted."', '"The frequency hums. Something shifted."'],
    disliked: ['"...static. Nothing."'],
  },
};

// Returns a quip or null (hosts don't narrate everything).
export function commentFor(host, eventKind, rng = Math.random) {
  const bank = QUIPS[host.style] || QUIPS.chaotic;
  if (host.likes.includes(eventKind)) return `${host.name}: ${bank.liked[Math.floor(rng() * bank.liked.length)]}`;
  if (host.dislikes.includes(eventKind)) return rng() < 0.4 ? `${host.name}: ${bank.disliked[Math.floor(rng() * bank.disliked.length)]}` : null;
  return rng() < 0.15 ? `${host.name}: "Hm."` : null;
}
