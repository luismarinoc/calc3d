# Acceso a Dokploy por MCP

El MCP permite administrar el Dokploy existente desde Pi; **tener conexión no despliega Calc3D**. Mantén la configuración y el token privados y usa las herramientas de escritura solo para la nueva Application autorizada. Para publicarla, sigue [la guía de despliegue](deploy-dokploy.md).

## Configuración privada existente

- El token se guarda **fuera del proyecto** en `~/.pi/agent/dokploy.token`, con permisos `0600`. Lo introduce localmente su propietario: nunca en chat, Git, frontend, logs ni documentación.
- La entrada de Dokploy está en `.pi/mcp.json`, ignorado por Git; referencia ese archivo privado para `DOKPLOY_API_KEY` y usa `DOKPLOY_URL=https://admin.tbema.net`. No pegues el token como literal en la configuración. Conserva intacta la entrada `supabase-dev` preexistente. No copies un archivo de configuración completo a este repositorio.
- Usa el paquete oficial fijado en `@dokploy/mcp@0.30.7` mediante stdio, con seis categorías filtradas, carga diferida, redacción de respuestas `DOKPLOY_REDACT_ENV=true` y `DOKPLOY_RETRY_ATTEMPTS=0`. Nueve métodos de alto riesgo están ocultos de la selección; **esto no convierte el MCP en solo lectura ni impide otras mutaciones**. Revisa el alcance antes de cada escritura.

La conexión se comprobó localmente con Pi CLI y una lectura de proyectos en el host actual; no implica que exista una aplicación desplegada. Tras cambios futuros en la configuración privada, ejecuta `/reload` en Pi y vuelve a comprobar conexión sin imprimir credenciales. Si falla, verifica URL, referencia al archivo y permisos localmente; no compartas el contenido del token. La documentación del [MCP oficial](https://www.npmjs.com/package/@dokploy/mcp) describe `DOKPLOY_URL`, `DOKPLOY_API_KEY`, filtrado y redacción.
