// O tsc não copia os modelos de e-mail (.html, .txt e os dados de exemplo) para dist.
import { cpSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const from = join(root, 'notifications/templates/email');
const to = join(root, 'dist/notifications/templates/email');
mkdirSync(join(to, 'fixtures'), { recursive: true });
for (const f of readdirSync(from)) if (/\.(html|txt)$/.test(f)) cpSync(join(from, f), join(to, f));
cpSync(join(from, 'fixtures/sample-data.json'), join(to, 'fixtures/sample-data.json'));
