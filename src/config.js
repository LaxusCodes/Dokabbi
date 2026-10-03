import 'dotenv/config';

export const config = {
  token: process.env.DISCORD_TOKEN,
  clientId: process.env.CLIENT_ID,
  guildId: process.env.GUILD_ID,
  dbPath: process.env.DATABASE_PATH || './data/starstream.db',
  prefix: process.env.PREFIX || 'orv',
};
