import { presentSpools } from './brand-display.mjs';
import { canonicalMaterial } from '../domain/materials.mjs';

/** Read-only page. Filter locally; every explicit refresh rechecks the current owner. */
export function createSpoolConsultation() {
  const search = document.querySelector('#consultation-search');
  const brand = document.querySelector('#consultation-brand');
  const material = document.querySelector('#consultation-material');
  const color = document.querySelector('#consultation-color');
  const sort = document.querySelector('#consultation-sort');
  const list = document.querySelector('#consultation-list');
  const status = document.querySelector('#consultation-status');
  const refresh = document.querySelector('#consultation-refresh');
  const reset = document.querySelector('#consultation-clear');
  const controls = [search, brand, material, color, sort, refresh, reset];
  const clp = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 0 });
  const weight = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 2 });
  const collator = new Intl.Collator('es-CL', { sensitivity: 'base', numeric: true });
  const key = text => String(text ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es-CL');
  let source = null;
  let isCurrent = () => false;
  let generation = 0;
  let items = [];
  const searchIndex = new Map();
  const rowCache = new Map();
  const ordered = new Map();
  let paintVersion = 0;
  let paintFrame = 0;
  let loading = false;
  let error = false;
  const option = (label, value) => new Option(label, value);
  function resetFilters() {
    search.value = '';
    brand.replaceChildren(option('Todas las marcas', ''));
    material.replaceChildren(option('Todos los materiales', ''));
    color.replaceChildren(option('Todos los colores', ''));
    sort.value = 'name';
  }
  function setOptions(selectedBrand = brand.value, selectedMaterial = material.value, selectedColor = color.value) {
    const brands = new Map();
    const materials = new Map();
    const colors = new Map();
    // Each facet honors the other two, allowing selection in either direction.
    for (const item of items) {
      const label = String(item.filamentColor ?? '').trim();
      const colorKey = searchIndex.get(item).color;
      const matchesBrand = !selectedBrand || item.brand === selectedBrand;
      const matchesMaterial = !selectedMaterial || item.material === selectedMaterial;
      const matchesColor = !selectedColor || colorKey === selectedColor;
      if (matchesMaterial && matchesColor && item.brand) brands.set(item.brand, item.brand);
      if (matchesBrand && matchesColor && item.material) materials.set(item.material, item.material);
      if (matchesBrand && matchesMaterial && label && !colors.has(colorKey)) colors.set(colorKey, label);
    }
    const populate = (control, all, choices, selected) => {
      // A refresh may remove a combination. Only the user clears their selection.
      if (selected && !choices.has(selected)) choices.set(selected,
        control.value === selected ? control.selectedOptions[0].textContent : selected);
      const options = [...choices].sort((a, b) => collator.compare(a[1], b[1]));
      control.replaceChildren(option(all, ''), ...options.map(([value, label]) => option(label, value)));
      control.value = selected;
    };
    populate(brand, 'Todas las marcas', brands, selectedBrand);
    populate(material, 'Todos los materiales', materials, selectedMaterial);
    populate(color, 'Todos los colores', colors, selectedColor);
  }
  function cancelPaint() {
    paintVersion++;
    if (paintFrame) cancelAnimationFrame(paintFrame);
    paintFrame = 0;
    list.removeAttribute('aria-busy');
  }
  function clearCaches() {
    searchIndex.clear(); rowCache.clear(); ordered.clear();
  }
  function rowFor(item) {
    if (rowCache.has(item)) return rowCache.get(item);
    const pending = item.kind === 'pending-reference';
    const row = document.createElement('li'); row.className = 'consultation-row';
    const details = document.createElement('div'); details.className = 'consultation-details';
    const brandLabel = document.createElement('span'); brandLabel.className = 'consultation-brand-label';
    brandLabel.textContent = item.brand || 'Sin marca';
    if (item.brandColor) brandLabel.style.setProperty('--brand-color', item.brandColor);
    const title = document.createElement('strong'); title.textContent = item.name;
    const description = document.createElement('span');
    description.textContent = [item.material, item.filamentColor,
      pending ? 'Peso por confirmar' : `${weight.format(item.netWeightGrams)} g`].filter(Boolean).join(' · ');
    details.append(brandLabel, title, description);
    const purchase = document.createElement('div'); purchase.className = 'consultation-purchase';
    const value = document.createElement('strong');
    value.textContent = pending ? item.referencePriceClp === null ? 'Sin precio publicado' :
      `CLP ${clp.format(item.referencePriceClp)}` : `CLP ${clp.format(item.purchasePrice)}`;
    const label = document.createElement('span'); label.textContent = pending ? 'Precio de referencia' : 'Presentación';
    purchase.append(value, label);
    const comparison = document.createElement('div'); comparison.className = 'consultation-comparison';
    const ratio = document.createElement('strong');
    ratio.textContent = pending ? 'No cotizable' : `CLP ${clp.format(item.purchasePrice * 1000 / item.netWeightGrams)}/kg`;
    const ratioLabel = document.createElement('span'); ratioLabel.textContent = pending ? 'Peso por confirmar' : 'Comparación por kg';
    comparison.append(ratio, ratioLabel);
    const origin = document.createElement('div'); origin.className = 'consultation-origin';
    if (item.sourceUrl) {
      const link = document.createElement('a'); link.className = 'consultation-product-link';
      link.href = item.sourceUrl; link.target = '_blank'; link.rel = 'noopener noreferrer';
      link.textContent = 'Ver producto'; link.setAttribute('aria-label', `Ver producto: ${item.name}`);
      origin.append(link);
    } else {
      const missing = document.createElement('span'); missing.textContent = 'Sin enlace de origen'; origin.append(missing);
    }
    row.append(details, purchase, comparison, origin);
    rowCache.set(item, row);
    return row;
  }
  function orderedItems() {
    const mode = sort.value;
    if (!ordered.has(mode)) {
      const price = item => item.kind === 'pending-reference' ? item.referencePriceClp ?? -1 : item.purchasePrice;
      ordered.set(mode, [...items].sort((a, b) =>
        (mode === 'price-asc' ? price(a) - price(b) : mode === 'price-desc' ? price(b) - price(a) : 0) ||
        collator.compare(a.name, b.name) || collator.compare(a.id, b.id)));
    }
    return ordered.get(mode);
  }
  function render() {
    cancelPaint();
    if (loading || error || !items.length) {
      list.replaceChildren();
      status.textContent = loading ? 'Cargando bobinas…' : error ?
        'No se pudieron leer las bobinas. Usá Actualizar lista para reintentar.' : 'Todavía no hay bobinas guardadas.';
      return;
    }
    const query = key(search.value.trim());
    const visible = orderedItems().filter(item => (!brand.value || item.brand === brand.value) &&
      (!material.value || item.material === material.value) &&
      (!color.value || searchIndex.get(item).color === color.value) && searchIndex.get(item).text.includes(query));
    const message = visible.length ? `${visible.length} de ${items.length} presentaciones` :
      'No hay bobinas que coincidan con la búsqueda. Cambiá el texto o limpiá los filtros.';
    const version = paintVersion;
    let cursor = 0;
    // Yield between small paints so typing never rebuilds the complete list synchronously.
    const paint = () => {
      if (version !== paintVersion) return;
      paintFrame = 0;
      if (!isCurrent()) { clear(); return; }
      if (cursor === 0) {
        list.replaceChildren(); status.textContent = message; list.setAttribute('aria-busy', 'true');
      }
      const fragment = document.createDocumentFragment();
      const end = Math.min(cursor + 32, visible.length);
      for (; cursor < end; cursor++) fragment.append(rowFor(visible[cursor]));
      list.append(fragment);
      if (cursor < visible.length) paintFrame = requestAnimationFrame(paint);
      else list.setAttribute('aria-busy', 'false');
    };
    paintFrame = requestAnimationFrame(paint);
  }
  function clear() {
    cancelPaint(); clearCaches();
    generation++; source = null; isCurrent = () => false; items = []; loading = false; error = false;
    list.replaceChildren(); resetFilters(); controls.forEach(control => { control.disabled = true; });
    status.textContent = 'Comprobando acceso…';
  }
  async function load(repository, current, preserveFilters = false) {
    source = repository; isCurrent = current;
    const token = ++generation;
    const previous = preserveFilters ? [brand.value, material.value, color.value] : ['', '', ''];
    if (!preserveFilters) resetFilters();
    clearCaches();
    items = []; loading = true; error = false;
    controls.forEach(control => { control.disabled = true; }); render();
    try {
      const [profiles, references, brands] = await Promise.all([
        repository.spoolProfiles.list(), repository.supplierReferences.list(), repository.brands.list()]);
      if (token !== generation || source !== repository || !current()) return;
      items = presentSpools([...profiles.filter(profile => !profile.archivedAt), ...references], brands)
        .map(item => ({ ...item, material: canonicalMaterial(item.material) }));
      for (const item of items) searchIndex.set(item, {
        text: key([item.brand, item.material, item.name, item.filamentColor, item.supplierSku].join(' ')),
        color: key(item.filamentColor?.trim()),
      });
      setOptions(...previous);
    } catch {
      if (token !== generation || source !== repository || !current()) return;
      items = []; error = true;
    } finally {
      if (token === generation && source === repository && current()) {
        loading = false; controls.forEach(control => { control.disabled = false; }); render();
      }
    }
  }
  for (const control of [brand, material, color]) control.addEventListener('change', () => { setOptions(); render(); });
  search.addEventListener('input', render);
  sort.addEventListener('change', render);
  reset.addEventListener('click', () => {
    resetFilters(); setOptions(); render(); search.focus();
  });
  refresh.addEventListener('click', () => { if (source && isCurrent()) void load(source, isCurrent, true); });
  clear();
  return { clear, load };
}
