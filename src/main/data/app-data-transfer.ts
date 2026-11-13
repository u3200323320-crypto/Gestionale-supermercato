import type Database from 'better-sqlite3';
import type { AppDataBackup } from '../../shared/types';

const tableOrder = [
  'settings', 'sites', 'products', 'employees', 'suppliers', 'customers', 'sales', 'sale_items',
  'promotions', 'voucher_batches', 'vouchers', 'stock_movements', 'stock_distributions',
  'site_inventory', 'employee_activity', 'expenses', 'refunds', 'supplier_orders',
  'supplier_order_items', 'loyalty_cards', 'loyalty_point_transactions', 'payroll_payments',
] as const;
const uniqueKeys: Partial<Record<typeof tableOrder[number], string[][]>> = {
  settings: [['key']],
  sites: [['name']],
  products: [['code']],
  employees: [['recognition_code'], ['barcode'], ['email']],
  suppliers: [['name']],
  sales: [['receipt_no']],
  vouchers: [['code']],
  loyalty_cards: [['code'], ['barcode']],
  site_inventory: [['product_id', 'site_id']],
  payroll_payments: [['employee_id', 'pay_month']],
};
const idColumns: Partial<Record<typeof tableOrder[number], string>> = {
  sites: 'id', products: 'id', employees: 'id', suppliers: 'id', customers: 'id',
  sales: 'id', sale_items: 'id', promotions: 'id', stock_movements: 'id',
  stock_distributions: 'id', employee_activity: 'id', expenses: 'id', refunds: 'id',
  voucher_batches: 'id', vouchers: 'id', supplier_orders: 'id', supplier_order_items: 'id',
  loyalty_cards: 'id', loyalty_point_transactions: 'id', payroll_payments: 'id',
};
const foreignKeys: Partial<Record<typeof tableOrder[number], Record<string, string>>> = {
  site_inventory: { product_id: 'products', site_id: 'sites' },
  sale_items: { sale_id: 'sales', product_id: 'products' },
  vouchers: { batch_id: 'voucher_batches' },
  employee_activity: { employee_id: 'employees' },
  refunds: { sale_id: 'sales' },
  supplier_orders: { supplier_id: 'suppliers', site_id: 'sites' },
  supplier_order_items: { order_id: 'supplier_orders', product_id: 'products' },
  loyalty_cards: { customer_id: 'customers' },
  loyalty_point_transactions: { card_id: 'loyalty_cards' },
  payroll_payments: { employee_id: 'employees' },
};
const rendererPreferenceKeys = new Set(['app-language', 'app-theme', 'product-categories', 'employee-roles', 'site-roles']);
const importableSettings = new Set([
  'shop_name', 'shop_number', 'shop_logo', 'shop_address', 'shop_phone', 'shop_email',
  'shop_tax_id', 'currency', 'main_site_id', 'role_permissions', 'home_image', 'home_video',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function normalize(row: Record<string, unknown>, idColumn?: string): string {
  return JSON.stringify(Object.fromEntries(Object.entries(row)
    .filter(([key]) => key !== idColumn)
    .sort(([left], [right]) => left.localeCompare(right))));
}

function mappedKey(row: Record<string, unknown>, columns: string[]): string {
  return JSON.stringify(columns.map((column) => row[column]));
}

export function exportAppData(database: Database.Database): AppDataBackup {
  const tables = Object.fromEntries(tableOrder.map((table) => [
    table,
    database.prepare(`SELECT * FROM "${table}"`).all() as Array<Record<string, string | number | null>>,
  ]));
  return { format: 'gestionale-supermercato-data', version: 1, exportedAt: new Date().toISOString(), tables };
}

function validateBackup(database: Database.Database, value: unknown): asserts value is AppDataBackup {
  if (!isRecord(value) || value.format !== 'gestionale-supermercato-data' || value.version !== 1
    || typeof value.exportedAt !== 'string' || !isRecord(value.tables)) {
    throw new Error('Il file non è un archivio dati Gestione Supermercato valido.');
  }
  if (value.rendererPreferences !== undefined && (!isRecord(value.rendererPreferences)
    || Object.entries(value.rendererPreferences).some(([key, preference]) =>
      !rendererPreferenceKeys.has(key) || typeof preference !== 'string' || preference.length > 1_000_000))) {
    throw new Error('Il file contiene preferenze locali non valide.');
  }
  const preferences = value.rendererPreferences as Record<string, string> | undefined;
  if (preferences?.['app-language'] && !['it', 'ar'].includes(preferences['app-language'])) {
    throw new Error('La preferenza della lingua contenuta nel file non è valida.');
  }
  for (const key of ['product-categories', 'employee-roles', 'site-roles']) {
    if (preferences?.[key] === undefined) continue;
    let parsed: unknown;
    try { parsed = JSON.parse(preferences[key]); } catch { throw new Error(`La preferenza ${key} contenuta nel file non è valida.`); }
    if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== 'string')) {
      throw new Error(`La preferenza ${key} contenuta nel file non è valida.`);
    }
  }
  for (const [table, rows] of Object.entries(value.tables)) {
    if (!tableOrder.includes(table as typeof tableOrder[number]) || !Array.isArray(rows) || rows.length > 250_000) {
      throw new Error('Il file contiene una tabella non supportata o troppi record.');
    }
    const columns = new Set((database.prepare(`PRAGMA table_info("${table}")`).all() as Array<{ name: string }>).map(({ name }) => name));
    for (const row of rows) {
      if (!isRecord(row) || Object.entries(row).some(([column, cell]) =>
        !columns.has(column) || !(cell === null || typeof cell === 'string' || (typeof cell === 'number' && Number.isFinite(cell))))) {
        throw new Error(`Il file contiene dati non validi nella tabella ${table}.`);
      }
    }
  }
}

export function mergeAppData(database: Database.Database, value: unknown): { added: number; skipped: number } {
  validateBackup(database, value);
  const backup = value as AppDataBackup;
  const idMaps = new Map<string, Map<number, number>>();
  const mappedId = (table: string, id: number) => idMaps.get(table)?.get(id) ?? id;
  let added = 0;
  let skipped = 0;

  database.transaction(() => {
    for (const table of tableOrder) {
      const importedRows = backup.tables[table] ?? [];
      const idColumn = idColumns[table];
      const existingRows = database.prepare(`SELECT * FROM "${table}"`).all() as Array<Record<string, unknown>>;
      const signatures = new Map<string, Map<string, Record<string, unknown>>>();
      for (const existing of existingRows) {
        const keys = Object.keys(existing).filter((key) => key !== idColumn).sort();
        const signature = keys.join('\u001f');
        const index = signatures.get(signature) ?? new Map<string, Record<string, unknown>>();
        index.set(normalize(existing, idColumn), existing);
        signatures.set(signature, index);
      }

      for (const source of importedRows) {
        const row: Record<string, string | number | null> = { ...source };
        if (table === 'settings' && (typeof row.key !== 'string' || !importableSettings.has(row.key))) {
          skipped += 1;
          continue;
        }
        for (const [column, referencedTable] of Object.entries(foreignKeys[table] ?? {})) {
          const value = row[column];
          if (typeof value === 'number') row[column] = mappedId(referencedTable, value);
        }

        let duplicate: Record<string, unknown> | undefined;
        for (const keyColumns of uniqueKeys[table] ?? []) {
          const keyValue = row[keyColumns[0]];
          if (keyValue === null || keyValue === undefined || keyValue === '') continue;
          const where = keyColumns.map((column) => `"${column}" IS ?`).join(' AND ');
          duplicate = database.prepare(`SELECT * FROM "${table}" WHERE ${where}`)
            .get(...keyColumns.map((column) => row[column])) as Record<string, unknown> | undefined;
          if (duplicate) break;
        }

        if (!duplicate) {
          const signature = Object.keys(row).filter((key) => key !== idColumn).sort().join('\u001f');
          duplicate = signatures.get(signature)?.get(normalize(row, idColumn));
        }

        if (duplicate) {
          skipped += 1;
          const sourceId = idColumn ? source[idColumn] : undefined;
          const duplicateId = idColumn ? duplicate[idColumn] : undefined;
          if (typeof sourceId === 'number' && typeof duplicateId === 'number') {
            const mapping = idMaps.get(table) ?? new Map<number, number>();
            mapping.set(sourceId, duplicateId);
            idMaps.set(table, mapping);
          }
          continue;
        }

        if (idColumn && typeof row[idColumn] === 'number'
          && database.prepare(`SELECT 1 FROM "${table}" WHERE "${idColumn}" = ?`).get(row[idColumn])) {
          delete row[idColumn];
        }
        const insertColumns = Object.keys(row);
        const insertValues = insertColumns.map((column) => row[column]);
        let insertedId: number | bigint;
        try {
          const result = database.prepare(`INSERT INTO "${table}" (${insertColumns.map((column) => `"${column}"`).join(', ')})
            VALUES (${insertColumns.map(() => '?').join(', ')})`).run(...insertValues);
          insertedId = result.lastInsertRowid;
        } catch (error) {
          throw new Error(`Impossibile importare la tabella ${table}: ${error instanceof Error ? error.message : 'errore sconosciuto'}`);
        }
        added += 1;
        const sourceId = idColumn ? source[idColumn] : undefined;
        if (idColumn && typeof sourceId === 'number') {
          const mapping = idMaps.get(table) ?? new Map<number, number>();
          mapping.set(sourceId, Number(row[idColumn] ?? insertedId));
          idMaps.set(table, mapping);
        }
      }
    }
  })();
  return { added, skipped };
}
