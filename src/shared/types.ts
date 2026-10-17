export type Section = 'home' | 'inventory' | 'expired-products' | 'inventory-history' | 'stock-movement' | 'cash' | 'sales' | 'statistics' | 'sale-management' | 'promotions' | 'vouchers-create' | 'vouchers-list' | 'accounting' | 'accounting-statistics' | 'expenses' | 'financial-balance' | 'clients' | 'client-list' | 'cards-list' | 'cards-activate' | 'cards-create' | 'cards-developed' | 'employees' | 'employee-create' | 'payroll' | 'settings';
export type ProductUnit = 'KG' | 'LITRO' | 'PEZZO';
export type Printer = { name: string; displayName: string };

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
  destination: string;
  note: string;
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
  created_at: string;
}

export type EmployeeInput = Omit<Employee, 'id' | 'created_at'> & { initial_password: string };
export interface Customer {
  id: number;
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
  address: string;
  created_at: string;
}
export interface LoyaltyCard {
  id: number;
  code: string;
  barcode: string;
  discount_percentage: number;
  customer_id: number | null;
  status: 'Sviluppata' | 'Attiva';
  points: number;
  created_at: string;
  activated_at: string | null;
  first_name?: string;
  last_name?: string;
}
export interface PayrollPayment {
  id: number;
  employee_id: number;
  pay_month: string;
  amount: number;
  payment_date: string;
  payment_method: 'Bonifico' | 'Contanti';
  first_name: string;
  last_name: string;
}
export type CustomerInput = Pick<Customer, 'first_name' | 'last_name' | 'phone' | 'email' | 'address'>;
export type PayrollPaymentInput = { employee_id: number; pay_month: string; payment_date: string };
export type VoucherBatchInput = Pick<VoucherBatch, 'discount_percentage' | 'starts_at' | 'ends_at' | 'codes'> & { id?: number };
export type PromotionInput = Omit<Promotion, 'id'> & { id?: number };
export type CheckoutInput = { items: SaleItem[]; payment_method: string; voucher_code?: string; loyalty_card_id?: number; manual_promotion_id?: number; automatic_promotion_id?: number | null };
export type VoucherValidation = { valid: true; discount_percentage: number } | { valid: false; message: string };

export interface AppState {
  products: Product[];
  sales: Sale[];
  promotions: Promotion[];
  voucherBatches: VoucherBatch[];
  employees: Employee[];
  customers: Customer[];
  loyaltyCards: LoyaltyCard[];
  payrollPayments: PayrollPayment[];
  settings: { shop_name: string; shop_logo?: string; archive_folder: string; database_file: string; receipt_printer: string; barcode_scanner_enabled: boolean; barcode_scanner_detected: boolean };
  stockMovements: StockMovement[];
  expenses: Expense[];
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
}

declare global {
  interface Window {
  gestionale: {
    getState: () => Promise<AppState>;
    hasPin: () => Promise<boolean>;
    verifyPin: (pin: string) => Promise<boolean>;
    setPin: (pin: string) => Promise<void>;
    saveProduct: (product: ProductInput) => Promise<void>;
    updateStock: (productId: number, stock: number) => Promise<void>;
    moveStock: (movement: { productId: number; type: 'Carico' | 'Scarico'; quantity: number; employee_barcode: string; destination?: string; note: string }) => Promise<void>;
    checkout: (sale: CheckoutInput) => Promise<Sale>;
    validateVoucher: (code: string) => Promise<VoucherValidation>;
    savePromotion: (promotion: PromotionInput) => Promise<void>;
    deletePromotion: (id: number) => Promise<void>;
    saveVoucherBatch: (batch: VoucherBatchInput) => Promise<void>;
    deleteVoucherBatch: (id: number) => Promise<void>;
    saveEmployee: (employee: EmployeeInput) => Promise<void>;
    deleteProduct: (productId: number) => Promise<void>;
    disposeExpiredProduct: (productId: number) => Promise<void>;
    saveCustomer: (customer: CustomerInput) => Promise<void>;
    generateLoyaltyCards: (input: { quantity: number; discount_percentage: number }) => Promise<void>;
    activateLoyaltyCard: (input: { card_id: number; customer_id: number }) => Promise<void>;
    collectLoyaltyPoints: (input: { card_id: number; amount_spent: number }) => Promise<void>;
    redeemLoyaltyPoints: (input: { card_id: number; points: number }) => Promise<void>;
    paySalary: (input: PayrollPaymentInput) => Promise<void>;
    payAllSalaries: (input: { pay_month: string; payment_date: string }) => Promise<void>;
    saveSetting: (key: 'shop_name' | 'archive_folder' | 'receipt_printer' | 'barcode_scanner_enabled' | 'barcode_scanner_detected', value: string) => Promise<void>;
    getPrinters: () => Promise<Printer[]>;
    printReceipt: () => Promise<void>;
    updateSale: (sale: Pick<Sale, 'id' | 'payment_method' | 'discount'> & { items: SaleItem[] }) => Promise<void>;
    deleteSale: (id: number) => Promise<void>;
    saveExpense: (expense: Pick<Expense, 'description' | 'category' | 'amount' | 'expense_date' | 'site' | 'receipt_data'>) => Promise<void>;
    deleteExpense: (id: number) => Promise<void>;
    deleteLoyaltyCard: (id: number) => Promise<void>;
    chooseArchiveFolder: () => Promise<string | null>;
    chooseShopLogo: () => Promise<string | null>;
  }
}
}