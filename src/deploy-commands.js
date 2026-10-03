import { deployCommands } from './deploy.js';

try {
  await deployCommands();
} catch (e) {
  console.error(`deploy failed: ${e.message}`);
  process.exitCode = 1;
}
