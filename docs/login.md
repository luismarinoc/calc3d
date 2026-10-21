# Acceso por invitación

La aplicación usa Supabase Auth con Google o con la cuenta existente de correo y contraseña. No hay registro público en la interfaz. Solo las direcciones autorizadas en **Usuarios** pueden usar la aplicación; una sesión válida sin invitación muestra acceso pendiente/desactivado. Desactivar una invitación revoca acceso en el servidor, incluso con sesión abierta. La invitación **no envía correo** ni crea una cuenta Auth. La cuenta administradora existente conserva sus credenciales y rol de Auth sin modificaciones.

## Configurar y ejecutar

1. Crear un archivo privado `.env.local` en la raíz (ignorado por Git) copiando estas líneas y reemplazando los marcadores **localmente**:

   ```dotenv
   SUPABASE_URL=https://tu-proyecto.supabase.co
   SUPABASE_ANON_KEY=sb_publishable_tu-clave-publica
   ```

   También se admite una clave JWT legada con rol `anon`. Nunca usar una clave JWT de usuario o `service_role`, ni `sb_secret_*`; el validador local no autentica la clave, el gateway Supabase verifica su validez real. No compartir el archivo. El cliente oficial guarda tokens de sesión en el navegador por diseño de frontend directo; protegerlo contra XSS y usar HTTPS.
2. Configurar en Supabase Auth el origen y las URL de redirección permitidas: `http://127.0.0.1:5173/` para desarrollo y `https://calc3d.tbema.net/` en producción; mantener las credenciales Google ya configuradas, sin reemplazar allowlists de otras aplicaciones.
3. `npm ci`, `npm start` (servidor Vite local 127.0.0.1:5173), o `npm run dev`. `npm run build` crea `dist/` y `npm run preview` permite inspeccionarlo localmente. Publicar **solo el contenido de `dist/`** bajo HTTPS en el dominio elegido; no publicar la raíz, `.env.local` ni el código fuente. El hosting debe servir los HTML de múltiples páginas; la devolución OAuth apunta a `/`.
4. `npm test` ejecuta pruebas Node; `npm run test:e2e` ejecuta Playwright con configuración pública falsa y servicios HTTP simulados para auth. No requiere iniciar sesión real en Google. La autorización inicial de administrador y las políticas RLS requieren que la migración de invitaciones esté aplicada por separado.

La página de login acepta Google y correo/contraseña de cuentas ya existentes; después de entrar consulta `calc3d_access_status()` antes de enviar a la calculadora. La página `/users.html` solo permite administrar membresía si el servidor confirma el rol admin. Acceso a datos de cálculo, impresoras y compras será conectado por T3: **las pantallas existentes aún usan almacenamiento local y aún no tienen guardias**. No desplegar como experiencia multiusuario hasta completar T3 y verificar el flujo real en el dominio.
