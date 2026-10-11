/**
 * Feliz Viaje Villa Insurgentes - Promociones (función de Vercel)
 *
 * GET /api/ofertas?region=europa
 * Pide a viaje.ly (catálogo de Mega Travel) la lista de ofertas de la región,
 * extrae los paquetes y los devuelve como JSON para que el portal los muestre
 * con su propio diseño. Sin dependencias externas.
 */

const AGENCIA_URL = 'https://viaje.ly/feliz-viaje-villa-insurgentes';
const OFERTAS_BASE = 'https://viaje.ly/ofertas/';
const SITIO_BASE = 'https://viaje.ly';
const REGIONES = ['europa', 'asia', 'centroamerica', 'sudamerica', 'cruceros'];
const MAX_PAQUETES = 24;
const CACHE_SEGUNDOS = 1800; // 30 minutos en la CDN de Vercel
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

/* ---------------- Mini analizador HTML (tolerante) ---------------- */
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const RAW = new Set(['script', 'style', 'noscript', 'template']);

function decode(t) {
  return t.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e) => {
    const map = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú', ntilde: 'ñ', Aacute: 'Á', Eacute: 'É', Iacute: 'Í', Oacute: 'Ó', Uacute: 'Ú', Ntilde: 'Ñ', uuml: 'ü' };
    if (e[0] === '#') { const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return isNaN(n) ? m : String.fromCodePoint(n); }
    return map[e] ?? m;
  });
}

export function parse(html) {
  const root = { tag: '#root', attrs: {}, children: [], parent: null };
  let cur = root;
  const re = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<![^>]*>|<\/\s*([a-zA-Z0-9-]+)\s*>|<([a-zA-Z][a-zA-Z0-9-]*)((?:\s+[^\s"'>\/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*)\s*(\/?)>|([^<]+|<)/g;
  let m;
  while ((m = re.exec(html))) {
    if (m[5] !== undefined) { cur.children.push({ text: decode(m[5]) }); continue; }
    if (m[1]) { // cierre
      const tag = m[1].toLowerCase();
      let n = cur;
      while (n && n.tag !== tag) n = n.parent;
      if (n && n.parent) cur = n.parent;
      continue;
    }
    if (m[2]) { // apertura
      const tag = m[2].toLowerCase();
      const attrs = {};
      const ra = /([^\s"'>\/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
      let a;
      while ((a = ra.exec(m[3] || ''))) attrs[a[1].toLowerCase()] = decode(a[2] ?? a[3] ?? a[4] ?? '');
      const el = { tag, attrs, children: [], parent: cur };
      cur.children.push(el);
      if (RAW.has(tag)) { // saltar contenido crudo
        const end = html.toLowerCase().indexOf('</' + tag, re.lastIndex);
        re.lastIndex = end === -1 ? html.length : end;
        continue;
      }
      if (!VOID.has(tag) && !m[4]) cur = el;
    }
  }
  return root;
}

function walk(n, fn) { fn(n); (n.children || []).forEach(c => c.tag && walk(c, fn)); }
function findAll(n, pred) { const out = []; walk(n, x => { if (x !== n && pred(x)) out.push(x); }); return out; }
function text(n) { return n.text !== undefined ? n.text : (n.children || []).map(text).join(' '); }
const limpiar = t => t.replace(/\s+/g, ' ').trim();

/* ---------------- Extracción ---------------- */
function absoluta(u) {
  u = (u || '').trim();
  if (!u || u.startsWith('data:')) return '';
  if (u.startsWith('//')) return 'https:' + u;
  if (/^https?:\/\//i.test(u)) return u;
  return SITIO_BASE + '/' + u.replace(/^\/+/, '');
}
const sinQuery = u => u.replace(/[?#].*$/, '');
const esPaquete = n => n.tag === 'a' && /\/viaje\//.test(n.attrs.href || '');

function urlsEn(n) { return new Set(findAll(n, esPaquete).map(a => sinQuery(absoluta(a.attrs.href)))); }

function imagenDe(n) {
  for (const img of findAll(n, x => x.tag === 'img')) {
    for (const k of ['data-src', 'data-lazy-src', 'data-original', 'src']) {
      const v = img.attrs[k];
      if (v && !v.startsWith('data:')) return absoluta(v);
    }
    const ss = img.attrs.srcset || img.attrs['data-srcset'];
    if (ss) return absoluta(ss.split(',')[0].trim().split(/\s+/)[0]);
  }
  for (const el of [n, ...findAll(n, x => x.attrs && x.attrs.style)]) {
    const mm = /url\(\s*['"]?([^'")]+)/i.exec((el.attrs && el.attrs.style) || '');
    if (mm) return absoluta(mm[1]);
  }
  return '';
}

export function extraer(html) {
  const root = parse(html);
  const porUrl = new Map();
  for (const a of findAll(root, esPaquete)) {
    const u = sinQuery(absoluta(a.attrs.href));
    if (!porUrl.has(u)) porUrl.set(u, []);
    porUrl.get(u).push(a);
  }
  const paquetes = [];
  for (const [url, enlaces] of porUrl) {
    let tarjeta = enlaces[0];
    while (tarjeta.parent && tarjeta.parent !== root && urlsEn(tarjeta.parent).size <= 1) tarjeta = tarjeta.parent;

    const txt = limpiar(text(tarjeta));
    let titulo = '';
    for (const h of findAll(tarjeta, x => /^h[1-5]$/.test(x.tag))) {
      const t = limpiar(text(h)); if (t.length > 3) { titulo = t; break; }
    }
    if (!titulo) for (const a of enlaces) { const t = limpiar(text(a)); if (t.length > titulo.length && t.length < 120) titulo = t; }
    if (!titulo || /^(ver|más|mas|detalles?|cotizar)\b/i.test(titulo)) {
      const slug = (url.split('/').pop() || '').replace(/\.html?$/, '').replace(/-\d+$/, '');
      titulo = slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    }

    const p = /\$?\s*(\d{1,3}(?:[,.]\d{3})*|\d+)\s*(USD|MXN|EUR)\b/i.exec(txt);
    const imp = /\+?\s*\$?\s*(\d{1,3}(?:[,.]\d{3})*|\d+)\s*(?:USD|MXN)?\s*(?:de\s*)?(?:IMP|impuestos)/i.exec(txt);
    const d = /(\d+)\s*d[ií]as/i.exec(txt);
    const nn = /(\d+)\s*noches/i.exec(txt);

    paquetes.push({
      titulo, url,
      imagen: imagenDe(tarjeta),
      precio: p ? p[1] : '', moneda: p ? p[2].toUpperCase() : '',
      impuestos: imp ? imp[1] : '',
      dias: d ? +d[1] : null, noches: nn ? +nn[1] : null,
    });
    if (paquetes.length >= MAX_PAQUETES) break;
  }
  return paquetes;
}

/* ---------------- Descarga ---------------- */
function cookiesDe(res) {
  const list = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : (res.headers.get('set-cookie') || '').split(/,(?=\s*[^;=\s]+=)/);
  return list.filter(Boolean).map(c => c.split(';')[0].trim()).join('; ');
}

async function obtener(region) {
  const ctl = AbortSignal.timeout ? AbortSignal.timeout(15000) : undefined;
  // 1) Entrar por la página de la agencia para asociar la sesión.
  let cookie = '';
  try {
    const r1 = await fetch(AGENCIA_URL, { headers: { 'User-Agent': UA, 'Accept-Language': 'es-MX,es;q=0.9' }, redirect: 'follow', signal: ctl });
    cookie = cookiesDe(r1);
    await r1.arrayBuffer();
  } catch { /* se intenta igual la región */ }
  // 2) Pedir la lista de la región, como lo hace el filtro.
  const r2 = await fetch(OFERTAS_BASE + region, {
    headers: {
      'User-Agent': UA, 'Accept-Language': 'es-MX,es;q=0.9',
      'X-Requested-With': 'XMLHttpRequest', Referer: AGENCIA_URL + '#ofertas',
      ...(cookie ? { Cookie: cookie } : {}),
    },
    redirect: 'follow', signal: ctl,
  });
  if (!r2.ok) throw new Error('HTTP ' + r2.status);
  return r2.text();
}

export default async function handler(req, res) {
  const region = String((req.query && req.query.region) || '').toLowerCase().trim();
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (!REGIONES.includes(region)) {
    res.status(400).send(JSON.stringify({ ok: false, error: 'Región no válida.' }));
    return;
  }
  try {
    const html = await obtener(region);
    const paquetes = extraer(html);
    res.setHeader('Cache-Control', paquetes.length
      ? `public, s-maxage=${CACHE_SEGUNDOS}, stale-while-revalidate=86400`
      : 'public, s-maxage=120');
    res.status(200).send(JSON.stringify({
      ok: true, region, actualizado: new Date().toISOString(),
      catalogo: AGENCIA_URL + '#ofertas', paquetes,
    }));
  } catch (e) {
    res.setHeader('Cache-Control', 'no-store');
    res.status(502).send(JSON.stringify({ ok: false, error: 'No se pudo consultar el catálogo.', detalle: String(e && e.message || e) }));
  }
}
