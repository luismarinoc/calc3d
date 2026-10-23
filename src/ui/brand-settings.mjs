import { validateBrand } from '../domain/brands.mjs';

/** Owner-scoped maintainer; only explicit form submit writes. */
export function createBrandSettings(onChange) {
  const section = document.querySelector('#brand-heading').closest('section');
  const select = section.querySelector('#brand-saved');
  const form = section.querySelector('#brand-form');
  const name = form.elements.namedItem('name');
  const color = form.elements.namedItem('color');
  const feedback = section.querySelector('#brand-feedback');
  const failure = section.querySelector('#brand-error');
  const edit = section.querySelector('#edit-brand');
  const fresh = section.querySelector('#new-brand');
  let source = null;
  let brands = null;
  let editing = null;
  let pending = false;
  const snapshot = () => brands ? [...brands] : [];
  function controls(selected = '') {
    select.replaceChildren(new Option('Nueva marca', ''));
    for (const brand of brands ?? []) select.add(new Option(brand.name, brand.id));
    select.value = brands?.some(brand => brand.id === selected) ? selected : '';
    for (const control of [select, edit, fresh, ...form.elements]) control.disabled = brands === null || pending;
    edit.disabled = brands === null || pending || !select.value;
    failure.hidden = brands !== null || !failure.textContent;
  }
  function resetForm() { form.reset(); color.value = '#565c59'; editing = null; }
  function report(message, field) {
    feedback.textContent = message;
    if (field) { field.setAttribute('aria-invalid', 'true'); field.setAttribute('aria-describedby', 'brand-feedback'); field.focus(); }
  }
  function clearError() {
    feedback.textContent = '';
    for (const field of form.querySelectorAll('[aria-invalid]')) { field.removeAttribute('aria-invalid'); field.removeAttribute('aria-describedby'); }
  }
  fresh.addEventListener('click', () => { clearError(); resetForm(); select.value = ''; name.focus(); });
  select.addEventListener('change', () => { edit.disabled = !select.value; });
  edit.addEventListener('click', () => {
    const brand = brands?.find(item => item.id === select.value);
    if (!brand) return;
    clearError(); editing = brand; name.value = brand.name; color.value = brand.color ?? '#565c59'; name.focus();
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!source || !brands || pending) return;
    clearError();
    let input;
    try { input = validateBrand({ name: name.value, color: color.value }); }
    catch (error) { report(error.message, name); return; }
    const current = source;
    const selected = select.value;
    pending = true; controls(selected);
    try {
      const result = editing
        ? await current.brands.updateBrand(editing.id, input, editing.revision)
        : await current.brands.createBrand(input);
      if (source !== current) return;
      editing = result.brand;
      brands = [...brands.filter(item => item.id !== result.brand.id), result.brand];
      name.value = result.brand.name; color.value = result.brand.color;
      feedback.textContent = 'Marca guardada en tu cuenta.';
      controls(result.brand.id); onChange(snapshot());
      try {
        const loaded = await current.brands.list();
        if (source !== current) return;
        if (!loaded.some(item => item.id === editing.id)) throw new Error('La lista no incluye la marca guardada.');
        brands = loaded; editing = loaded.find(item => item.id === editing.id);
        onChange(snapshot());
      } catch {
        if (source === current) feedback.textContent = 'Marca guardada en tu cuenta. No se pudo actualizar la lista; recarga para reintentar.';
      }
    } catch (error) { if (source === current) report(error.message); }
    finally { if (source === current) { pending = false; controls(editing?.id ?? selected); } }
  });
  function clear() {
    source = null; brands = null; editing = null; pending = false;
    resetForm(); select.replaceChildren(); clearError(); failure.textContent = 'Comprobando acceso remoto…'; controls();
    onChange([]);
  }
  async function load(repository, isCurrent) {
    const current = repository;
    source = current;
    try {
      const loaded = await current.brands.list();
      if (!isCurrent() || source !== current) return;
      brands = loaded; failure.textContent = ''; controls(loaded[0]?.id); onChange(snapshot());
    } catch {
      if (!isCurrent() || source !== current) return;
      brands = null; failure.textContent = 'No se pudieron leer las marcas. Comprueba la conexión y recarga para reintentar.'; controls(); onChange([]);
    }
  }
  clear();
  return { clear, load, snapshot };
}
