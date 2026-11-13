import type {
  ApplicationCommand,
  AppDataBackup,
  AppState,
  AuthenticatedEmployee,
  CheckoutInput,
  CustomerInput,
  EmployeeInput,
  Expense,
  PayrollPaymentInput,
  ProductInput,
  PromotionInput,
  Sale,
  SaleItem,
  SiteInput,
  Supplier,
  SupplierInput,
  SupplierOrder,
  SupplierOrderInput,
  VoucherBatchInput,
} from '../shared/types';

const storageKey = 'gestionale-web-preview';
const demoOwnerBarcode = '0000000001';
const siteRecognitionAlphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
const now = new Date();
const day = (offset: number) => {
  const date = new Date(now);
  date.setDate(date.getDate() + offset);
  return date.toISOString();
};
const localDay = (offset: number) => day(offset).slice(0, 10);

function uniqueSiteRecognitionCode(reservedCodes: Set<string>): string {
  let code = '';
  do {
    const values = new Uint32Array(15);
    window.crypto.getRandomValues(values);
    code = Array.from(values, (value) => siteRecognitionAlphabet[value % siteRecognitionAlphabet.length]).join('');
  } while (reservedCodes.has(code));
  reservedCodes.add(code);
  return code;
}

function migrateDemoSiteRecognitionCodes(state: AppState): boolean {
  const reservedCodes = new Set<string>();
  let changed = false;
  for (const site of state.sites) {
    if (!site.site_role?.trim() || site.site_role === 'Responsabile sede') {
      site.site_role = 'Punto vendita';
      changed = true;
    }
    if (/^[a-z0-9]{15}$/.test(site.recognition_code) && !reservedCodes.has(site.recognition_code)) {
      reservedCodes.add(site.recognition_code);
      continue;
    }
    site.recognition_code = uniqueSiteRecognitionCode(reservedCodes);
    changed = true;
  }
  return changed;
}

function createDemoState(): AppState {
  const sites: AppState['sites'] = [
    { id: 1, name: 'Centro', site_role: 'Punto vendita', address: 'Via Roma 12', phone: '02 555 0101', email: 'centro@example.test', tax_id: '', manager_name: 'Giulia Bianchi', opening_hours: 'Lun-Sab 08:00-20:00', notes: '', site_type: 'store', recognition_code: 'centro000000000', created_at: day(-120) },
    { id: 2, name: 'Nord', site_role: 'Punto vendita', address: 'Via Milano 48', phone: '02 555 0102', email: 'nord@example.test', tax_id: '', manager_name: 'Marco Verdi', opening_hours: 'Lun-Sab 08:00-20:00', notes: '', site_type: 'store', recognition_code: 'nord00000000000', created_at: day(-90) },
    { id: 3, name: 'Magazzino', site_role: 'Magazzino', address: 'Via Industria 5', phone: '02 555 0103', email: '', tax_id: '', manager_name: '', opening_hours: '', notes: '', site_type: 'store', recognition_code: 'magaz0000000000', created_at: day(-75) },
  ];
  const products: AppState['products'] = [
    { id: 1, code: '800123450001', name: 'Pasta di semola', unit: 'PEZZO', category: 'Dispensa', sale_price: 1.49, purchase_price: 0.72, stock: 132, low_stock_threshold: 24 },
    { id: 2, code: '800123450002', name: 'Olio extravergine', unit: 'PEZZO', category: 'Dispensa', sale_price: 7.9, purchase_price: 5.2, stock: 38, low_stock_threshold: 12 },
    { id: 3, code: '800123450003', name: 'Mele Golden', unit: 'KG', category: 'Frutta e verdura', sale_price: 2.4, purchase_price: 1.15, stock: 46.5, low_stock_threshold: 10 },
    { id: 4, code: '800123450004', name: 'Latte intero', unit: 'LITRO', category: 'Latticini', sale_price: 1.65, purchase_price: 0.92, stock: 53, low_stock_threshold: 15 },
    { id: 5, code: '800123450005', name: 'Caffè macinato', unit: 'PEZZO', category: 'Dispensa', sale_price: 4.8, purchase_price: 3.1, stock: 8, low_stock_threshold: 10 },
    { id: 6, code: '800123450006', name: 'Detersivo piatti', unit: 'PEZZO', category: 'Casa', sale_price: 2.2, purchase_price: 1.05, stock: 0, low_stock_threshold: 8 },
  ];
  const employees: AppState['employees'] = [
    {
      id: 1, first_name: 'Alessandro', last_name: 'Rossi', age: 42, gender: 'Maschio', home_address: 'Via Verdi 8',
      email: 'alessandro.rossi@example.test', phone: '333 000 1001', operational_site: 'Centro', role: 'Proprietario',
      shift: 'Mattina', salary: 0, payment_method: 'Bonifico', iban: '', recognition_code: demoOwnerBarcode,
      barcode: demoOwnerBarcode, photo_data: '', documents_data: '', contract_pdf_data: '',
      contract_start_date: '', contract_end_date: '', created_at: day(-150),
    },
    {
      id: 2, first_name: 'Giulia', last_name: 'Bianchi', age: 31, gender: 'Femmina', home_address: 'Via Dante 21',
      email: 'giulia.bianchi@example.test', phone: '333 000 1002', operational_site: 'Centro', role: 'Direttore',
      shift: 'Mattina', salary: 1850, payment_method: 'Bonifico', iban: 'IT00DEMO0000000000000000000',
      recognition_code: '0000000002', barcode: '0000000002', photo_data: '', documents_data: '', contract_pdf_data: '',
      contract_start_date: '', contract_end_date: '', created_at: day(-110),
    },
    {
      id: 3, first_name: 'Marco', last_name: 'Verdi', age: 27, gender: 'Maschio', home_address: 'Via Po 16',
      email: 'marco.verdi@example.test', phone: '333 000 1003', operational_site: 'Nord', role: 'Cassiere',
      shift: 'Pomeriggio', salary: 1450, payment_method: 'Contanti', iban: '',
      recognition_code: '0000000003', barcode: '0000000003', photo_data: '', documents_data: '', contract_pdf_data: '',
      contract_start_date: '', contract_end_date: '', created_at: day(-80),
    },
  ];
  const productStocks = [
    [1, [52, 40, 40]], [2, [15, 11, 12]], [3, [20.5, 14, 12]], [4, [21, 17, 15]], [5, [3, 2, 3]], [6, [0, 0, 0]],
  ] as const;
  const siteStocks: AppState['siteStocks'] = productStocks.flatMap(([productId, quantities]) =>
    sites.map((site, index) => ({ product_id: productId, site_id: site.id, site_name: site.name, stock: quantities[index] })),
  );
  const itemsFor = (ids: number[], quantities: number[]): SaleItem[] => ids.map((id, index) => {
    const product = products.find((item) => item.id === id)!;
    return {
      product_id: product.id, name: product.name, code: product.code, unit: product.unit,
      quantity: quantities[index], unit_price: product.sale_price, purchase_price: product.purchase_price,
    };
  });
  const sales: AppState['sales'] = [
    { id: 1, receipt_no: '3314898', created_at: day(0), person: 'Giulia Bianchi', site: 'Centro', payment_method: 'Carta', discount: 0, gross_total: 16.28, total: 16.28, item_count: 4, items: itemsFor([1, 2, 3], [2, 1, 1]) },
    { id: 2, receipt_no: '3314897', created_at: day(-1), person: 'Marco Verdi', site: 'Nord', payment_method: 'Contanti', discount: 0.48, gross_total: 10.77, total: 10.29, item_count: 3, items: itemsFor([1, 4], [3, 2]) },
    { id: 3, receipt_no: '3314896', created_at: day(-2), person: 'Giulia Bianchi', site: 'Centro', payment_method: 'Carta', discount: 0, gross_total: 19.9, total: 19.9, item_count: 4, items: itemsFor([2, 3, 4], [1, 2, 2]) },
    { id: 4, receipt_no: '3314895', created_at: day(-3), person: 'Marco Verdi', site: 'Nord', payment_method: 'Contanti', discount: 0, gross_total: 9.18, total: 9.18, item_count: 5, items: itemsFor([1, 4, 5], [2, 2, 1]) },
  ];
  return {
    products, sales, employees, sites, siteStocks,
    promotions: [{
      id: 1, name: 'Sconto dispensa', discount_type: 'percentage', percentage: 10, buy_quantity: 2,
      free_quantity: 1, category: 'Dispensa', starts_at: localDay(-5), ends_at: localDay(7),
      minimum_spend: 10, minimum_kilograms: 0, minimum_pieces: 0, minimum_liters: 0, application_mode: 'Automatica',
    }],
    voucherBatches: [{ id: 1, discount_percentage: 10, starts_at: localDay(-5), ends_at: localDay(30), created_at: day(-5), codes: ['DEMO3314898', 'DEMO3314899'] }],
    employeeActivities: [
      { id: 1, employee_id: 2, employee_name: 'Giulia Bianchi', section: 'Cassa', action: 'Vendita completata', detail: 'Scontrino 3314898', created_at: day(0) },
      { id: 2, employee_id: 3, employee_name: 'Marco Verdi', section: 'Magazzino', action: 'Carico merce', detail: 'Pasta di semola · 20', created_at: day(-1) },
    ],
    payrollPayments: [
      { id: 1, employee_id: 2, pay_month: localDay(-30).slice(0, 7), amount: 1850, payment_date: localDay(-20), payment_method: 'Bonifico', first_name: 'Giulia', last_name: 'Bianchi', site: 'Centro' },
    ],
    refunds: [{ id: 1, sale_id: 2, receipt_no: '3314897', amount: 1.65, created_at: day(-1), site: 'Nord' }],
    settings: {
      shop_name: 'Mercato Verde', shop_number: '001', shop_logo: '', home_image: '', home_video: '',
      shop_address: 'Via Roma 12, Milano', shop_phone: '02 555 0101', shop_email: 'info@example.test',
      shop_tax_id: 'IT00000000000', currency: 'EUR', setup_complete: true,
      main_site_id: '1',
      role_permissions: '{}',
      auth_trial_expires_at: day(365), archive_folder: '', database_file: 'Demo locale (nessun database)',
      receipt_printer: '', receipt_printer_thermal: '', barcode_scanner_enabled: false, barcode_scanner_detected: false,
    },
    stockMovements: [
      { id: 1, product_id: 1, product_name: 'Pasta di semola', movement_type: 'Carico', quantity: 36, created_at: day(-2), person: 'Giulia Bianchi', site: 'Centro', destination: '', note: 'Rifornimento settimanale' },
      { id: 2, product_id: 4, product_name: 'Latte intero', movement_type: 'Scarico', quantity: 4, created_at: day(-1), person: 'Marco Verdi', site: 'Nord', destination: '', note: 'Prodotto danneggiato' },
    ],
    stockDistributions: [],
    expenses: [
      { id: 1, description: 'Utenze punto vendita', category: 'Utenze', amount: 420, expense_date: localDay(-5), created_at: day(-5), site: 'Centro', receipt_data: '' },
      { id: 2, description: 'Materiale reparto', category: 'Materiali', amount: 145, expense_date: localDay(-3), created_at: day(-3), site: 'Nord', receipt_data: '' },
    ],
    customers: [{ id: 1, first_name: 'Sara', last_name: 'Moretti', phone: '333 000 2001', email: 'sara@example.test', address: 'Via Manzoni 9', created_at: day(-20) }],
    loyaltyCards: [{ id: 1, code: 'DEMO0001', barcode: 'DEMO0001', discount_percentage: 5, customer_id: 1, customer_name: 'Sara Moretti', status: 'Attiva', points: 120, created_at: day(-15), activated_at: day(-14) }],
    suppliers: [],
    supplierOrders: [],
  };
}

const previewStateCollections = [
  'products', 'sales', 'promotions', 'voucherBatches', 'employees', 'employeeActivities',
  'payrollPayments', 'refunds', 'stockMovements', 'stockDistributions',
  'expenses', 'sites', 'customers', 'loyaltyCards', 'suppliers', 'supplierOrders',
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function isPreviewState(value: unknown): value is AppState {
  if (!isRecord(value) || !isRecord(value.settings) || !Array.isArray(value.siteStocks)
    || value.siteStocks.length > 250_000 || !value.siteStocks.every((item) => isRecord(item)
      && Number.isInteger(item.product_id) && Number.isInteger(item.site_id)
      && typeof item.site_name === 'string' && Number.isFinite(item.stock))) return false;
  const settings = value.settings;
  const stringSettings = [
    'shop_name', 'shop_number', 'shop_address', 'shop_phone', 'shop_email', 'shop_tax_id',
    'currency', 'main_site_id', 'role_permissions', 'auth_trial_expires_at', 'archive_folder',
    'database_file', 'receipt_printer', 'receipt_printer_thermal',
  ];
  if (stringSettings.some((key) => typeof settings[key] !== 'string')
    || typeof settings.setup_complete !== 'boolean'
    || typeof settings.barcode_scanner_enabled !== 'boolean'
    || typeof settings.barcode_scanner_detected !== 'boolean'
    || ['shop_logo', 'home_image', 'home_video'].some((key) => settings[key] !== undefined && typeof settings[key] !== 'string')) return false;
  if (!previewStateCollections.every((key) => Array.isArray(value[key])
    && (value[key] as unknown[]).length <= 250_000
    && (value[key] as unknown[]).every((item) => isRecord(item) && Number.isInteger(item.id) && Number(item.id) > 0))) return false;
  const rows = (key: typeof previewStateCollections[number]) => value[key] as Array<Record<string, unknown>>;
  return rows('products').every((item) => typeof item.code === 'string')
    && rows('sites').every((item) => typeof item.name === 'string')
    && rows('employees').every((item) => ['barcode', 'recognition_code', 'email'].every((key) => typeof item[key] === 'string'))
    && rows('suppliers').every((item) => typeof item.name === 'string')
    && rows('customers').every((item) => ['email', 'phone', 'first_name', 'last_name', 'address'].every((key) => typeof item[key] === 'string'))
    && rows('sales').every((item) => typeof item.receipt_no === 'string' && Array.isArray(item.items)
      && item.items.every((saleItem) => isRecord(saleItem) && Number.isInteger(saleItem.product_id)))
    && rows('stockMovements').every((item) => Number.isInteger(item.product_id))
    && rows('employeeActivities').every((item) => Number.isInteger(item.employee_id))
    && rows('refunds').every((item) => Number.isInteger(item.sale_id))
    && rows('payrollPayments').every((item) => Number.isInteger(item.employee_id) && typeof item.pay_month === 'string')
    && rows('loyaltyCards').every((item) => typeof item.code === 'string')
    && rows('supplierOrders').every((item) => Number.isInteger(item.supplier_id) && Array.isArray(item.items)
      && item.items.every((orderItem) => isRecord(orderItem) && Number.isInteger(orderItem.product_id)));
}

function stableRecord(value: object): string {
  const entries = Object.entries(value)
    .filter(([key]) => key !== 'id')
    .sort(([left], [right]) => left.localeCompare(right));
  return JSON.stringify(entries.map(([key, item]) => [
    key,
    isRecord(item) ? stableRecord(item) : Array.isArray(item) ? item.map((nested) => isRecord(nested) ? stableRecord(nested) : nested) : item,
  ]));
}

function mergePreviewRows<T extends { id: number }>(
  current: T[],
  imported: T[],
  identity: (item: T) => string = (item) => stableRecord(item),
): { idMap: Map<number, number>; added: number; skipped: number } {
  const idMap = new Map<number, number>();
  let added = 0;
  let skipped = 0;
  for (const source of imported) {
    const key = identity(source);
    const duplicate = current.find((item) => identity(item) === key);
    if (duplicate) {
      idMap.set(source.id, duplicate.id);
      skipped += 1;
      continue;
    }
    let id = source.id;
    if (current.some((item) => item.id === id)) id = current.reduce((max, item) => Math.max(max, item.id), 0) + 1;
    current.push({ ...structuredClone(source), id });
    idMap.set(source.id, id);
    added += 1;
  }
  return { idMap, added, skipped };
}

function mergePreviewState(target: AppState, source: AppState): { added: number; skipped: number } {
  let added = 0;
  let skipped = 0;
  const merge = <T extends { id: number }>(
    targetRows: T[],
    rows: T[],
    identity?: (item: T) => string,
  ): Map<number, number> => {
    const result = mergePreviewRows(targetRows, rows, identity);
    added += result.added;
    skipped += result.skipped;
    return result.idMap;
  };
  const siteIds = merge(target.sites, source.sites, (site) => `name:${site.name.trim().toLocaleLowerCase('it')}`);
  const productIds = merge(target.products, source.products, (product) => `code:${product.code.trim()}`);
  const employeeIds = merge(target.employees, source.employees, (employee) => {
    const key = employee.barcode || employee.recognition_code || employee.email;
    return key ? `employee:${key}` : stableRecord(employee);
  });
  const supplierIds = merge(target.suppliers, source.suppliers, (supplier) => `supplier:${supplier.name.trim().toLocaleLowerCase('it')}`);
  const customerIds = merge(target.customers, source.customers, (customer) => {
    const key = customer.email.trim().toLocaleLowerCase('it') || customer.phone.trim();
    return key ? `customer:${key}` : stableRecord(customer);
  });
  const sales = source.sales.map((sale) => ({
    ...sale,
    items: sale.items.map((item) => ({ ...item, product_id: productIds.get(item.product_id) ?? item.product_id })),
  }));
  const saleIds = merge(target.sales, sales, (sale) => `receipt:${sale.receipt_no}`);
  merge(target.promotions, source.promotions);
  merge(target.voucherBatches, source.voucherBatches, (batch) =>
    `vouchers:${batch.discount_percentage}:${batch.starts_at}:${batch.ends_at}:${[...batch.codes].sort().join(',')}`);
  merge(target.stockMovements, source.stockMovements.map((movement) => ({
    ...movement, product_id: productIds.get(movement.product_id) ?? movement.product_id,
  })));
  merge(target.stockDistributions, source.stockDistributions);
  merge(target.employeeActivities, source.employeeActivities.map((activity) => ({
    ...activity, employee_id: employeeIds.get(activity.employee_id) ?? activity.employee_id,
  })));
  merge(target.expenses, source.expenses);
  merge(target.refunds, source.refunds.map((refund) => ({
    ...refund, sale_id: saleIds.get(refund.sale_id) ?? refund.sale_id,
  })));
  merge(target.payrollPayments, source.payrollPayments.map((payment) => ({
    ...payment, employee_id: employeeIds.get(payment.employee_id) ?? payment.employee_id,
  })), (payment) => `payroll:${payment.employee_id}:${payment.pay_month}`);
  merge(target.loyaltyCards, source.loyaltyCards.map((card) => ({
    ...card, customer_id: card.customer_id === null ? null : customerIds.get(card.customer_id) ?? card.customer_id,
  })), (card) => `loyalty:${card.code}`);
  const inventoryKeys = new Set(target.siteStocks.map((stock) => `${stock.product_id}:${stock.site_id}`));
  for (const stock of source.siteStocks) {
    const productId = productIds.get(stock.product_id) ?? stock.product_id;
    const siteId = siteIds.get(stock.site_id) ?? stock.site_id;
    const key = `${productId}:${siteId}`;
    if (inventoryKeys.has(key)) {
      skipped += 1;
      continue;
    }
    const site = target.sites.find((item) => item.id === siteId);
    target.siteStocks.push({ ...stock, product_id: productId, site_id: siteId, site_name: site?.name ?? stock.site_name });
    inventoryKeys.add(key);
    added += 1;
  }
  const importedOrders = source.supplierOrders.map((order) => {
    const supplierId = supplierIds.get(order.supplier_id) ?? order.supplier_id;
    const siteId = order.site_id === null ? null : siteIds.get(order.site_id) ?? order.site_id;
    return {
      ...order,
      supplier_id: supplierId,
      site_id: siteId,
      supplier_name: target.suppliers.find((supplier) => supplier.id === supplierId)?.name ?? order.supplier_name,
      site_name: siteId === null ? null : target.sites.find((site) => site.id === siteId)?.name ?? order.site_name,
      items: order.items.map((item) => ({
        ...item,
        product_id: productIds.get(item.product_id) ?? item.product_id,
      })),
    };
  });
  const orderResult = mergePreviewRows(
    target.supplierOrders,
    importedOrders,
    (order) => `order:${order.supplier_id}:${order.site_id}:${order.created_at}:${order.items.map((item) => `${item.product_id}:${item.quantity}:${item.unit_cost}`).join('|')}`,
  );
  added += orderResult.added;
  skipped += orderResult.skipped;
  if (source.settings.shop_name) target.settings.shop_name = source.settings.shop_name;
  target.settings.shop_number = source.settings.shop_number;
  target.settings.shop_logo = source.settings.shop_logo;
  target.settings.home_image = source.settings.home_image;
  target.settings.home_video = source.settings.home_video;
  target.settings.shop_address = source.settings.shop_address;
  target.settings.shop_phone = source.settings.shop_phone;
  target.settings.shop_email = source.settings.shop_email;
  target.settings.shop_tax_id = source.settings.shop_tax_id;
  target.settings.currency = source.settings.currency;
  target.settings.role_permissions = source.settings.role_permissions;
  const importedMainSiteId = Number(source.settings.main_site_id);
  if (Number.isInteger(importedMainSiteId)) {
    const mainSiteId = siteIds.get(importedMainSiteId) ?? importedMainSiteId;
    if (target.sites.some((site) => site.id === mainSiteId)) target.settings.main_site_id = String(mainSiteId);
  }
  for (const product of target.products) {
    const stocks = target.siteStocks.filter((stock) => stock.product_id === product.id);
    if (stocks.length) product.stock = stocks.reduce((sum, stock) => sum + stock.stock, 0);
  }
  return { added, skipped };
}

function installWebPreview(): void {
  if (window.gestionale) return;

  const storedState = window.localStorage.getItem(storageKey);
  let state = storedState ? JSON.parse(storedState) as AppState : createDemoState();
  const persist = () => window.localStorage.setItem(storageKey, JSON.stringify(state));
  let migrationChanged = migrateDemoSiteRecognitionCodes(state);
  if (!Array.isArray(state.suppliers)) {
    state.suppliers = [];
    migrationChanged = true;
  }
  if (!Array.isArray(state.supplierOrders)) {
    state.supplierOrders = [];
    migrationChanged = true;
  }
  for (const order of state.supplierOrders) {
    for (const item of order.items) {
      if (!Number.isSafeInteger(item.id)) {
        item.id = item.product_id;
        migrationChanged = true;
      }
      if (typeof item.received_at !== 'string' && item.received_at !== null) {
        item.received_at = order.received_at ?? null;
        migrationChanged = true;
      }
    }
  }
  if (!state.settings.main_site_id || !state.sites.some((site) => String(site.id) === state.settings.main_site_id)) {
    state.settings.main_site_id = String([...state.sites].sort((a, b) => a.id - b.id)[0]?.id ?? '');
    persist();
  } else if (migrationChanged) persist();
  const nextId = (values: Array<{ id: number }>) => Math.max(0, ...values.map(({ id }) => id)) + 1;
  const mainStockSite = () => state.sites.find((site) => String(site.id) === state.settings.main_site_id)
    ?? [...state.sites].sort((a, b) => a.id - b.id)[0];
  const employeeByBarcode = (barcode: string) => state.employees.find((employee) =>
    employee.barcode === barcode.trim() || employee.recognition_code === barcode.trim());
  let activeEmployeeBarcode = '';
  const stockAtSite = (productId: number, siteId: number) =>
    state.siteStocks.find((stock) => stock.product_id === productId && stock.site_id === siteId);
  const refreshProductStock = (productId: number) => {
    const product = state.products.find((item) => item.id === productId);
    if (product) product.stock = state.siteStocks.filter((stock) => stock.product_id === productId).reduce((sum, stock) => sum + stock.stock, 0);
  };
  const saveSupplierOrder = async (input: SupplierOrderInput): Promise<void> => {
    const supplier = state.suppliers.find((item) => item.id === input.supplier_id);
    const site = state.sites.find((item) => item.id === input.site_id);
    if (!supplier || !Array.isArray(input.items) || input.items.length < 1 || input.items.length > 100
      || !site || typeof input.notes !== 'string' || input.notes.length > 1000) throw new Error('Dati dell’ordine non validi.');
    const items: SupplierOrder['items'] = input.items.map((item) => {
      const product = state.products.find((candidate) => candidate.id === item.product_id);
      if (!product || !Number.isFinite(item.quantity) || item.quantity <= 0 || item.quantity > 1_000_000
        || !Number.isFinite(item.unit_cost) || item.unit_cost < 0 || item.unit_cost > 1_000_000) {
        throw new Error('Articolo, quantità o costo dell’ordine non validi.');
      }
      return { id: product.id, product_id: product.id, product_name: product.name, product_code: product.code, unit: product.unit ?? 'PEZZO', quantity: item.quantity, unit_cost: item.unit_cost, received_at: null };
    });
    const createdAt = new Date().toISOString();
    if (input.employee_barcode.trim() !== activeEmployeeBarcode || !employeeByBarcode(input.employee_barcode)) {
      throw new Error('Il barcode non corrisponde al dipendente autenticato.');
    }
    if (input.received) items.forEach((item) => { item.received_at = createdAt; });
    const order: SupplierOrder = { id: nextId(state.supplierOrders), supplier_id: supplier.id, supplier_name: supplier.name, site_id: site.id, site_name: site.name, created_at: createdAt, expected_arrival_date: input.expected_arrival_date, received_at: input.received ? createdAt : null, notes: input.notes.trim(), items };
    if (input.received) {
      for (const item of items) {
        const stock = stockAtSite(item.product_id, site.id);
        if (stock) stock.stock += item.quantity;
        else state.siteStocks.push({ product_id: item.product_id, site_id: site.id, site_name: site.name, stock: item.quantity });
        refreshProductStock(item.product_id);
      }
    }
    state.supplierOrders.unshift(order);
    persist();
  };
  const receiveSupplierOrder = async (orderId: number, itemId: number | null, employeeBarcode: string): Promise<void> => {
    const employee = employeeByBarcode(employeeBarcode);
    const order = state.supplierOrders.find((item) => item.id === orderId);
    if (!employee || employee.barcode !== activeEmployeeBarcode || employeeBarcode.trim() !== activeEmployeeBarcode
      || !order || !order.site_id || order.received_at) throw new Error('Verifica barcode e ordine da ricevere.');
    const items = itemId === null ? order.items.filter((item) => !item.received_at) : order.items.filter((item) => item.id === itemId && !item.received_at);
    if (!items.length) throw new Error('Non ci sono articoli da ricevere.');
    for (const item of items) {
      const stock = stockAtSite(item.product_id, order.site_id);
      if (stock) stock.stock += item.quantity;
      else state.siteStocks.push({ product_id: item.product_id, site_id: order.site_id, site_name: order.site_name ?? '', stock: item.quantity });
      refreshProductStock(item.product_id);
      item.received_at = new Date().toISOString();
    }
    if (order.items.every((item) => item.received_at)) order.received_at = new Date().toISOString();
    persist();
  };
  const updateSupplierOrderItem = async (orderId: number, itemId: number, quantity: number, unitCost: number, employeeBarcode: string): Promise<void> => {
    const employee = employeeByBarcode(employeeBarcode);
    const order = state.supplierOrders.find((item) => item.id === orderId);
    const item = order?.items.find((candidate) => candidate.id === itemId);
    if (!employee || employee.barcode !== activeEmployeeBarcode || employeeBarcode.trim() !== activeEmployeeBarcode
      || !order || order.received_at || !item || item.received_at) throw new Error('Verifica barcode e articolo ancora da ricevere.');
    if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(unitCost) || unitCost < 0) throw new Error('Quantità o costo non validi.');
    item.quantity = quantity;
    item.unit_cost = unitCost;
    persist();
  };
  const deleteSupplierOrderItem = async (orderId: number, itemId: number, employeeBarcode: string): Promise<void> => {
    const employee = employeeByBarcode(employeeBarcode);
    const order = state.supplierOrders.find((item) => item.id === orderId);
    const item = order?.items.find((candidate) => candidate.id === itemId);
    if (!employee || employee.barcode !== activeEmployeeBarcode || employeeBarcode.trim() !== activeEmployeeBarcode
      || !order || order.received_at || !item || item.received_at) throw new Error('Verifica barcode e articolo ancora da ricevere.');
    order.items = order.items.filter((candidate) => candidate.id !== itemId);
    if (!order.items.length) state.supplierOrders = state.supplierOrders.filter((candidate) => candidate.id !== orderId);
    persist();
  };
  const api: Window['gestionale'] = {
    isDemo: true,
    getState: async () => structuredClone(state),
    onSalesExpired: () => () => undefined,
    verifyEmployeeBarcode: async (barcode) => Boolean(employeeByBarcode(barcode)),
    authorizeTracker: async (barcode) => ['proprietario', 'direttore'].includes((employeeByBarcode(barcode)?.role ?? '').toLocaleLowerCase('it')),
    loginEmployee: async (barcode): Promise<AuthenticatedEmployee | null> => {
      const employee = employeeByBarcode(barcode);
      activeEmployeeBarcode = employee?.barcode ?? '';
      return employee ? { id: employee.id, first_name: employee.first_name, last_name: employee.last_name, role: employee.role, barcode: employee.barcode } : null;
    },
    logout: async () => { activeEmployeeBarcode = ''; },
    saveProduct: async (input: ProductInput, selectedSiteId?: number) => {
      const product = state.products.find((item) => item.code === input.code.trim());
      const site = selectedSiteId === undefined
        ? mainStockSite()
        : state.sites.find((item) => item.id === selectedSiteId);
      if (!site) throw new Error('Aggiungi prima una sede alla demo.');
      const otherSiteStock = product
        ? state.siteStocks.filter((item) => item.product_id === product.id && item.site_id !== site.id).reduce((sum, item) => sum + item.stock, 0)
        : 0;
      if (input.stock < otherSiteStock) throw new Error('La giacenza totale non può essere inferiore alle quantità già assegnate alle altre sedi.');
      if (product) Object.assign(product, input);
      else state.products.push({ ...input, id: nextId(state.products), unit: input.unit ?? 'PEZZO' });
      const saved = state.products.find((item) => item.code === input.code.trim())!;
      const stock = stockAtSite(saved.id, site.id);
      if (stock) stock.stock = input.stock - otherSiteStock;
      else state.siteStocks.push({ product_id: saved.id, site_id: site.id, site_name: site.name, stock: input.stock - otherSiteStock });
      refreshProductStock(saved.id);
      persist();
    },
    updateStock: async (productId, stock) => {
      const site = mainStockSite();
      if (!site) return;
      const otherSiteStock = state.siteStocks.filter((item) => item.product_id === productId && item.site_id !== site.id).reduce((sum, item) => sum + item.stock, 0);
      if (stock < otherSiteStock) throw new Error('La giacenza totale non può essere inferiore alle quantità già assegnate alle altre sedi.');
      const existing = stockAtSite(productId, site.id);
      if (existing) existing.stock = stock - otherSiteStock;
      else state.siteStocks.push({ product_id: productId, site_id: site.id, site_name: site.name, stock: stock - otherSiteStock });
      refreshProductStock(productId);
      persist();
    },
    moveStock: async (movement) => {
      const employee = employeeByBarcode(movement.employee_barcode);
      const site = state.sites.find((item) => item.name === employee?.operational_site) ?? state.sites[0];
      if (!site) return;
      const stock = stockAtSite(movement.productId, site.id);
      const delta = movement.type === 'Carico' ? movement.quantity : -movement.quantity;
      if (stock) stock.stock = Math.max(0, stock.stock + delta);
      else state.siteStocks.push({ product_id: movement.productId, site_id: site.id, site_name: site.name, stock: Math.max(0, delta) });
      refreshProductStock(movement.productId);
      const product = state.products.find((item) => item.id === movement.productId);
      if (product) state.stockMovements.unshift({
        id: nextId(state.stockMovements), product_id: product.id, product_name: product.name,
        movement_type: movement.type, quantity: movement.quantity, created_at: new Date().toISOString(),
        person: employee ? `${employee.first_name} ${employee.last_name}` : '', site: site.name,
        destination: movement.destination ?? '', note: movement.note,
      });
      persist();
    },
    transferStock: async ({ fromSiteId, toSiteId, items }) => {
      for (const item of items) {
        const from = stockAtSite(item.productId, fromSiteId);
        const destination = stockAtSite(item.productId, toSiteId);
        if (from) from.stock = Math.max(0, from.stock - item.quantity);
        if (destination) destination.stock += item.quantity;
        else {
          const site = state.sites.find((candidate) => candidate.id === toSiteId);
          if (site) state.siteStocks.push({ product_id: item.productId, site_id: toSiteId, site_name: site.name, stock: item.quantity });
        }
        refreshProductStock(item.productId);
      }
      persist();
    },
    openDistributionRecord: async () => undefined,
    deleteDistribution: async (id, employeeBarcode) => {
      if (employeeBarcode.trim() !== activeEmployeeBarcode || !employeeByBarcode(employeeBarcode)) throw new Error('Il barcode non corrisponde al dipendente autenticato.');
      state.stockDistributions = state.stockDistributions.filter((record) => record.id !== id);
      persist();
    },
    exportAppData: async (): Promise<AppDataBackup> => ({
      format: 'gestionale-supermercato-data',
      version: 1,
      exportedAt: new Date().toISOString(),
      tables: {},
      previewState: structuredClone(state),
    }),
    importAppData: async (backup): Promise<{ added: number; skipped: number }> => {
      if (!backup || backup.format !== 'gestionale-supermercato-data' || backup.version !== 1
        || !isPreviewState(backup.previewState)) {
        throw new Error('Seleziona un archivio esportato dall’anteprima web. I file desktop non sono compatibili con i dati dimostrativi.');
      }
      const mergedState = structuredClone(state);
      const result = mergePreviewState(mergedState, backup.previewState);
      window.localStorage.setItem(storageKey, JSON.stringify(mergedState));
      state = mergedState;
      return result;
    },
    checkout: async (checkout: CheckoutInput) => {
      const owner = employeeByBarcode(checkout.employee_barcode ?? demoOwnerBarcode);
      const site = state.sites.find((item) => item.id === checkout.site_id)
        ?? state.sites.find((item) => item.name === owner?.operational_site)
        ?? state.sites.find((item) => item.site_type === 'store');
      if (!site) throw new Error('Aggiungi una sede prima di registrare una vendita.');
      const items = checkout.items.map((item) => ({ ...item }));
      const grossTotal = items.reduce((sum, item) => sum + item.quantity * item.unit_price, 0);
      const sale: Sale = {
        id: nextId(state.sales), receipt_no: String(Math.floor(1_000_000 + Math.random() * 9_000_000)),
        created_at: new Date().toISOString(), person: owner ? `${owner.first_name} ${owner.last_name}` : '',
        site: site.name, payment_method: checkout.payment_method, discount: 0, gross_total: grossTotal,
        total: grossTotal, item_count: items.reduce((sum, item) => sum + item.quantity, 0), items,
      };
      for (const item of items) {
        const stock = stockAtSite(item.product_id, site.id);
        if (stock) stock.stock = Math.max(0, stock.stock - item.quantity);
        refreshProductStock(item.product_id);
      }
      state.sales.unshift(sale);
      persist();
      return structuredClone(sale);
    },
    validateVoucher: async (code) => state.voucherBatches.some((batch) => batch.codes.includes(code.trim()))
      ? { valid: true, discount_percentage: 10 }
      : { valid: false, message: 'Codice demo non valido.' },
    savePromotion: async (promotion: PromotionInput) => {
      const existing = state.promotions.find((item) => item.id === promotion.id);
      if (existing) Object.assign(existing, promotion);
      else state.promotions.push({ ...promotion, id: nextId(state.promotions) });
      persist();
    },
    deletePromotion: async (id) => { state.promotions = state.promotions.filter((item) => item.id !== id); persist(); },
    saveVoucherBatch: async (batch: VoucherBatchInput) => {
      const saved = { ...batch, id: batch.id ?? nextId(state.voucherBatches), created_at: new Date().toISOString() };
      const index = state.voucherBatches.findIndex((item) => item.id === saved.id);
      if (index >= 0) state.voucherBatches[index] = saved;
      else state.voucherBatches.push(saved);
      persist();
    },
    deleteVoucherBatch: async (id) => { state.voucherBatches = state.voucherBatches.filter((item) => item.id !== id); persist(); },
    saveEmployee: async (input: EmployeeInput) => {
      const employee = { ...input, id: input.id ?? nextId(state.employees), created_at: new Date().toISOString() };
      const index = state.employees.findIndex((item) => item.id === employee.id);
      if (index >= 0) state.employees[index] = employee;
      else state.employees.push(employee);
      persist();
    },
    deleteEmployee: async (id) => { state.employees = state.employees.filter((item) => item.id !== id); persist(); },
    recordEmployeeActivity: async (activity) => {
      const employee = employeeByBarcode(activity.employee_barcode);
      state.employeeActivities.unshift({
        id: nextId(state.employeeActivities), employee_id: employee?.id ?? 0,
        employee_name: employee ? `${employee.first_name} ${employee.last_name}` : '',
        section: activity.section, action: activity.action, detail: activity.detail ?? '', created_at: new Date().toISOString(),
      });
      persist();
    },
    deleteProduct: async (id) => {
      state.products = state.products.filter((item) => item.id !== id);
      state.siteStocks = state.siteStocks.filter((item) => item.product_id !== id);
      persist();
    },
    disposeExpiredProduct: async (id) => {
      const product = state.products.find((item) => item.id === id);
      if (product) {
        for (const stock of state.siteStocks.filter((item) => item.product_id === id)) stock.stock = 0;
        product.stock = 0;
        persist();
      }
    },
    paySalary: async (input: PayrollPaymentInput) => api.paySelectedSalaries({ employee_ids: [input.employee_id], pay_month: input.pay_month, payment_date: input.payment_date }),
    payAllSalaries: async ({ pay_month, payment_date }) => api.paySelectedSalaries({
      employee_ids: state.employees.filter((employee) => employee.role.toLocaleLowerCase('it') !== 'proprietario').map((employee) => employee.id),
      pay_month, payment_date,
    }),
    paySelectedSalaries: async ({ employee_ids, pay_month, payment_date }) => {
      for (const id of employee_ids) {
        const employee = state.employees.find((item) => item.id === id);
        if (!employee || state.payrollPayments.some((payment) => payment.employee_id === id && payment.pay_month === pay_month)) continue;
        state.payrollPayments.push({
          id: nextId(state.payrollPayments), employee_id: id, pay_month, amount: employee.salary,
          payment_date, payment_method: employee.payment_method, first_name: employee.first_name,
          last_name: employee.last_name, site: employee.operational_site,
        });
      }
      persist();
    },
    saveSetting: async (key, value) => {
      if (key === 'barcode_scanner_enabled' || key === 'barcode_scanner_detected') state.settings[key] = value === 'true';
      else if (key === 'main_site_id' && !state.sites.some((site) => String(site.id) === value)) throw new Error('Seleziona una sede principale valida.');
      else state.settings[key] = value;
      persist();
    },
    getPrinters: async () => [],
    printReceipt: async () => window.print(),
    savePayrollReceipts: async ({ folderName }) => `Download demo: ${folderName}`,
    authorizeSaleAction: async (barcode) => ['proprietario', 'direttore'].includes((employeeByBarcode(barcode)?.role ?? '').toLocaleLowerCase('it')),
    updateSale: async (sale) => {
      const existing = state.sales.find((item) => item.id === sale.id);
      if (existing) { existing.payment_method = sale.payment_method; existing.discount = sale.discount; persist(); }
    },
    deleteSale: async (id) => { state.sales = state.sales.filter((item) => item.id !== id); persist(); },
    saveCustomer: async (customer: CustomerInput) => {
      state.customers.push({ ...customer, id: nextId(state.customers), created_at: new Date().toISOString() });
      persist();
    },
    saveSupplier: async (input: SupplierInput) => {
      const name = input.name.trim();
      if (!name || name.length > 120 || input.contact_name.length > 120 || input.phone.length > 40
        || input.email.length > 254 || input.address.length > 240 || input.notes.length > 1000
        || (input.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email))) {
        throw new Error('Dati del fornitore non validi.');
      }
      const duplicate = state.suppliers.find((supplier) => supplier.id !== input.id
        && supplier.name.toLocaleLowerCase('it') === name.toLocaleLowerCase('it'));
      if (duplicate) throw new Error('Esiste già un fornitore con questo nome.');
      const fields = { ...input, name };
      if (input.id !== undefined) {
        const supplier = state.suppliers.find((item) => item.id === input.id);
        if (!supplier) throw new Error('Fornitore non trovato.');
        Object.assign(supplier, fields);
      } else {
        state.suppliers.push({ ...fields, id: nextId(state.suppliers), created_at: new Date().toISOString() });
      }
      persist();
    },
    application: {
      execute: async (command: ApplicationCommand) => {
        switch (command.type) {
          case 'supplier-order.save':
            await saveSupplierOrder(command.input);
            return;
          case 'supplier-order.receive':
            await receiveSupplierOrder(command.orderId, command.itemId, command.employeeBarcode);
            return;
          case 'supplier-order.update-item':
            await updateSupplierOrderItem(command.orderId, command.itemId, command.quantity, command.unitCost, command.employeeBarcode);
            return;
          case 'supplier-order.delete-item':
            await deleteSupplierOrderItem(command.orderId, command.itemId, command.employeeBarcode);
            return;
          default:
            throw new Error('Comando applicativo non supportato.');
        }
      },
    },
    generateLoyaltyCards: async ({ quantity, discount_percentage }) => {
      for (let index = 0; index < quantity; index += 1) {
        const code = `DEMO${String(nextId(state.loyaltyCards) + index).padStart(4, '0')}`;
        state.loyaltyCards.push({ id: nextId(state.loyaltyCards), code, barcode: code, discount_percentage, customer_id: null, customer_name: null, status: 'Sviluppata', points: 0, created_at: new Date().toISOString(), activated_at: null });
      }
      persist();
    },
    activateLoyaltyCard: async ({ card_id, customer_id }) => {
      const card = state.loyaltyCards.find((item) => item.id === card_id);
      const customer = state.customers.find((item) => item.id === customer_id);
      if (card && customer) {
        card.customer_id = customer.id;
        card.customer_name = `${customer.first_name} ${customer.last_name}`;
        card.status = 'Attiva';
        card.activated_at = new Date().toISOString();
        persist();
      }
    },
    deleteLoyaltyCard: async (id) => { state.loyaltyCards = state.loyaltyCards.filter((item) => item.id !== id); persist(); },
    saveExpense: async (expense: Pick<Expense, 'description' | 'category' | 'amount' | 'expense_date' | 'site' | 'receipt_data'>) => {
      state.expenses.unshift({ ...expense, id: nextId(state.expenses), created_at: new Date().toISOString() });
      persist();
    },
    openExpenseReceipt: async () => undefined,
    deleteExpense: async (id) => { state.expenses = state.expenses.filter((item) => item.id !== id); persist(); },
    saveSite: async (input: SiteInput) => {
      if (input.id) {
        const site = state.sites.find((item) => item.id === input.id);
        if (site) {
          const previousName = site.name;
          const siteRole = input.site_role ?? site.site_role ?? 'Punto vendita';
          Object.assign(site, input, { site_role: siteRole, email: input.email ?? '', tax_id: input.tax_id ?? '', manager_name: input.manager_name ?? '', opening_hours: input.opening_hours ?? '', notes: input.notes ?? '', site_type: siteRole === 'Magazzino' ? 'warehouse' as const : 'store' as const });
          state.employees.forEach((employee) => { if (employee.operational_site === previousName) employee.operational_site = site.name; });
          state.sales.forEach((sale) => { if (sale.site === previousName) sale.site = site.name; });
          state.expenses.forEach((expense) => { if (expense.site === previousName) expense.site = site.name; });
        }
      } else {
        const recognitionCode = uniqueSiteRecognitionCode(new Set(state.sites.map((item) => item.recognition_code)));
        const siteRole = input.site_role ?? 'Punto vendita';
        const site = { ...input, site_role: siteRole, email: input.email ?? '', tax_id: input.tax_id ?? '', manager_name: input.manager_name ?? '', opening_hours: input.opening_hours ?? '', notes: input.notes ?? '', id: nextId(state.sites), site_type: siteRole === 'Magazzino' ? 'warehouse' as const : 'store' as const, recognition_code: recognitionCode, created_at: new Date().toISOString() };
        state.sites.push(site);
      }
      persist();
    },
    setupSite: async (input) => api.saveSite(input, demoOwnerBarcode),
    deleteSite: async (id) => {
      const site = state.sites.find((item) => item.id === id);
      if (site) {
        const fallback = state.sites.filter((item) => item.id !== id).sort((a, b) => a.id - b.id)[0];
        const employees = state.employees.filter((employee) => employee.operational_site === site.name);
        const dependencies = [
          ['vendite', state.sales.filter((sale) => sale.site === site.name).length],
          ['spese', state.expenses.filter((expense) => expense.site === site.name).length],
          ['rimborsi', state.refunds.filter((refund) => refund.site === site.name).length],
          ['movimenti di magazzino', state.stockMovements.filter((movement) => movement.site === site.name || movement.destination === site.name).length],
          ['distribuzioni merce', state.stockDistributions.filter((distribution) => distribution.from_site === site.name || distribution.to_site === site.name).length],
          ['dipendenti assegnati', employees.length],
          ['pagamenti stipendi', state.payrollPayments.filter((payment) => employees.some((employee) => employee.id === payment.employee_id)).length],
          ['articoli con giacenza positiva', state.siteStocks.filter((stock) => stock.site_id === id && stock.stock > 0).length],
        ].filter(([, count]) => Number(count) > 0);
        if (dependencies.length) {
          throw new Error(`Impossibile eliminare la sede "${site.name}". Prima elimina o riassegna i dati associati: ${dependencies.map(([label, count]) => `${label} (${count})`).join(', ')}.`);
        }
        state.siteStocks = state.siteStocks.filter((stock) => stock.site_id !== id);
        state.sites = state.sites.filter((item) => item.id !== id);
        if (state.settings.main_site_id === String(id)) state.settings.main_site_id = String(fallback?.id ?? '');
        state.products.forEach((product) => refreshProductStock(product.id));
        persist();
      }
    },
    authorizeSiteAction: async (barcode) => employeeByBarcode(barcode)?.role.toLocaleLowerCase('it') === 'proprietario',
    chooseArchiveFolder: async () => null,
    savePdfForSharing: async ({ fileName, pdfBase64 }) => {
      const binary = atob(pdfBase64);
      const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      link.click();
      URL.revokeObjectURL(url);
      return fileName;
    },
    chooseShopLogo: async () => null,
    chooseHomepageImage: async () => null,
    chooseHomepageVideo: async () => null,
  };

  window.gestionale = api;
}

export default installWebPreview;
