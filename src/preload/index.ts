import { contextBridge, ipcRenderer } from 'electron';
import type { AuthenticatedEmployee, CheckoutInput, EmployeeInput, Expense, PayrollPaymentInput, Printer, ProductInput, PromotionInput, SaleItem, VoucherBatchInput } from '../shared/types';

contextBridge.exposeInMainWorld('gestionale', {
  getState: () => ipcRenderer.invoke('state:get'),
  onSalesExpired: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on('sales:expired', listener);
    return () => ipcRenderer.removeListener('sales:expired', listener);
  },
  hasPin: () => ipcRenderer.invoke('pin:has'),
  verifyPin: (pin: string) => ipcRenderer.invoke('pin:verify', pin),
  verifyEmployeeBarcode: (barcode: string) => ipcRenderer.invoke('employee:authorize', barcode),
  loginEmployee: (barcode: string): Promise<AuthenticatedEmployee | null> => ipcRenderer.invoke('employee:login', barcode),
  recordEmployeeActivity: (input: { employee_barcode: string; section: string; action: string; detail?: string }) => ipcRenderer.invoke('employee:activity', input),
  setPin: (pin: string) => ipcRenderer.invoke('pin:set', pin),
  saveProduct: (product: ProductInput) => ipcRenderer.invoke('product:save', product),
  updateStock: (productId: number, stock: number) => ipcRenderer.invoke('product:stock', productId, stock),
  moveStock: (movement: { productId: number; type: 'Carico' | 'Scarico'; quantity: number; employee_barcode: string; destination?: string; note: string }) => ipcRenderer.invoke('product:move-stock', movement),
  checkout: (sale: CheckoutInput) => ipcRenderer.invoke('sale:checkout', sale),
  validateVoucher: (code: string) => ipcRenderer.invoke('voucher:validate', code),
  savePromotion: (promotion: PromotionInput) => ipcRenderer.invoke('promotion:save', promotion),
  deletePromotion: (id: number) => ipcRenderer.invoke('promotion:delete', id),
  saveVoucherBatch: (batch: VoucherBatchInput) => ipcRenderer.invoke('voucher-batch:save', batch),
  deleteVoucherBatch: (id: number) => ipcRenderer.invoke('voucher-batch:delete', id),
  saveEmployee: (employee: EmployeeInput) => ipcRenderer.invoke('employee:save', employee),
  deleteEmployee: (employeeId: number, requesterBarcode: string) => ipcRenderer.invoke('employee:delete', employeeId, requesterBarcode),
  deleteProduct: (productId: number) => ipcRenderer.invoke('product:delete', productId),
  disposeExpiredProduct: (productId: number) => ipcRenderer.invoke('product:dispose-expired', productId),
  paySalary: (input: PayrollPaymentInput) => ipcRenderer.invoke('payroll:pay', input),
  payAllSalaries: (input: { pay_month: string; payment_date: string }) => ipcRenderer.invoke('payroll:pay-all', input),
  saveSetting: (key: 'shop_name' | 'archive_folder' | 'receipt_printer' | 'barcode_scanner_enabled' | 'barcode_scanner_detected', value: string) => ipcRenderer.invoke('settings:save', key, value),
  getPrinters: (): Promise<Printer[]> => ipcRenderer.invoke('devices:printers'),
  printReceipt: (): Promise<void> => ipcRenderer.invoke('receipt:print'),
  authorizeSaleAction: (employeeBarcode: string): Promise<boolean> => ipcRenderer.invoke('sale:authorize', employeeBarcode),
  updateSale: (sale: { id: number; payment_method: string; discount: number; items: SaleItem[]; employee_barcode: string }) => ipcRenderer.invoke('sale:update', sale),
  deleteSale: (id: number, employeeBarcode: string): Promise<void> => ipcRenderer.invoke('sale:delete', id, employeeBarcode),
  saveExpense: (expense: Pick<Expense, 'description' | 'category' | 'amount' | 'expense_date' | 'site' | 'receipt_data'>) => ipcRenderer.invoke('expense:save', expense),
  deleteExpense: (id: number) => ipcRenderer.invoke('expense:delete', id),
  chooseArchiveFolder: () => ipcRenderer.invoke('archive:choose-folder'),
  chooseShopLogo: () => ipcRenderer.invoke('settings:choose-shop-logo'),
  chooseHomepageImage: () => ipcRenderer.invoke('settings:choose-homepage-image'),
});