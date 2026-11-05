import { randomInt } from 'node:crypto';
import type Database from 'better-sqlite3';
import type { SiteInput } from '../shared/types';

export const WAREHOUSE_SITE_NAME = 'Magazzino';

const recognitionAlphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';

function uniqueRecognitionCode(database: Database.Database, reservedCodes: Set<string>): string {
  let code = '';
  do {
    code = Array.from({ length: 10 }, () => recognitionAlphabet[randomInt(recognitionAlphabet.length)]).join('');
  } while (reservedCodes.has(code) || database.prepare('SELECT 1 FROM sites WHERE recognition_code = ?').get(code));
  reservedCodes.add(code);
  return code;
}

function moveSiteReferences(database: Database.Database, oldName: string, newName: string): void {
  database.prepare('UPDATE employees SET operational_site = ? WHERE operational_site = ?').run(newName, oldName);
  database.prepare('UPDATE sales SET site = ? WHERE site = ?').run(newName, oldName);
  database.prepare('UPDATE expenses SET site = ? WHERE site = ?').run(newName, oldName);
  database.prepare('UPDATE stock_movements SET site = ? WHERE site = ?').run(newName, oldName);
  database.prepare('UPDATE stock_movements SET destination = ? WHERE destination = ?').run(newName, oldName);
}

function mergeSiteInventory(database: Database.Database, targetSiteId: number, sourceSiteId: number): void {
  database.prepare(`INSERT INTO site_inventory (product_id, site_id, stock)
    SELECT product_id, ?, stock FROM site_inventory WHERE site_id = ?
    ON CONFLICT(product_id, site_id) DO UPDATE SET stock = site_inventory.stock + excluded.stock`)
    .run(targetSiteId, sourceSiteId);
  database.prepare('DELETE FROM site_inventory WHERE site_id = ?').run(sourceSiteId);
}

export function migrateSites(database: Database.Database): void {
  database.transaction(() => {
    const warehouseDeleted = (database.prepare('SELECT value FROM settings WHERE key = ?')
      .get('system_warehouse_deleted') as { value: string } | undefined)?.value === 'true';
    if (!warehouseDeleted) {
      const legacyWarehouses = database.prepare("SELECT id, name FROM sites WHERE name = 'Magazzino centrale' ORDER BY id")
        .all() as Array<{ id: number; name: string }>;
      for (const legacy of legacyWarehouses) {
        const currentWarehouse = database.prepare('SELECT id FROM sites WHERE name = ?').get(WAREHOUSE_SITE_NAME) as { id: number } | undefined;
        if (!currentWarehouse) {
          database.prepare("UPDATE sites SET name = ?, site_type = 'warehouse' WHERE id = ?").run(WAREHOUSE_SITE_NAME, legacy.id);
          moveSiteReferences(database, legacy.name, WAREHOUSE_SITE_NAME);
          continue;
        }
        mergeSiteInventory(database, currentWarehouse.id, legacy.id);
        moveSiteReferences(database, legacy.name, WAREHOUSE_SITE_NAME);
        database.prepare('DELETE FROM sites WHERE id = ?').run(legacy.id);
      }

      const warehouse = database.prepare("SELECT id FROM sites WHERE site_type = 'warehouse' LIMIT 1").get() as { id: number } | undefined;
      if (!warehouse) {
        const namedWarehouse = database.prepare('SELECT id FROM sites WHERE name = ?').get(WAREHOUSE_SITE_NAME) as { id: number } | undefined;
        if (namedWarehouse) {
          database.prepare("UPDATE sites SET site_type = 'warehouse' WHERE id = ?").run(namedWarehouse.id);
        } else {
          database.prepare("INSERT INTO sites (name, address, phone, created_at, site_type, recognition_code) VALUES (?, '', '', ?, 'warehouse', '')")
            .run(WAREHOUSE_SITE_NAME, new Date().toISOString());
        }
      }
    }

    const referencedSites = [
      ...database.prepare('SELECT operational_site AS name FROM employees').all() as Array<{ name: string }>,
      ...database.prepare('SELECT site AS name FROM sales').all() as Array<{ name: string }>,
      ...database.prepare('SELECT site AS name FROM expenses').all() as Array<{ name: string }>,
      ...database.prepare('SELECT site AS name FROM stock_movements').all() as Array<{ name: string }>,
      ...database.prepare('SELECT destination AS name FROM stock_movements').all() as Array<{ name: string }>,
    ];
    const addStoreSite = database.prepare("INSERT OR IGNORE INTO sites (name, address, phone, created_at, site_type, recognition_code) VALUES (?, '', '', ?, 'store', '')");
    for (const name of new Set(referencedSites.map((site) => site.name.trim()).filter((name) =>
      name && ![WAREHOUSE_SITE_NAME, 'Magazzino centrale', 'Negozio', 'Non assegnata'].includes(name)))) {
      addStoreSite.run(name, new Date().toISOString());
    }
    const defaultSite = database.prepare("SELECT name FROM sites WHERE site_type = 'store' ORDER BY id LIMIT 1").get() as { name: string } | undefined;
    const expenseFallback = defaultSite?.name ?? WAREHOUSE_SITE_NAME;
    database.prepare("UPDATE expenses SET site = ? WHERE site IN ('Negozio', 'Non assegnata', '')").run(expenseFallback);
    database.prepare("UPDATE sales SET site = ? WHERE site IN ('Negozio', 'Non assegnata', '')").run(expenseFallback);
    database.prepare("UPDATE stock_movements SET site = ? WHERE site = ''").run(WAREHOUSE_SITE_NAME);

    const reservedCodes = new Set<string>();
    const sites = database.prepare('SELECT id, recognition_code FROM sites ORDER BY id')
      .all() as Array<{ id: number; recognition_code: string }>;
    const updateCode = database.prepare('UPDATE sites SET recognition_code = ? WHERE id = ?');
    for (const site of sites) {
      const hasValidCode = /^[a-z0-9]{10}$/.test(site.recognition_code) && !reservedCodes.has(site.recognition_code);
      const code = hasValidCode ? site.recognition_code : uniqueRecognitionCode(database, reservedCodes);
      reservedCodes.add(code);
      if (code !== site.recognition_code) updateCode.run(code, site.id);
    }
    database.exec('CREATE UNIQUE INDEX IF NOT EXISTS sites_recognition_code_unique ON sites(recognition_code)');
    const inventorySite = database.prepare("SELECT id FROM sites WHERE site_type = 'warehouse' ORDER BY id LIMIT 1").get() as { id: number } | undefined
      ?? database.prepare("SELECT id FROM sites WHERE site_type = 'store' ORDER BY id LIMIT 1").get() as { id: number } | undefined;
    if (inventorySite) {
      database.prepare(`INSERT OR IGNORE INTO site_inventory (product_id, site_id, stock)
        SELECT products.id, ?, products.stock FROM products
        WHERE NOT EXISTS (SELECT 1 FROM site_inventory WHERE site_inventory.product_id = products.id)`).run(inventorySite.id);
    }
  })();
}

export function saveSite(database: Database.Database, input: SiteInput): void {
  if (!input || typeof input.name !== 'string' || !input.name.trim() || input.name.trim().length > 80
    || typeof input.address !== 'string' || input.address.length > 200
    || typeof input.phone !== 'string' || input.phone.length > 40
    || (input.id !== undefined && (!Number.isInteger(input.id) || input.id < 1))) {
    throw new Error('I dati della sede non sono validi.');
  }

  const name = input.name.trim();
  try {
    if (input.id !== undefined) {
      const existing = database.prepare('SELECT name, site_type FROM sites WHERE id = ?').get(input.id) as
        { name: string; site_type: 'store' | 'warehouse' } | undefined;
      if (!existing) throw new Error('Sede non trovata.');
      database.transaction(() => {
        database.prepare('UPDATE sites SET name = ?, address = ?, phone = ? WHERE id = ?')
          .run(name, input.address.trim(), input.phone.trim(), input.id);
        if (existing.name !== name) moveSiteReferences(database, existing.name, name);
      })();
    } else {
      const code = uniqueRecognitionCode(database, new Set());
      database.prepare(`INSERT INTO sites (name, address, phone, created_at, site_type, recognition_code)
        VALUES (?, ?, ?, ?, 'store', ?)`)
        .run(name, input.address.trim(), input.phone.trim(), new Date().toISOString(), code);
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes('UNIQUE constraint failed: sites.name')) {
      throw new Error('Esiste già una sede con questo nome.');
    }
    throw error;
  }
}

export function deleteSite(database: Database.Database, siteId: number): void {
  if (!Number.isInteger(siteId) || siteId < 1) throw new Error('Sede non valida.');
  const site = database.prepare('SELECT id, name, site_type FROM sites WHERE id = ?').get(siteId) as
    { id: number; name: string; site_type: 'store' | 'warehouse' } | undefined;
  if (!site) throw new Error('Sede non trovata.');
  const fallbackSite = database.prepare("SELECT id, name FROM sites WHERE id != ? ORDER BY CASE site_type WHEN 'store' THEN 0 ELSE 1 END, id LIMIT 1")
    .get(siteId) as { id: number; name: string } | undefined;
  const assignedEmployees = (database.prepare('SELECT COUNT(*) AS count FROM employees WHERE operational_site = ?')
    .get(site.name) as { count: number }).count;
  if (!fallbackSite && assignedEmployees > 0) throw new Error('Crea un’altra sede prima di eliminare quella assegnata ai dipendenti.');
  database.transaction(() => {
    database.prepare('DELETE FROM payroll_payments WHERE employee_id IN (SELECT id FROM employees WHERE operational_site = ?)').run(site.name);
    if (fallbackSite) {
      database.prepare('UPDATE employees SET operational_site = ? WHERE operational_site = ?').run(fallbackSite.name, site.name);
    }
    database.prepare('DELETE FROM sales WHERE site = ?').run(site.name);
    database.prepare('DELETE FROM expenses WHERE site = ?').run(site.name);
    database.prepare('DELETE FROM refunds WHERE site = ?').run(site.name);
    database.prepare('DELETE FROM stock_movements WHERE site = ? OR destination = ?').run(site.name, site.name);
    database.prepare('DELETE FROM sites WHERE id = ?').run(siteId);
    if (site.site_type === 'warehouse') {
      database.prepare(`INSERT INTO settings (key, value) VALUES ('system_warehouse_deleted', 'true')
        ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run();
    }
    database.prepare(`UPDATE products SET stock = (
      SELECT COALESCE(SUM(stock), 0) FROM site_inventory WHERE site_inventory.product_id = products.id
    )`).run();
  })();
}