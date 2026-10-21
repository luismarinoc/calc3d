import { evaluate } from './ui/quote.mjs';
import { createDemoHistory } from './data/demo.mjs';
import { createPurchaseStore } from './data/purchases.mjs';
import { buildSpoolCatalog } from './ui/spool-catalog.mjs';

const form = document.querySelector('#quote-form');
const spoolSelect = form.elements.namedItem('spoolId');
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
  return Object.fromEntries([...new FormData(form).entries()]);
}
function row(parent, label, amount, emphasis = false) {
  const line = document.createElement('div');
  line.className = emphasis ? 'result-row emphasis' : 'result-row';
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
  error.hidden = !current.error;
  error.textContent = current.error || '';
  save.disabled = !!current.error || !!history.error;
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
  const labels = { material: 'Material', electricity: 'Electricidad', depreciation: 'Depreciación', maintenance: 'Mantención', labor: 'Trabajo', extras: 'Otros costos' };
  for (const [key, value] of Object.entries(result.breakdown)) row(content, labels[key], value);
  row(content, 'Costo total', result.totalCost, true);
  if (current.input.purpose === 'internal') {
    row(content, 'Gasto interno estimado', result.internalCost, true);
  } else {
    row(content, 'Precio base', result.basePrice);
    row(content, 'Descuento', -result.discountAmount);
    row(content, 'Recargo', result.surchargeAmount);
    row(content, 'Precio final estimado', result.finalPrice, true);
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
    detail.textContent = `${new Date(record.savedAt).toLocaleString('es-CL')} · ${record.input.purpose === 'internal' ? 'Uso interno' : 'Venta'} · costo ${currency.format(record.result.totalCost)}${record.input.purpose === 'sale' ? ` · precio ${currency.format(record.result.finalPrice)}` : ''}`;
    description.append(title, detail);
    const open = document.createElement('button');
    open.type = 'button';
    open.textContent = 'Abrir copia';
    open.addEventListener('click', () => {
      const saved = history.get(record.id);
      if (!saved) return;
      for (const [name, value] of Object.entries(saved.form || {})) {
        const field = form.elements.namedItem(name);
        if (field) field.value = value;
      }
      // Keep a missing purchased identity explicit rather than silently selecting a fictitious bobina.
      const savedSpoolId = saved.form?.spoolId || saved.spoolId;
      if (savedSpoolId && !catalog.some((spool) => spool.id === savedSpoolId)) {
        const missing = document.createElement('option');
        missing.value = savedSpoolId;
        missing.textContent = `Bobina no disponible · ${savedSpoolId}`;
        spoolSelect.append(missing);
        spoolSelect.value = savedSpoolId;
      }
      describeSpool();
      togglePurpose(true);
      render();
      document.querySelector('#feedback').textContent = 'Copia abierta: editar no altera el registro guardado. Para guardar, crea otro cálculo de prueba.';
      form.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    item.append(description, open);
    list.append(item);
  }
}
function togglePurpose(reset = true) {
  const internal = form.elements.namedItem('purpose').value === 'internal';
  if (internal && reset) {
    for (const name of ['markupPercent', 'discountValue', 'surchargeValue']) form.elements.namedItem(name).value = '0';
    for (const name of ['discountType', 'surchargeType']) form.elements.namedItem(name).value = 'percent';
  }
  commercial.disabled = internal;
  document.querySelector('#internal-note').hidden = !internal;
  render();
}
form.addEventListener('input', () => { document.querySelector('#feedback').textContent = ''; render(); });
form.addEventListener('change', (event) => {
  if (event.target === spoolSelect) setSpool();
  if (event.target.name === 'purpose') togglePurpose();
  render();
});
form.addEventListener('submit', (event) => {
  event.preventDefault();
  render();
  const feedback = document.querySelector('#feedback');
  if (current.error) { feedback.textContent = 'Corrige los datos antes de guardar.'; return; }
  const outcome = history.save(current);
  feedback.textContent = outcome.ok ? 'Cálculo de prueba guardado solo en este navegador.' : outcome.error;
  if (outcome.ok) renderHistory();
});
setSpool();
togglePurpose(false);
renderHistory();
