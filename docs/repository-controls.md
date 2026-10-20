# Controles locales de PR y releases

**Preparado, no activado.** El repositorio público `luismarinoc/calc3d` todavía no tiene rama predeterminada ni código subido. Estos archivos no configuran las protecciones remotas por sí solos. No se autoriza publicar código, crear PR, modificar protecciones ni generar releases durante esta preparación.

## Ruta de versión (después de autorizar la activación)

1. Sobre una rama del mismo repositorio, parte de `main` y ejecuta `npm version --no-git-tag-version patch` (o ajusta manualmente a una versión estable mayor `X.Y.Z`). Incluye juntos `package.json` y `package-lock.json`. No crees un tag local.
2. Abre una PR a `main` con título **exacto** `chore(release): vX.Y.Z`, donde `X.Y.Z` coincide con `package.json.version`. Espera los checks `Node tests` y `Browser tests`. Se recomienda **squash merge** para que el SHA de merge sea el único commit revisado asociado a la PR.
3. Al hacer merge, el push a `main` corre de nuevo ambos checks. Solo si pasan, el job `Version release` verifica la versión anterior del commit `before`, la PR asociada y su `merge_commit_sha`, el tag y el release existentes; publica notas generadas para el SHA inmutable del push. Un cambio ordinario con versión estable igual se omite correctamente con `Version unchanged (X.Y.Z); no release` tras una sola lectura, sin publicar ni consultar PR/tags. La subida inicial tampoco publica; una PR de versión sin merge falla. Repetir el evento de una publicación idéntica no duplica el release. `node scripts/release.mjs --dry-run` evalúa las mismas lecturas y nunca crea releases; requiere contexto real de evento y acceso de lectura de `gh`.

No publica en npm ni despliega la aplicación. El paquete permanece `private: true`. `GITHUB_TOKEN` solo se proporciona al paso de release: los checks de PR usan permisos de lectura, y no hay `pull_request_target`. No uses secretos de producción para CI. Si una PR normal modifica `package.json.version`, el job rechaza la publicación y falla: reserva los cambios de versión para la PR convencional.

## Activación remota pendiente

Tras autorización explícita separada para subir código, crear `main` y configurar la protección, establece en la regla de `main`:

| Control | Valor propuesto |
| --- | --- |
| PR antes de integrar | Obligatoria; aplica también a administradores si se decide exigir la misma regla a todos |
| Checks obligatorios | `Node tests`, `Browser tests`, al día con la rama base (strict) |
| Revisiones externas obligatorias | 0 para mantenimiento individual: GitHub no permite aprobar la propia PR |
| Force push / eliminación | Deshabilitados |

La protección de rama vía API REST usa `required_status_checks: { strict: true, contexts: ["Node tests", "Browser tests"] }`, `required_pull_request_reviews: { required_approving_review_count: 0 }`, `enforce_admins` según política elegida, `restrictions: null`, `allow_force_pushes: false` y `allow_deletions: false`; confirmar los campos contra el estado real antes de mutar. La rama y los nombres de checks no existen todavía en remoto. El primer push es **bootstrap**, no una PR de versión y no genera release. Una vez activado, verificar checks remotos y protección con evidencia real antes de afirmar que el control está activo.

## Fallos cerrados

Versiones inválidas o decrecientes; PR ausente/ambigua, de fork, otra base, sin merge o SHA distinto; errores API distintos de 404; y conflictos con tags o releases existentes detienen el job sin reemplazar un tag. Una anotación de tag se resuelve hasta su commit real. Para publicar tras una falla, investigar la causa y reintentar el job con el **mismo evento**: no crear tags manualmente para saltar los controles. La verificación local usa mocks, no constituye prueba de Actions ni de permisos/protección reales.
