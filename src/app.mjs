import { evaluate } from './ui/quote.mjs';
import { createDemoHistory } from './data/demo.mjs';
import { createPurchaseStore } from './data/purchases.mjs';
import { buildSpoolCatalog } from './ui/spool-catalog.mjs';
import { createPrinterSettingsStore } from './data/printer-settings.mjs';

const form = document.querySelector('#quote-form');
const clientFields = { name: document.querySelector('#client-name'), phone: document.querySelector('#client-phone'), email: document.querySelector('#client-email') };
const clientValues = () => Object.fromEntries(Object.entries(clientFields).map(([name, input]) => [name, input.value]));
function showClient(open) {
  document.querySelector('#client-toggle').setAttribute('aria-expanded', String(open));
  document.querySelector('#client-fields').hidden = !open;
}
document.querySelector('#client-toggle').addEventListener('click', () => showClient(document.querySelector('#client-fields').hidden));
function setClient(client = {}) {
  for (const [name, input] of Object.entries(clientFields)) input.value = client[name] || '';
  showClient(Object.values(client).some(Boolean));
}
const spoolSelect = form.elements.namedItem('spoolId');
const printerSelect = form.elements.namedItem('printerProfile');
const printerStorage = { getItem: (key) => localStorage.getItem(key), setItem: (key, value) => localStorage.setItem(key, value) };
let settings = createPrinterSettingsStore(printerStorage);
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
  settings = createPrinterSettingsStore(printerStorage);
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
const history = createDemoHistory({
  getItem: (key) => window.localStorage.getItem(key),
  setItem: (key, value) => window.localStorage.setItem(key, value),
});
const purchases = createPurchaseStore({
  getItem: (key) => window.localStorage.getItem(key),
  setItem: (key, value) => window.localStorage.setItem(key, value),
});
const catalog = buildSpoolCatalog(purchases.listSpools());
const catalogError = document.querySelector('#purchase-catalog-error');
catalogError.hidden = !purchases.error;
if (purchases.error) catalogError.firstChild.textContent = `${purchases.error} `;
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

for (const spool of catalog) {
  const option = document.createElement('option');
  option.value = spool.id;
  option.textContent = spool.label;
  spoolSelect.append(option);
}
function describeSpool() {
  const spool = catalog.find((item) => item.id === spoolSelect.value);
  const purchased = !!spool?.purchaseId;
  form.elements.namedItem('purchasePrice').readOnly = purchased;
  form.elements.namedItem('netWeightGrams').readOnly = purchased;
  document.querySelector('#spool-info').textContent = purchased
    ? `Compra de prueba ${spool.purchaseId} · bobina ${spool.spoolId} · ${spool.material}, ${spool.brand}, ${spool.color} · ${spool.date}. Precio de adquisición ${currency.format(spool.purchasePrice)} y peso inicial adquirido ${spool.initialAcquiredGrams} g: campos de solo lectura. No representa saldo disponible ni descuenta consumo.`
    : spool ? 'Bobina ficticia: precio y peso editables para simular; no representa inventario.'
      : 'La bobina guardada no está disponible en compras de prueba. Se conserva la copia original; no se puede guardar otra hasta seleccionar una bobina válida.';
}
function setSpool() {
  const spool = catalog.find((item) => item.id === spoolSelect.value);
  if (!spool) return;
  form.elements.namedItem('purchasePrice').value = spool.purchasePrice;
  form.elements.namedItem('netWeightGrams').value = spool.netWeightGrams;
  describeSpool();
  render();
}
function values() {
  const data = Object.fromEntries([...new FormData(form).entries()]);
  if (data.calculationMode !== 'reference') {
    for (const name of ['replacementCost', 'replacementLifetimeHours', 'errorPercent', 'multiplierPreset', 'customMultiplier']) delete data[name];
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
function render() {
  current = evaluate(values(), catalog);
  const error = document.querySelector('#form-error');
  const content = document.querySelector('#result-content');
  const save = document.querySelector('#save');
  content.replaceChildren();
  for (const input of form.querySelectorAll('[aria-invalid]')) {
    input.removeAttribute('aria-invalid');
    input.removeAttribute('aria-describedby');
  }
  error.hidden = !current.error && !settings.error;
  error.textContent = settings.error || current.error || '';
  save.disabled = !!current.error || !!history.error || !!settings.error;
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
  const labels = { material: 'Material', electricity: 'Electricidad', depreciation: 'Depreciación', wear: 'Desgaste', allowance: 'Imprevistos', maintenance: 'Mantención', labor: 'Trabajo', extras: 'Otros costos' };
  for (const [key, value] of Object.entries(result.breakdown)) row(content, labels[key], value);
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
  error.hidden = !history.error;
  error.textContent = history.error || '';
  list.replaceChildren();
  const records = history.list();
  if (!records.length) {
    const empty = document.createElement('p');
    empty.className = 'empty';
    empty.textContent = history.error ? 'El historial no está disponible.' : 'Todavía no guardaste cálculos. Puedes probar el formulario sin registrar nada.';
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
    open.addEventListener('click', () => {
      const saved = history.get(record.id);
      if (!saved) return;
      setClient(saved.client);
      for (const [name, value] of Object.entries(saved.form || {})) {
        const field = form.elements.namedItem(name);
        if (field && name !== 'printerProfile') field.value = value;
      }
      restorePrinter(saved.form);
      // Keep a missing purchased identity explicit rather than silently selecting a fictitious bobina.
      const savedSpoolId = saved.form?.spoolId || saved.spoolId;
      if (savedSpoolId && !catalog.some((spool) => spool.id === savedSpoolId)) {
        const missing = document.createElement('option');
        missing.value = savedSpoolId;
        missing.textContent = `Bobina no disponible · ${savedSpoolId}`;
        spoolSelect.append(missing);
        spoolSelect.value = savedSpoolId;
      }
      form.elements.namedItem('calculationMode').value = saved.form?.calculationMode === 'reference' ? 'reference' : 'legacy';
      document.querySelector('#legacy-notice').hidden = saved.form?.calculationMode === 'reference';
      describeSpool();
      toggleMode();
      togglePurpose(false);
      render();
      document.querySelector('#feedback').textContent = `Copia abierta${saved.number ? ` de ${saved.number}` : ''}: editar no altera el registro guardado. Para guardar, crea otro cálculo de prueba.`;
      showView(0, true);
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
form.addEventListener('submit', (event) => {
  event.preventDefault();
  render();
  const feedback = document.querySelector('#feedback');
  if (current.error || settings.error) { feedback.textContent = settings.error || 'Corrige los datos antes de guardar.'; return; }
  // Reject a changed configuration rather than claiming an old draft is a current printer.
  const latest = createPrinterSettingsStore(printerStorage);
  if (latest.error || !latest.snapshot() || (!historicalCopy &&
      (JSON.stringify(latest.snapshot()) !== JSON.stringify(settings.snapshot()) ||
       !settings.snapshot().printers.some((printer) => printer.id === pinnedPrinter?.id &&
         JSON.stringify(printer) === JSON.stringify(pinnedPrinter))))) {
    feedback.textContent = latest.error || 'La configuración de impresoras cambió; recarga antes de guardar.';
    return;
  }
  const outcome = history.save(current, clientValues());
  feedback.textContent = outcome.ok ? `Cálculo de prueba guardado solo en este navegador. Número ${outcome.record.number}.` : outcome.error;
  for (const input of Object.values(clientFields)) {
    input.removeAttribute('aria-invalid');
    input.removeAttribute('aria-describedby');
  }
  if (!outcome.ok && !history.error) {
    const input = Object.values(clientFields).find((field) => outcome.error.startsWith(field.labels[0].textContent));
    if (input) {
      showClient(true);
      input.setAttribute('aria-invalid', 'true');
      input.setAttribute('aria-describedby', 'feedback');
      input.focus();
    }
  }
  if (outcome.ok) renderHistory();
});
document.querySelector('#start-current').addEventListener('click', () => {
  form.reset();
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
  resetPrinter();
  form.elements.namedItem('calculationMode').value = 'reference';
  document.querySelector('#legacy-notice').hidden = true;
  setSpool();
  toggleMode();
  togglePurpose(false);
}
window.addEventListener('pageshow', (event) => {
  if (event.persisted) {
    settings = createPrinterSettingsStore(printerStorage);
    if (historicalCopy) {
      restorePrinter(values()); render();
    } else initializeDraft();
  }
});
initializeDraft();
renderHistory();
