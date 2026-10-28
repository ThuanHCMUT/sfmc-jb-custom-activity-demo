/*
 * Template content preview.
 *
 * Renders the raw template content and highlights every {variable} placeholder
 * as a chip. Chip color reflects the mapping state of that variable:
 *
 *   green   mapped (Auto or Manual)  - a value is configured
 *   red     required but unmapped    - a value is missing
 *   gray    optional and unmapped    - no value, allowed
 *   dashed  not a template variable  - literal braces, no target
 *
 * The tooltip names the target and its status, so the designer can see at a
 * glance where each variable value will appear in the final message.
 */

import { listMappingTargets } from '../domain/mappingTargets.js';
import { deriveMappingStatus, MAPPING_STATUS, STATUS_META } from '../domain/mappingStatus.js';
import { normalizeName } from '../domain/nameNormalizer.js';

const PLACEHOLDER = /\{([^{}\s]+)\}/g;

/** Preview tone per mapping status: both Auto and Manual mean "a value is mapped". */
const TONE_BY_STATUS = Object.freeze({
  [MAPPING_STATUS.AUTO]: 'mapped',
  [MAPPING_STATUS.MANUAL]: 'mapped',
  [MAPPING_STATUS.MISSING]: 'missing',
  [MAPPING_STATUS.AMBIGUOUS]: 'ambiguous',
  [MAPPING_STATUS.OPTIONAL]: 'optional',
});

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export class TemplatePreview {
  #container;

  /** @param {{ container: HTMLElement }} options */
  constructor({ container }) {
    this.#container = container;
  }

  /**
   * @param {object} options
   * @param {object|null} options.template
   * @param {Record<string, { mode: string, value: string }>} [options.mappings]
   * @param {ReadonlyArray<object>} [options.fields]
   * @param {Set<string>} [options.modifiedTargets]
   */
  render({ template, mappings = {}, fields = [], modifiedTargets = new Set() }) {
    if (!template) {
      this.showPlaceholder('Chọn một mẫu để xem nội dung xem trước.');
      return;
    }

    const content = template.content ?? '';
    if (content.trim() === '') {
      this.showPlaceholder('Mẫu này không có nội dung để xem trước.');
      return;
    }

    const targets = listMappingTargets(template);
    const byName = new Map();
    for (const target of targets) {
      if (!byName.has(target.name)) byName.set(target.name, target);
    }

    const wrap = element('div', 'template-preview');
    const contentBox = element('div', 'template-preview__content');
    contentBox.setAttribute('aria-label', 'Nội dung mẫu với các biến được tô sáng');

    const found = [];
    let lastIndex = 0;
    let match;
    while ((match = PLACEHOLDER.exec(content)) !== null) {
      if (match.index > lastIndex) {
        contentBox.append(document.createTextNode(content.slice(lastIndex, match.index)));
      }
      const name = match[1];
      const target =
        byName.get(name) ?? targets.find((candidate) => normalizeName(candidate.name) === normalizeName(name)) ?? null;
      const status = target
        ? deriveMappingStatus({ target, mapping: mappings[target.key] ?? null, fields, modifiedTargets })
        : null;
      found.push({ name, status });
      contentBox.append(this.#chip(name, target, status));
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < content.length) {
      contentBox.append(document.createTextNode(content.slice(lastIndex)));
    }

    wrap.append(contentBox, this.#meta(found), this.#legend());
    this.#container.replaceChildren(wrap);
  }

  /** @param {string} message */
  showPlaceholder(message) {
    const text = element('p', 'placeholder placeholder--compact', message);
    this.#container.replaceChildren(text);
  }

  #chip(name, target, status) {
    let tone = 'unknown';
    let tooltip = `"{${name}}" không phải là biến của mẫu.`;
    if (target && status) {
      tone = TONE_BY_STATUS[status] ?? 'unknown';
      tooltip = `${target.key} \u2014 ${STATUS_META[status].label}: ${STATUS_META[status].tooltip}`;
    }

    const chip = element('mark', `template-preview__var template-preview__var--${tone}`, `{${name}}`);
    chip.title = tooltip;
    chip.setAttribute('aria-label', tooltip);
    chip.dataset.variable = name;
    if (target) chip.dataset.targetKey = target.key;
    return chip;
  }

  #meta(found) {
    const mapped = found.filter((item) => item.status === MAPPING_STATUS.AUTO || item.status === MAPPING_STATUS.MANUAL).length;
    const missing = found.filter((item) => item.status === MAPPING_STATUS.MISSING || item.status === MAPPING_STATUS.AMBIGUOUS).length;
    const unknown = found.filter((item) => item.status === null).length;

    const meta = element('p', 'template-preview__meta');
    meta.textContent = `Biến: ${found.length} \u00B7 Đã ánh xạ: ${mapped} \u00B7 Thiếu: ${missing}`;
    if (unknown > 0) {
      meta.textContent += ` \u00B7 Không phải biến: ${unknown}`;
    }
    return meta;
  }

  #legend() {
    const legend = element('ul', 'template-preview__legend');
    legend.setAttribute('aria-label', 'Chú thích màu biến');
    const items = [
      ['mapped', 'Đã ánh xạ'],
      ['missing', 'Thiếu'],
      ['optional', 'Tùy chọn'],
      ['unknown', 'Không phải biến'],
    ];
    for (const [tone, label] of items) {
      const item = element('li', 'template-preview__legend-item');
      item.append(element('span', `template-preview__var template-preview__var--${tone}`, '{var}'), element('span', null, label));
      legend.append(item);
    }
    return legend;
  }
}