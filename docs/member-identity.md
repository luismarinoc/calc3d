# Identidad estable para miembros de Calc3D

La autorización aceptada queda vinculada al UUID de Auth, no a quien posea después el mismo correo. La migración conserva el esquema físico, las filas y las respuestas de membresía existentes; guarda el vínculo en una tabla privada de Calc3D. No cambia ni bloquea escrituras de Auth, ni reescribe cotizaciones, compras o contadores.

## Aplicación y comprobación

1. Aplicar `supabase/migrations/202610260001_calc3d_member_identity.sql` **una sola vez**, después de `202610210002_calc3d_invitations.sql`, mediante el propietario autorizado y el proceso de migraciones aprobado. No ejecutar esta guía en una base compartida sin preflight y respaldo del operador.
2. Si aparece `Ambiguous Calc3D member identity` (`23514`), la transacción revierte íntegramente. Identificar las cuentas Auth confirmadas duplicadas y resolver el conflicto por la vía autorizada antes de una nueva aplicación; no elegir arbitrariamente un UUID.
3. Verificar en PostgreSQL desechable con `node --test tests/supabase-identity.test.mjs tests/supabase-invitations.test.mjs tests/auth.test.mjs` (requiere `initdb`, `pg_ctl`, `psql`). No usa servicios externos.

## Contrato

| Situación | Resultado |
|---|---|
| Miembro histórico con una única cuenta confirmada actual | Se asocia a ese UUID sin alterar rol, actividad ni fecha. |
| Miembro histórico sin identidad confirmada | Permanece sin vínculo y sin acceso; **no** se considera invitación pendiente. Reinvitación rechazada con `23514`; requiere reconciliación manual autorizada. |
| Cuenta eliminada o correo reutilizado | El UUID aceptado permanece en la membresía sin FK a Auth; el nuevo UUID no recibe acceso. Una reinvitación del correo aceptado cuyo UUID ya no corresponde se rechaza con `23514`. |
| Invitación nueva a correo sin cuenta | Se guarda pendiente. La persona debe confirmar una cuenta Auth con ese correo y ejecutar explícitamente `calc3d_claim_invitation()`; el RPC exige una única cuenta confirmada, actualiza el vínculo en forma atómica y devuelve la membresía. |
| Revocación y reactivación | Se mantienen el UUID y los datos; la revocación impide RLS y escrituras hasta la reactivación administrativa. Una invitación pendiente inactiva no se puede reclamar: primero hay que reactivarla como administrador. |

`calc3d_access_status()` conserva `{allowed, role, email}` y es de solo lectura (`STABLE`): no reclama invitaciones dentro de RLS ni confía en el correo del JWT. `calc3d_member_identities` no permite lectura/escritura directa a `anon` ni `authenticated`; contiene vínculos por correo y UUID único sin FK a Auth. Los RPC `calc3d_invite_user(text)` y `calc3d_set_user_active(text, boolean)` mantienen firmas y el objeto original de cuatro campos (`email`, `role`, `active`, `created_at`); `calc3d_claim_invitation()` devuelve el mismo objeto. Invitar de nuevo a un administrador válido no lo degrada. El administrador sigue sin poder desactivarse a sí mismo ni al último administrador activo. Las tablas de negocio preexistentes mantienen sus restricciones propias.

La reclamación serializa la fila privada de Calc3D y evalúa la identidad Auth confirmada y su unicidad en una consulta consistente; no adquiere bloqueos de tabla/fila Auth. Un cambio concurrente de Auth se refleja en la siguiente sentencia de acceso, que vuelve a comprobar UUID, correo y confirmación. No hay una garantía de unicidad global para alias normalizados que aparezcan después de una reclamación.

**Integración pendiente fuera de este cambio:** el cliente actual solo consulta `calc3d_access_status()` y no llama a `calc3d_claim_invitation()`. Para que un usuario recién invitado pueda entrar desde la UI sin intervención manual, integrar una llamada explícita al RPC tras autenticación y antes de comprobar el acceso, manejando las denegaciones sin asumir que toda cuenta tiene invitación. No convertir `calc3d_access_status()` en una escritura implícita.
