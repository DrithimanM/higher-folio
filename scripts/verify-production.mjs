import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const fail = (message) => { throw new Error(`Production verification failed: ${message}`); };
const index = read('index.html');
const app = read('app.js');
const workflow = read('.github/workflows/deploy-pages.yml');

execFileSync(process.execPath, ['--check', fileURLToPath(new URL('../app.js', import.meta.url))], {stdio: 'inherit'});

const csp = index.match(/Content-Security-Policy" content="([^"]+)"/u)?.[1] || '';
for (const directive of ["default-src 'self'", "connect-src 'none'", "object-src 'none'", "script-src 'self' 'wasm-unsafe-eval'", "img-src 'self' data: blob:"]) {
  if (!csp.includes(directive)) fail(`CSP is missing ${directive}`);
}
if (/<script(?![^>]*\bsrc=)/u.test(index)) fail('inline script found in index.html');
if (!app.includes("{name: 'AES-GCM', length: 256}")) fail('AES-GCM vault encryption is missing');
if (!app.includes("iterations: 600000, hash: 'SHA-256'")) fail('PBKDF2 work factor is missing');
if (!app.includes("const acceptedImageTypes = new Set(['image/jpeg', 'image/png', 'image/webp'])")) fail('raster-only upload allowlist is missing');
if (app.includes('file.type.startsWith')) fail('broad image MIME acceptance is still present');
if (/\beval\s*\(|new Function\s*\(/u.test(app)) fail('dynamic JavaScript evaluation found');
if (app.includes('Math.random')) fail('non-cryptographic identifier generation found');
if (!workflow.includes('node scripts/verify-production.mjs')) fail('Pages deployment does not run the production verification gate');
if (!workflow.includes('actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683')) fail('checkout action is not pinned to an immutable commit');

console.log('Production security checks passed.');
