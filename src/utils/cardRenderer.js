import { createCanvas } from '@napi-rs/canvas';
import characters from '../../data/characters.json' with { type: 'json' };
import monsters from '../../data/monsters.json' with { type: 'json' };
import cards from '../../data/cards.json' with { type: 'json' };
import { RANKS } from '../game/cards/characters.js';

const CACHE = new Map();

const RANK_COLORS = {
  C: '#808080', B: '#57f287', A: '#5865f2', S: '#9b59b6',
  'S+': '#c084fc', SS: '#ffd166', SSS: '#ff5555',
};
const RANK_BORDERS = {
  C: '#555555', B: '#2ecc71', A: '#3498db', S: '#8e44ad',
  'S+': '#a855f7', SS: '#f59e0b', SSS: '#ef4444',
};

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function drawEmblem(ctx, cx, cy, r, color, name) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  const grad = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, 0, cx, cy, r);
  grad.addColorStop(0, color + '44');
  grad.addColorStop(1, 'transparent');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.font = `bold ${Math.max(14, r * 0.7)}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(name.charAt(0).toUpperCase(), cx, cy + 1);
  ctx.restore();
}

function drawBar(ctx, x, y, w, h, ratio, color) {
  ctx.fillStyle = '#1a1a2e';
  roundRect(ctx, x, y, w, h, 3);
  ctx.fill();
  const fill = Math.max(0, Math.min(1, ratio));
  if (fill > 0) {
    ctx.fillStyle = color;
    roundRect(ctx, x, y, Math.max(1, w * fill), h, 3);
    ctx.fill();
  }
}

function drawTag(ctx, x, y, tag, color) {
  const tw = tag.length * 10 + 16;
  ctx.fillStyle = color + '33';
  roundRect(ctx, x, y, tw, 18, 4);
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  roundRect(ctx, x, y, tw, 18, 4);
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.font = 'bold 11px sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(tag, x + 8, y + 9);
  return tw;
}

function renderCharacter(entity) {
  const W = 320, H = 440;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  const rank = entity.gameRank || entity.rarity || 'C';
  const rankColor = RANK_COLORS[rank] || RANK_COLORS.C;
  const borderColor = RANK_BORDERS[rank] || RANK_BORDERS.C;
  const name = entity.name || entity.id;
  const role = entity.role || '';
  const faction = entity.faction || '';
  const tags = entity.tags || [];
  const initial = name.charAt(0);

  // Background
  ctx.fillStyle = '#0d0d1a';
  roundRect(ctx, 0, 0, W, H, 12);
  ctx.fill();

  // Top accent bar
  ctx.fillStyle = rankColor;
  roundRect(ctx, 8, 8, W - 16, 6, 3);
  ctx.fill();

  // Portrait area with emblem
  const portraitR = 48;
  const portraitCx = W / 2;
  const portraitCy = 110;
  drawEmblem(ctx, portraitCx, portraitCy, portraitR, rankColor);

  // Rank badge
  ctx.fillStyle = rankColor;
  roundRect(ctx, portraitCx - 30, portraitCy + portraitR + 10, 60, 24, 4);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 14px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(rank, portraitCx, portraitCy + portraitR + 22);

  // Name
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 22px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(name, W / 2, 200);

  // Role / Faction
  if (role) {
    ctx.fillStyle = '#aaaaaa';
    ctx.font = '14px sans-serif';
    ctx.fillText(role, W / 2, 225);
  }
  if (faction) {
    ctx.fillStyle = '#888888';
    ctx.font = '12px sans-serif';
    ctx.fillText(faction, W / 2, 242);
  }

  // Tags
  let tx = W / 2;
  const tagStartX = (W - tags.length * 50) / 2;
  tags.forEach((tag, i) => {
    tx = tagStartX + i * 52;
    const tw = drawTag(ctx, tx, 262, tag, rankColor);
  });

  // Description
    if (entity.description) {
      ctx.fillStyle = '#cccccc';
      ctx.font = '12px sans-serif';
      const desc = truncateText(entity.description, 60);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      wrapText(ctx, desc, 16, 290, W - 32, 16);
    }

  // Bottom border
  ctx.fillStyle = borderColor;
  roundRect(ctx, 4, H - 8, W - 8, 4, 2);
  ctx.fill();

  return canvas.toBuffer('image/png');
}

function renderMonster(entity) {
  const W = 320, H = 280;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  const tier = entity.tier || 1;
  const tierColors = ['#57f287', '#9b59b6', '#ff5555'];
  const tierColor = tierColors[Math.min(tier - 1, 2)] || '#57f287';
  const name = entity.name || entity.id;

  ctx.fillStyle = '#0d0d1a';
  roundRect(ctx, 0, 0, W, H, 12);
  ctx.fill();

  // Accent
  ctx.fillStyle = tierColor;
  roundRect(ctx, 8, 8, W - 16, 6, 3);
  ctx.fill();

  // Icon emblem
  const iconR = 40;
  const iconCx = W / 2;
  const iconCy = 90;
  drawEmblem(ctx, iconCx, iconCy, iconR, tierColor);

  // Name
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 20px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(name, W / 2, 160);

  // HP bar
  ctx.fillStyle = '#aaaaaa';
  ctx.font = 'bold 12px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('HP', 20, 195);
  drawBar(ctx, 20, 210, 140, 14, entity.hp / 200, '#ff5555');
  ctx.fillStyle = '#fff';
  ctx.font = '11px sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(`${entity.hp}`, 165, 219);

  // Power bar
  ctx.textAlign = 'left';
  ctx.fillStyle = '#aaaaaa';
  ctx.fillText('PWR', 20, 240);
  drawBar(ctx, 20, 255, 140, 14, entity.power / 100, '#ffd166');
  ctx.fillStyle = '#fff';
  ctx.font = '11px sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(`${entity.power}`, 165, 264);

  // Tier badge
  ctx.fillStyle = tierColor + '44';
  roundRect(ctx, W - 60, 16, 44, 20, 4);
  ctx.fill();
  ctx.strokeStyle = tierColor;
  ctx.lineWidth = 1;
  roundRect(ctx, W - 60, 16, 44, 20, 4);
  ctx.stroke();
  ctx.fillStyle = tierColor;
  ctx.font = 'bold 12px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`T${tier}`, W - 38, 26);

  return canvas.toBuffer('image/png');
}

function renderProfile(player, stats) {
  const W = 600, H = 200;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  const name = player?.name || 'Unknown';
  const level = player?.level || 0;
  const coins = player?.coins || 0;
  const hp = player?.hp || 100;
  const maxHp = player?.max_hp || 100;
  const energy = player?.energy || 50;
  const maxEnergy = player?.max_energy || 50;

  ctx.fillStyle = '#0d0d1a';
  roundRect(ctx, 0, 0, W, H, 12);
  ctx.fill();

  // Top gradient bar
  const grad = ctx.createLinearGradient(0, 0, W, 0);
  grad.addColorStop(0, '#5865f2');
  grad.addColorStop(1, '#9b59b6');
  ctx.fillStyle = grad;
  roundRect(ctx, 0, 0, W, 8, 0);
  ctx.fill();

  // Name and level
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 24px sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(name, 20, 40);

  ctx.fillStyle = '#aaaaaa';
  ctx.font = '14px sans-serif';
  ctx.fillText(`Lv ${level}`, 20, 68);

  // Stats row
  const statY = 100;
  const statItems = [
    { label: 'HP', value: `${hp}/${maxHp}`, color: '#ff5555' },
    { label: 'EN', value: `${energy}/${maxEnergy}`, color: '#5865f2' },
    { label: '💰', value: `${coins}`, color: '#ffd166' },
  ];
  let sx = 20;
  statItems.forEach((s) => {
    ctx.fillStyle = '#888888';
    ctx.font = '11px sans-serif';
    ctx.fillText(s.label, sx, statY);
    ctx.fillStyle = s.color;
    ctx.font = 'bold 13px sans-serif';
    ctx.fillText(s.value, sx, statY + 16);
    sx += 120;
  });

  // Bottom border
  ctx.fillStyle = '#5865f2';
  roundRect(ctx, 4, H - 6, W - 8, 3, 2);
  ctx.fill();

  return canvas.toBuffer('image/png');
}

function wrapText(ctx, text, x, y, maxW, lineH) {
  const words = text.split(' ');
  let line = '';
  let cy = y;
  for (const word of words) {
    const test = line + word + ' ';
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line.trim(), x, cy);
      line = word + ' ';
      cy += lineH;
    } else {
      line = test;
    }
  }
  ctx.fillText(line.trim(), x, cy);
}

export function renderCardImage(entity) {
  if (!entity) return null;
  const key = entity.id || entity.discord_id || JSON.stringify(entity);
  if (CACHE.has(key)) return CACHE.get(key);

  let buf;
  if (entity.hp !== undefined && entity.power !== undefined && !entity.role) {
    buf = renderMonster(entity);
  } else if (entity.level !== undefined || entity.coins !== undefined) {
    const s = entity;
    buf = renderProfile(s, {});
  } else {
    buf = renderCharacter(entity);
  }

  CACHE.set(key, buf);
  return buf;
}

export function clearCardCache() {
  CACHE.clear();
}

export function rankColor(rank) {
  return RANK_COLORS[rank] || RANK_COLORS.C;
}
