/*
 * Mapping table.
 *
 * Renders every template target of the selected template in one semantic
 * <table>: Type, Template Field, Required, Entry DE Field, Status. Rows are
 * grouped under section headers (Addresses, Recipient Fields, Template
 * Parameters) and can be searched, filtered and sorted.
 *
 * Performance: rows are built once per template render. Catalog, mapping and
 * status updates are applied in place to the existing row elements, so one
 * dropdown change never rebuilds the table. Search/filter/sort only toggle
 * visibility or reorder existing nodes. The table stays responsive with 200+
 * template fields.
 *
 * The component never reads or writes application state; it receives
 * snapshots through render()/update() and reports changes upward.
 */

import { listMappingTargets, TARGET_GROUPS } from '../domain/mappingTargets.js';
import { findField } from '../schema/field-catalog-model.js';
import {
  deriveMappingStatus,
  matchesMappingFilter,
  matchesMappingSearch,
  compareRows,
  SORT_KEYS,
} from '../domain/mappingStatus.js';
import { MappingTableRow } from './mapping-table-row.js';

const COLUMN_COUNT = 5;

export class MappingTable {
  #tbody;
  #onChange;
  /** @type {Map<string, { target: object, row: MappingTableRow, mapping: object|null, field: object|null, status: string }>} */
  #views = new Map();
  /** @type {Array<{ id: string, title: string, header: HTMLElement|null, views: Array<object> }>} */
  #groups = [];
  #fieldsRef = null;
  #searchQuery = '';
  #filter = 'all';
  #sortKey = null;
  #sortDirection = 'asc';
  #sortButtons = new Map();

  /**
   * @param {object} options
   * @param {HTMLElement} options.tbody - the <tbody> of the mapping table
   * @param {(targetKey: string, mapping: object|null) => void} options.onChange
   */
  constructor({ tbody, onChange }) {
    this.#tbody = tbody;
    this.#onChange = onChange;
    this.#bindHeaderSort();
  }

  /**
   * Rebuilds all rows for the template. Call update() afterwards.
   *
   * @param {{ template: object|null }} options
   */
  render({ template }) {
    this.#views.clear();
    this.#groups = [];
    this.#fieldsRef = null;
    this.#searchQuery = '';
    this.#filter = 'all';
    this.#sortKey = null;
    this.#sortDirection = 'asc';
    this.#syncSortButtons();

    if (!template) {
      this.#showEmpty('Chọn một mẫu để xem các đích ánh xạ.');
      return;
    }

    const targets = listMappingTargets(template);
    this.#groups = TARGET_GROUPS.map((group) => ({
      id: group.id,
      title: group.title,
      header: null,
      views: [],
    }));

    for (const target of targets) {
      const row = new MappingTableRow({
        target,
        onChange: (targetKey, mapping) => this.#onChange(targetKey, mapping),
      });
      this.#views.set(target.key, { target, row, mapping: null, field: null, status: null });
      this.#groups.find((group) => group.id === target.groupId).views.push(this.#views.get(target.key));
    }

    this.#buildBody();
    this.#applyOrder();
  }

  /**
   * Applies catalog, mappings, statuses and per-target messages to the rows.
   *
   * @param {object} options
   * @param {Record<string, { mode: string, value: string }>} options.mappings
   * @param {Record<string, string>} options.errorsByTarget
   * @param {Record<string, string>} options.warningsByTarget
   * @param {Set<string>} options.staleTargets
   * @param {ReadonlyArray<object>} options.fields - normalized catalog fields
   * @param {boolean} options.fieldsEnabled
   * @param {Set<string>} options.modifiedTargets
   */
  update({ mappings, errorsByTarget, warningsByTarget, staleTargets, fields, fieldsEnabled, modifiedTargets = new Set() }) {
    if (fields !== this.#fieldsRef) {
      for (const { row } of this.#views.values()) {
        row.setFieldOptions(fields);
      }
      this.#fieldsRef = fields;
    }

    for (const [key, view] of this.#views) {
      const mapping = mappings[key] ?? null;
      const error = errorsByTarget[key] ?? null;
      const warned = Boolean(warningsByTarget[key]);

      view.mapping = mapping;
      view.field =
        mapping?.mode === 'field' && mapping.value !== '' ? findField({ fields }, mapping.value) : null;
      view.status = deriveMappingStatus({
        target: view.target,
        mapping,
        fields,
        modifiedTargets,
      });

      view.row.update(mapping, { fieldsEnabled, stale: staleTargets.has(key) });
      view.row.setStatus(view.status, {
        invalid: Boolean(error),
        warned,
      });
      view.row.setError(mapping ? error : null);
    }

    this.#applyVisibility();
  }

  /** @param {string} message */
  showPlaceholder(message) {
    this.#views.clear();
    this.#groups = [];
    this.#fieldsRef = null;
    this.#showEmpty(message);
  }

  /** @param {{ query: string, filter: string }} state */
  setFilterState({ query, filter }) {
    this.#searchQuery = query;
    this.#filter = filter;
    this.#applyVisibility();
  }

  #showEmpty(message) {
    const row = document.createElement('tr');
    row.className = 'mapping-table__empty';
    const cell = document.createElement('td');
    cell.colSpan = COLUMN_COUNT;
    cell.textContent = message;
    row.append(cell);
    this.#tbody.replaceChildren(row);
  }

  /** Builds the group header rows and the row elements in template order. */
  #buildBody() {
    const fragment = document.createDocumentFragment();
    for (const group of this.#groups) {
      if (group.views.length === 0) continue;
      const header = document.createElement('tr');
      header.className = 'mapping-table__group';
      const cell = document.createElement('th');
      cell.scope = 'rowgroup';
      cell.colSpan = COLUMN_COUNT;
      cell.textContent = `${group.title} (${group.views.length})`;
      header.append(cell);
      group.header = header;
      fragment.append(header);
      for (const view of group.views) {
        fragment.append(view.row.element);
      }
    }
    this.#tbody.replaceChildren(fragment);
  }

  /** Orders the tbody: grouped by default, flattened and sorted when a sort is active. */
  #applyOrder() {
    const fragment = document.createDocumentFragment();
    if (this.#sortKey) {
      for (const view of this.#sortedViews()) {
        fragment.append(view.row.element);
      }
    } else {
      for (const group of this.#groups) {
        if (group.header) fragment.append(group.header);
        for (const view of group.views) {
          fragment.append(view.row.element);
        }
      }
    }
    this.#tbody.replaceChildren(fragment);
    this.#applyVisibility();
  }

  /** Toggles row and group-header visibility according to search + filter. */
  #applyVisibility() {
    const visibleGroups = new Set();
    for (const view of this.#views.values()) {
      const visible =
        matchesMappingSearch(view, this.#searchQuery) && matchesMappingFilter(view, this.#filter);
      view.row.element.hidden = !visible;
      if (visible) visibleGroups.add(view.target.groupId);
    }
    for (const group of this.#groups) {
      if (group.header) group.header.hidden = !visibleGroups.has(group.id);
    }
  }

  /** @returns {Array<object>} views ordered by the active sort key */
  #sortedViews() {
    const views = [...this.#views.values()];
    views.sort((a, b) => compareRows(a, b, this.#sortKey, this.#sortDirection));
    return views;
  }

  /** Wires the sortable header buttons. Click cycle: asc -> desc -> grouped default. */
  #bindHeaderSort() {
    const thead = this.#tbody.closest('table')?.querySelector('thead');
    if (!thead) return;
    for (const button of thead.querySelectorAll('[data-sort]')) {
      const key = button.dataset.sort;
      if (!SORT_KEYS.includes(key)) continue;
      this.#sortButtons.set(key, button);
      button.addEventListener('click', () => {
        if (this.#sortKey !== key) {
          this.#sortKey = key;
          this.#sortDirection = 'asc';
        } else if (this.#sortDirection === 'asc') {
          this.#sortDirection = 'desc';
        } else {
          this.#sortKey = null;
          this.#sortDirection = 'asc';
        }
        this.#syncSortButtons();
        this.#applyOrder();
      });
    }
  }

  #syncSortButtons() {
    for (const [key, button] of this.#sortButtons) {
      const active = key === this.#sortKey;
      button.classList.toggle('sort-active', active);
      button.setAttribute('aria-pressed', String(active));
      const th = button.closest('th');
      if (th) {
        if (active) {
          th.setAttribute('aria-sort', this.#sortDirection === 'asc' ? 'ascending' : 'descending');
        } else {
          th.removeAttribute('aria-sort');
        }
      }
    }
  }
}