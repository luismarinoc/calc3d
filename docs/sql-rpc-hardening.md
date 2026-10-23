# Restringir la RPC SQL de un argumento

`supabase/migrations/202610220002_restrict_sql_rpc.sql` quita `EXECUTE` sobre **solo** `public.execute_sql(text)` a `PUBLIC`, `anon` y `authenticated`. Conserva el acceso explícito de `service_role`; no cambia `public.execute_sql(text, boolean)`, la ruta administrativa de dos argumentos usada por MCP. **La migración está preparada, no aplicada al servicio compartido ni a producción.**

## Aplicación y comprobación

1. Confirmar el destino autorizado y comprobar que existen los roles `service_role`, `anon` y `authenticated`. El operador debe revisar las firmas, propietarios, definición, modo de seguridad y ACL actuales de ambos overloads, así como el acceso efectivo de `PUBLIC`, `anon`, `authenticated` y `service_role`. Si la configuración difiere, detenerse y evaluar antes de aplicar.
2. Ejecutar una vez el archivo SQL como administrador autorizado dentro del procedimiento de migraciones del entorno correspondiente. El bloque es transaccional e idempotente; si falta la función de un argumento, no la crea ni falla por su ausencia. No incluye reversión que vuelva a otorgar acceso público.
3. Volver a comprobar la ACL efectiva: `PUBLIC`, `anon` y `authenticated` deben recibir `42501` al invocar la firma de un argumento; `service_role` debe conservar `EXECUTE`. Comparar la definición, propietario, ACL y resultado de la firma de dos argumentos con el estado anterior. No ejecutar sentencias de escritura ni probar datos de usuarios como parte de esa comprobación.

La prueba local `node --test tests/supabase-sql-rpc-security.test.mjs` crea PostgreSQL aislado en un directorio temporal, usa únicamente roles y datos ficticios, y no se conecta a Supabase. Verifica la negación, la conservación de la otra firma y una instalación sin la función de un argumento.

## Motivo y límites

La firma de un argumento estaba expuesta a `PUBLIC`, `anon` y `authenticated` y marcada `SECURITY DEFINER`: una RPC SQL de ese tipo con ejecución pública supone un riesgo alto de configuración. Una consulta anónima inocua devolvió `42601` por un defecto del cuerpo **antes** de ejecutar SQL dinámico; no demostró ejecución arbitraria ni exfiltración. Esta corrección no cambia ni repara el cuerpo, el propietario, el `search_path` ni la firma; tampoco certifica que el proyecto entero sea seguro.

Si un cliente legítimo pierde acceso, verificar primero la firma invocada y su rol. Recuperar solamente los permisos administrativos necesarios mediante `GRANT EXECUTE ON FUNCTION public.execute_sql(text) TO service_role` por una vía autorizada; **no** restaurar `PUBLIC`, `anon` ni `authenticated`. Si el problema corresponde a la firma de dos argumentos, investigar su ruta por separado sin ampliar los permisos del helper público.
