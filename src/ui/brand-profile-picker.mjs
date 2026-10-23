import { brandColors } from './brand-colors.mjs';

/** Native select remains the selection model and no-script fallback; only this view owns its extra nodes. */
export function createBrandProfilePicker(select) {
  const root = document.querySelector('.spool-picker');
  const trigger = document.createElement('button');
  trigger.type = 'button'; trigger.className = 'spool-picker-trigger';
  trigger.setAttribute('aria-label', 'Presentación guardada');
  trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.setAttribute('aria-controls', 'spool-picker-list');
  const list = document.createElement('div');
  list.id = 'spool-picker-list'; list.className = 'spool-picker-list';
  list.setAttribute('role', 'listbox'); list.setAttribute('aria-label', 'Presentaciones guardadas');
  list.hidden = true;
  root.append(trigger, list);
  root.classList.add('spool-picker-enhanced');
  let rows = [];
  const close = () => { list.hidden = true; trigger.setAttribute('aria-expanded', 'false'); };
  const open = (index = 0) => {
    if (trigger.disabled || !rows.length) return;
    list.hidden = false; trigger.setAttribute('aria-expanded', 'true');
    rows[index]?.focus();
  };
  const choose = row => {
    select.value = row.dataset.id;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    close(); trigger.focus();
  };
  trigger.addEventListener('click', () => list.hidden ? open(Math.max(0, rows.findIndex(row => row.dataset.id === select.value))) : close());
  trigger.addEventListener('keydown', event => {
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault(); open(event.key === 'End' || event.key === 'ArrowUp' ? rows.length - 1 : 0);
    }
  });
  list.addEventListener('keydown', event => {
    const index = rows.indexOf(document.activeElement);
    if (event.key === 'Escape') { event.preventDefault(); close(); trigger.focus(); }
    else if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? rows.length - 1 :
        (index + (event.key === 'ArrowDown' ? 1 : -1) + rows.length) % rows.length;
      rows[next]?.focus();
    } else if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); if (rows[index]) choose(rows[index]); }
  });
  document.addEventListener('pointerdown', event => { if (!root.contains(event.target)) close(); });
  root.addEventListener('focusout', event => { if (!root.contains(event.relatedTarget)) close(); });
  select.addEventListener('change', () => renderSelection());
  let colors = new Map();
  function chip(brand) {
    const node = document.createElement('span');
    node.className = 'brand-chip'; node.setAttribute('aria-hidden', 'true');
    const color = colors.get(brand);
    if (color) node.style.backgroundColor = color;
    else node.classList.add('brand-chip-neutral');
    return node;
  }
  function renderSelection() {
    trigger.replaceChildren();
    const selected = rows.find(row => row.dataset.id === select.value);
    if (selected) {
      const brand = selected.dataset.brand;
      trigger.append(chip(brand), document.createTextNode(selected.textContent));
    } else trigger.textContent = select.options[0]?.textContent ?? 'Elige una presentación';
    trigger.setAttribute('aria-label', `Presentación guardada: ${trigger.textContent}`);
    for (const row of rows) row.setAttribute('aria-selected', String(row.dataset.id === select.value));
  }
  function render(items, disabled) {
    close(); list.replaceChildren(); rows = [];
    colors = brandColors(items.map(item => item.brand ?? ''));
    for (const item of items) {
      const row = document.createElement('div');
      row.className = 'spool-picker-option'; row.setAttribute('role', 'option'); row.tabIndex = -1;
      row.dataset.id = item.id; row.dataset.brand = item.brand ?? '';
      row.append(chip(item.brand ?? ''), document.createTextNode(`${item.material} · ${item.brand?.trim() || 'Sin marca'} · ${item.name}`));
      row.addEventListener('click', () => choose(row));
      list.append(row); rows.push(row);
    }
    trigger.disabled = disabled || !rows.length;
    renderSelection();
  }
  return { render, close };
}
