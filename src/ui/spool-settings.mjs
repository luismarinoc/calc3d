import { validateSpoolProfile } from '../domain/spool-profiles.mjs';
import { filamentMaterials } from './filament-materials.mjs';
import { orderSpoolsForDisplay } from './spool-order.mjs';
import { createBrandProfilePicker } from './brand-profile-picker.mjs';
import { presentSpools } from './brand-display.mjs';
import { normalizeBrandName } from '../domain/brands.mjs';
import { createFilamentSample } from './filament-color.mjs';

/** Independent settings panel; the caller owns the protected-page lifecycle. */
export function createSpoolSettings() {
  const select = document.querySelector('#spool-profile');
  const picker = createBrandProfilePicker(select, { filamentFirst: true });
  const form = document.querySelector('#spool-form');
  const feedback = document.querySelector('#spool-feedback');
  const failure = document.querySelector('#spool-error');
  const edit = document.querySelector('#edit-spool');
  const archive = document.querySelector('#archive-spool');
  const add = document.querySelector('#new-spool');
  const actions = [select, edit, add, archive, ...form.elements];
  const labels = { name: 'nombre', material: 'material', purchasePrice: 'precio de compra', netWeightGrams: 'peso neto' };
  const brandField = form.elements.namedItem('brandId');
  const filamentField = form.elements.namedItem('filamentColor');
  const preview = document.querySelector('#spool-filament-preview');
  function renderFilamentPreview(item = {}) {
    preview.replaceChildren(createFilamentSample(item, { compact: true }));
  }
  for (const material of filamentMaterials) document.querySelector('#spool-materials').append(new Option(material, material));
  let source = null;
  let profiles = null;
  let brands = [];
  let editing = null;
  let pending = false;
  let ownerKey = null;
  let admin = false;
  const commonTarget = item => item?.commonTarget ?? (item?.source === 'base' ?
    { id: item.id.slice(5), baseRevision: item.baseRevision } : null);
  function controls(selectedId) {
    failure.hidden = profiles !== null || !failure.textContent;
    for (const control of actions) control.disabled = profiles === null || pending || (control !== select && !admin);
    form.hidden = !admin;
    add.hidden = edit.hidden = !admin;
    select.replaceChildren();
    if (!profiles) { picker.render([], true); return; }
    const active = profiles.filter(item => !item.archivedAt);
    select.add(new Option(active.length ? 'Elige una presentación' : 'Todavía no hay bobinas guardadas', ''));
    const ordered = orderSpoolsForDisplay(presentSpools(active, brands));
    for (const item of ordered) select.add(new Option(item.label, item.id));
    select.value = active.some(item => item.id === selectedId) ? selectedId : '';
    picker.render(ordered, pending);
    edit.disabled = pending || !admin || !select.value;
    const selected = active.find(item => item.id === select.value);
    archive.hidden = !admin || !selected || !!commonTarget(selected);
    archive.disabled = pending || !admin || !selected || !!commonTarget(selected);
    if (!active.length && !feedback.textContent) feedback.textContent = admin ?
      'Agrega una bobina al catálogo común para que todos puedan usarla.' : 'Todavía no hay bobinas disponibles en el catálogo común.';
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
    renderFilamentPreview(item);
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
  add.addEventListener('click', () => {
    if (!admin || !source || pending) return;
    clearError(); editing = null; controls(''); populate(); form.elements.namedItem('name').focus();
  });
  select.addEventListener('change', () => controls(select.value));
  edit.addEventListener('click', () => {
    const item = profiles?.find(profile => profile.id === select.value);
    if (!admin || pending || !item) return;
    clearError(); editing = item; populate(item); form.elements.namedItem('name').focus();
  });
  archive.addEventListener('click', async () => {
    const item = profiles?.find(profile => profile.id === select.value && !profile.archivedAt);
    if (!admin || !source || pending || !item || commonTarget(item)) return;
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
        const loaded = await current.sharedCatalog.list();
        if (source !== current) return;
        profiles = loaded.profiles;
      } catch {
        if (source === current) feedback.textContent = 'Bobina quitada de las listas. No se pudo actualizar la lista; recarga para reintentar.';
      }
    } catch (error) { if (source === current) report(error.message); }
    finally { if (source === current) { pending = false; controls(profiles?.find(profile => !profile.archivedAt)?.id); } }
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!admin || !source || profiles === null || pending) return;
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
    // The read-only representation never assigns or rewrites stored color metadata.
    input.filamentColor = editing?.filamentColor ?? '';
    input.filamentColorHex = editing?.filamentColorHex ?? null;
    try { validateSpoolProfile(input); }
    catch (error) {
      const key = Object.keys(labels).find(key => error.message.toLowerCase().includes(labels[key])) ?? 'name';
      report(error.message, form.elements.namedItem(key)); return;
    }
    const target = commonTarget(editing);
    const commonFields = Object.fromEntries(Object.keys(labels).map(key => [key, input[key]]));
    commonFields.brand = input.brand;
    if (target && Object.entries(commonFields).every(([key, value]) => editing[key] === value)) {
      feedback.textContent = 'No hay cambios para guardar en el catálogo común.';
      return;
    }
    const current = source;
    const selectedId = select.value;
    pending = true; controls(selectedId);
    try {
      const result = target ? await current.sharedCatalog.update(target.id, commonFields, target.baseRevision) :
        editing ? await current.spoolProfiles.updateProfile(editing.id, input, editing.revision) :
          await current.sharedCatalog.create(commonFields);
      if (source !== current) return;
      // The RPC acknowledgment remains visible if the subsequent list refresh fails.
      editing = target && editing.source !== 'base' ? { ...editing, ...result,
        id: editing.id, commonTarget: { id: target.id, baseRevision: result.baseRevision } } :
        target || !editing ? { ...editing, ...result, source: 'base', archivedAt: null } : result.profile;
      profiles = [...profiles.filter(item => item.id !== editing.id), editing];
      feedback.textContent = target || !result.profile ? 'Bobina guardada en el catálogo común.' : 'Bobina guardada en tu cuenta.';
      controls(editing.id);
      try { sessionStorage.setItem(ownerKey, editing.id); } catch { /* Selection memory is optional. */ }
      try {
        const loaded = await current.sharedCatalog.list();
        if (source !== current) return;
        const confirmed = loaded.profiles.find(item => item.id === editing.id);
        if (!confirmed) throw new Error('La lista no incluye la bobina guardada.');
        profiles = loaded.profiles;
        editing = confirmed;
      } catch {
        if (source === current) feedback.textContent = 'Bobina guardada. No se pudo actualizar la lista; recarga para reintentar.';
      }
    } catch (error) { if (source === current) report(error.code === '40001'
      ? 'La bobina común cambió; recarga antes de guardar.' : error.message); }
    finally { if (source === current) { pending = false; controls(editing?.id ?? selectedId); } }
  });
  function clear() {
    source = null; profiles = null; editing = null; admin = false; pending = false; ownerKey = null;
    form.reset();
    brands = []; populate(); feedback.textContent = ''; failure.textContent = 'Comprobando acceso remoto…'; controls();
  }
  async function load(repository, session, isCurrent, role) {
    const current = repository;
    source = current; admin = role === 'admin';
    ownerKey = `calc3d-spool-selection:${session.user.id}`;
    try {
      const loaded = await current.sharedCatalog.list();
      if (!isCurrent() || source !== current) return;
      profiles = loaded.profiles; failure.textContent = '';
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
