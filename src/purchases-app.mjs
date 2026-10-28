import { createRemoteRepositories } from './data/supabase.mjs';
import { protectPage } from './auth/protected-page.mjs';
import { mapPurchaseForm } from './ui/purchase-form.mjs';

const $ = (selector, root = document) => root.querySelector(selector);
const form = $('#purchase-form');
const lines = $('#purchase-lines');
let repository;
let purchases = [];
let spools = [];
let loadError = 'Comprobando acceso remoto…';
let refreshWarning = '';
let saving = false;
const money = (amount) => `${new Intl.NumberFormat('es-CL').format(amount)} CLP`;
const text = (tag, value, className) => {
  const element = document.createElement(tag);
  element.textContent = value;
  if (className) element.className = className;
  return element;
};
const show = (node, message) => { node.textContent = message; node.hidden = !message; };
const field = (name, root = form) => $(`[name="${name}"]`, root);

function appendLine() {
  lines.append($('#line-template').content.cloneNode(true));
  renumber();
}
function renumber() {
  const items = [...lines.querySelectorAll('.purchase-line')];
  items.forEach((item, i) => {
    $('legend', item).textContent = `Línea ${i + 1}`;
    $('.remove-line', item).disabled = items.length === 1;
  });
}
function draft() {
  return {
    date: field('date').value, name: field('name').value, address: field('address').value,
    phone: field('phone').value, notes: field('notes').value,
    lines: [...lines.querySelectorAll('.purchase-line')].map((line) => Object.fromEntries(
      ['material', 'brand', 'color', 'quantity', 'netWeightGrams', 'purchasePrice'].map((name) => [name, field(name, line).value])
    )),
  };
}
function preview() {
  try {
    const value = mapPurchaseForm(draft());
    show($('#purchase-preview'), `Vista previa · ${value.spoolCount} bobinas · Total ${money(value.total)}. No guardado.`);
    return value;
  } catch {
    show($('#purchase-preview'), 'Completa los datos para ver el total. No guardado.');
    return null;
  }
}
function focusError(message) {
  show($('#purchase-error'), message);
  const match = message.match(/(?:lines\[(\d+)\]\.|Línea (\d+), )([\w]+)/);
  const line = match && lines.querySelectorAll('.purchase-line')[Number(match[1] ?? match[2]) - (match[1] === undefined ? 1 : 0)];
  const named = match?.[3] === 'precio' ? 'purchasePrice' : match?.[3] === 'peso' ? 'netWeightGrams' : match?.[3] === 'cantidad' ? 'quantity' : match?.[3];
  const target = line ? field(named, line) :
    /Fecha/.test(message) ? field('date') : /supplier\.name/.test(message) ? field('name') : null;
  (target || $('#purchase-error')).focus();
  if (target) target.setAttribute('aria-invalid', 'true');
}
function render() {
  const history = $('#purchase-history');
  const inventory = $('#purchase-inventory');
  history.replaceChildren();
  inventory.replaceChildren();
  show($('#storage-error'), loadError || refreshWarning);
  $('#purchase-save').disabled = !!loadError || saving;
  if (loadError) return;
  if (!purchases.length) history.append(text('p', 'Todavía no hay compras guardadas. Completa el formulario y guarda una compra de prueba.', 'empty'));
  for (const purchase of purchases) {
    const item = text('article', '', 'saved-item');
    item.append(text('h3', `${purchase.date} · ${purchase.supplier.name}`));
    item.append(text('p', `Dirección: ${purchase.supplier.address || 'No indicada'} · Teléfono: ${purchase.supplier.phone || 'No indicado'}`));
    const list = document.createElement('ul');
    for (const line of purchase.lines) list.append(text('li', `${line.quantity} × ${line.material} / ${line.brand} / ${line.color} · ${line.netWeightGrams} g por bobina · ${money(line.purchasePrice)} por bobina · Total ${money(line.quantity * line.purchasePrice)}`));
    item.append(list, text('p', `${purchase.spoolCount} bobinas · Total compra ${money(purchase.total)}`, 'total'));
    if (purchase.notes) item.append(text('p', `Notas: ${purchase.notes}`));
    history.append(item);
  }
  if (!spools.length) inventory.append(text('p', 'Las bobinas aparecerán aquí después de guardar una compra.', 'empty'));
  for (const spool of spools) {
    const item = text('article', '', 'saved-item');
    item.append(text('h3', `${spool.material} / ${spool.brand} / ${spool.color}`));
    item.append(text('p', `ID: ${spool.id}`));
    item.append(text('p', `${spool.date} · ${spool.supplier.name} · Peso inicial ${spool.netWeightGrams} g · Precio de adquisición ${money(spool.purchasePrice)}`));
    inventory.append(item);
  }
}

function todayDate() {
  const today = new Date();
  const pad = (number) => String(number).padStart(2, '0');
  return `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
}
field('date').value = todayDate();
appendLine();
render();
preview();
$('#add-line').addEventListener('click', () => { appendLine(); preview(); });
lines.addEventListener('click', (event) => {
  if (event.target.closest('.remove-line') && lines.querySelectorAll('.purchase-line').length > 1) {
    event.target.closest('.purchase-line').remove();
    renumber();
    preview();
  }
});
form.addEventListener('input', () => {
  show($('#purchase-error'), '');
  show($('#purchase-feedback'), '');
  form.querySelectorAll('[aria-invalid]').forEach((input) => input.removeAttribute('aria-invalid'));
  preview();
});
form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (loadError || saving) return;
  let value;
  try { value = mapPurchaseForm(draft()); }
  catch (error) { focusError(error.message); return; }
  const source = repository;
  saving = true; render();
  try {
    const result = await source.purchases.savePurchase(value);
    if (repository !== source) return;
    purchases = [result.record, ...purchases];
    form.reset(); field('date').value = todayDate();
    lines.replaceChildren(); appendLine(); preview();
    show($('#purchase-error'), '');
    show($('#purchase-feedback'), `Compra de prueba ${result.record.id} guardada en tu cuenta. Formulario limpio para evitar duplicados.`);
    render();
    try {
      const [latestPurchases, latestSpools] = await Promise.all([
        source.purchases.listPurchases(), source.purchases.listSpools(),
      ]);
      if (repository !== source) return;
      purchases = latestPurchases; spools = latestSpools; refreshWarning = ''; render();
    } catch {
      if (repository === source) {
        refreshWarning = 'Compra guardada; no se pudo actualizar el historial o las bobinas. Recarga para reintentar.';
        show($('#purchase-feedback'), `Compra de prueba ${result.record.id} guardada en tu cuenta; no se pudo actualizar el historial o las bobinas. Recarga para reintentar.`);
        render();
      }
    }
  } catch (error) {
    if (repository === source) focusError(`${error.message || 'No se pudo guardar la compra.'} Comprueba la conexión y recarga para reintentar.`);
  } finally { if (repository === source) { saving = false; render(); } }
});
window.addEventListener('pageshow', event => { if (event.persisted) window.location.reload(); });
await protectPage({ onClear: () => {
  repository = null; purchases = []; spools = []; loadError = 'Comprobando acceso remoto…'; refreshWarning = ''; saving = false;
  form.reset(); field('date').value = todayDate();
  lines.replaceChildren(); appendLine(); show($('#purchase-feedback'), ''); render();
}, onReady: async ({ client, session }, isCurrent) => {
  const source = createRemoteRepositories(client, session);
  try {
    const [loadedPurchases, loadedSpools] = await Promise.all([source.purchases.listPurchases(), source.purchases.listSpools()]);
    if (!isCurrent()) return;
    repository = source; purchases = loadedPurchases; spools = loadedSpools;
    loadError = ''; render();
  } catch {
    if (!isCurrent()) return;
    loadError = 'No se pudieron leer las compras. Comprueba la conexión y recarga para reintentar.'; render();
  }
} });
