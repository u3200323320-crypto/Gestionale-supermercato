export type Section = 'home' | 'inventory' | 'available-stock' | 'expired-products' | 'inventory-history' | 'stock-movement' | 'stock-distribution' | 'cash' | 'sales' | 'statistics' | 'sale-management' | 'promotions' | 'vouchers-create' | 'vouchers-list' | 'expenses' | 'financial-balance' | 'employees' | 'employee-create' | 'payroll' | 'employee-tracker' | 'site-statistics' | 'site-management' | 'site-create' | 'site-list' | 'low-stock' | 'supplier-list' | 'supplier-order' | 'customer-list' | 'loyalty-generate' | 'loyalty-activate' | 'loyalty-active' | 'settings';
export type RolePermission = Section | 'sales-report' | 'sales-csv' | 'sales-tools-configured';
export type RolePermissionMap = Partial<Record<string, RolePermission[]>>;
export type ProductUnit = 'KG' | 'LITRO' | 'PEZZO';
export type Printer = { name: string; displayName: string };
export interface Site { id: number; name: string; site_role: string; address: string; phone: string; email: string; tax_id: string; manager_name: string; opening_hours: string; notes: string; site_type: 'store' | 'warehouse'; recognition_code: string; created_at: string }
export type SiteInput = Pick<Site, 'name' | 'address' | 'phone'> & Partial<Pick<Site, 'site_role' | 'email' | 'tax_id' | 'manager_name' | 'opening_hours' | 'notes'>> & { id?: number };

export interface Product {
  id: number;
  code: string;
  name: string;
  unit?: ProductUnit;
  category: string;
  sale_price: number;
  purchase_price: number;
  stock: number;
  low_stock_threshold: number;
  expiry_enabled?: boolean;
  expiry_date?: string | null;
  photo_data?: string;
}

export interface SiteStock {
  product_id: number;
  site_id: number;
  site_name: string;
  stock: number;
}

export interface Customer {
  id: number;
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
  address: string;
  created_at: string;
}

export interface Supplier {
  id: number;
  name: string;
  contact_name: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
  created_at: string;
}
export type SupplierInput = Pick<Supplier, 'name' | 'contact_name' | 'phone' | 'email' | 'address' | 'notes'> & { id?: number };

export interface SupplierOrderItem {
  id: number;
  product_id: number;
  product_name: string;
  product_code: string;
  unit: ProductUnit;
  quantity: number;
  unit_cost: number;
  received_at: string | null;
}
export interface SupplierOrder {
  id: number;
  supplier_id: number;
  supplier_name: string;
  site_id: number | null;
  site_name: string | null;
  created_at: string;
  expected_arrival_date: string | null;
  received_at: string | null;
  notes: string;
  items: SupplierOrderItem[];
}
export type SupplierOrderInput = {
  supplier_id: number;
  site_id: number;
  expected_arrival_date: string | null;
  received: boolean;
  employee_barcode: string;
  notes: string;
  items: Array<Pick<SupplierOrderItem, 'product_id' | 'quantity' | 'unit_cost'>>;
};
export type ApplicationCommand =
  | { type: 'supplier-order.save'; input: SupplierOrderInput }
  | { type: 'supplier-order.receive'; orderId: number; itemId: number | null; employeeBarcode: string }
  | { type: 'supplier-order.update-item'; orderId: number; itemId: number; quantity: number; unitCost: number; employeeBarcode: string }
  | { type: 'supplier-order.delete-item'; orderId: number; itemId: number; employeeBarcode: string };

export interface AppDataBackup {
  format: 'gestionale-supermercato-data';
  version: 1;
  exportedAt: string;
  tables: Record<string, Array<Record<string, string | number | null>>>;
  rendererPreferences?: Record<string, string>;
  previewState?: AppState;
}

export interface LoyaltyCard {
  id: number;
  code: string;
  barcode: string;
  discount_percentage: number;
  customer_id: number | null;
  customer_name: string | null;
  status: 'Sviluppata' | 'Attiva';
  points: number;
  created_at: string;
  activated_at: string | null;
}

export interface SaleItem {
  id?: number;
  product_id: number;
  name: string;
  code: string;
  unit?: ProductUnit;
  quantity: number;
  unit_price: number;
  purchase_price: number;
}

export interface Sale {
  id: number;
  receipt_no: string;
  created_at: string;
  person: string;
  site: string;
  payment_method: string;
  discount: number;
  gross_total: number;
  total: number;
  item_count: number;
  items: SaleItem[];
}

export interface StockMovement {
  id: number;
  product_id: number;
  product_name: string;
  movement_type: 'Carico' | 'Scarico';
  quantity: number;
  created_at: string;
  person: string;
  site: string;
  destination: string;
  note: string;
}

export interface StockDistributionRecord {
  id: number;
  created_at: string;
  from_site: string;
  to_site: string;
  sender: string;
  recipient: string;
  file_path: string;
}

export interface EmployeeActivity {
  id: number;
  employee_id: number;
  employee_name: string;
  section: string;
  action: string;
  detail: string;
  created_at: string;
}

export interface Expense {
  id: number;
  description: string;
  category: string;
  amount: number;
  expense_date: string;
  created_at: string;
  site: string;
  receipt_data: string;
}

export interface Promotion {
  id: number;
  name: string;
  discount_type: 'percentage' | 'buy_get';
  percentage: number;
  buy_quantity: number;
  free_quantity: number;
  category: string;
  starts_at: string;
  ends_at: string;
  minimum_spend: number;
  minimum_kilograms?: number;
  minimum_pieces?: number;
  minimum_liters?: number;
  application_mode: 'Automatica' | 'Manuale';
}

export interface VoucherBatch {
  id: number;
  discount_percentage: number;
  starts_at: string;
  ends_at: string;
  created_at: string;
  codes: string[];
}

export interface Employee {
  id: number;
  first_name: string;
  last_name: string;
  age: number;
  gender: string;
  home_address: string;
  email: string;
  phone: string;
  operational_site: string;
  role: string;
  shift: string;
  salary: number;
  payment_method: 'Bonifico' | 'Contanti';
  iban: string;
  recognition_code: string;
  barcode: string;
  photo_data: string;
  documents_data: string;
  contract_pdf_data: string;
  contract_start_date: string;
  contract_end_date: string;
  created_at: string;
}

export type AuthenticatedEmployee = Pick<Employee, 'id' | 'first_name' | 'last_name' | 'role' | 'barcode'>;
export type EmployeeInput = Omit<Employee, 'id' | 'created_at'> & { id?: number; initial_password?: string };
export interface PayrollPayment {
  id: number;
  employee_id: number;
  pay_month: string;
  amount: number;
  payment_date: string;
  payment_method: 'Bonifico' | 'Contanti';
  first_name: string;
  last_name: string;
  site: string;
}
export interface Refund {
  id: number;
  sale_id: number;
  receipt_no: string;
  amount: number;
  created_at: string;
  site: string;
}
export type PayrollPaymentInput = { employee_id: number; pay_month: string; payment_date: string };
export type CustomerInput = { first_name: string; last_name: string; phone: string; email: string; address: string };
export type VoucherBatchInput = Pick<VoucherBatch, 'discount_percentage' | 'starts_at' | 'ends_at' | 'codes'> & { id?: number };
export type PromotionInput = Omit<Promotion, 'id'> & { id?: number };
export type CheckoutInput = { items: SaleItem[]; payment_method: string; employee_barcode?: string; site_id?: number; voucher_code?: string; manual_promotion_id?: number; automatic_promotion_id?: number | null };
export type VoucherValidation = { valid: true; discount_percentage: number } | { valid: false; message: string };

export interface AppState {
  products: Product[];
  sales: Sale[];
  promotions: Promotion[];
  voucherBatches: VoucherBatch[];
  employees: Employee[];
  employeeActivities: EmployeeActivity[];
  payrollPayments: PayrollPayment[];
  refunds: Refund[];
  settings: { shop_name: string; shop_number: string; shop_logo?: string; home_image?: string; home_video?: string; shop_address: string; shop_phone: string; shop_email: string; shop_tax_id: string; currency: string; main_site_id: string; role_permissions: string; setup_complete: boolean; auth_trial_expires_at: string; archive_folder: string; database_file: string; receipt_printer: string; receipt_printer_thermal: string; barcode_scanner_enabled: boolean; barcode_scanner_detected: boolean };
  stockMovements: StockMovement[];
  stockDistributions: StockDistributionRecord[];
  siteStocks: SiteStock[];
  expenses: Expense[];
  sites: Site[];
  customers: Customer[];
  loyaltyCards: LoyaltyCard[];
  suppliers: Supplier[];
  supplierOrders: SupplierOrder[];
}

export interface ProductInput {
  code: string;
  name: string;
  unit?: ProductUnit;
  category: string;
  sale_price: number;
  purchase_price: number;
  stock: number;
  low_stock_threshold: number;
  expiry_enabled?: boolean;
  expiry_date?: string | null;
  photo_data?: string;
}

declare global {
  interface Window {
  gestionale: {
    isDemo: boolean;
    getState: () => Promise<AppState>;
    getHomepageVideo: () => Promise<string>;
    onSalesExpired: (callback: () => void) => () => void;
    verifyEmployeeBarcode: (barcode: string) => Promise<boolean>;
    authorizeTracker: (barcode: string) => Promise<boolean>;
    loginEmployee: (barcode: string) => Promise<AuthenticatedEmployee | null>;
    logout: () => Promise<void>;
    saveProduct: (product: ProductInput, siteId?: number) => Promise<void>;
    updateStock: (productId: number, stock: number) => Promise<void>;
    moveStock: (movement: { productId: number; type: 'Carico' | 'Scarico'; quantity: number; employee_barcode: string; destination?: string; note: string }) => Promise<void>;
    transferStock: (movement: { fromSiteId: number; toSiteId: number; recipientEmployeeId: number; items: Array<{ productId: number; quantity: number }>; employee_barcode: string }, language?: 'it' | 'ar') => Promise<void>;
    openDistributionRecord: (id: number, language?: 'it' | 'ar') => Promise<void>;
    deleteDistribution: (id: number, employeeBarcode: string) => Promise<void>;
    checkout: (sale: CheckoutInput) => Promise<Sale>;
    validateVoucher: (code: string) => Promise<VoucherValidation>;
    savePromotion: (promotion: PromotionInput) => Promise<void>;
    deletePromotion: (id: number) => Promise<void>;
    saveVoucherBatch: (batch: VoucherBatchInput) => Promise<void>;
    deleteVoucherBatch: (id: number) => Promise<void>;
    saveEmployee: (employee: EmployeeInput) => Promise<void>;
    deleteEmployee: (employeeId: number, requesterBarcode: string) => Promise<void>;
    recordEmployeeActivity: (input: { employee_barcode: string; section: string; action: string; detail?: string }) => Promise<void>;
    deleteProduct: (productId: number) => Promise<void>;
    disposeExpiredProduct: (productId: number) => Promise<void>;
    paySalary: (input: PayrollPaymentInput) => Promise<void>;
    payAllSalaries: (input: { pay_month: string; payment_date: string }) => Promise<void>;
    paySelectedSalaries: (input: { employee_ids: number[]; pay_month: string; payment_date: string }) => Promise<void>;
    saveSetting: (key: 'shop_name' | 'shop_number' | 'shop_address' | 'shop_phone' | 'shop_email' | 'shop_tax_id' | 'currency' | 'main_site_id' | 'role_permissions' | 'archive_folder' | 'receipt_printer' | 'receipt_printer_thermal' | 'barcode_scanner_enabled' | 'barcode_scanner_detected' | 'home_image' | 'home_video', value: string) => Promise<void>;
    getPrinters: () => Promise<Printer[]>;
    printReceipt: (target?: 'regular' | 'thermal') => Promise<void>;
    savePayrollReceipts: (input: { folderName: string; files: Array<{ name: string; data: string }> }) => Promise<string>;
    authorizeSaleAction: (employeeBarcode: string) => Promise<boolean>;
    updateSale: (sale: Pick<Sale, 'id' | 'payment_method' | 'discount'> & { items: SaleItem[]; employee_barcode: string }) => Promise<void>;
    deleteSale: (id: number, employeeBarcode: string) => Promise<void>;
    saveCustomer: (customer: CustomerInput) => Promise<void>;
    saveSupplier: (supplier: SupplierInput) => Promise<void>;
    application: {
      execute: (command: ApplicationCommand) => Promise<void>;
    };
    generateLoyaltyCards: (input: { quantity: number; discount_percentage: number }) => Promise<void>;
    activateLoyaltyCard: (input: { card_id: number; customer_id: number }) => Promise<void>;
    deleteLoyaltyCard: (id: number) => Promise<void>;
    saveExpense: (expense: Pick<Expense, 'description' | 'category' | 'amount' | 'expense_date' | 'site' | 'receipt_data'>) => Promise<void>;
    openExpenseReceipt: (id: number) => Promise<void>;
    deleteExpense: (id: number) => Promise<void>;
    saveSite: (site: SiteInput, requesterBarcode: string) => Promise<void>;
    setupSite: (site: SiteInput) => Promise<void>;
    deleteSite: (siteId: number, requesterBarcode: string) => Promise<void>;
    authorizeSiteAction: (requesterBarcode: string) => Promise<boolean>;
    exportAppData: () => Promise<AppDataBackup>;
    importAppData: (backup: AppDataBackup) => Promise<{ added: number; skipped: number }>;
    chooseArchiveFolder: () => Promise<string | null>;
    savePdfForSharing: (input: { fileName: string; pdfBase64: string }) => Promise<string | null>;
    chooseShopLogo: () => Promise<string | null>;
    chooseHomepageImage: () => Promise<string | null>;
    chooseHomepageVideo: () => Promise<string | null>;
  }
}
}