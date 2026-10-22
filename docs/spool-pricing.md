# Precios por bobina en Configuración

En **Configuración → Bobinas**, usa **Nueva bobina** para registrar el nombre de la presentación, material, marca opcional, precio de compra en CLP y peso neto del **filamento** en gramos (no el carrete). El precio puede ser cero; el peso debe ser positivo. Pulsa **Guardar bobina** para crearla. Seleccionar una presentación o escribir en el formulario no guarda nada. Para modificarla, selecciona la presentación y pulsa **Editar seleccionada** antes de guardar; una revisión conflictiva pide recargar.

El material admite texto libre, incluidas variantes propias. Las sugerencias PLA, PETG, ABS, ASA, TPU, PC y PVA/BVOH proceden de la [guía de materiales de Prusa](https://help.prusa3d.com/filament-material-guide); no son un catálogo exhaustivo ni precios de mercado.

En el cotizador elige la presentación configurada o una bobina adquirida y escribe los gramos consumidos. El precio y el peso neto se leen de la presentación o compra guardada; no son controles del cotizador. Por ejemplo, 21.900 CLP por 1.000 g y 50 g consumidos producen 1.095 CLP de material. Una compra conserva su costo de adquisición y cotizar no descuenta inventario.

Sin bobinas propias, el cotizador ofrece un enlace a Configuración y desactiva Guardar; el historial sigue disponible. Abrir una copia histórica utiliza el costo de material guardado entonces, aun si editas el precio del perfil después. Iniciar un cálculo nuevo o elegir otra bobina usa el costo actual. Las copias históricas no modifican el registro original. Los ejemplos ficticios solo se conservan para interpretar registros anteriores y para la API de cálculo heredada; no aparecen como opciones para cálculos nuevos.

Cambios solo en código fuente: no se ha aplicado ninguna migración remota ni desplegado la aplicación.
