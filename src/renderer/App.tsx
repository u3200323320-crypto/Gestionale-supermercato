import { Fragment, useEffect, useRef, useState } from 'react';
import type { FormEvent, InputHTMLAttributes, ReactNode } from 'react';
import { Archive, ArrowDownToLine, ArrowLeft, BarChart3, Banknote, Barcode, Camera, Check, ChevronDown, CircleAlert, ClipboardList, CreditCard, House, LockKeyhole, Minus, Package, Pencil, Plus, Printer, Search, Settings, Share2, ShieldCheck, ShoppingBasket, Store, Trash2, TrendingUp, X } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import JsBarcode from 'jsbarcode';
import { calculatePromotionDiscounts } from '../shared/promotions';
import type { AppState, Printer as PrinterDevice, Product, ProductInput, ProductUnit, Promotion, PromotionInput, Sale, SaleItem, Section } from '../shared/types';

const money = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' });
const dateTime = new Intl.DateTimeFormat('it-IT', { dateStyle: 'short', timeStyle: 'short' });
const receiptDate = new Intl.DateTimeFormat('it-IT', { dateStyle: 'short' });
const receiptTime = new Intl.DateTimeFormat('it-IT', { timeStyle: 'short' });
const quantityFormat = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 3 });
const receiptQuantity = quantityFormat;
const roundQuantity = (quantity: number) => Math.round((quantity + Number.EPSILON) * 1000) / 1000;
const colors = ['#416e59', '#c17e4f', '#658499', '#a9aa64', '#8a7461', '#609085'];
const localDateKey = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const permanentPromotionEnd = '9999-12-31';
const promotionDurations = ['1 giorno', '3 giorni', '7 giorni', '1 mese', 'Sempre', 'Personalizzata'];
type PromotionMinimum = 'none' | 'spend' | 'kilograms' | 'pieces' | 'liters';
const nav: { section: Section; label: string; icon: typeof House }[] = [
  { section: 'home', label: 'Homepage', icon: House }, { section: 'inventory', label: 'Magazzino', icon: Package },
  { section: 'cash', label: 'Cassa', icon: ShoppingBasket }, { section: 'sales', label: 'Vendite', icon: ClipboardList },
  { section: 'statistics', label: 'Statistiche', icon: BarChart3 },
  { section: 'sale-management', label: 'Modifica o Elimina', icon: ClipboardList },
  { section: 'promotions', label: 'Offerta', icon: TrendingUp },
  { section: 'extras', label: 'Gestione Extra', icon: Banknote },
];
const inventoryFilters: { value: 'all' | 'available' | 'low' | 'out'; label: string }[] = [
  { value: 'all', label: 'Tutto' }, { value: 'available', label: 'Disponibile' },
  { value: 'low', label: 'In esaurimento' }, { value: 'out', label: 'Esaurito' },
];
const statisticsPeriods = ['Tutti', 'Ultimo giorno', 'Ultimi 3 giorni', 'Ultima settimana', 'Ultimo mese', 'Ultimi 3 mesi', 'Ultimi 6 mesi', 'Ultimo anno'];
const blankProduct: ProductInput = { code: '', name: '', unit: 'PEZZO', category: 'Dispensa', sale_price: 0, purchase_price: 0, stock: 0, low_stock_threshold: 5, expiry_enabled: false, expiry_date: '' };
const blankPromotion = (): PromotionInput => ({ name: '', discount_type: 'percentage', percentage: 10, buy_quantity: 2, free_quantity: 1, category: 'Tutte', starts_at: localDateKey(), ends_at: localDateKey(), minimum_spend: 0, minimum_kilograms: 0, minimum_pieces: 0, minimum_liters: 0, application_mode: 'Automatica' });
const errorText = (error: unknown) => error instanceof Error ? error.message : 'Operazione non riuscita.';
type PromotionDiscountType = 'percentage' | '2+1' | '3+1' | 'custom';

function promotionEndDate(start: string, duration: string): string {
  if (duration === 'Sempre') return permanentPromotionEnd;
  const date = new Date(`${start}T00:00:00`);
  if (duration === '3 giorni') date.setDate(date.getDate() + 2);
  else if (duration === '7 giorni') date.setDate(date.getDate() + 6);
  else if (duration === '1 mese') {
    const day = date.getDate();
    const targetMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0);
    date.setMonth(date.getMonth() + 1, Math.min(day, targetMonth.getDate()));
  }
  return localDateKey(date);
}

function Field({ label, fieldClassName, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string; fieldClassName?: string }) {
  return <label className={`field${fieldClassName ? ` ${fieldClassName}` : ''}`}><span>{label}</span><input {...props} /></label>;
}

function Modal({ title, close, children, wide = false, rightHalf = false }: { title: string; close: () => void; children: ReactNode; wide?: boolean; rightHalf?: boolean }) {
  return <div className={`modal-backdrop${rightHalf ? ' modal-right-half' : ''}`} onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}><section className={`modal${wide ? ' modal-wide' : ''}${rightHalf ? ' modal-payment-panel' : ''}`} role="dialog" aria-modal="true"><header className="modal-header"><div><p className="eyebrow">GESTIONALE</p><h2>{title}</h2></div><button className="icon-button" onClick={close} aria-label="Chiudi"><X size={18} /></button></header>{children}</section></div>;
}

function ProductForm({ initial, save, close }: { initial: ProductInput; save: (product: ProductInput) => Promise<void>; close: () => void }) {
  const [product, setProduct] = useState({ ...initial, expiry_enabled: initial.expiry_enabled ?? false, expiry_date: initial.expiry_date ?? '' });
  const [saving, setSaving] = useState(false);
  const change = (key: keyof ProductInput, value: string) => setProduct((current) => ({ ...current, [key]: ['sale_price', 'purchase_price', 'stock', 'low_stock_threshold'].includes(key) ? Number(value) : value }));
  const submit = async (event: FormEvent) => { event.preventDefault(); setSaving(true); try { await save(product); close(); } finally { setSaving(false); } };
  return <Modal title={initial.name ? 'Modifica articolo' : 'Nuovo articolo'} close={close} rightHalf={!initial.name}><form className="form-grid product-form" onSubmit={submit}>
    <Field label="Nome articolo" value={product.name} onChange={(e) => change('name', e.target.value)} required autoFocus />
    <Field label="Codice a barre" value={product.code} onChange={(e) => change('code', e.target.value)} required />
    <fieldset className="unit-choice"><legend>Unità di vendita</legend>{(['KG', 'LITRO', 'PEZZO'] as ProductUnit[]).map((unit) => <label key={unit}><input type="radio" name="product-unit" checked={(product.unit ?? 'PEZZO') === unit} onChange={() => setProduct({ ...product, unit })} /><span>{unit}</span></label>)}</fieldset>
    <Field label={`Prezzo di vendita${product.unit === 'KG' ? ' al kg' : product.unit === 'LITRO' ? ' al litro' : ''}`} type="number" min="0" step="0.01" value={product.sale_price || ''} onChange={(e) => change('sale_price', e.target.value)} required />
    <Field label={`Prezzo di acquisto${product.unit === 'KG' ? ' al kg' : product.unit === 'LITRO' ? ' al litro' : ''}`} type="number" min="0" step="0.01" value={product.purchase_price || ''} onChange={(e) => change('purchase_price', e.target.value)} required />
    <Field label={`Giacenza${product.unit === 'KG' ? ' (kg)' : product.unit === 'LITRO' ? ' (litri)' : ''}`} type="number" min="0" step={product.unit === 'PEZZO' ? '1' : 'any'} value={product.stock || ''} onChange={(e) => change('stock', e.target.value)} required />
    <Field label={`Soglia minima avviso${product.unit === 'KG' ? ' (kg)' : product.unit === 'LITRO' ? ' (litri)' : ''}`} type="number" min="0" step={product.unit === 'PEZZO' ? '1' : 'any'} value={product.low_stock_threshold || ''} onChange={(e) => change('low_stock_threshold', e.target.value)} required />
    <div className="expiry-field">
      <span className="field-label">Gestione data di scadenza</span>
      <button className={`toggle-button${product.expiry_enabled ? ' enabled' : ''}`} type="button" role="switch" aria-checked={product.expiry_enabled} onClick={() => setProduct((current) => ({ ...current, expiry_enabled: !current.expiry_enabled }))}>
        {product.expiry_enabled ? 'On' : 'Off'}
      </button>
      {product.expiry_enabled && <Field label="Data di scadenza" type="date" value={product.expiry_date ?? ''} onChange={(e) => setProduct((current) => ({ ...current, expiry_date: e.target.value }))} required />}
    </div>
    <Field fieldClassName="product-category-field" label="Categoria" value={product.category} onChange={(e) => change('category', e.target.value)} required />
    <div className="form-actions"><button className="button button-quiet full-width" type="button" onClick={close}>Annulla</button><button className="button button-primary full-width" disabled={saving}><Check size={16} /> Salva articolo</button></div>
  </form></Modal>;
}

export default function App() {
  const [data, setData] = useState<AppState | null>(null);
  const [section, setSection] = useState<Section>('home');
  const [inventoryMenuOpen, setInventoryMenuOpen] = useState(false);
  const [offerMenuOpen, setOfferMenuOpen] = useState(false);
  const [stockMovementType, setStockMovementType] = useState<'Carico' | 'Scarico'>('Carico');
  const [stockMovementProduct, setStockMovementProduct] = useState('');
  const [stockMovementQuantity, setStockMovementQuantity] = useState('');
  const [stockMovementNote, setStockMovementNote] = useState('');
  const [stockMovementPerson, setStockMovementPerson] = useState('');
  const [inventoryHistoryPeriod, setInventoryHistoryPeriod] = useState('Tutti');
  const [inventoryHistoryFrom, setInventoryHistoryFrom] = useState('');
  const [inventoryHistoryTo, setInventoryHistoryTo] = useState('');
  const [inventoryHistorySearch, setInventoryHistorySearch] = useState('');
  const [statisticsPeriod, setStatisticsPeriod] = useState('Tutti');
  const [unsoldListOpen, setUnsoldListOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<string | null>(null);
  const [extraTab, setExtraTab] = useState<string | null>(null);
  const [printers, setPrinters] = useState<PrinterDevice[]>([]);
  const [locked, setLocked] = useState(true);
  const [hasPin, setHasPin] = useState(false);
  const [pin, setPin] = useState('');
  const [notice, setNotice] = useState('');
  const [productForm, setProductForm] = useState<ProductInput | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [stockProduct, setStockProduct] = useState<Product | null>(null);
  const [stockInput, setStockInput] = useState('');
  const [saleDialog, setSaleDialog] = useState<Sale | null>(null);
  const [saleDiscountPercentage, setSaleDiscountPercentage] = useState(0);
  const [receipt, setReceipt] = useState<Sale | null>(null);
  const [cart, setCart] = useState<SaleItem[]>([]);
  const [scannerSearch, setScannerSearch] = useState('');
  const [inventorySearch, setInventorySearch] = useState('');
  const [inventoryStatus, setInventoryStatus] = useState<'all' | 'available' | 'low' | 'out'>('all');
  const [saleSearch, setSaleSearch] = useState('');
  const [saleLookup, setSaleLookup] = useState('');
  const [salesPeriod, setSalesPeriod] = useState('Tutti');
  const [salesFrom, setSalesFrom] = useState('');
  const [salesTo, setSalesTo] = useState('');
  const [salesCategory, setSalesCategory] = useState('Tutte');
  const [category, setCategory] = useState('Tutte');
  const [paymentMethod, setPaymentMethod] = useState('Carta');
  const [discount, setDiscount] = useState(0);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [promotionDuration, setPromotionDuration] = useState('1 giorno');
  const [saleAddOpen, setSaleAddOpen] = useState(false);
  const [saleProductSearch, setSaleProductSearch] = useState('');
  const [saleCart, setSaleCart] = useState<SaleItem[]>([]);
  const [measuredProduct, setMeasuredProduct] = useState<Product | null>(null);
  const [measuredQuantity, setMeasuredQuantity] = useState('');
  const [measuredTarget, setMeasuredTarget] = useState<'cash' | 'sale-edit'>('cash');
  const [camera, setCamera] = useState(false);
  const [pendingUnknownCode, setPendingUnknownCode] = useState('');
  const [shopName, setShopName] = useState('');
  const [archiveFolder, setArchiveFolder] = useState('');
  const [newPin, setNewPin] = useState('');
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [promotion, setPromotion] = useState<PromotionInput>(blankPromotion);
  const [promotionDiscountType, setPromotionDiscountType] = useState<PromotionDiscountType>('percentage');
  const [promotionMinimum, setPromotionMinimum] = useState<PromotionMinimum>('none');
  const [manualPromotionId, setManualPromotionId] = useState<number | undefined>();
  const [automaticPromotionId, setAutomaticPromotionId] = useState<number | null | undefined>(undefined);
  const scannerSequence = useRef({ value: '', startedAt: 0, lastAt: 0 });

  const refresh = async () => { const next = await window.gestionale.getState(); setData(next); setShopName(next.settings.shop_name); setArchiveFolder(next.settings.archive_folder); return next; };
  const notify = (text: string) => { setNotice(text); window.setTimeout(() => setNotice(''), 3600); };
  useEffect(() => { void window.gestionale.hasPin().then((exists) => { setHasPin(exists); if (!exists) { setLocked(false); void refresh(); } }); }, []);
  useEffect(() => { const openCash = (event: KeyboardEvent) => { if (event.key === 'F2') { event.preventDefault(); setInventoryMenuOpen(false); setSection('cash'); } }; window.addEventListener('keydown', openCash); return () => window.removeEventListener('keydown', openCash); }, []);
  useEffect(() => {
    if (section === 'cash' && !camera && !pendingUnknownCode && !productForm) {
      requestAnimationFrame(() => document.getElementById('scanner-field')?.focus());
    }
  }, [section, camera, pendingUnknownCode, productForm]);
  useEffect(() => { if (receipt) { const barcode = document.getElementById('receipt-barcode'); if (barcode) JsBarcode(barcode, receipt.receipt_no, { format: 'CODE128', width: 2.1, height: 48, displayValue: false, margin: 0 }); } }, [receipt]);

  const categories = [...new Set(data?.products.map((item) => item.category) ?? [])];
  const availableSaleProducts = data?.products.filter((product) => product.stock > 0) ?? [];
  const selectedMovementProduct = data?.products.find((product) => String(product.id) === stockMovementProduct);
  const todayKey = localDateKey();
  const promotionDiscounts = calculatePromotionDiscounts(data?.promotions ?? [], data?.products ?? [], cart, todayKey, manualPromotionId, automaticPromotionId);
  const automaticApplicableOffers = promotionDiscounts.automaticApplicablePromotions;
  const manualApplicableOffers = promotionDiscounts.manualApplicablePromotions;
  const automaticDiscount = promotionDiscounts.automaticDiscount;
  const manualDiscount = promotionDiscounts.manualDiscount;
  const addToCart = (product: Product, amount = 1) => {
    const normalizedAmount = roundQuantity(amount);
    setCart((current) => {
      const line = current.find((item) => item.product_id === product.id);
      if (product.stock - (line?.quantity ?? 0) < normalizedAmount) { notify(`Scorta insufficiente per ${product.name}.`); return current; }
      return line
        ? current.map((item) => item.product_id === product.id ? { ...item, quantity: roundQuantity(item.quantity + normalizedAmount) } : item)
        : [...current, { product_id: product.id, name: product.name, code: product.code, unit: product.unit ?? 'PEZZO', quantity: normalizedAmount, unit_price: product.sale_price, purchase_price: product.purchase_price }];
    });
  };
  const scanCode = (code: string) => {
    const normalized = code.trim();
    if (!normalized) return;
    const product = data?.products.find((item) => item.code === normalized);
    setScannerSearch('');
    if (product) addProductToCart(product);
    else setPendingUnknownCode(normalized);
  };
  const saveProduct = async (item: ProductInput) => { try { await window.gestionale.saveProduct(item); await refresh(); setSelectedProduct(null); notify('Articolo salvato'); } catch (error) { notify(errorText(error)); throw error; } };
  const saveStock = async (event: FormEvent) => {
    event.preventDefault();
    if (!stockProduct) return;
    const quantity = Number(stockInput);
    if (!Number.isFinite(quantity) || quantity <= 0) { notify('Inserisci una quantità maggiore di zero.'); return; }
    try {
      await window.gestionale.moveStock({ productId: stockProduct.id, type: 'Carico', quantity, note: 'Carico da dettaglio articolo' });
      await refresh();
      setStockProduct(null);
      notify('Giacenza aggiornata');
    } catch (error) {
      notify(errorText(error));
    }
  };
  const saveStockMovement = async (event: FormEvent) => {
    event.preventDefault();
    const productId = Number(stockMovementProduct);
    const quantity = Number(stockMovementQuantity);
    if (!Number.isInteger(productId) || productId < 1 || !Number.isFinite(quantity) || quantity <= 0) {
      notify('Seleziona un articolo e inserisci una quantità maggiore di zero.');
      return;
    }
    try {
      if (stockMovementType === 'Scarico' && !stockMovementPerson.trim()) { notify('Inserisci il nome della persona che prende la merce.'); return; }
      await window.gestionale.moveStock({ productId, type: stockMovementType, quantity: roundQuantity(quantity), person: stockMovementPerson.trim(), note: stockMovementNote });
      await refresh();
      setStockMovementQuantity('');
      setStockMovementNote('');
      setStockMovementPerson('');
      notify(`${stockMovementType} registrato`);
    } catch (error) {
      notify(errorText(error));
    }
  };
  const unlock = async (event: FormEvent) => { event.preventDefault(); if (!await window.gestionale.verifyPin(pin)) { notify('PIN non corretto'); return; } setLocked(false); setPin(''); await refresh(); };
  const openSaleForEditing = (sale: Sale) => {
    const gross = sale.items.reduce((sum, item) => sum + item.quantity * item.unit_price, 0);
    setSaleDiscountPercentage(gross > 0 ? sale.discount / gross * 100 : 0);
    setSaleDialog({ ...sale, items: sale.items.map((item) => ({ ...item })) });
  };
  const findSale = () => { const sale = data?.sales.find((item) => item.receipt_no === saleLookup.trim()); if (sale) openSaleForEditing(sale); else notify('Scontrino non trovato'); };
  const handleScannedCode = (code: string) => {
    const normalized = code.trim();
    if (!normalized || !data?.settings.barcode_scanner_enabled) return;
    if (!data.settings.barcode_scanner_detected) {
      setData((current) => current ? { ...current, settings: { ...current.settings, barcode_scanner_detected: true } } : current);
      void window.gestionale.saveSetting('barcode_scanner_detected', 'true').catch((error: unknown) => notify(errorText(error)));
    }
    if (section === 'cash') scanCode(normalized);
    else if (section === 'sales') setSaleSearch(normalized.replace(/\D/g, ''));
    else if (section === 'sale-management') {
      const receiptNumber = normalized.replace(/\D/g, '');
      setSaleLookup(receiptNumber);
      const sale = data.sales.find((item) => item.receipt_no === receiptNumber);
      if (sale) openSaleForEditing(sale);
      else notify('Scontrino non trovato');
    }
  };
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!['cash', 'sales', 'sale-management'].includes(section) || !data?.settings.barcode_scanner_enabled) return;
      const now = performance.now();
      const sequence = scannerSequence.current;
      if (event.key === 'Enter') {
        const averageInterval = sequence.value.length > 1 ? (now - sequence.startedAt) / (sequence.value.length - 1) : Infinity;
        if (sequence.value.length >= 4 && now - sequence.startedAt <= 600 && averageInterval <= 75) {
          event.preventDefault();
          event.stopPropagation();
          handleScannedCode(sequence.value);
          if (section === 'cash') requestAnimationFrame(() => document.getElementById('scanner-field')?.focus());
        }
        sequence.value = '';
        return;
      }
      if (event.key.length !== 1 || event.ctrlKey || event.altKey || event.metaKey) return;
      if (now - sequence.lastAt > 100) {
        sequence.value = '';
        sequence.startedAt = now;
      }
      sequence.value += event.key;
      sequence.lastAt = now;
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [data, section]);
  useEffect(() => {
    if (section !== 'settings' || settingsTab !== 'Dispositivi') return;
    void window.gestionale.getPrinters().then(setPrinters).catch((error: unknown) => notify(errorText(error)));
  }, [section, settingsTab]);
  const changeSaleDiscount = (percentage: number) => {
    if (!saleDialog) return;
    const gross = saleDialog.items.reduce((sum, item) => sum + item.quantity * item.unit_price, 0);
    setSaleDialog({ ...saleDialog, discount: Math.round(gross * percentage) / 100 });
  };
  const changeSaleQuantity = (index: number, quantity: number) => {
    if (!saleDialog) return;
    const items = saleDialog.items.map((item, itemIndex) => itemIndex === index ? { ...item, quantity: Math.max(0, roundQuantity(quantity)) } : item);
    const gross = items.reduce((sum, item) => sum + item.quantity * item.unit_price, 0);
    setSaleDialog({ ...saleDialog, items, discount: Math.round(gross * saleDiscountPercentage) / 100 });
  };
  const addProductToSaleCart = (product: Product, amount?: number) => {
    if (amount === undefined && (product.unit === 'KG' || product.unit === 'LITRO')) {
      setMeasuredProduct(product);
      setMeasuredTarget('sale-edit');
      setMeasuredQuantity('');
      return;
    }
    const addedAmount = roundQuantity(amount ?? 1);
    const staged = saleCart.find((item) => item.product_id === product.id);
    const originalQuantity = data?.sales.find((sale) => sale.id === saleDialog?.id)?.items
      .filter((item) => item.product_id === product.id).reduce((sum, item) => sum + item.quantity, 0) ?? 0;
    const editedQuantity = saleDialog?.items
      .filter((item) => item.product_id === product.id).reduce((sum, item) => sum + item.quantity, 0) ?? 0;
    if (product.stock + originalQuantity - editedQuantity - (staged?.quantity ?? 0) < addedAmount) { notify(`Scorta insufficiente per ${product.name}.`); return; }
    setSaleCart((current) => staged
      ? current.map((item) => item.product_id === product.id ? { ...item, quantity: roundQuantity(item.quantity + addedAmount) } : item)
      : [...current, { product_id: product.id, name: product.name, code: product.code, unit: product.unit ?? 'PEZZO', quantity: addedAmount, unit_price: product.sale_price, purchase_price: product.purchase_price }]);
  };
  const addProductToSale = () => {
    if (!saleDialog || !saleCart.length) return;
    const items = saleDialog.items.map((item) => ({ ...item }));
    saleCart.forEach((added) => {
      const existing = items.find((item) => item.product_id === added.product_id);
      if (existing) existing.quantity = roundQuantity(existing.quantity + added.quantity);
      else items.push(added);
    });
    const gross = items.reduce((sum, item) => sum + item.quantity * item.unit_price, 0);
    setSaleDialog({ ...saleDialog, items, discount: Math.round(gross * saleDiscountPercentage) / 100 });
    setSaleCart([]);
    setSaleProductSearch('');
    setSaleAddOpen(false);
  };
  const addProductToCart = (product: Product, target: 'cash' | 'sale-edit' = 'cash') => {
    if (product.unit === 'KG' || product.unit === 'LITRO') {
      setMeasuredProduct(product);
      setMeasuredTarget(target);
      setMeasuredQuantity('');
      return;
    }
    if (target === 'cash') addToCart(product);
    else addProductToSaleCart(product);
  };
  const confirmMeasuredQuantity = (event: FormEvent) => {
    event.preventDefault();
    if (!measuredProduct) return;
    const quantity = roundQuantity(Number(measuredQuantity));
    if (!Number.isFinite(quantity) || quantity <= 0) { notify('Inserisci un peso o un volume maggiore di zero.'); return; }
    if (measuredTarget === 'cash') {
      const inCart = cart.find((item) => item.product_id === measuredProduct.id)?.quantity ?? 0;
      if (measuredProduct.stock - inCart < quantity) { notify(`Scorta insufficiente per ${measuredProduct.name}.`); return; }
      addToCart(measuredProduct, quantity);
    } else {
      const staged = saleCart.find((item) => item.product_id === measuredProduct.id)?.quantity ?? 0;
      const original = data?.sales.find((sale) => sale.id === saleDialog?.id)?.items
        .filter((item) => item.product_id === measuredProduct.id).reduce((sum, item) => sum + item.quantity, 0) ?? 0;
      const edited = saleDialog?.items.filter((item) => item.product_id === measuredProduct.id)
        .reduce((sum, item) => sum + item.quantity, 0) ?? 0;
      if (measuredProduct.stock + original - edited - staged < quantity) { notify(`Scorta insufficiente per ${measuredProduct.name}.`); return; }
      addProductToSaleCart(measuredProduct, quantity);
    }
    setMeasuredProduct(null);
    setMeasuredQuantity('');
  };
  const updateSale = async () => { if (!saleDialog) return; const items = saleDialog.items.filter((item) => item.quantity > 0); if (!items.length) { notify('Una vendita deve contenere almeno un articolo.'); return; } if (saleDiscountPercentage < 0 || saleDiscountPercentage > 100) { notify('Lo sconto deve essere compreso tra 0 e 100%.'); return; } try { const saleId = saleDialog.id; await window.gestionale.updateSale({ id: saleId, payment_method: saleDialog.payment_method, discount: saleDialog.discount, items }); const next = await refresh(); const updatedSale = next.sales.find((sale) => sale.id === saleId); setSaleLookup(''); setSaleDialog(null); if (!updatedSale) throw new Error('Vendita aggiornata ma non trovata nell’archivio.'); setReceipt(updatedSale); notify('Vendita aggiornata'); } catch (error) { notify(errorText(error)); await refresh(); } };
  const deleteSale = async (sale: Sale) => { if (!window.confirm(`Eliminare lo scontrino ${sale.receipt_no}? Le quantità verranno ripristinate.`)) return; try { await window.gestionale.deleteSale(sale.id); await refresh(); setSaleLookup(''); setSaleDialog(null); notify('Vendita eliminata'); } catch (error) { notify(errorText(error)); await refresh(); } };
  const subtotal = cart.reduce((sum, item) => sum + item.quantity * item.unit_price, 0);
  const totalBeforeAdditionalDiscount = Math.max(0, subtotal - automaticDiscount - manualDiscount);
  const additionalDiscount = Math.round(totalBeforeAdditionalDiscount * Number(discount || 0)) / 100;
  const total = Math.max(0, totalBeforeAdditionalDiscount - additionalDiscount);
  const changeQuantity = (id: number, amount: number) => {
    const line = cart.find((item) => item.product_id === id);
    const product = data?.products.find((item) => item.id === id);
    const step = line?.unit === 'PEZZO' || !line?.unit ? 1 : 0.1;
    if (amount > 0 && line && product && line.quantity + step > product.stock) { notify(`Scorta insufficiente per ${line.name}.`); return; }
    setCart((current) => current.map((item) => item.product_id === id ? { ...item, quantity: Math.max(0, roundQuantity(item.quantity + amount * step)) } : item).filter((item) => item.quantity > 0));
  };
  const checkout = async () => {
    const additionalDiscountPercentage = Number(discount || 0);
    if (!Number.isFinite(additionalDiscountPercentage) || additionalDiscountPercentage < 0 || additionalDiscountPercentage > 100) {
      notify('La percentuale di sconto aggiuntivo deve essere compresa tra 0 e 100.');
      return;
    }
    try {
      const sale = await window.gestionale.checkout({ items: cart, payment_method: paymentMethod, additional_discount: additionalDiscount, manual_promotion_id: promotionDiscounts.manualPromotion?.id, automatic_promotion_id: automaticPromotionId });
      setCart([]);
      setDiscount(0);
      setManualPromotionId(undefined);
      setAutomaticPromotionId(undefined);
      setCheckoutOpen(false);
      await refresh();
      setReceipt(sale);
    } catch (error) { notify(errorText(error)); await refresh(); }
  };
  const saveStoreName = async (event: FormEvent) => { event.preventDefault(); await window.gestionale.saveSetting('shop_name', shopName.trim() || 'Il tuo supermercato'); await refresh(); notify('Nome negozio aggiornato'); };
  const saveReceiptPrinter = async (printerName: string) => {
    try {
      await window.gestionale.saveSetting('receipt_printer', printerName);
      await refresh();
      notify(printerName ? 'Stampante scontrini collegata' : 'Stampante scontrini rimossa');
    } catch (error) { notify(errorText(error)); }
  };
  const toggleBarcodeScanner = async () => {
    const enabled = !data?.settings.barcode_scanner_enabled;
    try {
      await window.gestionale.saveSetting('barcode_scanner_enabled', String(enabled));
      await refresh();
      notify(enabled ? 'Lettore barcode attivato' : 'Lettore barcode disattivato');
    } catch (error) { notify(errorText(error)); }
  };
  const chooseShopLogo = async () => { try { const logo = await window.gestionale.chooseShopLogo(); if (logo) { await refresh(); notify('Logo del negozio aggiornato'); } } catch (error) { notify(errorText(error)); } };
  const chooseFolder = async () => { const chosen = await window.gestionale.chooseArchiveFolder(); if (chosen) { setArchiveFolder(chosen); await refresh(); notify('Cartella archivio aggiornata'); } };
  const savePromotion = async (event: FormEvent) => {
    event.preventDefault();
    const selectedMinimum = promotionMinimum === 'spend' ? promotion.minimum_spend : promotionMinimum === 'kilograms' ? promotion.minimum_kilograms : promotionMinimum === 'pieces' ? promotion.minimum_pieces : promotionMinimum === 'liters' ? promotion.minimum_liters : 0;
    if (promotionMinimum !== 'none' && (!Number.isFinite(selectedMinimum) || (selectedMinimum ?? 0) <= 0)) { notify('Inserisci un requisito minimo maggiore di zero.'); return; }
    try {
      await window.gestionale.savePromotion({ ...promotion, minimum_spend: promotionMinimum === 'spend' ? promotion.minimum_spend : 0, minimum_kilograms: promotionMinimum === 'kilograms' ? promotion.minimum_kilograms : 0, minimum_pieces: promotionMinimum === 'pieces' ? promotion.minimum_pieces : 0, minimum_liters: promotionMinimum === 'liters' ? promotion.minimum_liters : 0 });
      await refresh();
      const wasEditing = promotion.id !== undefined;
      resetPromotionForm();
      notify(wasEditing ? 'Promozione aggiornata' : 'Promozione creata');
    } catch (error) { notify(errorText(error)); }
  };
  const changePromotionDuration = (duration: string) => {
    setPromotionDuration(duration);
    if (duration !== 'Personalizzata') setPromotion((current) => ({ ...current, ends_at: promotionEndDate(current.starts_at, duration) }));
  };
  const changePromotionStart = (startsAt: string) => setPromotion((current) => ({
    ...current,
    starts_at: startsAt,
    ...(promotionDuration === 'Personalizzata' ? {} : { ends_at: promotionEndDate(startsAt, promotionDuration) }),
  }));
  const deletePromotion = async (offer: Promotion) => {
    if (!window.confirm(`Eliminare l'offerta "${offer.name}"?`)) return;
    try {
      await window.gestionale.deletePromotion(offer.id);
      await refresh();
      if (promotion.id === offer.id) resetPromotionForm();
      notify('Offerta eliminata');
    } catch (error) {
      notify(errorText(error));
    }
  };
  const exportReport = () => {
    if (!data) return;
    const doc = new jsPDF({ orientation: 'landscape' });
    const gross = data.sales.reduce((sum, sale) => sum + sale.gross_total, 0);
    const net = data.sales.reduce((sum, sale) => sum + sale.total, 0);
    doc.setFillColor(43, 82, 61);
    doc.rect(0, 0, 297, 36, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.text(data.settings.shop_name, 14, 16);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text('Report vendite · Esportato il ' + receiptDate.format(new Date()), 14, 26);
    doc.setTextColor(41, 51, 46);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text(`Vendite: ${data.sales.length}`, 14, 47);
    doc.text(`Totale lordo: ${money.format(gross)}`, 74, 47);
    doc.text(`Incasso netto: ${money.format(net)}`, 164, 47);
    autoTable(doc, {
      startY: 55,
      head: [['Scontrino', 'Data e ora', 'Articoli', 'Pagamento', 'Lordo', 'Sconto', 'Totale netto']],
      body: data.sales.map((sale) => [sale.receipt_no, dateTime.format(new Date(sale.created_at)), String(sale.item_count), sale.payment_method, money.format(sale.gross_total), money.format(sale.discount), money.format(sale.total)]),
      theme: 'striped',
      styles: { fontSize: 9, cellPadding: 3, textColor: [49, 60, 53], lineColor: [224, 230, 224] },
      headStyles: { fillColor: [56, 104, 78], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [244, 247, 244] },
      margin: { left: 14, right: 14, bottom: 16 },
      didDrawPage: () => {
        doc.setFontSize(8);
        doc.setTextColor(120, 130, 122);
        doc.text(`${data.settings.shop_name} · Pagina ${doc.getNumberOfPages()}`, 14, 202);
      },
    });
    doc.save(`report-vendite-${todayKey}.pdf`);
  };
  const exportInventoryReport = () => {
    if (!data) return;
    const doc = new jsPDF({ orientation: 'landscape' });
    const stockValue = data.products.reduce((sum, item) => sum + item.stock * item.purchase_price, 0);
    const lowStockCount = data.products.filter((item) => item.stock <= item.low_stock_threshold).length;
    doc.setFillColor(43, 82, 61);
    doc.rect(0, 0, 297, 36, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.text(data.settings.shop_name, 14, 16);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text('Report magazzino · Esportato il ' + receiptDate.format(new Date()), 14, 26);
    doc.setTextColor(41, 51, 46);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text(`Articoli: ${data.products.length}`, 14, 47);
    doc.text(`Sotto soglia: ${lowStockCount}`, 74, 47);
    doc.text(`Valore acquisto giacenze: ${money.format(stockValue)}`, 164, 47);
    autoTable(doc, {
      startY: 55,
      head: [['Codice', 'Articolo', 'Categoria', 'Vendita / unità', 'Acquisto / unità', 'Giacenza', 'Soglia minima', 'Scadenza']],
      body: data.products.map((item) => [item.code, item.name, item.category, money.format(item.sale_price), money.format(item.purchase_price), `${item.stock} ${item.unit === 'KG' ? 'kg' : item.unit === 'LITRO' ? 'lit.' : 'pz'}`, String(item.low_stock_threshold), item.expiry_enabled && item.expiry_date ? receiptDate.format(new Date(`${item.expiry_date}T00:00:00`)) : '—']),
      theme: 'striped',
      styles: { fontSize: 8, cellPadding: 3, textColor: [49, 60, 53], lineColor: [224, 230, 224] },
      headStyles: { fillColor: [56, 104, 78], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [244, 247, 244] },
      margin: { left: 14, right: 14, bottom: 16 },
      didDrawPage: () => {
        doc.setFontSize(8);
        doc.setTextColor(120, 130, 122);
        doc.text(`${data.settings.shop_name} · Pagina ${doc.getNumberOfPages()}`, 14, 202);
      },
    });
    doc.save(`report-magazzino-${todayKey}.pdf`);
  };
  const exportSalesCsv = () => {
    if (!data) return;
    const quote = (value: string | number) => `"${String(value).replaceAll('"', '""')}"`;
    const csvNumber = new Intl.NumberFormat('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const csvQuantity = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 3 });
    const rows = [
      ['Numero scontrino', 'Data e ora', 'Metodo di pagamento', 'Articoli', 'Quantità totale', 'Totale lordo', 'Sconto', 'Totale netto'],
      ...data.sales.map((sale) => [
        sale.receipt_no,
        dateTime.format(new Date(sale.created_at)),
        sale.payment_method,
        sale.items.map((item) => `${item.name} (${csvQuantity.format(item.quantity)} ${item.unit === 'KG' ? 'kg' : item.unit === 'LITRO' ? 'lit.' : 'pz'})`).join(', '),
        csvQuantity.format(sale.items.reduce((sum, item) => sum + item.quantity, 0)),
        csvNumber.format(sale.gross_total),
        csvNumber.format(sale.discount),
        csvNumber.format(sale.total),
      ]),
    ];
    const csv = `\uFEFFsep=;\r\n${rows.map((row) => row.map(quote).join(';')).join('\r\n')}`;
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `vendite-${todayKey}.csv`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const todaySales = data?.sales.filter((sale) => new Date(sale.created_at).toDateString() === new Date().toDateString()) ?? [];
  const dailyTotal = todaySales.reduce((sum, sale) => sum + sale.total, 0);
  const dailyGross = todaySales.reduce((sum, sale) => sum + sale.gross_total, 0);
  const dailyUnits = todaySales.reduce((sum, sale) => sum + sale.item_count, 0);
  const statisticsStart = new Date();
  statisticsStart.setHours(0, 0, 0, 0);
  const statisticsDays: Record<string, number> = { 'Ultimo giorno': 1, 'Ultimi 3 giorni': 3, 'Ultima settimana': 7 };
  if (statisticsDays[statisticsPeriod]) statisticsStart.setDate(statisticsStart.getDate() - statisticsDays[statisticsPeriod] + 1);
  else if (statisticsPeriod !== 'Tutti') {
    const months = statisticsPeriod === 'Ultimo mese' ? 1 : statisticsPeriod === 'Ultimi 3 mesi' ? 3 : statisticsPeriod === 'Ultimi 6 mesi' ? 6 : 12;
    const day = statisticsStart.getDate();
    const targetMonth = new Date(statisticsStart.getFullYear(), statisticsStart.getMonth() - months, 1);
    statisticsStart.setFullYear(targetMonth.getFullYear(), targetMonth.getMonth(), Math.min(day, new Date(targetMonth.getFullYear(), targetMonth.getMonth() + 1, 0).getDate()));
  }
  if (statisticsPeriod === 'Tutti' && data?.sales.length) {
    const oldestSale = data.sales.reduce((oldest, sale) => {
      const saleDate = new Date(sale.created_at);
      return saleDate < oldest ? saleDate : oldest;
    }, new Date(data.sales[0].created_at));
    statisticsStart.setFullYear(oldestSale.getFullYear(), oldestSale.getMonth(), 1);
  }
  const statisticsSales = statisticsPeriod === 'Tutti'
    ? data?.sales ?? []
    : data?.sales.filter((sale) => new Date(sale.created_at) >= statisticsStart) ?? [];
  const soldCost = statisticsSales.reduce((sum, sale) => sum + sale.items.reduce((subtotal, item) => subtotal + item.quantity * item.purchase_price, 0), 0);
  const soldTotal = statisticsSales.reduce((sum, sale) => sum + sale.total, 0);
  const soldUnits = statisticsSales.reduce((sum, sale) => sum + sale.item_count, 0);
  const totalTrackedUnits = soldUnits + (data?.products.reduce((sum, product) => sum + product.stock, 0) ?? 0);
  const unsoldProducts = data?.products.filter((product) => product.stock > 0) ?? [];
  const stockCost = data?.products.reduce((sum, item) => sum + item.stock * item.purchase_price, 0) ?? 0;
  const stockRetail = data?.products.reduce((sum, item) => sum + item.stock * item.sale_price, 0) ?? 0;
  const categoriesSales = statisticsSales.flatMap((sale) => sale.items).reduce<Record<string, number>>((totals, item) => { const cat = data?.products.find((product) => product.id === item.product_id)?.category ?? 'Altro'; totals[cat] = (totals[cat] ?? 0) + item.quantity * item.unit_price; return totals; }, {});
  const paymentTotals = statisticsSales.reduce<Record<string, number>>((totals, sale) => { totals[sale.payment_method] = (totals[sale.payment_method] ?? 0) + sale.total; return totals; }, {});
  const currentMonth = new Date();
  const monthsBetween = (currentMonth.getFullYear() - statisticsStart.getFullYear()) * 12 + currentMonth.getMonth() - statisticsStart.getMonth();
  const monthlySales = Array.from({ length: monthsBetween + 1 }, (_, index) => {
    const month = new Date(statisticsStart.getFullYear(), statisticsStart.getMonth() + index, 1);
    const monthSales = statisticsSales.filter((sale) => {
      const date = new Date(sale.created_at);
      return date.getFullYear() === month.getFullYear() && date.getMonth() === month.getMonth();
    });
    return { mese: month.toLocaleDateString('it-IT', { month: 'short' }), totale: monthSales.reduce((sum, sale) => sum + sale.total, 0) };
  });
  const chartDays = Array.from({ length: 7 }, (_, index) => { const date = new Date(); date.setHours(0, 0, 0, 0); date.setDate(date.getDate() - 6 + index); const sales = statisticsSales.filter((sale) => new Date(sale.created_at).toDateString() === date.toDateString()); return { giorno: date.toLocaleDateString('it-IT', { weekday: 'short' }), totale: sales.reduce((sum, sale) => sum + sale.total, 0) }; });
  const expiryLimit = new Date();
  expiryLimit.setDate(expiryLimit.getDate() + 10);
  const expiryLimitKey = localDateKey(expiryLimit);
  const expiringProducts = data?.products.filter((product) =>
    product.expiry_enabled && product.expiry_date && product.expiry_date >= todayKey && product.expiry_date <= expiryLimitKey
  ) ?? [];
  const expiredProducts = data?.products.filter((product) =>
    product.expiry_enabled && product.expiry_date && product.expiry_date < todayKey
  ) ?? [];
  const inventoryList = data?.products.filter((item) =>
    (item.name.toLowerCase().includes(inventorySearch.toLowerCase()) || item.code.includes(inventorySearch))
    && (category === 'Tutte' || item.category === category)
    && (inventoryStatus === 'all'
      || (inventoryStatus === 'available' && item.stock > item.low_stock_threshold)
      || (inventoryStatus === 'low' && item.stock > 0 && item.stock <= item.low_stock_threshold)
      || (inventoryStatus === 'out' && item.stock === 0))
  ) ?? [];
  const matchesSalesPeriod = (createdAt: string) => {
    const saleDate = new Date(createdAt);
    const today = new Date();
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    if (salesPeriod === 'Da - A') {
      const from = salesFrom ? new Date(`${salesFrom}T00:00:00`) : null;
      const to = salesTo ? new Date(`${salesTo}T23:59:59.999`) : null;
      return (!from || saleDate >= from) && (!to || saleDate <= to);
    }
    if (salesPeriod === 'Tutti') return true;
    if (salesPeriod === 'Oggi') return saleDate >= todayStart && saleDate < new Date(todayStart.getTime() + 86400000);
    if (salesPeriod === 'Ieri') return saleDate >= new Date(todayStart.getTime() - 86400000) && saleDate < todayStart;
    const rangeStart = new Date(todayStart);
    if (salesPeriod === 'Ultima settimana') rangeStart.setDate(rangeStart.getDate() - 6);
    if (salesPeriod === 'Ultimo mese' || salesPeriod === 'Ultimi 3 mesi') {
      const daysBack = salesPeriod === 'Ultimo mese' ? 1 : 3;
      const dayOfMonth = rangeStart.getDate();
      rangeStart.setDate(1);
      rangeStart.setMonth(rangeStart.getMonth() - daysBack);
      rangeStart.setDate(Math.min(dayOfMonth, new Date(rangeStart.getFullYear(), rangeStart.getMonth() + 1, 0).getDate()));
    }
    return saleDate >= rangeStart;
  };
  const salesList = data?.sales.filter((sale) =>
  sale.receipt_no.includes(saleSearch)
    && (salesCategory === 'Tutte' || sale.items.some((item) => data.products.some((product) => product.id === item.product_id && product.category === salesCategory)))
    && matchesSalesPeriod(sale.created_at)
  ) ?? [];
  const matchesInventoryHistoryPeriod = (createdAt: string) => {
    const movementDate = new Date(createdAt);
    const today = new Date();
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    if (inventoryHistoryPeriod === 'Da - A') {
      const from = inventoryHistoryFrom ? new Date(`${inventoryHistoryFrom}T00:00:00`) : null;
      const to = inventoryHistoryTo ? new Date(`${inventoryHistoryTo}T23:59:59.999`) : null;
      return (!from || movementDate >= from) && (!to || movementDate <= to);
    }
    if (inventoryHistoryPeriod === 'Tutti') return true;
    if (inventoryHistoryPeriod === 'Oggi') return movementDate >= todayStart && movementDate < new Date(todayStart.getTime() + 86400000);
    if (inventoryHistoryPeriod === 'Ieri') return movementDate >= new Date(todayStart.getTime() - 86400000) && movementDate < todayStart;
    const rangeStart = new Date(todayStart);
    if (inventoryHistoryPeriod === 'Ultima settimana') rangeStart.setDate(rangeStart.getDate() - 6);
    else if (inventoryHistoryPeriod === 'Ultimo mese') rangeStart.setMonth(rangeStart.getMonth() - 1);
    return movementDate >= rangeStart;
  };
  const inventoryHistoryMovements = data?.stockMovements.filter((movement) =>
    matchesInventoryHistoryPeriod(movement.created_at)
    && [movement.product_name, movement.person, movement.note].some((value) => value.toLowerCase().includes(inventoryHistorySearch.toLowerCase()))
  ) ?? [];
  const sectionLabel = section === 'inventory-history' ? 'Storico Magazzino'
    : section === 'stock-movement' ? 'Carica e scarica (Merce)'
      : section === 'extras' ? 'Gestione Extra'
      : nav.find((item) => item.section === section)?.label ?? 'Impostazioni';
  const printReceipt = () => {
    if (data?.settings.receipt_printer) {
      void window.gestionale.printReceipt().catch((error: unknown) => notify(errorText(error)));
    } else window.print();
  };
  const scanCameraCode = (code: string) => {
    setCamera(false);
    if (section === 'cash') scanCode(code);
    else if (section === 'sale-management') {
      const receiptNumber = code.replace(/\D/g, '');
      setSaleLookup(receiptNumber);
      const sale = data?.sales.find((item) => item.receipt_no === receiptNumber);
      if (sale) openSaleForEditing(sale);
      else notify('Scontrino non trovato');
    } else setSaleSearch(code.replace(/\D/g, ''));
  };
  const calendarDays = () => { const year = calendarMonth.getFullYear(); const month = calendarMonth.getMonth(); const offset = (new Date(year, month, 1).getDay() + 6) % 7; return [...Array(offset).fill(null), ...Array.from({ length: new Date(year, month + 1, 0).getDate() }, (_, i) => i + 1)]; };
  const resetPromotionForm = () => {
    setPromotion(blankPromotion());
    setPromotionDuration('1 giorno');
    setPromotionMinimum('none');
    setPromotionDiscountType('percentage');
  };
  const changePromotionDiscountType = (value: string) => {
    const type = value as PromotionDiscountType;
    setPromotionDiscountType(type);
    if (type === 'percentage') setPromotion((current) => ({ ...current, discount_type: 'percentage' }));
    else setPromotion((current) => ({
      ...current,
      discount_type: 'buy_get',
      buy_quantity: type === '2+1' ? 2 : type === '3+1' ? 3 : current.buy_quantity,
      free_quantity: type === 'custom' ? current.free_quantity : 1,
    }));
  };
  const promotionDiscountLabel = (offer: Promotion) => offer.discount_type === 'percentage'
    ? `${offer.percentage}%`
    : `${offer.buy_quantity}+${offer.free_quantity}`;
  const createUnsoldListPdf = () => {
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text(data?.settings.shop_name ?? 'Gestione Supermercato', 14, 17);
    doc.setFontSize(11);
    doc.text('Articoli ancora in magazzino', 14, 25);
    autoTable(doc, {
      startY: 32,
      head: [['Articolo', 'Categoria', 'Quantità non venduta', 'Prezzo vendita']],
      body: unsoldProducts.map((product) => [product.name, product.category, `${product.stock} ${product.unit ?? 'PEZZO'}`, money.format(product.sale_price)]),
      styles: { fontSize: 9 },
      headStyles: { fillColor: [56, 104, 78] },
    });
    return doc;
  };
  const shareUnsoldList = async () => {
    try {
      const doc = createUnsoldListPdf();
      const file = new File([doc.output('blob')], `articoli-magazzino-${todayKey}.pdf`, { type: 'application/pdf' });
      if (!navigator.share || !navigator.canShare?.({ files: [file] })) {
        doc.save(file.name);
        notify('La condivisione non è supportata qui: ho scaricato la lista in PDF.');
        return;
      }
      await navigator.share({ files: [file], title: 'Articoli ancora in magazzino' });
      notify('Lista PDF condivisa.');
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      notify(errorText(error));
    }
  };

  if (locked) return <div className="lock-screen"><div className="lock-panel"><div className="brand-mark"><Store size={23} /></div><p className="eyebrow">ACCESSO AL GESTIONALE</p><h1>{data?.settings.shop_name ?? 'Il tuo supermercato'}</h1><p className="muted">Inserisci il PIN per continuare</p><form onSubmit={unlock}><Field label="PIN di sicurezza" type="password" value={pin} onChange={(e) => setPin(e.target.value)} autoFocus /><button className="button button-primary full-width"><LockKeyhole size={16} /> Accedi</button></form></div>{notice && <div className="toast">{notice}</div>}</div>;
  if (!data) return <div className="loading-screen"><span className="loader" />Caricamento archivio…</div>;

  return <div className="app-shell">
    <aside className="sidebar"><div className="brand"><div className={`brand-mark${data.settings.shop_logo ? ' has-logo' : ''}`}>{data.settings.shop_logo ? <img src={data.settings.shop_logo} alt="Logo negozio" /> : <Store size={20} />}</div><div><strong>{data.settings.shop_name}</strong><small>GESTIONE NEGOZIO</small></div></div><div className="nav-label">OPERATIVITÀ</div><nav>{nav.map(({ section: target, label, icon: Icon }, index) => <Fragment key={target}>{index === 5 && <div className="nav-label">Servizio Clienti</div>}{target === 'inventory' ? <><button className={`nav-item${section.startsWith('inventory') || section === 'stock-movement' ? ' active' : ''}`} aria-expanded={inventoryMenuOpen} onClick={() => setInventoryMenuOpen((open) => !open)}><Icon size={18} /><span>{label}</span><ChevronDown className={`nav-chevron${inventoryMenuOpen ? ' open' : ''}`} size={15} /></button>{inventoryMenuOpen && <div className="nav-submenu"><button className={`nav-subitem${section === 'inventory' ? ' active' : ''}`} onClick={() => setSection('inventory')}>Magazzino</button><button className={`nav-subitem${section === 'inventory-history' ? ' active' : ''}`} onClick={() => setSection('inventory-history')}>Storico Magazzino</button><button className={`nav-subitem${section === 'stock-movement' ? ' active' : ''}`} onClick={() => { setStockMovementProduct(String(data.products[0]?.id ?? '')); setSection('stock-movement'); }}>Carica e scarica (Merce)</button></div>}</> : target === 'promotions' ? <><button className={`nav-item${section === 'promotions' ? ' active' : ''}`} aria-expanded={offerMenuOpen} onClick={() => setOfferMenuOpen((open) => !open)}><Icon size={18} /><span>{label}</span><ChevronDown className={`nav-chevron${offerMenuOpen ? ' open' : ''}`} size={15} /></button>{offerMenuOpen && <div className="nav-submenu"><button className={`nav-subitem${section === 'promotions' ? ' active' : ''}`} onClick={() => setSection('promotions')}>Crea offerta</button><button className="nav-subitem" onClick={() => notify('La gestione dei buoni sconto non è ancora disponibile.')}>Crea buoni sconto</button><button className="nav-subitem" onClick={() => notify('La gestione dei buoni sconto non è ancora disponibile.')}>Lista buoni sconto</button></div>}</> : <button className={`nav-item${section === target ? ' active' : ''}`} onClick={() => { setInventoryMenuOpen(false); setOfferMenuOpen(false); if (target === 'extras') setExtraTab(null); setSection(target); }}><Icon size={18} /><span>{label}</span>{target === 'cash' && <kbd>F2</kbd>}</button>}</Fragment>)}</nav><div className="sidebar-bottom"><button className={`nav-item settings-link${section === 'settings' ? ' active' : ''}`} onClick={() => { setInventoryMenuOpen(false); setOfferMenuOpen(false); setSettingsTab(null); setSection('settings'); }}><Settings size={18} /><span>Impostazioni</span></button><div className="user-card"><div className="user-avatar">{data.settings.shop_name.slice(0, 1).toUpperCase()}</div><div><strong>Gestore</strong><small>Account locale</small></div></div></div></aside>
    <main className="main-content"><header className="topbar"><h1>{sectionLabel}</h1>{data.settings.shop_logo ? <img className="topbar-logo" src={data.settings.shop_logo} alt="Logo negozio" /> : <div className="topbar-logo-fallback"><Store size={19} /></div>}<div className="topbar-right"><div className="today-date">{new Intl.DateTimeFormat('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date())}</div><span className="store-chip"><span className="status-dot" />Operativo</span></div></header>

      {section === 'home' && <div className="page-content home-page"><div className="metric-grid"><Metric icon={Banknote} label="Vendite di oggi" value={money.format(dailyGross)} detail={`${todaySales.length} scontrini emessi`} /><Metric icon={TrendingUp} label="Netto vendite" value={money.format(dailyTotal)} detail="Incasso al netto degli sconti" /><Metric icon={Package} label="Articoli venduti" value={dailyUnits.toLocaleString('it-IT')} detail="Pezzi registrati oggi" /></div><section className="expiry-alert expiry-home-alert"><div className="expiry-alert-heading"><CircleAlert size={18} /><div><strong>Avviso date di scadenza</strong><span>{expiringProducts.length ? `${expiringProducts.length} ${expiringProducts.length === 1 ? 'articolo' : 'articoli'} in scadenza entro 10 giorni` : 'Nessun articolo in scadenza nei prossimi 10 giorni'}</span></div></div>{expiringProducts.length > 0 && <div className="expiry-list">{expiringProducts.map((product) => <button key={product.id} onClick={() => setSelectedProduct(product)}><span>{product.name}</span><strong>{receiptDate.format(new Date(`${product.expiry_date}T00:00:00`))}</strong></button>)}</div>}</section><section className="content-section reorder-section"><SectionHeading icon={CircleAlert} title="Da riordinare" detail={`${data.products.filter((p) => p.stock <= p.low_stock_threshold).length} articoli sotto soglia`} action={<button className="text-button" onClick={() => { setInventorySearch(''); setCategory('Tutte'); setInventoryStatus('low'); setSection('inventory'); setInventoryMenuOpen(false); }}>Vai al magazzino →</button>} /><Table headings={['Articolo', 'Codice', 'Categoria', 'Disponibili', 'Soglia', 'Stato']}><>{data.products.filter((p) => p.stock <= p.low_stock_threshold).slice(0, 5).map((p) => <tr key={p.id} onClick={() => setSelectedProduct(p)}><td className="cell-primary">{p.name}</td><td className="mono">{p.code}</td><td>{p.category}</td><td>{p.stock}</td><td>{p.low_stock_threshold}</td><td><span className="stock-badge low">Riordinare</span></td></tr>)}</></Table></section><section className="content-section"><SectionHeading icon={ClipboardList} title="Ultime vendite" detail="Transazioni più recenti" action={<button className="text-button" onClick={() => setSection('sales')}>Tutte le vendite →</button>} /><SalesTable sales={data.sales.slice(0, 5)} onSelect={setReceipt} /></section></div>}

      {section === 'inventory' && <div className="page-content">
        <div className="page-toolbar inventory-toolbar"><div><h2>Articoli in magazzino</h2><p>{data.products.length} articoli registrati</p></div><div className="toolbar-actions"><button className="button button-outline" onClick={exportInventoryReport}><ArrowDownToLine size={16} /> Scarica report</button><button className="button button-primary" onClick={() => setProductForm({ ...blankProduct })}><Plus size={16} /> Aggiungi nuovo articolo</button></div></div>
        <div className="filter-row"><SearchInput value={inventorySearch} onChange={setInventorySearch} placeholder="Cerca per nome o codice…" /><label className="select-wrap"><span>Categoria</span><select value={category} onChange={(e) => setCategory(e.target.value)}><option>Tutte</option>{categories.map((item) => <option key={item}>{item}</option>)}</select><ChevronDown size={14} /></label><details className="inventory-filter-dropdown"><summary className="select-wrap"><span>Disponibilità: {inventoryFilters.find((item) => item.value === inventoryStatus)?.label}</span><ChevronDown size={14} /></summary><div className="inventory-status-filters" role="group" aria-label="Filtra prodotti per disponibilità">{inventoryFilters.map(({ value, label }) => <button key={value} className={`status-filter${inventoryStatus === value ? ' active' : ''}`} aria-pressed={inventoryStatus === value} onClick={(event) => { setInventoryStatus(value); event.currentTarget.closest('details')?.removeAttribute('open'); }}>{label}</button>)}</div></details></div>
        <div className="expiry-panels">
          <section className="expiry-alert"><div className="expiry-alert-heading"><CircleAlert size={18} /><div><strong>Avviso date di scadenza</strong><span>{expiringProducts.length ? `${expiringProducts.length} ${expiringProducts.length === 1 ? 'articolo' : 'articoli'} in scadenza entro 10 giorni` : 'Nessun articolo in scadenza nei prossimi 10 giorni'}</span></div></div>{expiringProducts.length > 0 && <div className="expiry-list">{expiringProducts.map((product) => <button key={product.id} onClick={() => setSelectedProduct(product)}><span>{product.name}</span><strong>{receiptDate.format(new Date(`${product.expiry_date}T00:00:00`))}</strong></button>)}</div>}</section>
          <section className="expiry-alert expired-alert"><div className="expiry-alert-heading"><CircleAlert size={18} /><div><strong>Prodotti scaduti</strong><span>{expiredProducts.length ? `${expiredProducts.length} ${expiredProducts.length === 1 ? 'articolo scaduto' : 'articoli scaduti'}` : 'Nessun prodotto scaduto'}</span></div></div>{expiredProducts.length > 0 && <div className="expiry-list">{expiredProducts.map((product) => <button key={product.id} onClick={() => setSelectedProduct(product)}><span>{product.name}</span><strong>{receiptDate.format(new Date(`${product.expiry_date}T00:00:00`))}</strong></button>)}</div>}</section>
        </div>
        <div className="product-grid">{inventoryList.map((product) => <button className="product-tile" key={product.id} onClick={() => setSelectedProduct(product)}><div className="tile-icon"><Package size={20} /></div><span className="tile-category">{product.category}</span><strong>{product.name}</strong><span className="tile-price">{money.format(product.sale_price)}</span><span className={`tile-stock${product.stock <= product.low_stock_threshold ? ' text-low' : ''}`}>{quantityFormat.format(product.stock)} disponibili</span></button>)}</div>{inventoryList.length === 0 && <Empty icon={Package} title="Nessun articolo trovato" detail="Modifica la ricerca o aggiungi un articolo." />}
      </div>}

      {section === 'inventory-history' && <div className="page-content"><div id="inventory-history-print">
        <div className="inventory-history-actions no-print"><SelectField label="Periodo" value={inventoryHistoryPeriod} onChange={setInventoryHistoryPeriod} options={['Tutti', 'Oggi', 'Ieri', 'Ultima settimana', 'Ultimo mese', 'Da - A']} />{inventoryHistoryPeriod === 'Da - A' && <><Field label="Da" type="date" value={inventoryHistoryFrom} onChange={(event) => setInventoryHistoryFrom(event.target.value)} /><Field label="A" type="date" value={inventoryHistoryTo} onChange={(event) => setInventoryHistoryTo(event.target.value)} /></>}<SearchInput value={inventoryHistorySearch} onChange={setInventoryHistorySearch} placeholder="Cerca articolo, persona o nota…" /><button className="button button-outline" onClick={() => window.print()}><Printer size={16} /> Stampa</button></div>
        <Table headings={['Data e ora', 'Articolo', 'Movimento', 'Quantità', 'Persona', 'Nota']}><>{inventoryHistoryMovements.map((movement) => <tr key={movement.id}><td>{dateTime.format(new Date(movement.created_at))}</td><td className="cell-primary">{movement.product_name}</td><td><span className={`movement-badge ${movement.movement_type === 'Carico' ? 'movement-in' : 'movement-out'}`}>{movement.movement_type}</span></td><td>{quantityFormat.format(movement.quantity)}</td><td>{movement.person || '—'}</td><td>{movement.note || '—'}</td></tr>)}</>{!inventoryHistoryMovements.length && <tr><td colSpan={6} className="empty-cell">Nessun movimento nel periodo selezionato.</td></tr>}</Table></div></div>}

      {section === 'stock-movement' && <div className="page-content settings-page"><section className="settings-panel"><div className="settings-title"><h2>Carica e scarica merce</h2><p>Registra un movimento e aggiorna automaticamente la giacenza.</p></div><form className="settings-form movement-form" onSubmit={(event) => void saveStockMovement(event)}><SelectField label="Tipo di movimento" value={stockMovementType} onChange={(value) => { const type = value === 'Scarico' ? 'Scarico' : 'Carico'; setStockMovementType(type); if (type === 'Carico') setStockMovementPerson(''); }} options={['Carico', 'Scarico']} /><SelectField label="Articolo" value={stockMovementProduct} onChange={setStockMovementProduct} options={data.products.map((product) => String(product.id))} labels={data.products.map((product) => `${product.name} · ${product.stock} ${product.unit === 'KG' ? 'kg' : product.unit === 'LITRO' ? 'lit.' : 'pz'} disponibili`)} /><Field label={`Quantità${selectedMovementProduct?.unit === 'KG' ? ' (kg)' : selectedMovementProduct?.unit === 'LITRO' ? ' (litri)' : ''}`} type="number" min={selectedMovementProduct?.unit === 'PEZZO' ? '1' : '0.001'} step={selectedMovementProduct?.unit === 'PEZZO' ? '1' : '0.001'} value={stockMovementQuantity} onChange={(event) => setStockMovementQuantity(event.target.value)} required />{stockMovementType === 'Scarico' && <Field label="Persona che prende la merce" value={stockMovementPerson} onChange={(event) => setStockMovementPerson(event.target.value)} required />}<Field label="Nota (facoltativa)" value={stockMovementNote} onChange={(event) => setStockMovementNote(event.target.value)} /><button className="button button-primary" disabled={!data.products.length}><Check size={16} /> Registra {stockMovementType.toLowerCase()}</button></form></section></div>}

      {section === 'cash' && <div className="page-content cash-content"><div className="cash-layout">
        <section className="cash-products">
          <div className="cash-search-row"><label className="search-field"><Barcode size={17} /><input id="scanner-field" placeholder="Cerca o scansiona un codice a barre…" value={scannerSearch} onChange={(e) => setScannerSearch(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); scanCode(scannerSearch); } }} /></label><button className="icon-button camera-button" title="Scansiona con fotocamera" onClick={() => setCamera(true)}><Camera size={18} /></button></div>
          <div className="cash-product-grid">{data.products.filter((p) => (p.name.toLowerCase().includes(scannerSearch.toLowerCase()) || p.code.includes(scannerSearch)) && p.stock > 0).map((product) => { const remainingStock = Math.max(0, product.stock - (cart.find((item) => item.product_id === product.id)?.quantity ?? 0)); return <button className="cash-product" key={product.id} disabled={remainingStock === 0} onClick={() => addProductToCart(product)}><span className="tile-category">{product.category}</span><strong>{product.name}</strong><span className="cash-product-bottom"><b>{money.format(product.sale_price)}{product.unit === 'KG' ? ' / kg' : product.unit === 'LITRO' ? ' / lit.' : ''}</b><small>{quantityFormat.format(remainingStock)} {product.unit === 'KG' ? 'kg' : product.unit === 'LITRO' ? 'lit.' : 'pz'}</small></span></button>; })}</div>
        </section>
        <aside className="cart-panel"><div className="cart-heading"><div className="cart-heading-title"><h2>CARRELLO <span>{quantityFormat.format(cart.reduce((sum, item) => sum + item.quantity, 0))}</span></h2></div></div><div className="cart-lines">{cart.map((item) => <div className="cart-line" key={item.product_id}><div className="cart-line-name"><strong>{item.name}</strong><small>{quantityFormat.format(item.quantity)} {item.unit === 'KG' ? 'kg' : item.unit === 'LITRO' ? 'L' : 'pz'}</small></div><div className="quantity-control"><button onClick={() => changeQuantity(item.product_id, -1)} aria-label="Rimuovi uno"><Minus size={13} /></button><span>{quantityFormat.format(item.quantity)}</span><button onClick={() => changeQuantity(item.product_id, 1)} aria-label="Aggiungi uno"><Plus size={13} /></button></div><strong className="line-total">{money.format(item.quantity * item.unit_price)}</strong></div>)}{!cart.length && <div className="cart-empty"><ShoppingBasket size={25} /><span>Seleziona gli articoli<br />per iniziare una vendita</span></div>}</div><div className="receipt-summary"><div><span>Subtotale</span><span>{money.format(subtotal)}</span></div><div className="total-row"><strong>TOTALE</strong><strong>{money.format(subtotal)}</strong></div></div><button className="button button-primary checkout-button" disabled={!cart.length} onClick={() => setCheckoutOpen(true)}>Procedi al pagamento <span>→</span></button></aside>
      </div></div>}

      {section === 'sales' && <div className="page-content"><div className="sale-tools"><button className="button button-outline sale-camera-button" onClick={() => setCamera(true)}><Camera size={16} /> Cerca con fotocamera</button><SearchInput value={saleSearch} onChange={setSaleSearch} placeholder="Cerca numero scontrino…" numericOnly /><button className="button button-outline" onClick={exportReport}><ArrowDownToLine size={16} /> Scarica report</button><button className="button button-outline" onClick={exportSalesCsv}><ArrowDownToLine size={16} /> Esporta CSV</button></div><div className="sale-filters"><SelectField label="Periodo" value={salesPeriod} onChange={setSalesPeriod} options={['Tutti', 'Oggi', 'Ieri', 'Ultima settimana', 'Ultimo mese', 'Ultimi 3 mesi', 'Da - A']} />{salesPeriod === 'Da - A' && <><Field label="Da" type="date" value={salesFrom} onChange={(event) => setSalesFrom(event.target.value)} /><Field label="A" type="date" value={salesTo} onChange={(event) => setSalesTo(event.target.value)} /></>}<SelectField label="Categoria" value={salesCategory} onChange={setSalesCategory} options={['Tutte', ...categories]} /></div><SalesTable sales={salesList} onSelect={setReceipt} /></div>}

      {section === 'sale-management' && <div className="page-content settings-page"><section className="settings-panel"><div className="settings-title"><h2>Modifica o elimina una vendita</h2><p>Inserisci il numero a 5 cifre oppure leggilo con il lettore barcode.</p></div><div className="lookup-panel"><button className="button button-outline" onClick={() => setCamera(true)}><Camera size={16} /> Scansiona con fotocamera</button><Field label="Numero scontrino" type="text" inputMode="numeric" pattern="[0-9]*" maxLength={5} value={saleLookup} onChange={(e) => setSaleLookup(e.target.value.replace(/\D/g, ''))} onKeyDown={(e) => { if (e.key === 'Enter') findSale(); }} placeholder="Numero scontrino" /><button className="button button-primary" onClick={findSale}><Search size={16} /> Cerca scontrino</button></div></section></div>}

      {section === 'promotions' && <div className="page-content settings-page"><section className="settings-panel">
        <div className="settings-title"><h2>Promozioni</h2><p>Crea offerte con periodo, categoria e condizioni di spesa.</p></div>
        <form className="form-grid promotion-form" onSubmit={savePromotion}>
          <Field label="Nome offerta" value={promotion.name} onChange={(e) => setPromotion({ ...promotion, name: e.target.value })} required />
          <SelectField label="Sconto" value={promotionDiscountType} onChange={changePromotionDiscountType} options={['percentage', '2+1', '3+1', 'custom']} labels={['Percentuale %', '2+1', '3+1', 'Crea forma']} />
          {promotionDiscountType === 'percentage' && <Field label="Percentuale di sconto (%)" type="number" min="1" max="100" value={promotion.percentage} onChange={(e) => setPromotion({ ...promotion, percentage: Number(e.target.value) })} required />}
          {promotionDiscountType === 'custom' && <div className="promotion-bundle-fields"><Field label="Articoli da acquistare" type="number" min="1" step="1" value={promotion.buy_quantity} onChange={(e) => setPromotion({ ...promotion, buy_quantity: Number(e.target.value) })} required /><Field label="Articoli in omaggio" type="number" min="1" step="1" value={promotion.free_quantity} onChange={(e) => setPromotion({ ...promotion, free_quantity: Number(e.target.value) })} required /></div>}
          <SelectField label="Categoria" value={promotion.category} onChange={(value) => setPromotion({ ...promotion, category: value })} options={['Tutte', ...categories]} />
          <SelectField label="Applicazione" value={promotion.application_mode} onChange={(value) => setPromotion({ ...promotion, application_mode: value as Promotion['application_mode'] })} options={['Automatica', 'Manuale']} />
          <SelectField label="Durata offerta" value={promotionDuration} onChange={changePromotionDuration} options={promotionDurations} />
          {promotionDuration === 'Personalizzata' && <><Field label="Dal" type="date" value={promotion.starts_at} onChange={(e) => changePromotionStart(e.target.value)} required /><Field label="Al" type="date" value={promotion.ends_at} onChange={(e) => setPromotion({ ...promotion, ends_at: e.target.value })} required /></>}
          <fieldset className="promotion-minimum-options"><legend>Requisito minimo</legend>
            {([{ value: 'none', label: 'Nessuno' }, { value: 'spend', label: 'Spesa minima' }, { value: 'kilograms', label: 'KG minimi' }, { value: 'pieces', label: 'Pezzi minimi' }, { value: 'liters', label: 'Litri minimi' }] as const).map(({ value, label }) => <label key={value}><input type="radio" name="promotion-minimum" checked={promotionMinimum === value} onChange={() => setPromotionMinimum(value)} /><span>{label}</span></label>)}
          </fieldset>
          {promotionMinimum === 'spend' && <Field label="Spesa minima (€)" type="number" min="0.01" step="0.01" value={promotion.minimum_spend || ''} onChange={(e) => setPromotion({ ...promotion, minimum_spend: Number(e.target.value) })} required />}
          {promotionMinimum === 'kilograms' && <Field label="KG minimi" type="number" min="0.1" step="0.1" value={promotion.minimum_kilograms || ''} onChange={(e) => setPromotion({ ...promotion, minimum_kilograms: Number(e.target.value) })} required />}
          {promotionMinimum === 'pieces' && <Field label="Pezzi minimi" type="number" min="1" step="1" value={promotion.minimum_pieces || ''} onChange={(e) => setPromotion({ ...promotion, minimum_pieces: Number(e.target.value) })} required />}
          {promotionMinimum === 'liters' && <Field label="Litri minimi" type="number" min="0.1" step="0.1" value={promotion.minimum_liters || ''} onChange={(e) => setPromotion({ ...promotion, minimum_liters: Number(e.target.value) })} required />}
          <div className="form-actions">{promotion.id !== undefined && <button className="button button-quiet" type="button" onClick={resetPromotionForm}>Annulla modifica</button>}<button className="button button-primary"><Check size={16} /> {promotion.id === undefined ? 'Crea promozione' : 'Salva modifiche'}</button></div>
        </form>
        <div className="promotion-list">{data.promotions.map((item) => <div className="promotion-row" key={item.id}>
          <div><strong>{item.name}</strong><span>{item.category} · {item.starts_at} — {item.ends_at === permanentPromotionEnd ? 'Sempre' : item.ends_at}{item.minimum_spend > 0 ? ` · Spesa minima ${money.format(item.minimum_spend)}` : ''}{item.minimum_kilograms ? ` · ${item.minimum_kilograms} KG minimi` : ''}{item.minimum_pieces ? ` · ${item.minimum_pieces} pezzi minimi` : ''}{item.minimum_liters ? ` · ${item.minimum_liters} litri minimi` : ''}</span></div>
          <b>{promotionDiscountLabel(item)}</b><span className="stock-badge">{item.application_mode}</span>
          <div className="promotion-actions">
            <button className="button button-outline" onClick={() => { setPromotion({ ...item }); setPromotionDiscountType(item.discount_type !== 'buy_get' ? 'percentage' : item.buy_quantity === 2 && item.free_quantity === 1 ? '2+1' : item.buy_quantity === 3 && item.free_quantity === 1 ? '3+1' : 'custom'); setPromotionDuration(item.ends_at === permanentPromotionEnd ? 'Sempre' : 'Personalizzata'); setPromotionMinimum(item.minimum_spend > 0 ? 'spend' : item.minimum_kilograms ? 'kilograms' : item.minimum_pieces ? 'pieces' : item.minimum_liters ? 'liters' : 'none'); }}><Pencil size={14} /> Modifica</button>
            <button className="button button-danger" onClick={() => void deletePromotion(item)}><Trash2 size={14} /> Elimina</button>
          </div>
        </div>)}</div>
      </section></div>}

      {section === 'extras' && <div className="page-content settings-page"><div className="settings-layout">{extraTab === null ? <nav className="settings-nav">{[{ name: 'Contabilità e Finanzia', icon: Banknote }, { name: 'Fornitori e Ordini', icon: Package }, { name: 'Dipendenti', icon: ClipboardList }, { name: 'Clienti', icon: ShoppingBasket }].map(({ name, icon: Icon }) => <button key={name} onClick={() => setExtraTab(name)}><Icon size={17} />{name}</button>)}</nav> : <section className="settings-panel"><button className="settings-back" onClick={() => setExtraTab(null)}><ArrowLeft size={15} /> Gestione Extra</button><div className="settings-title"><h2>{extraTab}</h2><p>Area di gestione {extraTab.toLowerCase()}.</p></div><p className="muted">Sezione in preparazione.</p></section>}</div></div>}

      {section === 'statistics' && <div className="page-content">
        <div className="page-toolbar"><div><h2>Rendimento e andamento</h2></div><span className="period-chip">Dati aggiornati in tempo reale</span></div>
        <div className="statistics-periods" role="group" aria-label="Filtra statistiche per periodo">{statisticsPeriods.map((period) => <button key={period} className={`status-filter${statisticsPeriod === period ? ' active' : ''}`} aria-pressed={statisticsPeriod === period} onClick={() => setStatisticsPeriod(period)}>{period}</button>)}</div>
        <div className="metric-grid stats-metrics"><Metric icon={Banknote} label="Vendite" value={money.format(soldTotal)} detail="Incassi registrati nel periodo" /><Metric icon={CreditCard} label="Acquisto merce venduta" value={money.format(soldCost)} detail="Costo degli articoli venduti" /><Metric icon={TrendingUp} label="Netto stimato" value={money.format(soldTotal - soldCost)} detail="Ricavi meno costo del venduto" /><Metric icon={ShoppingBasket} label="Quantità vendite" value={`${soldUnits.toLocaleString('it-IT')} di ${totalTrackedUnits.toLocaleString('it-IT')}`} detail="Articoli venduti rispetto a quelli ancora in magazzino" action={<button className="text-button metric-action" onClick={() => setUnsoldListOpen(true)}>Vedi lista</button>} /></div>
        <div className="metric-grid inventory-values"><Metric icon={Package} label="Valore vendita in magazzino" value={money.format(stockRetail)} detail="Valore al prezzo di vendita" compact /><Metric icon={Archive} label="Valore acquisto in magazzino" value={money.format(stockCost)} detail="Costo delle scorte attuali" compact /><Metric icon={TrendingUp} label="Netto potenziale" value={money.format(stockRetail - stockCost)} detail="Margine potenziale delle scorte" compact /></div>
        <div className="analytics-grid"><section className="panel calendar-panel"><div className="panel-heading"><div><h3>Calendario vendite</h3><p>Incasso per giorno</p></div><div className="month-controls"><button className="icon-button small" onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1))}>‹</button><strong>{calendarMonth.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })}</strong><button className="icon-button small" onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1))}>›</button></div></div><div className="calendar-grid">{['L', 'M', 'M', 'G', 'V', 'S', 'D'].map((day, index) => <span className="calendar-weekday" key={`${day}${index}`}>{day}</span>)}{calendarDays().map((day, index) => { const date = day ? new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), day) : null; const revenue = date ? statisticsSales.filter((sale) => new Date(sale.created_at).toDateString() === date.toDateString()).reduce((sum, sale) => sum + sale.total, 0) : 0; return <div key={index} className={`calendar-day${revenue ? ' has-sales' : ''}${date?.toDateString() === new Date().toDateString() ? ' today' : ''}`}>{day && <><span>{day}</span>{revenue > 0 && <small>{money.format(revenue)}</small>}</>}</div>; })}</div></section><section className="panel chart-panel"><div className="panel-heading"><div><h3>Vendite giornaliere</h3><p>Ultimi sette giorni nel periodo selezionato</p></div></div><ResponsiveContainer width="100%" height={242}><BarChart data={chartDays} margin={{ top: 14, right: 8, left: -15, bottom: 0 }}><CartesianGrid stroke="#e9ece8" vertical={false} /><XAxis dataKey="giorno" axisLine={false} tickLine={false} tick={{ fill: '#858b85', fontSize: 11 }} /><YAxis axisLine={false} tickLine={false} tick={{ fill: '#858b85', fontSize: 10 }} tickFormatter={(value) => `${value}€`} /><Tooltip formatter={(value) => money.format(Number(value))} /><Bar dataKey="totale" fill="#38684e" radius={[4, 4, 0, 0]} maxBarSize={34} /></BarChart></ResponsiveContainer></section></div>
        <div className="analytics-grid statistics-extra"><section className="panel chart-panel"><div className="panel-heading"><div><h3>Andamento mensile</h3><p>Incasso per mese nel periodo selezionato</p></div></div><ResponsiveContainer width="100%" height={242}><LineChart data={monthlySales} margin={{ top: 14, right: 12, left: -15, bottom: 0 }}><CartesianGrid stroke="#e9ece8" vertical={false} /><XAxis dataKey="mese" axisLine={false} tickLine={false} tick={{ fill: '#858b85', fontSize: 11 }} /><YAxis axisLine={false} tickLine={false} tick={{ fill: '#858b85', fontSize: 10 }} tickFormatter={(value) => `${value}€`} /><Tooltip formatter={(value) => money.format(Number(value))} /><Line type="monotone" dataKey="totale" stroke="#38684e" strokeWidth={3} dot={{ fill: '#38684e', r: 4 }} /></LineChart></ResponsiveContainer></section><section className="panel payment-panel"><div className="panel-heading"><div><h3>Pagamenti per metodo</h3><p>Totale incassato nel periodo</p></div></div><div className="payment-totals">{Object.entries(paymentTotals).length ? Object.entries(paymentTotals).map(([method, amount], index) => <div key={method}><span className="payment-dot" style={{ backgroundColor: colors[index % colors.length] }} /><span>{method}</span><strong>{money.format(amount)}</strong></div>) : <span className="muted">Nessun pagamento nel periodo selezionato.</span>}</div></section></div>
        <section className="panel category-panel"><div className="panel-heading"><div><h3>Vendite per categoria</h3><p>Valore degli articoli venduti nel periodo selezionato</p></div></div><div className="category-chart"><ResponsiveContainer width="100%" height={230}><PieChart><Pie data={Object.entries(categoriesSales).map(([name, value]) => ({ name, value }))} dataKey="value" nameKey="name" innerRadius={57} outerRadius={88} paddingAngle={3}>{Object.keys(categoriesSales).map((name, i) => <Cell key={name} fill={colors[i % colors.length]} />)}</Pie><Tooltip formatter={(value) => money.format(Number(value))} /></PieChart></ResponsiveContainer><div className="chart-legend">{Object.entries(categoriesSales).length ? Object.entries(categoriesSales).map(([name, value], i) => <div key={name}><span style={{ backgroundColor: colors[i % colors.length] }} /><span>{name}</span><strong>{money.format(value)}</strong></div>) : <span className="muted">Le categorie appariranno dopo la prima vendita.</span>}</div></div></section>
      </div>}

      {section === 'settings' && <div className="page-content settings-page"><div className="settings-layout">{settingsTab === null ? <nav className="settings-nav">{[{ name: 'Nome negozio', icon: Store }, { name: 'Sicurezza', icon: ShieldCheck }, { name: 'Archivio dati', icon: Archive }, { name: 'Dispositivi', icon: Barcode }].map(({ name, icon: Icon }) => <button key={name} onClick={() => setSettingsTab(name)}><Icon size={17} />{name}</button>)}</nav> : <section className="settings-panel"><button className="settings-back" onClick={() => setSettingsTab(null)}><ArrowLeft size={15} /> Impostazioni</button>
        {settingsTab === 'Nome negozio' && <><div className="settings-title"><h2>Info negozio</h2><p>Nome e logo del negozio per il menu e la barra superiore.</p></div><form className="settings-form" onSubmit={saveStoreName}><Field label="Nome attività" value={shopName} onChange={(e) => setShopName(e.target.value)} required /><div className="receipt-preview"><Store size={17} /><span>{shopName || 'Nome negozio'}</span><small>Anteprima intestazione scontrino</small></div><div className="shop-logo-setting"><span className="field-label">Logo del negozio</span>{data.settings.shop_logo && <img src={data.settings.shop_logo} alt="Logo attuale" />}<button className="button button-outline" type="button" onClick={() => void chooseShopLogo()}><Store size={15} /> {data.settings.shop_logo ? 'Sostituisci logo' : 'Scegli logo'}</button></div><button className="button button-primary"><Check size={16} /> Salva nome</button></form></>}
        {settingsTab === 'Sicurezza' && <><div className="settings-title"><h2>Accesso e sicurezza</h2><p>Proteggi l’apertura del gestionale con un PIN.</p></div><div className="security-status"><div className="security-icon"><ShieldCheck size={20} /></div><div><strong>{hasPin ? 'PIN attivo' : 'Nessun PIN configurato'}</strong><span>{hasPin ? 'Il PIN viene richiesto all’avvio.' : 'Scegli un codice da 4 a 8 cifre.'}</span></div></div><form className="settings-form" onSubmit={async (event) => { event.preventDefault(); try { await window.gestionale.setPin(newPin); setHasPin(true); setNewPin(''); notify('PIN aggiornato'); } catch (error) { notify(errorText(error)); } }}><Field label={hasPin ? 'Nuovo PIN (4–8 cifre)' : 'PIN (4–8 cifre)'} type="password" inputMode="numeric" minLength={4} maxLength={8} pattern="[0-9]{4,8}" value={newPin} onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))} required /><button className="button button-primary"><LockKeyhole size={16} />{hasPin ? 'Aggiorna PIN' : 'Attiva PIN'}</button></form></>}
        {settingsTab === 'Archivio dati' && <><div className="settings-title"><h2>Archivio locale</h2><p>Database SQLite e copie giornaliere dei dati.</p></div><div className="connection-status settings-connection"><span className="status-dot" />Archivio locale attivo</div><div className="database-card"><div className="security-icon"><Archive size={20} /></div><div><strong>Database SQLite</strong><span className="database-path">{data.settings.database_file}</span></div><span className="stock-badge">Attivo</span></div><div className="settings-form"><label className="field"><span>Cartella esportazioni giornaliere</span><div className="folder-input"><input value={archiveFolder} readOnly /><button className="button button-outline" type="button" onClick={() => void chooseFolder()}>Scegli cartella</button></div></label><p className="help-copy">Ogni giorno a mezzanotte vengono aggiornati file TXT e PDF nelle cartelle Magazzino, Cassa, Vendite e Statistiche.</p></div></>}
        {settingsTab === 'Dispositivi' && <><div className="settings-title"><h2>Dispositivi</h2><p>Configura il lettore di codici a barre e la stampante degli scontrini.</p></div><div className="device-setting"><div className="device-heading"><div className="security-icon"><Barcode size={20} /></div><div><strong>Lettore di codici a barre</strong><span>{data.settings.barcode_scanner_detected ? 'Rilevato: è stata acquisita almeno una scansione su questo computer.' : 'In attesa della prima lettura del lettore USB/HID.'}</span></div><button className={`toggle-button${data.settings.barcode_scanner_enabled ? ' enabled' : ''}`} type="button" role="switch" aria-checked={data.settings.barcode_scanner_enabled} onClick={() => void toggleBarcodeScanner()}>{data.settings.barcode_scanner_enabled ? 'Attivo' : 'Disattivo'}</button></div><p className="help-copy">I lettori USB che si comportano come tastiera vengono riconosciuti automaticamente quando inviano un codice. La preferenza resta salvata tra gli avvii.</p></div><div className="device-setting"><div className="settings-title"><h3>Stampante scontrini</h3><p>Le stampanti rilevate dal sistema possono essere collegate in modo permanente.</p></div><div className="device-printer-row"><SelectField label="Stampante collegata" value={data.settings.receipt_printer} onChange={(value) => void saveReceiptPrinter(value)} options={['', ...printers.map((printer) => printer.name)]} labels={['Seleziona stampante', ...printers.map((printer) => printer.displayName || printer.name)]} /><button className="button button-outline" type="button" onClick={() => void window.gestionale.getPrinters().then(setPrinters).catch((error: unknown) => notify(errorText(error)))}><Printer size={15} /> Rileva stampanti</button></div>{!printers.length && <p className="help-copy">Nessuna stampante rilevata. Verifica che sia collegata e installata nel sistema.</p>}{data.settings.receipt_printer && !printers.some((printer) => printer.name === data.settings.receipt_printer) && <p className="help-copy">La stampante salvata non è attualmente disponibile: selezionane una nuova.</p>}</div></>}
      </section>}</div></div>}
    </main>

    {unsoldListOpen && <Modal title="Articoli ancora in magazzino" close={() => setUnsoldListOpen(false)} wide><div id="unsold-list-print"><Table headings={['Articolo', 'Categoria', 'Quantità non venduta', 'Prezzo vendita']}><>{unsoldProducts.map((product) => <tr key={product.id}><td className="cell-primary">{product.name}</td><td>{product.category}</td><td>{product.stock} {product.unit ?? 'PEZZO'}</td><td>{money.format(product.sale_price)}</td></tr>)}</>{!unsoldProducts.length && <tr><td colSpan={4} className="empty-cell">Non risultano articoli rimanenti in magazzino.</td></tr>}</Table></div><div className="unsold-list-actions no-print"><button className="button button-outline" onClick={() => window.print()}><Printer size={16} /> Stampa</button><button className="button button-primary" onClick={() => void shareUnsoldList()}><Share2 size={16} /> Condividi</button></div></Modal>}
    {pendingUnknownCode && <Modal title="Articolo non presente" wide close={() => { setPendingUnknownCode(''); setScannerSearch(''); }}><div className="unknown-code-message"><CircleAlert size={26} /><p>Il codice a barre <strong>{pendingUnknownCode}</strong> non è presente tra gli articoli.</p><span>Puoi aggiungerlo come nuovo articolo: il codice acquisito sarà già inserito nel modulo.</span><div className="form-actions"><button className="button button-quiet" onClick={() => { setPendingUnknownCode(''); setScannerSearch(''); }}>Annulla</button><button className="button button-primary" onClick={() => { setProductForm({ ...blankProduct, code: pendingUnknownCode }); setPendingUnknownCode(''); }}><Plus size={16} /> Aggiungi articolo</button></div></div></Modal>}
    {measuredProduct && <Modal title={measuredProduct.unit === 'KG' ? `Inserisci il peso · ${measuredProduct.name}` : `Inserisci il volume · ${measuredProduct.name}`} close={() => setMeasuredProduct(null)}><form className="form-grid measured-quantity-form" onSubmit={confirmMeasuredQuantity}><p className="measured-price">{money.format(measuredProduct.sale_price)} / {measuredProduct.unit === 'KG' ? 'kg' : 'lit.'}</p><Field label={measuredProduct.unit === 'KG' ? 'Peso in kg' : 'Volume in litri'} type="number" min="0.001" step="0.001" value={measuredQuantity} onChange={(event) => setMeasuredQuantity(event.target.value)} required autoFocus placeholder={measuredProduct.unit === 'KG' ? 'Es. 0,750' : 'Es. 1,500'} /><div className="measured-quantity-options">{(measuredProduct.unit === 'KG' ? [{ label: '50 g', quantity: 0.05 }, { label: '100 g', quantity: 0.1 }, { label: '250 g', quantity: 0.25 }, { label: '500 g', quantity: 0.5 }, { label: '1 kg', quantity: 1 }, { label: '2 kg', quantity: 2 }] : [{ label: '50 ml', quantity: 0.05 }, { label: '100 ml', quantity: 0.1 }, { label: '250 ml', quantity: 0.25 }, { label: '500 ml', quantity: 0.5 }, { label: '1 L', quantity: 1 }, { label: '2 L', quantity: 2 }]).map(({ label, quantity }) => <button className="button button-outline" key={label} type="button" onClick={() => setMeasuredQuantity(String(quantity))}>{label}</button>)}</div><div className="form-actions"><button className="button button-quiet full-width" type="button" onClick={() => setMeasuredProduct(null)}>Annulla</button><button className="button button-primary full-width"><Check size={16} /> Aggiungi al carrello</button></div></form></Modal>}
    {productForm && <ProductForm initial={productForm} save={saveProduct} close={() => setProductForm(null)} />}
    {stockProduct && <Modal title={`Aggiungi quantità · ${stockProduct.name}`} close={() => setStockProduct(null)}><form className="form-grid stock-form" onSubmit={(event) => void saveStock(event)}>
      <p className="stock-current">Giacenza attuale: <strong>{stockProduct.stock}</strong></p>
      <Field label="Nuova quantità" type="number" min="0.01" step="any" value={stockInput} onChange={(event) => setStockInput(event.target.value)} required autoFocus placeholder="Quantità da aggiungere" />
      <div className="form-actions"><button className="button button-quiet full-width" type="button" onClick={() => setStockProduct(null)}>Annulla</button><button className="button button-primary full-width"><Check size={16} /> Conferma giacenza</button></div>
    </form></Modal>}{selectedProduct && <div className="drawer-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setSelectedProduct(null); }}><aside className="detail-drawer"><header className="drawer-header"><div><p className="eyebrow">DETTAGLIO ARTICOLO</p><h2>{selectedProduct.name}</h2></div><button className="icon-button" onClick={() => setSelectedProduct(null)}><X size={18} /></button></header><div className="drawer-content"><div className="detail-icon"><Package size={26} /></div><span className="stock-badge">{selectedProduct.category}</span><div className="detail-list"><Detail label="Codice a barre" value={selectedProduct.code} /><Detail label="Prezzo vendita" value={money.format(selectedProduct.sale_price)} /><Detail label="Prezzo acquisto" value={money.format(selectedProduct.purchase_price)} /><Detail label="Giacenza" value={`${selectedProduct.stock} ${selectedProduct.unit ?? 'PEZZO'}`} /><Detail label="Soglia minima" value={`${selectedProduct.low_stock_threshold} ${selectedProduct.unit ?? 'PEZZO'}`} />{selectedProduct.expiry_enabled && selectedProduct.expiry_date && <Detail label="Data di scadenza" value={receiptDate.format(new Date(`${selectedProduct.expiry_date}T00:00:00`))} />}<Detail label="Margine unitario" value={money.format(selectedProduct.sale_price - selectedProduct.purchase_price)} /></div></div><footer className="drawer-footer"><button className="button button-outline full-width" onClick={() => { setProductForm({ code: selectedProduct.code, name: selectedProduct.name, unit: selectedProduct.unit ?? 'PEZZO', category: selectedProduct.category, sale_price: selectedProduct.sale_price, purchase_price: selectedProduct.purchase_price, stock: selectedProduct.stock, low_stock_threshold: selectedProduct.low_stock_threshold, expiry_enabled: selectedProduct.expiry_enabled, expiry_date: selectedProduct.expiry_date }); setSelectedProduct(null); }}><Settings size={15} /> Modifica articolo</button><button className="button button-outline full-width" onClick={() => { setStockInput(''); setStockProduct(selectedProduct); setSelectedProduct(null); }}><Package size={15} /> Nuova quantità</button></footer></aside></div>}
    {checkoutOpen && <Modal title="Pagamento" close={() => setCheckoutOpen(false)} rightHalf><div className="payment-content">
      <details className="payment-promotion-info">
        <summary><strong>Offerte automatiche applicate</strong></summary>
        <div className="payment-offer-list"><div className="payment-offer-toggle-row"><span>Applica sconti automatici</span><button className={`switch-button${automaticPromotionId !== null ? ' is-on' : ''}`} type="button" role="switch" aria-checked={automaticPromotionId !== null} onClick={() => setAutomaticPromotionId(automaticPromotionId === null ? undefined : null)}>{automaticPromotionId === null ? 'OFF' : 'ON'}</button></div>{automaticPromotionId !== null && (automaticApplicableOffers.length ? automaticApplicableOffers.map((offer) => <div className="payment-offer" key={offer.id}>
          <span>{offer.name} · {promotionDiscountLabel(offer)}</span>
          <small>{promotionDiscounts.automaticPromotion?.id === offer.id ? 'Applicata' : 'Non applicata (massimo 1)'}</small>
        </div>) : <small>Nessuna offerta automatica applicabile al carrello.</small>)}
        {automaticDiscount > 0 && <small>Risparmio: {money.format(automaticDiscount)}</small>}</div>
      </details>
      {manualApplicableOffers.length > 0 && <details className="payment-promotion-info">
        <summary><strong>Offerte manuali disponibili</strong></summary>
        <div className="payment-offer-list">{manualApplicableOffers.map((offer) => <button className={`payment-offer-choice${promotionDiscounts.manualPromotion?.id === offer.id ? ' selected' : ''}`} type="button" key={offer.id} onClick={() => setManualPromotionId((current) => current === offer.id ? undefined : offer.id)}><span>{offer.name} · {promotionDiscountLabel(offer)}</span><small>{promotionDiscounts.manualPromotion?.id === offer.id ? 'Applicata' : 'Applica'}</small></button>)}
          {manualDiscount > 0 && <small>Risparmio: {money.format(manualDiscount)}</small>}</div>
      </details>}
      <SelectField label="Metodo di pagamento" value={paymentMethod} onChange={setPaymentMethod} options={['Carta', 'Contanti', 'Bancomat', 'Buono']} />
      <Field label="Sconto aggiuntivo (%)" type="number" min="0" max="100" step="0.01" value={discount} onChange={(e) => setDiscount(Number(e.target.value))} />
      <div className="payment-total">{total < subtotal && <div className="payment-total-before"><span>Prezzo prima dello sconto</span><strong>{money.format(subtotal)}</strong></div>}<div className="payment-total-after"><span>Totale da pagare</span><strong>{money.format(total)}</strong></div></div>
      <div className="payment-note"><ShieldCheck size={16} />Lo scontrino viene registrato nel database locale.</div>
      <button className="button button-primary full-width" onClick={() => void checkout()}><Check size={17} /> Conferma e stampa scontrino</button>
    </div></Modal>}
    {receipt && <Modal title={`Scontrino #${receipt.receipt_no}`} close={() => setReceipt(null)}><div className="receipt-print" id="receipt-print"><div className="receipt-shop">{data.settings.shop_name}</div><div className="receipt-spacer" /><div className="receipt-datetime"><span>{receiptDate.format(new Date(receipt.created_at))}</span><span>{receiptTime.format(new Date(receipt.created_at))}</span></div><div>Numero scontrino: {receipt.receipt_no}</div><div className="receipt-dash" /><div className="receipt-head"><span>Articolo</span><span>Qtà</span><span>Prezzo</span></div>{receipt.items.map((item, index) => <div className="receipt-item" key={`${item.code}-${index}`}><span>{item.name}</span><span>{receiptQuantity.format(item.quantity)}{item.unit === 'KG' ? ' kg' : item.unit === 'LITRO' ? ' L' : ''}</span><span>{money.format(item.unit_price * item.quantity)}</span></div>)}<div className="receipt-dash" /><div className="receipt-total"><strong>TOTALE</strong><strong>{money.format(receipt.total)}</strong></div><div>Pagamento: {receipt.payment_method}</div><div className="receipt-dash" /><div className="receipt-spacer" /><svg id="receipt-barcode" /><div className="receipt-spacer" /><div className="receipt-thanks">Grazie per averci scelto!</div></div><div className="receipt-actions"><button className="button button-primary full-width" onClick={printReceipt}><Printer size={16} /> Stampa scontrino</button></div></Modal>}
    {saleDialog && <Modal title={`Vendita #${saleDialog.receipt_no}`} close={() => setSaleDialog(null)} wide><div className="sale-edit">
      <div className="sale-edit-fields">
        <SelectField label="Metodo di pagamento" value={saleDialog.payment_method} onChange={(value) => setSaleDialog({ ...saleDialog, payment_method: value })} options={['Carta', 'Contanti', 'Bancomat', 'Buono']} />
        <Field label="Sconto (%)" type="number" min="0" max="100" step="0.01" value={saleDiscountPercentage} onChange={(e) => changeSaleDiscount(Number(e.target.value))} />
        <Field label="Sconto (€)" type="number" value={saleDialog.discount.toFixed(2)} readOnly />
      </div>
      <div className="sale-edit-add">
        <button className="button button-primary full-width" type="button" onClick={() => { setSaleCart([]); setSaleProductSearch(''); setSaleAddOpen(true); }}><Plus size={15} /> Aggiungi articolo</button>
      </div>
      <div className="edit-item-list"><div className="edit-list-head"><span>Articolo</span><span>Quantità</span><span>Prezzo</span></div>{saleDialog.items.map((item, index) => <div className="edit-item" key={`${item.product_id}-${index}`}><span>{item.name}</span><input aria-label={`Quantità ${item.name}`} type="number" min="0" step={item.unit === 'PEZZO' || !item.unit ? '1' : '0.1'} value={item.quantity} onChange={(e) => changeSaleQuantity(index, Number(e.target.value))} /><span>{money.format(item.unit_price)} / {item.unit ?? 'PEZZO'}</span></div>)}</div>
      <div className="sale-edit-total"><span>Sconto in euro</span><strong>{money.format(saleDialog.discount)}</strong></div>
      <div className="sale-edit-total"><span>Nuovo totale</span><strong>{money.format(Math.max(0, saleDialog.items.reduce((sum, item) => sum + item.quantity * item.unit_price, 0) - saleDialog.discount))}</strong></div>
      <div className="sale-edit-actions"><button className="button button-danger" onClick={() => void deleteSale(saleDialog)}><Trash2 size={15} /> Elimina vendita</button><button className="button button-primary" onClick={() => void updateSale()}><Check size={15} /> Salva modifiche</button></div>
    </div></Modal>}
    {saleAddOpen && <div className="drawer-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setSaleAddOpen(false); }}><aside className="detail-drawer sale-add-drawer"><header className="drawer-header"><div><p className="eyebrow">MODIFICA VENDITA</p><h2>Aggiungi articoli</h2></div><button className="icon-button" onClick={() => setSaleAddOpen(false)} aria-label="Chiudi"><X size={18} /></button></header><div className="sale-add-content"><SearchInput value={saleProductSearch} onChange={setSaleProductSearch} placeholder="Cerca articolo o codice…" /><div className="sale-add-products">{availableSaleProducts.filter((product) => product.name.toLowerCase().includes(saleProductSearch.toLowerCase()) || product.code.includes(saleProductSearch)).map((product) => { const selected = saleCart.find((item) => item.product_id === product.id); return <button className={`sale-add-product${selected ? ' selected' : ''}`} key={product.id} onClick={() => addProductToSaleCart(product)}><span><strong>{product.name}</strong><small>{product.code} · {product.stock} {product.unit ?? 'PEZZO'} disponibili</small></span><span>{money.format(product.sale_price)} / {product.unit ?? 'PEZZO'}<b>{selected ? ` · ${selected.quantity}` : ''}</b></span></button>; })}</div><details className="sale-add-cart"><summary><strong>Carrello · {saleCart.length}</strong></summary>{saleCart.map((item) => <span key={item.product_id}>{item.name} · {item.quantity} {item.unit} <b>{money.format(item.quantity * item.unit_price)}</b></span>)}<button className="button button-primary full-width" disabled={!saleCart.length} onClick={addProductToSale}><Check size={16} /> Aggiungi alla vendita</button></details></div></aside></div>}
    {camera && <CameraScanner close={() => setCamera(false)} scan={scanCameraCode} />}
    {notice && <div className="toast">{notice}</div>}
  </div>;
}

function Metric({ icon: Icon, label, value, detail, compact = false, action }: { icon: typeof House; label: string; value: string; detail: string; compact?: boolean; action?: ReactNode }) {
  return <section className={`metric-card${compact ? ' compact' : ''}`}>{action}<div className="metric-icon"><Icon size={18} /></div><span className="metric-label">{label}</span><strong>{value}</strong><small>{detail}</small></section>;
}
function SectionHeading({ icon: Icon, title, detail, action }: { icon: typeof House; title: string; detail: string; action: ReactNode }) {
  return <div className="section-heading"><div className="section-title-icon"><Icon size={18} /></div><div><h3>{title}</h3><p>{detail}</p></div>{action}</div>;
}
function Table({ headings, children }: { headings: string[]; children: ReactNode }) {
  return <div className="table-wrap"><table><thead><tr>{headings.map((heading) => <th key={heading}>{heading}</th>)}</tr></thead><tbody>{children}</tbody></table></div>;
}
function SalesTable({ sales, onSelect }: { sales: Sale[]; onSelect?: (sale: Sale) => void }) {
  return <div className="table-wrap"><table><thead><tr><th>Numero scontrino</th><th>Data e ora</th><th>Articoli</th><th>Pagamento</th><th className="align-right">Totale</th></tr></thead><tbody>{sales.map((sale) => <tr key={sale.id} onClick={onSelect ? () => onSelect(sale) : undefined}><td className="receipt-number">#{sale.receipt_no}</td><td>{dateTime.format(new Date(sale.created_at))}</td><td>{sale.item_count}</td><td><span className="payment-tag">{sale.payment_method}</span></td><td className="align-right cell-primary">{money.format(sale.total)}</td></tr>)}{!sales.length && <tr><td colSpan={5} className="empty-cell">Nessuna vendita registrata.</td></tr>}</tbody></table></div>;
}
function SearchInput({ value, onChange, placeholder, numericOnly = false }: { value: string; onChange: (value: string) => void; placeholder: string; numericOnly?: boolean }) {
  return <label className="search-field"><Search size={17} /><input placeholder={placeholder} value={value} inputMode={numericOnly ? 'numeric' : undefined} pattern={numericOnly ? '[0-9]*' : undefined} onChange={(event) => onChange(numericOnly ? event.target.value.replace(/\D/g, '') : event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') event.preventDefault(); }} /></label>;
}
function SelectField({ label, value, onChange, options, labels }: { label: string; value: string; onChange: (value: string) => void; options: string[]; labels?: string[] }) {
  return <label className="field"><span>{label}</span><select value={value} onChange={(event) => onChange(event.target.value)}>{options.map((option, index) => <option key={`${option}-${index}`} value={option}>{labels?.[index] ?? option}</option>)}</select></label>;
}
function Detail({ label, value }: { label: string; value: string }) { return <div className="detail-row"><span>{label}</span><strong>{value}</strong></div>; }
function Empty({ icon: Icon, title, detail }: { icon: typeof House; title: string; detail: string }) { return <div className="empty-state"><Icon size={28} /><strong>{title}</strong><span>{detail}</span></div>; }

function CameraScanner({ close, scan }: { close: () => void; scan: (code: string) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [message, setMessage] = useState('Inquadra il codice a barre');
  useEffect(() => {
    let stream: MediaStream | undefined;
    let timer = 0;
    let active = true;
    const start = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (video.current) video.current.srcObject = stream;
        const Detector = (window as unknown as { BarcodeDetector?: new (options: { formats: string[] }) => { detect: (source: HTMLVideoElement) => Promise<Array<{ rawValue: string }>> } }).BarcodeDetector;
        if (!Detector) { setMessage('Scansione camera non supportata. Collega il lettore barcode USB.'); return; }
        const detector = new Detector({ formats: ['code_128', 'ean_13', 'ean_8', 'upc_a', 'upc_e'] });
        const readFrame = async () => { if (!active || !video.current) return; try { const result = await detector.detect(video.current); if (result[0]?.rawValue) { scan(result[0].rawValue); return; } } catch { /* il video non ha ancora un frame */ } timer = window.setTimeout(() => void readFrame(), 240); };
        timer = window.setTimeout(() => void readFrame(), 500);
      } catch { setMessage('Fotocamera non disponibile o permesso negato.'); }
    };
    void start();
    return () => { active = false; window.clearTimeout(timer); stream?.getTracks().forEach((track) => track.stop()); };
  }, [scan]);
  return <Modal title="Scansiona codice" close={close}><div className="camera-view"><video ref={video} autoPlay muted playsInline /><div className="camera-frame" /><p>{message}</p></div></Modal>;
}