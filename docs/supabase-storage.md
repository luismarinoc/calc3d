# Base de almacenamiento Calc3D

Esta entrega prepara tablas aisladas y RPC de escritura para usuarios existentes de Supabase Auth. **No conecta todavía la aplicación ni importa datos locales.** No cambia `public.user_profiles`, otras aplicaciones ni roles de usuarios.

## Aplicación y prueba

1. En el entorno de desarrollo autorizado, ejecutar una sola vez `supabase/migrations/202610210001_calc3d_storage.sql` como propietario administrativo de la migración. Revisar previamente el destino: **no aplicar al entorno de producción por accidente**. Requiere `auth.users`, `auth.uid()`, roles `anon` y `authenticated` y permiso de crear objetos en `public`. Es compatible con PostgreSQL 15.
2. Ejecutar `node --test tests/supabase-storage.test.mjs` localmente: crea un clúster PostgreSQL temporal, instala identidades ficticias, aplica la migración y ejecuta `supabase/tests/storage.sql` con `ON_ERROR_STOP`; comprueba también dos escritores concurrentes. Requiere `initdb`, `pg_ctl` y `psql` en `PATH`. El test detiene y elimina el clúster en `finally`; nunca usa datos reales.
3. Ejecutar `npm test` para comprobar el comportamiento JS existente. Antes de integrar la aplicación, verificar políticas, permisos de RPC y la cuenta de Auth existente en el entorno de desarrollo.

## Estado del entorno de desarrollo

La versión `202610210001` quedó aplicada en la base de desarrollo mediante un único bloque transaccional `DO`. La herramienta MCP `apply_migration` falló porque falta `supabase_migrations.schema_migrations`; se verificó que ese intento revirtió todo antes de aplicar el SQL por `execute_sql`. No se creó un historial global ni se tocaron las otras aplicaciones.

**No volver a ejecutar esta migración:** las cinco tablas y las funciones ya existen. Si después se adopta Supabase CLI u otra herramienta de migraciones, primero establecer una línea base del esquema existente; esta aplicación no figura en el historial nativo de Supabase. Se verificaron RLS, privilegios y ausencia de registros iniciales en PostgreSQL 15.8; las pruebas funcionales corrieron en PostgreSQL local aislado. El acceso REST y el guardado desde el navegador siguen pendientes de integración.

## Contrato de lectura y escritura

| Recurso público | Operación autorizada |
| --- | --- |
| `calc3d_quotes`, `calc3d_quote_counters` | `SELECT` del propietario; `calc3d_save_quote(payload jsonb)` asigna COT correlativo por usuario y guarda el formulario, entrada y resultado como snapshots. |
| `calc3d_printer_settings` | `SELECT` del propietario; `calc3d_save_printers(payload jsonb, expected_revision bigint)` escribe `{activeId, printers}` con revisión optimista. Primera escritura espera revisión 0. No hay fila inicial: la impresora de demostración es un valor por defecto de UI. |
| `calc3d_purchases`, `calc3d_spools` | `SELECT` del propietario; `calc3d_save_purchase(payload jsonb)` calcula total CLP y materializa una bobina por unidad comprada, hasta 1000. No descuenta existencias. |
| `calc3d_spool_profiles` | Catálogo editable independiente de compras: `SELECT` del propietario admitido; `calc3d_save_spool_profile(payload jsonb, profile_id uuid DEFAULT NULL, expected_revision bigint DEFAULT 0)` crea o actualiza una presentación con revisión optimista. No representa existencias ni reescribe compras o cotizaciones. |

Todas las filas tienen `owner_id` vinculado a `auth.users(id)`; RLS restringe las lecturas a `(select auth.uid())`. `anon` no tiene acceso a tablas ni ejecución RPC. `authenticated` solo tiene `SELECT` y ejecución de las tres RPC. Las escrituras son `SECURITY DEFINER` (indispensable para bloquear escrituras directas), con `search_path = ''`, nombres cualificados y verificación de `auth.uid()`; sus resultados usan una única transacción por llamada. La RPC conserva sin transformar `form`, `input` y `result`: admite el cálculo legado en CLP enteros y el cálculo de referencia con importes de hasta dos decimales. El modo se identifica por `form.calculationMode` junto con los campos de entrada y desglose correspondientes. Valida campos requeridos, magnitudes y coherencia de los importes; en referencia permite la diferencia de redondeo entre la suma de componentes ya redondeados y el total calculado antes de redondearlos. **Es un snapshot del cálculo, no una factura auditada:** SQL no recalcula el motor JS desde la entrada ni certifica precios frente a un cliente no confiable. La integración deberá respetar esa semántica.

### Perfiles de bobina: migración pendiente

`supabase/migrations/202610220001_calc3d_spool_profiles.sql` **no se ha aplicado** a ninguna base compartida. Requiere las migraciones `202610210001` y `202610210002` ya instaladas; solo aplicarla mediante autorización independiente tras verificar el destino. `node --test tests/supabase-spool-profiles.test.mjs` instala las tres migraciones en PostgreSQL temporal y ejecuta `supabase/tests/spool-profiles.sql` sin datos reales.

Cada fila tiene `id` UUID, `owner_id` (usuario Auth), `name` (presentación), `material` (texto libre), `brand` (opcional, puede ser vacío), `purchase_price` (CLP entero de 0 a 9007199254740991), `net_weight_grams` (positivo y acotado), `revision` (positiva), `created_at` y `updated_at`. El payload usa `{name, material, brand?, purchasePrice, netWeightGrams}`; no hay unicidad por nombre. Para crear se omite `profile_id` y la revisión esperada predeterminada es 0; para actualizar se proporciona el UUID y la revisión actual. Un conflicto devuelve `Spool profile revision conflict` (`40001`); entrada inválida devuelve `Invalid spool profile` (`23514`). Solo usuarios autenticados y actualmente admitidos pueden leer sus filas o ejecutar la RPC; ni `anon` ni clientes autenticados tienen escritura directa. El catálogo no define precios ficticios, consumos ni eliminación.

### Renovar el token administrativo temporal del MCP

Este procedimiento ya funcionó para el contenedor de desarrollo; requiere acceso autorizado a Docker. Ejecutar localmente (el secreto se lee **solo dentro del contenedor**):

```sh
docker exec tbema-supabase-dyjnnx-supabase-mcp bun -e 'import jwt from "jsonwebtoken"; console.log("Bearer " + jwt.sign({role:"service_role",sub:"ab174a71-71c7-4cd7-8a4f-60ebd5f99fd6"}, process.env.SUPABASE_AUTH_JWT_SECRET, {algorithm:"HS256",expiresIn:"15m"}))'
```

Copiar **toda** la salida `Bearer …` al campo `env.AUTH_HEADER` de `.pi/mcp.json` (archivo local con credenciales; nunca versionarlo ni pegarlo aquí). Luego ejecutar `/reload` y `/mcp`. Es una **credencial temporal de administración completa**, no un token de usuario final: no enviarla al navegador, no compartirla ni incorporarla al repositorio. Caduca a los 15 minutos. No hay renovación automática y este proceso **no modifica el rol del usuario existente**.

## Reversión

No ejecutar `DROP ... CASCADE` en una base compartida: primero identificar integraciones y respaldar los registros Calc3D. La reversión manual debe retirar únicamente las funciones, políticas y tablas `public.calc3d_*` de esta migración en orden de dependencias, con una ventana de mantenimiento; no tocar Auth ni otras tablas. Esta migración es aditiva y no incluye borrado automático.
