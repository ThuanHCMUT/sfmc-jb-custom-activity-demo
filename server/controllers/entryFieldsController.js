/*
 * Entry-fields controller (ADR-004, Option A).
 *
 * GET /api/entry-fields?eventDefinitionKey=<key>
 *
 * Returns only field names and types. When the lookup is not configured the
 * endpoint answers 501 so the UI keeps the typed-name fallback. An empty field
 * list (Data Extension without columns yet) is a valid 200 with no fields.
 */

export class EntryFieldsController {
  /**
   * @param {object} deps
   * @param {{ isEnabled: () => boolean, getFieldsByEventDefinitionKey: (key: string) => Promise<{ fields: object[] }> }} deps.entryFieldsService
   */
  constructor({ entryFieldsService }) {
    this.entryFieldsService = entryFieldsService;
  }

  getEntryFields = async (req, res) => {
    if (!this.entryFieldsService.isEnabled()) {
      return res.status(501).json({
        success: false,
        error: {
          code: 'ENTRY_FIELDS_DISABLED',
          message: 'The entry-field lookup is not configured on this server.',
          details: [],
        },
      });
    }

    const key = typeof req.query.eventDefinitionKey === 'string' ? req.query.eventDefinitionKey : '';
    if (key === '') {
      return res.status(400).json({
        success: false,
        error: {
          code: 'EVENT_DEFINITION_KEY_REQUIRED',
          message: 'The eventDefinitionKey query parameter is required.',
          details: [{ code: 'EVENT_DEFINITION_KEY_REQUIRED', key: 'eventDefinitionKey' }],
        },
      });
    }

    const { fields } = await this.entryFieldsService.getFieldsByEventDefinitionKey(key);
    return res.status(200).json({ success: true, fields });
  };
}