# Aceptar invitaciones en el inicio de sesión

Una cuenta confirmada con invitación pendiente puede entrar sin intervención manual: en el bootstrap autenticado, el cliente consulta `calc3d_access_status()`, intenta `calc3d_claim_invitation()` **solo si el acceso está denegado**, y vuelve a consultar el estado. Si no hay invitación pendiente, solicita acceso mediante `calc3d_request_access()` sin conceder admisión. `calc3d_record_access()` registra la decisión del servidor; solo el estado fresco posterior `{allowed, role, email}` puede admitirla. Las filas de claim o solicitud nunca autorizan por sí solas.

## Casos y límites

| Caso | Resultado |
|---|---|
| Sin sesión | No se llama a ningún RPC. Miembro/administrador admitido: no se llama al claim ni a la solicitud, pero se registra la evaluación de acceso. |
| Invitación pendiente confirmada | Claim seguido de una nueva consulta de acceso; entrar solo si está admitida. |
| Revocado o rechazado | `23514` con mensaje exacto `Invitation is not pending` permite consultar el estado de solicitud existente sin reactivarlo; sigue denegado. Una cuenta nueva queda pendiente. |
| Error inesperado de red, permisos o servidor | Se muestra el error genérico de verificación existente; no se convierte en denegación normal. |
| Cambio de sesión durante el intento | La comprobación antigua no puede autorizar la sesión nueva. |

Esto ocurre en el bootstrap del login y de la página protegida, no en operaciones de repositorio ni dentro del estado de acceso/RLS. Las operaciones protegidas mantienen su comprobación normal e independiente y los controles de administrador siguen cerrados ante fallos. Requiere la migración `202610260001_calc3d_member_identity.sql` aplicada por el operador autorizado; no cambia Auth compartido ni datos históricos.

## Comprobar localmente

Ejecutar `node --test tests/auth.test.mjs tests/invitation-claims.test.mjs tests/supabase-repositories.test.mjs` con dobles deterministas. El fake browser, si se usa, solo prueba navegación y llamadas HTTP simuladas: no demuestra que el RPC real haya reclamado una invitación en la base de datos.
