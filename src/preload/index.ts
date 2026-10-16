import { contextBridge, ipcRenderer } from 'electron';
import type { CheckoutInput, EmployeeInput, Expense, Printer, ProductInput, PromotionInput, SaleItem, VoucherBatchInput } from '../shared/types';

contextBridge.exposeInMainWorld('gestionale', {
  getState: () => ipcRenderer.invoke('state:get'),
  hasPin: () => ipcRenderer.invoke('pin:has'),
  verifyPin: (pin: string) => ipcRenderer.invoke('pin:verify', pin),
  setPin: (pin: string) => ipcRenderer.invoke('pin:set', pin),
  saveProduct: (product: ProductInput) => ipcRenderer.invoke('product:save', product),
  updateStock: (productId: number, stock: number) => ipcRenderer.invoke('product:stock', productId, stock),
  moveStock: (movement: { productId: number; type: 'Carico' | 'Scarico'; quantity: number; note: string }) => ipcRenderer.invoke('product:move-stock', movement),
  checkout: (sale: CheckoutInput) => ipcRenderer.invoke('sale:checkout', sale),
  validateVoucher: (code: string) => ipcRenderer.invoke('voucher:validate', code),
  savePromotion: (promotion: PromotionInput) => ipcRenderer.invoke('promotion:save', promotion),
  deletePromotion: (id: number) => ipcRenderer.invoke('promotion:delete', id),
  saveVoucherBatch: (batch: VoucherBatchInput) => ipcRenderer.invoke('voucher-batch:save', batch),
  deleteVoucherBatch: (id: number) => ipcRenderer.invoke('voucher-batch:delete', id),
  saveEmployee: (employee: EmployeeInput) => ipcRenderer.invoke('employee:save', employee),
  saveSetting: (key: 'shop_name' | 'archive_folder' | 'receipt_printer' | 'barcode_scanner_enabled' | 'barcode_scanner_detected', value: string) => ipcRenderer.invoke('settings:save', key, value),
  getPrinters: (): Promise<Printer[]> => ipcRenderer.invoke('devices:printers'),
  printReceipt: (): Promise<void> => ipcRenderer.invoke('receipt:print'),
  updateSale: (sale: { id: number; payment_method: string; discount: number; items: SaleItem[] }) => ipcRenderer.invoke('sale:update', sale),
  deleteSale: (id: number) => ipcRenderer.invoke('sale:delete', id),
  saveExpense: (expense: Pick<Expense, 'description' | 'category' | 'amount' | 'expense_date'>) => ipcRenderer.invoke('expense:save', expense),
  deleteExpense: (id: number) => ipcRenderer.invoke('expense:delete', id),
  chooseArchiveFolder: () => ipcRenderer.invoke('archive:choose-folder'),
  chooseShopLogo: () => ipcRenderer.invoke('settings:choose-shop-logo'),
});