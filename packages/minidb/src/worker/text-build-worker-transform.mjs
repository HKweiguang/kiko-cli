import { register } from 'tsx/esm/api';

register();
await import('./text-build-worker.ts');
