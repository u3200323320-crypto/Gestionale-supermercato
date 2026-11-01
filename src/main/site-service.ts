import { randomInt } from 'node:crypto';
import type Database from 'better-sqlite3';
import type { SiteInput } from '../shared/types';

export const MAIN_SITE_NAME = 'Punto vendita principale';
export const WAREHOUSE_SITE_NAME = 'Magazzino';

const recognitionAlphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';

function uniqueRecognitionCode(database: Database.Database, usedCodes: Set<string>): string {
  let code = '';
  do {
    code = Array.from({ length: 10 }, () => recognitionAlphabet[randomInt(recognitionAlphabet.length)]).join('');
  } while (usedCodes.has(code) || database.prepare('SELECT 1 FROM sites WHERE recognition_code = ?').get(code));
  usedCodes.add(code);
  return code;
}

function updateSiteReferences(database: Database.Database, oldName: string): void {
  for (const table of ['employees', 'sales', 'expenses']) {
    const column = table === 'employees' ? 'operational_site' : 'site';
    database.prepare(`UPDATE ${table} SET ${column} = ? WHERE ${column} = ?`).run(MAIN_SITE_NAME, oldName);
  }
  database.prepare('UPDATE stock_movements SET site = ? WHERE site = ?').run(MAIN_SITE_NAME, oldName);
  database.prepare('UPDATE stock_movements SET destination = ? WHERE destination = ?').run(MAIN_SITE_NAME, oldName);
}

export function migrateSites(database: Database.Database): void {
  database.transaction(() => {
    let mainSite = database.prepare('SELECT id FROM sites WHERE name = ?').get(MAIN_SITE_NAME) as { id: number } | undefined;
    const legacySites = database.prepare("SELECT id, name FROM sites WHERE name IN ('Magazzino centrale', 'Sede principale') ORDER BY id")
      .all() as Array<{ id: number; name: string }>;

    for (const legacy of legacySites) {
      if (!mainSite) {
        database.prepare("UPDATE sites SET name = ?, site_type = 'store' WHERE id = ?").run(MAIN_SITE_NAME, legacy.id);
        updateSiteReferences(database, legacy.name);
        mainSite = { id: legacy.id };
        continue;
      }

      database.prepare(`INSERT INTO site_inventory (product_id, site_id, stock)
        SELECT product_id, ?, stock FROM site_inventory WHERE site_id = ?
        ON CONFLICT(product_id, site_id) DO UPDATE SET stock = site_inventory.stock + excluded.stock`).run(mainSite.id, legacy.id);
      updateSiteReferences(database, legacy.name);
      database.prepare('DELETE FROM site_inventory WHERE site_id = ?').run(legacy.id);
      database.prepare('DELETE FROM sites WHERE id = ?').run(legacy.id);
    }

    database.prepare("INSERT OR IGNORE INTO sites (name, address, phone, created_at, site_type, recognition_code) VALUES (?, '', '', ?, 'store', '')")
      .run(MAIN_SITE_NAME, new Date().toISOString());
    database.prepare("INSERT OR IGNORE INTO sites (name, address, phone, created_at, site_type, recognition_code) VALUES (?, '', '', ?, 'warehouse', '')")
      .run(WAREHOUSE_SITE_NAME, new Date().toISOString());
    database.prepare("UPDATE sites SET site_type = 'warehouse' WHERE name = ?").run(WAREHOUSE_SITE_NAME);
    database.prepare(`INSERT OR IGNORE INTO sites (name, address, phone, created_at, site_type, recognition_code)
      SELECT DISTINCT operational_site, '', '', ?, 'store', '' FROM employees
      WHERE TRIM(operational_site) != '' AND operational_site NOT IN (?, ?)`)
      .run(new Date().toISOString(), MAIN_SITE_NAME, WAREHOUSE_SITE_NAME);
    database.prepare("UPDATE expenses SET site = ? WHERE site IN ('Negozio', 'Non assegnata', '')").run(MAIN_SITE_NAME);

    const usedCodes = new Set<string>();
    const sites = database.prepare('SELECT id, recognition_code FROM sites ORDER BY id').all() as Array<{ id: number; recognition_code: string }>;
    const updateCode = database.prepare('UPDATE sites SET recognition_code = ? WHERE id = ?');
    for (const site of sites) {
      const code = /^[a-z0-9]{10}$/.test(site.recognition_code) && !usedCodes.has(site.recognition_code)
        ? site.recognition_code
        : uniqueRecognitionCode(database, usedCodes);
      usedCodes.add(code);
      if (code !== site.recognition_code) updateCode.run(code, site.id);
    }
    database.exec('CREATE UNIQUE INDEX IF NOT EXISTS sites_recognition_code_unique ON sites(recognition_code)');
    database.prepare(`INSERT OR IGNORE INTO site_inventory (product_id, site_id, stock)
      SELECT products.id, sites.id, products.stock FROM products JOIN sites ON sites.name = ?`).run(MAIN_SITE_NAME);
  })();
}

export function saveSite(database: Database.Database, input: SiteInput): void {
  if (!input || typeof input.name !== 'string' || !input.name.trim() || input.name.trim().length > 80
    || typeof input.address !== 'string' || input.address.length > 200
    || typeof input.phone !== 'string' || input.phone.length > 40
    || (input.id !== undefined && (!Number.isInteger(input.id) || input.id < 1))) throw new Error('I dati della sede non sono validi.');

  const name = input.name.trim();
  try {
    if (input.id !== undefined) {
      const existing = database.prepare('SELECT name, site_type FROM sites WHERE id = ?').get(input.id) as { name: string; site_type: 'store' | 'warehouse' } | undefined;
      if (!existing) throw new Error('Sede non trovata.');
      if ((existing.site_type === 'warehouse' || existing.name === MAIN_SITE_NAME) && name !== existing.name) {
        throw new Error('Il nome della sede principale e del Magazzino non può essere modificato.');
      }
      database.transaction(() => {
        database.prepare('UPDATE sites SET name = ?, address = ?, phone = ? WHERE id = ?')
          .run(name, input.address.trim(), input.phone.trim(), input.id);
        if (existing.name !== name) updateSiteReferences(database, existing.name);
      })();
    } else {
      const code = uniqueRecognitionCode(database, new Set());
      database.prepare(`INSERT INTO sites (name, address, phone, created_at, site_type, recognition_code)
        VALUES (?, ?, ?, ?, 'store', ?)`)
        .run(name, input.address.trim(), input.phone.trim(), new Date().toISOString(), code);
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes('UNIQUE constraint failed: sites.name')) throw new Error('Esiste già una sede con questo nome.');
    throw error;
  }
}

export function deleteSite(database: Database.Database, siteId: number): void {
  if (!Number.isInteger(siteId) || siteId < 1) throw new Error('Sede non valida.');
  const site = database.prepare('SELECT id, name, site_type FROM sites WHERE id = ?').get(siteId) as { id: number; name: string; site_type: 'store' | 'warehouse' } | undefined;
  if (!site) throw new Error('Sede non trovata.');
  if (site.site_type === 'warehouse' || site.name === MAIN_SITE_NAME) throw new Error('La sede principale e il Magazzino non possono essere eliminati.');
  const used = database.prepare(`SELECT
    (SELECT COUNT(*) FROM employees WHERE operational_site = ?) +
    (SELECT COUNT(*) FROM sales WHERE site = ?) +
    (SELECT COUNT(*) FROM expenses WHERE site = ?) +
    (SELECT COUNT(*) FROM stock_movements WHERE site = ?) AS count`).get(site.name, site.name, site.name, site.name) as { count: number };
  if (used.count > 0) throw new Error('La sede contiene dipendenti, vendite o spese e non può essere eliminata.');
  const stock = (database.prepare('SELECT COALESCE(SUM(stock), 0) AS quantity FROM site_inventory WHERE site_id = ?')
    .get(siteId) as { quantity: number }).quantity;
  if (stock > 0) throw new Error('Trasferisci prima tutte le giacenze della sede prima di eliminarla.');
  database.prepare('DELETE FROM sites WHERE id = ?').run(siteId);
}