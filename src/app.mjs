import { evaluate } from './ui/quote.mjs';
import { createRemoteRepositories } from './data/supabase.mjs';
import { protectPage } from './auth/protected-page.mjs';
import { buildSpoolCatalog } from './ui/spool-catalog.mjs';
import { orderSpoolsForDisplay } from './ui/spool-order.mjs';
import { historicalSpool, selectedSpool } from './ui/spool-selection.mjs';
import { createBrandProfilePicker } from './ui/brand-profile-picker.mjs';

const form = document.querySelector('#quote-form');
const clientFields = { name: document.querySelector('#client-name'), phone: document.querySelector('#client-phone'), email: document.querySelector('#client-email') };
const clientValues = () => Object.fromEntries(Object.entries(clientFields).map(([name, input]) => [name, input.value]));
function showClient(open) {
  document.querySelector('#client-toggle').setAttribute('aria-expanded', String(open));
  document.querySelector('#client-fields').hidden = !open;
}
document.querySelector('#client-toggle').addEventListener('click', () => showClient(document.querySelector('#client-fields').hidden));
function setClient(client = {}) {
  const values = client ?? {};
  for (const [name, input] of Object.entries(clientFields)) input.value = values[name] || '';
  showClient(Object.values(values).some(Boolean));
}
const spoolSelect = form.elements.namedItem('spoolId');
const spoolPicker = createBrandProfilePicker(spoolSelect, {
  root: document.querySelector('.calculator-spool-picker'),
  listId: 'calculator-spool-picker-list', label: 'Bobina de prueba', listLabel: 'Bobinas de prueba',
  formatRow: item => item.label,
});
const printerSelect = form.elements.namedItem('printerProfile');
let repositories;
let printerState = null;
let settings = { snapshot: () => printerState, error: null };
let historyRecords = [];
let historyError = '';
let saving = false;
let accessible = false;
let pinnedPrinter = null;
let historicalCopy = false;
const fixed = ['watts', 'electricityPricePerKwh', 'replacementCost', 'replacementLifetimeHours'];
function applyPrinter(printer) {
  pinnedPrinter = printer;
  for (const key of fixed) form.elements.namedItem(key).value = String(printer[key]);
  document.querySelector('#printer-name-current').textContent = printer.name;
}
function printerFromForm(saved) {
  if (!saved?.printerInstanceId) return null;
  return {
    id: saved.printerInstanceId, name: saved.printerName, modelId: saved.printerModelId,
    ...Object.fromEntries(fixed.map((key) => [key, Number(saved[key])])),
  };
}
function restorePrinter(saved = {}) {
  historicalCopy = true;
  const historical = printerFromForm(saved);
  printerSelect.replaceChildren();
  refreshPrinters();
  if (historical) {
    const option = [...printerSelect.options].find((item) => item.value === historical.id);
    if (option) option.textContent = `${historical.name} · copia histórica`;
    else printerSelect.add(new Option(`${historical.name} · copia histórica`, historical.id));
    printerSelect.value = historical.id;
    applyPrinter(historical);
  } else {
    // A legacy record has no installed-printer identity. Never attribute it to the active instance.
    printerSelect.add(new Option('Sin perfil instalado · copia histórica', 'historical-unassociated'));
    printerSelect.value = 'historical-unassociated';
    pinnedPrinter = null;
    document.querySelector('#printer-name-current').textContent = 'Sin perfil instalado · copia histórica';
  }
}
function refreshPrinters() {
  const state = settings.snapshot();
  printerSelect.replaceChildren();
  if (!state) { printerSelect.add(new Option('Configuración no disponible', '')); return; }
  for (const printer of state.printers) printerSelect.add(new Option(printer.name, printer.id));
}
function resetPrinter() {
  historicalCopy = false;
  refreshPrinters();
  const state = settings.snapshot();
  if (state) {
    printerSelect.value = state.activeId;
    applyPrinter(state.printers.find((printer) => printer.id === state.activeId));
  } else {
    pinnedPrinter = null;
    document.querySelector('#printer-name-current').textContent = 'Configuración no disponible';
  }
}
const commercial = document.querySelector('#commercial');
const currency = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 });
let catalog = [];
let pinnedSpool = null;
const catalogError = document.querySelector('#purchase-catalog-error');
let current;
const tabs = [document.querySelector('#calculator-tab'), document.querySelector('#history-tab')];
const panels = [document.querySelector('#calculator-panel'), document.querySelector('#history-panel')];
function showView(index, focus = false) {
  tabs.forEach((tab, position) => {
    const selected = position === index;
    tab.setAttribute('aria-selected', String(selected));
    tab.tabIndex = selected ? 0 : -1;
    panels[position].hidden = !selected;
  });
  if (focus) tabs[index].focus();
}
tabs.forEach((tab, index) => {
  tab.addEventListener('click', () => showView(index));
  tab.addEventListener('keydown', (event) => {
    const next = { ArrowRight: (index + 1) % tabs.length, ArrowLeft: (index + tabs.length - 1) % tabs.length, Home: 0, End: tabs.length - 1 }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    showView(next, true);
  });
});

function describeSpool() {
  const spool = catalog.find(item => item.id === spoolSelect.value);
  document.querySelector('#spool-info').replaceChildren();
  const info = document.querySelector('#spool-info');
  if (!catalog.length) {
    info.append('No hay bobinas configuradas. ');
    const link = document.createElement('a'); link.href = './settings.html'; link.textContent = 'Configurar bobinas';
    info.append(link);
  } else if (spool?.purchaseId) {
    info.textContent = `Compra de prueba ${spool.purchaseId} · bobina ${spool.spoolId} · ${spool.material}, ${spool.brand}, ${spool.color} · ${spool.date}. No representa saldo disponible ni descuenta consumo.`;
  } else if (spool) info.textContent = spool.label;
  else info.textContent = 'La bobina guardada ya no está disponible. La copia conserva su costo original; selecciona una bobina disponible para un cálculo nuevo.';
}
function setSpool() {
  pinnedSpool = null;
  describeSpool();
  render();
}
function values() {
  const data = Object.fromEntries([...new FormData(form).entries()]);
  if (data.calculationMode !== 'reference') {
    for (const name of ['replacementCost', 'replacementLifetimeHours', 'errorPercent', 'multiplierPreset', 'customMultiplier']) delete data[name];
  }
  const spool = selectedSpool(catalog, data.spoolId, pinnedSpool);
  if (spool) {
    data.purchasePrice = spool.purchasePrice;
    data.netWeightGrams = spool.netWeightGrams;
  }
  if (pinnedPrinter) {
    data.printerInstanceId = pinnedPrinter.id;
    data.printerName = pinnedPrinter.name;
    data.printerModelId = pinnedPrinter.modelId;
  }
  return data;
}
function row(parent, label, amount, presentation = '') {
  const line = document.createElement('div');
  line.className = `result-row${presentation ? ` ${presentation}` : ''}`;
  const name = document.createElement('span');
  name.textContent = label;
  const value = document.createElement('strong');
  value.textContent = currency.format(amount);
  line.append(name, value);
  parent.append(line);
}
function canSaveSpool() {
  return catalog.some(item => item.id === spoolSelect.value) ||
    (pinnedSpool?.id === spoolSelect.value && pinnedSpool.id.startsWith('demo-'));
}
function render() {
  current = evaluate(values(), pinnedSpool && !catalog.some(item => item.id === pinnedSpool.id) ? [...catalog, pinnedSpool] : catalog);
  const error = document.querySelector('#form-error');
  const content = document.querySelector('#result-content');
  const save = document.querySelector('#save');
  content.replaceChildren();
  for (const input of form.querySelectorAll('[aria-invalid]')) {
    input.removeAttribute('aria-invalid');
    input.removeAttribute('aria-describedby');
  }
  const unavailable = pinnedSpool && !canSaveSpool();
  error.hidden = !current.error && !settings.error && !unavailable;
  error.textContent = settings.error || current.error || (unavailable ? 'La bobina guardada no está disponible; selecciona una bobina válida antes de guardar.' : '');
  save.disabled = !accessible || saving || !!current.error || !!settings.error || !canSaveSpool();
  if (current.error) {
    const field = current.field && form.elements.namedItem(current.field);
    if (field) { field.setAttribute('aria-invalid', 'true'); field.setAttribute('aria-describedby', 'form-error'); }
    const placeholder = document.createElement('p');
    placeholder.className = 'empty';
    placeholder.textContent = 'Corrige los datos para ver un cálculo actualizado.';
    content.append(placeholder);
    return;
  }
  const result = current.result;
  const labels = { material: 'Material', electricity: 'Electricidad', depreciation: 'Depreciación', wear: 'Desgaste', allowance: 'Imprevistos', extras: 'Otros costos' };
  const historicalCosts = result.breakdown.maintenance + result.breakdown.labor;
  for (const [key, value] of Object.entries(result.breakdown)) {
    if (key === 'maintenance') {
      if (historicalCosts > 0) row(content, 'Costos históricos', historicalCosts);
    } else if (key !== 'labor') row(content, labels[key], value);
  }
  row(content, 'Costo total', result.totalCost, 'cost-total');
  if (current.input.purpose === 'internal') {
    row(content, 'Gasto interno estimado', result.internalCost, 'expense-total');
  } else if (current.input.purpose === 'gift') {
    row(content, 'Costo de regalo estimado', result.giftCost, 'expense-total');
  } else {
    row(content, 'Precio base', result.basePrice);
    row(content, 'Descuento', result.discountAmount === 0 ? 0 : -result.discountAmount);
    row(content, 'Recargo', result.surchargeAmount);
    row(content, 'Precio final estimado', result.finalPrice, 'sale-total');
    row(content, 'Ganancia estimada', result.commercialProfit);
  }
}
function renderHistory() {
  const list = document.querySelector('#history-list');
  const error = document.querySelector('#history-error');
  error.hidden = !historyError;
  error.textContent = historyError;
  list.replaceChildren();
  const records = historyRecords;
  if (!records.length) {
    const empty = document.createElement('p');
    empty.className = 'empty';
    empty.textContent = historyError ? 'El historial no está disponible.' : 'Todavía no guardaste cálculos. Puedes probar el formulario sin registrar nada.';
    list.append(empty);
  }
  for (const record of records) {
    const item = document.createElement('article');
    item.className = 'history-item';
    const description = document.createElement('div');
    const title = document.createElement('strong');
    title.textContent = record.title;
    const detail = document.createElement('p');
    detail.textContent = `${new Date(record.savedAt).toLocaleString('es-CL')} · ${record.form?.printerName || 'Sin perfil instalado · histórico'} · ${({ sale: 'Venta', internal: 'Uso interno', gift: 'Regalo' })[record.input.purpose]} · costo ${currency.format(record.result.totalCost)}${record.input.purpose === 'sale' ? ` · precio ${currency.format(record.result.finalPrice)}` : ''}`;
    description.append(title);
    if (record.number || Object.values(record.client || {}).some(Boolean)) {
      const identity = document.createElement('span');
      identity.className = 'history-identity';
      identity.textContent = [record.number, ...Object.values(record.client || {}).filter(Boolean)].filter(Boolean).join(' · ');
      description.append(identity);
    }
    description.append(detail);
    const open = document.createElement('button');
    open.type = 'button';
    open.textContent = 'Abrir copia';
    open.addEventListener('click', async () => {
      try {
      const saved = await repositories.quotes.get(record.id);
      if (!saved || !accessible) return;
      setClient(saved.client);
      for (const [name, value] of Object.entries(saved.form || {})) {
        const field = form.elements.namedItem(name);
        if (field && name !== 'printerProfile') field.value = value;
      }
      restorePrinter(saved.form);
      // Keep a missing purchased identity explicit rather than silently selecting a fictitious bobina.
      const savedSpoolId = saved.form?.spoolId || saved.spoolId;
      pinnedSpool = historicalSpool(saved);
      if (savedSpoolId && !catalog.some((spool) => spool.id === savedSpoolId)) {
        const missing = document.createElement('option');
        missing.value = savedSpoolId;
        missing.textContent = `Bobina no disponible · ${savedSpoolId}`;
        spoolSelect.append(missing);
        spoolSelect.value = savedSpoolId;
      }
      form.elements.namedItem('calculationMode').value = saved.form?.calculationMode === 'reference' ? 'reference' : 'legacy';
      document.querySelector('#legacy-notice').hidden = saved.form?.calculationMode === 'reference';
      spoolPicker.sync();
      describeSpool();
      toggleMode();
      togglePurpose(false);
      render();
      document.querySelector('#feedback').textContent = `Copia abierta${saved.number ? ` de ${saved.number}` : ''}: editar no altera el registro guardado. Para guardar, crea otro cálculo de prueba.`;
      showView(0, true);
      } catch { document.querySelector('#history-error').hidden = false; document.querySelector('#history-error').textContent = 'No se pudo abrir la copia. Comprueba la conexión y recarga para reintentar.'; }
    });
    item.append(description, open);
    list.append(item);
  }
}
function toggleMode() {
  const reference = form.elements.namedItem('calculationMode').value === 'reference';
  document.querySelector('#reference-expenses').hidden = !reference;
  document.querySelector('#reference-multiplier').hidden = !reference;
  document.querySelector('#custom-multiplier').hidden = !reference || form.elements.namedItem('multiplierPreset').value !== 'custom';
  document.querySelector('#legacy-depreciation').hidden = reference;
  document.querySelector('#legacy-markup').hidden = reference;
  render();
}
function togglePurpose(reset = true) {
  const purpose = form.elements.namedItem('purpose').value;
  const nonSale = purpose !== 'sale';
  if (nonSale && reset) {
    for (const name of ['markupPercent', 'discountValue', 'surchargeValue']) form.elements.namedItem(name).value = purpose === 'internal' ? '0' : '';
    for (const name of ['discountType', 'surchargeType']) form.elements.namedItem(name).value = 'percent';
  }
  commercial.disabled = nonSale;
  const note = document.querySelector('#internal-note');
  note.hidden = !nonSale;
  note.textContent = purpose === 'gift'
    ? 'Regalo: conserva el costo sin precio ni ganancia. Los ajustes comerciales se reinician al cambiar de propósito.'
    : 'Uso interno: sin precio de venta, ganancia ni ajustes comerciales. Los valores comerciales se reinician al cambiar de propósito.';
  render();
}
form.addEventListener('input', (event) => {
  document.querySelector('#feedback').textContent = '';
  render();
});
form.addEventListener('change', (event) => {
  if (event.target === spoolSelect) setSpool();
  if (event.target === printerSelect) {
    historicalCopy = false;
    const printer = settings.snapshot()?.printers.find((item) => item.id === printerSelect.value);
    if (printer) applyPrinter(printer);
  }
  if (event.target.name === 'purpose') togglePurpose();
  if (event.target.name === 'multiplierPreset') toggleMode();
  render();
});
form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (saving || !accessible) return;
  render();
  const feedback = document.querySelector('#feedback');
  if (current.error || settings.error || !canSaveSpool()) { feedback.textContent = settings.error || 'Selecciona una bobina disponible antes de guardar.'; return; }
  saving = true; render();
  try {
    // Refresh before saving: an edited active printer must not silently alter a draft.
    const latest = await repositories.printers.load();
    if (!historicalCopy && (JSON.stringify(latest) !== JSON.stringify(printerState) ||
        !latest.printers.some(printer => printer.id === pinnedPrinter?.id && JSON.stringify(printer) === JSON.stringify(pinnedPrinter)))) {
      throw new Error('La configuración de impresoras cambió; recarga antes de guardar.');
    }
    const source = repositories;
    const outcome = await source.quotes.save(current, clientValues());
    if (!accessible || repositories !== source) return;
    feedback.textContent = `Cálculo guardado en tu cuenta. Número ${outcome.record.number}.`;
    historyRecords = [outcome.record, ...historyRecords];
    renderHistory();
    try {
      const refreshed = await source.quotes.list();
      if (!accessible || repositories !== source) return;
      historyRecords = refreshed; historyError = ''; renderHistory();
    } catch {
      if (accessible && repositories === source) {
        historyError = 'No se pudo actualizar el historial; recarga para reintentar.';
        feedback.textContent = `Cálculo guardado en tu cuenta. Número ${outcome.record.number}; no se pudo actualizar el historial. Recarga para reintentar.`;
        renderHistory();
      }
    }
  } catch (error) {
    if (accessible) {
      feedback.textContent = error.message || 'No se pudo guardar; comprueba la conexión y recarga.';
      const input = Object.values(clientFields).find(field => feedback.textContent.startsWith(field.labels[0].textContent));
      if (input) { showClient(true); input.setAttribute('aria-invalid', 'true'); input.setAttribute('aria-describedby', 'feedback'); input.focus(); }
    }
  } finally { saving = false; render(); }
});
document.querySelector('#start-current').addEventListener('click', () => {
  form.reset();
  pinnedSpool = null;
  spoolPicker.sync();
  resetPrinter();
  setClient();
  form.elements.namedItem('calculationMode').value = 'reference';
  document.querySelector('#legacy-notice').hidden = true;
  document.querySelector('#feedback').textContent = '';
  setSpool();
  toggleMode();
  togglePurpose(false);
  showView(0, true);
});
function initializeDraft() {
  // Browser form restoration must not silently turn an ordinary reload into a historical calculation.
  setClient();
  pinnedSpool = null;
  resetPrinter();
  form.elements.namedItem('calculationMode').value = 'reference';
  document.querySelector('#legacy-notice').hidden = true;
  setSpool();
  toggleMode();
  togglePurpose(false);
}
window.addEventListener('pageshow', (event) => {
  if (event.persisted) window.location.reload();
});
function clearAccount() {
  accessible = false; repositories = null; printerState = null; historyRecords = []; historyError = ''; settings.error = null;
  catalog = []; pinnedSpool = null; spoolSelect.replaceChildren(); spoolPicker.render([], true); printerSelect.replaceChildren(); pinnedPrinter = null;
  historicalCopy = false; document.querySelector('#printer-name-current').textContent = '';
  setClient(); form.reset(); document.querySelector('#result-content').replaceChildren();
  catalogError.hidden = true; catalogError.firstChild.textContent = '';
  document.querySelector('#history-list').replaceChildren();
  document.querySelector('#feedback').textContent = '';
  renderHistory(); document.querySelector('#save').disabled = true;
}
await protectPage({ onClear: clearAccount, onReady: async ({ client, session }, isCurrent) => {
  const source = createRemoteRepositories(client, session);
  try {
    const [printers, quotes, spools, profiles] = await Promise.all([
      source.printers.load(), source.quotes.list(), source.purchases.listSpools(), source.spoolProfiles.list(),
    ]);
    if (!isCurrent()) return;
    repositories = source;
    printerState = printers; historyRecords = quotes;
    catalog = buildSpoolCatalog(spools, profiles);
    spoolSelect.replaceChildren();
    for (const spool of orderSpoolsForDisplay(catalog)) spoolSelect.add(new Option(spool.label, spool.id));
    // The first catalog identity, not the display order, remains the default selection.
    if (catalog.length) spoolSelect.value = catalog[0].id;
    let remembered = null;
    try { remembered = sessionStorage.getItem(`calc3d-spool-selection:${session.user.id}`); } catch { /* Optional selection memory. */ }
    if (catalog.some(item => item.id === `profile:${remembered}`)) spoolSelect.value = `profile:${remembered}`;
    spoolPicker.render(orderSpoolsForDisplay(catalog), false);
    catalogError.hidden = true; settings.error = null; accessible = true;
    initializeDraft(); renderHistory();
  } catch {
    if (!isCurrent()) return;
    clearAccount(); settings.error = 'No se pudieron cargar datos remotos. Comprueba la conexión y recarga para reintentar.';
    catalogError.hidden = false; catalogError.firstChild.textContent = `${settings.error} `;
    render();
  }
} });
