// Configure fixed costs through the same public settings adapter used by the settings page.
export async function setPrinterCosts(page, changes) {
  await page.evaluate(async (changes) => {
    const { createPrinterSettingsStore } = await import('/src/data/printer-settings.mjs');
    const store = createPrinterSettingsStore(localStorage);
    const state = store.snapshot();
    const printer = state?.printers.find((item) => item.id === state.activeId);
    if (!printer) throw Error(store.error || 'No hay impresora activa');
    const result = store.updatePrinter(printer.id, { ...printer, ...changes });
    if (!result.ok) throw Error(result.error);
  }, changes);
  await page.reload();
}
