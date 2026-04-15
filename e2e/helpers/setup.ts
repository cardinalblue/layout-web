import { afterAll } from 'vitest';
import { closeBrowser } from './browser';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

afterAll(async () => {
  await closeBrowser();
});

export { BASE_URL };
