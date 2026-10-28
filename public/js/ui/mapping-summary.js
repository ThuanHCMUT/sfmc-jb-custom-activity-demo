/*
 * Mapping summary bar.
 *
 * Renders above the mapping table: the selected template and channel, plus
 * live counters (Total Fields, Mapped, Auto, Manual, Missing). Counts come
 * from summarizeMappings(), the same derivation the table uses, so the bar
 * always agrees with the rows.
 */

import { channelLabel } from '../domain/channels.js';
import { summarizeMappings } from '../domain/mappingStatus.js';

export class MappingSummary {
  #container;

  /** @param {{ container: HTMLElement }} options */
  constructor({ container }) {
    this.#container = container;
  }

  /**
   * @param {object} options
   * @param {object|null} options.template
   * @param {Record<string, { mode: string, value: string }>} options.mappings
   * @param {ReadonlyArray<object>} [options.fields]
   * @param {Set<string>} [options.modifiedTargets]
   */
  render({ template, mappings = {}, fields = [], modifiedTargets = new Set() }) {
    if (!template) {
      this.#container.replaceChildren();
      return;
    }

    const counts = summarizeMappings({ template, mappings, fields, modifiedTargets });

    const bar = document.createElement('div');
    bar.className = 'mapping-summary';
    bar.setAttribute('aria-label', 'Tóm tắt ánh xạ');

    const context = document.createElement('dl');
    context.className = 'mapping-summary__context';
    context.append(
      this.#fact('Mẫu', template.displayName),
      this.#fact('Kênh', channelLabel(template.channel))
    );

    const countsList = document.createElement('dl');
    countsList.className = 'mapping-summary__counts';
    countsList.append(
      this.#count('Tổng số trường', counts.total, 'total'),
      this.#count('Đã ánh xạ', counts.mapped, 'mapped'),
      this.#count('Tự động', counts.auto, 'auto'),
      this.#count('Thủ công', counts.manual, 'manual'),
      this.#count('Thiếu', counts.missing, 'missing')
    );

    bar.append(context, countsList);
    this.#container.replaceChildren(bar);
  }

  #fact(term, value) {
    const item = document.createElement('div');
    item.className = 'mapping-summary__fact';
    const dt = document.createElement('dt');
    dt.textContent = term;
    const dd = document.createElement('dd');
    dd.textContent = value;
    item.append(dt, dd);
    return item;
  }

  #count(term, value, tone) {
    const item = document.createElement('div');
    item.className = `mapping-summary__count mapping-summary__count--${tone}`;
    const dt = document.createElement('dt');
    dt.textContent = term;
    const dd = document.createElement('dd');
    dd.textContent = String(value);
    item.append(dt, dd);
    return item;
  }
}