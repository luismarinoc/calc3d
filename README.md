# Calc3D — prototipo de calculadora 3D

Para las PR, checks y releases automáticos de versiones, consulta [controles del repositorio](docs/repository-controls.md). Los controles están activos en [GitHub](https://github.com/luismarinoc/calc3d): `main` requiere PR y checks exitosos, también para administradores. El [CI de la carga inicial](https://github.com/luismarinoc/calc3d/actions/runs/39512874793) pasó sin publicar una release; la publicación de una futura PR de versión aún no se ha ejercitado.

En la raíz del proyecto, ejecuta `npm start` y abre http://127.0.0.1:5173. El servidor estándar Python se limita a tu equipo: deténlo con Ctrl+C. Pruebas: `npm test` (27 pruebas Node, sin navegador). Para pruebas de navegador, instala las dependencias de desarrollo con `npm install` y los navegadores locales con `PLAYWRIGHT_BROWSERS_PATH=.cache/ms-playwright npx playwright install chromium webkit`; luego ejecuta `npm run test:e2e`. Playwright levanta y detiene su propio servidor local en 127.0.0.1:5173 (el puerto debe estar libre); genera capturas inicial y final de cada proyecto en `test-results/`, excluido de Git. Los proyectos emulan escritorio Chromium, teléfono WebKit y iPad WebKit en vertical/horizontal; no equivalen a pruebas en un dispositivo iOS físico ni en Safari real. No abras `index.html` con `file://`: los módulos ES necesitan HTTP local.

La interfaz en español usa CLP y muestra bobinas **ficticias** con precios de ejemplo editables, costos estimados y precio de venta separado. Incluye venta y uso interno/personal; el uso interno conserva gasto sin ingreso ni ganancia y reinicia/desactiva los ajustes comerciales. Trabajo familiar/regalo y cobro parcial quedan pendientes de decisión. Precio de venta: «Ganancia sobre costo (%)» es markup, no margen. Descuento y recargo pueden coexistir como monto CLP o porcentaje independiente sobre el precio base; una venta por debajo del costo se rechaza. El cálculo cambia al editar sin guardar. El botón «Guardar cálculo de prueba» registra una copia explícita con fecha ISO e identificador y «Abrir copia» carga los campos sin alterar el original. El historial usa `localStorage` exclusivamente en este navegador: no es base de datos, backup, autenticación ni autorización. Si el almacenamiento es ilegible no se sobrescribe y si falla la escritura no se confirma el guardado. Nada descuenta inventario, registra una impresión real o constituye venta realizada. No hay imágenes, informes ni cuentas de usuario. IVA y política de cobro familiar siguen sin definirse.

## Contrato del módulo de cálculo

Módulo puro compatible con navegador y Node: `import { calculateQuote } from './src/domain/costs.mjs'`.

```js
const result = calculateQuote({
  purpose: 'sale', // 'sale' o 'internal'
  spool: { purchasePrice: 20000, netWeightGrams: 1000 },
  grams: 50, // consumo total, incluidos soportes y purga
  hours: 1, minutes: 30,
  watts: 200, electricityPricePerKwh: 200,
  markupPercent: 50,
  discount: { type: 'percent', value: 10 },
  surcharge: { type: 'amount', value: 100 },
});
```

Obligatorios: `purpose`, `spool.purchasePrice` (CLP, ≥0), `spool.netWeightGrams` (>0), `grams` (≥0), `hours` (entero ≥0), `minutes` (entero 0–59), `watts` (≥0) y `electricityPricePerKwh` (CLP/kWh, ≥0). Numéricos siempre finitos de tipo número; no se convierten cadenas. Opcionales con valor predeterminado cero: `depreciationPerHour`, `maintenancePerHour` (CLP/h), `laborMinutes`, `laborRatePerHour` (CLP/h), `extraProductionCost` (CLP) y `markupPercent`. `discount` y `surcharge` son opcionales; cada uno acepta `{ type: 'amount' | 'percent', value: número no negativo }`. Descuento máximo 100% o monto máximo igual al precio base. Un recargo porcentual no tiene límite porcentual, pero el resultado debe caber en CLP entero seguro. No se usan existencias remanentes para impedir una estimación y la función nunca modifica datos ni inventario.

`breakdown` presenta `material`, `electricity`, `depreciation`, `maintenance`, `labor`, `extras`; `totalCost` suma estos componentes. Cada componente se redondea al CLP entero más cercano (mitad hacia arriba) **antes** de sumar. `basePrice = round(totalCost × (1 + markupPercent/100))`: es **recargo sobre costo (markup), no margen**. Ambos ajustes porcentuales usan este mismo precio base; cada ajuste se redondea a CLP antes de restar/sumar. El piso se comprueba sobre esos importes enteros; la igualdad con el costo se acepta. `finalPrice`, `commercialProfit`, `internalCost`, `discountAmount` y `surchargeAmount` completan el resultado. En `internal` el costo sigue visible y `internalCost = totalCost`, mientras precio base, precio final y ganancia comercial son cero; el markup se ignora y los ajustes de venta no cero se rechazan. No hay propósito familiar hasta acordar la política de cobro parcial.

Los errores son excepciones con mensajes estables en español: `Propósito inválido: use sale o internal.`, `<campo> debe ser un número finito no negativo.`, `hours debe ser un entero no negativo.`, `minutes debe ser un entero entre 0 y 59.`, `spool.netWeightGrams debe ser un número finito mayor que cero.`, `<ajuste>.type debe ser amount o percent.`, `El descuento porcentual no puede superar 100%.`, `El descuento no puede superar el precio base.`, `El trabajo interno no admite descuentos ni recargos.`, `Resultado fuera del rango seguro de CLP.` y `El precio final no puede ser menor al costo total (faltan N CLP).` Esta política de redondeo es una suposición técnica reversible, no una decisión fiscal; no incluye IVA, tarifas de canal ni importación desde slicer.
