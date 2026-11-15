// Local dev backend: runs the real application routes with credential-free
// in-memory DB + Storage. No cloud resources. Data resets on restart.
import { createServer } from 'node:http';
import { application } from '../functions/routes.mjs';

function createFakeDb() {
  const tables = new Map();
  const rowsOf = (t) => { if (!tables.has(t)) tables.set(t, []); return tables.get(t); };
  const project = (row, cols) => (!cols || cols === '*' ? { ...row } : Object.fromEntries(cols.split(',').map((c) => [c.trim(), row[c.trim()]])));
  function builder(table) {
    const filters = []; const orders = []; let mode = 'read'; let values = null; let conflict = null; let cols = '*'; let count = 1000;
    const run = () => {
      const list = rowsOf(table);
      const match = (r) => filters.every(([k, v]) => r[k] === v);
      if (mode === 'read') {
        let sel = list.filter(match);
        for (const [key, asc] of [...orders].reverse()) sel = [...sel].sort((a, b) => (a[key] < b[key] ? -1 : a[key] > b[key] ? 1 : 0) * (asc ? 1 : -1));
        return { data: sel.slice(0, count).map((r) => project(r, cols)), error: null };
      }
      if (mode === 'insert') {
        if (conflict && list.some((r) => conflict.every((k) => r[k] === values[k]))) return { data: [], error: null };
        const row = { ...values };
        list.push(row);
        return { data: [project(row, cols)], error: null };
      }
      const matched = list.filter(match);
      for (const r of matched) Object.assign(r, values);
      return { data: matched.map((r) => project(r, cols)), error: null };
    };
    const chain = {
      select(c) { cols = c; return chain; },
      eq(k, v) { filters.push([k, v]); return chain; },
      order(k, o = {}) { orders.push([k, o.ascending !== false]); return chain; },
      limit(n) { count = n; return chain; },
      insert(v) { mode = 'insert'; values = v; return chain; },
      insertIfAbsent(v, o) { mode = 'insert'; values = v; conflict = (o?.onConflict ?? '').split(',').map((x) => x.trim()).filter(Boolean); return chain; },
      update(v) { mode = 'update'; values = v; return chain; },
      then(res, rej) { return Promise.resolve().then(run).then(res, rej); },
    };
    return chain;
  }
  return { from: (t) => builder(t), dump: (t) => rowsOf(t).map((r) => ({ ...r })) };
}

function createFakeStorage() {
  const objects = new Map(); const signatures = new Map();
  const sign = (path, operation) => {
    const token = crypto.randomUUID();
    signatures.set(token, { path, operation, expires: Date.now() + 300000 });
    return { signedUrl: `/storage/v1/object/${operation === 'upload' ? 'upload/sign' : 'sign'}/local/${path}?token=${token}` };
  };
  const storage = {
    async createSignedUploadUrl(path) { return sign(path, 'upload'); },
    async createSignedUrl(path) { return sign(path, 'download'); },
    async download(path) {
      const o = objects.get(path);
      if (!o) { const e = new Error('not found'); e.code = 'storage_object_not_found'; throw e; }
      return new Response(o.bytes, { headers: { 'content-type': o.type, 'content-length': String(o.bytes.length) } });
    },
  };
  async function transfer(request) {
    const url = new URL(request.url);
    const sig = signatures.get(url.searchParams.get('token'));
    if (!sig || sig.expires < Date.now()) return new Response(JSON.stringify({ error: 'signature_expired' }), { status: 403 });
    if (sig.operation === 'download' && request.method === 'GET') return storage.download(sig.path);
    if (sig.operation !== 'upload' || request.method !== 'PUT') return new Response(JSON.stringify({ error: 'method_not_allowed' }), { status: 405 });
    const bytes = new Uint8Array(await request.arrayBuffer());
    if (bytes.length > 25 * 1024 * 1024) return new Response(JSON.stringify({ error: 'payload_too_large' }), { status: 413 });
    objects.set(sig.path, { bytes, type: request.headers.get('content-type') ?? 'application/octet-stream' });
    return Response.json({ ok: true });
  }
  return { storage, transfer };
}

const db = createFakeDb();
const { storage, transfer } = createFakeStorage();
const handle = application({ db, storage, demoAccounts: true });

const server = createServer(async (incoming, outgoing) => {
  try {
    const url = new URL(incoming.url, `http://${incoming.headers.host}`);
    const chunks = []; let size = 0;
    for await (const chunk of incoming) { size += chunk.length; if (size > 30 * 1024 * 1024) throw new Error('too large'); chunks.push(chunk); }
    const hasBody = !['GET', 'HEAD'].includes(incoming.method);
    const request = new Request(url, { method: incoming.method, headers: incoming.headers, ...(hasBody ? { body: Buffer.concat(chunks) } : {}) });
    let response;
    if (url.pathname.startsWith('/storage/v1/')) response = await transfer(request);
    else response = await handle({ request });
    outgoing.writeHead(response.status, { ...Object.fromEntries(response.headers), 'cache-control': 'no-store' });
    outgoing.end(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    outgoing.writeHead(500, { 'content-type': 'application/json' });
    outgoing.end(JSON.stringify({ detail: 'local_failure', error: 'local_failure' }));
  }
});

const port = Number(process.env.PORT ?? 8000);
server.listen(port, '127.0.0.1', () => {
  console.log(`ExamWorld local backend: http://127.0.0.1:${port}/functions/v1/app/api/health`);
  console.log('In-memory data; local demo accounts are enabled for development only.');
});