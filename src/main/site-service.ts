import { randomInt } from 'node:crypto';
import type Database from 'better-sqlite3';
import type { SiteInput } from '../shared/types';

export const WAREHOUSE_SITE_NAME = 'Magazzino';

const recognitionAlphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';

function uniqueRecognitionCode(database: Database.Database, reservedCodes: Set<string>): string {
  let code = '';
  do {
    code = Array.from({ length: 15 }, () => recognitionAlphabet[randomInt(recognitionAlphabet.length)]).join('');
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
  database.prepare('UPDATE stock_distributions SET from_site = ? WHERE from_site = ?').run(newName, oldName);
  database.prepare('UPDATE stock_distributions SET to_site = ? WHERE to_site = ?').run(newName, oldName);
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
    const legacyWarehouses = database.prepare("SELECT id, name FROM sites WHERE name = 'Magazzino centrale' AND site_type = 'warehouse' ORDER BY id")
      .all() as Array<{ id: number; name: string }>;
    for (const legacy of legacyWarehouses) {
      const currentWarehouse = database.prepare('SELECT id FROM sites WHERE name = ?').get(WAREHOUSE_SITE_NAME) as { id: number } | undefined;
      if (!currentWarehouse) {
        database.prepare("UPDATE sites SET name = ?, site_type = 'store' WHERE id = ?").run(WAREHOUSE_SITE_NAME, legacy.id);
        moveSiteReferences(database, legacy.name, WAREHOUSE_SITE_NAME);
        continue;
      }
      mergeSiteInventory(database, currentWarehouse.id, legacy.id);
      moveSiteReferences(database, legacy.name, WAREHOUSE_SITE_NAME);
      database.prepare('DELETE FROM sites WHERE id = ?').run(legacy.id);
    }

    database.prepare("UPDATE sites SET site_type = 'store' WHERE site_type = 'warehouse'").run();

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
    const expenseFallback = defaultSite?.name ?? '';
    database.prepare("UPDATE expenses SET site = ? WHERE site IN ('Negozio', 'Non assegnata', '')").run(expenseFallback);
    database.prepare("UPDATE sales SET site = ? WHERE site IN ('Negozio', 'Non assegnata', '')").run(expenseFallback);
    database.prepare("UPDATE stock_movements SET site = ? WHERE site = ''").run(defaultSite?.name ?? '');

    const reservedCodes = new Set<string>();
    const sites = database.prepare('SELECT id, recognition_code FROM sites ORDER BY id')
      .all() as Array<{ id: number; recognition_code: string }>;
    const updateCode = database.prepare('UPDATE sites SET recognition_code = ? WHERE id = ?');
    for (const site of sites) {
      const hasValidCode = /^[a-z0-9]{15}$/.test(site.recognition_code) && !reservedCodes.has(site.recognition_code);
      const code = hasValidCode ? site.recognition_code : uniqueRecognitionCode(database, reservedCodes);
      reservedCodes.add(code);
      if (code !== site.recognition_code) updateCode.run(code, site.id);
    }
    database.exec('CREATE UNIQUE INDEX IF NOT EXISTS sites_recognition_code_unique ON sites(recognition_code)');
    const inventorySite = database.prepare("SELECT id FROM sites ORDER BY id LIMIT 1").get() as { id: number } | undefined;
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
    || (input.site_role !== undefined && (typeof input.site_role !== 'string' || input.site_role.trim().length > 80))
    || (input.email !== undefined && (typeof input.email !== 'string' || input.email.length > 254 || (input.email.trim() !== '' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim()))))
    || (input.tax_id !== undefined && (typeof input.tax_id !== 'string' || input.tax_id.length > 32))
    || (input.manager_name !== undefined && (typeof input.manager_name !== 'string' || input.manager_name.length > 100))
    || (input.opening_hours !== undefined && (typeof input.opening_hours !== 'string' || input.opening_hours.length > 200))
    || (input.notes !== undefined && (typeof input.notes !== 'string' || input.notes.length > 1000))
    || (input.id !== undefined && (!Number.isInteger(input.id) || input.id < 1))) {
    throw new Error('I dati della sede non sono validi.');
  }

  const name = input.name.trim();
  const details = {
    site_role: input.site_role?.trim() || 'Punto vendita',
    address: input.address.trim(),
    phone: input.phone.trim(),
    email: input.email?.trim() ?? '',
    tax_id: input.tax_id?.trim() ?? '',
    manager_name: input.manager_name?.trim() ?? '',
    opening_hours: input.opening_hours?.trim() ?? '',
    notes: input.notes?.trim() ?? '',
  };
  try {
    if (input.id !== undefined) {
      const existing = database.prepare('SELECT name FROM sites WHERE id = ?').get(input.id) as
        { name: string } | undefined;
      if (!existing) throw new Error('Sede non trovata.');
      database.transaction(() => {
        database.prepare(`UPDATE sites SET name = @name, site_role = @site_role, site_type = @site_type, address = @address, phone = @phone, email = @email,
          tax_id = @tax_id, manager_name = @manager_name, opening_hours = @opening_hours, notes = @notes WHERE id = @id`)
          .run({ name, ...details, site_type: details.site_role === 'Magazzino' ? 'warehouse' : 'store', id: input.id });
        if (existing.name !== name) moveSiteReferences(database, existing.name, name);
      })();
    } else {
      const code = uniqueRecognitionCode(database, new Set());
      const isFirstSite = !(database.prepare('SELECT 1 FROM sites LIMIT 1').get());
      const result = database.prepare(`INSERT INTO sites
        (name, site_role, address, phone, email, tax_id, manager_name, opening_hours, notes, created_at, site_type, recognition_code)
        VALUES (@name, @site_role, @address, @phone, @email, @tax_id, @manager_name, @opening_hours, @notes, @created_at, @site_type, @code)`)
        .run({ name, ...details, site_type: details.site_role === 'Magazzino' ? 'warehouse' : 'store', created_at: new Date().toISOString(), code });
      if (isFirstSite) {
        database.prepare(`INSERT OR IGNORE INTO site_inventory (product_id, site_id, stock)
          SELECT id, ?, stock FROM products`).run(Number(result.lastInsertRowid));
      }
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
  const site = database.prepare('SELECT id, name FROM sites WHERE id = ?').get(siteId) as
    { id: number; name: string } | undefined;
  if (!site) throw new Error('Sede non trovata.');
  const dependencies = [
    { label: 'vendite', count: (database.prepare('SELECT COUNT(*) AS count FROM sales WHERE site = ?').get(site.name) as { count: number }).count },
    { label: 'spese', count: (database.prepare('SELECT COUNT(*) AS count FROM expenses WHERE site = ?').get(site.name) as { count: number }).count },
    { label: 'rimborsi', count: (database.prepare('SELECT COUNT(*) AS count FROM refunds WHERE site = ?').get(site.name) as { count: number }).count },
    { label: 'movimenti di magazzino', count: (database.prepare('SELECT COUNT(*) AS count FROM stock_movements WHERE site = ? OR destination = ?').get(site.name, site.name) as { count: number }).count },
    { label: 'distribuzioni merce', count: (database.prepare('SELECT COUNT(*) AS count FROM stock_distributions WHERE from_site = ? OR to_site = ?').get(site.name, site.name) as { count: number }).count },
    { label: 'dipendenti assegnati', count: (database.prepare('SELECT COUNT(*) AS count FROM employees WHERE operational_site = ?').get(site.name) as { count: number }).count },
    { label: 'pagamenti stipendi', count: (database.prepare(`SELECT COUNT(*) AS count FROM payroll_payments
      WHERE employee_id IN (SELECT id FROM employees WHERE operational_site = ?)`).get(site.name) as { count: number }).count },
    { label: 'articoli con giacenza positiva', count: (database.prepare('SELECT COUNT(*) AS count FROM site_inventory WHERE site_id = ? AND stock > 0').get(siteId) as { count: number }).count },
  ].filter((dependency) => dependency.count > 0);
  if (dependencies.length) {
    throw new Error(`Impossibile eliminare la sede "${site.name}". Prima elimina o riassegna i dati associati: ${dependencies.map(({ label, count }) => `${label} (${count})`).join(', ')}.`);
  }
  database.transaction(() => {
    database.prepare('DELETE FROM sites WHERE id = ?').run(siteId);
    const configuredMainSite = (database.prepare("SELECT value FROM settings WHERE key = 'main_site_id'").get() as { value?: string } | undefined)?.value;
    if (configuredMainSite === String(siteId)) {
      const fallbackSite = database.prepare('SELECT id FROM sites ORDER BY id LIMIT 1').get() as { id: number } | undefined;
      database.prepare(`INSERT INTO settings (key, value) VALUES ('main_site_id', ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(fallbackSite ? String(fallbackSite.id) : '');
    }
    database.prepare(`UPDATE products SET stock = (
      SELECT COALESCE(SUM(stock), 0) FROM site_inventory WHERE site_inventory.product_id = products.id
    )`).run();
  })();
}