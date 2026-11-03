# Catálogo común de bobinas: contrato local T1

La semilla pública contiene productos confirmados y referencias pendientes del proveedor; no contiene bobinas ni identificadores de cuentas. Esta unidad **no** cambia el almacenamiento, la autorización ni la interfaz. T2–T4 deberán conectar el contrato a consultas protegidas y al editor.

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
