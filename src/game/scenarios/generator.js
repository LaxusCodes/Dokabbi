// Chapter assembly: Data (possible universe) + snapshot (what happened) = what can happen next.
// Pure — persistence lives in director.js. Never mutates history.
import templates from '../../../data/chapters.json' with { type: 'json' };
import { matchWhen } from './conditions.js';
import { difficultyFor } from './modifiers.js';

export function templateFor(chapterNo) {
  const found = templates.find((t) => t.no === chapterNo);
  if (found) return found;
  // Beyond scripted chapters: the stream improvises from the latest template.
  return { ...templates[templates.length - 1], no: chapterNo };
}

export function generateChapter(chapterNo, snapshot = {}, rng = Math.random) {
  void rng;
  const t = templateFor(chapterNo);
  const title = (t.titles || []).find((v) => matchWhen(v.when, snapshot))?.title || t.defaultTitle;
  const brief = (t.brief || []).filter((b) => matchWhen(b.when, snapshot)).map((b) => b.line);
  // A running season speaks first: same premise, different reality per server.
  if (snapshot.seasonPremise) {
    brief.unshift(`🌌 SEASON — "${snapshot.seasonName}": ${snapshot.seasonPremise}`);
  }
  // Cross-server ripples: another server's scream echoes into this chapter.
  if ((snapshot.globalRipples || []).length) {
    brief.push(`📡 Elsewhere in the Stream: ${(snapshot.globalRipples[0].summary || '').slice(0, 120)}`);
  }
  const difficulty = difficultyFor(snapshot);
  return {
    chapterNo,
    title,
    brief,
    paths: t.paths || [],
    difficulty,
    generatedFrom: {
      clears: snapshot.clears || 0,
      alters: snapshot.alters || 0,
      flags: Object.keys(snapshot.flags || {}).length,
      attention: snapshot.dokjaAttention || 0,
    },
  };
}
