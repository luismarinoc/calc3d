/** Native select owns the selection identity; this view renders only detached presentation data. */
export function createBrandProfilePicker(select, {
  root = document.querySelector('.spool-picker'), listId = 'spool-picker-list',
  label = 'Presentación guardada', listLabel = 'Presentaciones guardadas',
  formatRow = item => `${item.material} · ${item.brand?.trim() || 'Sin marca'} · ${item.name}${item.filamentColor ? ` · ${item.filamentColor}` : ''}`,
} = {}) {
  const trigger = document.createElement('button');
  trigger.type = 'button'; trigger.className = 'spool-picker-trigger';
  trigger.setAttribute('aria-label', label);
  trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.setAttribute('aria-controls', listId);
  const list = document.createElement('div');
  list.id = listId; list.className = 'spool-picker-list';
  list.setAttribute('role', 'listbox'); list.setAttribute('aria-label', listLabel);
  list.hidden = true;
  root.append(trigger, list);
  root.classList.add('spool-picker-enhanced');
  let rows = [];
  let items = [];
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
  function chip(kind, name, color) {
    const node = document.createElement('span');
    node.className = `${kind}-chip`;
    node.title = `${kind === 'brand' ? 'Marca' : 'Filamento'}: ${name}`;
    node.setAttribute('aria-hidden', 'true');
    if (color) node.style.backgroundColor = color;
    else node.classList.add(`${kind}-chip-neutral`);
    return node;
  }
  function decorate(node, item, text) {
    node.append(chip('brand', item.brand || 'Sin marca', item.brandColor), document.createTextNode(text));
    if (item.filamentColorHex) node.append(chip('filament', item.filamentColor, item.filamentColorHex));
  }
  function renderSelection() {
    trigger.replaceChildren();
    const selected = items.find(item => item.id === select.value);
    if (selected) decorate(trigger, selected, formatRow(selected));
    else {
      const option = select.selectedOptions[0] ?? select.options[0];
      if (option?.value) trigger.append(chip('brand', 'Sin marca', null), document.createTextNode(option.textContent));
      else trigger.textContent = option?.textContent ?? 'Elige una presentación';
    }
    trigger.setAttribute('aria-label', `${label}: ${trigger.textContent}${selected ? `; Marca: ${selected.brand || 'Sin marca'}; Filamento: ${selected.filamentColor || 'sin color indicado'}` : ''}`);
    for (const row of rows) row.setAttribute('aria-selected', String(row.dataset.id === select.value));
  }
  function render(next, disabled) {
    close(); list.replaceChildren(); rows = []; items = [...next];
    for (const item of items) {
      const row = document.createElement('div');
      row.className = 'spool-picker-option'; row.setAttribute('role', 'option'); row.tabIndex = -1;
      row.dataset.id = item.id;
      row.setAttribute('aria-label', `${formatRow(item)}; Marca: ${item.brand || 'Sin marca'}; Filamento: ${item.filamentColor || 'sin color indicado'}`);
      decorate(row, item, formatRow(item));
      row.addEventListener('click', () => choose(row));
      list.append(row); rows.push(row);
    }
    trigger.disabled = disabled || !rows.length;
    renderSelection();
  }
  return { render, close, sync: renderSelection };
}
