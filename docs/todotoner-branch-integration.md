# Reconciliación de la rama del catálogo con main

Esta integración conserva el árbol de aplicación de `main` en `c67ab6cb0b70e27b0018c0c1ba5c6160bb7f38c1` e incorpora como ancestro el historial de `feat/todotoner-filament-catalog` en `c61a69d15447b913a381eb95c1e460cfa9a1fe32`.

## Por qué no se reemplaza el código

Las funcionalidades del catálogo ya llegaron a `main` mediante las PR #6–#8 y la integración del catálogo. La PR #15 incorporó la navegación principal y la edición de bobinas guardadas. Otras PR posteriores agregaron filtros, colores y correcciones de pruebas y entorno que la rama original no contiene.

La estrategia de reconciliación conserva el árbol de `main`; esta constancia es el único cambio de archivos respecto de esa base. Los commits originales siguen accesibles a través de los dos padres del commit de integración, sin reinterpretar sus diferencias como funcionalidades nuevas.

## Revisión y entrega

- Referencia no cerrante: issue #5, aprobada para el catálogo.
- La PR debe aprobar `Node tests` y `Browser tests`, sin omitir la protección de `main`.
- Para conservar el historial de la rama, esta reconciliación requiere **merge commit**, no squash ni rebase.
- No se modifica código, configuración, dependencias, esquemas ni datos.
- No se ejecutan despliegues ni migraciones y no se incluyen archivos locales ajenos a esta integración.

La evidencia de ejecución y el resultado de la entrega se consultan en los checks y el estado de la PR; este documento no anticipa su aprobación.
