import { createRemoteRepositories } from './data/supabase.mjs';
import { protectPage } from './auth/protected-page.mjs';
import { demoPrinter } from './domain/printer-settings.mjs';
import { printerProfiles, customPrinter } from './ui/printer-profiles.mjs';
import { createSpoolSettings } from './ui/spool-settings.mjs';
import { createBrandSettings } from './ui/brand-settings.mjs';

let repository;
let state = null;
let pending = false;
const store = { snapshot: () => state, get error() { return failure.textContent; } };
let editing = null;
const select = document.querySelector('#active-printer');
const form = document.querySelector('#printer-form');
const feedback = document.querySelector('#settings-feedback');
const failure = document.querySelector('#settings-error');
const spoolSettings = createSpoolSettings();
const brandSettings = createBrandSettings(brands => spoolSettings.setBrands(brands));
const model = form.elements.namedItem('modelId');
for (const profile of printerProfiles) model.add(new Option(profile.name, profile.id));
model.add(new Option('Otro / personalizado', customPrinter));
const numericLabels = {
  watts: 'Potencia estimada', electricityPricePerKwh: 'Tarifa eléctrica',
  replacementCost: 'Costo de reposición', replacementLifetimeHours: 'Vida útil de reposición',
};
function showState(selectedId) {
  const snapshot = store.snapshot();
  failure.hidden = !!snapshot;
  failure.textContent = snapshot ? '' : store.error;
  for (const control of [select, ...form.elements, ...document.querySelectorAll('.settings-actions button')]) control.disabled = !snapshot || pending;
  select.replaceChildren();
  if (!snapshot) return;
  for (const printer of snapshot.printers) select.add(new Option(`${printer.name}${printer.id === snapshot.activeId ? ' · activa' : ''}`, printer.id));
  select.value = snapshot.printers.some(printer => printer.id === selectedId) ? selectedId : snapshot.activeId;
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
document.querySelector('#activate-printer').addEventListener('click', async () => {
  if (pending || !state) return;
  const selectedId = select.value;
  const source = repository;
  resetError(); pending = true; showState(selectedId);
  try {
    await source.printers.activatePrinter(selectedId);
    const next = await source.printers.snapshot();
    if (repository !== source) return;
    if (next.activeId !== selectedId) throw new Error('No se confirmó la impresora activa. Recarga para reintentar.');
    state = next; feedback.textContent = 'Impresora activa para nuevos cálculos.';
  } catch (error) { if (repository === source) report(error.message); }
  finally { if (repository === source) { pending = false; showState(selectedId); } }
});
model.addEventListener('change', () => {
  const profile = printerProfiles.find((item) => item.id === model.value);
  if (profile && !editing) form.elements.namedItem('watts').value = String(profile.watts);
});
form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (pending || !state) return;
  resetError();
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
  const source = repository;
  pending = true; showState();
  try {
    const result = editing ? await source.printers.updatePrinter(editing, input) : await source.printers.createPrinter(input);
    const next = await source.printers.snapshot();
    if (repository !== source) return;
    state = next; editing = result.printer.id;
    feedback.textContent = 'Impresora guardada en tu cuenta. Usa «Usar en nuevos cálculos» para activarla.';
  } catch (error) { if (repository === source) report(error.message); }
  finally { if (repository === source) { pending = false; showState(editing); } }
});
window.addEventListener('pageshow', (event) => {
  if (event.persisted) window.location.reload();
});
showState();
await protectPage({ onClear: () => {
  repository = null; state = null; editing = null; pending = false; form.reset(); feedback.textContent = '';
  failure.textContent = 'Comprobando acceso remoto…'; showState(); spoolSettings.clear(); brandSettings.clear();
}, onReady: async ({ client, session }, isCurrent) => {
  const source = createRemoteRepositories(client, session);
  repository = source;
  await Promise.all([brandSettings.load(source, isCurrent), spoolSettings.load(source, session, isCurrent), (async () => {
    try {
      const loaded = await source.printers.load();
      if (!isCurrent() || repository !== source) return;
      state = loaded; failure.textContent = ''; showState(); populate(demoPrinter);
    } catch {
      if (!isCurrent() || repository !== source) return;
      state = null; failure.textContent = 'No se pudo leer la configuración. Comprueba la conexión y recarga para reintentar.'; showState();
    }
  })()]);
} });
