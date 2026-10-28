# Catálogo TodoToner para P2S: recibo de carga

## Resultado verificado

- Se agregaron **71 presentaciones**: primer lote de 25 y segundo de 46.
- La cuenta destino tiene **73 perfiles**, incluidos sus dos perfiles anteriores, sin modificaciones.
- No se registraron compras, existencias ni consumo de material. Cotizaciones históricas, contadores, impresoras y bobinas compradas conservaron sus hashes.
- No hubo cambios de Auth, permisos, RLS, esquema ni otras aplicaciones. No hace falta desplegar el frontend para leer los nuevos perfiles: recargá Configuración → Materiales/Bobinas.

Los valores son **precios públicos anunciados en CLP**, no importes efectivamente pagados. El peso corresponde al filamento neto verificado. Precios y disponibilidad pueden cambiar.

## Cobertura y límites

Se recorrieron las 30 páginas enlazadas y 1.145 fichas descubiertas. El recolector produjo 92 candidatas y 1.053 exclusiones por falta de stock, datos faltantes, accesorios, condiciones especiales u otros motivos que pueden superponerse. Recorrer todas las fichas no certifica compatibilidad de cada producto.

Se cargaron 71 candidatas revisadas. **21 siguen sin cargar**:

- 16 con incertidumbres de composición, boquilla, alimentación, presentación o peso: `197PLAESUN`, `550PLAESUN`, `12PLAELEGOO`, `45PLAELEGOO`, `FLASHPETGESD19`, `FLASHABSESD20`, `833ABSESDESUN`, `FLASHPANY21`, `583PLA5KGESUN`, `584PLA5KGESUN`, `3KELEGOOPETG13`, `3KPLA51ELEGOO`, `65PLARIFELEGOO`, `ELEGOOGALAXY2`, `ELEGOOGALAXY3`, `443PLAANY`.
- 5 cuyo texto de peso `1 kg por bobina` no acepta el normalizador actual: `238PETGESUN`, `239PETGESUN`, `240PETGESUN`, `242PETGESUN`, `243PETGESUN`. Es un límite del importador, no una declaración de incompatibilidad.

Los retenidos no se clasificaron automáticamente como incompatibles. Falta decidir si se cierra con el alcance verificado o se aborda una etapa adicional para resolverlos.

## Condiciones de uso

TPU genérico y TPU 95A-HF requieren la ruta de alimentación externa correspondiente; no debe extrapolarse esa restricción a un producto anunciado específicamente «TPU para AMS». Confirmá el modelo de AMS y las instrucciones del fabricante. Un refill necesita bobina reutilizable. RFID de otras marcas no garantiza reconocimiento automático por Bambu AMS. El catálogo de costos no instala perfiles de impresión ni fija temperaturas: respetá secado, ventilación y parámetros del fabricante.

## Evidencia

El importador `ops/catalog-import.mjs` y sus pruebas se guardaron en el commit local `6e98c5a`. Prueba focalizada: 2/2 aprobadas; verificación independiente de la última fuente: 2/2 aprobadas. El primer intento fallido quedó registrado y se corrigió con autorización expresa.

Los lotes, fuentes fechadas y recibos completos se conservan bajo `.cache/odd/todotoner-p2s-catalog/`; los identificadores privados de destino y SQL están en otra carpeta ignorada, no en este documento. Cada lote se aplicó como operación atómica de solo inserción, con deduplicación y comprobación de propietario. La lectura posterior coincidió con los hashes esperados de todos los campos nuevos y preservó los registros anteriores. Un CSV auxiliar no llegó a generarse por una diferencia de formato entre los artefactos; no afecta las 71 inserciones verificadas ni sustituye los recibos.
