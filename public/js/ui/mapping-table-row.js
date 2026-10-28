/*
 * Mapping table row (one template target).
 *
 * Renders one <tr> of the mapping table: Type chip, template field name,
 * Required/Optional badge, the Entry DE Field control (dropdown of normalized
 * entry fields, with a compact "static value" alternative) and the status chip.
 *
 * The row never reads or writes application state. Changes are reported
 * upward through onChange. update() and setStatus() only assign values that
 * differ, so a focused control is never overwritten while the user types and
 * one dropdown change never rebuilds the row.
 */

import { MAPPING_MODES } from '../domain/mappingTargets.js';
import { STATUS_META } from '../domain/mappingStatus.js';

let rowSequence = 0;

const GROUP_TYPE_LABEL = Object.freeze({
  addresses: 'Addr',
  recipientFields: 'Recipient',
  params: 'Param',
});

/** "Mobile Phone — MobilePhone — Phone" */
export function describeFieldOption(field) {
  return `${field.label} \u2014 ${field.name} \u2014 ${field.dataType}`;
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export class MappingTableRow {
  #target;
  #onChange;
  #id;
  #element;
  #statusCell;
  #statusChip;
  #fields = [];
  #filter = '';
  #fieldSelect;
  #fieldSearch;
  #staticInput;
  #staticToggle;
  #fieldWrap;
  #catalogWrap;
  #typedWrap;
  #typedInput;
  #staticWrap;
  #staleLine;
  #staleValue;
  #errorText;

  /**
   * @param {object} options
   * @param {{ key: string, groupId: string, name: string, required: boolean, type: string|null, isRouting: boolean }} options.target
   * @param {(targetKey: string, mapping: { mode: string, value: string }|null) => void} options.onChange
   */
  constructor({ target, onChange }) {
    this.#target = target;
    this.#onChange = onChange;
    this.#id = `mapping-row-${++rowSequence}`;
    this.#element = this.#build();
  }

  get element() {
    return this.#element;
  }

  get targetKey() {
    return this.#target.key;
  }

  /**
   * Replaces the field options. The current selection is kept when it still exists.
   * @param {ReadonlyArray<{ id: string, name: string, label: string, dataType: string }>} fields
   */
  setFieldOptions(fields) {
    this.#fields = fields;
    this.#rebuildOptions();
  }

  /**
   * Syncs the controls with the mapping from state. Only assigns values that
   * differ, so a focused control is not overwritten while the user types.
   *
   * An unmapped row behaves like a field mapping with no selection: the
   * dropdown is visible so the designer can pick a field directly.
   *
   * @param {{ mode: string, value: string }|null} mapping
   * @param {{ fieldsEnabled: boolean, stale: boolean }} context
   */
  update(mapping, { fieldsEnabled, stale }) {
    const mode = mapping?.mode ?? MAPPING_MODES.FIELD;

    this.#fieldWrap.hidden = mode !== MAPPING_MODES.FIELD;
    this.#staticWrap.hidden = mode !== MAPPING_MODES.STATIC;
    this.#staticToggle.hidden = mode === MAPPING_MODES.STATIC;

    this.#fieldSearch.disabled = !fieldsEnabled;
    this.#fieldSelect.disabled = !fieldsEnabled;
    this.#catalogWrap.hidden = !fieldsEnabled;
    this.#typedWrap.hidden = fieldsEnabled;

    if (mode === MAPPING_MODES.FIELD) {
      const showStale = Boolean(mapping) && stale && mapping.value !== '';
      this.#staleLine.hidden = !showStale;
      this.#staleValue.textContent = showStale ? mapping.value : '';

      const expected = showStale ? '' : (mapping?.value ?? '');
      if (this.#fieldSelect.value !== expected) {
        this.#fieldSelect.value = expected;
      }
      if (this.#typedInput.value !== expected) {
        this.#typedInput.value = expected;
      }
    } else {
      this.#staleLine.hidden = true;
    }

    if (mode === MAPPING_MODES.STATIC && this.#staticInput.value !== mapping.value) {
      this.#staticInput.value = mapping.value;
    }
  }

  /**
   * @param {string} status - one of MAPPING_STATUS
   * @param {boolean} [invalid] - row has a blocking validation error
   * @param {boolean} [warned] - row has a non-blocking warning
   */
  setStatus(status, { invalid = false, warned = false } = {}) {
    const meta = STATUS_META[status];
    this.#statusChip.className = `status-chip status-chip--${meta.tone}`;
    this.#statusChip.textContent = `${meta.icon} ${meta.label}`;
    this.#statusChip.title = meta.tooltip;
    this.#statusChip.setAttribute('aria-label', `${meta.label}: ${meta.tooltip}`);
    this.#statusChip.dataset.status = status;
    this.#element.dataset.status = status;

    this.#element.classList.toggle('mapping-table__row--invalid', invalid);
    this.#element.classList.toggle('mapping-table__row--warning', warned);
    const ariaInvalid = invalid ? 'true' : 'false';
    this.#fieldSelect.setAttribute('aria-invalid', ariaInvalid);
    this.#staticInput.setAttribute('aria-invalid', ariaInvalid);
  }

  /** @param {string|null} message */
  setError(message) {
    this.#errorText.textContent = message ?? '';
    this.#errorText.hidden = !message;
    this.#errorText.title = message ?? '';
  }

  #build() {
    const { key, groupId, name, required, type } = this.#target;
    const row = element('tr', 'mapping-table__row');
    row.dataset.targetKey = key;

    const typeLabel = GROUP_TYPE_LABEL[groupId] ?? groupId;
    const typeCell = element('td', 'mapping-table__cell mapping-table__cell--type');
    typeCell.dataset.label = 'Loại';
    typeCell.append(element('span', `type-chip type-chip--${groupId}`, typeLabel));

    const nameCell = element('td', 'mapping-table__cell mapping-table__cell--name');
    nameCell.dataset.label = 'Trường mẫu';
    nameCell.append(element('span', 'template-field', name));
    if (type) {
      nameCell.append(element('span', 'template-field__type', type));
    }

    const requiredCell = element('td', 'mapping-table__cell mapping-table__cell--required');
    requiredCell.dataset.label = 'Bắt buộc';
    if (required || this.#target.isRouting) {
      requiredCell.append(element('span', 'required-badge', '\u2705 Bắt buộc'));
    } else {
      requiredCell.append(element('span', 'optional-badge', 'Tùy chọn'));
    }

    const deCell = element('td', 'mapping-table__cell mapping-table__cell--de');
    deCell.dataset.label = 'Trường DE đầu vào';
    deCell.append(this.#buildDeControl());

    this.#statusCell = element('td', 'mapping-table__cell mapping-table__cell--status');
    this.#statusCell.dataset.label = 'Trạng thái';
    this.#statusChip = element('span', 'status-chip');
    this.#statusCell.append(this.#statusChip);

    row.append(typeCell, nameCell, requiredCell, deCell, this.#statusCell);
    this.#element = row;
    return row;
  }

  /** The Entry DE Field cell: search + dropdown, a static-value alternative, stale notice, error. */
  #buildDeControl() {
    const wrap = element('div', 'de-control');

    this.#fieldWrap = element('div', 'de-control__field');
    this.#fieldWrap.hidden = true;

    const searchLabel = element('label', 'de-control__label', 'Tìm trường');
    this.#fieldSearch = element('input', 'field__control de-control__search');
    this.#fieldSearch.type = 'search';
    this.#fieldSearch.id = `${this.#id}-search`;
    this.#fieldSearch.placeholder = 'Lọc trường';
    this.#fieldSearch.autocomplete = 'off';
    this.#fieldSearch.setAttribute('aria-label', `Tìm trường đầu vào cho ${this.#target.name}`);
    searchLabel.htmlFor = this.#fieldSearch.id;
    this.#fieldSearch.addEventListener('input', () => {
      this.#filter = this.#fieldSearch.value.trim().toLowerCase();
      this.#rebuildOptions();
    });

    const fieldLabel = element('label', 'de-control__label', 'Trường DE đầu vào');
    this.#fieldSelect = element('select', 'field__control de-control__select');
    this.#fieldSelect.id = `${this.#id}-field`;
    fieldLabel.htmlFor = this.#fieldSelect.id;
    this.#fieldSelect.addEventListener('change', () => {
      this.#onChange(this.#target.key, { mode: MAPPING_MODES.FIELD, value: this.#fieldSelect.value });
    });

    // Used when Journey Builder sent no field list: the designer types the Data Extension field name.
    this.#catalogWrap = element('div', 'de-control__catalog');
    this.#catalogWrap.append(searchLabel, this.#fieldSearch, fieldLabel, this.#fieldSelect);

    this.#typedWrap = element('div', 'de-control__typed');
    this.#typedWrap.hidden = true;
    const typedLabel = element('label', 'de-control__label', 'Trường Data Extension');
    this.#typedInput = element('input', 'field__control de-control__typed-input');
    this.#typedInput.type = 'text';
    this.#typedInput.id = `${this.#id}-typed`;
    this.#typedInput.placeholder = 'ví dụ: CustomerName';
    this.#typedInput.autocomplete = 'off';
    this.#typedInput.setAttribute('aria-label', `Tên trường Data Extension cho ${this.#target.name}`);
    typedLabel.htmlFor = this.#typedInput.id;
    this.#typedInput.addEventListener('change', () => {
      this.#onChange(this.#target.key, { mode: MAPPING_MODES.FIELD, value: this.#typedInput.value });
    });
    const typedHint = element('p', 'de-control__hint', 'Nhập tên trường Data Extension. Danh sách trường hiện không khả dụng.');
    this.#typedWrap.append(typedLabel, this.#typedInput, typedHint);

    this.#staleLine = element('p', 'de-control__stale');
    this.#staleLine.hidden = true;
    this.#staleLine.setAttribute('role', 'alert');
    this.#staleValue = element('span', 'de-control__stale-value');
    this.#staleLine.append(
      document.createTextNode('Đã ánh xạ trước đó: '),
      this.#staleValue,
      document.createTextNode(' \u2014 không còn trong schema đầu vào. Hãy chọn trường thay thế.')
    );

    this.#staticToggle = element('button', 'de-control__toggle', 'Dùng giá trị tĩnh');
    this.#staticToggle.type = 'button';
    this.#staticToggle.setAttribute('aria-label', `Ánh xạ ${this.#target.name} sang giá trị tĩnh`);
    this.#staticToggle.addEventListener('click', () => {
      this.#onChange(this.#target.key, { mode: MAPPING_MODES.STATIC, value: '' });
    });

    this.#fieldWrap.append(this.#catalogWrap, this.#typedWrap, this.#staleLine, this.#staticToggle);

    this.#staticWrap = element('div', 'de-control__static');
    this.#staticWrap.hidden = true;
    const staticLabel = element('label', 'de-control__label', 'Giá trị tĩnh');
    this.#staticInput = element('input', 'field__control de-control__static-input');
    this.#staticInput.type = 'text';
    this.#staticInput.id = `${this.#id}-static`;
    this.#staticInput.placeholder = 'Nhập giá trị cố định';
    this.#staticInput.autocomplete = 'off';
    staticLabel.htmlFor = this.#staticInput.id;
    this.#staticInput.addEventListener('input', () => {
      this.#onChange(this.#target.key, { mode: MAPPING_MODES.STATIC, value: this.#staticInput.value });
    });

    const fieldLink = element('button', 'de-control__toggle', 'Dùng trường đầu vào');
    fieldLink.type = 'button';
    fieldLink.setAttribute('aria-label', `Ánh xạ ${this.#target.name} sang trường đầu vào`);
    fieldLink.addEventListener('click', () => {
      this.#onChange(this.#target.key, { mode: MAPPING_MODES.FIELD, value: '' });
    });

    this.#staticWrap.append(staticLabel, this.#staticInput, fieldLink);

    this.#errorText = element('p', 'de-control__error');
    this.#errorText.hidden = true;
    this.#errorText.id = `${this.#id}-error`;

    wrap.append(this.#fieldWrap, this.#staticWrap, this.#errorText);
    return wrap;
  }

  /** Rebuilds the select options, applying the search filter and keeping the current selection. */
  #rebuildOptions() {
    const selected = this.#fieldSelect.value;
    const placeholder = element('option', null, 'Chọn trường đầu vào');
    placeholder.value = '';

    const visible = this.#fields.filter((field) => {
      if (field.id === selected) return true;
      if (this.#filter === '') return true;
      return (
        field.label.toLowerCase().includes(this.#filter) || field.name.toLowerCase().includes(this.#filter)
      );
    });

    const options = visible.map((field) => {
      const option = element('option', null, describeFieldOption(field));
      option.value = field.id;
      return option;
    });

    this.#fieldSelect.replaceChildren(placeholder, ...options);
    this.#fieldSelect.value = visible.some((field) => field.id === selected) ? selected : '';
  }
}