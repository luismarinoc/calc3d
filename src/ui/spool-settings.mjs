import { validateSpoolProfile } from '../domain/spool-profiles.mjs';
import { filamentMaterials } from './filament-materials.mjs';

/** Independent settings panel; the caller owns the protected-page lifecycle. */
export function createSpoolSettings() {
  const select = document.querySelector('#spool-profile');
  const form = document.querySelector('#spool-form');
  const feedback = document.querySelector('#spool-feedback');
  const failure = document.querySelector('#spool-error');
  const actions = [select, document.querySelector('#edit-spool'), document.querySelector('#new-spool'), ...form.elements];
  const labels = { name: 'nombre', material: 'material', brand: 'marca', purchasePrice: 'precio de compra', netWeightGrams: 'peso neto' };
  for (const material of filamentMaterials) document.querySelector('#spool-materials').append(new Option(material, material));
  let source = null;
  let profiles = null;
  let editing = null;
  let pending = false;
  let ownerKey = null;
  function controls(selectedId) {
    failure.hidden = profiles !== null || !failure.textContent;
    for (const control of actions) control.disabled = profiles === null || pending;
    select.replaceChildren();
    if (!profiles) return;
    select.add(new Option(profiles.length ? 'Elige una presentación' : 'Todavía no hay bobinas guardadas', ''));
    for (const item of profiles) select.add(new Option([item.name, item.material, item.brand].filter(Boolean).join(' · '), item.id));
    select.value = profiles.some(item => item.id === selectedId) ? selectedId : '';
    document.querySelector('#edit-spool').disabled = pending || !select.value;
    if (!profiles.length && !feedback.textContent) feedback.textContent = 'Agrega una bobina para guardar su precio y peso neto.';
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
  }
  document.querySelector('#new-spool').addEventListener('click', () => {
    clearError(); editing = null; populate(); form.elements.namedItem('name').focus();
  });
  select.addEventListener('change', () => { document.querySelector('#edit-spool').disabled = !select.value; });
  document.querySelector('#edit-spool').addEventListener('click', () => {
    const item = profiles?.find(profile => profile.id === select.value);
    if (!item) return;
    clearError(); editing = item; populate(item); form.elements.namedItem('name').focus();
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
    form.reset(); feedback.textContent = ''; failure.textContent = 'Comprobando acceso remoto…'; controls();
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
  return { clear, load };
}
