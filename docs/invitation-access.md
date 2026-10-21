# Acceso por invitación a Calc3D

La membresía de Calc3D es **específica de la aplicación**; `admin` y `member` no son roles de Supabase Auth ni alteran `auth.users.role` o `public.user_profiles`. La invitación autoriza un correo: **no crea cuentas Auth ni envía un mensaje**. El usuario debe iniciar sesión con una cuenta Auth existente o iniciar el flujo de Google y confirmar el correo correspondiente. No hay registro público en la aplicación. El administrador nunca debe usar una clave `service_role` en el navegador: las RPC verifican su membresía en el servidor.

## Aplicación

Aplicar `supabase/migrations/202610210002_calc3d_invitations.sql` **solo después de** la versión `202610210001_calc3d_storage.sql`, como propietario de la migración y únicamente en el entorno aprobado. La versión 1 ya está instalada en desarrollo; **no volver a aplicarla**. La base autohospedada compartida no tiene registro nativo `supabase_migrations.schema_migrations`: coordinar y registrar externamente la aplicación de la versión 2 antes de cualquier herramienta automática; no crear un registro global ni repetir SQL por su ausencia. No tocar configuración global de Auth ni otras aplicaciones.

La versión 2 busca el UUID Auth existente `ab174a71-71c7-4cd7-8a4f-60ebd5f99fd6`, exige correo confirmado y obtiene su correo de `auth.users` para darlo de alta como primer `admin` Calc3D. Si la cuenta no existe, no está confirmada o su correo no satisface la validación, **abortar la aplicación**; no sustituirla, crear otra cuenta ni cambiar roles Auth. Aplicar de forma atómica bajo el mecanismo de migración aprobado. La migración no elimina presupuestos ni compras anteriores.

Prueba aislada: `node --test tests/supabase-invitations.test.mjs` inicia PostgreSQL local temporal con usuarios ficticios y ejecuta ambas migraciones y `supabase/tests/invitations.sql`; requiere `initdb`, `pg_ctl` y `psql` en `PATH`. No conecta a producción ni a Supabase remoto. Ejecutar `npm test` para regresión general.

## Contrato de la aplicación

- `calc3d_access_status()` devuelve JSON `{allowed, role, email}`. La identidad proviene de `auth.uid()` y de la fila actual confirmada de `auth.users`; ni un correo enviado por el cliente ni los metadatos del JWT otorgan acceso. Se compara solo `lower(btrim(email))`: no se reescriben alias de Gmail. El correo del estado puede aparecer incluso cuando `allowed` es falso si la cuenta está confirmada.
- `SELECT public.calc3d_members` permite al administrador activo ver `email`, `role`, `active`, `created_at`. Ningún miembro ordinario puede enumerar invitaciones. `calc3d_invite_user(invited_email text)` normaliza el correo, crea o reactiva la autorización y devuelve la fila; invitar de nuevo al administrador no lo degrada. `calc3d_set_user_active(member_email text, enabled boolean)` devuelve la fila actualizada. Solo un administrador Calc3D activo puede ejecutar estas RPC; no puede desactivarse a sí mismo ni dejar la aplicación sin administradores activos.
- Las cinco tablas de almacenamiento siguen siendo privadas por propietario: `SELECT` exige **membresía activa Y `owner_id = auth.uid()`**. Solo las tres RPC públicas originales guardan presupuestos, impresoras y compras; sus firmas y validación existentes se conservan. Las funciones núcleo renombradas no conceden `EXECUTE` a `anon` ni a `authenticated`.
- Desactivar acceso conserva datos y contadores, pero bloquea nuevas lecturas y las tres escrituras incluso para sesiones JWT ya abiertas: la próxima sentencia consulta el correo Auth y la membresía actuales. Reactivar permite recuperar los datos propios. Como en PostgreSQL, una sentencia ya iniciada observa su instantánea transaccional; una revocación confirmada se aplica a nuevas sentencias, no cancela sentencias en curso ni sustituye la gestión de sesiones Auth.

El acceso de los usuarios al resto de aplicaciones Supabase no cambia. No incluir claves públicas o privadas ni contraseñas en esta documentación.
