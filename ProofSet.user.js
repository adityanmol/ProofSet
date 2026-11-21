// ==UserScript==
// @name         ProofSet (IO multi-user proofs)
// @namespace    bluecore.cam.proofset
// @version      1.0.0
// @description  Bluecore-style proof set inside the InsiderOne email editor: previews the email for 10 customers in the campaign audience.
// @author       Aditya Anmol
// @match        https://*.inone.useinsider.com/*
// @run-at       document-idle
// @grant        none
// @homepageURL  https://github.com/adityanmol/ProofSet
// @updateURL    https://raw.githubusercontent.com/adityanmol/ProofSet/main/ProofSet.user.js
// @downloadURL  https://raw.githubusercontent.com/adityanmol/ProofSet/main/ProofSet.user.js
// ==/UserScript==

/*
 * How it works
 *
 * 1. Audience
 *    - On the campaign Recipients step, ProofSet reads the selected Static / Dynamic
 *      segment rule from the page and resolves its id. Saved per panel + campaign in
 *      localStorage (no PII, only segment id + name).
 *    - Override: paste a segment link (/dynamic-segments/76 or /static-segments/2)
 *      in the ProofSet drawer.
 *
 * 2. Users
 *    - "Refresh Proofs" pulls the segment's first page of users (panel's own
 *      /contact/proxy/... records request), picks 10 at random and stores them in
 *      sessionStorage (insider_id + masked email only).
 *    - If sessionStorage already has users for this campaign + audience, those same
 *      users are reused every time the drawer opens. Otherwise the drawer shows the
 *      Refresh Proofs CTA.
 *
 * 3. Proofs
 *    - For each user, calls the same request "Previewing As" uses:
 *      POST /newsletter/dynamic-content-preview/get-preview-content
 *      with the current (unsaved) template HTML, subject and preheader from the editor.
 *    - The response has fully rendered HTML (Liquid resolved), resolved subject and a
 *      screenshot thumbnail URL. ProofSet renders the HTML in a sandboxed iframe
 *      (no scripts) and falls back to the thumbnail if HTML is empty.
 *
 * Internal panel endpoints are undocumented and may change without notice.
 */

(function () {
  'use strict';

  const CFG = {
    sampleSize: 10,
    concurrency: 3,
    pollTries: 15,
    pollDelayMs: 1500,
    gmailClipKB: 102,
    cardMaxHeight: 900,
  };

  const PANEL = location.hostname.split('.')[0];
  const LS_AUDIENCE = (cid) => `proofset:audience:${PANEL}:${cid}`; // legacy (v0.1 to v0.5)
  const LS_CAMPAIGN_AUD = (cid) => `proofset:campaign-audience:${PANEL}:${cid}`; // captured from Recipients
  const LS_OVERRIDE_AUD = (cid) => `proofset:override-audience:${PANEL}:${cid}`; // pasted segment link
  const SS_USERS = (cid, aud) => `proofset:users:${PANEL}:${cid}:${aud.type}_${aud.id}`;

  /* ---------------- helpers ---------------- */

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const csrf = () => document.querySelector('meta[name="csrf-token"]')?.content || '';
  const headers = () => ({
    'Content-Type': 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
    'X-CSRF-TOKEN': csrf(),
  });
  const b64enc = (s) => btoa(unescape(encodeURIComponent(s || '')));
  const b64dec = (s) => {
    if (!s) return '';
    try { return decodeURIComponent(escape(atob(s))); } catch (e) { try { return atob(s); } catch (e2) { return ''; } }
  };
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const maskEmail = (e) => {
    if (!e || !e.includes('@')) return e ? e.slice(0, 1) + '***' : '(no email)';
    const [u, d] = e.split('@');
    return `${u.slice(0, 1)}***@${d}`;
  };
  const kb = (bytes) => (bytes / 1024).toFixed(2);

  function campaignInfo() {
    const m = location.pathname.match(/\/email\/(\d+)\/(recipients|design|launch)/);
    return m ? { id: m[1], step: m[2] } : null;
  }

  function vueVms() {
    const set = new Set();
    document.querySelectorAll('body *').forEach((el) => { if (el.__vue__) set.add(el.__vue__); });
    return [...set];
  }

  function store() {
    const vm = vueVms()[0];
    return vm && vm.$root && vm.$root.$store;
  }

  async function api(url, opts = {}) {
    const res = await fetch(url, { credentials: 'include', headers: headers(), ...opts });
    let json = null;
    try { json = await res.json(); } catch (e) { /* non-JSON */ }
    return { status: res.status, json };
  }

  async function pool(items, limit, worker) {
    const out = new Array(items.length);
    let i = 0;
    const run = async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await worker(items[idx], idx);
      }
    };
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
    return out;
  }

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  /* ---------------- audience ---------------- */

  const readLS = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } };

  // One-time move of the old single key into the campaign / override keys.
  function migrateAudience(cid) {
    const old = readLS(LS_AUDIENCE(cid));
    if (!old) return;
    const key = old.source === 'manual' ? LS_OVERRIDE_AUD(cid) : LS_CAMPAIGN_AUD(cid);
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(old));
    localStorage.removeItem(LS_AUDIENCE(cid));
  }
  // The campaign's own audience, as set on its Recipients step.
  function getCampaignAudience(cid) { migrateAudience(cid); return readLS(LS_CAMPAIGN_AUD(cid)); }
  function setCampaignAudience(cid, aud) { localStorage.setItem(LS_CAMPAIGN_AUD(cid), JSON.stringify({ ...aud, source: 'campaign' })); }
  // A segment the user chose instead, via "Change audience".
  function getOverrideAudience(cid) { migrateAudience(cid); return readLS(LS_OVERRIDE_AUD(cid)); }
  function setOverrideAudience(cid, aud) { localStorage.setItem(LS_OVERRIDE_AUD(cid), JSON.stringify({ ...aud, source: 'manual' })); }
  function clearOverrideAudience(cid) { localStorage.removeItem(LS_OVERRIDE_AUD(cid)); }
  const sameAud = (a, b) => !!a && !!b && a.type === b.type && Number(a.id) === Number(b.id);
  // Audience in use: the user's choice if any, otherwise the campaign's own.
  function getAudience(cid) { return getOverrideAudience(cid) || getCampaignAudience(cid); }

  async function staticSegmentList() {
    const all = [];
    for (let page = 1; page <= 20; page++) {
      const { json } = await api(`/segmentation/saved-segments/static-segment?page=${page}`);
      (json?.data || []).forEach((s) => all.push({ id: s.value, name: s.text }));
      if (!json?.links?.next) break;
    }
    return all;
  }

  async function dynamicSegmentList() {
    const all = [];
    for (let page = 1; page <= 20; page++) {
      const { json } = await api(`/segmentation/saved-segments/dynamic-segment?per_page=100&page=${page}`);
      (json?.data || []).forEach((s) => all.push({ id: s.id, name: s.name }));
      if (!json?.next_page_url) break;
    }
    return all;
  }

  // Reads the segment rule shown on the Recipients step (e.g. "Static Segment Name is X").
  function readRecipientRule() {
    for (const vm of vueVms()) {
      const qd = vm.$data && vm.$data.queryDescriptions;
      if (!qd || !Array.isArray(qd.groups)) continue;
      const found = [];
      qd.groups.flat().forEach((c) => {
        if (!c || !c.title || !c.value) return;
        const type = /static segment/i.test(c.title) ? 'static' : /dynamic segment/i.test(c.title) ? 'dynamic' : null;
        if (!type) return;
        found.push({ type, name: c.value, negated: /not/i.test(c.operator || '') });
      });
      if (found.length) return found;
    }
    return null;
  }

  let lastCapturedKey = '';
  async function captureAudienceOnRecipients() {
    const ci = campaignInfo();
    if (!ci || ci.step !== 'recipients') return;
    const rule = readRecipientRule();
    if (!rule) return;
    const include = rule.find((r) => !r.negated);
    if (!include) return;
    const key = `${ci.id}:${include.type}:${include.name}`;
    if (key === lastCapturedKey) return;
    lastCapturedKey = key;
    const list = include.type === 'static' ? await staticSegmentList() : await dynamicSegmentList();
    const match = list.find((s) => s.name === include.name);
    if (!match) return;
    // Always record the campaign's own audience (silently). A manual override, if any, stays in
    // use until the user resets it, but Reset needs to know what the real audience is.
    setCampaignAudience(ci.id, { type: include.type, id: match.id, name: match.name });
  }

  async function audienceFromLink(link) {
    const m = String(link).match(/\/(dynamic|static)-segments\/(\d+)/);
    if (!m) throw new Error('Paste a /dynamic-segments/ID or /static-segments/ID link.');
    const type = m[1];
    const id = Number(m[2]);
    const list = type === 'static' ? await staticSegmentList() : await dynamicSegmentList();
    const match = list.find((s) => Number(s.id) === id);
    return { type, id, name: match ? match.name : `${type} segment ${id}`, source: 'manual' };
  }

  /* ---------------- users ---------------- */

  async function fetchSegmentContacts(aud) {
    const url = aud.type === 'static'
      ? `/contact/proxy/static-segment/${aud.id}/records`
      : '/contact/proxy/dynamic-segment/records';
    const body = (invalidateCache) => aud.type === 'static'
      ? { invalidateCache, advancedFilter: {}, searchFilter: [], id: String(aud.id) }
      : { invalidateCache, searchFilter: [], id: Number(aud.id) };

    let primed = false;
    for (let t = 0; t < CFG.pollTries; t++) {
      const { status, json } = await api(url, { method: 'POST', body: JSON.stringify(body(false)) });
      if (status !== 200) throw new Error(`Segment users request failed (HTTP ${status}).`);
      const contacts = json?.data?.contacts || [];
      const st = json?.meta?.status;
      if (contacts.length) return contacts;
      if (st === 'done' && !primed) {
        // Cache is empty: ask IO to build it once, then keep polling.
        await api(url, { method: 'POST', body: JSON.stringify(body(true)) });
        primed = true;
      } else if (st === 'done' && primed) {
        return [];
      }
      await sleep(CFG.pollDelayMs);
    }
    throw new Error('Timed out waiting for segment users.');
  }

  function getStoredUsers(cid, aud) {
    try { return JSON.parse(sessionStorage.getItem(SS_USERS(cid, aud)) || 'null'); } catch (e) { return null; }
  }

  async function pickRandomUsers(cid, aud) {
    const contacts = await fetchSegmentContacts(aud);
    const usable = contacts.filter((c) => c.insider_id);
    if (!usable.length) throw new Error('No users found in this segment.');
    const picked = shuffle(usable).slice(0, CFG.sampleSize).map((c) => ({
      insiderId: c.insider_id,
      label: maskEmail(c.email),
    }));
    sessionStorage.setItem(SS_USERS(cid, aud), JSON.stringify({ users: picked, pool: usable.length, at: Date.now() }));
    return { users: picked, pool: usable.length };
  }

  /* ---------------- rendering ---------------- */

  function currentTemplate() {
    const s = store();
    const g = s && s.getters;
    if (!g) throw new Error('Could not read the email editor state. Open the Design step and try again.');
    const html = g['EMAIL_LOCALIZATION_STORE/getTemplateHTML'];
    if (!html) throw new Error('No template HTML found in the editor.');
    return {
      html,
      subject: g['EMAIL_LOCALIZATION_STORE/getMailSubject']
        || (g['EMAIL_LOCALIZATION_STORE/getActiveVariation'] || {}).originalSubject || '',
      preHeader: g['EMAIL_LOCALIZATION_STORE/getMailPreHeaderText'] || '',
      isLiquid: !!g['EMAIL_LOCALIZATION_STORE/getIsLiquidSyntax'],
    };
  }

  async function renderForUser(tpl, user) {
    const body = {
      couponListId: 0,
      isLiquidSyntax: tpl.isLiquid,
      user: { identifierType: 'insider_id', identifierValue: user.insiderId },
      subject: b64enc(tpl.subject),
      preHeader: b64enc(tpl.preHeader),
      html: b64enc(tpl.html),
    };
    try {
      const { status, json } = await api('/newsletter/dynamic-content-preview/get-preview-content', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      if (status !== 200 || !json || json.type === 'error') {
        return { user, error: (json && json.message) || `HTTP ${status}` };
      }
      const html = b64dec(json.html);
      return {
        user,
        html,
        subject: b64dec(json.subject),
        preHeader: b64dec(json.preHeader),
        thumbnail: b64dec(json.thumbnail),
        bytes: new Blob([html]).size,
      };
    } catch (e) {
      return { user, error: e.message };
    }
  }

  function flagsFor(r) {
    const f = [];
    if (r.error) return [{ level: 'err', text: r.error }];
    if (!r.html && r.thumbnail) f.push({ level: 'warn', text: 'HTML empty, showing screenshot' });
    if (r.bytes / 1024 > CFG.gmailClipKB) f.push({ level: 'err', text: `Over ${CFG.gmailClipKB} KB (Gmail clips)` });
    else if (r.bytes / 1024 > CFG.gmailClipKB * 0.9) f.push({ level: 'warn', text: 'Close to Gmail clip limit' });
    if (/\{\{|\{%/.test(r.html || '')) f.push({ level: 'warn', text: 'Unrendered Liquid left in output' });
    return f;
  }

  /* ---------------- design comparison ---------------- */

  // Two proofs count as the same design when what the customer SEES is the same:
  // visible text, visible images and link destinations. Per-customer tracking is ignored:
  // query strings / fragments on links and images, and tracking pixels (tiny or hidden images,
  // or hosts that look like trackers). Raw HTML always differs because of tracking codes
  // such as srccode / promotion params and pixel URLs carrying the partner code.
  const TRACKER_HOST = /(^|\.)(pxl|pixel|trk|track|tracking|open|beacon|mon-trk)[.-]|mon-trk\.com|doubleclick|google-analytics/i;
  const stripUrl = (u) => String(u || '').trim().split('#')[0].split('?')[0];
  function isTrackingImg(img) {
    const w = parseInt(img.getAttribute('width') || '', 10);
    const h = parseInt(img.getAttribute('height') || '', 10);
    const st = (img.getAttribute('style') || '').replace(/\s/g, '').toLowerCase();
    if ((w && w <= 3) || (h && h <= 3)) return true;
    if (/display:none|visibility:hidden|width:[0-3]px|height:[0-3]px|max-height:0/.test(st)) return true;
    try { return TRACKER_HOST.test(new URL(img.getAttribute('src') || '', 'https://x.invalid').hostname); } catch (e) { return false; }
  }
  function designSignature(html) {
    if (!html) return '';
    const d = new DOMParser().parseFromString(html, 'text/html');
    d.querySelectorAll('script,style,title,meta,link').forEach((n) => n.remove());
    const text = (d.body ? d.body.textContent : '').replace(/\s+/g, ' ').trim();
    const imgs = [...d.images].filter((i) => !isTrackingImg(i)).map((i) => stripUrl(i.getAttribute('src')));
    const links = [...d.querySelectorAll('a[href]')].map((a) => stripUrl(a.getAttribute('href')));
    return JSON.stringify([text, imgs, links]);
  }

  /* ---------------- iframe sizing ---------------- */

  // Natural content size of a same-origin (sandboxed, no scripts) srcdoc iframe.
  function contentSize(ifr) {
    try {
      const d = ifr.contentDocument;
      if (!d || !d.body) return null;
      let bottom = 0;
      let right = 0;
      [...d.body.children].forEach((c) => {
        const r = c.getBoundingClientRect();
        bottom = Math.max(bottom, r.bottom);
        right = Math.max(right, r.right);
      });
      const h = Math.ceil(bottom || d.body.scrollHeight || 0);
      const w = Math.ceil(Math.max(right, d.body.scrollWidth || 0, d.documentElement.scrollWidth || 0));
      return { w, h };
    } catch (e) { return null; }
  }

  // Calls onSize whenever the email's size settles or changes (late images, fonts).
  function watchSize(ifr, onSize) {
    let last = '';
    let ro = null;
    const check = () => {
      const s = contentSize(ifr);
      if (!s || !s.h) return;
      const key = s.w + 'x' + s.h;
      if (key !== last) { last = key; onSize(s); }
    };
    ifr.addEventListener('load', () => {
      check();
      try {
        ro = new ResizeObserver(check);
        ro.observe(ifr.contentDocument.body);
        [...ifr.contentDocument.images].forEach((im) => im.addEventListener('load', check));
      } catch (e) { /* ignore */ }
    });
    // Safety net while images load.
    let n = 0;
    const t = setInterval(() => { check(); if (++n > 20 || !ifr.isConnected) clearInterval(t); }, 300);
  }

  /* ---------------- UI ---------------- */

  // Proofly logo shown under the ProofSet wordmark (official logo, tagline removed,
  // embedded as a data: URI so no network call is needed).
  const PROOFLY_LOGO_SRC = 'data:image/png;base64,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';
  const PROOFLY_LOGO = PROOFLY_LOGO_SRC
    ? `<span class="pf-logo"><img src="${PROOFLY_LOGO_SRC}" alt="Proofly"></span>`
    : '<span class="pf-logo" aria-label="Proofly"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="13" height="10" rx="1.5"></rect><rect x="16" y="8" width="6" height="12" rx="1.5"></rect><path d="M6 18h6"></path></svg>Proofly</span>';

  const CSS = `
  /* Theme follows the IO panel: primary #0a2ecc, subtle #dae1fb, text #2c3546 / #656f85, Figtree, 4px radius */
  #ps-cta{display:flex;align-items:center;margin-right:12px}
  /* Proofly re-inserts its CTA right before "Preview and Test Message"; keep it visually first
     so the footer reads: Proofly | ProofSet | Preview and Test Message | Save and Continue. */
  #ecp-cta{order:-1}
  #ps-btn{display:flex;align-items:center;gap:8px;height:40px;padding:8px 14px;box-sizing:border-box;border-radius:4px;border:1px solid #0a2ecc;background:#fff;color:#0a2ecc;font-family:Figtree,system-ui,-apple-system,sans-serif;font-size:15px;font-weight:400;cursor:pointer;white-space:nowrap;line-height:1}
  #ps-btn:hover{background:#eef1fd}
  #ps-btn svg{flex:none}
  #ps-overlay{position:fixed;inset:0;background:rgba(17,24,39,.55);z-index:2147483000;display:flex;justify-content:flex-end}
  #ps-drawer{width:min(100vw,96vw);height:100%;background:#fff;overflow:auto;padding:28px 36px;box-sizing:border-box;font-family:Figtree,system-ui,-apple-system,sans-serif;color:#2c3546}
  .ps-brand{display:flex;flex-direction:column;gap:2px}
  .ps-logo{margin:0;font-size:32px;line-height:1.05;font-weight:700;letter-spacing:-.5px;color:#0a2ecc}
  .ps-brand-sub{display:flex;align-items:center;gap:10px;padding-left:4px;white-space:nowrap}
  .ps-b,.ps-link{white-space:nowrap}
  .ps-vtag{font-size:8px;font-weight:600;letter-spacing:.8px;text-transform:uppercase;color:#656f85}
  .ps-by{font-size:12px;color:#656f85}
  .ps-by{display:inline-flex;align-items:center;gap:5px}
  .ps-by .pf-logo{display:inline-flex;align-items:center;gap:5px;color:#b54708;font-weight:700;font-size:16px}
  .ps-by .pf-logo img{height:16px;width:auto;display:block}
  .ps-top{display:flex;justify-content:space-between;align-items:flex-start;gap:16px}
  .ps-actions{display:flex;gap:14px;align-items:center}
  .ps-b{height:36px;padding:0 14px;border-radius:4px;border:1px solid #0a2ecc;background:#0a2ecc;color:#fff;font-family:inherit;font-size:14px;font-weight:400;cursor:pointer}
  .ps-b:hover:not(:disabled){background:#0823a3;border-color:#0823a3}
  .ps-b.sec{background:#dae1fb;border-color:#dae1fb;color:#0a2ecc}
  .ps-b.sec:hover:not(:disabled){background:#c9d3f9;border-color:#c9d3f9;color:#0823a3}
  .ps-b:disabled{opacity:.5;cursor:default}
  .ps-x{border:none;background:none;font-size:28px;cursor:pointer;color:#6b7280;line-height:1}
  .ps-bar{display:flex;justify-content:space-between;align-items:flex-end;gap:12px;margin:20px 0 14px;flex-wrap:wrap}
  .ps-meta{font-size:15px;color:#374151;min-width:0}
  .ps-meta .l2{font-size:12px;color:#6b7280;margin-top:4px}
  .ps-meta .l2 b{color:#111827}
  .ps-sort{display:flex;align-items:center;gap:6px;font-size:12px;color:#656f85;white-space:nowrap}
  .ps-sort[hidden]{display:none}
  .ps-seg{display:inline-flex;border:1px solid #b7c3f7;border-radius:4px;overflow:hidden}
  .ps-seg button{height:26px;padding:0 10px;border:0;background:#fff;color:#0a2ecc;font-family:inherit;font-size:12px;cursor:pointer}
  .ps-seg button + button{border-left:1px solid #b7c3f7}
  .ps-seg button:hover{background:#eef1fd}
  .ps-seg button.on{background:#0a2ecc;color:#fff}
  .ps-aud{display:flex;flex-wrap:wrap;gap:8px;margin:14px 0 4px;align-items:center;font-size:13px;color:#656f85;background:#f7f8fa;border:1px solid #e1e5ea;border-radius:4px;padding:10px 12px}
  .ps-aud[hidden]{display:none}
  .ps-aud input{flex:1 1 360px;max-width:560px;min-width:0;height:32px;border:1px solid #c9d0d9;border-radius:4px;padding:0 8px;font-family:inherit;color:#2c3546;background:#fff}
  .ps-aud input:focus{outline:none;border-color:#0a2ecc;box-shadow:0 0 0 2px #dae1fb}
  .ps-link{border:0;background:none;padding:0;color:#0a2ecc;font-family:inherit;font-size:13px;cursor:pointer}
  .ps-link:hover{text-decoration:underline}
  .ps-link[hidden]{display:none}
  .ps-meta .aud{font-weight:600;color:#2c3546}
  .ps-grid{padding-top:10px;display:grid;row-gap:28px;grid-template-columns:repeat(auto-fill,minmax(min(310px,100%),1fr));column-gap:18px}
  .ps-card{position:relative;border:1px solid #e5e7eb;border-radius:6px;overflow:visible;background:#fff;display:flex;flex-direction:column}
  .ps-card .ps-ver{position:absolute;top:0;right:12px;transform:translateY(-50%);z-index:1;line-height:0}
  .ps-card .ps-ver .ps-flag{display:inline-block;line-height:1.4;border:1px solid #fff;box-shadow:0 0 0 1px #c9d3f9}
  .ps-card .ps-frame{border-radius:0 0 6px 6px}
  .ps-ch{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid #e5e7eb;font-size:14px}
  .ps-ch .em{color:#0a2ecc;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .ps-chr{display:flex;align-items:center;gap:8px;flex:none}
  .ps-card{border-color:#e1e5ea!important}
  .ps-sub{padding:8px 12px;font-size:13px;border-bottom:1px solid #f3f4f6}
  .ps-flags{padding:8px 12px 0;display:flex;flex-wrap:wrap;gap:4px}
  .ps-flags:empty{display:none}
  .ps-sub{border-bottom:1px solid #e1e5ea!important}
  .ps-flag{font-size:11px;border-radius:10px;padding:2px 8px}
  .ps-flag.err{background:#fee2e2;color:#b91c1c}.ps-flag.warn{background:#fef3c7;color:#92400e}.ps-flag.info{background:#e0e7ff;color:#3730a3}.ps-flag.ver{background:#dae1fb;color:#0a2ecc;font-weight:600}
  .ps-ver:empty{display:none}
  .ps-busy{display:flex;flex-direction:column;align-items:center;gap:10px}
  .ps-stage{font-weight:600;color:#111827}.ps-fun{font-size:13px;color:#6b7280;font-style:italic}
  .ps-spin{width:28px;height:28px;border:3px solid #dae1fb;border-top-color:#0a2ecc;border-radius:50%;animation:ps-r .8s linear infinite}
  .ps-spin.sm{display:inline-block;width:12px;height:12px;border-width:2px;vertical-align:-1px;margin-right:6px}
  @keyframes ps-r{to{transform:rotate(360deg)}}
  .ps-aud input:disabled{background:#f9fafb}
  .ps-frame{position:relative;overflow:hidden;cursor:zoom-in;background:#fafafa}
  .ps-frame iframe{border:0;transform-origin:0 0;pointer-events:none;background:#fff;display:block}
  .ps-frame img{width:100%;display:block}
  .ps-load{padding:40px 12px;text-align:center;color:#6b7280;font-size:13px}
  .ps-empty{border:1px dashed #d1d5db;border-radius:8px;padding:48px;text-align:center;color:#4b5563}
  #ps-zoom{position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:2147483001;display:flex;justify-content:center;align-items:center;padding:24px;box-sizing:border-box}
  #ps-zoom .wrap{position:relative;background:#fff;border-radius:6px;max-width:100%;max-height:100%;overflow:auto;box-shadow:0 10px 40px rgba(0,0,0,.35)}
  #ps-zoom iframe{border:0;display:block;margin:0 auto;background:#fff}
  #ps-zoom .zx{position:fixed;top:10px;right:16px;border:none;background:rgba(255,255,255,.9);border-radius:50%;width:34px;height:34px;font-size:22px;line-height:1;cursor:pointer;color:#111827}
  @media (max-width:768px){
    #ps-drawer{width:100vw;padding:16px}
    .ps-logo{font-size:26px}
    .ps-by{font-size:12px}
    .ps-top{align-items:center;flex-wrap:wrap;row-gap:10px}
    .ps-actions{margin-left:auto}
    .ps-bar{margin-top:14px}
    .ps-b{height:34px;padding:0 10px;font-size:13px}
    .ps-aud{font-size:12px}
    .ps-aud input{flex:1 1 100%;max-width:none}
    .ps-meta{font-size:14px}
    .ps-bar{align-items:flex-start}
    .ps-empty{padding:28px 16px}
    #ps-zoom{padding:8px}
  }
  #ps-toast{position:fixed;left:24px;bottom:24px;background:#0a2ecc;color:#fff;padding:10px 14px;border-radius:6px;z-index:2147483002;font-size:13px}
  `;

  function injectCss() {
    if (document.getElementById('ps-css')) return;
    const s = document.createElement('style');
    s.id = 'ps-css';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  function toast(msg) {
    injectCss();
    document.getElementById('ps-toast')?.remove();
    const t = document.createElement('div');
    t.id = 'ps-toast';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 3500);
  }

  function injectButton() {
    const ci = campaignInfo();
    if (!ci || ci.step !== 'design') { document.getElementById('ps-cta')?.remove(); return; }
    if (document.getElementById('ps-cta')) return;
    const anchor = document.getElementById('preview-and-test-message-footer-button')
      || [...document.querySelectorAll('button')].find((b) => /Preview and Test Message/i.test(b.textContent || ''));
    if (!anchor) return;
    // The footer bar is a flex row of button wrappers. Insert our own wrapper as a sibling,
    // directly before the "Preview and Test Message" wrapper (so it sits after Proofly's CTA).
    // Climb to the wrapper that sits directly in the footer bar (the level where sibling
    // wrappers hold the other footer buttons, e.g. Proofly and "Save and Continue").
    let slot = anchor;
    const hasSiblingButtons = (el) => [...el.parentElement.children].some((c) => c !== el && c.id !== 'ps-cta' && c.querySelector('button'));
    while (slot.parentElement && slot.parentElement !== document.body && !hasSiblingButtons(slot)) slot = slot.parentElement;
    if (!slot.parentElement || slot.parentElement === document.body) return;
    injectCss();
    const wrap = document.createElement('div');
    wrap.id = 'ps-cta';
    const btn = document.createElement('button');
    btn.id = 'ps-btn';
    btn.type = 'button';
    btn.title = "Preview this email for 10 customers in this campaign's audience";
    btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"></rect><rect x="14" y="3" width="7" height="7" rx="1"></rect><rect x="3" y="14" width="7" height="7" rx="1"></rect><rect x="14" y="14" width="7" height="7" rx="1"></rect></svg><span>ProofSet</span>';
    btn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); openDrawer(); });
    wrap.appendChild(btn);
    slot.parentElement.insertBefore(wrap, slot);
  }

  function openDrawer() {
    const ci = campaignInfo();
    if (!ci) return;
    injectCss();
    document.getElementById('ps-overlay')?.remove();

    const ov = document.createElement('div');
    ov.id = 'ps-overlay';
    ov.innerHTML = `
      <div id="ps-drawer">
        <div class="ps-top">
          <div class="ps-brand">
            <h2 class="ps-logo">ProofSet</h2>
            <div class="ps-brand-sub"><span class="ps-vtag">v1.0.0</span><span class="ps-by">by ${PROOFLY_LOGO}</span></div>
          </div>
          <div class="ps-actions">
            <button class="ps-link" id="ps-aud-reset" hidden>Reset audience</button>
            <button class="ps-link" id="ps-aud-toggle" hidden>Change audience</button>
            <button class="ps-b" id="ps-refresh">Refresh Proofs</button>
            <button class="ps-x" id="ps-close" title="Close">&times;</button>
          </div>
        </div>
        <div class="ps-aud" id="ps-aud" hidden>
          <span id="ps-aud-label">Segment link:</span>
          <input id="ps-aud-link" placeholder="…/dynamic-segments/76 or …/static-segments/2">
          <button class="ps-b" id="ps-aud-set">Use segment</button>
          <button class="ps-link" id="ps-aud-cancel" hidden>Cancel</button>
        </div>
        <div class="ps-bar">
          <div class="ps-meta" id="ps-meta"></div>
          <div class="ps-sort" id="ps-sort" hidden>
            <span>Sort by design:</span>
            <span class="ps-seg"><button type="button" data-m="unique">Unique first</button><button type="button" data-m="similar">Similar together</button></span>
          </div>
        </div>
        <div id="ps-body"></div>
      </div>`;
    document.body.appendChild(ov);

    const $ = (id) => ov.querySelector('#' + id);
    const close = () => ov.remove();
    $('ps-close').onclick = close;
    ov.addEventListener('click', (e) => { if (e.target === ov) close(); });

    const state = { aud: getAudience(ci.id) };

    // The link field is only shown when no audience is known, or when the user asks to change it.
    const showAudEdit = (show) => {
      $('ps-aud').hidden = !show;
      $('ps-aud-cancel').hidden = !state.aud;
      $('ps-aud-label').textContent = state.aud ? 'Use a different segment:' : 'Segment link:';
      if (show) setTimeout(() => $('ps-aud-link').focus(), 0);
    };
    const paintAudience = () => {
      const t = $('ps-aud-toggle');
      t.hidden = !state.aud;
      if (state.aud) t.title = `Current: ${state.aud.name} (${state.aud.type} segment #${state.aud.id}${state.aud.source === 'manual' ? ', chosen manually' : ', from the campaign'})`;
      // Reset only makes sense when a different segment was chosen AND the campaign's own
      // audience is known. Hidden for campaigns with no audience or one we could not read.
      const camp = getCampaignAudience(ci.id);
      const r = $('ps-aud-reset');
      r.hidden = !(state.aud && state.aud.source === 'manual' && camp && !sameAud(camp, state.aud));
      if (!r.hidden) r.title = `Back to the campaign's audience: ${camp.name} (${camp.type} segment #${camp.id})`;
    };
    paintAudience();
    $('ps-aud-toggle').onclick = () => showAudEdit($('ps-aud').hidden);
    $('ps-aud-reset').onclick = () => run(async () => {
      clearOverrideAudience(ci.id);
      state.aud = getCampaignAudience(ci.id);
      paintAudience();
      showAudEdit(false);
      const stored = getStoredUsers(ci.id, state.aud);
      if (stored && stored.users && stored.users.length) await renderProofs(stored.users, stored.pool);
      else await pickAndRender();
    });
    $('ps-aud-cancel').onclick = () => { $('ps-aud-link').value = ''; showAudEdit(false); };

    /* Loading state with rotating messages, so the user always knows work is happening. */
    const FUN = [
      'Rounding up 10 lucky subscribers…',
      'Asking IO very politely to render each proof…',
      'Resolving Liquid, one drop at a time…',
      'Checking which bouquet each person gets…',
      'Polishing pixels and counting kilobytes…',
      'Bribing the render queue with coffee…',
      'Almost there, the proofs are putting on their shoes…',
    ];
    let funTimer = null;
    const stopLoading = () => { clearInterval(funTimer); funTimer = null; };
    const setBusy = (busy) => {
      ['ps-refresh', 'ps-aud-set', 'ps-aud-reset', 'ps-aud-toggle'].forEach((id) => { $(id).disabled = busy; });
      $('ps-aud-link').disabled = busy;
    };
    function showLoading(stage) {
      stopLoading();
      let i = Math.floor(Math.random() * FUN.length);
      $('ps-body').innerHTML = `<div class="ps-empty ps-busy"><div class="ps-spin"></div>
        <div class="ps-stage">${esc(stage)}</div><div class="ps-fun">${esc(FUN[i])}</div></div>`;
      funTimer = setInterval(() => {
        const el = ov.querySelector('.ps-fun');
        if (!el) return stopLoading();
        i = (i + 1) % FUN.length;
        el.textContent = FUN[i];
      }, 2200);
    }
    const setStage = (stage) => { const el = ov.querySelector('.ps-stage'); if (el) el.textContent = stage; };

    /* One flow for both "Use segment" and "Refresh Proofs": pick users, then render. */
    async function pickAndRender() {
      showLoading(`Gathering ${CFG.sampleSize} customers from "${state.aud.name}"…`);
      const picked = await pickRandomUsers(ci.id, state.aud);
      await renderProofs(picked.users, picked.pool);
    }

    async function run(task) {
      setBusy(true);
      try { await task(); } catch (e) {
        stopLoading();
        $('ps-meta').textContent = '';
        $('ps-body').innerHTML = `<div class="ps-empty">${esc(e.message)}</div>`;
      } finally { setBusy(false); }
    }

    $('ps-aud-set').onclick = () => run(async () => {
      const link = $('ps-aud-link').value.trim();
      if (!link) throw new Error('Paste a segment link first (…/dynamic-segments/76 or …/static-segments/2).');
      showLoading('Looking up the segment…');
      const chosen = await audienceFromLink(link);
      const camp = getCampaignAudience(ci.id);
      if (sameAud(chosen, camp)) { clearOverrideAudience(ci.id); state.aud = camp; } // picked the campaign's own segment
      else { setOverrideAudience(ci.id, chosen); state.aud = getOverrideAudience(ci.id); }
      paintAudience();
      $('ps-aud-link').value = '';
      showAudEdit(false);
      await pickAndRender(); // submitting a segment always starts rendering, no extra click
    });
    $('ps-aud-link').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('ps-aud-set').click(); });

    $('ps-refresh').onclick = () => run(async () => {
      if (!state.aud) { state.aud = getAudience(ci.id); paintAudience(); } // may have been saved since the drawer opened
      if (!state.aud) showAudEdit(true);
      if (!state.aud) throw new Error('Set the audience first: open the Recipients step once, or paste a segment link above.');
      await pickAndRender();
    });

    async function renderProofs(users, poolSize) {
      let tpl;
      try { tpl = currentTemplate(); } catch (e) { $('ps-body').innerHTML = `<div class="ps-empty">${esc(e.message)}</div>`; return; }

      stopLoading();
      $('ps-sort').hidden = true;
      let done = 0;
      const progress = () => {
        $('ps-meta').innerHTML = `<span class="ps-spin sm"></span> Rendering proofs: <b>${done} of ${users.length}</b> ready. ${esc(FUN[done % FUN.length])}`;
      };
      progress();
      const grid = document.createElement('div');
      grid.className = 'ps-grid';
      $('ps-body').innerHTML = '';
      $('ps-body').appendChild(grid);

      const cards = users.map((u) => {
        const c = document.createElement('div');
        c.className = 'ps-card';
        c.innerHTML = `<div class="ps-ch"><span class="em">${esc(u.label)}</span><span class="sz">…</span></div><span class="ps-ver"></span>
          <div class="ps-flags"></div>
          <div class="ps-sub"><b>Subject:</b> <span class="sj">…</span></div>
          <div class="ps-frame"><div class="ps-load">Rendering…</div></div>`;
        grid.appendChild(c);
        return c;
      });

      const results = await pool(users, CFG.concurrency, async (u, i) => {
        const r = await renderForUser(tpl, u);
        fillCard(cards[i], r);
        done++;
        progress();
        return r;
      });

      // Versions: customers who SEE the same email (ignoring tracking codes) share a letter.
      const sigs = results.map((r) => (r.html ? designSignature(r.html) : ''));
      const versionOf = {};
      const groupSize = {};
      let next = 0;
      sigs.forEach((sg) => {
        if (!sg) return;
        if (!(sg in versionOf)) versionOf[sg] = String.fromCharCode(65 + (next++ % 26));
        groupSize[sg] = (groupSize[sg] || 0) + 1;
      });
      results.forEach((r, i) => {
        paintFlags(cards[i], flagsFor(r));
        const sg = sigs[i];
        if (sg) {
          const n = groupSize[sg];
          cards[i].querySelector('.ps-ver').innerHTML =
            (n > 1
              ? `<span class="ps-flag ver" title="${n - 1} other customer(s) in this sample see the same email (text, images, link destinations; tracking codes ignored). Use 'Similar together' to group them.">Shared by ${n}</span>`
              : '<span class="ps-flag ver" title="No other customer in this sample sees this exact email (tracking codes ignored).">Unique</span>');
        }
      });

      // Sorting by design: unique designs first <-> similar designs grouped (largest group first).
      const items = cards.map((card, i) => ({
        card, i, sg: sigs[i], n: sigs[i] ? groupSize[sigs[i]] : 0, v: sigs[i] ? versionOf[sigs[i]] : '~',
      }));
      const sortBox = $('ps-sort');
      const segBtns = [...sortBox.querySelectorAll('button')];
      const applySort = (m) => {
        const ordered = items.slice().sort((a, b) => {
          if (!a.sg !== !b.sg) return a.sg ? -1 : 1; // failed proofs last
          if (m === 'unique') return a.n - b.n || a.v.localeCompare(b.v) || a.i - b.i;
          return b.n - a.n || a.v.localeCompare(b.v) || a.i - b.i;
        });
        ordered.forEach((it) => grid.appendChild(it.card));
      };
      let active = null; // null = original order
      const paintSeg = () => segBtns.forEach((b) => b.classList.toggle('on', b.dataset.m === active));
      segBtns.forEach((b) => {
        b.onclick = () => {
          // Clicking the active option switches to the other one, so repeated clicks alternate.
          active = b.dataset.m === active ? (active === 'unique' ? 'similar' : 'unique') : b.dataset.m;
          applySort(active);
          paintSeg();
        };
      });
      paintSeg();
      sortBox.hidden = !(next > 1);

      const ok = results.filter((r) => !r.error && r.bytes);
      const avg = ok.length ? ok.reduce((a, r) => a + r.bytes, 0) / ok.length : 0;
      const failed = results.length - ok.length;
      let versionNote = '';
      if (ok.length > 1 && next === 1) versionNote = ' · All customers in this sample see the same design: personalization is not changing anything for them.';
      else if (ok.length > 1) versionNote = ` · ${next} distinct design(s) across ${ok.length} customers.`;
      $('ps-meta').innerHTML = `<div class="l1">Here's a sample of what your customers in <span class="aud">${esc(state.aud.name)}</span> will receive.</div>`
        + `<div class="l2">Estimated Template Size: <b>${kb(avg)} KB</b>${esc(versionNote)}`
        + (failed ? ` · ${failed} proof(s) failed.` : '') + '</div>';
    }

    function fillCard(card, r) {
      card.querySelector('.sz').textContent = r.error ? 'error' : `${kb(r.bytes || 0)} KB`;
      card.querySelector('.sj').textContent = r.error ? '-' : (r.subject || '(empty)');
      const frame = card.querySelector('.ps-frame');
      frame.innerHTML = '';
      if (r.error) { frame.innerHTML = `<div class="ps-load">${esc(r.error)}</div>`; return; }
      if (!r.html && r.thumbnail) {
        const img = document.createElement('img');
        img.src = r.thumbnail;
        frame.appendChild(img);
        return;
      }
      const ifr = document.createElement('iframe');
      // No allow-scripts: email HTML cannot run JS. allow-same-origin lets us measure its size.
      ifr.setAttribute('sandbox', 'allow-same-origin');
      // Render at real desktop width, then scale down uniformly to the card width (no distortion).
      let natural = { w: 600, h: 1200 };
      const layout = () => {
        const scale = Math.min(1, (frame.clientWidth || 300) / natural.w);
        ifr.style.width = natural.w + 'px';
        ifr.style.height = natural.h + 'px';
        ifr.style.transform = `scale(${scale})`;
        frame.style.height = Math.min(natural.h * scale, CFG.cardMaxHeight) + 'px';
      };
      ifr.style.width = '600px';
      ifr.style.height = '1200px';
      frame.appendChild(ifr);
      watchSize(ifr, (s) => { natural = { w: Math.max(600, s.w), h: s.h }; layout(); });
      try { new ResizeObserver(layout).observe(frame); } catch (e) { /* ignore */ }
      ifr.srcdoc = r.html;
      layout();
      frame.onclick = () => zoom(r.html);
    }

    function paintFlags(card, flags) {
      const box = card.querySelector('.ps-flags');
      box.innerHTML = flags.map((f) => `<span class="ps-flag ${f.level}">${esc(f.text)}</span>`).join('');
    }

    function zoom(html) {
      const z = document.createElement('div');
      z.id = 'ps-zoom';
      z.innerHTML = '<button class="zx" title="Close">&times;</button><div class="wrap"><iframe sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"></iframe></div>';
      const wrap = z.querySelector('.wrap');
      const ifr = z.querySelector('iframe');
      const close = () => { z.remove(); document.removeEventListener('keydown', onKey); window.removeEventListener('resize', layout); };
      const onKey = (e) => { if (e.key === 'Escape') close(); };
      document.addEventListener('keydown', onKey);
      z.querySelector('.zx').onclick = close;
      z.addEventListener('click', (e) => { if (e.target === z) close(); });

      // The email keeps its real width (or the screen width on small screens, where its own
      // mobile styles apply). The iframe is as tall as the email, and the wrapper caps at the
      // viewport: long emails scroll inside the modal, short ones shrink to fit.
      const avail = () => Math.max(280, window.innerWidth - 48);
      let natural = { w: 600, h: 400 };
      const layout = () => {
        const w = Math.min(natural.w, avail() - 16);
        ifr.style.width = w + 'px';
        ifr.style.height = natural.h + 'px';
        wrap.style.width = w + 'px';
        // Add room for the wrapper's own scrollbar so the email is never clipped on the right.
        const sb = wrap.offsetWidth - wrap.clientWidth;
        if (sb > 0) wrap.style.width = (w + sb) + 'px';
      };
      layout();
      document.body.appendChild(z);
      watchSize(ifr, (s) => { natural = { w: Math.max(320, s.w), h: s.h }; layout(); });
      window.addEventListener('resize', layout);
      ifr.srcdoc = html;
    }

    function showStoredOrEmpty() {
      if (!state.aud) {
        $('ps-meta').textContent = '';
        $('ps-body').innerHTML = `<div class="ps-empty">ProofSet couldn't find this campaign's audience yet.<br><br>
          Paste a segment link above and press <b>Use segment</b> (or Enter), and the proofs start rendering right away.<br>
          Or open the <b>Recipients</b> step once, and ProofSet will pick up the campaign's segment by itself.</div>`;
        showAudEdit(true);
        return;
      }
      const stored = getStoredUsers(ci.id, state.aud);
      if (stored && stored.users && stored.users.length) {
        run(() => renderProofs(stored.users, stored.pool)); // same customers as earlier in this session
      } else {
        run(pickAndRender); // audience known: gather customers straight away, no extra click
      }
    }

    showStoredOrEmpty();
  }

  /* ---------------- boot ---------------- */

  const tick = () => {
    try { injectButton(); } catch (e) { /* ignore */ }
    captureAudienceOnRecipients().catch(() => {});
  };
  new MutationObserver(() => { clearTimeout(tick._t); tick._t = setTimeout(tick, 400); })
    .observe(document.documentElement, { childList: true, subtree: true });
  tick();
})();
