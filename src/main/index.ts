import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import Database from 'better-sqlite3';
import PDFDocument from 'pdfkit';
import { randomInt, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { createWriteStream, existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { calculatePromotionDiscounts } from '../shared/promotions';
import { voucherCodePrefix } from '../shared/vouchers';
import type { CheckoutInput, Customer, CustomerInput, Employee, EmployeeInput, Expense, LoyaltyCard, PayrollPayment, PayrollPaymentInput, Product, ProductInput, Promotion, PromotionInput, SaleItem, VoucherBatch, VoucherBatchInput, VoucherValidation } from '../shared/types';

let database: Database.Database;
let mainWindow: BrowserWindow;
let databaseFile = '';

function localDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function isValidLocalDate(value: string): boolean {
  const date = new Date(`${value}T00:00:00`);
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(date.getTime()) && localDate(date) === value;
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

function allVoucherBatches(): VoucherBatch[] {
  const batches = database.prepare('SELECT * FROM voucher_batches ORDER BY created_at DESC, id DESC').all() as Array<Omit<VoucherBatch, 'codes'>>;
  const getCodes = database.prepare('SELECT code FROM vouchers WHERE batch_id = ? ORDER BY code');
  return batches.map((batch) => ({
    ...batch,
    codes: (getCodes.all(batch.id) as Array<{ code: string }>).map(({ code }) => code),
  }));
}

function removeExpiredVouchers(): void {
  const today = localDate(new Date());
  database.transaction(() => {
    database.prepare('DELETE FROM vouchers WHERE batch_id IN (SELECT id FROM voucher_batches WHERE ends_at < ?)').run(today);
    database.prepare('DELETE FROM voucher_batches WHERE NOT EXISTS (SELECT 1 FROM vouchers WHERE vouchers.batch_id = voucher_batches.id)').run();
  })();
}

function findValidVoucher(code: string, today = localDate(new Date())): { id: number; batch_id: number; discount_percentage: number; starts_at: string; ends_at: string } | undefined {
  return database.prepare(`SELECT v.id, v.batch_id, b.discount_percentage, b.starts_at, b.ends_at
    FROM vouchers v JOIN voucher_batches b ON b.id = v.batch_id
    WHERE v.code = ? AND b.starts_at <= ? AND b.ends_at >= ?`).get(code, today, today) as
    { id: number; batch_id: number; discount_percentage: number; starts_at: string; ends_at: string } | undefined;
}

function allSales(): unknown[] {
  const sales = database.prepare(`SELECT s.*, COALESCE(SUM(i.quantity), 0) AS item_count
    FROM sales s LEFT JOIN sale_items i ON i.sale_id = s.id GROUP BY s.id ORDER BY s.created_at DESC`).all() as Array<Record<string, unknown>>;
  return sales.map((sale) => ({ ...sale, items: saleItems(sale.id as number) }));
}

function state() {
  removeExpiredVouchers();
  return {
    products: (database.prepare('SELECT * FROM products ORDER BY name').all() as Array<Omit<Product, 'expiry_enabled'> & { expiry_enabled: number }>).map((product) => ({ ...product, expiry_enabled: Boolean(product.expiry_enabled) })),
    sales: allSales(),
    stockMovements: database.prepare('SELECT * FROM stock_movements ORDER BY created_at DESC, id DESC').all(),
    expenses: database.prepare('SELECT * FROM expenses ORDER BY expense_date DESC, id DESC').all() as Expense[],
    promotions: database.prepare('SELECT * FROM promotions ORDER BY starts_at DESC').all(),
    voucherBatches: allVoucherBatches(),
    employees: database.prepare(`SELECT id, first_name, last_name, age, gender, home_address, email, phone, operational_site,
      role, shift, salary, payment_method, iban, recognition_code, barcode, photo_data, documents_data, contract_pdf_data, created_at
      FROM employees ORDER BY last_name, first_name`).all() as Employee[],
    customers: database.prepare('SELECT * FROM customers ORDER BY last_name, first_name').all() as Customer[],
    loyaltyCards: database.prepare(`SELECT cards.*, customers.first_name, customers.last_name
      FROM loyalty_cards cards LEFT JOIN customers ON customers.id = cards.customer_id
      ORDER BY cards.created_at DESC, cards.id DESC`).all() as LoyaltyCard[],
    payrollPayments: database.prepare(`SELECT payments.*, employees.first_name, employees.last_name
      FROM payroll_payments payments JOIN employees ON employees.id = payments.employee_id
      ORDER BY payments.pay_month DESC, employees.last_name, employees.first_name`).all() as PayrollPayment[],
    settings: {
      shop_name: setting('shop_name', 'Il tuo supermercato'),
      shop_logo: setting('shop_logo'),
      archive_folder: setting('archive_folder', join(app.getPath('documents'), 'Gestionale-Archivio')),
      database_file: databaseFile,
      receipt_printer: setting('receipt_printer'),
      barcode_scanner_enabled: setting('barcode_scanner_enabled', 'true') === 'true',
      barcode_scanner_detected: setting('barcode_scanner_detected') === 'true',
    },
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
      quantity REAL NOT NULL, created_at TEXT NOT NULL, person TEXT NOT NULL DEFAULT '',
      destination TEXT NOT NULL DEFAULT '', note TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT, description TEXT NOT NULL, category TEXT NOT NULL,
      amount REAL NOT NULL, expense_date TEXT NOT NULL, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS voucher_batches (
      id INTEGER PRIMARY KEY AUTOINCREMENT, discount_percentage REAL NOT NULL,
      starts_at TEXT NOT NULL, ends_at TEXT NOT NULL, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS vouchers (
      id INTEGER PRIMARY KEY AUTOINCREMENT, batch_id INTEGER NOT NULL REFERENCES voucher_batches(id) ON DELETE CASCADE,
      code TEXT NOT NULL UNIQUE
    );
    CREATE TABLE IF NOT EXISTS employees (
      id INTEGER PRIMARY KEY AUTOINCREMENT, first_name TEXT NOT NULL, last_name TEXT NOT NULL, age INTEGER NOT NULL,
      gender TEXT NOT NULL, home_address TEXT NOT NULL, email TEXT NOT NULL UNIQUE, initial_password_hash TEXT NOT NULL,
      phone TEXT NOT NULL, operational_site TEXT NOT NULL, role TEXT NOT NULL, shift TEXT NOT NULL, salary REAL NOT NULL,
      iban TEXT NOT NULL, recognition_code TEXT NOT NULL UNIQUE, barcode TEXT NOT NULL UNIQUE,
      photo_data TEXT NOT NULL, documents_data TEXT NOT NULL, contract_pdf_data TEXT NOT NULL, created_at TEXT NOT NULL,
      payment_method TEXT NOT NULL DEFAULT 'Contanti'
    );
    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT, first_name TEXT NOT NULL, last_name TEXT NOT NULL,
      phone TEXT NOT NULL, email TEXT NOT NULL, address TEXT NOT NULL, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS loyalty_cards (
      id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT NOT NULL UNIQUE, barcode TEXT NOT NULL UNIQUE, discount_percentage REAL NOT NULL,
      customer_id INTEGER REFERENCES customers(id), status TEXT NOT NULL DEFAULT 'Sviluppata',
      points INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, activated_at TEXT
    );
    CREATE TABLE IF NOT EXISTS loyalty_point_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT, card_id INTEGER NOT NULL REFERENCES loyalty_cards(id),
      transaction_type TEXT NOT NULL CHECK(transaction_type IN ('Raccolta', 'Riscatto')),
      points INTEGER NOT NULL, amount_eur REAL NOT NULL, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS payroll_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT, employee_id INTEGER NOT NULL REFERENCES employees(id),
      pay_month TEXT NOT NULL, amount REAL NOT NULL, payment_date TEXT NOT NULL, payment_method TEXT NOT NULL,
      UNIQUE(employee_id, pay_month)
    );
  `);
  const employeeColumns = database.prepare('PRAGMA table_info(employees)').all() as Array<{ name: string }>;
  if (!employeeColumns.some((column) => column.name === 'payment_method')) {
    database.exec("ALTER TABLE employees ADD COLUMN payment_method TEXT NOT NULL DEFAULT 'Contanti'");
  }
  const stockMovementColumns = database.prepare('PRAGMA table_info(stock_movements)').all() as Array<{ name: string }>;
  if (!stockMovementColumns.some((column) => column.name === 'person')) {
    database.exec("ALTER TABLE stock_movements ADD COLUMN person TEXT NOT NULL DEFAULT ''");
  }
  if (!stockMovementColumns.some((column) => column.name === 'destination')) {
    database.exec("ALTER TABLE stock_movements ADD COLUMN destination TEXT NOT NULL DEFAULT ''");
  }
  const loyaltyCardColumns = database.prepare('PRAGMA table_info(loyalty_cards)').all() as Array<{ name: string }>;
  if (!loyaltyCardColumns.some((column) => column.name === 'barcode')) {
    database.exec("ALTER TABLE loyalty_cards ADD COLUMN barcode TEXT NOT NULL DEFAULT ''");
    database.exec("UPDATE loyalty_cards SET barcode = code WHERE barcode = ''");
  }
  database.exec('CREATE UNIQUE INDEX IF NOT EXISTS loyalty_cards_barcode_unique ON loyalty_cards(barcode)');
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

function recordStockMovement(productId: number, productName: string, type: 'Carico' | 'Scarico', quantity: number, note: string, person = '', destination = ''): void {
  database.prepare(`INSERT INTO stock_movements (product_id, product_name, movement_type, quantity, created_at, person, destination, note)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(productId, productName, type, quantity, new Date().toISOString(), person, destination, note);
}

const archiveNumber = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 2 });
const archiveMoney = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' });
const archiveDateTime = new Intl.DateTimeFormat('it-IT', { dateStyle: 'short', timeStyle: 'short' });

interface ArchiveSection {
  name: string;
  columns: string[];
  weights: number[];
  rows: string[][];
}

function removeLegacyTextBackups(folder: string): void {
  for (const section of ['Magazzino', 'Cassa', 'Vendite', 'Promozioni', 'Statistiche']) {
    const dir = join(folder, section);
    if (!existsSync(dir)) continue;
    for (const fileName of readdirSync(dir)) {
      if (/^\d{4}-\d{2}-\d{2}\.txt$/.test(fileName)) unlinkSync(join(dir, fileName));
    }
  }
}

function archiveDay(day: string): Promise<void> {
  const [dayStart, dayEnd] = localDayBounds(day);
  const folder = setting('archive_folder', join(app.getPath('documents'), 'Gestionale-Archivio'));
  const shopName = setting('shop_name', 'Gestione Supermercato');
  const products = database.prepare('SELECT code, name, category, unit, sale_price, purchase_price, stock FROM products ORDER BY name').all() as Array<Record<string, string | number>>;
  const sales = database.prepare('SELECT receipt_no, created_at, payment_method, gross_total, discount, total FROM sales WHERE created_at >= ? AND created_at < ? ORDER BY created_at').all(dayStart, dayEnd) as Array<Record<string, string | number>>;
  const saleItemsForDay = database.prepare(`SELECT s.receipt_no, i.name, i.unit, i.quantity, i.unit_price FROM sale_items i JOIN sales s ON s.id = i.sale_id WHERE s.created_at >= ? AND s.created_at < ? ORDER BY s.created_at`).all(dayStart, dayEnd) as Array<Record<string, string | number>>;
  const promotions = database.prepare('SELECT name, percentage, discount_type, buy_quantity, free_quantity, category, starts_at, ends_at, minimum_spend, application_mode FROM promotions ORDER BY starts_at').all() as Array<Record<string, string | number>>;
  const statistics = database.prepare(`SELECT COUNT(*) AS transactions, COALESCE(SUM(total), 0) AS net, COALESCE(SUM((SELECT SUM(quantity) FROM sale_items WHERE sale_id = sales.id)), 0) AS quantity FROM sales WHERE created_at >= ? AND created_at < ?`).get(dayStart, dayEnd) as { transactions: number; net: number; quantity: number };
  const sections: ArchiveSection[] = [
    {
      name: 'Magazzino',
      columns: ['Codice', 'Articolo', 'Categoria', 'Vendita', 'Acquisto', 'Giacenza'],
      weights: [1.1, 2.2, 1.25, 1, 1, 0.9],
      rows: products.map((product) => [String(product.code), String(product.name), String(product.category), archiveMoney.format(Number(product.sale_price)), archiveMoney.format(Number(product.purchase_price)), `${archiveNumber.format(Number(product.stock))} ${product.unit === 'KG' ? 'kg' : product.unit === 'LITRO' ? 'lit.' : 'pz'}`]),
    },
    {
      name: 'Vendite',
      columns: ['Scontrino', 'Data e ora', 'Pagamento', 'Lordo', 'Sconto', 'Netto'],
      weights: [0.9, 1.4, 1.1, 1, 1, 1],
      rows: sales.map((sale) => [String(sale.receipt_no), archiveDateTime.format(new Date(String(sale.created_at))), String(sale.payment_method), archiveMoney.format(Number(sale.gross_total)), archiveMoney.format(Number(sale.discount)), archiveMoney.format(Number(sale.total))]),
    },
    {
      name: 'Cassa',
      columns: ['Scontrino', 'Articolo', 'Quantità', 'Unità', 'Prezzo unitario'],
      weights: [0.9, 2.2, 0.8, 0.8, 1.1],
      rows: saleItemsForDay.map((item) => [String(item.receipt_no), String(item.name), archiveNumber.format(Number(item.quantity)), item.unit === 'KG' ? 'kg' : item.unit === 'LITRO' ? 'lit.' : 'pz', archiveMoney.format(Number(item.unit_price))]),
    },
    {
      name: 'Promozioni',
      columns: ['Promozione', 'Sconto', 'Categoria', 'Periodo', 'Spesa minima', 'Modalità'],
      weights: [1.6, 0.7, 1, 1.4, 1, 0.9],
      rows: promotions.map((promotion) => [
        String(promotion.name),
        promotion.discount_type === 'buy_get' ? `${promotion.buy_quantity}+${promotion.free_quantity}` : `${promotion.percentage}%`,
        String(promotion.category),
        `${promotion.starts_at} - ${promotion.ends_at}`,
        archiveMoney.format(Number(promotion.minimum_spend)),
        String(promotion.application_mode),
      ]),
    },
    {
      name: 'Statistiche',
      columns: ['Indicatore', 'Valore'],
      weights: [1.5, 1],
      rows: [
        ['Data del report', day],
        ['Vendite registrate', String(statistics.transactions)],
        ['Incasso netto', archiveMoney.format(statistics.net)],
        ['Quantità venduta', archiveNumber.format(statistics.quantity)],
      ],
    },
  ];
  return Promise.all(sections.map(({ name, columns, weights, rows }) => new Promise<void>((resolve, reject) => {
    const dir = join(folder, name);
    mkdirSync(dir, { recursive: true });
    const doc = new PDFDocument({ size: 'A4', margin: 40, bufferPages: true });
    const stream = doc.pipe(createWriteStream(join(dir, `${day}.pdf`)));
    const pageWidth = doc.page.width;
    const pageHeight = doc.page.height;
    const tableWidth = pageWidth - 80;
    const drawHeader = () => {
      doc.save();
      doc.rect(0, 0, pageWidth, 105).fill('#2b523d');
      doc.fillColor('#dce9de').font('Helvetica').fontSize(8).text('GESTIONALE  /  ARCHIVIO GIORNALIERO', 40, 27);
      doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(22).text(name, 40, 43);
      doc.fillColor('#e4eee5').font('Helvetica').fontSize(9).text(`${shopName}  ·  ${day}`, 40, 76);
      doc.restore();
    };
    const columnWidths = weights.map((weight) => tableWidth * weight / weights.reduce((sum, item) => sum + item, 0));
    const drawColumnHeader = (y: number) => {
      doc.roundedRect(40, y, tableWidth, 24, 3).fill('#38684e');
      let x = 46;
      columns.forEach((column, index) => {
        doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(8).text(column, x, y + 8, { width: columnWidths[index] - 10, lineBreak: false, ellipsis: true });
        x += columnWidths[index];
      });
    };
    drawHeader();
    let y = 124;
    drawColumnHeader(y);
    y += 24;
    const dataRows = rows.length ? rows : [columns.map((_, index) => index === 0 ? 'Nessun dato disponibile' : '')];
    dataRows.forEach((row, rowIndex) => {
      if (y + 25 > pageHeight - 38) {
        doc.addPage();
        drawHeader();
        y = 124;
        drawColumnHeader(y);
        y += 24;
      }
      if (rowIndex % 2 === 0) doc.rect(40, y, tableWidth, 25).fill('#f1f5f1');
      doc.save();
      doc.rect(40, y, tableWidth, 25).lineWidth(0.4).stroke('#e1e8e1');
      let x = 46;
      columns.forEach((_, index) => {
        doc.fillColor('#34443a').font(index === 0 && name === 'Statistiche' ? 'Helvetica-Bold' : 'Helvetica').fontSize(8)
          .text(row[index] ?? '', x, y + 8, { width: columnWidths[index] - 10, lineBreak: false, ellipsis: true });
        x += columnWidths[index];
      });
      doc.restore();
      y += 25;
    });
    const pages = doc.bufferedPageRange();
    for (let index = 0; index < pages.count; index += 1) {
      doc.switchToPage(pages.start + index);
      doc.fillColor('#839087').font('Helvetica').fontSize(8)
        .text(`${shopName}  ·  ${name}  ·  Pagina ${index + 1} di ${pages.count}`, 40, pageHeight - 25, { width: tableWidth, align: 'right' });
    }
    stream.on('finish', resolve);
    stream.on('error', reject);
    doc.end();
  }))).then(() => undefined);
}

async function archiveMissingDays(): Promise<void> {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const lastDay = localDate(yesterday);
  removeLegacyTextBackups(setting('archive_folder', join(app.getPath('documents'), 'Gestionale-Archivio')));
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
  ipcMain.handle('product:delete', (_event, productId: number) => {
    if (!Number.isInteger(productId) || productId < 1) throw new Error('Articolo non valido.');
    const product = database.prepare('SELECT name, stock FROM products WHERE id = ?').get(productId) as { name: string; stock: number } | undefined;
    if (!product) throw new Error('Articolo non trovato.');
    database.transaction(() => {
      if (product.stock > 0) recordStockMovement(productId, product.name, 'Scarico', product.stock, 'Articolo eliminato dal magazzino');
      database.prepare('DELETE FROM products WHERE id = ?').run(productId);
    })();
  });
  ipcMain.handle('product:dispose-expired', (_event, productId: number) => {
    if (!Number.isInteger(productId) || productId < 1) throw new Error('Articolo scaduto non valido.');
    const product = database.prepare(`SELECT name, stock FROM products
      WHERE id = ? AND expiry_enabled = 1 AND expiry_date < ?`).get(productId, localDate(new Date())) as
      { name: string; stock: number } | undefined;
    if (!product) throw new Error('Articolo non trovato o non scaduto.');
    if (product.stock <= 0) throw new Error('L’articolo scaduto non ha giacenza da smaltire.');
    database.transaction(() => {
      database.prepare('UPDATE products SET stock = 0 WHERE id = ?').run(productId);
      recordStockMovement(productId, product.name, 'Scarico', product.stock, 'Smaltimento prodotto scaduto');
    })();
  });
  ipcMain.handle('product:stock', (_event, productId: number, stock: number) => {
    if (!Number.isInteger(productId) || productId < 1 || !Number.isFinite(stock) || stock < 0) {
      throw new Error('La nuova giacenza non è valida.');
    }
    const result = database.prepare('UPDATE products SET stock = ? WHERE id = ?').run(stock, productId);
    if (result.changes === 0) throw new Error('Articolo non trovato.');
  });
  ipcMain.handle('product:move-stock', (_event, movement: { productId: number; type: 'Carico' | 'Scarico'; quantity: number; employee_barcode: string; destination?: string; note: string }) => {
    if (!Number.isInteger(movement.productId) || movement.productId < 1 || !['Carico', 'Scarico'].includes(movement.type)
      || !Number.isFinite(movement.quantity) || movement.quantity <= 0 || typeof movement.note !== 'string'
      || typeof movement.employee_barcode !== 'string' || !movement.employee_barcode.trim()
      || (movement.destination !== undefined && typeof movement.destination !== 'string')
      || (movement.type === 'Scarico' && !movement.destination?.trim())) {
      throw new Error('I dati del movimento di magazzino non sono validi.');
    }
    database.transaction(() => {
      const product = database.prepare('SELECT name, stock FROM products WHERE id = ?').get(movement.productId) as { name: string; stock: number } | undefined;
      if (!product) throw new Error('Articolo non trovato.');
      const employee = database.prepare('SELECT first_name, last_name FROM employees WHERE barcode = ?')
        .get(movement.employee_barcode.trim()) as { first_name: string; last_name: string } | undefined;
      if (!employee) throw new Error('Barcode personale non riconosciuto. Scansiona il badge di un dipendente registrato.');
      if (movement.type === 'Scarico' && product.stock < movement.quantity) throw new Error('La quantità da scaricare supera la giacenza disponibile.');
      const delta = movement.type === 'Carico' ? movement.quantity : -movement.quantity;
      database.prepare('UPDATE products SET stock = stock + ? WHERE id = ?').run(delta, movement.productId);
      recordStockMovement(
        movement.productId,
        product.name,
        movement.type,
        movement.quantity,
        movement.note.trim(),
        `${employee.first_name} ${employee.last_name}`,
        movement.type === 'Scarico' ? movement.destination?.trim() ?? '' : '',
      );
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
    if (sale.loyalty_card_id !== undefined && (!Number.isInteger(sale.loyalty_card_id)
      || !(database.prepare("SELECT 1 FROM loyalty_cards WHERE id = ? AND status = 'Attiva'").get(sale.loyalty_card_id)))) {
      throw new Error('La tessera fedeltà non è attiva o non è valida.');
    }
    const voucherCode = sale.voucher_code?.trim() ?? '';
    if (voucherCode && !findValidVoucher(voucherCode)) throw new Error('Buono sconto non valido, scaduto o già utilizzato.');
    const grossTotal = items.reduce((sum, item) => sum + item.quantity * item.unit_price, 0);
    const createSale = database.transaction(() => {
      const voucher = voucherCode ? findValidVoucher(voucherCode) : undefined;
      if (voucherCode && !voucher) throw new Error('Buono sconto non valido, scaduto o già utilizzato.');
      const voucherDiscount = voucher
        ? Math.round(Math.max(0, grossTotal - discounts.automaticDiscount - discounts.manualDiscount) * voucher.discount_percentage) / 100
        : 0;
      const discount = discounts.automaticDiscount + discounts.manualDiscount + voucherDiscount;
      const amountPaid = Math.max(0, grossTotal - discount);
      const receiptNo = receiptNumber();
      const result = database.prepare('INSERT INTO sales (receipt_no, created_at, payment_method, discount, gross_total, total) VALUES (?, ?, ?, ?, ?, ?)')
        .run(receiptNo, new Date().toISOString(), sale.payment_method, discount, grossTotal, amountPaid);
      replaceItems(Number(result.lastInsertRowid), items);
      items.forEach((item) => recordStockMovement(item.product_id, item.name, 'Scarico', item.quantity, `Vendita #${receiptNo}`));
      if (sale.loyalty_card_id !== undefined) {
        const points = Math.floor(amountPaid);
        if (points > 0) {
          const cardResult = database.prepare("UPDATE loyalty_cards SET points = points + ? WHERE id = ? AND status = 'Attiva'")
            .run(points, sale.loyalty_card_id);
          if (!cardResult.changes) throw new Error('La tessera fedeltà non è più attiva.');
          database.prepare(`INSERT INTO loyalty_point_transactions
            (card_id, transaction_type, points, amount_eur, created_at) VALUES (?, 'Raccolta', ?, ?, ?)`)
            .run(sale.loyalty_card_id, points, amountPaid, new Date().toISOString());
        }
      }
      if (voucher) {
        database.prepare('DELETE FROM vouchers WHERE id = ?').run(voucher.id);
        database.prepare('DELETE FROM voucher_batches WHERE id = ? AND NOT EXISTS (SELECT 1 FROM vouchers WHERE batch_id = ?)').run(voucher.batch_id, voucher.batch_id);
      }
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
  ipcMain.handle('voucher-batch:save', (_event, batch: VoucherBatchInput) => {
    const isValidDate = (value: string) => {
      const date = new Date(`${value}T00:00:00`);
      return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(date.getTime()) && localDate(date) === value;
    };
    if (!batch || !Array.isArray(batch.codes) || (batch.id !== undefined && (!Number.isInteger(batch.id) || batch.id < 1))) {
      throw new Error('Gruppo di buoni sconto non valido.');
    }
    const uniqueCodes = new Set(batch.codes);
    if (!Number.isFinite(batch.discount_percentage) || batch.discount_percentage < 1 || batch.discount_percentage > 100
      || !isValidDate(batch.starts_at) || !isValidDate(batch.ends_at) || batch.ends_at < batch.starts_at
      || (batch.id === undefined && !batch.codes.length) || (batch.id === undefined && batch.codes.some((code) => {
        const prefix = voucherCodePrefix(setting('shop_name', 'Il tuo supermercato'));
        return typeof code !== 'string' || !code.startsWith(prefix) || !/^\d{10}$/.test(code.slice(prefix.length));
      })) || (batch.id === undefined && uniqueCodes.size !== batch.codes.length)) {
      throw new Error('Controlla percentuale, date e codici del buono sconto.');
    }
    const transaction = database.transaction(() => {
      if (batch.id !== undefined) {
        const result = database.prepare('UPDATE voucher_batches SET discount_percentage = ?, starts_at = ?, ends_at = ? WHERE id = ?')
          .run(batch.discount_percentage, batch.starts_at, batch.ends_at, batch.id);
        if (result.changes === 0) throw new Error('Gruppo di buoni sconto non trovato.');
        return;
      }
      const insertBatch = database.prepare('INSERT INTO voucher_batches (discount_percentage, starts_at, ends_at, created_at) VALUES (?, ?, ?, ?)');
      const result = insertBatch.run(batch.discount_percentage, batch.starts_at, batch.ends_at, new Date().toISOString());
      const insertVoucher = database.prepare('INSERT INTO vouchers (batch_id, code) VALUES (?, ?)');
      for (const code of batch.codes) insertVoucher.run(result.lastInsertRowid, code);
    });
    try {
      transaction();
    } catch (error) {
      if (error instanceof Error && error.message.includes('UNIQUE constraint failed: vouchers.code')) {
        throw new Error('Uno o più codici sono già presenti. Genera nuovamente i codici prima di confermare.');
      }
      throw error;
    }
  });
  ipcMain.handle('voucher-batch:delete', (_event, id: number) => {
    if (!Number.isInteger(id) || id < 1) throw new Error('Gruppo di buoni sconto non valido.');
    const deleteBatch = database.transaction(() => {
      database.prepare('DELETE FROM vouchers WHERE batch_id = ?').run(id);
      const result = database.prepare('DELETE FROM voucher_batches WHERE id = ?').run(id);
      if (result.changes === 0) throw new Error('Gruppo di buoni sconto non trovato.');
    });
    deleteBatch();
  });
  ipcMain.handle('expense:save', (_event, expense: Pick<Expense, 'description' | 'category' | 'amount' | 'expense_date'>) => {
    const isValidDate = (value: string) => {
      const date = new Date(`${value}T00:00:00`);
      return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(date.getTime()) && localDate(date) === value;
    };
    if (!expense || typeof expense.description !== 'string' || !expense.description.trim()
      || typeof expense.category !== 'string' || !expense.category.trim()
      || !Number.isFinite(expense.amount) || expense.amount <= 0 || !isValidDate(expense.expense_date)) {
      throw new Error('Controlla descrizione, categoria, importo e data della spesa.');
    }
    database.prepare('INSERT INTO expenses (description, category, amount, expense_date, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(expense.description.trim(), expense.category.trim(), expense.amount, expense.expense_date, new Date().toISOString());
  });
  ipcMain.handle('expense:delete', (_event, id: number) => {
    if (!Number.isInteger(id) || id < 1) throw new Error('Spesa non valida.');
    const result = database.prepare('DELETE FROM expenses WHERE id = ?').run(id);
    if (result.changes === 0) throw new Error('Spesa non trovata.');
  });
  ipcMain.handle('employee:save', (_event, employee: EmployeeInput) => {
    const requiredText: Array<keyof EmployeeInput> = [
      'first_name', 'last_name', 'gender', 'home_address', 'email', 'phone', 'operational_site',
      'role', 'shift', 'payment_method', 'recognition_code', 'barcode', 'photo_data', 'documents_data',
      'contract_pdf_data', 'initial_password',
    ];
    const isDataUrl = (value: string, mime: RegExp, maxBytes: number) => {
      if (!mime.test(value)) return false;
      const separator = value.indexOf(',');
      const encoded = value.slice(separator + 1);
      return /^[A-Za-z0-9+/]*={0,2}$/.test(encoded) && Math.floor(encoded.length * 3 / 4) <= maxBytes;
    };
    let documentImages: unknown[] = [];
    if (employee && typeof employee.documents_data === 'string') {
      try {
        const parsedDocuments: unknown = JSON.parse(employee.documents_data);
        documentImages = Array.isArray(parsedDocuments) ? parsedDocuments : [employee.documents_data];
      } catch {
        documentImages = [employee.documents_data];
      }
    }
    if (!employee || requiredText.some((field) => typeof employee[field] !== 'string' || !employee[field].trim())
      || !Number.isInteger(employee.age) || employee.age < 16 || employee.age > 100
      || !Number.isFinite(employee.salary) || employee.salary < 0
      || !['Bonifico', 'Contanti'].includes(employee.payment_method)
      || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(employee.email)
      || employee.initial_password.length < 8 || employee.initial_password.length > 128
      || (employee.payment_method === 'Bonifico' && !/^[A-Z0-9 ]{15,34}$/i.test(employee.iban))
      || (employee.payment_method === 'Contanti' && employee.iban !== '')
      || !/^DIP-\d{8}$/.test(employee.recognition_code) || !/^\d{12}$/.test(employee.barcode)
      || !isDataUrl(employee.photo_data, /^data:image\/(?:png|jpeg|webp);base64,/i, 5 * 1024 * 1024)
      || documentImages.length === 0 || documentImages.length > 20
      || documentImages.some((image) => typeof image !== 'string' || !isDataUrl(image, /^data:image\/(?:png|jpeg|webp);base64,/i, 5 * 1024 * 1024))
      || !isDataUrl(employee.contract_pdf_data, /^data:application\/pdf;base64,/i, 10 * 1024 * 1024)) {
      throw new Error('Controlla i dati obbligatori, gli allegati e i codici del dipendente.');
    }
    const { initial_password: initialPassword, ...employeeDetails } = employee;
    const salt = randomBytes(16).toString('hex');
    const passwordHash = `${salt}:${scryptSync(initialPassword, salt, 64).toString('hex')}`;
    try {
      database.prepare(`INSERT INTO employees (
        first_name, last_name, age, gender, home_address, email, initial_password_hash, phone, operational_site,
        role, shift, salary, payment_method, iban, recognition_code, barcode, photo_data, documents_data, contract_pdf_data, created_at
      ) VALUES (
        @first_name, @last_name, @age, @gender, @home_address, @email, @initial_password_hash, @phone, @operational_site,
        @role, @shift, @salary, @payment_method, @iban, @recognition_code, @barcode, @photo_data, @documents_data, @contract_pdf_data, @created_at
      )`).run({
        ...employeeDetails,
        initial_password_hash: passwordHash,
        created_at: new Date().toISOString(),
      });
    } catch (error) {
      if (error instanceof Error && error.message.includes('UNIQUE constraint failed: employees.email')) {
        throw new Error('Esiste già un dipendente con questo indirizzo email.');
      }
      if (error instanceof Error && error.message.includes('UNIQUE constraint failed: employees.recognition_code')) {
        throw new Error('Il codice di riconoscimento è già assegnato a un dipendente.');
      }
      if (error instanceof Error && error.message.includes('UNIQUE constraint failed: employees.barcode')) {
        throw new Error('Il barcode è già assegnato a un dipendente.');
      }
      throw error;
    }
  });
  ipcMain.handle('customer:save', (_event, customer: CustomerInput) => {
    if (!customer || [customer.first_name, customer.last_name, customer.phone, customer.email]
      .some((value) => typeof value !== 'string' || !value.trim())
      || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email.trim())) {
      throw new Error('Inserisci nome, cognome, telefono ed email validi.');
    }
    database.prepare(`INSERT INTO customers (first_name, last_name, phone, email, address, created_at)
      VALUES (?, ?, ?, ?, ?, ?)`).run(customer.first_name.trim(), customer.last_name.trim(),
      customer.phone.trim(), customer.email.trim(), customer.address.trim(), new Date().toISOString());
  });
  ipcMain.handle('loyalty-cards:generate', (_event, input: { quantity: number; discount_percentage: number }) => {
    if (!input || !Number.isInteger(input.quantity) || input.quantity < 1 || input.quantity > 5000
      || !Number.isFinite(input.discount_percentage) || input.discount_percentage < 0 || input.discount_percentage > 100) {
      throw new Error('Inserisci una quantità da 1 a 5000 e uno sconto tra 0 e 100%.');
    }
    const storeName = setting('shop_name', 'Il tuo supermercato').replace(/[^a-z0-9]/gi, '');
    if (!storeName) throw new Error('Imposta un nome negozio composto da lettere o numeri prima di generare tessere.');
    const insert = database.prepare(`INSERT INTO loyalty_cards (code, barcode, discount_percentage, status, created_at)
      VALUES (?, ?, ?, 'Sviluppata', ?)`);
    const usedCodes = new Set((database.prepare('SELECT code FROM loyalty_cards').all() as Array<{ code: string }>).map(({ code }) => code));
    const usedBarcodes = new Set((database.prepare('SELECT barcode FROM loyalty_cards').all() as Array<{ barcode: string }>).map(({ barcode }) => barcode));
    const createdAt = new Date().toISOString();
    database.transaction(() => {
      for (let index = 0; index < input.quantity; index += 1) {
        let code = '';
        do {
          code = `${String(randomInt(0, 100000)).padStart(5, '0')}${storeName}${String(randomInt(0, 100000000)).padStart(8, '0')}`;
        } while (usedCodes.has(code));
        let barcode = '';
        do {
          barcode = String(randomInt(0, 1000000000000)).padStart(12, '0');
        } while (usedBarcodes.has(barcode));
        usedCodes.add(code);
        usedBarcodes.add(barcode);
        insert.run(code, barcode, input.discount_percentage, createdAt);
      }
    })();
  });
  ipcMain.handle('loyalty-card:activate', (_event, input: { card_id: number; customer_id: number }) => {
    if (!input || !Number.isInteger(input.card_id) || !Number.isInteger(input.customer_id)) {
      throw new Error('Seleziona una tessera e un cliente validi.');
    }
    const result = database.prepare(`UPDATE loyalty_cards SET customer_id = ?, status = 'Attiva', activated_at = ?
      WHERE id = ? AND status = 'Sviluppata' AND customer_id IS NULL AND EXISTS (SELECT 1 FROM customers WHERE id = ?)`)
      .run(input.customer_id, new Date().toISOString(), input.card_id, input.customer_id);
    if (result.changes === 0) throw new Error('Tessera già attivata o cliente non trovato.');
  });
  ipcMain.handle('loyalty-card:collect-points', (_event, input: { card_id: number; amount_spent: number }) => {
    if (!input || !Number.isInteger(input.card_id) || !Number.isFinite(input.amount_spent) || input.amount_spent < 1) {
      throw new Error('Inserisci un importo speso di almeno 1 euro.');
    }
    const points = Math.floor(input.amount_spent);
    database.transaction(() => {
      const result = database.prepare(`UPDATE loyalty_cards SET points = points + ?
        WHERE id = ? AND status = 'Attiva'`).run(points, input.card_id);
      if (!result.changes) throw new Error('Tessera attiva non trovata.');
      database.prepare(`INSERT INTO loyalty_point_transactions
        (card_id, transaction_type, points, amount_eur, created_at) VALUES (?, 'Raccolta', ?, ?, ?)`)
        .run(input.card_id, points, input.amount_spent, new Date().toISOString());
    })();
  });
  ipcMain.handle('loyalty-card:redeem-points', (_event, input: { card_id: number; points: number }) => {
    if (!input || !Number.isInteger(input.card_id) || !Number.isInteger(input.points) || input.points < 1) {
      throw new Error('Inserisci un numero di punti valido.');
    }
    database.transaction(() => {
      const result = database.prepare(`UPDATE loyalty_cards SET points = points - ?
        WHERE id = ? AND status = 'Attiva' AND points >= ?`).run(input.points, input.card_id, input.points);
      if (!result.changes) throw new Error('Punti insufficienti o tessera attiva non trovata.');
      database.prepare(`INSERT INTO loyalty_point_transactions
        (card_id, transaction_type, points, amount_eur, created_at) VALUES (?, 'Riscatto', ?, ?, ?)`)
        .run(input.card_id, input.points, input.points * 0.2, new Date().toISOString());
    })();
  });
  ipcMain.handle('payroll:pay', (_event, input: PayrollPaymentInput) => {
    if (!input || !Number.isInteger(input.employee_id) || !/^\d{4}-\d{2}$/.test(input.pay_month)
      || !isValidLocalDate(input.payment_date)) throw new Error('Dati del pagamento stipendio non validi.');
    const employee = database.prepare('SELECT first_name, last_name, salary, payment_method FROM employees WHERE id = ?')
      .get(input.employee_id) as { first_name: string; last_name: string; salary: number; payment_method: 'Bonifico' | 'Contanti' } | undefined;
    if (!employee) throw new Error('Dipendente non trovato.');
    database.transaction(() => {
      database.prepare(`INSERT INTO payroll_payments (employee_id, pay_month, amount, payment_date, payment_method)
        VALUES (?, ?, ?, ?, ?)`).run(input.employee_id, input.pay_month, employee.salary, input.payment_date, employee.payment_method);
      database.prepare(`INSERT INTO expenses (description, category, amount, expense_date, created_at)
        VALUES (?, 'Stipendi', ?, ?, ?)`).run(`Stipendio ${employee.first_name} ${employee.last_name} · ${input.pay_month}`,
        employee.salary, input.payment_date, new Date().toISOString());
    })();
  });
  ipcMain.handle('payroll:pay-all', (_event, input: { pay_month: string; payment_date: string }) => {
    if (!input || !/^\d{4}-\d{2}$/.test(input.pay_month) || !isValidLocalDate(input.payment_date)) {
      throw new Error('Mese o data del pagamento non validi.');
    }
    const employees = database.prepare(`SELECT id, first_name, last_name, salary, payment_method FROM employees
      WHERE id NOT IN (SELECT employee_id FROM payroll_payments WHERE pay_month = ?)`).all(input.pay_month) as
      Array<{ id: number; first_name: string; last_name: string; salary: number; payment_method: 'Bonifico' | 'Contanti' }>;
    if (!employees.length) throw new Error('Tutti gli stipendi di questo mese risultano già pagati.');
    const pay = database.transaction(() => {
      const insertPayment = database.prepare(`INSERT INTO payroll_payments
        (employee_id, pay_month, amount, payment_date, payment_method) VALUES (?, ?, ?, ?, ?)`);
      const insertExpense = database.prepare(`INSERT INTO expenses (description, category, amount, expense_date, created_at)
        VALUES (?, 'Stipendi', ?, ?, ?)`);
      const createdAt = new Date().toISOString();
      for (const employee of employees) {
        insertPayment.run(employee.id, input.pay_month, employee.salary, input.payment_date, employee.payment_method);
        insertExpense.run(`Stipendio ${employee.first_name} ${employee.last_name} · ${input.pay_month}`,
          employee.salary, input.payment_date, createdAt);
      }
    });
    pay();
  });
  ipcMain.handle('voucher:validate', (_event, code: string): VoucherValidation => {
    const normalized = typeof code === 'string' ? code.trim() : '';
    if (!normalized) return { valid: false, message: 'Codice buono sconto non valido.' };
    const today = localDate(new Date());
    const voucher = database.prepare(`SELECT b.discount_percentage, b.starts_at, b.ends_at FROM vouchers v
      JOIN voucher_batches b ON b.id = v.batch_id WHERE v.code = ?`).get(normalized) as
      { discount_percentage: number; starts_at: string; ends_at: string } | undefined;
    if (!voucher) return { valid: false, message: 'Buono sconto non trovato o già utilizzato.' };
    if (voucher.starts_at > today) return { valid: false, message: 'Il buono sconto non è ancora valido.' };
    if (voucher.ends_at < today) {
      removeExpiredVouchers();
      return { valid: false, message: 'Il buono sconto è scaduto.' };
    }
    return { valid: true, discount_percentage: voucher.discount_percentage };
  });
  ipcMain.handle('settings:save', (_event, key: string, value: string) => {
    if (!['shop_name', 'archive_folder', 'receipt_printer', 'barcode_scanner_enabled', 'barcode_scanner_detected'].includes(key)) throw new Error('Impostazione non valida.');
    setSetting(key, value);
  });
  ipcMain.handle('devices:printers', async () => (await mainWindow.webContents.getPrintersAsync()).map(({ name, displayName }) => ({ name, displayName })));
  ipcMain.handle('receipt:print', async () => {
    const printer = setting('receipt_printer');
    if (!printer) throw new Error('Seleziona una stampante per gli scontrini nelle impostazioni Dispositivi.');
    await new Promise<void>((resolve, reject) => {
      mainWindow.webContents.print({ silent: true, deviceName: printer, printBackground: true }, (success, failureReason) => {
        if (success) resolve();
        else reject(new Error(failureReason || 'Stampa dello scontrino non riuscita.'));
      });
    });
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