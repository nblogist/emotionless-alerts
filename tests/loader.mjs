// Register ESM resolve hook for Node.js 24+
import { register } from 'node:module';
register('./hooks.mjs', import.meta.url);
