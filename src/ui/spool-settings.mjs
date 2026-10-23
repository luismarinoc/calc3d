import { validateSpoolProfile } from '../domain/spool-profiles.mjs';
import { filamentMaterials } from './filament-materials.mjs';
import { orderSpoolsForDisplay } from './spool-order.mjs';
import { createBrandProfilePicker } from './brand-profile-picker.mjs';
import { presentSpools } from './brand-display.mjs';
import { normalizeBrandName } from '../domain/brands.mjs';

/** Independent settings panel; the caller owns the protected-page lifecycle. */
export function createSpoolSettings() {
  const select = document.querySelector('#spool-profile');
  const picker = createBrandProfilePicker(select);
  const form = document.querySelector('#spool-form');
  const feedback = document.querySelector('#spool-feedback');
  const failure = document.querySelector('#spool-error');
  const edit = document.querySelector('#edit-spool');
  const archive = document.querySelector('#archive-spool');
  const actions = [select, edit, document.querySelector('#new-spool'), archive, ...form.elements];
  const labels = { name: 'nombre', material: 'material', purchasePrice: 'precio de compra', netWeightGrams: 'peso neto' };
  const brandField = form.elements.namedItem('brandId');
  const filamentField = form.elements.namedItem('filamentColor');
  const sample = document.querySelector('#spool-showSample');
  const hexField = form.elements.namedItem('filamentColorHex');
  sample.addEventListener('change', () => { hexField.disabled = !sample.checked; });
  for (const material of filamentMaterials) document.querySelector('#spool-materials').append(new Option(material, material));
  let source = null;
  let profiles = null;
  let brands = [];
  let editing = null;
  let pending = false;
  let ownerKey = null;
  function controls(selectedId) {
    failure.hidden = profiles !== null || !failure.textContent;
    for (const control of actions) control.disabled = profiles === null || pending;
    hexField.disabled = profiles === null || pending || !sample.checked;
    select.replaceChildren();
    if (!profiles) { picker.render([], true); return; }
    const active = profiles.filter(item => !item.archivedAt);
    select.add(new Option(active.length ? 'Elige una presentación' : 'Todavía no hay bobinas guardadas', ''));
    const ordered = orderSpoolsForDisplay(presentSpools(active, brands));
    for (const item of ordered) select.add(new Option(item.label, item.id));
    select.value = active.some(item => item.id === selectedId) ? selectedId : '';
    picker.render(ordered, pending);
    edit.disabled = archive.disabled = pending || !select.value;
    if (!active.length && !feedback.textContent) feedback.textContent = 'Agrega una bobina para guardar su precio y peso neto.';
  }
  function clearError() {
    feedback.textContent = '';
    for (const field of form.querySelectorAll('[aria-invalid]')) {
      field.removeAttribute('aria-invalid'); field.removeAttribute('aria-describedby');
    }
  }
  function report(message, field) {
    feedback.textContent = message;
    if (field) {
      field.setAttribute('aria-invalid', 'true'); field.setAttribute('aria-describedby', 'spool-feedback'); field.focus();
    }
  }
  function populate(item = {}) {
    for (const key of Object.keys(labels)) form.elements.namedItem(key).value = item[key] ?? '';
    brandField.replaceChildren(new Option('Sin marca', ''));
    for (const brand of brands) if (!brand.archivedAt) brandField.add(new Option(brand.name, brand.id));
    if (item.brandId && brands.some(brand => brand.id === item.brandId && brand.archivedAt)) {
      brandField.add(new Option(`${brands.find(brand => brand.id === item.brandId).name} · marca quitada`, item.brandId));
    }
    const matched = item.brandId ? brands.find(brand => brand.id === item.brandId) :
      brands.find(brand => brand.aliases.includes(normalizeBrandName(item.brand ?? '')));
    if (matched) brandField.value = matched.id;
    else if (item.brand) {
      brandField.add(new Option(`Marca anterior: ${item.brand}`, 'legacy'));
      brandField.value = 'legacy';
    }
    filamentField.value = item.filamentColor ?? '';
    sample.checked = !!item.filamentColorHex;
    hexField.value = item.filamentColorHex ?? '#565c59';
    hexField.disabled = !sample.checked;
  }
  function setBrands(next) {
    brands = [...next];
    const selectedBrand = brandField.value;
    const legacyText = brandField.querySelector('[value="legacy"]')?.textContent;
    brandField.replaceChildren(new Option('Sin marca', ''));
    for (const brand of brands) if (!brand.archivedAt) brandField.add(new Option(brand.name, brand.id));
    if (selectedBrand === 'legacy' && legacyText) brandField.add(new Option(legacyText, 'legacy'));
    if (editing?.brandId === selectedBrand && brands.some(brand => brand.id === selectedBrand && brand.archivedAt)) {
      brandField.add(new Option(`${brands.find(brand => brand.id === selectedBrand).name} · marca quitada`, selectedBrand));
    }
    brandField.value = [...brandField.options].some(option => option.value === selectedBrand) ? selectedBrand : '';
    controls(select.value);
  }
  document.querySelector('#new-spool').addEventListener('click', () => {
    clearError(); editing = null; controls(''); populate(); form.elements.namedItem('name').focus();
  });
  select.addEventListener('change', () => { edit.disabled = archive.disabled = !select.value; });
  edit.addEventListener('click', () => {
    const item = profiles?.find(profile => profile.id === select.value);
    if (!item) return;
    clearError(); editing = item; populate(item); form.elements.namedItem('name').focus();
  });
  archive.addEventListener('click', async () => {
    const item = profiles?.find(profile => profile.id === select.value && !profile.archivedAt);
    if (!source || pending || !item) return;
    if (!window.confirm(`¿Quitar la bobina «${item.name}» de las listas? Se conservarán compras, precios y cálculos guardados. No se puede restaurar desde esta página.`)) return;
    const current = source;
    pending = true; clearError(); controls(item.id);
    try {
      const result = await current.spoolProfiles.archiveProfile(item.id, item.revision);
      if (source !== current) return;
      profiles = profiles.map(profile => profile.id === item.id ? result.profile : profile);
      editing = null; populate();
      const fallback = profiles.find(profile => !profile.archivedAt)?.id ?? '';
      try { if (sessionStorage.getItem(ownerKey) === item.id) sessionStorage.removeItem(ownerKey); } catch { /* Selection memory is optional. */ }
      feedback.textContent = 'Bobina quitada de las listas. Se conserva el historial.';
      controls(fallback);
      try {
        const loaded = await current.spoolProfiles.list();
        if (source !== current) return;
        profiles = loaded;
      } catch {
        if (source === current) feedback.textContent = 'Bobina quitada de las listas. No se pudo actualizar la lista; recarga para reintentar.';
      }
    } catch (error) { if (source === current) report(error.message); }
    finally { if (source === current) { pending = false; controls(profiles?.find(profile => !profile.archivedAt)?.id); } }
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!source || profiles === null || pending) return;
    clearError();
    const input = {};
    for (const key of Object.keys(labels)) {
      const field = form.elements.namedItem(key);
      if (key === 'purchasePrice' || key === 'netWeightGrams') {
        if (!field.value.trim()) { report(`Ingresa un valor válido para ${labels[key]}.`, field); return; }
        input[key] = Number(field.value);
      } else input[key] = field.value;
    }
    if (brandField.value === 'legacy' && editing) input.brand = editing.brand;
    else { input.brandId = brandField.value || null; input.brand = brands.find(brand => brand.id === brandField.value)?.name ?? ''; }
    input.filamentColor = filamentField.value;
    input.filamentColorHex = sample.checked ? hexField.value : null;
    if (sample.checked && !filamentField.value.trim()) { report('El color representativo del filamento requiere un nombre.', filamentField); return; }
    try { validateSpoolProfile(input); }
    catch (error) {
      const key = Object.keys(labels).find(key => error.message.toLowerCase().includes(labels[key])) ?? 'name';
      report(error.message, form.elements.namedItem(key)); return;
    }
    const current = source;
    const selectedId = select.value;
    pending = true; controls(selectedId);
    try {
      const result = editing
        ? await current.spoolProfiles.updateProfile(editing.id, input, editing.revision)
        : await current.spoolProfiles.createProfile(input);
      if (source !== current) return;
      // The validated RPC response is the commit acknowledgment. A later read cannot undo it.
      editing = result.profile;
      profiles = [...profiles.filter(item => item.id !== editing.id), editing];
      feedback.textContent = 'Bobina guardada en tu cuenta.';
      controls(editing.id);
      try { sessionStorage.setItem(ownerKey, editing.id); } catch { /* Selection memory is optional. */ }
      try {
        const loaded = await current.spoolProfiles.list();
        if (source !== current) return;
        const confirmed = loaded.find(item => item.id === editing.id);
        if (!confirmed) throw new Error('La lista no incluye la bobina guardada.');
        profiles = loaded;
        editing = confirmed;
      } catch {
        if (source === current) feedback.textContent = 'Bobina guardada en tu cuenta. No se pudo actualizar la lista; recarga para reintentar.';
      }
    } catch (error) { if (source === current) report(error.message); }
    finally { if (source === current) { pending = false; controls(editing?.id ?? selectedId); } }
  });
  function clear() {
    source = null; profiles = null; editing = null; pending = false; ownerKey = null;
    form.reset(); sample.checked = false; hexField.disabled = true; hexField.value = '#565c59';
    brands = []; populate(); feedback.textContent = ''; failure.textContent = 'Comprobando acceso remoto…'; controls();
  }
  async function load(repository, session, isCurrent) {
    const current = repository;
    source = current;
    ownerKey = `calc3d-spool-selection:${session.user.id}`;
    try {
      const loaded = await current.spoolProfiles.list();
      if (!isCurrent() || source !== current) return;
      profiles = loaded; failure.textContent = '';
      let remembered = null;
      try { remembered = sessionStorage.getItem(ownerKey); } catch { /* Selection memory is optional. */ }
      controls(remembered);
    } catch {
      if (!isCurrent() || source !== current) return;
      profiles = null; failure.textContent = 'No se pudieron leer las bobinas. Comprueba la conexión y recarga para reintentar.'; controls();
    }
  }
  clear();
  return { clear, load, setBrands };
}
