import { createPrinterSettingsStore } from './data/printer-settings.mjs';
import { demoPrinter } from './domain/printer-settings.mjs';
import { printerProfiles, customPrinter } from './ui/printer-profiles.mjs';

const storage = { getItem: (key) => localStorage.getItem(key), setItem: (key, value) => localStorage.setItem(key, value) };
let store = createPrinterSettingsStore(storage);
let editing = null;
const select = document.querySelector('#active-printer');
const form = document.querySelector('#printer-form');
const feedback = document.querySelector('#settings-feedback');
const failure = document.querySelector('#settings-error');
const model = form.elements.namedItem('modelId');
for (const profile of printerProfiles) model.add(new Option(profile.name, profile.id));
model.add(new Option('Otro / personalizado', customPrinter));
const numericLabels = {
  watts: 'Potencia estimada', electricityPricePerKwh: 'Tarifa eléctrica',
  replacementCost: 'Costo de reposición', replacementLifetimeHours: 'Vida útil de reposición',
};
function showState() {
  const snapshot = store.snapshot();
  failure.hidden = !!snapshot;
  failure.textContent = snapshot ? '' : store.error;
  for (const control of [select, ...form.elements, ...document.querySelectorAll('.settings-actions button')]) control.disabled = !snapshot;
  select.replaceChildren();
  if (!snapshot) return;
  for (const printer of snapshot.printers) select.add(new Option(`${printer.name}${printer.id === snapshot.activeId ? ' · activa' : ''}`, printer.id));
  select.value = snapshot.activeId;
}
function populate(printer) {
  form.elements.namedItem('name').value = printer.name;
  if (printer.modelId && ![...model.options].some((option) => option.value === printer.modelId)) model.add(new Option(printer.modelId, printer.modelId));
  model.value = printer.modelId;
  for (const key of Object.keys(numericLabels)) form.elements.namedItem(key).value = String(printer[key]);
}
function resetError() {
  feedback.textContent = '';
  for (const field of form.querySelectorAll('[aria-invalid]')) {
    field.removeAttribute('aria-invalid'); field.removeAttribute('aria-describedby');
  }
}
function report(message, field) {
  feedback.textContent = message;
  if (field) {
    field.setAttribute('aria-invalid', 'true'); field.setAttribute('aria-describedby', 'settings-feedback');
    field.focus();
  }
}
document.querySelector('#new-printer').addEventListener('click', () => {
  resetError(); editing = null;
  populate({ ...demoPrinter, name: '', modelId: 'p2s' });
  form.elements.namedItem('name').focus();
});
document.querySelector('#edit-printer').addEventListener('click', () => {
  resetError();
  const printer = store.snapshot()?.printers.find((item) => item.id === select.value);
  if (!printer) return;
  editing = printer.id; populate(printer);
  form.elements.namedItem('name').focus();
});
document.querySelector('#activate-printer').addEventListener('click', () => {
  resetError();
  const result = store.activatePrinter(select.value);
  if (!result.ok) { report(result.error); return; }
  showState(); feedback.textContent = 'Impresora activa para nuevos cálculos.';
});
model.addEventListener('change', () => {
  const profile = printerProfiles.find((item) => item.id === model.value);
  if (profile && !editing) form.elements.namedItem('watts').value = String(profile.watts);
});
form.addEventListener('submit', (event) => {
  event.preventDefault(); resetError();
  const name = form.elements.namedItem('name');
  if (!name.value.trim()) { report('Ingresa un nombre para la impresora.', name); return; }
  const input = { name: name.value, modelId: model.value };
  for (const [key, label] of Object.entries(numericLabels)) {
    const field = form.elements.namedItem(key);
    if (!field.value.trim() || !Number.isFinite(Number(field.value))) { report(`Ingresa un valor válido para ${label}.`, field); return; }
    input[key] = Number(field.value);
    if (input[key] < 0 || (key === 'replacementLifetimeHours' && input[key] <= 0) ||
        (key === 'replacementCost' && !Number.isSafeInteger(input[key]))) {
      report(`${label} debe ser ${key === 'replacementLifetimeHours' ? 'mayor que cero' : key === 'replacementCost' ? 'un entero CLP no negativo' : 'no negativo'}.`, field); return;
    }
  }
  const result = editing ? store.updatePrinter(editing, input) : store.createPrinter(input);
  if (!result.ok) { report(result.error); return; }
  editing = result.printer.id;
  showState(); select.value = editing;
  feedback.textContent = 'Impresora guardada en este navegador. Usa «Usar en nuevos cálculos» para activarla.';
});
window.addEventListener('pageshow', (event) => {
  if (event.persisted) { store = createPrinterSettingsStore(storage); editing = null; showState(); }
});
showState();
populate(demoPrinter);
