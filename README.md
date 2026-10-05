# Contratación — Vallecaucana de Aguas S.A. E.S.P.

Dashboard interactivo de la contratación de **Vallecaucana de Aguas S.A. E.S.P.** (NIT 900333452) en SECOP II, con énfasis en la contratación relacionada con **plantas de tratamiento de aguas residuales (PTAR)**.

Fuente: [datos.gov.co · SECOP II – Contratos (jbjy-vk9h)](https://www.datos.gov.co/d/jbjy-vk9h).

## Archivos

| Archivo | Qué es |
|---|---|
| `index.html` | Página del dashboard (GitHub Pages) |
| `datos-vallecaucana-de-aguas.js` | Datos descargados de la API (generado) |
| `categorizar-vallecaucana-de-aguas.js` | `categorizar()` y `esPTAR()`: reglas de palabras clave, visibles y editables; se ejecutan en el navegador |
| `app-vallecaucana-de-aguas.js` / `estilos-vallecaucana-de-aguas.css` | Lógica y estilos del dashboard |
| `actualizar-datos-vallecaucana-de-aguas.mjs` | Script para volver a consultar la API |

## Actualizar los datos

```bash
node actualizar-datos-vallecaucana-de-aguas.mjs
```

Requiere Node 18+. Regenera `datos-vallecaucana-de-aguas.js`.

## Criterios

- Métrica principal: `valor_del_contrato` (el valor pagado casi siempre es 0 en SECOP II).
- Se excluyen los estados **Borrador** y **Cancelado**.
- **PTAR** es una marca transversal (`esPTAR()`), no una categoría: un contrato puede ser «Obras» y PTAR a la vez. En contratos «paquete» (alcantarillado + PTAR) el valor es el del contrato completo.
- Los valores atípicos se **señalan** en el dashboard (sección de alertas) y no se corrigen sin confirmación. Único ajuste: el contrato `2000.13.05.003-2022` usa el valor verificado en SECOP ($45.584.659.952; la API reporta $45.534.873.888). Ver `AJUSTES_VERIFICADOS` en el script de actualización.
