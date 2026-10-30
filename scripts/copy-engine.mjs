import { mkdir, copyFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const target = resolve(root, 'public/engine');
const modules = ['lang.js', 'run.js', 'infra.js', 'sim.js', 'starter.js'];

await mkdir(target, { recursive: true });
await Promise.all(modules.map((file) => copyFile(resolve(root, 'poc/src', file), resolve(target, file))));
