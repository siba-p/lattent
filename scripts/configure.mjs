#!/usr/bin/env node
/* Writes the public Supabase and Lemon Squeezy settings into assets/js/config.js.
   Usage: node scripts/configure.mjs --supabase-url URL --anon-key KEY --store-id N
            [--monthly URL --yearly URL --lab URL] */
import { readFileSync, writeFileSync } from 'node:fs';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => {
  if (a.startsWith('--')) acc.push([a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : '']);
  return acc;
}, []));
const file = new URL('../assets/js/config.js', import.meta.url);
let src = readFileSync(file, 'utf8');
const q = s => JSON.stringify(String(s || '')).replace(/"/g, "'");

const url = args['supabase-url'] || '';
if (url && !/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url)) throw new Error('Supabase URL should look like https://abcd.supabase.co');
for (const k of ['monthly', 'yearly', 'lab']) if (args[k] && !/^https:\/\/[\w.-]+\.lemonsqueezy\.com\//.test(args[k])) throw new Error(`--${k} must be a Lemon Squeezy checkout link`);
if (args['anon-key'] && /service_role/.test(Buffer.from((args['anon-key'].split('.')[1] || ''), 'base64').toString())) {
  throw new Error('That is the service-role key. Use the anon (public) key; the service-role key must never be published.');
}

src = src.replace(/supabase: \{[^}]*\}/, `supabase: { url: ${q(url)}, anonKey: ${q(args['anon-key'])} }`);
src = src.replace(/checkout: \{[^}]*\}/, `checkout: { monthly: ${q(args.monthly)}, yearly: ${q(args.yearly)}, lab: ${q(args.lab)} }`);
if (args['store-id']) src = src.replace(/storeId: [^,\n]*/, `storeId: ${Number(args['store-id'])}`);
if (args.support) src = src.replace(/support: '[^']*'/, `support: ${q(args.support)}`);
writeFileSync(file, src);
console.log('Updated assets/js/config.js');
