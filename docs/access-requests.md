# Solicitudes de acceso: contrato de almacenamiento

Una cuenta Auth confirmada que todavía no pertenece a Calc3D puede solicitar acceso. La solicitud **no habilita** la aplicación: solo una aprobación administrativa vincula su UID confirmado como miembro. Esta migración es local y aditiva; no se aplica a producción sin autorización aparte.

## RPC públicas

Llamar como `authenticated`, con identidad resuelta por `auth.uid()` y `auth.users`; no enviar correo ni UID del navegador.

| RPC | Resultado | Quién |
| --- | --- | --- |
| `calc3d_request_access()` | JSON `{ "state": "pending", "request": {…} }` | Cuenta Auth confirmada y única |
| `calc3d_list_access_requests()` | Filas de solicitudes, ordenadas por creación descendente | Administrador admitido |
| `calc3d_review_access_request(request_id uuid, decision text, expected_revision bigint)` | Fila revisada | Administrador admitido |

`request` tiene exactamente `id`, `user_id`, `email`, `status`, `revision`, `created_at`, `updated_at`, `reviewed_at` (este último es `null` mientras sigue pendiente). `state` puede ser `pending`, `approved`, `rejected`, `authorized` o `revoked`. `authorized` y `revoked` devuelven `request: null`: la pertenencia aceptada, activa o inactiva respectivamente, tiene prioridad. Los usuarios sin confirmar reciben SQLSTATE `28000` / `Confirmed Calc3D identity required`. El solicitante ve **solo su solicitud** a través de su RPC; no tiene lectura directa de la tabla ni acceso a la lista administrativa.

## Flujo y fallos para la interfaz

1. En el bootstrap autenticado, comprobar primero `calc3d_access_status()` y la posible invitación explícita. Si sigue denegado, llamar `calc3d_request_access()` sin argumentos. `pending` muestra «Solicitud pendiente», `rejected` «Solicitud rechazada» y `revoked` «Acceso desactivado»; nunca desbloquear por estas filas. Registrar luego la decisión con `calc3d_record_access()` y comprobar nuevamente el estado de acceso. Las operaciones ordinarias siguen siendo solo lectura de acceso.
2. Mostrar `calc3d_list_access_requests()` únicamente en Usuarios → Solicitudes para administradores. La lista incluye historial; filtrar `status = 'pending'` para la bandeja.
3. Para aprobar o rechazar, enviar `request_id`, `decision = 'approved' | 'rejected'` y la `revision` observada. El resultado revisado tiene `revision` incrementada y `reviewed_at` establecido. SQLSTATE `40001` / `Access request revision conflict` requiere recargar la lista, nunca reenviar a ciegas. Identidad alterada (`23514` / `Access request identity changed`) o pertenencia en conflicto (`23514` / `Access request membership conflict`) requieren resolución administrativa fuera de este flujo.

La aprobación exige que el UID original todavía exista, esté confirmado y sea el único confirmado para el correo normalizado original. Asigna únicamente `member`, o vincula una invitación explícita **pendiente y activa** ya existente sin cambiar su rol. No transfiere vínculos aceptados, no repara automáticamente una membresía histórica sin fila de identidad, no eleva administradores, no reactiva cuentas desactivadas ni modifica presupuestos, compras o contadores. Rechazar conserva membresías y registros de negocio, y repetir el inicio no reabre una solicitud rechazada. Las invitaciones y reclamos explícitos existentes siguen funcionando por separado.

## Límite operativo

La migración de solicitudes no captura IP ni país: mostrar «No disponible». El registro de acceso y la interfaz se describen en [Auditoría](./activity-audit.md) y [Uso de Usuarios](./access-audit.md). No hay evidencia de OAuth real ni de despliegue por las pruebas locales. La validación de UID/email se realiza con una lectura coherente de Auth después de bloquear filas **solo de Calc3D**, sin bloquear la tabla Auth compartida; una actualización Auth concurrente posterior al snapshot debe tratarse con los chequeos de admisión UID existentes al usar la aplicación.
