import { presentSpools } from './brand-display.mjs';

/** Detached read-only view; each open performs new authorized reads for the current owner. */
export function createSpoolConsultation() {
  const openButton = document.querySelector('#open-spool-consultation');
  const dialog = document.querySelector('#spool-consultation');
  const closeButton = document.querySelector('#close-spool-consultation');
  const search = document.querySelector('#consultation-search');
  const brand = document.querySelector('#consultation-brand');
  const material = document.querySelector('#consultation-material');
  const sort = document.querySelector('#consultation-sort');
  const list = document.querySelector('#consultation-list');
  const status = document.querySelector('#consultation-status');
  const clp = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 0 });
  const weight = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 2 });
  const collator = new Intl.Collator('es-CL', { sensitivity: 'base', numeric: true });
  let source = null;
  let isCurrent = () => false;
  let generation = 0;
  let items = [];
  let loading = false;
  let error = false;
  const option = (label, value) => new Option(label, value);
  const key = text => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es-CL');

  function render() {
    list.replaceChildren();
    if (loading) { status.textContent = 'Cargando bobinas…'; return; }
    if (error) { status.textContent = 'No se pudieron leer las bobinas. Cierra y vuelve a intentar.'; return; }
    if (!items.length) { status.textContent = 'Todavía no hay bobinas guardadas.'; return; }
    const query = key(search.value.trim());
    const visible = items.filter(item => (!brand.value || item.brand === brand.value) &&
      (!material.value || item.material === material.value) &&
      key([item.brand, item.material, item.name, item.filamentColor].join(' ')).includes(query));
    visible.sort((a, b) => {
      const price = a.purchasePrice - b.purchasePrice;
      return (sort.value === 'price-asc' ? price : sort.value === 'price-desc' ? -price : 0) ||
        collator.compare(a.name, b.name) || collator.compare(a.id, b.id);
    });
    status.textContent = visible.length ? `${visible.length} presentaciones` : 'No hay bobinas que coincidan con la búsqueda.';
    for (const item of visible) {
      const row = document.createElement('li');
      row.className = 'consultation-row';
      const details = document.createElement('div');
      const title = document.createElement('strong');
      title.textContent = `${item.brand || 'Sin marca'} · ${item.name}`;
      const description = document.createElement('span');
      description.textContent = `${item.material}${item.filamentColor ? ` · ${item.filamentColor}` : ''} · ${weight.format(item.netWeightGrams)} g`;
      details.append(title, description);
      const prices = document.createElement('div');
      prices.className = 'consultation-prices';
      const purchase = document.createElement('strong');
      purchase.textContent = `CLP ${clp.format(item.purchasePrice)}`;
      const perKg = document.createElement('span');
      perKg.textContent = `CLP ${clp.format(item.purchasePrice * 1000 / item.netWeightGrams)}/kg`;
      prices.append(purchase, perKg);
      row.append(details, prices);
      list.append(row);
    }
  }
  function close(restoreFocus = true) {
    generation++;
    if (dialog.open) dialog.close();
    items = []; list.replaceChildren(); status.textContent = '';
    if (restoreFocus) openButton.focus();
  }
  function resetFilters() {
    search.value = ''; brand.replaceChildren(option('Todas las marcas', ''));
    material.replaceChildren(option('Todos los materiales', '')); sort.value = 'name';
  }
  openButton.addEventListener('click', async () => {
    if (!source || !isCurrent()) return;
    const current = source;
    const token = ++generation;
    resetFilters();
    items = []; error = false; loading = true;
    dialog.showModal(); search.focus(); render();
    try {
      const [profiles, brands] = await Promise.all([current.spoolProfiles.list(), current.brands.list()]);
      if (token !== generation || source !== current || !isCurrent()) return;
      items = presentSpools(profiles.filter(profile => !profile.archivedAt), brands);
      const usedBrands = [...new Set(items.map(item => item.brand).filter(Boolean))].sort(collator.compare);
      for (const name of usedBrands) brand.add(option(name, name));
      for (const name of [...new Set(items.map(item => item.material))].sort(collator.compare)) material.add(option(name, name));
    } catch {
      if (token !== generation || source !== current || !isCurrent()) return;
      items = []; error = true;
    } finally {
      if (token === generation && source === current && isCurrent()) { loading = false; render(); }
    }
  });
  closeButton.addEventListener('click', () => close());
  // A native Escape fires cancel before closing, so use the same cleanup and focus path.
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
  for (const control of [search, brand, material, sort]) control.addEventListener(control === search ? 'input' : 'change', render);
  function clear() {
    source = null; isCurrent = () => false; openButton.disabled = true;
    close(false); resetFilters(); loading = false; error = false;
  }
  function connect(repository, current) {
    source = repository; isCurrent = current; openButton.disabled = false;
  }
  clear();
  return { clear, connect };
}
