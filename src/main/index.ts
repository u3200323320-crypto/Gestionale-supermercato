import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import Database from 'better-sqlite3';
import PDFDocument from 'pdfkit';
import { randomInt, randomBytes, randomUUID, scryptSync } from 'node:crypto';
import { copyFileSync, createWriteStream, existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { calculatePromotionDiscounts } from '../shared/promotions';
import { voucherCodePrefix } from '../shared/vouchers';
import type { AuthenticatedEmployee, CheckoutInput, CustomerInput, Employee, EmployeeInput, Expense, PayrollPayment, PayrollPaymentInput, Product, ProductInput, Promotion, PromotionInput, Sale, SaleItem, Site, SiteInput, SiteStock, StockDistributionRecord, VoucherBatch, VoucherBatchInput, VoucherValidation } from '../shared/types';
import { deleteSite, migrateSites, saveSite } from './site-service';

let database: Database.Database;
let mainWindow: BrowserWindow;
let databaseFile = '';
let salesRetentionInterval: NodeJS.Timeout | undefined;
const authenticatedSessions = new Map<number, AuthenticatedEmployee>();
const trialSessions = new Set<number>();
const saleActionAuthorizations = new Map<number, { barcode: string; expiresAt: number }>();

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

function localDateMonthsBefore(date: Date, months: number): Date {
  const target = new Date(date.getFullYear(), date.getMonth() - months, 1);
  target.setDate(Math.min(date.getDate(), new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate()));
  target.setHours(date.getHours(), date.getMinutes(), date.getSeconds(), date.getMilliseconds());
  return target;
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

function authenticationTrialActive(): boolean {
  const expiresAt = Date.parse(setting('auth_trial_expires_at'));
  return Number.isFinite(expiresAt) && expiresAt > Date.now();
}

function sessionForSender(senderId: number): AuthenticatedEmployee | undefined {
  if (trialSessions.has(senderId) && !authenticationTrialActive()) {
    authenticatedSessions.delete(senderId);
    trialSessions.delete(senderId);
  }
  const session = authenticatedSessions.get(senderId);
  if (session) return session;
  if (!authenticationTrialActive()) return undefined;
  const owner = (database.prepare('SELECT id, first_name, last_name, role, barcode FROM employees ORDER BY id').all() as AuthenticatedEmployee[])
    .find((employee) => normalizedEmployeeRole(employee.role) === 'proprietario');
  if (!owner) return undefined;
  authenticatedSessions.set(senderId, owner);
  trialSessions.add(senderId);
  return owner;
}

function setSetting(key: string, value: string): void {
  database.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value);
}

function writeInitialAccessFile(folder: string, barcode: string): void {
  const accessFolder = join(folder, 'Accesso iniziale');
  mkdirSync(accessFolder, { recursive: true });
  writeFileSync(join(accessFolder, 'Credenziali proprietario.txt'), [
    'Accesso iniziale - Gestione Supermercato',
    '',
    'Ruolo: Proprietario',
    'Nome: Proprietario Iniziale',
    `Barcode di accesso: ${barcode}`,
    'Password: non prevista; accedi inserendo o scansionando il barcode.',
    '',
    'Conserva questo file in un luogo sicuro.',
    '',
  ].join('\n'), 'utf8');
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

function removeExpiredRecords(): number {
  const now = new Date();
  const saleCutoff = localDateMonthsBefore(now, 1);
  const movementCutoff = localDateMonthsBefore(now, 12);
  return database.transaction(() => {
    const deletedSales = database.prepare('DELETE FROM sales WHERE created_at < ?').run(saleCutoff.toISOString());
    database.prepare('DELETE FROM stock_movements WHERE created_at < ?').run(movementCutoff.toISOString());
    return deletedSales.changes;
  })();
}

function isEmployeeBarcode(value: unknown): boolean {
  if (typeof value !== 'string' || !value.trim()) return false;
  return Boolean(database.prepare('SELECT 1 FROM employees WHERE recognition_code = ? AND barcode = ?')
    .get(value.trim(), value.trim()));
}

function employeeForLogin(value: unknown): AuthenticatedEmployee | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  return database.prepare(`SELECT id, first_name, last_name, role, barcode FROM employees
    WHERE recognition_code = ? AND barcode = ?`).get(value.trim(), value.trim()) as AuthenticatedEmployee | undefined ?? null;
}

function requireSession(senderId: number, allowedRoles?: string[]): AuthenticatedEmployee {
  const session = sessionForSender(senderId);
  if (!session || !session.id) throw new Error('Sessione non autenticata. Accedi nuovamente con il badge dipendente.');
  if (allowedRoles && normalizedEmployeeRole(session.role) !== 'proprietario' && !allowedRoles.includes(normalizedEmployeeRole(session.role))) {
    throw new Error('Il tuo ruolo non ha i permessi per eseguire questa operazione.');
  }
  return session;
}

function consumeSaleAuthorization(senderId: number, barcode: string): void {
  const authorization = saleActionAuthorizations.get(senderId);
  saleActionAuthorizations.delete(senderId);
  if (!authorization || authorization.expiresAt < Date.now() || authorization.barcode !== barcode.trim()) {
    throw new Error('Verifica dipendente scaduta. Scansiona nuovamente il badge per continuare.');
  }
}

function recordEmployeeActivity(barcode: string, section: string, action: string, detail = ''): void {
  const employee = employeeForLogin(barcode);
  if (!employee) throw new Error('Dipendente non riconosciuto per la registrazione dell’attività.');
  database.prepare(`INSERT INTO employee_activity (employee_id, employee_name, section, action, detail, created_at)
    VALUES (?, ?, ?, ?, ?, ?)`).run(
    employee.id,
    `${employee.first_name} ${employee.last_name}`.trim(),
    section,
    action,
    detail,
    new Date().toISOString(),
  );
}

function normalizedEmployeeRole(role: string): string {
  return role.trim().toLocaleLowerCase('it-IT').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function findValidVoucher(code: string, today = localDate(new Date())): { id: number; batch_id: number; discount_percentage: number; starts_at: string; ends_at: string } | undefined {
  return database.prepare(`SELECT v.id, v.batch_id, b.discount_percentage, b.starts_at, b.ends_at
    FROM vouchers v JOIN voucher_batches b ON b.id = v.batch_id
    WHERE v.code = ? AND b.starts_at <= ? AND b.ends_at >= ?`).get(code, today, today) as
    { id: number; batch_id: number; discount_percentage: number; starts_at: string; ends_at: string } | undefined;
}

function allSales(): unknown[] {
  const sales = database.prepare(`SELECT s.*,
      COALESCE(NULLIF(s.employee_name, ''), (
        SELECT movement.person FROM stock_movements movement
        WHERE movement.note = 'Vendita #' || s.receipt_no AND TRIM(movement.person) != ''
        ORDER BY movement.id LIMIT 1
      ), '') AS person,
      COALESCE(SUM(i.quantity), 0) AS item_count
    FROM sales s LEFT JOIN sale_items i ON i.sale_id = s.id GROUP BY s.id ORDER BY s.created_at DESC`).all() as Array<Record<string, unknown>>;
  return sales.map((sale) => ({ ...sale, items: saleItems(sale.id as number) }));
}

function state() {
  removeExpiredVouchers();
  removeExpiredRecords();
  const employees = database.prepare(`SELECT id, first_name, last_name, age, gender, home_address, email, phone, operational_site,
    role, shift, salary, payment_method, iban, recognition_code, barcode, photo_data, documents_data, contract_pdf_data,
    contract_start_date, contract_end_date, created_at
    FROM employees ORDER BY last_name, first_name`).all() as Employee[];
  return {
    products: (database.prepare('SELECT * FROM products ORDER BY name').all() as Array<Omit<Product, 'expiry_enabled'> & { expiry_enabled: number }>).map((product) => ({ ...product, expiry_enabled: Boolean(product.expiry_enabled) })),
    sales: allSales(),
    stockMovements: database.prepare('SELECT * FROM stock_movements ORDER BY created_at DESC, id DESC').all(),
    stockDistributions: database.prepare('SELECT id, created_at, from_site, to_site, sender, recipient, file_path FROM stock_distributions ORDER BY created_at DESC, id DESC').all() as StockDistributionRecord[],
    siteStocks: database.prepare(`SELECT inventory.product_id, inventory.site_id, sites.name AS site_name, inventory.stock
      FROM site_inventory inventory JOIN sites ON sites.id = inventory.site_id
      ORDER BY sites.name, inventory.product_id`).all(),
    expenses: database.prepare('SELECT * FROM expenses ORDER BY expense_date DESC, id DESC').all() as Expense[],
    promotions: database.prepare('SELECT * FROM promotions ORDER BY starts_at DESC').all(),
    voucherBatches: allVoucherBatches(),
    employees,
    employeeActivities: database.prepare('SELECT * FROM employee_activity ORDER BY created_at DESC, id DESC').all(),
    payrollPayments: database.prepare(`SELECT payments.*, employees.first_name, employees.last_name, employees.operational_site AS site
      FROM payroll_payments payments JOIN employees ON employees.id = payments.employee_id
      ORDER BY payments.pay_month DESC, employees.last_name, employees.first_name`).all() as PayrollPayment[],
    refunds: database.prepare('SELECT * FROM refunds ORDER BY created_at DESC, id DESC').all(),
    sites: database.prepare('SELECT * FROM sites ORDER BY name').all() as Site[],
    customers: database.prepare('SELECT * FROM customers ORDER BY last_name, first_name').all(),
    loyaltyCards: database.prepare(`SELECT cards.*, CASE WHEN customers.id IS NULL THEN NULL
      ELSE TRIM(customers.first_name || ' ' || customers.last_name) END AS customer_name
      FROM loyalty_cards cards LEFT JOIN customers ON customers.id = cards.customer_id
      ORDER BY cards.created_at DESC, cards.id DESC`).all(),
    settings: {
      shop_name: setting('shop_name', 'Il tuo supermercato'),
      shop_number: setting('shop_number'),
      main_site_id: setting('main_site_id'),
      shop_address: setting('shop_address'),
      shop_phone: setting('shop_phone'),
      shop_email: setting('shop_email'),
      shop_tax_id: setting('shop_tax_id'),
      currency: setting('currency', 'EUR'),
      setup_complete: setting('setup_complete', employees.length ? 'true' : 'false') === 'true',
      auth_trial_expires_at: setting('auth_trial_expires_at'),
      shop_logo: setting('shop_logo'),
      home_image: setting('home_image'),
      home_video: (() => {
        const path = setting('home_video');
        if (!path || !existsSync(path)) return '';
        const extension = path.toLowerCase().endsWith('.webm') ? 'webm' : 'mp4';
        return `data:video/${extension};base64,${readFileSync(path).toString('base64')}`;
      })(),
      archive_folder: setting('archive_folder', join(app.getPath('documents'), 'Gestionale-Archivio')),
      database_file: databaseFile,
      receipt_printer: setting('receipt_printer'),
      receipt_printer_thermal: setting('receipt_printer_thermal'),
      barcode_scanner_enabled: setting('barcode_scanner_enabled', 'true') === 'true',
      barcode_scanner_detected: setting('barcode_scanner_detected') === 'true',
    },
  };
}

function stateForSession(session?: AuthenticatedEmployee): ReturnType<typeof state> {
  const snapshot = state();
  const role = normalizedEmployeeRole(session?.role ?? '');

  const maskedEmployee = (employee: Employee): Employee => ({
    ...employee,
    first_name: '',
    last_name: '',
    age: 0,
    gender: '',
    home_address: '',
    email: '',
    phone: '',
    operational_site: employee.operational_site,
    role: '',
    shift: '',
    salary: 0,
    payment_method: 'Contanti',
    iban: '',
    recognition_code: '',
    barcode: '',
    photo_data: '',
    documents_data: '',
    contract_pdf_data: '',
  });

  const publicSettings = {
    ...snapshot.settings,
    shop_address: '',
    shop_phone: '',
    shop_email: '',
    shop_tax_id: '',
    archive_folder: '',
    database_file: '',
    receipt_printer: '',
    receipt_printer_thermal: '',
    home_image: '',
    home_video: '',
  };

  if (!session || !session.id) {
    return {
      ...snapshot,
      products: [],
      sales: [],
      stockMovements: [],
      stockDistributions: [],
      siteStocks: [],
      expenses: [],
      promotions: [],
      voucherBatches: [],
      employees: snapshot.employees.map((employee) => maskedEmployee(employee)),
      employeeActivities: [],
      payrollPayments: [],
      sites: [],
      customers: [],
      loyaltyCards: [],
      settings: publicSettings,
    };
  }

  if (role === 'proprietario' || role === 'direttore') {
    return snapshot;
  }

  const ownEmployee = snapshot.employees.find((employee) => employee.id === session.id);
  const ownSiteName = ownEmployee?.operational_site ?? '';
  const ownSales = (snapshot.sales as Sale[]).filter((sale) => sale.site === ownSiteName);
  const ownSite = snapshot.sites.find((site) => site.name === ownSiteName);

  return {
    ...snapshot,
    products: snapshot.products.map((product) => ({ ...product, purchase_price: 0, low_stock_threshold: 0 })),
    sales: ownSales.map((sale) => ({
      ...sale,
      items: sale.items.map((item: SaleItem) => ({ ...item, purchase_price: 0 })),
    })),
    stockMovements: [],
    stockDistributions: [],
    siteStocks: (snapshot.siteStocks as SiteStock[]).filter((stock) => stock.site_name === ownSiteName),
    expenses: [],
    promotions: [],
    voucherBatches: [],
    employees: ownEmployee ? [maskedEmployee(ownEmployee)] : [],
    employeeActivities: [],
    payrollPayments: [],
    sites: ownSite ? [ownSite] : [],
    customers: [],
    loyaltyCards: [],
    settings: publicSettings,
  };
}

function initDatabase(): void {
  databaseFile = join(app.getPath('userData'), 'gestionale.sqlite');
  const isNewDatabase = !existsSync(databaseFile);
  database = new Database(databaseFile);
  database.pragma('journal_mode = WAL');
  database.pragma('foreign_keys = ON');
  database.exec(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT NOT NULL UNIQUE, name TEXT NOT NULL, unit TEXT NOT NULL DEFAULT 'PEZZO',
      category TEXT NOT NULL DEFAULT 'Altro', sale_price REAL NOT NULL, purchase_price REAL NOT NULL,
      stock REAL NOT NULL DEFAULT 0, low_stock_threshold REAL NOT NULL DEFAULT 5,
      expiry_enabled INTEGER NOT NULL DEFAULT 0, expiry_date TEXT, photo_data TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS sales (
      id INTEGER PRIMARY KEY AUTOINCREMENT, receipt_no TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL, employee_name TEXT NOT NULL DEFAULT '', payment_method TEXT NOT NULL, discount REAL NOT NULL DEFAULT 0,
      total REAL NOT NULL DEFAULT 0, site TEXT NOT NULL DEFAULT ''
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
    CREATE TABLE IF NOT EXISTS sites (
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, address TEXT NOT NULL DEFAULT '',
      phone TEXT NOT NULL DEFAULT '', email TEXT NOT NULL DEFAULT '', tax_id TEXT NOT NULL DEFAULT '',
      manager_name TEXT NOT NULL DEFAULT '', opening_hours TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '',
      site_type TEXT NOT NULL DEFAULT 'store' CHECK(site_type IN ('store', 'warehouse')),
      recognition_code TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS stock_movements (
      id INTEGER PRIMARY KEY AUTOINCREMENT, product_id INTEGER NOT NULL, product_name TEXT NOT NULL,
      movement_type TEXT NOT NULL CHECK(movement_type IN ('Carico', 'Scarico')),
      quantity REAL NOT NULL, created_at TEXT NOT NULL, person TEXT NOT NULL DEFAULT '',
      destination TEXT NOT NULL DEFAULT '', note TEXT NOT NULL DEFAULT '', site TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS stock_distributions (
      id INTEGER PRIMARY KEY AUTOINCREMENT, created_at TEXT NOT NULL, from_site TEXT NOT NULL,
      to_site TEXT NOT NULL, sender TEXT NOT NULL, recipient TEXT NOT NULL, file_path TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS site_inventory (
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      site_id INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
      stock REAL NOT NULL DEFAULT 0 CHECK(stock >= 0),
      PRIMARY KEY(product_id, site_id)
    );
    CREATE TABLE IF NOT EXISTS employee_activity (
      id INTEGER PRIMARY KEY AUTOINCREMENT, employee_id INTEGER NOT NULL, employee_name TEXT NOT NULL,
      section TEXT NOT NULL, action TEXT NOT NULL, detail TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT, description TEXT NOT NULL, category TEXT NOT NULL,
      amount REAL NOT NULL, expense_date TEXT NOT NULL, created_at TEXT NOT NULL,
      site TEXT NOT NULL DEFAULT 'Non assegnata', receipt_data TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS refunds (
      id INTEGER PRIMARY KEY AUTOINCREMENT, sale_id INTEGER NOT NULL, receipt_no TEXT NOT NULL,
      amount REAL NOT NULL CHECK(amount > 0), created_at TEXT NOT NULL, site TEXT NOT NULL
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
      payment_method TEXT NOT NULL DEFAULT 'Contanti', contract_start_date TEXT NOT NULL DEFAULT '', contract_end_date TEXT NOT NULL DEFAULT ''
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
  if (!setting('auth_trial_expires_at')) {
    const expiresAt = isNewDatabase ? Date.now() + 24 * 60 * 60 * 1000 : 0;
    setSetting('auth_trial_expires_at', new Date(expiresAt).toISOString());
  }
  const siteColumns = database.prepare('PRAGMA table_info(sites)').all() as Array<{ name: string }>;
  if (!siteColumns.some((column) => column.name === 'site_type')) {
    database.exec("ALTER TABLE sites ADD COLUMN site_type TEXT NOT NULL DEFAULT 'store' CHECK(site_type IN ('store', 'warehouse'))");
  }
  if (!siteColumns.some((column) => column.name === 'recognition_code')) {
    database.exec("ALTER TABLE sites ADD COLUMN recognition_code TEXT NOT NULL DEFAULT ''");
  }
  for (const column of ['email', 'tax_id', 'manager_name', 'opening_hours', 'notes']) {
    if (!siteColumns.some((existing) => existing.name === column)) database.exec(`ALTER TABLE sites ADD COLUMN ${column} TEXT NOT NULL DEFAULT ''`);
  }
  const employeeColumns = database.prepare('PRAGMA table_info(employees)').all() as Array<{ name: string }>;
  if (!employeeColumns.some((column) => column.name === 'payment_method')) {
    database.exec("ALTER TABLE employees ADD COLUMN payment_method TEXT NOT NULL DEFAULT 'Contanti'");
  }
  for (const column of ['contract_start_date', 'contract_end_date']) {
    if (!employeeColumns.some((item) => item.name === column)) database.exec(`ALTER TABLE employees ADD COLUMN ${column} TEXT NOT NULL DEFAULT ''`);
  }
  database.exec(`UPDATE employees
    SET recognition_code = REPLACE(recognition_code, 'DIP-', 'DIP'),
        barcode = REPLACE(recognition_code, 'DIP-', 'DIP')
    WHERE recognition_code LIKE 'DIP-%'`);
  database.exec('UPDATE employees SET barcode = recognition_code WHERE barcode != recognition_code');
  const stockMovementColumns = database.prepare('PRAGMA table_info(stock_movements)').all() as Array<{ name: string }>;
  if (!stockMovementColumns.some((column) => column.name === 'person')) {
    database.exec("ALTER TABLE stock_movements ADD COLUMN person TEXT NOT NULL DEFAULT ''");
  }
  if (!stockMovementColumns.some((column) => column.name === 'destination')) {
    database.exec("ALTER TABLE stock_movements ADD COLUMN destination TEXT NOT NULL DEFAULT ''");
  }
  if (!stockMovementColumns.some((column) => column.name === 'site')) {
    database.exec("ALTER TABLE stock_movements ADD COLUMN site TEXT NOT NULL DEFAULT ''");
  }
  const loyaltyCardColumns = database.prepare('PRAGMA table_info(loyalty_cards)').all() as Array<{ name: string }>;
  if (!loyaltyCardColumns.some((column) => column.name === 'barcode')) {
    database.exec("ALTER TABLE loyalty_cards ADD COLUMN barcode TEXT NOT NULL DEFAULT ''");
    database.exec("UPDATE loyalty_cards SET barcode = code WHERE barcode = ''");
  }
  database.exec('CREATE UNIQUE INDEX IF NOT EXISTS loyalty_cards_barcode_unique ON loyalty_cards(barcode)');
  const saleColumns = database.prepare('PRAGMA table_info(sales)').all() as Array<{ name: string }>;
  if (!saleColumns.some((column) => column.name === 'employee_name')) {
    database.exec("ALTER TABLE sales ADD COLUMN employee_name TEXT NOT NULL DEFAULT ''");
  }
  if (!saleColumns.some((column) => column.name === 'site')) {
    database.exec("ALTER TABLE sales ADD COLUMN site TEXT NOT NULL DEFAULT ''");
  }
  if (!saleColumns.some((column) => column.name === 'gross_total')) {
    database.exec('ALTER TABLE sales ADD COLUMN gross_total REAL NOT NULL DEFAULT 0');
    database.exec(`UPDATE sales SET gross_total = COALESCE(
      (SELECT SUM(i.quantity * p.sale_price) FROM sale_items i JOIN products p ON p.id = i.product_id WHERE i.sale_id = sales.id),
      total + discount
    )`);
  }
  const expenseColumns = database.prepare('PRAGMA table_info(expenses)').all() as Array<{ name: string }>;
  if (!expenseColumns.some((column) => column.name === 'site')) {
    database.exec("ALTER TABLE expenses ADD COLUMN site TEXT NOT NULL DEFAULT 'Non assegnata'");
  }
  if (!expenseColumns.some((column) => column.name === 'receipt_data')) {
    database.exec("ALTER TABLE expenses ADD COLUMN receipt_data TEXT NOT NULL DEFAULT ''");
  }
  migrateSites(database);
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
  if (!productColumns.some((column) => column.name === 'photo_data')) {
    database.exec("ALTER TABLE products ADD COLUMN photo_data TEXT NOT NULL DEFAULT ''");
  }
  const saleItemColumns = database.prepare('PRAGMA table_info(sale_items)').all() as Array<{ name: string }>;
  if (!saleItemColumns.some((column) => column.name === 'unit')) {
    database.exec("ALTER TABLE sale_items ADD COLUMN unit TEXT NOT NULL DEFAULT 'PEZZO'");
  }
  if (setting('stock_movements_sales_backfilled') !== '1') {
    const previousSales = database.prepare(`SELECT i.product_id, i.name, i.quantity, s.created_at, s.receipt_no, s.site
      FROM sale_items i JOIN sales s ON s.id = i.sale_id ORDER BY s.created_at, i.id`).all() as Array<{
      product_id: number; name: string; quantity: number; created_at: string; receipt_no: string; site: string;
    }>;
    const insertMovement = database.prepare(`INSERT INTO stock_movements (product_id, product_name, movement_type, quantity, created_at, note, site)
      VALUES (?, ?, 'Scarico', ?, ?, ?, ?)`);
    database.transaction(() => {
      previousSales.forEach((sale) => insertMovement.run(sale.product_id, sale.name, sale.quantity, sale.created_at, `Vendita #${sale.receipt_no}`, sale.site));
      setSetting('stock_movements_sales_backfilled', '1');
    })();
  }
  if (!app.isPackaged && (database.prepare('SELECT COUNT(*) AS count FROM products').get() as { count: number }).count === 0) {
    const insert = database.prepare('INSERT INTO products (code, name, category, sale_price, purchase_price, stock, low_stock_threshold) VALUES (@code, @name, @category, @sale_price, @purchase_price, @stock, @low_stock_threshold)');
    database.transaction(() => seedProducts.forEach((product) => insert.run(product)))();
  }
  if (isNewDatabase) {
    let barcode = '';
    do {
      barcode = `DIP${String(randomInt(100_000_000)).padStart(8, '0')}`;
    } while (database.prepare('SELECT 1 FROM employees WHERE recognition_code = ?').get(barcode));
    database.prepare(`INSERT INTO employees (
      first_name, last_name, age, gender, home_address, email, initial_password_hash, phone, operational_site,
      role, shift, salary, payment_method, iban, recognition_code, barcode, photo_data, documents_data,
      contract_pdf_data, contract_start_date, contract_end_date, created_at
    ) VALUES (?, ?, 18, ?, ?, ?, '', ?, '', 'Proprietario', ?, 0, 'Contanti', '', ?, ?, '', '[]', '', '', '', ?)`)
      .run('Proprietario', 'Iniziale', 'Non specificato', 'Non specificato', `proprietario.${randomUUID()}@example.invalid`, 'Non specificato', 'Mattina', barcode, barcode, new Date().toISOString());
    setSetting('setup_complete', 'true');
    setSetting('owner_password_reset', '1');
    writeInitialAccessFile(join(app.getPath('documents'), 'Gestionale-Archivio'), barcode);
  }
  const inventorySeedSite = database.prepare('SELECT id FROM sites ORDER BY id LIMIT 1').get() as { id: number } | undefined;
  if (inventorySeedSite) {
    database.prepare(`INSERT OR IGNORE INTO site_inventory (product_id, site_id, stock)
      SELECT products.id, ?, products.stock FROM products
      WHERE NOT EXISTS (SELECT 1 FROM site_inventory WHERE site_inventory.product_id = products.id)`).run(inventorySeedSite.id);
  }
  if (inventorySeedSite) {
    database.prepare(`UPDATE products SET stock = (SELECT COALESCE(SUM(stock), 0)
      FROM site_inventory WHERE site_inventory.product_id = products.id)`).run();
  }
  database.prepare("DELETE FROM settings WHERE key = 'pin_hash'").run();
  if (setting('setup_complete') === 'true' && setting('owner_password_reset') !== '1') {
    database.prepare("UPDATE employees SET initial_password_hash = '' WHERE lower(trim(role)) = 'proprietario'").run();
    setSetting('owner_password_reset', '1');
  }
  removeExpiredRecords();
}

type DistributionPdfData = {
  created_at: string;
  from_site: string;
  to_site: string;
  sender: string;
  recipient: string;
  items: Array<{ name: string; code: string; unit: string; quantity: number }>;
};

function distributionPdf(data: DistributionPdfData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const document = new PDFDocument({ size: 'A4', margin: 48 });
    const chunks: Buffer[] = [];
    document.on('data', (chunk: Buffer | string) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    document.once('error', reject);
    document.once('end', () => resolve(Buffer.concat(chunks)));
    document.fontSize(18).text('Documento di distribuzione', { align: 'center' });
    document.moveDown();
    document.fontSize(10).text(`Data: ${new Date(data.created_at).toLocaleString('it-IT')}`);
    document.text(`Sede di partenza: ${data.from_site}`);
    document.text(`Sede di destinazione: ${data.to_site}`);
    document.text(`Mittente: ${data.sender}`);
    document.text(`Destinatario: ${data.recipient}`);
    document.moveDown();
    document.fontSize(11).text('Articoli', { underline: true });
    document.moveDown(0.5);
    data.items.forEach((item, index) => {
      document.fontSize(10).text(`${index + 1}. ${item.name} (${item.code})`);
      document.text(`Quantita: ${item.quantity} ${item.unit}`);
      document.moveDown(0.4);
    });
    document.end();
  });
}

function receiptNumber(): string {
  for (let attempt = 0; attempt < 5000; attempt += 1) {
    const candidate = String(randomInt(1000000, 10000000));
    if (!database.prepare('SELECT 1 FROM sales WHERE receipt_no = ?').get(candidate)) return candidate;
  }
  throw new Error('Impossibile generare un numero scontrino univoco.');
}

function siteInventory(productId: number, siteId: number): number {
  const row = database.prepare('SELECT stock FROM site_inventory WHERE product_id = ? AND site_id = ?')
    .get(productId, siteId) as { stock: number } | undefined;
  return row?.stock ?? 0;
}

function adjustSiteInventory(productId: number, siteId: number, delta: number): void {
  const next = siteInventory(productId, siteId) + delta;
  if (next < -0.000001) throw new Error('La quantità richiesta supera la giacenza disponibile in questa sede.');
  database.prepare(`INSERT INTO site_inventory (product_id, site_id, stock) VALUES (?, ?, ?)
    ON CONFLICT(product_id, site_id) DO UPDATE SET stock = excluded.stock`).run(productId, siteId, Math.max(0, next));
  database.prepare(`UPDATE products SET stock = (SELECT COALESCE(SUM(stock), 0)
    FROM site_inventory WHERE product_id = ?) WHERE id = ?`).run(productId, productId);
}

function siteIdByName(name: string): number {
  const site = database.prepare('SELECT id FROM sites WHERE name = ?').get(name) as { id: number } | undefined;
  if (site) return site.id;
  throw new Error(`Sede non trovata: ${name}.`);
}

function defaultStockSite(): { id: number; name: string } {
  const configuredSiteId = Number(setting('main_site_id'));
  const configuredSite = Number.isSafeInteger(configuredSiteId) && configuredSiteId > 0
    ? database.prepare('SELECT id, name FROM sites WHERE id = ?').get(configuredSiteId) as { id: number; name: string } | undefined
    : undefined;
  const site = configuredSite ?? database.prepare('SELECT id, name FROM sites ORDER BY id LIMIT 1').get() as
    { id: number; name: string } | undefined;
  if (!site) throw new Error('Registra almeno una sede prima di gestire le giacenze.');
  return site;
}

function replaceItems(saleId: number, items: SaleItem[], siteId: number): void {
  const oldItems = saleItems(saleId);
  oldItems.forEach((item) => adjustSiteInventory(item.product_id, siteId, item.quantity));
  database.prepare('DELETE FROM sale_items WHERE sale_id = ?').run(saleId);
  const addItem = database.prepare(`INSERT INTO sale_items (sale_id, product_id, name, code, unit, quantity, unit_price, purchase_price)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
  for (const item of items) {
    if (!Number.isFinite(item.quantity) || item.quantity <= 0 || !Number.isFinite(item.unit_price) || item.unit_price < 0) throw new Error('Quantità o prezzo non validi.');
    if (!database.prepare('SELECT 1 FROM products WHERE id = ?').get(item.product_id)
      || siteInventory(item.product_id, siteId) < item.quantity) {
      throw new Error(`Scorta insufficiente per ${item.name} in questa sede.`);
    }
    adjustSiteInventory(item.product_id, siteId, -item.quantity);
    addItem.run(saleId, item.product_id, item.name, item.code, item.unit ?? 'PEZZO', item.quantity, item.unit_price, item.purchase_price);
  }
}

function recordStockMovement(productId: number, productName: string, type: 'Carico' | 'Scarico', quantity: number, note: string, person = '', destination = '', site = defaultStockSite().name): void {
  database.prepare(`INSERT INTO stock_movements (product_id, product_name, movement_type, quantity, created_at, person, destination, note, site)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(productId, productName, type, quantity, new Date().toISOString(), person, destination, note, site);
}

const archiveNumber = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 2 });
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
  const archiveMoney = new Intl.NumberFormat('it-IT', { style: 'currency', currency: setting('currency', 'EUR') });
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
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.focus();
    return;
  }
  const iconPath = app.isPackaged
    ? join(process.resourcesPath, 'icons', 'app.svg')
    : join(app.getAppPath(), 'build', 'icon.svg');
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    fullscreen: true,
    autoHideMenuBar: true,
    minWidth: 1120,
    minHeight: 720,
    backgroundColor: '#f6f7f5',
    title: 'Gestione Supermercato',
    icon: iconPath,
    webPreferences: { preload: join(__dirname, '../preload/index.js'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  const rendererUrl = process.env.ELECTRON_RENDERER_URL;
  mainWindow.webContents.setWindowOpenHandler(({ url }) => ({ action: url === 'about:blank' ? 'allow' : 'deny' }));
  const sessionId = mainWindow.webContents.id;
  mainWindow.webContents.once('destroyed', () => {
    authenticatedSessions.delete(sessionId);
    saleActionAuthorizations.delete(sessionId);
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const sameOrigin = rendererUrl && new URL(url).origin === new URL(rendererUrl).origin;
    const sameFile = !rendererUrl && url === pathToFileURL(join(__dirname, '../renderer/index.html')).href;
    const localBlob = url.startsWith('blob:') && (rendererUrl
      ? new URL(url).origin === new URL(rendererUrl).origin
      : url.startsWith('blob:file://'));
    if (!sameOrigin && !sameFile && !localBlob) event.preventDefault();
  });
  if (process.env.ELECTRON_RENDERER_URL) mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  else mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
}

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    } else {
      createWindow();
    }
  });
}

if (hasSingleInstanceLock) app.whenReady().then(() => {
  initDatabase();
  ipcMain.handle('state:get', (event) => stateForSession(sessionForSender(event.sender.id)));
  ipcMain.handle('employee:authorize', (event, barcode: string) => {
    requireSession(event.sender.id, ['proprietario', 'direttore']);
    return isEmployeeBarcode(barcode);
  });
  ipcMain.handle('employee:authorize-tracker', (event, barcode: string) => {
    requireSession(event.sender.id, ['proprietario', 'direttore']);
    const employee = employeeForLogin(barcode);
    return Boolean(employee && ['proprietario', 'direttore'].includes(normalizedEmployeeRole(employee.role)));
  });
  ipcMain.handle('employee:login', (event, barcode: string) => {
    const employee = employeeForLogin(barcode);
    if (employee) {
      authenticatedSessions.set(event.sender.id, employee);
      trialSessions.delete(event.sender.id);
    } else {
      authenticatedSessions.delete(event.sender.id);
      trialSessions.delete(event.sender.id);
    }
    return employee;
  });
  ipcMain.handle('session:logout', (event) => {
    saleActionAuthorizations.delete(event.sender.id);
    trialSessions.delete(event.sender.id);
    return authenticatedSessions.delete(event.sender.id);
  });
  ipcMain.handle('employee:activity', (event, input: { employee_barcode: string; section: string; action: string; detail?: string }) => {
    const session = requireSession(event.sender.id);
    if (!input || typeof input.employee_barcode !== 'string'
      || typeof input.section !== 'string' || !input.section.trim() || input.section.length > 80
      || typeof input.action !== 'string' || !input.action.trim() || input.action.length > 120
      || (input.detail !== undefined && (typeof input.detail !== 'string' || input.detail.length > 500))) {
      throw new Error('I dati dell’attività del dipendente non sono validi.');
    }
    if (session.barcode !== input.employee_barcode.trim()) throw new Error('La sessione non corrisponde al dipendente che registra l’attività.');
    recordEmployeeActivity(input.employee_barcode, input.section.trim(), input.action.trim(), input.detail?.trim() ?? '');
  });
  ipcMain.handle('product:save', (event, product: ProductInput, selectedSiteId?: number) => {
    requireSession(event.sender.id, ['proprietario', 'direttore']);
    if (!(database.prepare('SELECT 1 FROM sites LIMIT 1').get())) {
      throw new Error('Registra almeno una sede prima di aggiungere articoli.');
    }
    const expiryDate = product.expiry_date ? new Date(`${product.expiry_date}T00:00:00`) : null;
    const photoData = product.photo_data ?? '';
    if (!product.name.trim() || !product.code.trim() || product.sale_price < 0 || product.purchase_price < 0 || product.stock < 0
      || typeof photoData !== 'string'
      || (photoData !== '' && (!/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/i.test(photoData)
        || Buffer.byteLength(photoData.split(',')[1] ?? '', 'base64') > 5 * 1024 * 1024))
      || (product.expiry_enabled && (!product.expiry_date || !/^\d{4}-\d{2}-\d{2}$/.test(product.expiry_date) || !expiryDate || Number.isNaN(expiryDate.getTime()) || localDate(expiryDate) !== product.expiry_date))) {
      throw new Error('Controlla i dati dell’articolo e la data di scadenza.');
    }
    database.transaction(() => {
      const stockSiteId = selectedSiteId === undefined ? defaultStockSite().id : selectedSiteId;
      if (!Number.isSafeInteger(stockSiteId) || !database.prepare('SELECT 1 FROM sites WHERE id = ?').get(stockSiteId)) {
        throw new Error('Seleziona una sede valida per l’articolo.');
      }
      const existing = database.prepare('SELECT id, photo_data FROM products WHERE code = ?').get(product.code.trim()) as { id: number; photo_data: string } | undefined;
      const otherSiteStock = existing
        ? (database.prepare('SELECT COALESCE(SUM(stock), 0) AS stock FROM site_inventory WHERE product_id = ? AND site_id != ?')
          .get(existing.id, stockSiteId) as { stock: number }).stock
        : 0;
      if (product.stock < otherSiteStock) throw new Error('La giacenza totale non può essere inferiore alle quantità già assegnate alle altre sedi.');
      database.prepare(`INSERT INTO products (code, name, unit, category, sale_price, purchase_price, stock, low_stock_threshold, expiry_enabled, expiry_date, photo_data)
        VALUES (@code, @name, @unit, @category, @sale_price, @purchase_price, @stock, @low_stock_threshold, @expiry_enabled, @expiry_date, @photo_data)
        ON CONFLICT(code) DO UPDATE SET name=excluded.name, category=excluded.category, sale_price=excluded.sale_price,
        unit=excluded.unit, purchase_price=excluded.purchase_price, stock=excluded.stock, low_stock_threshold=excluded.low_stock_threshold,
        expiry_enabled=excluded.expiry_enabled, expiry_date=excluded.expiry_date, photo_data=excluded.photo_data`).run({
        ...product,
        code: product.code.trim(),
        unit: product.unit ?? 'PEZZO',
        photo_data: product.photo_data ?? existing?.photo_data ?? '',
        expiry_enabled: product.expiry_enabled ? 1 : 0,
        expiry_date: product.expiry_enabled ? product.expiry_date : null,
      });
      const saved = database.prepare('SELECT id FROM products WHERE code = ?').get(product.code.trim()) as { id: number };
      const mainStock = product.stock - otherSiteStock;
      database.prepare(`INSERT INTO site_inventory (product_id, site_id, stock) VALUES (?, ?, ?)
        ON CONFLICT(product_id, site_id) DO UPDATE SET stock = excluded.stock`).run(saved.id, stockSiteId, mainStock);
    })();
  });
  ipcMain.handle('product:delete', (event, productId: number) => {
    requireSession(event.sender.id, ['proprietario', 'direttore']);
    if (!Number.isInteger(productId) || productId < 1) throw new Error('Articolo non valido.');
    const product = database.prepare('SELECT name, stock FROM products WHERE id = ?').get(productId) as { name: string; stock: number } | undefined;
    if (!product) throw new Error('Articolo non trovato.');
    database.transaction(() => {
      const quantities = database.prepare(`SELECT sites.name AS site_name, site_inventory.stock
        FROM site_inventory JOIN sites ON sites.id = site_inventory.site_id
        WHERE product_id = ? AND stock > 0`).all(productId) as Array<{ site_name: string; stock: number }>;
      quantities.forEach(({ site_name, stock }) => recordStockMovement(productId, product.name, 'Scarico', stock, 'Articolo eliminato dal magazzino', '', '', site_name));
      database.prepare('DELETE FROM products WHERE id = ?').run(productId);
    })();
  });
  ipcMain.handle('product:dispose-expired', (event, productId: number) => {
    requireSession(event.sender.id, ['proprietario', 'direttore']);
    if (!Number.isInteger(productId) || productId < 1) throw new Error('Articolo scaduto non valido.');
    const product = database.prepare(`SELECT name, stock, purchase_price FROM products
      WHERE id = ? AND expiry_enabled = 1 AND expiry_date < ?`).get(productId, localDate(new Date())) as
      { name: string; stock: number; purchase_price: number } | undefined;
    if (!product) throw new Error('Articolo non trovato o non scaduto.');
    if (product.stock <= 0) throw new Error('L’articolo scaduto non ha giacenza da smaltire.');
    database.transaction(() => {
      const quantities = database.prepare('SELECT site_id, stock FROM site_inventory WHERE product_id = ? AND stock > 0').all(productId) as Array<{ site_id: number; stock: number }>;
      quantities.forEach(({ site_id, stock }) => {
        adjustSiteInventory(productId, site_id, -stock);
        const site = database.prepare('SELECT name FROM sites WHERE id = ?').get(site_id) as { name: string };
        recordStockMovement(productId, product.name, 'Scarico', stock, 'Smaltimento prodotto scaduto', '', '', site.name);
      });
      const addWasteExpense = database.prepare(`INSERT INTO expenses (description, category, amount, expense_date, created_at, site)
        VALUES (?, 'Merce buttata', ?, ?, ?, ?)`);
      quantities.forEach(({ site_id, stock }) => {
        const site = database.prepare('SELECT name FROM sites WHERE id = ?').get(site_id) as { name: string };
        addWasteExpense.run(
          `Perdita merce scaduta: ${product.name}`,
          stock * product.purchase_price,
          localDate(new Date()),
          new Date().toISOString(),
          site.name,
        );
      });
    })();
  });
  ipcMain.handle('product:stock', (event, productId: number, stock: number) => {
    requireSession(event.sender.id, ['proprietario', 'direttore']);
    if (!Number.isInteger(productId) || productId < 1 || !Number.isFinite(stock) || stock < 0) {
      throw new Error('La nuova giacenza non è valida.');
    }
    database.transaction(() => {
      const product = database.prepare('SELECT id FROM products WHERE id = ?').get(productId) as { id: number } | undefined;
      if (!product) throw new Error('Articolo non trovato.');
      const stockSiteId = defaultStockSite().id;
      const otherStock = (database.prepare('SELECT COALESCE(SUM(stock), 0) AS stock FROM site_inventory WHERE product_id = ? AND site_id != ?')
        .get(productId, stockSiteId) as { stock: number }).stock;
      if (stock < otherStock) throw new Error('La giacenza totale non può essere inferiore alle quantità già assegnate alle altre sedi.');
      database.prepare(`INSERT INTO site_inventory (product_id, site_id, stock) VALUES (?, ?, ?)
        ON CONFLICT(product_id, site_id) DO UPDATE SET stock = excluded.stock`).run(productId, stockSiteId, stock - otherStock);
      database.prepare('UPDATE products SET stock = ? WHERE id = ?').run(stock, productId);
    })();
  });
  ipcMain.handle('product:move-stock', (event, movement: { productId: number; type: 'Carico' | 'Scarico'; quantity: number; employee_barcode: string; destination?: string; note: string }) => {
    const session = requireSession(event.sender.id, ['proprietario', 'direttore']);
    if (session.barcode !== movement?.employee_barcode?.trim()) throw new Error('La sessione non corrisponde al dipendente che registra il movimento.');
    if (!Number.isInteger(movement.productId) || movement.productId < 1 || !['Carico', 'Scarico'].includes(movement.type)
      || !Number.isFinite(movement.quantity) || movement.quantity <= 0 || typeof movement.note !== 'string'
      || typeof movement.employee_barcode !== 'string' || !movement.employee_barcode.trim()
      || (movement.destination !== undefined && typeof movement.destination !== 'string')
      || (movement.type === 'Scarico' && !movement.destination?.trim())) {
      throw new Error('I dati del movimento di magazzino non sono validi.');
    }
    database.transaction(() => {
      const product = database.prepare('SELECT name FROM products WHERE id = ?').get(movement.productId) as { name: string } | undefined;
      if (!product) throw new Error('Articolo non trovato.');
      const employee = database.prepare('SELECT first_name, last_name, operational_site FROM employees WHERE barcode = ?')
        .get(movement.employee_barcode.trim()) as { first_name: string; last_name: string; operational_site: string } | undefined;
      if (!employee) throw new Error('Barcode personale non riconosciuto. Scansiona il badge di un dipendente registrato.');
      const delta = movement.type === 'Carico' ? movement.quantity : -movement.quantity;
      const movementSite = movement.type === 'Carico'
        ? defaultStockSite()
        : { id: siteIdByName(employee.operational_site), name: employee.operational_site };
      const siteId = movementSite.id;
      if (movement.type === 'Scarico' && siteInventory(movement.productId, siteId) < movement.quantity) {
        throw new Error('La quantità da scaricare supera la giacenza disponibile in questa sede.');
      }
      adjustSiteInventory(movement.productId, siteId, delta);
      recordStockMovement(
        movement.productId,
        product.name,
        movement.type,
        movement.quantity,
        movement.note.trim(),
        `${employee.first_name} ${employee.last_name}`,
        movement.type === 'Scarico' ? movement.destination?.trim() ?? '' : '',
        movementSite.name,
      );
    })();
  });
  ipcMain.handle('product:transfer-stock', async (event, movement: {
    fromSiteId: number; toSiteId: number; recipientEmployeeId: number; items: Array<{ productId: number; quantity: number }>; employee_barcode: string;
  } | null) => {
    const session = requireSession(event.sender.id, ['proprietario', 'direttore']);
    if (!movement || !Number.isInteger(movement.fromSiteId) || !Number.isInteger(movement.toSiteId)
      || movement.fromSiteId === movement.toSiteId || !Number.isInteger(movement.recipientEmployeeId) || movement.recipientEmployeeId < 1
      || !Array.isArray(movement.items) || movement.items.length < 1
      || movement.items.length > 500 || movement.items.some((item) => !Number.isInteger(item.productId)
        || item.productId < 1 || !Number.isFinite(item.quantity) || item.quantity <= 0)
      || new Set(movement.items.map((item) => item.productId)).size !== movement.items.length
      || typeof movement.employee_barcode !== 'string' || !movement.employee_barcode.trim()) {
      throw new Error('Seleziona sedi diverse e almeno un articolo con quantità valida.');
    }
    if (session.barcode !== movement.employee_barcode.trim()) throw new Error('Il barcode non corrisponde al dipendente connesso.');
    const fromSite = database.prepare('SELECT name FROM sites WHERE id = ?').get(movement.fromSiteId) as { name: string } | undefined;
    const toSite = database.prepare('SELECT name FROM sites WHERE id = ?').get(movement.toSiteId) as { name: string } | undefined;
    if (!fromSite || !toSite) throw new Error('Sede di partenza o di destinazione non trovata.');
    const employee = database.prepare('SELECT id, first_name, last_name, role FROM employees WHERE barcode = ?')
      .get(movement.employee_barcode.trim()) as { id: number; first_name: string; last_name: string; role: string } | undefined;
    if (!employee) throw new Error('Barcode personale non riconosciuto. Scansiona il badge di un dipendente registrato.');
    if (!['proprietario', 'direttore'].includes(normalizedEmployeeRole(employee.role))) {
      throw new Error('Solo il Proprietario o il Direttore può confermare un trasferimento.');
    }
    if (employee.id !== session.id) throw new Error('Il mittente deve corrispondere al dipendente connesso.');
    const recipient = database.prepare('SELECT id, first_name, last_name, role, operational_site FROM employees WHERE id = ?')
      .get(movement.recipientEmployeeId) as { id: number; first_name: string; last_name: string; role: string; operational_site: string } | undefined;
    if (!recipient || (normalizedEmployeeRole(recipient.role) !== 'proprietario' && recipient.operational_site !== toSite.name)) {
      throw new Error('Seleziona un destinatario assegnato alla sede di destinazione o un Proprietario.');
    }
    const senderName = `${employee.first_name} ${employee.last_name}`.trim();
    const recipientName = `${recipient.first_name} ${recipient.last_name}`.trim();
    const createdAt = new Date().toISOString();
    const distributionItems = movement.items.map((item) => {
      const product = database.prepare('SELECT name, code, unit FROM products WHERE id = ?').get(item.productId) as { name: string; code: string; unit: string } | undefined;
      if (!product) throw new Error('Articolo non trovato.');
      if (siteInventory(item.productId, movement.fromSiteId) < item.quantity) {
        throw new Error(`Quantità insufficiente per ${product.name} nella sede ${fromSite.name}.`);
      }
      return { product_id: item.productId, ...product, quantity: item.quantity };
    });
    const fileContents = await distributionPdf({
      created_at: createdAt,
      from_site: fromSite.name,
      to_site: toSite.name,
      sender: senderName,
      recipient: recipientName,
      items: distributionItems,
    });
    const distributionDirectory = join(app.getPath('userData'), 'Distribuzioni');
    mkdirSync(distributionDirectory, { recursive: true });
    const filePath = join(distributionDirectory, `distribuzione-${Date.now()}-${randomUUID()}.pdf`);
    let writtenDistributionFile = '';
    try {
      database.transaction(() => {
        const currentFromSite = database.prepare('SELECT name FROM sites WHERE id = ?').get(movement.fromSiteId) as typeof fromSite;
        const currentToSite = database.prepare('SELECT name FROM sites WHERE id = ?').get(movement.toSiteId) as typeof toSite;
        const currentRecipient = database.prepare('SELECT first_name, last_name, role, operational_site FROM employees WHERE id = ?')
          .get(recipient.id) as typeof recipient;
        if (!currentFromSite || !currentToSite || !currentRecipient
          || currentFromSite.name !== fromSite.name || currentToSite.name !== toSite.name
          || `${currentRecipient.first_name} ${currentRecipient.last_name}`.trim() !== recipientName
          || (normalizedEmployeeRole(currentRecipient.role) !== 'proprietario' && currentRecipient.operational_site !== toSite.name)) {
          throw new Error('I dati della distribuzione sono cambiati. Riprova la conferma.');
        }
        for (const item of distributionItems) {
          const currentProduct = database.prepare('SELECT name, code, unit FROM products WHERE id = ?').get(item.product_id) as { name: string; code: string; unit: string } | undefined;
          if (!currentProduct || currentProduct.name !== item.name || currentProduct.code !== item.code || currentProduct.unit !== item.unit) {
            throw new Error('I dati di un articolo sono cambiati. Riprova la conferma.');
          }
          if (siteInventory(item.product_id, movement.fromSiteId) < item.quantity) {
            throw new Error(`Quantità insufficiente per ${item.name} nella sede ${fromSite.name}.`);
          }
          adjustSiteInventory(item.product_id, movement.fromSiteId, -item.quantity);
          adjustSiteInventory(item.product_id, movement.toSiteId, item.quantity);
          const note = `Trasferimento da ${fromSite.name} a ${toSite.name} · Inviato da ${senderName} · Ricevuto da ${recipientName}`;
          recordStockMovement(item.product_id, item.name, 'Scarico', item.quantity, note, senderName, toSite.name, fromSite.name);
          recordStockMovement(item.product_id, item.name, 'Carico', item.quantity, note, recipientName, fromSite.name, toSite.name);
        }
        writeFileSync(filePath, fileContents, { flag: 'wx' });
        writtenDistributionFile = filePath;
        database.prepare('INSERT INTO stock_distributions (created_at, from_site, to_site, sender, recipient, file_path) VALUES (?, ?, ?, ?, ?, ?)')
          .run(createdAt, fromSite.name, toSite.name, senderName, recipientName, filePath);
      })();
    } catch (error) {
      if (writtenDistributionFile && existsSync(writtenDistributionFile)) unlinkSync(writtenDistributionFile);
      throw error;
    }
  });
  ipcMain.handle('distribution:open-record', async (event, id: number) => {
    requireSession(event.sender.id, ['proprietario', 'direttore']);
    if (!Number.isInteger(id) || id < 1) throw new Error('Distribuzione non valida.');
    const record = database.prepare('SELECT file_path FROM stock_distributions WHERE id = ?').get(id) as { file_path: string } | undefined;
    const distributionDirectory = join(app.getPath('userData'), 'Distribuzioni');
    if (!record || dirname(record.file_path) !== distributionDirectory || !existsSync(record.file_path)) throw new Error('File della distribuzione non trovato.');
    let filePath = record.file_path;
    if (extname(filePath).toLowerCase() !== '.pdf') {
      const legacy = JSON.parse(readFileSync(filePath, 'utf8')) as DistributionPdfData;
      if (typeof legacy.created_at !== 'string' || typeof legacy.from_site !== 'string'
        || typeof legacy.to_site !== 'string' || typeof legacy.sender !== 'string'
        || typeof legacy.recipient !== 'string' || !Array.isArray(legacy.items)
        || legacy.items.some((item) => !item || typeof item.name !== 'string' || typeof item.code !== 'string'
          || typeof item.unit !== 'string' || !Number.isFinite(item.quantity))) {
        throw new Error('Il file della distribuzione non contiene dati validi.');
      }
      const fileContents = await distributionPdf(legacy);
      const pdfPath = join(distributionDirectory, `distribuzione-${Date.now()}-${randomUUID()}.pdf`);
      writeFileSync(pdfPath, fileContents, { flag: 'wx' });
      try {
        database.prepare('UPDATE stock_distributions SET file_path = ? WHERE id = ?').run(pdfPath, id);
      } catch (error) {
        if (existsSync(pdfPath)) unlinkSync(pdfPath);
        throw error;
      }
      unlinkSync(filePath);
      filePath = pdfPath;
    }
    const error = await shell.openPath(filePath);
    if (error) throw new Error(`Impossibile aprire il file: ${error}`);
  });
  ipcMain.handle('sale:checkout', (event, sale: CheckoutInput) => {
    const session = requireSession(event.sender.id);
    if (['direttore', 'contabilita'].includes(normalizedEmployeeRole(session.role)) || !session.barcode
      || (sale.employee_barcode && sale.employee_barcode !== session.barcode)) {
      throw new Error('La sessione non è autorizzata a registrare vendite. Accedi con il badge del dipendente di cassa.');
    }
    const ownerSession = normalizedEmployeeRole(session.role) === 'proprietario';
    if (ownerSession && !sale.site_id) throw new Error('Seleziona la sede della cassa prima di registrare la vendita.');
    if (!ownerSession && sale.site_id !== undefined) throw new Error('La sessione non è autorizzata a selezionare la sede della vendita.');
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
    const voucherCode = sale.voucher_code?.trim() ?? '';
    if (voucherCode && !findValidVoucher(voucherCode)) throw new Error('Buono sconto non valido, scaduto o già utilizzato.');
    const grossTotal = items.reduce((sum, item) => sum + item.quantity * item.unit_price, 0);
    const createSale = database.transaction(() => {
      const employee = employeeForLogin(session.barcode);
      const employeeSite = employee
        ? (database.prepare('SELECT operational_site FROM employees WHERE id = ?').get(employee.id) as { operational_site: string }).operational_site
        : '';
      const site = ownerSession
        ? database.prepare("SELECT id, name FROM sites WHERE id = ? AND site_type = 'store'").get(sale.site_id) as { id: number; name: string } | undefined
        : database.prepare('SELECT id, name FROM sites WHERE name = ?').get(employeeSite) as { id: number; name: string } | undefined;
      if (!site) throw new Error(ownerSession ? 'La sede selezionata non esiste o non è una sede di vendita.' : employeeSite ? 'La sede assegnata al dipendente non esiste.' : 'Crea prima una sede operativa per registrare le vendite.');
      const voucher = voucherCode ? findValidVoucher(voucherCode) : undefined;
      if (voucherCode && !voucher) throw new Error('Buono sconto non valido, scaduto o già utilizzato.');
      const voucherDiscount = voucher
        ? Math.round(Math.max(0, grossTotal - discounts.automaticDiscount - discounts.manualDiscount) * voucher.discount_percentage) / 100
        : 0;
      const discount = discounts.automaticDiscount + discounts.manualDiscount + voucherDiscount;
      const amountPaid = Math.max(0, grossTotal - discount);
      const receiptNo = receiptNumber();
      const employeeName = employee ? `${employee.first_name} ${employee.last_name}`.trim() : '';
      const result = database.prepare('INSERT INTO sales (receipt_no, created_at, employee_name, payment_method, discount, gross_total, total, site) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .run(receiptNo, new Date().toISOString(), employeeName, sale.payment_method, discount, grossTotal, amountPaid, site.name);
      replaceItems(Number(result.lastInsertRowid), items, site.id);
      items.forEach((item) => recordStockMovement(
        item.product_id,
        item.name,
        'Scarico',
        item.quantity,
        `Vendita #${receiptNo}`,
        employee ? `${employee.first_name} ${employee.last_name}`.trim() : '',
        site.name,
        site.name,
      ));
      if (voucher) {
        database.prepare('DELETE FROM vouchers WHERE id = ?').run(voucher.id);
        database.prepare('DELETE FROM voucher_batches WHERE id = ? AND NOT EXISTS (SELECT 1 FROM vouchers WHERE batch_id = ?)').run(voucher.batch_id, voucher.batch_id);
      }
      return Number(result.lastInsertRowid);
    });
    const id = createSale();
    return allSales().find((saleItem) => (saleItem as { id: number }).id === id);
  });
  ipcMain.handle('sale:authorize', (event, employeeBarcode: string) => {
    const session = requireSession(event.sender.id, ['proprietario', 'cassiere']);
    if (typeof employeeBarcode !== 'string') throw new Error('Scansiona il barcode di un dipendente.');
    const employee = employeeForLogin(employeeBarcode);
    if (!employee || !['proprietario', 'cassiere'].includes(normalizedEmployeeRole(employee.role))) return false;
    if (!session.barcode) return false;
    saleActionAuthorizations.set(event.sender.id, { barcode: employee.barcode, expiresAt: Date.now() + 120_000 });
    return true;
  });
  ipcMain.handle('sale:update', (event, sale: { id: number; payment_method: string; discount: number; items: SaleItem[]; employee_barcode: string }) => {
    requireSession(event.sender.id, ['proprietario', 'cassiere']);
    if (!sale?.employee_barcode) throw new Error('Scansiona il badge del dipendente per modificare la vendita.');
    consumeSaleAuthorization(event.sender.id, sale.employee_barcode);
    database.transaction(() => {
      if (!sale || !Number.isInteger(sale.id) || sale.id < 1 || !isEmployeeBarcode(sale.employee_barcode)) {
        throw new Error('Barcode dipendente non riconosciuto. Scansiona il codice di riconoscimento di un dipendente.');
      }
      const previousQuantities = new Map<number, { quantity: number; name: string }>();
      const employee = employeeForLogin(sale.employee_barcode);
      const previousItems = saleItems(sale.id);
      previousItems.forEach((item) => {
        const current = previousQuantities.get(item.product_id);
        previousQuantities.set(item.product_id, { quantity: (current?.quantity ?? 0) + item.quantity, name: item.name });
      });
      const trustedItems = sale.items.map((item) => {
        const previousItem = previousItems.find((previous) => previous.product_id === item.product_id);
        const product = database.prepare('SELECT purchase_price FROM products WHERE id = ?').get(item.product_id) as { purchase_price: number } | undefined;
        return { ...item, purchase_price: previousItem?.purchase_price ?? product?.purchase_price ?? 0 };
      });
      const nextQuantities = new Map<number, { quantity: number; name: string }>();
      sale.items.forEach((item) => {
        const current = nextQuantities.get(item.product_id);
        nextQuantities.set(item.product_id, { quantity: (current?.quantity ?? 0) + item.quantity, name: item.name });
      });
      const receipt = database.prepare('SELECT receipt_no, site, total FROM sales WHERE id = ?').get(sale.id) as { receipt_no: string; site: string; total: number } | undefined;
      if (!receipt) throw new Error('Scontrino non trovato.');
      replaceItems(sale.id, trustedItems, siteIdByName(receipt.site));
      new Set([...previousQuantities.keys(), ...nextQuantities.keys()]).forEach((productId) => {
        const previous = previousQuantities.get(productId);
        const next = nextQuantities.get(productId);
        const difference = (next?.quantity ?? 0) - (previous?.quantity ?? 0);
        if (difference) {
          recordStockMovement(
            productId,
            next?.name ?? previous?.name ?? 'Articolo',
            difference > 0 ? 'Scarico' : 'Carico',
            Math.abs(difference),
            `Modifica vendita #${receipt?.receipt_no ?? sale.id}`,
            employee ? `${employee.first_name} ${employee.last_name}`.trim() : '',
            '',
            receipt.site,
          );
        }
      });
      const grossTotal = sale.items.reduce((sum, item) => sum + item.quantity * item.unit_price, 0);
      const nextTotal = Math.max(0, grossTotal - sale.discount);
      if (receipt.total > nextTotal) {
        database.prepare('INSERT INTO refunds (sale_id, receipt_no, amount, created_at, site) VALUES (?, ?, ?, ?, ?)')
          .run(sale.id, receipt.receipt_no, Math.round((receipt.total - nextTotal) * 100) / 100, new Date().toISOString(), receipt.site);
      }
      database.prepare('UPDATE sales SET payment_method=?, discount=?, gross_total=?, total=? WHERE id=?')
        .run(sale.payment_method, sale.discount, grossTotal, nextTotal, sale.id);
    })();
  });
  ipcMain.handle('sale:delete', (event, id: number, employeeBarcode: string) => {
    requireSession(event.sender.id, ['proprietario', 'cassiere']);
    consumeSaleAuthorization(event.sender.id, employeeBarcode);
    database.transaction(() => {
      if (!Number.isInteger(id) || id < 1 || !isEmployeeBarcode(employeeBarcode)) {
        throw new Error('Barcode dipendente non riconosciuto. Scansiona il codice di riconoscimento di un dipendente.');
      }
      const receipt = database.prepare('SELECT receipt_no, site, total FROM sales WHERE id = ?').get(id) as { receipt_no: string; site: string; total: number } | undefined;
      if (!receipt) throw new Error('Scontrino non trovato.');
      if (receipt.total > 0) {
        database.prepare('INSERT INTO refunds (sale_id, receipt_no, amount, created_at, site) VALUES (?, ?, ?, ?, ?)')
          .run(id, receipt.receipt_no, receipt.total, new Date().toISOString(), receipt.site);
      }
      const employee = employeeForLogin(employeeBarcode);
      const siteId = siteIdByName(receipt.site);
      saleItems(id).forEach((item) => {
        adjustSiteInventory(item.product_id, siteId, item.quantity);
        recordStockMovement(
          item.product_id,
          item.name,
          'Carico',
          item.quantity,
          `Vendita #${receipt?.receipt_no ?? id} eliminata`,
          employee ? `${employee.first_name} ${employee.last_name}`.trim() : '',
          '',
          receipt.site,
        );
      });
      database.prepare('DELETE FROM sales WHERE id=?').run(id);
    })();
  });
  ipcMain.handle('promotion:save', (event, promotion: PromotionInput) => {
    requireSession(event.sender.id, ['proprietario', 'contabilita']);
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
  ipcMain.handle('promotion:delete', (event, id: number) => {
    requireSession(event.sender.id, ['proprietario', 'contabilita']);
    const result = database.prepare('DELETE FROM promotions WHERE id = ?').run(id);
    if (result.changes === 0) throw new Error('Promozione non trovata.');
  });
  ipcMain.handle('voucher-batch:save', (event, batch: VoucherBatchInput) => {
    requireSession(event.sender.id, ['proprietario', 'contabilita']);
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
  ipcMain.handle('voucher-batch:delete', (event, id: number) => {
    requireSession(event.sender.id, ['proprietario', 'contabilita']);
    if (!Number.isInteger(id) || id < 1) throw new Error('Gruppo di buoni sconto non valido.');
    const deleteBatch = database.transaction(() => {
      database.prepare('DELETE FROM vouchers WHERE batch_id = ?').run(id);
      const result = database.prepare('DELETE FROM voucher_batches WHERE id = ?').run(id);
      if (result.changes === 0) throw new Error('Gruppo di buoni sconto non trovato.');
    });
    deleteBatch();
  });
  ipcMain.handle('expense:save', (event, expense: Pick<Expense, 'description' | 'category' | 'amount' | 'expense_date' | 'site' | 'receipt_data'>) => {
    requireSession(event.sender.id, ['proprietario', 'direttore', 'contabilita']);
    const isValidDate = (value: string) => {
      const date = new Date(`${value}T00:00:00`);
      return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(date.getTime()) && localDate(date) === value;
    };
    if (!expense || typeof expense.description !== 'string' || !expense.description.trim()
      || typeof expense.category !== 'string' || !expense.category.trim()
      || typeof expense.site !== 'string' || !expense.site.trim()
      || typeof expense.receipt_data !== 'string'
      || (expense.receipt_data && !/^data:(?:image\/(?:png|jpeg|webp)|application\/pdf);base64,[A-Za-z0-9+/]*={0,2}$/i.test(expense.receipt_data))
      || Buffer.byteLength(expense.receipt_data, 'utf8') > 14 * 1024 * 1024
      || (expense.category === 'Affitto' && !expense.receipt_data)
      || !Number.isFinite(expense.amount) || expense.amount <= 0 || !isValidDate(expense.expense_date)) {
      throw new Error('Controlla descrizione, categoria, sede, ricevuta, importo e data della spesa.');
    }
    let receiptPath = '';
    if (expense.category.trim() === 'Affitto') {
      const separator = expense.receipt_data.indexOf(',');
      const mimeType = expense.receipt_data.slice(5, expense.receipt_data.indexOf(';')).toLowerCase();
      const extension = mimeType === 'application/pdf' ? 'pdf' : mimeType === 'image/jpeg' ? 'jpg' : mimeType === 'image/webp' ? 'webp' : 'png';
      const receiptFolder = join(app.getPath('userData'), 'Ricevute pagamento affitto');
      mkdirSync(receiptFolder, { recursive: true });
      receiptPath = join(receiptFolder, `ricevuta-affitto-${Date.now()}-${randomUUID()}.${extension}`);
      writeFileSync(receiptPath, Buffer.from(expense.receipt_data.slice(separator + 1), 'base64'));
    }
    try {
      database.prepare('INSERT INTO expenses (description, category, amount, expense_date, created_at, site, receipt_data) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(expense.description.trim(), expense.category.trim(), expense.amount, expense.expense_date, new Date().toISOString(), expense.site.trim(), receiptPath);
    } catch (error) {
      if (receiptPath && existsSync(receiptPath)) unlinkSync(receiptPath);
      throw error;
    }
  });
  ipcMain.handle('expense:receipt:open', async (event, id: number) => {
    requireSession(event.sender.id, ['proprietario', 'direttore', 'contabilita']);
    if (!Number.isInteger(id) || id < 1) throw new Error('Spesa non valida.');
    const expense = database.prepare('SELECT receipt_data FROM expenses WHERE id = ?').get(id) as { receipt_data: string } | undefined;
    if (!expense?.receipt_data) throw new Error('Ricevuta non trovata.');
    const receiptFolder = join(app.getPath('userData'), 'Ricevute pagamento affitto');
    let receiptPath = expense.receipt_data;
    if (receiptPath.startsWith('data:')) {
      const matched = /^data:(application\/pdf|image\/png|image\/jpeg|image\/webp);base64,([A-Za-z0-9+/]*={0,2})$/i.exec(receiptPath);
      if (!matched) throw new Error('Formato della ricevuta non valido.');
      const extension = matched[1].toLowerCase() === 'application/pdf' ? 'pdf' : matched[1].toLowerCase() === 'image/jpeg' ? 'jpg' : matched[1].toLowerCase() === 'image/webp' ? 'webp' : 'png';
      mkdirSync(receiptFolder, { recursive: true });
      receiptPath = join(receiptFolder, `ricevuta-affitto-${id}-${randomUUID()}.${extension}`);
      writeFileSync(receiptPath, Buffer.from(matched[2], 'base64'));
      database.prepare('UPDATE expenses SET receipt_data = ? WHERE id = ?').run(receiptPath, id);
    }
    if (dirname(receiptPath) !== receiptFolder || basename(receiptPath) !== receiptPath.split(/[\\/]/).pop() || !existsSync(receiptPath)) {
      throw new Error('Il file della ricevuta non è disponibile nella cartella locale.');
    }
    const openError = await shell.openPath(receiptPath);
    if (openError) throw new Error(`Impossibile aprire la ricevuta: ${openError}`);
  });
  ipcMain.handle('expense:delete', (event, id: number) => {
    requireSession(event.sender.id, ['proprietario', 'direttore', 'contabilita']);
    if (!Number.isInteger(id) || id < 1) throw new Error('Spesa non valida.');
    const expense = database.prepare('SELECT receipt_data FROM expenses WHERE id = ?').get(id) as { receipt_data: string } | undefined;
    const result = database.prepare('DELETE FROM expenses WHERE id = ?').run(id);
    if (result.changes === 0) throw new Error('Spesa non trovata.');
    const receiptFolder = join(app.getPath('userData'), 'Ricevute pagamento affitto');
    if (expense?.receipt_data && dirname(expense.receipt_data) === receiptFolder && existsSync(expense.receipt_data)) unlinkSync(expense.receipt_data);
  });
  ipcMain.handle('site:authorize', (event, requesterBarcode: string) => {
    const session = requireSession(event.sender.id, ['proprietario']);
    if (session.barcode !== requesterBarcode?.trim()) return false;
    const requester = employeeForLogin(requesterBarcode);
    return Boolean(requester && normalizedEmployeeRole(requester.role) === 'proprietario');
  });
  ipcMain.handle('site:save', (event, input: SiteInput, requesterBarcode: string) => {
    const session = requireSession(event.sender.id, ['proprietario']);
    if (session.barcode !== requesterBarcode?.trim()) throw new Error('La sessione non corrisponde al proprietario che gestisce le sedi.');
    const requester = employeeForLogin(requesterBarcode);
    if (!requester || normalizedEmployeeRole(requester.role) !== 'proprietario') throw new Error('Solo il Proprietario può gestire le sedi.');
    saveSite(database, input);
  });
  ipcMain.handle('site:delete', (event, siteId: number, requesterBarcode: string) => {
    const session = requireSession(event.sender.id, ['proprietario']);
    if (session.barcode !== requesterBarcode?.trim()) throw new Error('La sessione non corrisponde al proprietario che gestisce le sedi.');
    const requester = employeeForLogin(requesterBarcode);
    if (!requester || normalizedEmployeeRole(requester.role) !== 'proprietario') throw new Error('Solo il Proprietario può gestire le sedi.');
    deleteSite(database, siteId);
  });
  ipcMain.handle('site:setup', (_event, input: SiteInput) => {
    if (setting('setup_complete') === 'true'
      || (database.prepare('SELECT COUNT(*) AS count FROM employees').get() as { count: number }).count > 0) {
      throw new Error('La configurazione iniziale è già stata completata.');
    }
    const existing = database.prepare('SELECT id FROM sites WHERE name = ?').get(input?.name?.trim()) as
      { id: number } | undefined;
    saveSite(database, existing ? { ...input, id: existing.id } : input);
  });
  ipcMain.handle('employee:save', (event, employee: EmployeeInput) => {
    const requiredText: Array<keyof EmployeeInput> = [
      'first_name', 'last_name', 'gender', 'home_address', 'email', 'phone',
      'role', 'shift', 'payment_method',
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
    const editing = Boolean(employee?.id);
    const firstAccount = !editing && (database.prepare('SELECT COUNT(*) AS count FROM employees').get() as { count: number }).count === 0;
    if (!firstAccount) requireSession(event.sender.id, ['proprietario', 'contabilita']);
    const existingEmployee = editing && Number.isInteger(employee.id) && typeof employee.id === 'number' && employee.id > 0
      ? database.prepare('SELECT id, recognition_code, barcode, photo_data, documents_data, contract_pdf_data FROM employees WHERE id = ?').get(employee.id) as {
        id: number;
        recognition_code: string;
        barcode: string;
        photo_data: string;
        documents_data: string;
        contract_pdf_data: string;
      } | undefined
      : undefined;
    const candidate = employee && existingEmployee ? {
      ...employee,
      recognition_code: existingEmployee.recognition_code,
      barcode: existingEmployee.barcode,
      photo_data: employee.photo_data || existingEmployee.photo_data,
      documents_data: employee.documents_data || existingEmployee.documents_data,
      contract_pdf_data: employee.contract_pdf_data || existingEmployee.contract_pdf_data,
    } : employee;
    if (candidate && normalizedEmployeeRole(candidate.role) === 'proprietario') candidate.salary = 0;
    const initialPassword = candidate?.initial_password ?? '';
    if (firstAccount && (normalizedEmployeeRole(candidate?.role ?? '') !== 'proprietario'
      || ['shop_name', 'shop_address', 'shop_phone', 'shop_email', 'shop_tax_id'].some((key) => !setting(key).trim()))) {
      throw new Error('Completa i dati del negozio e crea il primo account Proprietario dalla configurazione iniziale.');
    }
    const documentImagesChanged = !editing || candidate?.documents_data !== existingEmployee?.documents_data;
    const photoChanged = !editing || candidate?.photo_data !== existingEmployee?.photo_data;
    const contractChanged = !editing || candidate?.contract_pdf_data !== existingEmployee?.contract_pdf_data;
    if (!candidate || (candidate.id !== undefined && (!Number.isInteger(candidate.id) || candidate.id < 1))
      || (editing && !existingEmployee)
      || requiredText.some((field) => typeof candidate[field] !== 'string' || !candidate[field]!.trim())
      || typeof candidate.operational_site !== 'string'
      || (!candidate.operational_site.trim() && (Boolean(database.prepare('SELECT 1 FROM sites LIMIT 1').get())
        || normalizedEmployeeRole(candidate.role) !== 'proprietario'))
      || !Number.isInteger(candidate.age) || candidate.age < 16 || candidate.age > 100
      || !Number.isFinite(candidate.salary) || candidate.salary < 0
      || !['Bonifico', 'Contanti'].includes(candidate.payment_method)
      || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidate.email)
      || (!editing && initialPassword.length > 0 && (initialPassword.length < 8 || initialPassword.length > 128))
      || (initialPassword.length > 0 && (initialPassword.length < 8 || initialPassword.length > 128))
      || (candidate.contract_start_date !== '' && !isValidLocalDate(candidate.contract_start_date))
      || (candidate.contract_end_date !== '' && !isValidLocalDate(candidate.contract_end_date))
      || (candidate.contract_start_date && candidate.contract_end_date && candidate.contract_end_date < candidate.contract_start_date)
      || (candidate.payment_method === 'Bonifico' && !/^[A-Z0-9 ]{15,34}$/i.test(candidate.iban))
      || (candidate.payment_method === 'Contanti' && candidate.iban !== '')
      || (!editing && (!/^DIP\d{8}$/.test(candidate.recognition_code) || candidate.barcode !== candidate.recognition_code))
      || (photoChanged && !isDataUrl(candidate.photo_data, /^data:image\/(?:png|jpeg|webp);base64,/i, 5 * 1024 * 1024))
      || (documentImagesChanged && (documentImages.length === 0 || documentImages.length > 20
        || documentImages.some((image) => typeof image !== 'string' || !isDataUrl(image, /^data:image\/(?:png|jpeg|webp);base64,/i, 5 * 1024 * 1024))))
      || (contractChanged && !isDataUrl(candidate.contract_pdf_data, /^data:application\/pdf;base64,/i, 10 * 1024 * 1024))) {
      throw new Error('Controlla i dati obbligatori, gli allegati e i codici del dipendente.');
    }
    const { id, initial_password: _initialPassword, ...employeeDetails } = candidate;
    employeeDetails.role = employeeDetails.role.trim();
    let passwordHash: string | undefined;
    if (initialPassword) {
      const salt = randomBytes(16).toString('hex');
      passwordHash = `${salt}:${scryptSync(initialPassword, salt, 64).toString('hex')}`;
    }
    try {
      if (editing) {
        const result = database.prepare(`UPDATE employees SET
          first_name=@first_name, last_name=@last_name, age=@age, gender=@gender, home_address=@home_address, email=@email,
          phone=@phone, operational_site=@operational_site, role=@role, shift=@shift, salary=@salary, payment_method=@payment_method,
          iban=@iban, recognition_code=@recognition_code, barcode=@barcode, photo_data=@photo_data, documents_data=@documents_data,
          contract_pdf_data=@contract_pdf_data, contract_start_date=@contract_start_date, contract_end_date=@contract_end_date,
          initial_password_hash=COALESCE(@initial_password_hash, initial_password_hash)
          WHERE id=@id`).run({ ...employeeDetails, id, initial_password_hash: passwordHash ?? null });
        if (!result.changes) throw new Error('Dipendente non trovato.');
        if (authenticatedSessions.get(event.sender.id)?.id === id) {
          const updatedEmployee = employeeForLogin(candidate.barcode);
          if (updatedEmployee) authenticatedSessions.set(event.sender.id, updatedEmployee);
        }
      } else {
        database.prepare(`INSERT INTO employees (
          first_name, last_name, age, gender, home_address, email, initial_password_hash, phone, operational_site,
          role, shift, salary, payment_method, iban, recognition_code, barcode, photo_data, documents_data, contract_pdf_data,
          contract_start_date, contract_end_date, created_at
        ) VALUES (
          @first_name, @last_name, @age, @gender, @home_address, @email, @initial_password_hash, @phone, @operational_site,
          @role, @shift, @salary, @payment_method, @iban, @recognition_code, @barcode, @photo_data, @documents_data, @contract_pdf_data,
          @contract_start_date, @contract_end_date, @created_at
        )`).run({
          ...employeeDetails,
          initial_password_hash: passwordHash ?? '',
          created_at: new Date().toISOString(),
        });
        if (firstAccount) {
          setSetting('setup_complete', 'true');
          const owner = employeeForLogin(candidate.barcode);
          if (owner) {
            authenticatedSessions.set(event.sender.id, owner);
            if (authenticationTrialActive()) trialSessions.add(event.sender.id);
          }
        }
      }
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
  ipcMain.handle('employee:delete', (event, employeeId: number, requesterBarcode: string) => {
    if (!Number.isInteger(employeeId) || employeeId < 1) throw new Error('Dipendente non valido.');
    const session = requireSession(event.sender.id, ['proprietario', 'direttore']);
    if (session.barcode !== requesterBarcode?.trim()) throw new Error('La sessione non corrisponde al dipendente che autorizza l’eliminazione.');
    const requester = employeeForLogin(requesterBarcode);
    if (!requester || !['proprietario', 'direttore'].includes(normalizedEmployeeRole(requester.role))) {
      throw new Error('Solo un proprietario o un direttore può eliminare dipendenti.');
    }
    const employee = database.prepare('SELECT id, role FROM employees WHERE id = ?').get(employeeId) as { id: number; role: string } | undefined;
    if (!employee) throw new Error('Dipendente non trovato.');
    if (employeeId === session.id) throw new Error('Non puoi eliminare l’account con cui hai effettuato l’accesso.');
    database.transaction(() => {
      database.prepare('DELETE FROM payroll_payments WHERE employee_id = ?').run(employeeId);
      database.prepare('DELETE FROM employees WHERE id = ?').run(employeeId);
    })();
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
  ipcMain.handle('loyalty-card:delete', (_event, id: number) => {
    if (!Number.isInteger(id) || id < 1) throw new Error('Tessera non valida.');
    const result = database.prepare("DELETE FROM loyalty_cards WHERE id = ? AND status = 'Sviluppata'").run(id);
    if (!result.changes) throw new Error('La tessera non esiste o è già attiva.');
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
        .run(input.card_id, input.points, input.points * 0.1, new Date().toISOString());
    })();
  });
  ipcMain.handle('payroll:pay', (event, input: PayrollPaymentInput) => {
    requireSession(event.sender.id, ['proprietario', 'contabilita']);
    if (!input || !Number.isInteger(input.employee_id) || !/^\d{4}-\d{2}$/.test(input.pay_month)
      || !isValidLocalDate(input.payment_date)) throw new Error('Dati del pagamento stipendio non validi.');
    const employee = database.prepare('SELECT first_name, last_name, salary, payment_method, operational_site, role FROM employees WHERE id = ?')
      .get(input.employee_id) as { first_name: string; last_name: string; salary: number; payment_method: 'Bonifico' | 'Contanti'; operational_site: string; role: string } | undefined;
    if (!employee) throw new Error('Dipendente non trovato.');
    if (normalizedEmployeeRole(employee.role) === 'proprietario') throw new Error('Il Proprietario non riceve uno stipendio.');
    database.transaction(() => {
      database.prepare(`INSERT INTO payroll_payments (employee_id, pay_month, amount, payment_date, payment_method)
        VALUES (?, ?, ?, ?, ?)`).run(input.employee_id, input.pay_month, employee.salary, input.payment_date, employee.payment_method);
      database.prepare(`INSERT INTO expenses (description, category, amount, expense_date, created_at, site)
        VALUES (?, 'Stipendi', ?, ?, ?, ?)`).run(`Stipendio ${employee.first_name} ${employee.last_name} · ${input.pay_month}`,
        employee.salary, input.payment_date, new Date().toISOString(), employee.operational_site);
    })();
  });
  ipcMain.handle('payroll:pay-all', (event, input: { pay_month: string; payment_date: string }) => {
    requireSession(event.sender.id, ['proprietario', 'contabilita']);
    if (!input || !/^\d{4}-\d{2}$/.test(input.pay_month) || !isValidLocalDate(input.payment_date)) {
      throw new Error('Mese o data del pagamento non validi.');
    }
    const employees = database.prepare(`SELECT id, first_name, last_name, salary, payment_method, operational_site, role FROM employees
      WHERE id NOT IN (SELECT employee_id FROM payroll_payments WHERE pay_month = ?)`).all(input.pay_month) as
      Array<{ id: number; first_name: string; last_name: string; salary: number; payment_method: 'Bonifico' | 'Contanti'; operational_site: string; role: string }>;
    const payableEmployees = employees.filter((employee) => normalizedEmployeeRole(employee.role) !== 'proprietario');
    if (!payableEmployees.length) throw new Error('Non ci sono stipendi da pagare per questo mese.');
    const pay = database.transaction(() => {
      const insertPayment = database.prepare(`INSERT INTO payroll_payments
        (employee_id, pay_month, amount, payment_date, payment_method) VALUES (?, ?, ?, ?, ?)`);
      const insertExpense = database.prepare(`INSERT INTO expenses (description, category, amount, expense_date, created_at, site)
        VALUES (?, 'Stipendi', ?, ?, ?, ?)`);
      const createdAt = new Date().toISOString();
      for (const employee of payableEmployees) {
        insertPayment.run(employee.id, input.pay_month, employee.salary, input.payment_date, employee.payment_method);
        insertExpense.run(`Stipendio ${employee.first_name} ${employee.last_name} · ${input.pay_month}`,
          employee.salary, input.payment_date, createdAt, employee.operational_site);
      }
    });
    pay();
  });
  ipcMain.handle('payroll:pay-selected', (event, input: { employee_ids: number[]; pay_month: string; payment_date: string }) => {
    requireSession(event.sender.id, ['proprietario', 'contabilita']);
    if (!input || !Array.isArray(input.employee_ids) || !input.employee_ids.length
      || !input.employee_ids.every((id) => Number.isInteger(id) && id > 0)
      || new Set(input.employee_ids).size !== input.employee_ids.length
      || !/^\d{4}-\d{2}$/.test(input.pay_month) || !isValidLocalDate(input.payment_date)) {
      throw new Error('Dipendenti, mese o data del pagamento non validi.');
    }
    const placeholders = input.employee_ids.map(() => '?').join(', ');
    const employees = database.prepare(`SELECT id, first_name, last_name, salary, payment_method, operational_site, role
      FROM employees WHERE id IN (${placeholders})`).all(...input.employee_ids) as
      Array<{ id: number; first_name: string; last_name: string; salary: number; payment_method: 'Bonifico' | 'Contanti'; operational_site: string; role: string }>;
    if (employees.length !== input.employee_ids.length) throw new Error('Uno o più dipendenti selezionati non esistono.');
    if (employees.some((employee) => normalizedEmployeeRole(employee.role) === 'proprietario')) {
      throw new Error('Il Proprietario non riceve uno stipendio.');
    }
    const alreadyPaid = database.prepare(`SELECT employee_id FROM payroll_payments
      WHERE pay_month = ? AND employee_id IN (${placeholders})`).all(input.pay_month, ...input.employee_ids);
    if (alreadyPaid.length) throw new Error('Uno o più dipendenti selezionati hanno già ricevuto lo stipendio per questo mese.');
    const pay = database.transaction(() => {
      const insertPayment = database.prepare(`INSERT INTO payroll_payments
        (employee_id, pay_month, amount, payment_date, payment_method) VALUES (?, ?, ?, ?, ?)`);
      const insertExpense = database.prepare(`INSERT INTO expenses (description, category, amount, expense_date, created_at, site)
        VALUES (?, 'Stipendi', ?, ?, ?, ?)`);
      const createdAt = new Date().toISOString();
      for (const employee of employees) {
        insertPayment.run(employee.id, input.pay_month, employee.salary, input.payment_date, employee.payment_method);
        insertExpense.run(`Stipendio ${employee.first_name} ${employee.last_name} · ${input.pay_month}`,
          employee.salary, input.payment_date, createdAt, employee.operational_site);
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
  ipcMain.handle('settings:save', (event, key: string, value: string) => {
    if (!['shop_name', 'shop_number', 'shop_address', 'shop_phone', 'shop_email', 'shop_tax_id', 'currency', 'main_site_id', 'archive_folder', 'receipt_printer', 'receipt_printer_thermal', 'barcode_scanner_enabled', 'barcode_scanner_detected', 'home_image', 'home_video'].includes(key)) throw new Error('Impostazione non valida.');
    if (key === 'currency' && !['EUR', 'USD', 'EGP', 'GBP', 'CHF', 'SAR', 'AED'].includes(value)) throw new Error('Moneta non valida.');
    if (key === 'main_site_id' && (!/^[1-9]\d*$/.test(value) || !database.prepare('SELECT 1 FROM sites WHERE id = ?').get(Number(value)))) {
      throw new Error('Seleziona una sede principale valida.');
    }
    const setupKeys = ['shop_name', 'shop_address', 'shop_phone', 'shop_email', 'shop_tax_id'];
    const firstSetup = !authenticatedSessions.has(event.sender.id)
      && (database.prepare('SELECT COUNT(*) AS count FROM employees').get() as { count: number }).count === 0
      && setupKeys.includes(key);
    const session = firstSetup ? undefined : requireSession(event.sender.id);
    if (!firstSetup && normalizedEmployeeRole(session?.role ?? '') !== 'proprietario') throw new Error('Solo il Proprietario può modificare questa impostazione.');
    if (key === 'home_image') {
      const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/i.exec(value);
      if (!match || Buffer.from(match[2], 'base64').length > 5 * 1024 * 1024) throw new Error('Immagine homepage non valida o superiore a 5 MB.');
      setSetting('home_image', value);
      setSetting('home_video', '');
      return;
    }
    if (key === 'home_video') {
      const match = /^data:video\/(mp4|webm);base64,([A-Za-z0-9+/]+={0,2})$/i.exec(value);
      if (!match) throw new Error('Video homepage non valido.');
      const contents = Buffer.from(match[2], 'base64');
      if (contents.length > 50 * 1024 * 1024) throw new Error('Il video homepage deve essere inferiore a 50 MB.');
      const extension = match[1].toLowerCase();
      const videoFolder = join(app.getPath('userData'), 'Homepage');
      mkdirSync(videoFolder, { recursive: true });
      const videoPath = join(videoFolder, `homepage-${randomUUID()}.${extension}`);
      writeFileSync(videoPath, contents);
      setSetting('home_video', videoPath);
      setSetting('home_image', '');
      return;
    }
    setSetting(key, value);
  });
  ipcMain.handle('devices:printers', async (event) => {
    requireSession(event.sender.id);
    return (await mainWindow.webContents.getPrintersAsync()).map(({ name, displayName }) => ({ name, displayName }));
  });
  ipcMain.handle('receipt:print', async (event, target: 'regular' | 'thermal' = 'regular') => {
    requireSession(event.sender.id);
    if (!['regular', 'thermal'].includes(target)) throw new Error('Destinazione di stampa non valida.');
    const printer = target === 'thermal' ? setting('receipt_printer_thermal') : setting('receipt_printer');
    if (!printer) throw new Error('Seleziona una stampante per gli scontrini nelle impostazioni Dispositivi.');
    await new Promise<void>((resolve, reject) => {
      mainWindow.webContents.print({ silent: true, deviceName: printer, printBackground: true, copies: 1 }, (success, failureReason) => {
        if (success) resolve();
        else reject(new Error(failureReason || 'Stampa dello scontrino non riuscita.'));
      });
    });
  });
  ipcMain.handle('payroll:save-receipts', async (event, input: { folderName: string; files: Array<{ name: string; data: string }> }) => {
    requireSession(event.sender.id, ['proprietario', 'contabilita']);
    if (!input || typeof input.folderName !== 'string' || basename(input.folderName) !== input.folderName
      || !/^[\w -]{1,80}$/.test(input.folderName) || !Array.isArray(input.files)
      || input.files.length < 1 || input.files.length > 500) throw new Error('Dati delle ricevute non validi.');
    const folderPath = join(app.getPath('downloads'), input.folderName);
    mkdirSync(folderPath, { recursive: true });
    for (const file of input.files) {
      if (!file || typeof file.name !== 'string' || basename(file.name) !== file.name
        || !/^[\w \u0600-\u06FF.-]{1,160}\.pdf$/i.test(file.name)
        || typeof file.data !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(file.data)) {
        throw new Error('Nome o contenuto di una ricevuta non valido.');
      }
      const contents = Buffer.from(file.data, 'base64');
      if (contents.length > 10 * 1024 * 1024 || contents.subarray(0, 5).toString() !== '%PDF-') {
        throw new Error('Una ricevuta non è un PDF valido o supera 10 MB.');
      }
      writeFileSync(join(folderPath, file.name), contents);
    }
    const openError = await shell.openPath(folderPath);
    if (openError) throw new Error(`Le ricevute sono state salvate, ma non è possibile aprire la cartella: ${openError}`);
    return folderPath;
  });
  const chooseImage = async (settingKey: 'shop_logo' | 'home_image', title: string, apply = true) => {
    const result = await dialog.showOpenDialog(mainWindow, { title, properties: ['openFile'], filters: [{ name: 'Immagini', extensions: ['png', 'jpg', 'jpeg', 'webp'] }] });
    if (result.canceled || !result.filePaths[0]) return null;
    const filePath = result.filePaths[0];
    const image = readFileSync(filePath);
    if (image.length > 5 * 1024 * 1024) throw new Error('L’immagine selezionata deve essere inferiore a 5 MB.');
    const extension = filePath.split('.').pop()?.toLowerCase();
    const mimeType = extension === 'png' ? 'image/png' : extension === 'webp' ? 'image/webp' : 'image/jpeg';
    const imageData = `data:${mimeType};base64,${image.toString('base64')}`;
    if (apply) {
      setSetting(settingKey, imageData);
      if (settingKey === 'home_image') setSetting('home_video', '');
    }
    return imageData;
  };
  ipcMain.handle('settings:choose-shop-logo', (event) => {
    const firstSetup = !authenticatedSessions.has(event.sender.id)
      && (database.prepare('SELECT COUNT(*) AS count FROM employees').get() as { count: number }).count === 0;
    if (!firstSetup) requireSession(event.sender.id, ['proprietario']);
    return chooseImage('shop_logo', 'Scegli il logo del negozio');
  });
  ipcMain.handle('settings:choose-homepage-image', (event) => { requireSession(event.sender.id, ['proprietario']); return chooseImage('home_image', 'Scegli l’immagine homepage', false); });
  ipcMain.handle('settings:choose-homepage-video', async (event) => {
    requireSession(event.sender.id, ['proprietario']);
    const result = await dialog.showOpenDialog(mainWindow, { title: 'Scegli il video homepage', properties: ['openFile'], filters: [{ name: 'Video', extensions: ['mp4', 'webm'] }] });
    if (result.canceled || !result.filePaths[0]) return null;
    const sourcePath = result.filePaths[0];
    const contents = readFileSync(sourcePath);
    if (contents.length > 50 * 1024 * 1024) throw new Error('Il video homepage deve essere inferiore a 50 MB.');
    const extension = sourcePath.toLowerCase().endsWith('.webm') ? 'webm' : 'mp4';
    return `data:video/${extension};base64,${contents.toString('base64')}`;
  });
  ipcMain.handle('archive:choose-folder', async (event) => {
    requireSession(event.sender.id, ['proprietario']);
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
    const previousFolder = setting('archive_folder', join(app.getPath('documents'), 'Gestionale-Archivio'));
    const previousCredentials = join(previousFolder, 'Accesso iniziale', 'Credenziali proprietario.txt');
    const nextCredentials = join(result.filePaths[0], 'Accesso iniziale', 'Credenziali proprietario.txt');
    if (previousCredentials !== nextCredentials && existsSync(previousCredentials) && !existsSync(nextCredentials)) {
      mkdirSync(dirname(nextCredentials), { recursive: true });
      copyFileSync(previousCredentials, nextCredentials);
    }
    setSetting('archive_folder', result.filePaths[0]);
    return result.filePaths[0];
  });
  ipcMain.handle('share:save-pdf', async (event, input: { fileName: string; pdfBase64: string }) => {
    requireSession(event.sender.id);
    if (!input || typeof input.fileName !== 'string'
      || !input.fileName.toLowerCase().endsWith('.pdf')
      || /[\\/:*?"<>|\u0000-\u001f]/.test(input.fileName)
      || input.fileName.length > 150
      || typeof input.pdfBase64 !== 'string'
      || input.pdfBase64.length === 0
      || input.pdfBase64.length > 28_000_000
      || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(input.pdfBase64)) {
      throw new Error('Il file PDF da condividere non è valido.');
    }
    const contents = Buffer.from(input.pdfBase64, 'base64');
    if (contents.length > 20 * 1024 * 1024 || !contents.subarray(0, 5).equals(Buffer.from('%PDF-'))) {
      throw new Error('Il file PDF da condividere non è valido o supera 20 MB.');
    }
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Salva PDF da condividere',
      defaultPath: join(app.getPath('downloads'), input.fileName),
      filters: [{ name: 'Documento PDF', extensions: ['pdf'] }],
    });
    if (result.canceled || !result.filePath) return null;
    writeFileSync(result.filePath, contents);
    shell.showItemInFolder(result.filePath);
    return result.filePath;
  });
  createWindow();
  salesRetentionInterval = setInterval(() => {
    try {
      if (removeExpiredRecords() > 0 && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('sales:expired');
      }
    } catch (error) {
      console.error('Pulizia periodica degli scontrini non riuscita:', error);
    }
  }, 60_000);
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
app.on('before-quit', () => {
  if (salesRetentionInterval) clearInterval(salesRetentionInterval);
  database?.close();
});