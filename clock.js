(async () => {
  const box = document.getElementById('clockbody');
  if (!box) return;
  const b64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  const say = t => { box.textContent = t; box.className = 'empty'; };
  let st = null;
  try {
    const pem = (await (await fetch('public.pem')).text()).replace(/-----[^-]+-----|\s/g, '');
    const key = await crypto.subtle.importKey('spki', b64(pem), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    const r = await fetch('status.json?t=' + Date.now(), { cache: 'no-store' });
    if (r.ok) {
      const s = await r.json();
      const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64(s.sig),
        new TextEncoder().encode(`${s.state}\n${s.at}\n${s.tz}\n${s.offset}`));
      if (ok) st = s;
    }
  } catch {}
  if (!st) return say("My clock isn't set up yet.");

  const ownOff = d => {
    if (st.tz) {
      try {
        return Math.round((new Date(d.toLocaleString('en-US', { timeZone: st.tz })) -
                           new Date(d.toLocaleString('en-US', { timeZone: 'UTC' }))) / 60000);
      } catch {}
    }
    return st.offset;
  };
  const opts = { weekday: 'short', hour: 'numeric', minute: '2-digit', second: '2-digit' };
  const fmtMe = new Intl.DateTimeFormat(undefined, { ...opts, timeZone: 'UTC' });
  const fmtYou = new Intl.DateTimeFormat(undefined, opts);
  const dur = m => { const h = Math.floor(m / 60), r = m % 60;
    return [h && `${h} hour${h > 1 ? 's' : ''}`, r && `${r} min`].filter(Boolean).join(' '); };
  const ago = at => { const m = Math.max(0, Math.round((Date.now() - Date.parse(at)) / 60000));
    return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 2880 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`; };

  const me = document.getElementById('ck-me'), you = document.getElementById('ck-you');
  const diff = document.getElementById('ck-diff'), stat = document.getElementById('ck-stat');
  const on = st.state === 'online';
  const dot = document.createElement('span'); dot.className = 'dot ' + (on ? 'on' : 'off'); dot.setAttribute('aria-hidden', 'true');
  const tick = () => {
    const d = new Date(), mine = ownOff(d), dm = Math.round(-d.getTimezoneOffset() - mine);
    me.textContent = fmtMe.format(new Date(d.getTime() + mine * 60000));
    you.textContent = fmtYou.format(d);
    diff.textContent = dm === 0 ? "We're on the same time." : `You're ${dur(Math.abs(dm))} ${dm > 0 ? 'ahead of' : 'behind'} me.`;
    stat.replaceChildren(dot, `${on ? 'Available' : 'Not available'}, updated ${ago(st.at)}`);
  };
  tick(); setInterval(tick, 1000);
})();
