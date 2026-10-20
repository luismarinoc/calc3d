import { createPurchaseStore } from './data/purchases.mjs';
import { mapPurchaseForm } from './ui/purchase-form.mjs';

const $ = (selector, root = document) => root.querySelector(selector);
const form = $('#purchase-form');
const lines = $('#purchase-lines');
const store = createPurchaseStore({
  getItem: (key) => window.localStorage.getItem(key),
  setItem: (key, value) => window.localStorage.setItem(key, value),
});
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
  if (store.error) {
    show($('#storage-error'), `${store.error} Corrige el almacenamiento y recarga esta página.`);
    $('#purchase-save').disabled = true;
    return;
  }
  show($('#storage-error'), '');
  const purchases = store.listPurchases();
  const spools = store.listSpools();
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

field('date').value = (() => {
  const today = new Date();
  const pad = (number) => String(number).padStart(2, '0');
  return `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
})();
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
form.addEventListener('submit', (event) => {
  event.preventDefault();
  if (store.error) return;
  let value;
  try { value = mapPurchaseForm(draft()); }
  catch (error) { focusError(error.message); return; }
  const result = store.savePurchase(value);
  if (!result.ok) {
    focusError(`${result.error} ${/otra pestaña/.test(result.error) ? 'Recarga esta página antes de volver a guardar.' : ''}`.trim());
    return;
  }
  show($('#purchase-error'), '');
  render();
  form.reset();
  field('date').value = (() => { const now = new Date(); const p = (n) => String(n).padStart(2, '0'); return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`; })();
  lines.replaceChildren();
  appendLine();
  preview();
  show($('#purchase-feedback'), 'Compra de prueba guardada solo en este navegador. Formulario limpio para evitar duplicados; completa otra compra si quieres guardar nuevamente.');
});
