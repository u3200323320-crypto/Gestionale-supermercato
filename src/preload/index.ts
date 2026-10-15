import { contextBridge, ipcRenderer } from 'electron';
import type { CheckoutInput, ProductInput, PromotionInput, SaleItem } from '../shared/types';

contextBridge.exposeInMainWorld('gestionale', {
  getState: () => ipcRenderer.invoke('state:get'),
  hasPin: () => ipcRenderer.invoke('pin:has'),
  verifyPin: (pin: string) => ipcRenderer.invoke('pin:verify', pin),
  setPin: (pin: string) => ipcRenderer.invoke('pin:set', pin),
  saveProduct: (product: ProductInput) => ipcRenderer.invoke('product:save', product),
  updateStock: (productId: number, stock: number) => ipcRenderer.invoke('product:stock', productId, stock),
  moveStock: (movement: { productId: number; type: 'Carico' | 'Scarico'; quantity: number; note: string }) => ipcRenderer.invoke('product:move-stock', movement),
  checkout: (sale: CheckoutInput) => ipcRenderer.invoke('sale:checkout', sale),
  savePromotion: (promotion: PromotionInput) => ipcRenderer.invoke('promotion:save', promotion),
  deletePromotion: (id: number) => ipcRenderer.invoke('promotion:delete', id),
  saveSetting: (key: 'shop_name' | 'archive_folder', value: string) => ipcRenderer.invoke('settings:save', key, value),
  updateSale: (sale: { id: number; payment_method: string; discount: number; items: SaleItem[] }) => ipcRenderer.invoke('sale:update', sale),
  deleteSale: (id: number) => ipcRenderer.invoke('sale:delete', id),
  chooseArchiveFolder: () => ipcRenderer.invoke('archive:choose-folder'),
  chooseShopLogo: () => ipcRenderer.invoke('settings:choose-shop-logo'),
});