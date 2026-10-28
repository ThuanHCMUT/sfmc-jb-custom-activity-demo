/*
 * Mapping filter toolbar: a search box and a status filter dropdown.
 *
 * Owns the two controls and reports changes upward. Rendering/filtering of the
 * table is the table's responsibility; this component only collects input.
 */

import { MAPPING_FILTERS } from '../domain/mappingStatus.js';

export class MappingFilter {
  #container;
  #onChange;
  #search;
  #select;

  /**
   * @param {object} options
   * @param {HTMLElement} options.container
   * @param {(state: { query: string, filter: string }) => void} options.onChange
   */
  constructor({ container, onChange }) {
    this.#container = container;
    this.#onChange = onChange;
    this.#build();
  }

  /** Resets both controls (used when the template changes). */
  reset() {
    this.#search.value = '';
    this.#select.value = MAPPING_FILTERS.ALL;
    this.#emit();
  }

  #build() {
    const toolbar = document.createElement('div');
    toolbar.className = 'mapping-filter';

    const searchLabel = document.createElement('label');
    searchLabel.className = 'mapping-filter__search';
    searchLabel.htmlFor = 'mapping-search';
    const searchText = document.createElement('span');
    searchText.className = 'mapping-filter__label';
    searchText.textContent = 'Tìm kiếm';
    this.#search = document.createElement('input');
    this.#search.type = 'search';
    this.#search.id = 'mapping-search';
    this.#search.className = 'field__control mapping-filter__search-input';
    this.#search.placeholder = 'Trường mẫu, trường DE hoặc loại';
    this.#search.autocomplete = 'off';
    this.#search.addEventListener('input', () => this.#emit());
    searchLabel.append(searchText, this.#search);

    const filterLabel = document.createElement('label');
    filterLabel.className = 'mapping-filter__filter';
    filterLabel.htmlFor = 'mapping-filter-select';
    const filterText = document.createElement('span');
    filterText.className = 'mapping-filter__label';
    filterText.textContent = 'Lọc';
    this.#select = document.createElement('select');
    this.#select.id = 'mapping-filter-select';
    this.#select.className = 'field__control mapping-filter__select';
    for (const [value, label] of Object.entries({
      [MAPPING_FILTERS.ALL]: 'Tất cả',
      [MAPPING_FILTERS.REQUIRED]: 'Bắt buộc',
      [MAPPING_FILTERS.OPTIONAL]: 'Tùy chọn',
      [MAPPING_FILTERS.MISSING]: 'Thiếu',
      [MAPPING_FILTERS.MAPPED]: 'Đã ánh xạ',
    })) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = label;
      this.#select.append(option);
    }
    this.#select.addEventListener('change', () => this.#emit());
    filterLabel.append(filterText, this.#select);

    toolbar.append(searchLabel, filterLabel);
    this.#container.replaceChildren(toolbar);
  }

  #emit() {
    this.#onChange({ query: this.#search.value, filter: this.#select.value });
  }
}