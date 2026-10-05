'use strict';
/* Dashboard de contratación — VALLECAUCANA DE AGUAS S.A. E.S.P.
 * Depende de: datos-vallecaucana-de-aguas.js (DATOS, DATOS_META) y
 *             categorizar-vallecaucana-de-aguas.js (categorizarDetalle, esPTAR, REGLAS, OTROS, normalizar). */

/* ---------- utilidades ---------- */
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtCOP = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
const fmtN = new Intl.NumberFormat('es-CO');
const fmtM = (v) => '$' + fmtN.format(Math.round(v / 1e6)) + ' M';          // millones de COP
const fmtMil = (v) => (v >= 1e9 ? (v / 1e9).toLocaleString('es-CO', { maximumFractionDigits: 1 }) + ' mil millones' : fmtN.format(Math.round(v / 1e6)) + ' millones');
const fmtFecha = (iso) => (iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4) : '—');
const pct = (a, b) => (b ? ((a / b) * 100).toLocaleString('es-CO', { maximumFractionDigits: 1 }) + '%' : '0%');
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : '');
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
const unicos = (arr) => new Set(arr).size;

const EXCLUIDOS = /^(borrador|cancelado)$/i;
const PALETA = ['var(--s1)', 'var(--s2)', 'var(--s3)', 'var(--s4)', 'var(--s5)', 'var(--s6)', 'var(--s7)', 'var(--s8)'];
const GRIS = 'var(--s-otros)';
const POR_PAG = 50;

/* ---------- motor de categorización (reemplazable desde el panel de metodología) ---------- */
const MOTOR = { detalle: categorizarDetalle, ptar: esPTAR, reglas: REGLAS, otros: OTROS };
let FUENTE_ORIGINAL = null;

/* ---------- datos ---------- */
let CONTRATOS = [];      // contratos válidos (sin Borrador/Cancelado)
let EXCLUIDOS_N = { borrador: 0, cancelado: 0 };
let ALERTAS = [];        // valores atípicos (sospecha de captura o verificados)
let Y0 = 2021, Y1 = 2026;
let COLORES = {};        // campo → Map(valor → color), estable ante filtros

function prepararDatos() {
  const crudos = DATOS;
  EXCLUIDOS_N = {
    borrador: crudos.filter((d) => /^borrador$/i.test(d.estado)).length,
    cancelado: crudos.filter((d) => /^cancelado$/i.test(d.estado)).length,
  };
  CONTRATOS = crudos.filter((d) => !EXCLUIDOS.test(d.estado)).map((d) => ({
    ...d,
    anio: d.firma ? +d.firma.slice(0, 4) : null,
    estadoN: cap(d.estado) || 'Sin estado',
    tipo: d.tipo || 'Sin tipo',
    modalidad: d.modalidad || 'Sin modalidad',
    alerta: null,
  }));
  for (const c of CONTRATOS) {                                // texto íntegro: el más largo entre objeto y descripción
    if ((c.descripcion || '').length > c.objeto.length) c.objeto = c.descripcion;
    c.recortado = c.objeto.length >= 499;                     // SECOP entrega el objeto cortado a 500 caracteres
  }
  const anios = CONTRATOS.map((c) => c.anio).filter(Boolean);
  Y0 = Math.min(...anios); Y1 = Math.max(...anios);
  detectarOutliers();
  clasificarTodo();
  construirColores();
}

function clasificarTodo() {
  for (const c of CONTRATOS) {
    const r = MOTOR.detalle(c);
    c.cat = r.cat; c.via = r.via;
    c.ptar = MOTOR.ptar(c);
    c._q = normalizar([c.objeto, c.proveedor, c.ref, c.doc, c.supervisor, c.cat, c.id].join(' | '));
  }
}

/* Outliers: se SEÑALAN, no se corrigen. */
function detectarOutliers() {
  ALERTAS = [];
  const total = CONTRATOS.reduce((s, c) => s + c.valor, 0);
  const porTipo = new Map();
  for (const c of CONTRATOS) { if (!porTipo.has(c.tipo)) porTipo.set(c.tipo, []); porTipo.get(c.tipo).push(c); }
  for (const [tipo, lista] of porTipo) {
    if (lista.length < 10) continue;                        // con pocos contratos la comparación no es fiable
    const ord = [...lista].sort((a, b) => b.valor - a.valor);
    if (ord[0].valor >= 1e9 && ord[0].valor > 3 * ord[1].valor) {
      const c = ord[0];
      c.alerta = c.ajuste ? {
        nivel: 'verificado',
        motivo: `Valor atípico VERIFICADO en SECOP: ${fmtCOP.format(c.valor)}. La API de datos abiertos reporta ${fmtCOP.format(c.valorApi)} (diferencia ${fmtCOP.format(c.valor - c.valorApi)}, probablemente una modificación aún no reflejada); el dashboard usa el valor verificado. No es un error de captura, pero es ${(c.valor / ord[1].valor).toLocaleString('es-CO', { maximumFractionDigits: 1 })}× el siguiente mayor contrato de tipo «${tipo}» y concentra ${pct(c.valor, total)} del valor total, por lo que domina los gráficos.`,
      } : {
        nivel: 'alta',
        motivo: `Valor ${(c.valor / ord[1].valor).toLocaleString('es-CO', { maximumFractionDigits: 1 })}× el siguiente mayor contrato de tipo «${tipo}» (${fmtCOP.format(ord[1].valor)}) y concentra ${pct(c.valor, total)} del valor total. Posible error de captura (p. ej. cifras de más); verificar en SECOP.`,
      };
      ALERTAS.push(c);
    }
  }
  for (const c of CONTRATOS) {
    if (!c.alerta && /prestaci[oó]n de servicios|decreto 092/i.test(c.tipo) && c.valor > 500e6 && !/aunar esfuerzos|convenio/i.test(c.objeto)) {
      c.alerta = { nivel: 'media', motivo: `Contrato de prestación de servicios/apoyo por ${fmtCOP.format(c.valor)}, muy por encima de lo habitual para ese tipo (mediana ≈ ${fmtCOP.format(mediana(CONTRATOS.filter((x) => x.tipo === c.tipo).map((x) => x.valor)))}). Revisar.` };
      ALERTAS.push(c);
    }
  }
}
function mediana(v) { const s = [...v].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }

/* Colores estables por entidad (no cambian al filtrar). */
function construirColores() {
  const mapa = (campo) => {
    const acum = new Map();
    for (const c of CONTRATOS) acum.set(c[campo], (acum.get(c[campo]) || 0) + c.valor);
    const orden = [...acum.entries()].sort((a, b) => b[1] - a[1]).map((e) => e[0]);
    return new Map(orden.map((k, i) => [k, i < PALETA.length ? PALETA[i] : GRIS]));
  };
  COLORES = { estadoN: mapa('estadoN'), modalidad: mapa('modalidad'), tipo: mapa('tipo') };
  const anios = [...new Set(CONTRATOS.map((c) => c.anio).filter(Boolean))].sort();
  COLORES.anio = new Map(anios.map((a, i) => [a, PALETA[i % PALETA.length]]));
}

/* ---------- estado y filtros ---------- */
let S = {};
const estadoInicial = () => ({
  q: '', yMin: Y0, yMax: Y1, cat: '', estado: '', tipo: '', modalidad: '',
  vMin: null, vMax: null, ptar: false, sinOut: false, metrica: 'valor',
  sort: { k: 'firma', dir: -1 }, pag: 1, imprimirTodo: false,
});

function pasa(c, omitir = []) {
  const o = (k) => omitir.includes(k);
  if (S.sinOut && c.alerta && ['alta', 'verificado'].includes(c.alerta.nivel)) return false;
  if (!o('ptar') && S.ptar && !c.ptar) return false;
  if (!o('cat') && S.cat && c.cat !== S.cat) return false;
  if (!o('estado') && S.estado && c.estadoN !== S.estado) return false;
  if (!o('tipo') && S.tipo && c.tipo !== S.tipo) return false;
  if (!o('modalidad') && S.modalidad && c.modalidad !== S.modalidad) return false;
  if (!o('anio')) {
    const completo = S.yMin === Y0 && S.yMax === Y1;
    if (c.anio == null) { if (!completo) return false; }
    else if (c.anio < S.yMin || c.anio > S.yMax) return false;
  }
  if (S.vMin != null && c.valor < S.vMin) return false;
  if (S.vMax != null && c.valor > S.vMax) return false;
  if (S.q) {
    const toks = normalizar(S.q).split(/\s+/).filter(Boolean);
    for (const t of toks) if (!c._q.includes(t)) return false;
  }
  return true;
}
const filtrar = (omitir = []) => CONTRATOS.filter((c) => pasa(c, omitir));
const medida = (c) => (S.metrica === 'valor' ? c.valor : 1);
const fmtMedida = (v) => (S.metrica === 'valor' ? fmtM(v) : fmtN.format(v));

/* ---------- tooltip ---------- */
const tip = $('#tip');
document.addEventListener('mouseover', (e) => {
  const t = e.target.closest('[data-tip]');
  if (!t) { tip.style.display = 'none'; return; }
  tip.innerHTML = esc(t.dataset.tip).replace(/^([^\n]*)/, '<b>$1</b>').replace(/\n/g, '<br>');
  tip.style.display = 'block';
});
document.addEventListener('mousemove', (e) => {
  if (tip.style.display !== 'block') return;
  const w = tip.offsetWidth, h = tip.offsetHeight;
  tip.style.left = Math.min(e.clientX + 14, innerWidth - w - 8) + 'px';
  tip.style.top = (e.clientY + 18 + h > innerHeight ? e.clientY - h - 12 : e.clientY + 18) + 'px';
});
document.addEventListener('mouseleave', () => { tip.style.display = 'none'; });

/* ---------- gráficos ---------- */
function agrupar(lista, keyFn) {
  const m = new Map();
  for (const c of lista) {
    const k = keyFn(c);
    if (!m.has(k)) m.set(k, { k, v: 0, n: 0, vP: 0, nP: 0, valor: 0 });
    const g = m.get(k), x = medida(c);
    g.v += x; g.n++; g.valor += c.valor;
    if (c.ptar) { g.vP += x; g.nP++; }
  }
  return [...m.values()];
}

function barras(el, items, { act, sel, etiqueta = (g) => g.k, max = null }) {
  const mx = max ?? Math.max(1, ...items.map((g) => g.v));
  if (!items.length) { el.innerHTML = '<div class="vacio">Sin datos con los filtros actuales.</div>'; return; }
  el.innerHTML = items.map((g) => {
    const wa = ((g.v - g.vP) / mx) * 100, wp = (g.vP / mx) * 100;
    const tipTxt = `${etiqueta(g)}\n${S.metrica === 'valor' ? 'Valor: ' + fmtCOP.format(g.v) : 'Contratos: ' + fmtN.format(g.v)}\nContratos: ${fmtN.format(g.n)}` +
      (g.nP ? `\nRelacionados con PTAR: ${S.metrica === 'valor' ? fmtCOP.format(g.vP) : g.nP} (${g.nP} contr.)` : '');
    const cls = 'barra' + (sel && sel === g.k ? ' sel' : '') + (sel && sel !== g.k ? ' dim' : '');
    return `<button type="button" class="${cls}" data-act="${act}" data-val="${esc(g.k)}" data-tip="${esc(tipTxt)}">
      <span class="nom">${esc(etiqueta(g))}</span>
      <span class="pista">${wa > 0 ? `<span class="seg-a" style="width:${wa}%"></span>` : ''}${wp > 0 ? `<span class="seg-p" style="width:${wp}%"></span>` : ''}</span>
      <span class="num"><b>${fmtMedida(g.v)}</b> · ${fmtN.format(g.n)}</span>
    </button>`;
  }).join('');
}

function dona(el, items, { act, sel, chico = false, centro = null, esSel = (k, sel) => k === sel }) {
  const total = items.reduce((s, g) => s + g.v, 0);
  if (!total) { el.innerHTML = '<div class="vacio">Sin datos con los filtros actuales.</div>'; return; }
  const R = 42, C = 2 * Math.PI * R;
  let acum = 0;
  const arcos = items.map((g) => {
    const len = (g.v / total) * C;
    const gap = items.length > 1 ? Math.min(2, len * 0.5) : 0;
    const arco = `<circle class="seg${sel && !esSel(g.k, sel) && !g.otros ? ' dim' : ''}" cx="60" cy="60" r="${R}" stroke="${g.color}" stroke-width="18"
      stroke-dasharray="${Math.max(len - gap, 0.01)} ${C - Math.max(len - gap, 0.01)}" stroke-dashoffset="${-acum}" transform="rotate(-90 60 60)"
      ${g.otros ? '' : `data-act="${act}" data-val="${esc(g.k)}"`} data-tip="${esc(g.label + '\nValor: ' + fmtCOP.format(g.valor) + '\nContratos: ' + fmtN.format(g.n) + '\n' + pct(g.v, total))}"/>`;
    acum += len;
    return arco;
  }).join('');
  const c1 = centro ?? (S.metrica === 'valor' ? fmtN.format(Math.round(total / 1e6)) + ' M' : fmtN.format(total));
  const c2 = S.metrica === 'valor' ? 'millones COP' : 'contratos';
  const leg = items.map((g) => `<button type="button" class="${sel && esSel(g.k, sel) ? 'sel' : ''}" ${g.otros ? 'disabled title="Agrupa categorías menores; usa el selector de filtros"' : `data-act="${act}" data-val="${esc(g.k)}"`}
      data-tip="${esc(g.label + '\nValor: ' + fmtCOP.format(g.valor) + '\nContratos: ' + fmtN.format(g.n) + '\n' + pct(g.v, total))}">
      <i style="background:${g.color}"></i><span>${esc(g.label)}</span><span class="n">${S.metrica === 'valor' ? pct(g.v, total) : fmtN.format(g.v)} · ${fmtN.format(g.n)}</span></button>`).join('');
  el.innerHTML = `<div class="donut-box ${chico ? 'chico' : ''}">
    <svg viewBox="0 0 120 120" role="img" aria-label="Gráfico de dona">${arcos}
      <text class="donut-centro v" x="60" y="59">${esc(c1)}</text><text class="donut-centro" x="60" y="72">${esc(c2)}</text></svg>
    <div class="dleg">${leg}</div></div>`;
}

function itemsDona(lista, campo, etiqueta = (k) => k) {
  let g = agrupar(lista, (c) => c[campo]).sort((a, b) => b.v - a.v);
  const items = g.slice(0, PALETA.length).map((x) => ({ ...x, label: etiqueta(x.k), color: COLORES[campo].get(x.k) || GRIS }));
  const resto = g.slice(PALETA.length);
  if (resto.length) {
    items.push({ k: '__otros', label: `Otros (${resto.length})`, v: resto.reduce((s, x) => s + x.v, 0), n: resto.reduce((s, x) => s + x.n, 0), valor: resto.reduce((s, x) => s + x.valor, 0), color: GRIS, otros: true });
  }
  return items;
}

function renderGraficos() {
  const m = S.metrica === 'valor' ? 'valor' : 'nº de contratos';
  $('#t-cat').textContent = m + ' por categoría';
  $('#t-prov').textContent = 'por ' + m;

  // Categorías (muestra todas las categorías aunque haya una seleccionada)
  const lc = filtrar(['cat']);
  barras($('#c-cat'), agrupar(lc, (c) => c.cat).sort((a, b) => b.v - a.v), { act: 'cat', sel: S.cat });

  // Años
  const la = filtrar(['anio']);
  const ga = agrupar(la, (c) => (c.anio == null ? 's/f' : c.anio)).sort((a, b) => String(a.k).localeCompare(String(b.k)));
  const items = ga.map((g) => ({ ...g, label: String(g.k), color: g.k === 's/f' ? GRIS : COLORES.anio.get(g.k) || GRIS }));
  const rangoCompleto = S.yMin === Y0 && S.yMax === Y1;
  dona($('#c-anio'), items, {
    act: 'anio', sel: rangoCompleto ? '' : 'rango',
    esSel: (k) => k !== 's/f' && k >= S.yMin && k <= S.yMax,
  });
  $('#c-anio-pil').innerHTML = ga.map((g) => `<button type="button" class="pildora${!rangoCompleto && g.k !== 's/f' && g.k >= S.yMin && g.k <= S.yMax ? ' sel' : ''}" ${g.k === 's/f' ? 'disabled' : `data-act="anio" data-val="${g.k}"`}>${g.k}: ${fmtN.format(g.n)} contr.</button>`).join('');

  // Proveedores
  const lp = filtrar();
  const gp = agrupar(lp, (c) => c.proveedor || '(sin proveedor)').sort((a, b) => b.v - a.v).slice(0, 12);
  barras($('#c-prov'), gp, { act: 'prov', sel: '', etiqueta: (g) => g.k });

  // Estado / Modalidad / Tipo
  dona($('#c-estado'), itemsDona(filtrar(['estado']), 'estadoN'), { act: 'estado', sel: S.estado, chico: true });
  dona($('#c-modalidad'), itemsDona(filtrar(['modalidad']), 'modalidad'), { act: 'modalidad', sel: S.modalidad, chico: true });
  dona($('#c-tipo'), itemsDona(filtrar(['tipo']), 'tipo'), { act: 'tipo', sel: S.tipo, chico: true });
}

/* ---------- KPIs, PTAR, cabecera, alertas ---------- */
function kpi(lbl, val, sub, sm = false) {
  return `<div class="kpi"><div class="lbl">${lbl}</div><div class="val${sm ? ' sm' : ''}">${val}</div><div class="sub">${sub || '&nbsp;'}</div></div>`;
}
function renderKPIs(f) {
  const total = f.reduce((s, c) => s + c.valor, 0);
  const prov = unicos(f.map((c) => c.doc || c.proveedor));
  const ejec = f.filter((c) => /ejecuci/i.test(c.estadoN));
  const pyme = f.filter((c) => c.pyme);
  $('#kpis').innerHTML =
    kpi('Contratos', fmtN.format(f.length), `de ${fmtN.format(CONTRATOS.length)} válidos`) +
    kpi('Valor total contratado', fmtCOP.format(total), '≈ ' + fmtMil(total) + ' COP', true) +
    kpi('Valor promedio', fmtCOP.format(f.length ? total / f.length : 0), 'mediana ' + fmtCOP.format(mediana(f.map((c) => c.valor)) || 0), true) +
    kpi('Proveedores únicos', fmtN.format(prov), 'por documento') +
    kpi('En ejecución', fmtN.format(ejec.length), fmtMil(ejec.reduce((s, c) => s + c.valor, 0)) + ' COP') +
    kpi('Contratistas PYME', fmtN.format(unicos(pyme.map((c) => c.doc || c.proveedor))), fmtN.format(pyme.length) + ' contratos');
}

function renderPTAR() {
  const base = filtrar(['ptar']);
  const P = base.filter((c) => c.ptar);
  const vT = base.reduce((s, c) => s + c.valor, 0), vP = P.reduce((s, c) => s + c.valor, 0);
  const porCat = agrupar(P, (c) => c.cat).sort((a, b) => b.valor - a.valor);
  $('#ptar-panel').innerHTML = `
    <div><h2>Contratación PTAR <small style="font-weight:400;color:var(--ink-3)">plantas de tratamiento de aguas residuales</small></h2>
      <p>Contratos cuyo objeto menciona PTAR o sistemas/plantas de tratamiento de aguas residuales (obras, estudios y diseños, interventoría, operación, vigilancia). No incluye PTAP (agua potable).</p></div>
    <div class="stats">
      <div class="stat"><b>${fmtN.format(P.length)}</b><span>contratos (${pct(P.length, base.length)} de ${fmtN.format(base.length)})</span></div>
      <div class="stat"><b>${fmtCOP.format(vP)}</b><span>${pct(vP, vT)} del valor · contrato completo*</span></div>
      <div class="stat"><b>${fmtN.format(unicos(P.map((c) => c.doc || c.proveedor)))}</b><span>proveedores</span></div>
      <div class="stat"><b>${fmtN.format(P.filter((c) => /ejecuci/i.test(c.estadoN)).length)}</b><span>en ejecución</span></div>
    </div>
    <button type="button" class="btn-ptar noprint" id="b-ptar" aria-pressed="${S.ptar}">${S.ptar ? '✕ Quitar filtro PTAR' : 'Ver solo PTAR'}</button>
    <div class="tipos">${porCat.map((g) => `<span class="chip-mini" data-tip="${esc(g.k + '\n' + fmtCOP.format(g.valor))}">${esc(g.k)}: ${fmtM(g.valor)} (${g.n})</span>`).join('')}</div>
    <div class="nota" style="grid-column:1/-1">* En contratos «paquete» (p. ej. alcantarillado + PTAR) el valor es el del contrato completo; no es posible aislar el componente PTAR con los datos de SECOP.</div>`;
}

function renderCabecera() {
  const fechas = CONTRATOS.map((c) => c.firma).filter(Boolean).sort();
  $('#h-entidad').textContent = 'Contratación · ' + DATOS_META.entidad;
  $('#h-meta').innerHTML = `
    <span>NIT <b>${esc(DATOS_META.nit)}</b></span>
    <span>Fuente: <a href="${esc(DATOS_META.fuenteUrl)}" target="_blank" rel="noopener noreferrer">${esc(DATOS_META.fuente)}</a></span>
    <span><b>${fmtN.format(CONTRATOS.length)}</b> contratos</span>
    <span>Firma: <b>${fmtFecha(fechas[0])}</b> a <b>${fmtFecha(fechas[fechas.length - 1])}</b></span>
    <span>Consulta: ${fmtFecha(DATOS_META.consulta)}</span>`;
  $('#pie').innerHTML = `Fuente: ${esc(DATOS_META.fuente)}, consultada el ${fmtFecha(DATOS_META.consulta)}. Se excluyen los contratos en estado Borrador (${EXCLUIDOS_N.borrador}) y Cancelado (${EXCLUIDOS_N.cancelado}). La métrica principal es el valor del contrato (<code>valor_del_contrato</code>); el valor pagado casi siempre es 0 en SECOP II y no se usa.`;
}

function renderAlertas() {
  const el = $('#alertas');
  const cero = CONTRATOS.filter((c) => c.valor === 0);
  const ceroConv = cero.filter((c) => c.cat.startsWith('Convenios')).length;
  const sinFecha = CONTRATOS.filter((c) => c.anio == null).length;
  const genericos = CONTRATOS.filter((c) => /^(ver objeto|no definido|sin descripcion|)$/i.test(normalizar(c.objeto).trim())).length;
  const abierto = el.hasAttribute('open') || !el.dataset.init;
  el.dataset.init = '1';
  el.innerHTML = `<summary>⚠ Alertas de calidad de datos (${ALERTAS.length} contratos con valor atípico)</summary>
    <ul>
      ${ALERTAS.map((c) => `<li><b>${c.alerta.nivel === 'alta' ? 'Sospecha ALTA' : c.alerta.nivel === 'verificado' ? 'Atípico verificado' : 'Atípico'}:</b> ${esc(c.ref)} · ${esc(c.proveedor)} · <b>${fmtCOP.format(c.valor)}</b> (${esc(c.estadoN)}, ${c.anio ?? 's/f'}).<br>${esc(c.alerta.motivo)}
        <br><span class="nota" style="color:inherit">Objeto: ${esc(c.objeto)}</span>
        ${c.url ? ` <a href="${esc(c.url)}" target="_blank" rel="noopener noreferrer">Ver en SECOP 🔗</a>` : ''}</li>`).join('')}
      <li><b>No se corrige ningún dato sin confirmación.</b> La única excepción es el valor verificado en SECOP indicado arriba (ajuste documentado en <code>actualizar-datos-vallecaucana-de-aguas.mjs</code>). Las demás sospechas solo se señalan.</li>
      <li>${fmtN.format(cero.length)} contratos con valor $0 (${fmtN.format(ceroConv)} son convenios/interadministrativos, que se suscriben sin valor).</li>
      <li>${fmtN.format(sinFecha)} ${sinFecha === 1 ? 'contrato' : 'contratos'} sin fecha de firma (aún no firmados); se muestran con año «s/f» y solo cuentan cuando el rango de años está completo.</li>
      <li>${fmtN.format(genericos)} ${genericos === 1 ? 'contrato' : 'contratos'} con objeto genérico («No definido», «Sin descripción»): se clasifican con la justificación, el tipo y el segmento UNSPSC.</li>
    </ul>
    <label><input type="checkbox" id="f-sinout" ${S.sinOut ? 'checked' : ''}> Excluir de todos los cálculos el contrato atípico de mayor valor (solo visualización; no altera los datos)</label>`;
  if (abierto) el.setAttribute('open', '');
}

/* ---------- tabla ---------- */
const COLS = [
  { k: 'ref', t: 'Referencia' }, { k: 'cat', t: 'Categoría' }, { k: 'objeto', t: 'Objeto' }, { k: 'proveedor', t: 'Proveedor' },
  { k: 'valor', t: 'Valor', num: true }, { k: 'estadoN', t: 'Estado' }, { k: 'tipo', t: 'Tipo' }, { k: 'anio', t: 'Año', num: true },
  { k: 'firma', t: 'Firma' }, { k: 'url', t: 'SECOP', nosort: true },
];
function ordenar(lista) {
  const { k, dir } = S.sort;
  return [...lista].sort((a, b) => {
    const x = a[k], y = b[k];
    const vx = x == null || x === '', vy = y == null || y === '';
    if (vx !== vy) return vx ? 1 : -1;                       // vacíos siempre al final
    if (typeof x === 'number' && typeof y === 'number') return (x - y) * dir;
    return String(x).localeCompare(String(y), 'es', { numeric: true }) * dir;
  });
}
const claseEstado = (e) => (/ejecuci/i.test(e) ? 'e-ejecucion' : /modific/i.test(e) ? 'e-modificado' : /aprob/i.test(e) ? 'e-aprobado' : /suspend/i.test(e) ? 'e-suspendido' : /termin|cerrad/i.test(e) ? 'e-terminado' : '');

function renderTabla(f) {
  const ord = ordenar(f);
  const paginas = Math.max(1, Math.ceil(ord.length / POR_PAG));
  S.pag = Math.min(S.pag, paginas);
  const ini = (S.pag - 1) * POR_PAG;
  const filas = S.imprimirTodo ? ord : ord.slice(ini, ini + POR_PAG);
  $('#tabla thead').innerHTML = '<tr>' + COLS.map((c) => {
    const act = S.sort.k === c.k ? `<span class="flecha">${S.sort.dir > 0 ? '▲' : '▼'}</span>` : '';
    return `<th class="${c.num ? 'num' : ''}" ${c.nosort ? '' : `data-act="ordenar" data-val="${c.k}"`} aria-sort="${S.sort.k === c.k ? (S.sort.dir > 0 ? 'ascending' : 'descending') : 'none'}">${c.t} ${act}</th>`;
  }).join('') + '</tr>';
  $('#tabla tbody').innerHTML = filas.length ? filas.map((c) => `<tr>
    <td>${esc(c.ref)}</td>
    <td><span class="tag">${esc(c.cat)}</span>${c.ptar ? '<span class="badge-ptar" title="Relacionado con PTAR">PTAR</span>' : ''}</td>
    <td class="objeto"><div>${esc(c.objeto)}${c.recortado ? ' <span class="cortado" title="SECOP entrega este objeto cortado a 500 caracteres; el texto completo está en el enlace al proceso.">… (cortado por SECOP)</span>' : ''}</div></td>
    <td class="prov">${esc(c.proveedor)}<small>${esc(c.tipodoc)} ${esc(c.doc)}${c.pyme ? ' · <span class="pyme">PYME</span>' : ''}</small></td>
    <td class="num">${c.alerta ? `<span class="alerta-ico" title="${esc(c.alerta.motivo)}">⚠</span>` : ''}${fmtCOP.format(c.valor)}</td>
    <td><span class="est ${claseEstado(c.estadoN)}">${esc(c.estadoN)}</span></td>
    <td>${esc(c.tipo)}</td><td class="num">${c.anio ?? '—'}</td><td>${fmtFecha(c.firma)}</td>
    <td>${/^https?:\/\//.test(c.url) ? `<a href="${esc(c.url)}" target="_blank" rel="noopener noreferrer" title="Abrir en SECOP">🔗</a>` : ''}</td>
  </tr>`).join('') : `<tr><td colspan="${COLS.length}" class="vacio">Ningún contrato cumple los filtros.</td></tr>`;
  const a = f.length ? ini + 1 : 0, b = S.imprimirTodo ? f.length : Math.min(ini + POR_PAG, f.length);
  $('#t-tabla').textContent = `${fmtN.format(f.length)} ${f.length === 1 ? 'resultado' : 'resultados'}`;
  $('#pag').innerHTML = `<span>Mostrando ${fmtN.format(a)}–${fmtN.format(b)} de ${fmtN.format(f.length)}</span>
    <span class="btns"><button class="btn" data-act="pag" data-val="1" ${S.pag === 1 ? 'disabled' : ''}>«</button>
    <button class="btn" data-act="pag" data-val="${S.pag - 1}" ${S.pag === 1 ? 'disabled' : ''}>‹</button>
    <span>Página ${S.pag} de ${paginas}</span>
    <button class="btn" data-act="pag" data-val="${S.pag + 1}" ${S.pag === paginas ? 'disabled' : ''}>›</button>
    <button class="btn" data-act="pag" data-val="${paginas}" ${S.pag === paginas ? 'disabled' : ''}>»</button></span>`;
}

/* ---------- chips de filtros activos ---------- */
function renderChips() {
  const ch = [];
  if (S.q) ch.push(['q', `Texto: «${S.q}»`]);
  if (S.yMin !== Y0 || S.yMax !== Y1) ch.push(['anio', S.yMin === S.yMax ? `Año: ${S.yMin}` : `Años: ${S.yMin}–${S.yMax}`]);
  if (S.cat) ch.push(['cat', 'Categoría: ' + S.cat]);
  if (S.estado) ch.push(['estado', 'Estado: ' + S.estado]);
  if (S.tipo) ch.push(['tipo', 'Tipo: ' + S.tipo]);
  if (S.modalidad) ch.push(['modalidad', 'Modalidad: ' + S.modalidad]);
  if (S.vMin != null) ch.push(['vMin', 'Valor ≥ ' + fmtCOP.format(S.vMin)]);
  if (S.vMax != null) ch.push(['vMax', 'Valor ≤ ' + fmtCOP.format(S.vMax)]);
  if (S.ptar) ch.push(['ptar', 'Solo PTAR']);
  if (S.sinOut) ch.push(['sinOut', 'Sin el contrato atípico de mayor valor']);
  $('#chips').innerHTML = ch.length
    ? '<span class="t">Filtros activos:</span>' + ch.map(([k, t]) => `<span class="chip${k === 'ptar' ? ' ptar' : ''}">${esc(t)}<button type="button" data-act="quitar" data-val="${k}" aria-label="Quitar filtro">✕</button></span>`).join('')
    : '<span class="t">Sin filtros activos: se muestran todos los contratos válidos.</span>';
}

/* ---------- controles ---------- */
function llenarSelect(id, valores, etiqueta) {
  const el = $(id), actual = el.value;
  el.innerHTML = `<option value="">${etiqueta}</option>` + valores.map((v) => `<option value="${esc(v)}">${esc(v)}</option>`).join('');
  el.value = valores.includes(actual) ? actual : '';
}
function construirSelects() {
  const dist = (campo) => [...new Set(CONTRATOS.map((c) => c[campo]))].sort((a, b) => a.localeCompare(b, 'es'));
  llenarSelect('#f-cat', dist('cat'), 'Todas');
  llenarSelect('#f-estado', dist('estadoN'), 'Todos');
  llenarSelect('#f-tipo', dist('tipo'), 'Todos');
  llenarSelect('#f-modalidad', dist('modalidad'), 'Todas');
  if (S.cat && !dist('cat').includes(S.cat)) S.cat = '';
}
function sincronizarControles() {
  const libre = (id) => document.activeElement !== $(id);   // no pisar el campo que se está escribiendo
  if (libre('#f-q')) $('#f-q').value = S.q;
  $('#f-cat').value = S.cat; $('#f-estado').value = S.estado; $('#f-tipo').value = S.tipo; $('#f-modalidad').value = S.modalidad;
  $('#f-ymin').value = S.yMin; $('#f-ymax').value = S.yMax;
  const span = Math.max(1, Y1 - Y0);
  $('#f-relleno').style.left = ((S.yMin - Y0) / span) * 100 + '%';
  $('#f-relleno').style.width = ((S.yMax - S.yMin) / span) * 100 + '%';
  $('#f-anios-et').textContent = S.yMin === S.yMax ? String(S.yMin) : `${S.yMin} – ${S.yMax}`;
  if (libre('#f-vmin')) $('#f-vmin').value = S.vMin != null ? fmtN.format(S.vMin) : '';
  if (libre('#f-vmax')) $('#f-vmax').value = S.vMax != null ? fmtN.format(S.vMax) : '';
  $('#f-ptar').checked = S.ptar;
  const sinout = $('#f-sinout'); if (sinout) sinout.checked = S.sinOut;
  $('#m-valor').setAttribute('aria-pressed', S.metrica === 'valor');
  $('#m-n').setAttribute('aria-pressed', S.metrica === 'n');
}

function render() {
  const f = filtrar();
  sincronizarControles();
  renderPTAR();
  renderKPIs(f);
  renderChips();
  renderGraficos();
  renderTabla(f);
  renderMetodoTabla(f);
}

function quitarFiltro(k) {
  const d = estadoInicial();
  if (k === 'anio') { S.yMin = Y0; S.yMax = Y1; }
  else if (k === 'q') S.q = '';
  else S[k] = d[k];
  S.pag = 1; render();
}
const toggle = (campo, val) => { S[campo] = S[campo] === val ? '' : val; S.pag = 1; render(); };

document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-act]');
  if (!t || t.disabled) return;
  const v = t.dataset.val;
  switch (t.dataset.act) {
    case 'cat': toggle('cat', v); break;
    case 'estado': toggle('estado', v); break;
    case 'tipo': toggle('tipo', v); break;
    case 'modalidad': toggle('modalidad', v); break;
    case 'anio': {
      const y = +v;
      if (S.yMin === y && S.yMax === y) { S.yMin = Y0; S.yMax = Y1; } else { S.yMin = S.yMax = y; }
      S.pag = 1; render(); break;
    }
    case 'prov': S.q = S.q === v ? '' : v; S.pag = 1; render(); break;
    case 'ordenar': S.sort = { k: v, dir: S.sort.k === v ? -S.sort.dir : (v === 'valor' || v === 'firma' || v === 'anio' ? -1 : 1) }; S.pag = 1; render(); break;
    case 'pag': S.pag = +v; renderTabla(filtrar()); $('#tabla').scrollIntoView({ block: 'start', behavior: 'smooth' }); break;
    case 'quitar': quitarFiltro(v); break;
  }
});
document.addEventListener('change', (e) => {
  const id = e.target.id;
  if (id === 'f-cat') { S.cat = e.target.value; }
  else if (id === 'f-estado') { S.estado = e.target.value; }
  else if (id === 'f-tipo') { S.tipo = e.target.value; }
  else if (id === 'f-modalidad') { S.modalidad = e.target.value; }
  else if (id === 'f-ptar') { S.ptar = e.target.checked; }
  else if (id === 'f-sinout') { S.sinOut = e.target.checked; }
  else return;
  S.pag = 1; render();
});
document.addEventListener('click', (e) => { if (e.target.id === 'b-ptar') { S.ptar = !S.ptar; S.pag = 1; render(); } });

$('#f-q').addEventListener('input', debounce((e) => { S.q = e.target.value.trim(); S.pag = 1; render(); }, 250));
const numero = (s) => { const d = String(s).replace(/[^\d]/g, ''); return d ? Number(d) : null; };
for (const [id, campo] of [['#f-vmin', 'vMin'], ['#f-vmax', 'vMax']]) {
  $(id).addEventListener('input', debounce((e) => { S[campo] = numero(e.target.value); S.pag = 1; const f = document.activeElement; render(); if (f) f.focus(); }, 300));
  $(id).addEventListener('blur', (e) => { e.target.value = S[campo] != null ? fmtN.format(S[campo]) : ''; });
}
$('#f-ymin').addEventListener('input', (e) => { S.yMin = +e.target.value; if (S.yMin > S.yMax) S.yMax = S.yMin; S.pag = 1; render(); });
$('#f-ymax').addEventListener('input', (e) => { S.yMax = +e.target.value; if (S.yMax < S.yMin) S.yMin = S.yMax; S.pag = 1; render(); });
$('#m-valor').addEventListener('click', () => { S.metrica = 'valor'; render(); });
$('#m-n').addEventListener('click', () => { S.metrica = 'n'; render(); });
$('#b-limpiar').addEventListener('click', () => { const m = S.metrica; S = estadoInicial(); S.metrica = m; render(); });

/* ---------- exportar CSV (separador ; y BOM UTF-8 para Excel es-CO) ---------- */
function exportarCSV() {
  const f = ordenar(filtrar());
  const cols = [
    ['Referencia', (c) => c.ref], ['Id contrato', (c) => c.id], ['Categoría', (c) => c.cat], ['Relacionado con PTAR', (c) => (c.ptar ? 'Sí' : 'No')],
    ['Objeto', (c) => c.objeto], ['Proveedor', (c) => c.proveedor], ['Tipo documento', (c) => c.tipodoc], ['Documento proveedor', (c) => c.doc],
    ['PYME', (c) => (c.pyme ? 'Sí' : 'No')], ['Valor del contrato (COP)', (c) => c.valor], ['Estado', (c) => c.estadoN], ['Tipo de contrato', (c) => c.tipo],
    ['Modalidad', (c) => c.modalidad], ['Año', (c) => c.anio ?? ''], ['Fecha de firma', (c) => c.firma], ['Inicio', (c) => c.inicio], ['Fin', (c) => c.fin],
    ['Supervisor', (c) => c.supervisor], ['URL SECOP', (c) => c.url], ['Alerta de valor', (c) => (c.alerta ? c.alerta.motivo : '')],
  ];
  const cel = (v) => { const s = String(v ?? ''); return /[;"\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const csv = '﻿' + [cols.map((c) => cel(c[0])).join(';'), ...f.map((r) => cols.map((c) => cel(c[1](r))).join(';'))].join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: `contratos-vallecaucana-de-aguas-${new Date().toISOString().slice(0, 10)}.csv` });
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
$('#b-csv').addEventListener('click', exportarCSV);

/* ---------- exportar PDF (diálogo de impresión): muestra todas las filas y luego restaura ---------- */
function antesDeImprimir() { if (S.imprimirTodo) return; S.imprimirTodo = true; renderTabla(filtrar()); $('#metodo').open = true; }
function despuesDeImprimir() { if (!S.imprimirTodo) return; S.imprimirTodo = false; renderTabla(filtrar()); }
window.addEventListener('beforeprint', antesDeImprimir);
window.addEventListener('afterprint', despuesDeImprimir);
$('#b-pdf').addEventListener('click', () => { antesDeImprimir(); setTimeout(() => window.print(), 60); });

/* ---------- panel de metodología (reglas visibles y editables) ---------- */
function renderMetodoTabla(f) {
  const cuerpo = $('#metodo-cuerpo');
  if (!cuerpo.dataset.listo) return;
  const tb = $('#met-tabla'); if (!tb) return;
  const tot = f.reduce((s, c) => s + c.valor, 0);
  const g = new Map(); for (const c of f) { const x = g.get(c.cat) || { n: 0, v: 0 }; x.n++; x.v += c.valor; g.set(c.cat, x); }
  const orden = [...MOTOR.reglas.map((r) => r.cat), MOTOR.otros];
  const extra = [...g.keys()].filter((k) => !orden.includes(k));
  tb.innerHTML = [...orden, ...extra].map((cat, i) => {
    const r = MOTOR.reglas.find((x) => x.cat === cat); const x = g.get(cat) || { n: 0, v: 0 };
    return `<tr><td>${i + 1}</td><td>${esc(cat)}<span class="kw">${r ? esc(r.kw.join(', ') + (r.tipo ? ' · tipo: ' + r.tipo.join('/') : '')) : 'Respaldo: justificación → tipo → UNSPSC'}</span></td>
      <td class="num">${fmtN.format(x.n)}</td><td class="num">${fmtCOP.format(x.v)}</td><td class="num">${pct(x.v, tot)}</td></tr>`;
  }).join('');
  const vias = {}; for (const c of f) vias[c.via] = (vias[c.via] || 0) + 1;
  $('#met-cob').textContent = `Cobertura sobre los ${fmtN.format(f.length)} contratos filtrados: palabras clave ${fmtN.format(vias.palabras || 0)}, ` +
    `objeto + justificación ${fmtN.format(vias.justificacion || 0)}, respaldo por tipo ${fmtN.format(vias['respaldo-tipo'] || 0)}, ` +
    `respaldo por justificación ${fmtN.format(vias['respaldo-justif'] || 0)}, respaldo por UNSPSC ${fmtN.format(vias['respaldo-unspsc'] || 0)}, sin clasificar ${fmtN.format(vias.ninguna || 0)}.`;
}

function construirMetodo() {
  const cuerpo = $('#metodo-cuerpo');
  cuerpo.innerHTML = `
  <div class="metodo-grid">
    <div>
      <h2 style="font-size:13px;margin:10px 0 4px">Cómo se categoriza cada contrato</h2>
      <ol>
        <li>La función <code>categorizar()</code> corre <b>en tu navegador</b> (archivo <code>categorizar-vallecaucana-de-aguas.js</code>), no está precomputada.</li>
        <li>Texto normalizado (minúsculas, sin acentos): <b>objeto + descripción</b> (y la justificación de la modalidad cuando el objeto no basta).</li>
        <li><b>La primera regla que coincide gana.</b> Los convenios (aunar esfuerzos / interadministrativo) van de primera; Interventoría antes que Obras porque su objeto repite «ejecutar el plan de obras».</li>
        <li>Nunca se usan palabras del nombre de la entidad como palabras clave (falsos positivos). Se evitan palabras sueltas ambiguas (<i>legal</i>, <i>medios</i>, <i>redes</i>).</li>
        <li>Respaldo si el texto es genérico (≈2% de los objetos: «No definido», «Sin Descripcion»): justificación → tipo de contrato → segmento UNSPSC (2 primeros dígitos). Si nada coincide: «${esc(MOTOR.otros)}».</li>
        <li><b>PTAR</b> es una marca <u>transversal</u> (<code>esPTAR()</code>), no una categoría: un contrato puede ser «Obras» y a la vez PTAR. Así se ve cuánto de cada categoría corresponde a PTAR (segmento naranja).</li>
      </ol>
      <h2 style="font-size:13px;margin:12px 0 4px">Limpieza y métricas</h2>
      <ul>
        <li>Métrica principal: <code>valor_del_contrato</code>. <code>valor_pagado</code> es 0 en SECOP II y no se usa.</li>
        <li>Se excluyen los estados Borrador y Cancelado (inflan las cifras).</li>
        <li>Valores atípicos: se señalan en la sección de alertas, sin corregirlos.</li>
      </ul>
      <p class="nota" id="met-cob"></p>
    </div>
    <div class="src-box">
      <h2 style="font-size:13px;margin:10px 0 4px">Editar reglas (en vivo)</h2>
      <p class="nota">Modifica palabras clave o el orden, y pulsa «Aplicar reglas»: todo el dashboard se recalcula. Los cambios no se guardan; para dejarlos permanentes edita el archivo <code>.js</code> del repositorio.</p>
      <textarea id="src" class="src" spellcheck="false" aria-label="Código de categorizar()"></textarea>
      <div class="f-btns" style="margin-top:8px"><button class="btn primary" id="src-aplicar" type="button">Aplicar reglas</button><button class="btn" id="src-reset" type="button">Restablecer originales</button><span id="src-msg" class="nota"></span></div>
    </div>
  </div>
  <div class="tabla-wrap" style="margin-top:14px"><table>
    <thead><tr><th style="cursor:default">#</th><th style="cursor:default">Categoría (en orden de evaluación) y palabras clave</th><th class="num" style="cursor:default">Contratos</th><th class="num" style="cursor:default">Valor</th><th class="num" style="cursor:default">% valor</th></tr></thead>
    <tbody id="met-tabla"></tbody></table></div>`;
  cuerpo.dataset.listo = '1';
  const ta = $('#src');
  const url = [...document.scripts].map((s) => s.src).find((s) => s.includes('categorizar-vallecaucana-de-aguas'));
  fetch(url).then((r) => { if (!r.ok) throw new Error(r.status); return r.text(); })
    .then((t) => { FUENTE_ORIGINAL = t; ta.value = t; })
    .catch(() => { FUENTE_ORIGINAL = null; ta.value = '// No se pudo cargar el archivo fuente (¿abierto como file://?). Se muestra solo la función:\n' + categorizarDetalle.toString(); $('#src-aplicar').disabled = true; });
  $('#src-aplicar').addEventListener('click', () => aplicarReglas(ta.value));
  $('#src-reset').addEventListener('click', () => { if (FUENTE_ORIGINAL) { ta.value = FUENTE_ORIGINAL; aplicarReglas(FUENTE_ORIGINAL); } });
  renderMetodoTabla(filtrar());
}

function aplicarReglas(src) {
  const msg = $('#src-msg');
  try {
    const m = new Function(src + '\n;return { categorizarDetalle, esPTAR, REGLAS, OTROS };')();
    if (typeof m.categorizarDetalle !== 'function' || typeof m.esPTAR !== 'function' || !Array.isArray(m.REGLAS)) throw new Error('Faltan categorizarDetalle, esPTAR o REGLAS.');
    MOTOR.detalle = m.categorizarDetalle; MOTOR.ptar = m.esPTAR; MOTOR.reglas = m.REGLAS; MOTOR.otros = m.OTROS;
    clasificarTodo(); construirSelects(); renderAlertas(); render();
    msg.className = 'ok'; msg.textContent = '✓ Reglas aplicadas y todo recalculado.';
  } catch (err) {
    msg.className = 'err'; msg.textContent = 'Error: ' + err.message;
  }
}

/* ---------- arranque ---------- */
function iniciar() {
  prepararDatos();
  S = estadoInicial();
  for (const id of ['#f-ymin', '#f-ymax']) { $(id).min = Y0; $(id).max = Y1; $(id).step = 1; }
  construirSelects();
  renderCabecera();
  renderAlertas();
  construirMetodo();
  render();
}
iniciar();
