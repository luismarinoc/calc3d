# Controles locales de PR y releases

**Activado y verificado.** El repositorio público [luismarinoc/calc3d](https://github.com/luismarinoc/calc3d) tiene `main` como rama predeterminada. La carga inicial autorizada publicó `48c5782feea01353a2a2ccfcff923ad065a839f3`; su [CI](https://github.com/luismarinoc/calc3d/actions/runs/39512874793) pasó y omitió la release. La protección se comprobó mediante lecturas independientes de GitHub. No se publicó ninguna release ni se probó todavía la publicación de una futura PR de versión.

## Ruta de versión

1. Sobre una rama del mismo repositorio, parte de `main` y ejecuta `npm version --no-git-tag-version patch` (o ajusta manualmente a una versión estable mayor `X.Y.Z`). Incluye juntos `package.json` y `package-lock.json`. No crees un tag local.
2. Abre una PR a `main` con título **exacto** `chore(release): vX.Y.Z`, donde `X.Y.Z` coincide con `package.json.version`. Espera los checks `Node tests` y `Browser tests`. `Node tests` requiere las herramientas de servidor PostgreSQL (`initdb` y `pg_ctl`): en Ubuntu se agregan desde `/usr/lib/postgresql/*/bin` al `GITHUB_PATH` antes de `npm test`; si no están instaladas, el job falla explícitamente. Se recomienda **squash merge** para que el SHA de merge sea el único commit revisado asociado a la PR.
3. Al hacer merge, el push a `main` corre de nuevo ambos checks. Solo si pasan, el job `Version release` verifica la versión anterior del commit `before`, la PR asociada y su `merge_commit_sha`, el tag y el release existentes; publica notas generadas para el SHA inmutable del push. Un cambio ordinario con versión estable igual se omite correctamente con `Version unchanged (X.Y.Z); no release` tras una sola lectura, sin publicar ni consultar PR/tags. La subida inicial tampoco publica; una PR de versión sin merge falla. Repetir el evento de una publicación idéntica no duplica el release. `node scripts/release.mjs --dry-run` evalúa las mismas lecturas y nunca crea releases; requiere contexto real de evento y acceso de lectura de `gh`.

Si falla `Browser tests`, el job sigue fallando y adjunta `browser-failure-<run_id>-<run_attempt>` en la sección **Artifacts** del run de GitHub Actions durante 7 días. Solo incluye `test-results/**/trace.zip` y `test-results/**/error-context.md` cuando existen; si no hay archivos, Actions muestra una advertencia, no oculta el fallo. Descarga el artifact del run fallido para investigar la traza y el contexto; no sustituye los checks ni demuestra por sí solo la causa del fallo.

No publica en npm ni despliega la aplicación. El paquete permanece `private: true`. `GITHUB_TOKEN` solo se proporciona al paso de release: los checks de PR usan permisos de lectura, y no hay `pull_request_target`. No uses secretos de producción para CI. Si una PR normal modifica `package.json.version`, el job rechaza la publicación y falla: reserva los cambios de versión para la PR convencional.

## Protecciones activas

Tras la autorización explícita de la carga inicial se aplicaron y verificaron estas reglas de `main`:

| Control | Valor propuesto |
| --- | --- |
| PR antes de integrar | Obligatoria, también para administradores |
| Checks obligatorios | `Node tests`, `Browser tests`, al día con la rama base (strict) |
| Revisiones externas obligatorias | 0 para mantenimiento individual: GitHub no permite aprobar la propia PR |
| Force push / eliminación | Deshabilitados |

La protección de rama vía API REST usa `required_status_checks: { strict: true, contexts: ["Node tests", "Browser tests"] }`, `required_pull_request_reviews: { required_approving_review_count: 0 }`, `enforce_admins: true`, `restrictions: null`, `allow_force_pushes: false` y `allow_deletions: false`; estos valores fueron leídos de GitHub tras la activación. El primer push fue **bootstrap**, no una PR de versión, y no generó release. No se intentó un push prohibido para probar el bloqueo. Los cambios posteriores, incluida esta actualización documental, deben seguir la ruta de PR; no se autoriza por ello un push directo, un merge ni una publicación manual.

## Fallos cerrados

Versiones inválidas o decrecientes; PR ausente/ambigua, de fork, otra base, sin merge o SHA distinto; errores API distintos de 404; y conflictos con tags o releases existentes detienen el job sin reemplazar un tag. Una anotación de tag se resuelve hasta su commit real. Para publicar tras una falla, investigar la causa y reintentar el job con el **mismo evento**: no crear tags manualmente para saltar los controles. La verificación local usa mocks, no constituye prueba de Actions ni de permisos/protección reales.

## Mediciones responsive con datos remotos

La prueba de campos alcanzables espera que `#result-content` tenga contenido antes de recorrer el formulario. En móvil, la tarjeta de resultados ocupa una fila encima de los campos: si el catálogo llega después del primer scroll, la tarjeta crece y desplaza el campo ya medido. La regresión retiene la respuesta del catálogo, reproduce esa expansión y vuelve a comprobar el campo sobre el layout listo. Se conservan todas las verificaciones de visibilidad, viewport y ausencia de desbordamiento; no se agregan pausas fijas, reintentos, skips ni cambios de timeouts.

El helper de configuración de impresoras también espera que la navegación de cuenta sea visible y que `main.inert` sea falso **antes** de salir del documento actual. La regresión retiene la primera respuesta de admisión: el helper debe permanecer en esa página hasta liberarla, completar la configuración y conservar vacías las listas de errores y solicitudes fallidas. Se reproducen y conservan los errores originales; no se filtran mensajes, cambian cabeceras CORS ni modifica la autenticación de producción.

## Conteos del catálogo incremental

Los conteos completos esperan la señal pública `#consultation-list[aria-busy="false"]` antes de comprobar exactamente 1171 filas (o 874 para la búsqueda de referencia). El mensaje de coincidencias no indica que haya terminado el pintado.

La regresión retiene los frames en 1120 filas / `aria-busy=true`, libera el productor y exige 1171 / `false`, conservando los datos simulados. Se mantiene el presupuesto total del caso y cada conteo estricto; no se cambian timeouts, límites de resultados, assertions ni código de producción.

## Navegación de compras y cabecera lista

La prueba de navegación espera la admisión del documento recién cargado (`.account-nav` visible y `main.inert=false`) antes de pulsar Compras. La comprobación anterior al nuevo `goto('/')` no alcanza: la cabecera cambia de geometría al mostrar la cuenta. El control causal reprodujo `pointerdown` en el enlace y `pointerup` en un título después de ese cambio; no hubo solicitud de navegación. El mismo enlace funciona con la cabecera lista.

Se conserva la URL exacta, el teclado, las etiquetas, los tamaños táctiles y la ausencia de desbordamiento. Antes de enumerar controles también se espera la carga de compras. La regresión retiene admisión en la carga nueva y exige ambos gestos sobre páginas listas, ida y vuelta correctas, cero errores y solicitudes fallidas y datos/contadores simulados intactos. No cambia autenticación, CSS, código de producción, timeouts ni reintentos.
