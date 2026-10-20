# Compras y bobinas: demo local

T6a entrega una API sin interfaz. Una compra se guarda **solo** al llamar `savePurchase`; explorar o validar datos no escribe nada. Usa un almacenamiento inyectado compatible con `getItem`/`setItem` (por ejemplo `localStorage`) y la clave `calc3d.demo.purchases.v1`, separada del historial de cotizaciones. No conecta con una base de datos ni representa inventario consumido.

## Uso

```js
import { createPurchaseStore } from '../src/data/purchases.mjs';

const store = createPurchaseStore(localStorage);
const result = store.savePurchase({
  date: '2024-02-29', // fecha comercial, no fecha de creación
  supplier: { name: 'Proveedor', address: 'Santiago', phone: '+56 9 1234' },
  notes: 'Retiro en tienda',
  lines: [{ material: 'PLA', brand: 'Marca', color: 'Rojo', quantity: 2,
    netWeightGrams: 1000, purchasePrice: 16000 }],
});
if (!result.ok) console.error(result.error);
const purchases = store.listPurchases();
const purchase = store.getPurchase(result.ok ? result.record.id : '');
const spools = store.listSpools();
```

`createPurchaseStore(storage, { now, id })` permite inyectar reloj (devuelve `Date`) e identificadores (devuelve strings únicos) en pruebas. `store.error` informa fallos iniciales de lectura. `savePurchase` devuelve `{ ok: true, record }` o `{ ok: false, error }`; no lanza por errores de entrada/almacenamiento. `validatePurchase(input)` valida y devuelve copia normalizada con `total` y `spoolCount`, sin guardar. Las operaciones de lectura devuelven copias separadas; `getPurchase` devuelve `null` si no existe.

## Contrato de datos

| Campo | Regla |
|---|---|
| `date` | `YYYY-MM-DD`, día real de calendario; no se prohíben fechas futuras. `createdAt` es otro campo, hora ISO de guardado. |
| `supplier` | `name` texto no vacío; `address` y `phone` texto opcional (vacío por defecto). No se valida formato telefónico. |
| `lines` | Una o más líneas; `material`, `brand`, `color` son textos no vacíos; `quantity` es entero seguro positivo, `netWeightGrams` número finito positivo, `purchasePrice` CLP por bobina, entero seguro no negativo. |
| `notes` | Texto opcional (vacío por defecto). Se conserva el texto suministrado, incluido espacio externo. |
| Límite técnico | `MAX_SPOOLS_PER_PURCHASE = 1000`, incluido el extremo; no se crean bobinas por encima de este límite. El total `Σ quantity × purchasePrice` debe ser entero seguro CLP. |

Cada bobina guarda `id`, `purchaseId`, `date`, `supplier`, `material`, `brand`, `color`, `purchasePrice`, `netWeightGrams` y `remainingGrams` inicialmente igual al peso neto. Se deriva la lista desde compras validadas: no hay un segundo contador mutable ni precio promedio. No hay descuentos, impuestos, flete, ajustes de stock, deducciones por impresión o integración con cotizaciones todavía. El stock mostrado aquí solo refleja compras de esta demo, **no consumo real**; T7 registrará consumo.

Errores estables: `La compra debe ser un objeto.`, `Fecha de compra inválida (YYYY-MM-DD).`, `La compra requiere al menos una línea.`, `Máximo 1000 bobinas por compra.`, `Total de compra fuera del rango seguro de CLP.`, `No se pudo generar un identificador único; intenta de nuevo.`, `Las compras de prueba no se pueden leer; no se modificaron sus datos.`, `Las compras cambiaron en otra pestaña; recarga antes de guardar.`, `No se pudo guardar en este navegador; la compra no quedó registrada.` Los errores de campos usan `supplier.name`, `supplier.address`, `supplier.phone`, `notes` y `lines[N].campo` más la regla correspondiente; no convierten cadenas numéricas a números.

Un almacenamiento corrupto o inaccesible nunca se reescribe automáticamente. La lectura previa al guardado detecta cambios de clave conocidos y exige recarga, pero **localStorage no ofrece compare-and-swap ni transacciones entre pestañas**. Esta es una demo de una pestaña, no almacenamiento de producción: una base de datos futura necesitará transacción del servidor, validación y control de acceso. No se modifica el historial de cotizaciones existente.
