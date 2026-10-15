import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import Database from 'better-sqlite3';
import PDFDocument from 'pdfkit';
import { randomInt, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { calculatePromotionDiscounts } from '../shared/promotions';
import type { CheckoutInput, Product, ProductInput, Promotion, PromotionInput, SaleItem } from '../shared/types';

let database: Database.Database;
let mainWindow: BrowserWindow;
let databaseFile = '';

function localDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function localDayBounds(day: string): [string, string] {
  const [year, month, date] = day.split('-').map(Number);
  const start = new Date(year, month - 1, date);
  const end = new Date(year, month - 1, date + 1);
  return [start.toISOString(), end.toISOString()];
}

const seedProducts: ProductInput[] = [
  { code: '8000500031123', name: 'Latte intero 1 L', category: 'Latticini', sale_price: 1.49, purchase_price: 0.92, stock: 36, low_stock_threshold: 8 },
  { code: '8000430132246', name: 'Pasta penne 500 g', category: 'Dispensa', sale_price: 0.89, purchase_price: 0.43, stock: 52, low_stock_threshold: 12 },
  { code: '8013355991207', name: 'Olio extravergine 1 L', category: 'Dispensa', sale_price: 8.9, purchase_price: 6.2, stock: 5, low_stock_threshold: 8 },
  { code: '8001505005707', name: 'Pane integrale 400 g', category: 'Panetteria', sale_price: 2.19, purchase_price: 1.3, stock: 18, low_stock_threshold: 6 },
  { code: '8000330200051', name: 'Yogurt bianco 2 pz', category: 'Latticini', sale_price: 1.25, purchase_price: 0.7, stock: 24, low_stock_threshold: 8 },
  { code: '8001250123104', name: 'Pomodori ramati 1 kg', category: 'Ortofrutta', sale_price: 2.49, purchase_price: 1.2, stock: 14, low_stock_threshold: 5 },
  { code: '8004030060014', name: 'Uova fresche 6 pz', category: 'Latticini', sale_price: 2.79, purchase_price: 1.65, stock: 3, low_stock_threshold: 6 },
  { code: '8003753152005', name: 'Acqua naturale 1,5 L', category: 'Bevande', sale_price: 0.45, purchase_price: 0.2, stock: 48, low_stock_threshold: 12 },
  { code: '8002700003338', name: 'Caffè macinato 250 g', category: 'Dispensa', sale_price: 3.99, purchase_price: 2.7, stock: 16, low_stock_threshold: 5 },
  { code: '8001090125513', name: 'Mele golden 1 kg', category: 'Ortofrutta', sale_price: 2.15, purchase_price: 1.15, stock: 22, low_stock_threshold: 7 },
  { code: '8006540123002', name: 'Detersivo piatti 500 ml', category: 'Casa', sale_price: 1.79, purchase_price: 0.96, stock: 20, low_stock_threshold: 5 },
  { code: '8001250007250', name: 'Cioccolato fondente 100 g', category: 'Dolci', sale_price: 1.49, purchase_price: 0.82, stock: 31, low_stock_threshold: 8 },
];

function setting(key: string, fallback = ''): string {
  return (database.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value?: string } | undefined)?.value ?? fallback;
}

function setSetting(key: string, value: string): void {
  database.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value);
}

function saleItems(saleId: number): SaleItem[] {
  return database.prepare('SELECT product_id, name, code, unit, quantity, unit_price, purchase_price FROM sale_items WHERE sale_id = ?').all(saleId) as SaleItem[];
}

function allPromotions(): Promotion[] {
  return database.prepare('SELECT * FROM promotions ORDER BY starts_at DESC').all() as Promotion[];
}

function allSales(): unknown[] {
  const sales = database.prepare(`SELECT s.*, COALESCE(SUM(i.quantity), 0) AS item_count
    FROM sales s LEFT JOIN sale_items i ON i.sale_id = s.id GROUP BY s.id ORDER BY s.created_at DESC`).all() as Array<Record<string, unknown>>;
  return sales.map((sale) => ({ ...sale, items: saleItems(sale.id as number) }));
}

function state() {
  return {
    products: (database.prepare('SELECT * FROM products ORDER BY name').all() as Array<Omit<Product, 'expiry_enabled'> & { expiry_enabled: number }>).map((product) => ({ ...product, expiry_enabled: Boolean(product.expiry_enabled) })),
    sales: allSales(),
    stockMovements: database.prepare('SELECT * FROM stock_movements ORDER BY created_at DESC, id DESC').all(),
    promotions: database.prepare('SELECT * FROM promotions ORDER BY starts_at DESC').all(),
    settings: { shop_name: setting('shop_name', 'Il tuo supermercato'), shop_logo: setting('shop_logo'), archive_folder: setting('archive_folder', join(app.getPath('documents'), 'Gestionale-Archivio')), database_file: databaseFile },
  };
}

function initDatabase(): void {
  databaseFile = join(app.getPath('userData'), 'gestionale.sqlite');
  database = new Database(databaseFile);
  database.pragma('journal_mode = WAL');
  database.pragma('foreign_keys = ON');
  database.exec(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT NOT NULL UNIQUE, name TEXT NOT NULL, unit TEXT NOT NULL DEFAULT 'PEZZO',
      category TEXT NOT NULL DEFAULT 'Altro', sale_price REAL NOT NULL, purchase_price REAL NOT NULL,
      stock REAL NOT NULL DEFAULT 0, low_stock_threshold REAL NOT NULL DEFAULT 5,
      expiry_enabled INTEGER NOT NULL DEFAULT 0, expiry_date TEXT
    );
    CREATE TABLE IF NOT EXISTS sales (
      id INTEGER PRIMARY KEY AUTOINCREMENT, receipt_no TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL, payment_method TEXT NOT NULL, discount REAL NOT NULL DEFAULT 0,
      total REAL NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS sale_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT, sale_id INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
      product_id INTEGER NOT NULL, name TEXT NOT NULL, code TEXT NOT NULL, unit TEXT NOT NULL DEFAULT 'PEZZO', quantity REAL NOT NULL,
      unit_price REAL NOT NULL, purchase_price REAL NOT NULL
    );
    CREATE TABLE IF NOT EXISTS promotions (
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, percentage REAL NOT NULL,
      discount_type TEXT NOT NULL DEFAULT 'percentage', buy_quantity INTEGER NOT NULL DEFAULT 2, free_quantity INTEGER NOT NULL DEFAULT 1,
      category TEXT NOT NULL, starts_at TEXT NOT NULL, ends_at TEXT NOT NULL,
      minimum_spend REAL NOT NULL DEFAULT 0,
      minimum_kilograms REAL NOT NULL DEFAULT 0, minimum_pieces REAL NOT NULL DEFAULT 0, minimum_liters REAL NOT NULL DEFAULT 0,
      application_mode TEXT NOT NULL CHECK(application_mode IN ('Automatica', 'Manuale'))
    );
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS stock_movements (
      id INTEGER PRIMARY KEY AUTOINCREMENT, product_id INTEGER NOT NULL, product_name TEXT NOT NULL,
      movement_type TEXT NOT NULL CHECK(movement_type IN ('Carico', 'Scarico')),
      quantity REAL NOT NULL, created_at TEXT NOT NULL, note TEXT NOT NULL DEFAULT ''
    );
  `);
  const saleColumns = database.prepare('PRAGMA table_info(sales)').all() as Array<{ name: string }>;
  if (!saleColumns.some((column) => column.name === 'gross_total')) {
    database.exec('ALTER TABLE sales ADD COLUMN gross_total REAL NOT NULL DEFAULT 0');
    database.exec(`UPDATE sales SET gross_total = COALESCE(
      (SELECT SUM(i.quantity * p.sale_price) FROM sale_items i JOIN products p ON p.id = i.product_id WHERE i.sale_id = sales.id),
      total + discount
    )`);
  }
  const promotionColumns = database.prepare('PRAGMA table_info(promotions)').all() as Array<{ name: string }>;
  for (const [column, definition] of [
    ['discount_type', "TEXT NOT NULL DEFAULT 'percentage'"],
    ['buy_quantity', 'INTEGER NOT NULL DEFAULT 2'],
    ['free_quantity', 'INTEGER NOT NULL DEFAULT 1'],
  ]) {
    if (!promotionColumns.some((existing) => existing.name === column)) {
      database.exec(`ALTER TABLE promotions ADD COLUMN ${column} ${definition}`);
    }
  }
  if (!promotionColumns.some((column) => column.name === 'minimum_spend')) {
    database.exec('ALTER TABLE promotions ADD COLUMN minimum_spend REAL NOT NULL DEFAULT 0');
  }
  for (const column of ['minimum_kilograms', 'minimum_pieces', 'minimum_liters']) {
    if (!promotionColumns.some((existing) => existing.name === column)) {
      database.exec(`ALTER TABLE promotions ADD COLUMN ${column} REAL NOT NULL DEFAULT 0`);
    }
  }
  const productColumns = database.prepare('PRAGMA table_info(products)').all() as Array<{ name: string }>;
  if (!productColumns.some((column) => column.name === 'unit')) {
    database.exec("ALTER TABLE products ADD COLUMN unit TEXT NOT NULL DEFAULT 'PEZZO'");
  }
  if (!productColumns.some((column) => column.name === 'expiry_enabled')) {
    database.exec('ALTER TABLE products ADD COLUMN expiry_enabled INTEGER NOT NULL DEFAULT 0');
  }
  if (!productColumns.some((column) => column.name === 'expiry_date')) {
    database.exec('ALTER TABLE products ADD COLUMN expiry_date TEXT');
  }
  const saleItemColumns = database.prepare('PRAGMA table_info(sale_items)').all() as Array<{ name: string }>;
  if (!saleItemColumns.some((column) => column.name === 'unit')) {
    database.exec("ALTER TABLE sale_items ADD COLUMN unit TEXT NOT NULL DEFAULT 'PEZZO'");
  }
  if (setting('stock_movements_sales_backfilled') !== '1') {
    const previousSales = database.prepare(`SELECT i.product_id, i.name, i.quantity, s.created_at, s.receipt_no
      FROM sale_items i JOIN sales s ON s.id = i.sale_id ORDER BY s.created_at, i.id`).all() as Array<{
      product_id: number; name: string; quantity: number; created_at: string; receipt_no: string;
    }>;
    const insertMovement = database.prepare(`INSERT INTO stock_movements (product_id, product_name, movement_type, quantity, created_at, note)
      VALUES (?, ?, 'Scarico', ?, ?, ?)`);
    database.transaction(() => {
      previousSales.forEach((sale) => insertMovement.run(sale.product_id, sale.name, sale.quantity, sale.created_at, `Vendita #${sale.receipt_no}`));
      setSetting('stock_movements_sales_backfilled', '1');
    })();
  }
  if (!app.isPackaged && (database.prepare('SELECT COUNT(*) AS count FROM products').get() as { count: number }).count === 0) {
    const insert = database.prepare('INSERT INTO products (code, name, category, sale_price, purchase_price, stock, low_stock_threshold) VALUES (@code, @name, @category, @sale_price, @purchase_price, @stock, @low_stock_threshold)');
    database.transaction(() => seedProducts.forEach((product) => insert.run(product)))();
  }
}

function receiptNumber(): string {
  for (let attempt = 0; attempt < 5000; attempt += 1) {
    const candidate = String(randomInt(10000, 100000));
    if (!database.prepare('SELECT 1 FROM sales WHERE receipt_no = ?').get(candidate)) return candidate;
  }
  throw new Error('Impossibile generare un numero scontrino univoco.');
}

function replaceItems(saleId: number, items: SaleItem[]): void {
  const oldItems = saleItems(saleId);
  const adjustStock = database.prepare('UPDATE products SET stock = stock + ? WHERE id = ?');
  oldItems.forEach((item) => adjustStock.run(item.quantity, item.product_id));
  database.prepare('DELETE FROM sale_items WHERE sale_id = ?').run(saleId);
  const addItem = database.prepare(`INSERT INTO sale_items (sale_id, product_id, name, code, unit, quantity, unit_price, purchase_price)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
  for (const item of items) {
    if (!Number.isFinite(item.quantity) || item.quantity <= 0 || !Number.isFinite(item.unit_price) || item.unit_price < 0) throw new Error('Quantità o prezzo non validi.');
    const product = database.prepare('SELECT stock FROM products WHERE id = ?').get(item.product_id) as { stock: number } | undefined;
    if (!product || product.stock < item.quantity) throw new Error(`Scorta insufficiente per ${item.name}.`);
    adjustStock.run(-item.quantity, item.product_id);
    addItem.run(saleId, item.product_id, item.name, item.code, item.unit ?? 'PEZZO', item.quantity, item.unit_price, item.purchase_price);
  }
}

function recordStockMovement(productId: number, productName: string, type: 'Carico' | 'Scarico', quantity: number, note: string): void {
  database.prepare(`INSERT INTO stock_movements (product_id, product_name, movement_type, quantity, created_at, note)
    VALUES (?, ?, ?, ?, ?, ?)`).run(productId, productName, type, quantity, new Date().toISOString(), note);
}

function archiveDay(day: string): Promise<void> {
  const [dayStart, dayEnd] = localDayBounds(day);
  const folder = setting('archive_folder', join(app.getPath('documents'), 'Gestionale-Archivio'));
  const sections = [
    { name: 'Magazzino', body: () => (database.prepare('SELECT code, name, category, sale_price, purchase_price, stock FROM products ORDER BY name').all() as Array<Record<string, unknown>>).map((p) => `${p.code}\t${p.name}\t${p.category}\t${p.stock}\t${p.sale_price}\t${p.purchase_price}`).join('\n') },
    { name: 'Vendite', body: () => (database.prepare('SELECT receipt_no, created_at, payment_method, total FROM sales WHERE created_at >= ? AND created_at < ? ORDER BY created_at').all(dayStart, dayEnd) as Array<Record<string, unknown>>).map((s) => `${s.receipt_no}\t${s.created_at}\t${s.payment_method}\t${s.total}`).join('\n') },
    { name: 'Cassa', body: () => (database.prepare(`SELECT s.receipt_no, i.name, i.quantity, i.unit_price FROM sale_items i JOIN sales s ON s.id = i.sale_id WHERE s.created_at >= ? AND s.created_at < ? ORDER BY s.created_at`).all(dayStart, dayEnd) as Array<Record<string, unknown>>).map((i) => `${i.receipt_no}\t${i.name}\t${i.quantity}\t${i.unit_price}`).join('\n') },
    { name: 'Promozioni', body: () => (database.prepare('SELECT name, percentage, discount_type, buy_quantity, free_quantity, category, starts_at, ends_at, minimum_spend, application_mode FROM promotions ORDER BY starts_at').all() as Array<Record<string, unknown>>).map((p) => {
      const discount = p.discount_type === 'buy_get' ? `${p.buy_quantity}+${p.free_quantity}` : `${p.percentage}%`;
      return `${p.name}\t${discount}\t${p.category}\t${p.starts_at}\t${p.ends_at}\tMinimo ${p.minimum_spend} EUR\t${p.application_mode}`;
    }).join('\n') },
    { name: 'Statistiche', body: () => {
      const row = database.prepare(`SELECT COUNT(*) AS transactions, COALESCE(SUM(total), 0) AS net, COALESCE(SUM((SELECT SUM(quantity) FROM sale_items WHERE sale_id = sales.id)), 0) AS quantity FROM sales WHERE created_at >= ? AND created_at < ?`).get(dayStart, dayEnd) as { transactions: number; net: number; quantity: number };
      return `Data: ${day}\nVendite: ${row.transactions}\nNetto: ${row.net.toFixed(2)} EUR\nPezzi venduti: ${row.quantity}`;
    } },
  ];
  return Promise.all(sections.map(({ name, body }) => new Promise<void>((resolve, reject) => {
    const dir = join(folder, name);
    mkdirSync(dir, { recursive: true });
    const text = body() || 'Nessun dato';
    writeFileSync(join(dir, `${day}.txt`), text, 'utf8');
    const doc = new PDFDocument({ margin: 44 });
    const stream = doc.pipe(require('node:fs').createWriteStream(join(dir, `${day}.pdf`)));
    doc.fontSize(16).text(`${name} · ${day}`, { continued: false }).moveDown().fontSize(10).text(text);
    doc.end();
    stream.on('finish', resolve);
    stream.on('error', reject);
  }))).then(() => undefined);
}

async function archiveMissingDays(): Promise<void> {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const lastDay = localDate(yesterday);
  const lastArchivedDay = setting('last_archive_day');
  if (!lastArchivedDay) {
    await archiveDay(lastDay);
    setSetting('last_archive_day', lastDay);
    return;
  }
  const [year, month, date] = lastArchivedDay.split('-').map(Number);
  const nextDay = new Date(year, month - 1, date + 1);
  while (localDate(nextDay) <= lastDay) {
    const day = localDate(nextDay);
    await archiveDay(day);
    setSetting('last_archive_day', day);
    nextDay.setDate(nextDay.getDate() + 1);
  }
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    fullscreen: true,
    autoHideMenuBar: true,
    minWidth: 1120,
    minHeight: 720,
    backgroundColor: '#f6f7f5',
    title: 'Gestione Supermercato',
    webPreferences: { preload: join(__dirname, '../preload/index.js'), contextIsolation: true, nodeIntegration: false },
  });
  if (process.env.ELECTRON_RENDERER_URL) mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  else mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
}

app.whenReady().then(() => {
  initDatabase();
  ipcMain.handle('state:get', () => state());
  ipcMain.handle('pin:has', () => Boolean(setting('pin_hash')));
  ipcMain.handle('pin:verify', (_event, pin: string) => {
    const stored = setting('pin_hash');
    if (!stored) return true;
    const [salt, hash] = stored.split(':');
    return timingSafeEqual(scryptSync(pin, salt, 64), Buffer.from(hash, 'hex'));
  });
  ipcMain.handle('pin:set', (_event, pin: string) => {
    if (!/^\d{4,8}$/.test(pin)) throw new Error('Il PIN deve contenere da 4 a 8 cifre.');
    const salt = randomBytes(16).toString('hex');
    setSetting('pin_hash', `${salt}:${scryptSync(pin, salt, 64).toString('hex')}`);
  });
  ipcMain.handle('product:save', (_event, product: ProductInput) => {
    const expiryDate = product.expiry_date ? new Date(`${product.expiry_date}T00:00:00`) : null;
    if (!product.name.trim() || !product.code.trim() || product.sale_price < 0 || product.purchase_price < 0 || product.stock < 0
      || (product.expiry_enabled && (!product.expiry_date || !/^\d{4}-\d{2}-\d{2}$/.test(product.expiry_date) || !expiryDate || Number.isNaN(expiryDate.getTime()) || localDate(expiryDate) !== product.expiry_date))) {
      throw new Error('Controlla i dati dell’articolo e la data di scadenza.');
    }
    database.prepare(`INSERT INTO products (code, name, unit, category, sale_price, purchase_price, stock, low_stock_threshold, expiry_enabled, expiry_date)
      VALUES (@code, @name, @unit, @category, @sale_price, @purchase_price, @stock, @low_stock_threshold, @expiry_enabled, @expiry_date)
      ON CONFLICT(code) DO UPDATE SET name=excluded.name, category=excluded.category, sale_price=excluded.sale_price,
      unit=excluded.unit, purchase_price=excluded.purchase_price, stock=excluded.stock, low_stock_threshold=excluded.low_stock_threshold,
      expiry_enabled=excluded.expiry_enabled, expiry_date=excluded.expiry_date`).run({
      ...product,
      unit: product.unit ?? 'PEZZO',
      expiry_enabled: product.expiry_enabled ? 1 : 0,
      expiry_date: product.expiry_enabled ? product.expiry_date : null,
    });
  });
  ipcMain.handle('product:stock', (_event, productId: number, stock: number) => {
    if (!Number.isInteger(productId) || productId < 1 || !Number.isFinite(stock) || stock < 0) {
      throw new Error('La nuova giacenza non è valida.');
    }
    const result = database.prepare('UPDATE products SET stock = ? WHERE id = ?').run(stock, productId);
    if (result.changes === 0) throw new Error('Articolo non trovato.');
  });
  ipcMain.handle('product:move-stock', (_event, movement: { productId: number; type: 'Carico' | 'Scarico'; quantity: number; note: string }) => {
    if (!Number.isInteger(movement.productId) || movement.productId < 1 || !['Carico', 'Scarico'].includes(movement.type)
      || !Number.isFinite(movement.quantity) || movement.quantity <= 0 || typeof movement.note !== 'string') {
      throw new Error('I dati del movimento di magazzino non sono validi.');
    }
    database.transaction(() => {
      const product = database.prepare('SELECT name, stock FROM products WHERE id = ?').get(movement.productId) as { name: string; stock: number } | undefined;
      if (!product) throw new Error('Articolo non trovato.');
      if (movement.type === 'Scarico' && product.stock < movement.quantity) throw new Error('La quantità da scaricare supera la giacenza disponibile.');
      const delta = movement.type === 'Carico' ? movement.quantity : -movement.quantity;
      database.prepare('UPDATE products SET stock = stock + ? WHERE id = ?').run(delta, movement.productId);
      recordStockMovement(movement.productId, product.name, movement.type, movement.quantity, movement.note.trim());
    })();
  });
  ipcMain.handle('sale:checkout', (_event, sale: CheckoutInput) => {
    if (!sale.items.length) throw new Error('Il carrello è vuoto.');
    const products = database.prepare('SELECT * FROM products').all() as Product[];
    const items = sale.items.map((item) => {
      const product = products.find((candidate) => candidate.id === item.product_id);
      if (!product) throw new Error(`Articolo non trovato: ${item.name}.`);
      return { ...item, name: product.name, code: product.code, unit: product.unit ?? 'PEZZO', unit_price: product.sale_price, purchase_price: product.purchase_price };
    });
    const discounts = calculatePromotionDiscounts(allPromotions(), products, items, localDate(new Date()), sale.manual_promotion_id, sale.automatic_promotion_id);
    if (sale.manual_promotion_id !== undefined && !discounts.manualPromotion) {
      throw new Error('L’offerta selezionata non è più applicabile: controlla il periodo, la categoria e la spesa minima.');
    }
    if (!Number.isFinite(sale.additional_discount) || sale.additional_discount < 0) throw new Error('Lo sconto aggiuntivo non è valido.');
    const grossTotal = items.reduce((sum, item) => sum + item.quantity * item.unit_price, 0);
    const discount = discounts.automaticDiscount + discounts.manualDiscount + sale.additional_discount;
    if (discount > grossTotal) throw new Error('Lo sconto supera il totale della vendita.');
    const createSale = database.transaction(() => {
      const receiptNo = receiptNumber();
      const result = database.prepare('INSERT INTO sales (receipt_no, created_at, payment_method, discount, gross_total, total) VALUES (?, ?, ?, ?, ?, ?)')
        .run(receiptNo, new Date().toISOString(), sale.payment_method, discount, grossTotal, Math.max(0, grossTotal - discount));
      replaceItems(Number(result.lastInsertRowid), items);
      items.forEach((item) => recordStockMovement(item.product_id, item.name, 'Scarico', item.quantity, `Vendita #${receiptNo}`));
      return Number(result.lastInsertRowid);
    });
    const id = createSale();
    return allSales().find((saleItem) => (saleItem as { id: number }).id === id);
  });
  ipcMain.handle('sale:update', (_event, sale: { id: number; payment_method: string; discount: number; items: SaleItem[] }) => {
    database.transaction(() => {
      const previousQuantities = new Map<number, { quantity: number; name: string }>();
      saleItems(sale.id).forEach((item) => {
        const current = previousQuantities.get(item.product_id);
        previousQuantities.set(item.product_id, { quantity: (current?.quantity ?? 0) + item.quantity, name: item.name });
      });
      const nextQuantities = new Map<number, { quantity: number; name: string }>();
      sale.items.forEach((item) => {
        const current = nextQuantities.get(item.product_id);
        nextQuantities.set(item.product_id, { quantity: (current?.quantity ?? 0) + item.quantity, name: item.name });
      });
      replaceItems(sale.id, sale.items);
      const receipt = database.prepare('SELECT receipt_no FROM sales WHERE id = ?').get(sale.id) as { receipt_no: string } | undefined;
      new Set([...previousQuantities.keys(), ...nextQuantities.keys()]).forEach((productId) => {
        const previous = previousQuantities.get(productId);
        const next = nextQuantities.get(productId);
        const difference = (next?.quantity ?? 0) - (previous?.quantity ?? 0);
        if (difference) {
          recordStockMovement(productId, next?.name ?? previous?.name ?? 'Articolo', difference > 0 ? 'Scarico' : 'Carico', Math.abs(difference), `Modifica vendita #${receipt?.receipt_no ?? sale.id}`);
        }
      });
      const grossTotal = sale.items.reduce((sum, item) => sum + item.quantity * item.unit_price, 0);
      database.prepare('UPDATE sales SET payment_method=?, discount=?, gross_total=?, total=? WHERE id=?')
        .run(sale.payment_method, sale.discount, grossTotal, Math.max(0, grossTotal - sale.discount), sale.id);
    })();
  });
  ipcMain.handle('sale:delete', (_event, id: number) => {
    database.transaction(() => {
      const receipt = database.prepare('SELECT receipt_no FROM sales WHERE id = ?').get(id) as { receipt_no: string } | undefined;
      saleItems(id).forEach((item) => {
        database.prepare('UPDATE products SET stock=stock+? WHERE id=?').run(item.quantity, item.product_id);
        recordStockMovement(item.product_id, item.name, 'Carico', item.quantity, `Vendita #${receipt?.receipt_no ?? id} eliminata`);
      });
      database.prepare('DELETE FROM sales WHERE id=?').run(id);
    })();
  });
  ipcMain.handle('promotion:save', (_event, promotion: PromotionInput) => {
    const minimums = [promotion.minimum_spend, promotion.minimum_kilograms ?? 0, promotion.minimum_pieces ?? 0, promotion.minimum_liters ?? 0];
    const invalidDiscount = promotion.discount_type === 'percentage'
      ? !Number.isFinite(promotion.percentage) || promotion.percentage < 1 || promotion.percentage > 100
      : promotion.discount_type !== 'buy_get' || !Number.isInteger(promotion.buy_quantity) || promotion.buy_quantity < 1
        || !Number.isInteger(promotion.free_quantity) || promotion.free_quantity < 1;
    if (!promotion.name.trim() || invalidDiscount
      || minimums.some((value) => !Number.isFinite(value) || value < 0) || minimums.filter((value) => value > 0).length > 1
      || promotion.ends_at < promotion.starts_at) {
      throw new Error('Controlla i dati della promozione.');
    }
    const values = { ...promotion, minimum_kilograms: promotion.minimum_kilograms ?? 0, minimum_pieces: promotion.minimum_pieces ?? 0, minimum_liters: promotion.minimum_liters ?? 0 };
    if (promotion.id === undefined) {
      database.prepare(`INSERT INTO promotions (name, percentage, discount_type, buy_quantity, free_quantity, category, starts_at, ends_at, minimum_spend,
        minimum_kilograms, minimum_pieces, minimum_liters, application_mode)
        VALUES (@name, @percentage, @discount_type, @buy_quantity, @free_quantity, @category, @starts_at, @ends_at, @minimum_spend,
        @minimum_kilograms, @minimum_pieces, @minimum_liters, @application_mode)`).run(values);
      return;
    }
    const result = database.prepare(`UPDATE promotions SET name=@name, percentage=@percentage, discount_type=@discount_type,
      buy_quantity=@buy_quantity, free_quantity=@free_quantity, category=@category,
      starts_at=@starts_at, ends_at=@ends_at, minimum_spend=@minimum_spend, minimum_kilograms=@minimum_kilograms,
      minimum_pieces=@minimum_pieces, minimum_liters=@minimum_liters, application_mode=@application_mode WHERE id=@id`).run(values);
    if (result.changes === 0) throw new Error('Promozione non trovata.');
  });
  ipcMain.handle('promotion:delete', (_event, id: number) => {
    const result = database.prepare('DELETE FROM promotions WHERE id = ?').run(id);
    if (result.changes === 0) throw new Error('Promozione non trovata.');
  });
  ipcMain.handle('settings:save', (_event, key: string, value: string) => {
    if (!['shop_name', 'archive_folder'].includes(key)) throw new Error('Impostazione non valida.');
    setSetting(key, value);
  });
  ipcMain.handle('settings:choose-shop-logo', async () => {
    const result = await dialog.showOpenDialog(mainWindow, { properties: ['openFile'], filters: [{ name: 'Immagini', extensions: ['png', 'jpg', 'jpeg', 'webp'] }] });
    if (result.canceled || !result.filePaths[0]) return null;
    const filePath = result.filePaths[0];
    const image = readFileSync(filePath);
    if (image.length > 5 * 1024 * 1024) throw new Error('Il logo deve essere inferiore a 5 MB.');
    const extension = filePath.split('.').pop()?.toLowerCase();
    const mimeType = extension === 'png' ? 'image/png' : extension === 'webp' ? 'image/webp' : 'image/jpeg';
    const logo = `data:${mimeType};base64,${image.toString('base64')}`;
    setSetting('shop_logo', logo);
    return logo;
  });
  ipcMain.handle('archive:choose-folder', async () => {
    if (setting('archive_folder')) {
      const confirmation = await dialog.showMessageBox(mainWindow, {
        type: 'warning',
        title: 'Modifica cartella archivio',
        message: 'Stai per modificare la cartella usata per i backup giornalieri.',
        detail: 'I backup successivi verranno salvati nella nuova cartella. Vuoi continuare?',
        buttons: ['Annulla', 'Continua'],
        defaultId: 0,
        cancelId: 0,
      });
      if (confirmation.response !== 1) return null;
    }
    const result = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory', 'createDirectory'] });
    if (result.canceled || !result.filePaths[0]) return null;
    setSetting('archive_folder', result.filePaths[0]);
    return result.filePaths[0];
  });
  createWindow();
  const scheduleArchive = () => {
    const next = new Date();
    next.setHours(24, 0, 0, 0);
    setTimeout(() => {
      void archiveMissingDays()
        .catch((error: unknown) => console.error('Backup giornaliero non riuscito:', error))
        .finally(scheduleArchive);
    }, next.getTime() - Date.now());
  };
  void archiveMissingDays().catch((error: unknown) => console.error('Backup giornaliero non riuscito:', error));
  scheduleArchive();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('before-quit', () => { database?.close(); });