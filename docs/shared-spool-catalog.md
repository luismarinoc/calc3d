# Catálogo común de bobinas: contrato local

La semilla pública contiene productos confirmados y referencias pendientes del proveedor; no contiene bobinas ni identificadores de cuentas. T3 añade un lector de repositorio y proyección para el calculador. La migración T2 sigue bloqueada sin verificación independiente: este contrato local no autoriza aplicar SQL, habilitar la interfaz ni publicar en main.

## Reproducir la semilla

Con el artefacto público revisado `prepared-catalog.json` del trabajo `todotoner-complete-filaments`:

```sh
node ops/shared-catalog-seed.mjs <ruta-al-artefacto-publico-revisado>/prepared-catalog.json
node --test tests/shared-catalog*.test.mjs
```

La fuente es el catálogo normalizado v2 (SHA-256 `cd02ddbdb9591722cda5061db6e76a232436f2da1ffe6bafe2e76db88a7d44a0`) y su preparación revisada v5. Se seleccionan 1127 productos confirmados y 44 referencias pendientes de 1179 identidades; se excluyen 8 no filamentos. Las 44 referencias no incluyen peso neto ni perfil cotizable. El conteo describe esta fuente, no una cuota para futuras actualizaciones. Ningún dato de importaciones SQL o lecturas de cuentas integra la semilla.

## Contrato para las siguientes unidades

`data/shared-supplier-catalog.json` tiene `{ version, sourceSha256, records }`. Cada fila tiene `id` (`base:<UUID>` estable derivado de SKU sin dueño), `sku`, `sourceUrl`, `status` y `provenance` con hashes de fuente y normalizador. Las confirmadas tienen `profile: { name, material, brand, purchasePrice, netWeightGrams, filamentColor, filamentColorHex? }`; el HEX aparece solo cuando está respaldado por la fuente. Las pendientes tienen `name`, `material`, `brand`, `filamentColor`, `referencePriceClp` (precio público de referencia, nullable) y `reasons`, **sin** perfil ni peso/precio cotizable. Ambos tipos conservan `sourceUrl` y hashes públicos de procedencia; `brandId`, identificadores de cuenta y campos nativos no se copian.

`composeSharedCatalog({ base, personal, overrides })` devuelve primero filas personales, luego filas base no duplicadas; recibe solo las filas privadas del dueño ya autorizado. Un override es `{ baseId, fields }`: la presencia explícita de cada campo en `fields` manda, incluso cuando coincide con el valor anterior. Los otros campos, incluido el color del filamento de la fuente, se leen siempre del perfil base vigente. La composición mantiene procedencia y datos de presentación de pendientes, sin convertir `referencePriceClp` en `purchasePrice`. Solo se aceptan nombre, material, marca, precio de compra y peso, sujetos a `validateSpoolProfile`. La identidad exacta del proveedor deduplica filas y conserva la fila y el ID personal; sin identidad verificada no se aplica semejanza por nombre, marca o peso. La función no escribe ni muta las entradas. La autorización del dueño, la verificación de procedencia de filas personales y la prohibición de cotizar pendientes deberán aplicarse también en T2–T4.

## API local para el consumidor T4 (sin conectar la interfaz todavía)

`createRemoteRepositories(client, session).sharedCatalog.list()` devuelve `{ profiles, pendingReferences }`. Cada perfil base está aplanado con `id: "base:<uuid>"`, `source: "base"`, `baseRevision`, `overrideRevision` (0 si no existe), `overriddenFields`, `sourceUrl`, `sku`, color público y `brandId: null`. Los perfiles personales mantienen su UUID, archivo y editor original. Las referencias pendientes conservan nombre, material, marca, color, URL, SKU, precio de referencia y razones; tienen `quotable: false` y nunca entran al calculador. Los lectores compartidos usan páginas completas y sesión vinculada al dueño; si la migración falta o la lectura es parcial, se propaga el error, no un catálogo vacío.

```js
const { profiles, pendingReferences } = await repositories.sharedCatalog.list();
const catalog = buildSpoolCatalog(purchasedSpools, profiles.filter(p => p.source !== 'base'), brands,
  profiles.filter(p => p.source === 'base'));
// En el editor, conservar solo campos tocados explícitamente; no copiar el perfil entero.
await repositories.sharedCatalog.saveOverride(baseUuid, { purchasePrice: 12000 }, overrideRevision);
await repositories.sharedCatalog.hide(baseUuid, overrideRevision);
// Para perfiles personales, seguir usando spoolProfiles.updateProfile/archiveProfile.
```

`saveOverride(uuid, fields, expectedRevision)` y `hide(uuid, expectedRevision)` requieren UUID sin prefijo, validan la revisión (0 para primer cambio) y usan exclusivamente los RPC `calc3d_save_shared_override` y `calc3d_hide_shared_product`. Devuelven `{ baseId, overrideRevision, fields, hidden }`. Ninguna lectura escribe ni crea overrides. `buildSpoolCatalog(purchasedSpools, profiles = [], brands = [], baseProfiles = [])` preserva el comportamiento antiguo con tres argumentos; el cuarto acepta solo perfiles resueltos base, no pendientes. `selectedSpool` y `historicalSpool` conservan selecciones y snapshots de cotizaciones existentes.

La vista SQL efectiva no expone la revisión del override y oculta filas; por eso este lector usa las tablas `calc3d_shared_products` y `calc3d_shared_overrides` del borrador T2, con composición local. T4 todavía debe conectar consulta/editor y asegurar que una cuenta cambiada no pinte una respuesta vieja.
