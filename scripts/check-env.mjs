import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(root, '.env') });

const url = process.env.SUPABASE_URL ?? '';
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const bucket = process.env.SUPABASE_STORAGE_BUCKET ?? 'music-video-assets';
const openaiKey = process.env.OPENAI_API_KEY ?? '';
const falKey = process.env.FAL_KEY ?? '';

const results = [];

results.push({
  check: 'SUPABASE_URL set',
  ok: url.length > 0,
  detail: url ? `${url.split('.')[0]}...` : 'missing',
});
results.push({
  check: 'SUPABASE_SERVICE_ROLE_KEY set',
  ok: key.length > 20,
  detail: key ? `present (${key.length} chars)` : 'missing',
});
results.push({
  check: 'OPENAI_API_KEY set',
  ok: openaiKey.startsWith('sk-'),
  detail: openaiKey ? 'present' : 'missing',
});
results.push({
  check: 'FAL_KEY set',
  ok: falKey.length > 10,
  detail: falKey ? 'present' : 'missing',
});

if (!url || !key) {
  console.log(JSON.stringify({ allOk: false, results }, null, 2));
  process.exit(1);
}

const client = createClient(url, key, { auth: { persistSession: false } });

const { data: projects, error: dbError } = await client
  .from('video_projects')
  .select('id, name')
  .limit(5);
results.push({
  check: 'Supabase DB (video_projects)',
  ok: !dbError,
  detail: dbError ? dbError.message : `${projects?.length ?? 0} project(s) found`,
});

const { data: buckets, error: bucketListError } = await client.storage.listBuckets();
const bucketExists = buckets?.some((b) => b.name === bucket);
results.push({
  check: `Storage bucket "${bucket}"`,
  ok: !bucketListError && bucketExists,
  detail: bucketListError
    ? bucketListError.message
    : bucketExists
      ? 'exists'
      : 'NOT FOUND — create it in Supabase Storage',
});

if (bucketExists) {
  const { error: listError } = await client.storage.from(bucket).list('', { limit: 1 });
  results.push({
    check: 'Storage bucket readable',
    ok: !listError,
    detail: listError ? listError.message : 'ok',
  });
}

if (openaiKey.startsWith('sk-')) {
  try {
    const res = await fetch('https://api.openai.com/v1/models', {
      headers: { Authorization: `Bearer ${openaiKey}` },
    });
    results.push({
      check: 'OpenAI API key',
      ok: res.ok,
      detail: res.ok ? 'valid' : `HTTP ${res.status} — key may be invalid or expired`,
    });
  } catch (e) {
    results.push({ check: 'OpenAI API key', ok: false, detail: String(e) });
  }
}

if (falKey.length > 10) {
  try {
    const res = await fetch('https://fal.run/fal-ai/flux/schnell', {
      method: 'POST',
      headers: {
        Authorization: `Key ${falKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ prompt: 'health check', num_images: 1 }),
    });
    results.push({
      check: 'fal.ai API key',
      ok: res.status !== 401 && res.status !== 403,
      detail: res.status === 401 || res.status === 403 ? 'unauthorized' : `HTTP ${res.status}`,
    });
  } catch (e) {
    results.push({ check: 'fal.ai API key', ok: false, detail: String(e) });
  }
}

const allOk = results.every((r) => r.ok);
console.log(JSON.stringify({ allOk, results }, null, 2));
process.exit(allOk ? 0 : 1);
