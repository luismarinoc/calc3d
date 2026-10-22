# Publicar Calc3D en Dokploy

Publica **solo `dist/`** como aplicación frontend separada en el Dokploy existente. Esta guía prepara la configuración; no confirma que el dominio, DNS ni HTTPS ya estén operativos. No cambies el Compose de Supabase ni otras aplicaciones.

## Aplicación y build

1. En Dokploy, crea una **Application** nueva (no un servicio en el Compose de Supabase). Selecciona Git como fuente: repositorio `github.com/luismarinoc/calc3d`, rama exacta `feat/print3d-management`. Comprueba que la rama y el commit que se va a publicar ya estén en GitHub antes de desplegar.
2. Selecciona **Nixpacks**, Node 22 (el SDK de Supabase requiere Node >=22), instalación `npm ci` y build `npm run build`. Configura **Publish Directory = `dist`**: Dokploy copia esos archivos al Nginx optimizado para estáticos, que escucha en el puerto **80**. Desactiva el modo SPA (`isStaticSpa=false`) para conservar las cinco páginas HTML. No uses `npm start` ni el servidor de desarrollo Vite como servicio público. No pongas Static Root en `.` ni sirvas la raíz del repositorio.
3. En **Environment** de esta Application, configura únicamente los valores públicos de build:

   | Variable | Valor |
   | --- | --- |
   | `SUPABASE_URL` | `https://sp-dev.tbema.net` |
   | `SUPABASE_ANON_KEY` | clave pública `anon`/publishable de esa instancia, introducida solo en Dokploy; no copiar aquí su valor real |
   | `NIXPACKS_NODE_VERSION` | `22` |
   | `NIXPACKS_INSTALL_CMD` | `npm ci` |
   | `NIXPACKS_BUILD_CMD` | `npm run build` |

   `SUPABASE_ANON_KEY` es intencionalmente visible en el JavaScript del navegador tras el build; la protección de datos depende de Auth/RLS. No introduzcas claves `service_role`, `sb_secret_*`, tokens de Dokploy, secretos de Google ni archivos privados. Las variables de Docker Build Time Arguments no sustituyen **Environment** para Nixpacks.
4. Despliega solo esta Application. Comprueba en el registro que `npm ci` y `npm run build` finalizaron y que se publicó `dist/`, no código fuente ni archivos privados. Un build local exitoso no prueba un despliegue remoto.

## Dominio y acceso

1. El propietario del DNS debe crear/verificar el registro **A** `calc3d` de `tbema.net` apuntando a la **IP pública real del VPS** de Dokploy (confirmarla en la infraestructura); no copiar una IP de borde de Cloudflare ni inventar el destino.
2. En los dominios de la nueva Application, configura host `calc3d.tbema.net`, path `/`, puerto del contenedor `80` y HTTPS con Let's Encrypt. Espera la propagación del DNS y la emisión del certificado; no modifiques los dominios de otras aplicaciones.
3. En Supabase Auth, añade `https://calc3d.tbema.net/` a las **URL de redirección permitidas** si falta, sin reemplazar las existentes ni modificar el Site URL de otras aplicaciones. El callback de Google existente `https://sp-dev.tbema.net/auth/v1/callback` no cambia; no hace falta otro cliente Google.

## Comprobación de disponibilidad

- [ ] El DNS público resuelve `calc3d.tbema.net` a la IP pública real del VPS; si hay proxy, verifica la ruta al origen por separado.
- [ ] `https://calc3d.tbema.net/` responde con certificado válido y carga los recursos estáticos; también abren `/login.html`, `/settings.html`, `/purchases.html` y `/users.html` sin listar archivos internos.
- [ ] Login y redirección vuelven al dominio, con una cuenta invitada/autorizada. El consentimiento Google real necesita comprobación manual; un test local no la sustituye.
- [ ] Supabase y los demás dominios siguen operativos. Si falla DNS, certificado, build o autenticación, registra la evidencia y corrige solo el componente afectado antes de declarar el dominio listo.

Hasta verificar esos puntos en vivo, **DNS del propietario, despliegue, certificado y flujo de acceso siguen pendientes**. Consulta [Acceso por invitación](login.md) y [configuración MCP de Dokploy](dokploy-mcp.md).

Referencias: [Dokploy: Build Type](https://docs.dokploy.com/docs/core/applications/build-type) y [Dokploy: Domains](https://docs.dokploy.com/docs/core/domains/others).
