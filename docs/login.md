# Acceso por invitación

La aplicación usa Supabase Auth con Google o con la cuenta existente de correo y contraseña. No hay registro público en la interfaz. Solo las direcciones autorizadas en **Usuarios** pueden usar la aplicación; una sesión válida sin invitación muestra acceso pendiente/desactivado. Desactivar una invitación revoca acceso en el servidor, incluso con sesión abierta. La invitación **no envía correo** ni crea una cuenta Auth. La cuenta administradora existente conserva sus credenciales y rol de Auth sin modificaciones.

## Probar esta instalación

Las dos migraciones ya están aplicadas en el Supabase de desarrollo. La cuenta existente quedó autorizada como administradora de Calc3D, sin cambiar sus credenciales ni su rol de Auth. No volver a ejecutar las migraciones en esa instancia.

```bash
npm start -- --port 5175
```

1. Abrir `http://127.0.0.1:5175/login.html`. Este puerto evita desplazar el servidor que ya usa 5173.
2. Entrar con el correo y contraseña de la cuenta existente. No hay que crear otra cuenta.
3. Abrir **Usuarios** y agregar la dirección Gmail que se quiera autorizar. Esa persona podrá entrar con Google; no se envía una invitación por correo.
4. Para probar Google en este puerto, agregar `http://127.0.0.1:5175/` a las redirecciones permitidas de Supabase Auth, conservando las de otras aplicaciones.

El build con la configuración pública local pasó; no se publicaron archivos. El consentimiento Google y la redirección final al dominio todavía requieren una prueba manual.

## Configurar otra instalación

1. Crear un archivo privado `.env.local` en la raíz (ignorado por Git) copiando estas líneas y reemplazando los marcadores **localmente**:

   ```dotenv
   SUPABASE_URL=https://tu-proyecto.supabase.co
   SUPABASE_ANON_KEY=sb_publishable_tu-clave-publica
   ```

   También se admite una clave JWT legada con rol `anon`. Nunca usar una clave JWT de usuario o `service_role`, ni `sb_secret_*`; el validador local no autentica la clave, el gateway Supabase verifica su validez real. No compartir el archivo. El cliente oficial guarda tokens de sesión en el navegador por diseño de frontend directo; protegerlo contra XSS y usar HTTPS.
2. Configurar en Supabase Auth el origen y las URL de redirección permitidas: `http://127.0.0.1:5173/` para desarrollo (`http://127.0.0.1:5174/` para pruebas Playwright simuladas) y `https://calc3d.tbema.net/` en producción; mantener las credenciales Google ya configuradas, sin reemplazar allowlists de otras aplicaciones.
3. `npm ci`, `npm start` (servidor Vite local 127.0.0.1:5173), o `npm run dev`. `npm run build` crea `dist/` y `npm run preview` permite inspeccionarlo localmente. Publicar **solo el contenido de `dist/`** bajo HTTPS en el dominio elegido; no publicar la raíz, `.env.local` ni el código fuente. El hosting debe servir los HTML de múltiples páginas; la devolución OAuth apunta a `/`.
4. `npm test` ejecuta pruebas Node; `npm run test:e2e` ejecuta Playwright con configuración pública falsa y servicios HTTP simulados para auth. No requiere iniciar sesión real en Google. La autorización inicial de administrador y las políticas RLS requieren que la migración de invitaciones esté aplicada por separado.

La página de login acepta Google y correo/contraseña de cuentas ya existentes; después de entrar consulta `calc3d_access_status()` antes de enviar a la calculadora. La página `/users.html` solo permite administrar membresía si el servidor confirma el rol admin. Calculadora, impresoras y compras comprueban acceso antes de cada lectura/escritura y guardan por RPC con políticas RLS. La impresora inicial es solo un valor por defecto: no escribe hasta pulsar Guardar. No se importan ni borran datos anteriores de `localStorage`; para trasladarlos hace falta una herramienta explícita separada. Antes del primer uso remoto deben estar aplicadas la migración de almacenamiento y la migración de invitaciones. Supabase REST usa el esquema `public` predeterminado. Ver [almacenamiento remoto](remote-storage.md). La comprobación de consentimiento Google, redirección real y dominio sigue siendo manual antes del despliegue.
