# Eventos de solicitudes de acceso

La migración `202610270003_calc3d_request_audit.sql` conecta las solicitudes existentes con la bitácora privada de Calc3D. **No aprueba usuarios por sí misma**, no cambia los RPC ni reconstruye eventos históricos. La autorización sigue dependiendo de `calc3d_access_status()`.

## Qué ve el administrador

En `calc3d_list_audit_events()` (administrador admitido), filtrar por `target_type = "access_request"` y correlacionar `target_id` con el `id` de `calc3d_list_access_requests()`. El listado conserva el límite de 180 días, la paginación `(occurred_at, id)` y el mismo DTO de la bitácora.

| `action` | Cuándo se registra | `outcome` |
|---|---|---|
| `access_request.created` | Nueva fila pendiente, una sola vez por UID | `committed` |
| `access_request.approved` | Revisión pendiente → aprobada | `committed` |
| `access_request.rejected` | Revisión pendiente → rechazada | `committed` |

`actor_id` y `actor_email` provienen del UID Auth real y su correo confirmado y único en el servidor. Si no se puede comprobar esa identidad, ambos quedan nulos: **sistema/mantenimiento**, no el solicitante o administrador implícito. IP y país son `null`: mostrar «No disponible». No se guarda correo de la solicitud como objetivo ni el payload, contraseña, token, cabeceras o datos comerciales. Una aprobación puede producir además `membership.invited` o `identity.claimed` por los triggers ya existentes; no cuentan como eventos adicionales de solicitud.

## Límites operativos

El trigger participa de la **misma transacción** que `calc3d_request_access()` o `calc3d_review_access_request()`: un conflicto CAS `40001`, una identidad o vinculación inválida `23514`, u otra reversión no deja evento de transición ni una aprobación parcial. Un error SQL revertido no queda registrado como una acción confirmada. Invocaciones repetidas de solicitud pendiente no insertan otra fila ni evento; una revisión repetida falla por CAS. Los eventos anteriores a esta migración no se inventan. No se instala un trabajo de limpieza; la retención física de 180 días todavía requiere activar la tarea diaria autorizada por separado (véase `docs/activity-audit.md`). Tampoco se certifican intentos fallidos de Google, cada clic, ni IP/país sin fuente verificada.

Prueba local con PostgreSQL desechable, sin servidor vivo: `node --test tests/supabase-request-audit.test.mjs tests/supabase-access-requests.test.mjs tests/supabase-activity-audit.test.mjs`. No ejecutar esta migración ni configurar limpieza en un entorno compartido sin autorización del propietario.
