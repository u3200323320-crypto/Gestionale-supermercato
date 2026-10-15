export type Section = 'home' | 'inventory' | 'inventory-history' | 'stock-movement' | 'cash' | 'sales' | 'statistics' | 'sale-management' | 'promotions' | 'settings';
export type ProductUnit = 'KG' | 'LITRO' | 'PEZZO';

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
  note: string;
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

export type PromotionInput = Omit<Promotion, 'id'> & { id?: number };
export type CheckoutInput = { items: SaleItem[]; payment_method: string; additional_discount: number; manual_promotion_id?: number; automatic_promotion_id?: number | null };

export interface AppState {
  products: Product[];
  sales: Sale[];
  promotions: Promotion[];
  settings: { shop_name: string; shop_logo?: string; archive_folder: string; database_file: string };
  stockMovements: StockMovement[];
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
    moveStock: (movement: { productId: number; type: 'Carico' | 'Scarico'; quantity: number; note: string }) => Promise<void>;
    checkout: (sale: CheckoutInput) => Promise<Sale>;
    savePromotion: (promotion: PromotionInput) => Promise<void>;
    deletePromotion: (id: number) => Promise<void>;
    saveSetting: (key: 'shop_name' | 'archive_folder', value: string) => Promise<void>;
    updateSale: (sale: Pick<Sale, 'id' | 'payment_method' | 'discount'> & { items: SaleItem[] }) => Promise<void>;
    deleteSale: (id: number) => Promise<void>;
    chooseArchiveFolder: () => Promise<string | null>;
    chooseShopLogo: () => Promise<string | null>;
  }
}
}