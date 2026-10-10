export type Section = 'home' | 'inventory' | 'cash' | 'sales' | 'statistics' | 'settings';

export interface Product {
  id: number;
  code: string;
  name: string;
  category: string;
  sale_price: number;
  purchase_price: number;
  stock: number;
  low_stock_threshold: number;
}

export interface SaleItem {
  id?: number;
  product_id: number;
  name: string;
  code: string;
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
  total: number;
  item_count: number;
  items: SaleItem[];
}

export interface Promotion {
  id: number;
  name: string;
  percentage: number;
  category: string;
  starts_at: string;
  ends_at: string;
  application_mode: 'Automatica' | 'Manuale';
}

export interface AppState {
  products: Product[];
  sales: Sale[];
  promotions: Promotion[];
  settings: { shop_name: string; archive_folder: string; database_file: string };
}

export interface ProductInput {
  code: string;
  name: string;
  category: string;
  sale_price: number;
  purchase_price: number;
  stock: number;
  low_stock_threshold: number;
}

declare global {
  interface Window {
  gestionale: {
    getState: () => Promise<AppState>;
    hasPin: () => Promise<boolean>;
    verifyPin: (pin: string) => Promise<boolean>;
    setPin: (pin: string) => Promise<void>;
    saveProduct: (product: ProductInput) => Promise<void>;
    checkout: (sale: { items: SaleItem[]; payment_method: string; discount: number }) => Promise<Sale>;
    savePromotion: (promotion: Omit<Promotion, 'id'>) => Promise<void>;
    saveSetting: (key: 'shop_name' | 'archive_folder', value: string) => Promise<void>;
    updateSale: (sale: Pick<Sale, 'id' | 'payment_method' | 'discount'> & { items: SaleItem[] }) => Promise<void>;
    deleteSale: (id: number) => Promise<void>;
    chooseArchiveFolder: () => Promise<string | null>;
  }
}
}