# Registrar impresiones y consumo: demo local

T7a registra trabajos realizados **solo** al confirmar `savePrint`. Cada trabajo guarda costos CLP, no cobros: ni siquiera `purpose: 'sale'` implica que se haya vendido o pagado. Los trabajos internos y los fallidos conservan su costo y consumen los gramos reales anotados. No hay interfaz para registrar impresiones todavía (T7b).

## Uso

```js
import { createPurchaseStore } from '../src/data/purchases.mjs';
import { createPrintStore } from '../src/data/prints.mjs';
import { validatePrint } from '../src/domain/prints.mjs';

const purchases = createPurchaseStore(localStorage);
const prints = createPrintStore(localStorage, { purchaseStore: purchases });
const draft = {
  submissionId: crypto.randomUUID(), // retener en el borrador hasta confirmar; otro trabajo usa otro ID
  date: '2025-03-01', title: 'Soporte', purpose: 'internal', outcome: 'failed',
  pieceCount: 2, spoolId: purchases.listSpools()[0].id,
  actualGrams: 0.1, hours: 1, minutes: 30,
  costInputs: { watts: 100, electricityPricePerKwh: 200,
    depreciationPerHour: 10, maintenancePerHour: 20,
    laborMinutes: 30, laborRatePerHour: 600, extraProductionCost: 5 },
  notes: '',
};
const preview = validatePrint(draft, purchases.listSpools()[0]); // puro: no guarda ni resta
const saved = prints.savePrint(draft); // { ok: true, record } o { ok: false, error }
const history = prints.listPrints(); // { ok: true, records } o { ok: false, error }
const selected = saved.ok ? prints.getPrint(saved.record.id) : null; // { ok, record }; null si no existe
const inventory = prints.listInventory(); // { ok: true, inventory } o { ok: false, error }
```

**Antes de guardar:** compruebe `prints.error`, `purchases.error` y los resultados `ok`. Nunca interprete un error como inventario vacío. `createPrintStore(storage, { purchaseStore, now, id })` acepta el almacén de compras validado, reloj `Date` e ID string inyectables. Reabre compras en cada operación y exige que la fuente entregada coincida con la versión validada vigente; si otra pestaña cambia las compras, cree ambos almacenes de nuevo. Ninguna lectura o previsualización escribe.

## Reglas de registro

| Dato | Regla |
|---|---|
| Identidad y tiempo | `submissionId` texto no vacío por confirmación; `date` día real `YYYY-MM-DD`, separado de `createdAt` ISO UTC canónico generado al guardar. `title` texto no vacío, `notes` texto opcional. Los ID de registros son únicos. |
| Trabajo | `purpose` `sale` o `internal`; `outcome` `completed` o `failed`; `pieceCount` entero seguro positivo. Ni la cantidad de piezas ni el resultado multiplican gramos/tiempo. `actualGrams` es el total no negativo finito del trabajo (un fallo puede consumir 0); `hours` entero no negativo seguro, `minutes` entero 0–59. |
| Fuente | `spoolId` identifica una bobina adquirida. Se guarda `purchaseId` como procedencia y se usan `purchasePrice` CLP y `netWeightGrams` de esa adquisición, no el costo de una cotización. Una bobina desconocida o compras dañadas/inaccesibles impiden el guardado. |
| Costos | `costInputs` declara `watts`, `electricityPricePerKwh` (ambos requeridos), y opcionalmente `depreciationPerHour`, `maintenancePerHour`, `laborMinutes`, `laborRatePerHour`, `extraProductionCost` (por defecto 0). El motor existente valida los números finitos no negativos y calcula `cost.breakdown` y `cost.totalCost` en CLP, redondeando componentes como la calculadora. Sin `markup`, descuentos, precios, ingresos ni utilidad. Toda clave adicional (por ejemplo `extraProductionCosts` en lugar de `extraProductionCost`) se rechaza con `costInputs debe contener solo costos de producción.` antes de guardar, asignar identificadores o consumir stock; no se ignora ningún costo desconocido. |

`listInventory` parte de `netWeightGrams` de cada compra y resta los `actualGrams` de impresiones guardadas para esa bobina; **no** modifica `remainingGrams` ni ninguna clave de compras/cotizaciones. La igualdad exacta deja saldo cero. Para comparar gramos se convierten las representaciones decimales más cortas de números JS finitos a coeficientes enteros `BigInt` con escala decimal: `0.3 − 0.1 − 0.2 = 0`, sin tolerancia ni redondeo permisivo de sobregiro. El saldo público vuelve a `Number` para mostrarlo; puede adoptar la precisión normal de `Number`, mientras las decisiones de stock usan decimal exacto. No se añade límite nuevo al peso positivo finito aceptado por compras.

Los registros se guardan en `calc3d.demo.prints.v1`, separados de compras y cotizaciones. Una confirmación repetida con el mismo `submissionId` se rechaza y no descuenta otra vez; una nueva confirmación de trabajo idéntico requiere otro `submissionId`. El historial y las respuestas son copias separadas; el costo almacenado es una instantánea, no un presupuesto recalculado desde cambios de configuración de cotizaciones. Si una adquisición histórica cambia o desaparece, los registros se consideran no verificables en esta demo y la lectura falla: no se inventa stock.

Datos corruptos, timestamps imposibles, costos falsificados, IDs repetidos o saldos negativos bloquean lectura/guardado sin reescribir claves. Fallos de escritura no modifican el estado público de la instancia. Se verifica la clave antes de guardar para detectar cambios conocidos entre pestañas, **sin** compare-and-swap atómico: una carrera entre verificación y escritura aún requiere transacción de servidor. Esta demo local no es la base de datos del usuario, ni ofrece autenticación, ajustes iniciales, correcciones/reversiones, impuestos, cobros o contabilización de utilidad. Las compras individuales siguen siendo fuente inmutable; T7b agregará formulario e historial y T7c vistas de stock.
