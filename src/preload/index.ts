import { contextBridge, ipcRenderer } from 'electron';
import type { ProductInput, PromotionInput, SaleItem } from '../shared/types';

contextBridge.exposeInMainWorld('gestionale', {
  getState: () => ipcRenderer.invoke('state:get'),
  hasPin: () => ipcRenderer.invoke('pin:has'),
  verifyPin: (pin: string) => ipcRenderer.invoke('pin:verify', pin),
  setPin: (pin: string) => ipcRenderer.invoke('pin:set', pin),
  saveProduct: (product: ProductInput) => ipcRenderer.invoke('product:save', product),
  checkout: (sale: { items: SaleItem[]; payment_method: string; discount: number }) => ipcRenderer.invoke('sale:checkout', sale),
  savePromotion: (promotion: PromotionInput) => ipcRenderer.invoke('promotion:save', promotion),
  saveSetting: (key: 'shop_name' | 'archive_folder', value: string) => ipcRenderer.invoke('settings:save', key, value),
  updateSale: (sale: { id: number; payment_method: string; discount: number; items: SaleItem[] }) => ipcRenderer.invoke('sale:update', sale),
  deleteSale: (id: number) => ipcRenderer.invoke('sale:delete', id),
  chooseArchiveFolder: () => ipcRenderer.invoke('archive:choose-folder'),
});