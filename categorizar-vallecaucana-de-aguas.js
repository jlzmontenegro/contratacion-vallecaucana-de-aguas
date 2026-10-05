/* ============================================================================
 * CATEGORIZACIÓN DE CONTRATOS — VALLECAUCANA DE AGUAS S.A. E.S.P.
 * Se ejecuta EN EL NAVEGADOR (no está precomputada). Puedes editar las reglas
 * desde el panel "Metodología de categorización" y pulsar "Aplicar reglas".
 *
 * Cómo funciona:
 *  1. Se normaliza el texto (minúsculas, sin acentos): objeto + descripción + justificación.
 *  2. La PRIMERA regla cuyo patrón coincida gana (por eso "Convenios" va de primera).
 *  3. Si ninguna coincide (p. ej. objeto "No definido"/"Sin Descripcion"), se usa el
 *     respaldo: justificación → tipo de contrato → segmento UNSPSC (2 primeros dígitos).
 *  4. Si nada coincide: "Otros / sin clasificar".
 *
 * Reglas de oro:
 *  - NUNCA uses palabras del nombre de la entidad ("vallecaucana", "aguas", "s.a.", "e.s.p")
 *    porque aparecen en cientos de objetos y dan falsos positivos. Usa frases específicas.
 *  - Evita palabras sueltas ambiguas: "legal" (representante legal), "medios" (por medio),
 *    "redes" (usa "redes de datos"), "aguas" (usa "aguas residuales").
 *  - Cada patrón se compara con un borde de palabra a la izquierda: "ptar" no casa con "departar".
 * ========================================================================== */

const OTROS = 'Otros / sin clasificar';

function normalizar(s) {
  return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// Cada regla: cat = nombre de la categoría; kw = frases (ya sin acentos, en minúscula).
const REGLAS = [
  // 1) CONVENIOS: de primera, son de alto valor y otras palabras se los roban.
  { cat: 'Convenios e interadministrativos',
    kw: ['aunar esfuerzos', 'convenio interadministrativo', 'convenios interadministrativos', 'convenio de cooperacion', 'convenio marco',
         'cooperacion y asistencia tecnica', 'vinculacion de este ultimo al pda', 'convenio de asociacion'] },

  { cat: 'Vigilancia y seguridad',
    kw: ['vigilancia y seguridad', 'seguridad privada', 'servicio de vigilancia', 'monitoreo de alarma', 'cctv'] },

  // Interventoría antes que Obras: su objeto repite "ejecutar el plan de obras públicas".
  { cat: 'Interventoría',
    kw: ['interventoria'] },

  { cat: 'Obras de acueducto, alcantarillado y saneamiento',
    kw: ['plan de obras publicas', 'obra civil', 'obras civiles', 'construccion del sistema', 'construccion de la red',
         'construccion red', 'construccion de obras', 'obras complementarias', 'optimizacion del sistema',
         'optimizacion de la linea', 'optimizacion del acueducto', 'rehabilitacion del', 'ampliacion del sistema',
         'precios unitarios'],
    tipo: ['obra'] },

  { cat: 'Estudios, diseños y consultoría técnica',
    kw: ['estudios y disenos', 'disenos de', 'diseno de los sistemas', 'diseno del', 'consultoria geotecnica', 'consultoria para', 'consultoria tecnica', 'formulacion de proyecto',
         'actualizacion del plan', 'plan maestro', 'estudio de prefactibilidad', 'estudio de factibilidad',
         'batimetria', 'modelacion hidraulica', 'catastro de redes', 'saneamiento y manejo de vertimientos'],
    tipo: ['consultoria'] },

  { cat: 'Residuos sólidos y aseo público',
    kw: ['residuos solidos', 'compactador', 'pgirs', 'servicio publico de aseo', 'relleno sanitario',
         'aprovechamiento de residuos', 'estacion de clasificacion', 'recoleccion de residuos'] },

  { cat: 'Suministro de equipos y sistemas para agua y saneamiento',
    kw: ['sistemas de tratamiento de agua potable', 'planta potabilizadora', 'tuberia', 'accesorios hidraulicos', 'hidrante',
         'macromedidor', 'micromedidor', 'electrobomba', 'bombas sumergibles', 'hipoclorador', 'sistema de cloracion',
         'insumos quimicos', 'sulfato de aluminio', 'hipoclorito', 'equipos de laboratorio', 'analisis de calidad del agua',
         'laboratorio de calidad'] },

  { cat: 'Vehículos, combustible y transporte',
    kw: ['combustible', 'parque automotor', 'vehiculo', 'transporte terrestre', 'transporte especial', 'peajes', 'peaje',
         'gasolina', 'lavado de vehiculo', 'soat', 'tecnomecanica', 'llantas', 'conductor', 'motocicleta', 'mensajeria',
         'servicio de taxi', 'pasajes aereos', 'tiquetes'] },

  { cat: 'Tecnología e información',
    kw: ['software', 'licencia', 'licenciamiento', 'soporte tecnico', 'plataforma', 'hosting', 'computador', 'equipos de computo',
         'servidor', 'ciberseguridad', 'firma digital', 'antivirus', 'siaf', 'sistemas de informacion', 'area de sistemas',
         'internet', 'telefonia', 'telecomunicaciones', 'nube', 'redes de datos', 'impresora', 'dron', 'gps', 'pagina web', 'sitio web', 'dominio',
         'sistema de gestion documental', 'ofimatica', 'sistema de informacion geografica', 'gestion tecnologica'] },

  { cat: 'Comunicaciones, gestión social y capacitación',
    kw: ['comunicacion social', 'comunicador', 'comunicaciones', 'audiovisual', 'periodis', 'diseno grafico', 'divulgacion', 'publicidad',
         'gestion social', 'componente social', 'participacion comunitaria', 'cultura del agua', 'educacion ambiental',
         'capacitacion', 'estrategia educativa', 'clubes defensores', 'congreso', 'seminario', 'foro ', 'taller', 'socializacion', 'pedagog', 'campana', 'evento', 'logistica', 'refrigerio', 'alimentacion'] },

  { cat: 'Operación y mantenimiento de infraestructura',
    kw: ['roceria', 'operacion y mantenimiento', 'operacion de los sistemas', 'operacion eficiente', 'mantenimiento preventivo',
         'mantenimiento correctivo', 'mantenimiento locativo', 'mantenimiento de las instalaciones', 'mantenimiento de planta',
         'mantenimiento de equipos', 'lavado de fachada', 'servicio de limpieza', 'servicios de limpieza', 'fumigacion', 'jardineria',
         'aire acondicionado', 'ascensor', 'adecuacion', 'reparacion de', 'servicio de aseo', 'servicios de aseo'] },

  { cat: 'Seguros, auditoría y servicios financieros',
    kw: ['seguro', 'poliza', 'corretaje', 'revisoria fiscal', 'auditoria externa', 'servicios bancarios', 'calificadora de riesgo', 'fiducia',
         'avaluo', 'comision de exito'] },

  { cat: 'Arrendamientos y servicios de oficina',
    kw: ['arrendamiento', 'arrendador', 'arrendatario', 'canon de', 'local para oficinas', 'inmueble', 'bodega', 'parqueadero',
         'propiedad horizontal', 'energia electrica', 'custodia de archivo', 'enajenar', 'enajenacion'] },

  { cat: 'Papelería, dotación y suministros de oficina',
    kw: ['papeleria', 'copias', 'plotter', 'impresiones', 'elementos de oficina', 'utiles', 'toner', 'cartucho', 'dotacion', 'uniforme', 'cafeteria', 'bienes de aseo',
         'bioseguridad', 'elementos de proteccion', 'extintor', 'botiquin', 'mobiliario', 'muebles', 'carnet', 'compra de',
         'suministro de bienes', 'impresos', 'fotocopi'] },

  { cat: 'Apoyo jurídico',
    kw: ['abogad', 'direccion juridica', 'judicante', 'defensa judicial', 'asesoria juridica', 'asesoria legal', 'contratacion estatal',
         'representacion legal', 'proceso administrativo', 'manuales de contratacion', 'procesos disciplinarios', 'control interno disciplinario'] },

  { cat: 'Apoyo financiero, contable y administrativo',
    kw: ['contador', 'contadora', 'direccion financiera', 'area financiera', 'tesoreria', 'financier', 'tributari',
         'nomina', 'talento humano', 'gestion documental', 'archivo', 'recepcionista', 'secretari', 'auxiliar administrativ',
         'apoyo administrativo', 'servicios generales', 'direccion administrativa', 'sistema integrado de gestion', 'control interno', 'calidad',
         'planeacion', 'rendicion de cuentas', 'sia observa'] },

  { cat: 'Apoyo técnico, asistencia a municipios y aseguramiento',
    kw: ['ingenier', 'asistencia tecnica', 'aseguramiento', 'acueductos rurales', 'supervision', 'topograf', 'arquitect', 'geolog',
         'hidrolog', 'direccion tecnica', 'diagnostico', 'planos', 'proyectos y obras', 'desarrollo institucional',
         'fortalecimiento institucional', 'plan departamental de agua', 'municipios', 'saneamiento basico',
         'apoyar y fortalecer el manejo empresarial', 'servicios publicos domiciliarios', 'potabilizacion', 'gestion del riesgo',
         'ambiental', 'sanitari', 'tecnico', 'hidraulic', 'encuesta'] },
];

// Respaldo 1: justificación de la modalidad (cuando el texto no basta).
const RESPALDO_JUSTIF = [
  { re: /interadministrativ/, cat: 'Convenios e interadministrativos' },
  { re: /servicios profesionales y apoyo a la gestion/, cat: 'Apoyo técnico, asistencia a municipios y aseguramiento' },
];

// Respaldo 2: tipo de contrato.
const RESPALDO_TIPO = {
  'obra': 'Obras de acueducto, alcantarillado y saneamiento',
  'interventoria': 'Interventoría',
  'consultoria': 'Estudios, diseños y consultoría técnica',
  'suministros': 'Papelería, dotación y suministros de oficina',
  'compraventa': 'Papelería, dotación y suministros de oficina',
  'arrendamiento de muebles': 'Arrendamientos y servicios de oficina',
  'venta muebles': 'Arrendamientos y servicios de oficina',
  'seguros': 'Seguros, auditoría y servicios financieros',
};

// Respaldo 3: segmento UNSPSC (2 primeros dígitos del código "V1.80111600" → "80").
const RESPALDO_UNSPSC = {
  '72': 'Obras de acueducto, alcantarillado y saneamiento', // construcción y mantenimiento
  '81': 'Estudios, diseños y consultoría técnica',          // servicios de ingeniería
  '80': 'Apoyo financiero, contable y administrativo',      // gestión, servicios profesionales y administrativos
  '78': 'Vehículos, combustible y transporte',
  '92': 'Vigilancia y seguridad',
  '43': 'Tecnología e información',
  '25': 'Vehículos, combustible y transporte',
  '15': 'Vehículos, combustible y transporte',
  '84': 'Seguros, auditoría y servicios financieros',
  '86': 'Comunicaciones, gestión social y capacitación',
  '82': 'Comunicaciones, gestión social y capacitación',
  '90': 'Comunicaciones, gestión social y capacitación',
  '77': 'Apoyo técnico, asistencia a municipios y aseguramiento', // servicios ambientales
  '83': 'Arrendamientos y servicios de oficina',                  // servicios públicos
  '76': 'Operación y mantenimiento de infraestructura',           // limpieza industrial
  '47': 'Papelería, dotación y suministros de oficina',
  '44': 'Papelería, dotación y suministros de oficina',
  '56': 'Papelería, dotación y suministros de oficina',
  '40': 'Suministro de equipos y sistemas para agua y saneamiento',
  '95': 'Arrendamientos y servicios de oficina',
};

const _reglasCompiladas = REGLAS.map((r) => ({
  ...r,
  re: new RegExp('(^|[^a-z0-9])(' + r.kw.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')'),
}));

/**
 * Devuelve { cat, via } de un contrato { objeto, descripcion, justif, tipo, unspsc }.
 * via: 'palabras' (objeto/descripción) | 'justificacion' (palabras en objeto+justif) |
 *      'respaldo-justif' | 'respaldo-tipo' | 'respaldo-unspsc' | 'ninguna'.
 */
function categorizarDetalle(c) {
  const texto = normalizar([c.objeto, c.descripcion].join(' | '));
  const textoConJustif = normalizar([c.objeto, c.descripcion, c.justif].join(' | '));
  const tipo = normalizar(c.tipo);
  const justif = normalizar(c.justif);

  // 1) Palabras clave sobre objeto + descripción (la primera regla que coincide gana).
  for (const r of _reglasCompiladas) {
    if (r.re.test(texto)) return { cat: r.cat, via: 'palabras' };
    if (r.tipo && r.tipo.includes(tipo)) return { cat: r.cat, via: 'respaldo-tipo' }; // Obra / Consultoría
  }
  // 2) Objeto genérico ('VER OBJETO', 'No definido'): se suma la justificación de la modalidad.
  for (const r of _reglasCompiladas) if (r.re.test(textoConJustif)) return { cat: r.cat, via: 'justificacion' };
  // 3) Respaldos: justificación → tipo de contrato → segmento UNSPSC.
  for (const j of RESPALDO_JUSTIF) if (j.re.test(justif)) return { cat: j.cat, via: 'respaldo-justif' };
  if (RESPALDO_TIPO[tipo]) return { cat: RESPALDO_TIPO[tipo], via: 'respaldo-tipo' };
  const seg = (c.unspsc || '').replace(/^V\d+\./, '').slice(0, 2);
  if (RESPALDO_UNSPSC[seg]) return { cat: RESPALDO_UNSPSC[seg], via: 'respaldo-unspsc' };
  return { cat: OTROS, via: 'ninguna' };
}
function categorizar(c) { return categorizarDetalle(c).cat; }

/**
 * Marca TRANSVERSAL (no excluyente con la categoría): ¿el contrato se relaciona con una PTAR
 * (Planta de Tratamiento de Aguas Residuales)? Incluye obras, estudios, interventorías,
 * operación y vigilancia de PTAR. NO incluye PTAP (agua potable) ni solo redes/EBAR.
 * Ojo: en contratos "paquete" (alcantarillado + PTAR) el valor es el del contrato completo.
 */
const PATRON_PTAR = new RegExp(
  '(^|[^a-z0-9])(ptar|ptard|ptars|' +
  'plantas? de tratamiento de aguas? residual|plantas? de tratamiento de aguas? servida|' +
  'sistemas? de tratamiento de aguas? residual|tratamiento de aguas? residual|' +
  'unidades? de tratamiento de aguas|depuracion de aguas|lagunas? de oxidacion|' +
  'sistemas? de tratamiento y disposicion de aguas)'
);
function esPTAR(c) {
  return PATRON_PTAR.test(normalizar([c.objeto, c.descripcion].join(' | ')));
}

if (typeof module !== 'undefined') module.exports = { categorizar, categorizarDetalle, esPTAR, normalizar, REGLAS, OTROS };
