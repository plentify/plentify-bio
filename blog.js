const box = document.getElementById('posts');
const b64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const say = t => { box.innerHTML = ''; const p = document.createElement('p'); p.className = 'empty'; p.textContent = t; box.append(p); };

async function loadKey() {
  const r = await fetch('public.pem');
  if (!r.ok) throw new Error('no key');
  const pem = (await r.text()).replace(/-----[^-]+-----|\s/g, '');
  return crypto.subtle.importKey('spki', b64(pem), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
}

const valid = (key, p) => crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64(p.sig),
  new TextEncoder().encode(`${p.title}\n${p.date}\n${p.body}`));

(async () => {
  let key, slugs;
  try { key = await loadKey(); } catch { return say('Blog is not set up yet. Run publish.py keygen first.'); }
  try { slugs = await (await fetch('posts/index.json')).json(); } catch { return say('Could not load posts.'); }
  const out = [];
  for (const s of slugs) {
    try {
      const p = await (await fetch(`posts/${encodeURIComponent(s)}.json`)).json();
      if (await valid(key, p)) out.push(p);
    } catch {}
  }
  if (!out.length) return say('No posts yet.');
  box.innerHTML = '';
  for (const p of out) {
    const d = document.createElement('details'); d.className = 'post'; if (p === out[0]) d.open = true;
    const s = document.createElement('summary'); s.textContent = p.title;
    const t = document.createElement('time'); t.textContent = p.date;
    const b = document.createElement('div'); b.className = 'body';
    p.body.split(/\n\s*\n/).forEach(x => { const el = document.createElement('p'); el.textContent = x.trim(); b.append(el); });
    d.append(s, t, b); box.append(d);
  }
})();
