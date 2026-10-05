// Descarga los contratos de VALLECAUCANA DE AGUAS S.A. E.S.P. (NIT 900333452) desde SECOP II
// (datos.gov.co, dataset jbjy-vk9h) y genera datos-vallecaucana-de-aguas.js.
// Uso:  node actualizar-datos-vallecaucana-de-aguas.mjs
import { writeFileSync } from 'node:fs';

const BASE = 'https://www.datos.gov.co/resource/jbjy-vk9h.json';
const WHERE = "caseless_one_of(nombre_entidad,'VALLECAUCANA DE AGUAS S.A. E.S.P') OR nit_entidad IN ('900333452')";
const ORDER = 'fecha_de_firma DESC NULL LAST';
const PAGE = 1000;

const filas = [];
for (let off = 0; ; off += PAGE) {
  const q = new URLSearchParams({ $where: WHERE, $order: ORDER, $limit: PAGE, $offset: off });
  const res = await fetch(`${BASE}?${q}`);
  if (!res.ok) throw new Error(`HTTP ${res.status} en offset ${off}`);
  const lote = await res.json();
  filas.push(...lote);
  if (lote.length < PAGE) break;
}

// Ajustes de valor verificados a mano contra el expediente en SECOP (la API abierta puede ir
// rezagada respecto a modificaciones/adiciones). Se conserva el valor de la API en `valorApi`.
const AJUSTES_VERIFICADOS = {
  'CO1.PCCNTR.4166391': { valor: 45584659952, fecha: '2026-10-04', nota: 'Valor verificado en SECOP (2026-10-04).' }, // 2000.13.05.003-2022
};

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const fecha = (v) => (v ? String(v).slice(0, 10) : '');
const txt = (v) => (v == null ? '' : String(v).replace(/\s+/g, ' ').trim());

// Claves cortas; el objeto se conserva tal cual para que categorizar() lo analice en el navegador.
const datos = filas.map((r) => ({
  id: txt(r.id_contrato),
  ref: txt(r.referencia_del_contrato),
  proceso: txt(r.proceso_de_compra),
  estado: txt(r.estado_contrato),
  objeto: txt(r.objeto_del_contrato),
  descripcion: txt(r.descripcion_del_proceso),
  tipo: txt(r.tipo_de_contrato),
  modalidad: txt(r.modalidad_de_contratacion),
  justif: txt(r.justificacion_modalidad_de),
  unspsc: txt(r.codigo_de_categoria_principal),
  firma: fecha(r.fecha_de_firma),
  inicio: fecha(r.fecha_de_inicio_del_contrato),
  fin: fecha(r.fecha_de_fin_del_contrato),
  proveedor: txt(r.proveedor_adjudicado),
  tipodoc: txt(r.tipodocproveedor),
  doc: txt(r.documento_proveedor),
  pyme: txt(r.es_pyme).toLowerCase().startsWith('s'),
  valor: num(r.valor_del_contrato),
  pagado: num(r.valor_pagado),
  origen: txt(r.origen_de_los_recursos),
  destino: txt(r.destino_gasto),
  diasAdic: num(r.dias_adicionados),
  duracion: txt(r.duraci_n_del_contrato),
  supervisor: txt(r.nombre_supervisor),
  ordenador: txt(r.nombre_ordenador_del_gasto),
  url: r.urlproceso?.url || '',
  actualizado: fecha(r.ultima_actualizacion),
})).map((d) => {
  const aj = AJUSTES_VERIFICADOS[d.id];
  return aj ? { ...d, valorApi: d.valor, valor: aj.valor, ajuste: aj.nota } : d;
});

const meta = {
  entidad: 'VALLECAUCANA DE AGUAS S.A. E.S.P',
  nit: '900333452',
  fuente: 'SECOP II · datos.gov.co (jbjy-vk9h)',
  fuenteUrl: 'https://www.datos.gov.co/d/jbjy-vk9h',
  consulta: new Date().toISOString().slice(0, 10),
  filasApi: filas.length,
};

writeFileSync(
  new URL('./datos-vallecaucana-de-aguas.js', import.meta.url),
  `// Generado por actualizar-datos-vallecaucana-de-aguas.mjs — no editar a mano.\n` +
  `const DATOS_META = ${JSON.stringify(meta, null, 2)};\n` +
  `const DATOS = ${JSON.stringify(datos)};\n`,
);
console.log(`OK: ${datos.length} contratos → datos-vallecaucana-de-aguas.js`);
