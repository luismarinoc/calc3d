# Solicitudes y auditoría en Usuarios

Las cuentas confirmadas sin acceso solicitan ingreso automáticamente al abrir sesión. Siguen bloqueadas hasta que un administrador apruebe y el servidor confirme una membresía activa. Una solicitud o invitación por sí sola no autoriza la aplicación.

## Uso

1. En **Usuarios → Solicitudes**, consulta correo confirmado, fecha y estado. Aprueba o rechaza una solicitud pendiente. Si otra administración la modificó, vuelve a cargar antes de tomar otra decisión; no se reenvía una revisión automáticamente.
2. **Autorizar correo** y **Accesos** mantienen el procedimiento anterior de invitación manual y activación/desactivación.
3. En **Auditoría**, consulta primero los eventos más recientes y usa **Cargar más** para recorrer lotes de hasta 50. IP y país sin fuente validada muestran «No disponible».

Una cuenta rechazada no se reabre al iniciar sesión otra vez; una cuenta revocada no se reactiva mediante solicitud. Si la decisión queda guardada pero falla la actualización de la bandeja, el aviso distingue la confirmación del fallo de lectura: vuelve a cargar Usuarios para obtener el estado actual.

## Alcance de la bitácora

Se muestran decisiones de acceso calculadas por el servidor y cambios confirmados en cotizaciones, compras, impresoras, perfiles, marcas, membresías y solicitudes. No certifica el éxito de Google OAuth, intentos de contraseña, cada clic ni transacciones revertidas. El listado cubre los **últimos 180 días**, sin eliminar cotizaciones, compras ni usuarios. El borrado físico periódico de eventos antiguos aún **no está activado**; requiere autorización operativa aparte. Tampoco hay captura confiable de IP ni país en este alcance.

Las pruebas de navegador usan respuestas HTTP simuladas, no verifican OAuth real, autorización del servidor ni despliegue. Los contratos de almacenamiento están en [Solicitudes](./access-requests.md) y [Auditoría](./activity-audit.md).
