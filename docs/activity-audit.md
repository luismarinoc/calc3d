# Auditoría de actividad Calc3D

La bitácora registra decisiones de ingreso a la **aplicación** y cambios confirmados en Calc3D, sin guardar datos comerciales completos. Es una migración aditiva; no activa por sí sola una tarea de limpieza.

## Contrato para la integración

- Al evaluar la admisión, llamar `calc3d_record_access()` desde la sesión autenticada. Devuelve el mismo JSON de `calc3d_access_status()`: `{ "allowed": true, "role": "admin", "email": "admin@example.com" }`. La decisión `allowed`/`denied` se calcula en el servidor, no se recibe del navegador. El RPC no certifica un login exitoso en Google.
- Solo un administrador admitido puede llamar `calc3d_list_audit_events(before_time, before_id, limit_count)`. Primer lote: sin cursor y límite predeterminado 50; siguientes: pasar **ambos** `occurred_at` e `id` del último registro. Límite válido: 1–100. Orden descendente `(occurred_at, id)`.
- Cada fila expone `{ id, occurred_at, actor_id, actor_email, action, target_type, target_id, outcome, ip_address, country }`. Ejemplo: `{ "action": "quote.saved", "target_type": "quote", "target_id": "<uuid>", "outcome": "committed", "ip_address": null, "country": null }`. En pantalla, mostrar «No disponible» para IP y país. No deducir ni solicitar esos valores desde el navegador.
- `actor_id` y `actor_email` nulos significan **sistema/mantenimiento**, nunca un usuario implícito. Las transiciones de membresía sin UID vinculado tienen `target_id` nulo; no usar el correo como identificador del objetivo. Para T3, agregar los eventos de transición de solicitudes en su migración propia; este esquema no depende de la tabla de solicitudes.

| Acciones | Disparador |
|---|---|
| `access.decision` (`allowed` / `denied`) | evaluación de admisión explícita |
| `quote.saved`, `purchase.saved`, `printers.saved` | inserción o actualización confirmada de la tabla respectiva |
| `profile.created`, `profile.updated`, `profile.archived` | perfil de bobina |
| `brand.created`, `brand.updated`, `brand.archived` | marca |
| `membership.invited`, `membership.activated`, `membership.deactivated`, `identity.claimed` | cambios de acceso Calc3D |

Con `session_id` UUID válido en `request.jwt.claims` (JSON de claims JWT verificados por PostgREST; se admite el claim individual en gateways anteriores), varias evaluaciones seguidas de la misma sesión y misma decisión producen un evento. Dos sesiones verificadas distintas producen dos eventos aun dentro de cinco minutos. Las evaluaciones intercaladas A→B→A con la misma decisión no duplican la segunda visita de A: cada sesión se compara con su propia última decisión. En cambio, una misma sesión que cambia de decisión `allowed`→`denied`→`allowed` registra las tres transiciones. Si ese claim no existe, se suprimen repeticiones de la misma decisión para el mismo usuario durante cinco minutos; al terminar esa ventana una nueva evaluación puede registrar otra fila. Una decisión distinta siempre genera evento. Esto no identifica visitas separadas en la ventana sin claim. No enviar un supuesto `session_id` como argumento del RPC.

## Alcance y límites

Los eventos de escritura se crean en la misma transacción que el cambio: si esa transacción falla o se revierte, **no queda evento**. No hay garantía de registrar errores SQL revertidos, cada clic, intentos de contraseña de Google ni entradas anteriores a la instalación/invocación del RPC. Una admisión denegada sí genera una fila visible al administrador aunque no cambien datos comerciales. No se almacenan tokens, cabeceras, contraseñas, payloads de clientes/proveedores, IP ni país. No utilizar la bitácora como fuente de permisos; la autorización sigue en `calc3d_access_status()`.

## Retención y operación pendiente

El listado oculta eventos anteriores a `now() - interval '180 days'`; la frontera exacta permanece visible. `calc3d_prune_audit()` elimina **solo** filas de la bitácora anteriores a esa frontera, sin argumentos y disponible únicamente para el dueño SQL o `service_role`. No elimina cotizaciones, compras, usuarios, perfiles ni solicitudes. La migración no instala pg_cron ni otro programador. **Aún no hay garantía de borrado físico automático a 180 días:** T5 requiere autorización explícita para habilitar una tarea diaria Calc3D que invoque este RPC y revisar su ejecución. Hasta entonces los eventos antiguos pueden persistir físicamente aunque no aparezcan en el listado.

Prueba local (PostgreSQL desechable, sin servicios vivos): `node --test tests/supabase-activity-audit.test.mjs tests/supabase-storage.test.mjs tests/supabase-quote-integrity.test.mjs`.
