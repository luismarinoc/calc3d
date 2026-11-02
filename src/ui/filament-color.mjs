import { filamentSample } from '../domain/filament-colors.mjs';

/** Render representation, not a manufacturer swatch or a field to save. */
export function createFilamentSample(item, { compact = false } = {}) {
  const sample = filamentSample(item);
  const view = document.createElement('span');
  view.className = `filament-color${compact ? ' filament-color-compact' : ''}`;
  const description = sample.approximate ? 'Muestra aproximada por nombre' : sample.hex ? 'Muestra personalizada' : 'Sin muestra';
  view.title = `Filamento: ${sample.name || 'sin color indicado'} · ${description}`;
  if (sample.hex) {
    const chip = document.createElement('span'); chip.className = 'filament-chip filament-color-swatch';
    chip.style.backgroundColor = sample.hex; chip.title = view.title; chip.setAttribute('aria-hidden', 'true');
    view.append(chip);
  }
  if (!compact) {
    const name = document.createElement('span'); name.className = 'filament-color-name';
    name.textContent = sample.name || 'Sin color indicado'; view.append(name);
  }
  if (sample.approximate || !sample.hex) {
    const note = document.createElement('small');
    note.className = sample.approximate ? 'filament-color-approx' : 'filament-color-unavailable';
    note.textContent = sample.approximate ? 'Aprox.' : 'Sin muestra'; note.title = description; view.append(note);
  }
  return view;
}
