# Aceptar invitaciones en el inicio de sesión

Una cuenta confirmada con invitación pendiente puede entrar sin intervención manual: al iniciar sesión, el cliente consulta `calc3d_access_status()`, intenta explícitamente `calc3d_claim_invitation()` **solo si el acceso está denegado**, y vuelve a consultar el estado. Únicamente el segundo estado `{allowed, role, email}` puede admitirla; la fila devuelta por el claim nunca autoriza por sí sola.

## Casos y límites

| Caso | Resultado |
|---|---|
| Sin sesión o miembro/administrador admitido | No se llama al claim. |
| Invitación pendiente confirmada | Claim seguido de una nueva consulta de acceso; entrar solo si está admitida. |
| Revocado, sin invitación, invitación inactiva | `23514` con mensaje exacto `Invitation is not pending`: sigue denegado, sin mostrar éxito. |
| Error inesperado de red, permisos o servidor | Se muestra el error genérico de verificación existente; no se convierte en denegación normal. |
| Cambio de sesión durante el intento | La comprobación antigua no puede autorizar la sesión nueva. |

Esto ocurre en el bootstrap del login y de la página protegida, no en operaciones de repositorio ni dentro del estado de acceso/RLS. Las operaciones protegidas mantienen su comprobación normal e independiente y los controles de administrador siguen cerrados ante fallos. Requiere la migración `202610260001_calc3d_member_identity.sql` aplicada por el operador autorizado; no cambia Auth compartido ni datos históricos.

## Comprobar localmente

Ejecutar `node --test tests/auth.test.mjs tests/invitation-claims.test.mjs tests/supabase-repositories.test.mjs` con dobles deterministas. El fake browser, si se usa, solo prueba navegación y llamadas HTTP simuladas: no demuestra que el RPC real haya reclamado una invitación en la base de datos.
