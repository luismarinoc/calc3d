# Catálogo común de bobinas: contrato local

El catálogo común permite que cualquier cuenta admitida consulte bobinas confirmadas y referencias pendientes. Solo administradores crean o modifican bobinas; cada cuenta conserva sus compras, configuraciones e historial de cotizaciones privados. Esta es una implementación funcional local, **no** una autorización para aplicar migraciones a la base activa, desplegar o integrar en main. La aceptación independiente de seguridad de T2/T3 sigue pendiente.

## Semilla pública

Con el artefacto público revisado `prepared-catalog.json` del trabajo `todotoner-complete-filaments`:

```sh
node ops/shared-catalog-seed.mjs <ruta-al-artefacto-publico-revisado>/prepared-catalog.json
node --test tests/shared-catalog*.test.mjs
```

La fuente normalizada v2 tiene SHA-256 `cd02ddbdb9591722cda5061db6e76a232436f2da1ffe6bafe2e76db88a7d44a0`; la preparación revisada v5 selecciona 1127 confirmados y 44 pendientes de 1179 identidades. Las referencias pendientes no tienen peso ni perfil cotizable. No se copian filas privadas a la semilla.

## Contrato para la interfaz siguiente

`createRemoteRepositories(client, session).sharedCatalog.list()` devuelve `{ profiles, pendingReferences }`. Los confirmados comunes usan `id: "base:<uuid>"`, `source: "base"`, `origin: "supplier" | "manual"`, `baseRevision` y campos planos del perfil; las referencias pendientes se consultan separadamente y tienen `quotable: false`. Las filas privadas conservan su UUID, archivo e historial. Si una fila privada tiene identidad verificada idéntica de proveedor (SKU o URL exacta), conserva su ID de presentación/cotización y su archivo, pero muestra los valores comunes vigentes y recibe `commonTarget: { id: "<uuid>", baseRevision }`. El editor administrativo debe llamar a `sharedCatalog.update(commonTarget.id, fields, commonTarget.baseRevision)`, **no** a `spoolProfiles.updateProfile` para esa fila. Nunca se emparejan bobinas manuales por parecido. Los antiguos overrides/hides personales permanecen almacenados, pero no afectan la vista ni la cotización y sus RPC dejan de ser ejecutables por cuentas autenticadas.

```js
const { profiles, pendingReferences } = await repositories.sharedCatalog.list();
const commonId = profiles.find(row => row.source === 'base').id.slice(5);
const created = await repositories.sharedCatalog.create({ name: 'PLA', material: 'PLA', brand: 'Marca', purchasePrice: 12000, netWeightGrams: 1000 });
const updated = await repositories.sharedCatalog.update(commonId, { purchasePrice: 12500 }, created.baseRevision);
```

`create(profile)` requiere administrador y los cinco campos del editor, devuelve `{ id: "base:<uuid>", origin: "manual", baseRevision: 1, ...profile }`. Una creación manual no posee SKU, URL ni hashes ficticios. `update(uuid, fields, expectedRevision)` requiere administrador, UUID **sin** prefijo, revisión positiva actual y campos parciales no vacíos entre nombre, material, marca, precio y peso; devuelve el perfil común actualizado con `id`, `origin`, `baseRevision`. Ambas operaciones usan RPC con verificación de rol vigente y validación del perfil completo; conflicto CAS devuelve error sin cambios. `saveOverride` y `hide` ahora rechazan sin escribir. La interfaz anterior todavía debe sustituir el editor personal por estos métodos y deshabilitar agregar/editar/quitar bobinas para miembros.

El miembro puede leer las bobinas confirmadas, seleccionar `base:<uuid>` y guardar o reabrir/modificar **sus propias** cotizaciones. La captura histórica de cada cotización permanece; una referencia pendiente nunca es cotizable. Las escrituras de perfiles personales y compras antiguas quedan restringidas a administradores, pero las lecturas privadas siguen ligadas al dueño. La migración es aditiva; no borra perfiles, overrides, compras ni cotizaciones.
