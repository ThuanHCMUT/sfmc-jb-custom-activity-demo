/**
 * @jest-environment jsdom
 */

import { describe, it, expect, jest } from '@jest/globals';

import { SchemaStatusPanel } from '../../public/js/ui/schemaStatusPanel.js';
import { SCHEMA_STATUS } from '../../public/js/state/activityState.js';

function renderView(view) {
  const container = document.createElement('div');
  const panel = new SchemaStatusPanel({ container, onRetry: jest.fn() });
  panel.render({
    eventDefinitionKey: 'ORDER_ENTRY_EVENT',
    fieldCount: 0,
    warningCount: 0,
    staleCount: 0,
    standalone: false,
    error: null,
    ...view,
  });
  return container;
}

describe('SchemaStatusPanel', () => {
  it('shows SCHEMA_NOT_AVAILABLE as an informational state, not an error', () => {
    const container = renderView({
      status: SCHEMA_STATUS.UNAVAILABLE,
      error: { code: 'SCHEMA_NOT_AVAILABLE', message: 'no field list' },
    });

    expect(container.querySelector('.schema-status__title').textContent).toBe(
      'Journey Builder không cung cấp danh sách trường. Hãy nhập tên trường Data Extension trong bảng ánh xạ.'
    );
    expect(container.querySelector('.schema-status__detail')).toBeNull();
  });

  it('keeps the error wording for other unavailable causes', () => {
    const container = renderView({
      status: SCHEMA_STATUS.UNAVAILABLE,
      error: { code: 'POSTMONGER_UNAVAILABLE', message: 'no bridge' },
    });

    expect(container.querySelector('.schema-status__title').textContent).toBe('Schema đầu vào không khả dụng.');
  });
});
