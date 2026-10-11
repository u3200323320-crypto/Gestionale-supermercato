import { Fragment, useEffect, useRef, useState } from 'react';
import type { FormEvent, InputHTMLAttributes, ReactNode } from 'react';
import { Archive, ArrowDownToLine, BarChart3, Banknote, Barcode, Camera, Check, ChevronDown, CircleAlert, ClipboardList, CreditCard, House, LockKeyhole, Minus, Package, Pencil, Plus, Printer, Search, Settings, ShieldCheck, ShoppingBasket, Store, Trash2, TrendingUp, X } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import JsBarcode from 'jsbarcode';
import type { AppState, Product, ProductInput, Promotion, PromotionInput, Sale, SaleItem, Section } from '../shared/types';

const money = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' });
const dateTime = new Intl.DateTimeFormat('it-IT', { dateStyle: 'short', timeStyle: 'short' });
const receiptDate = new Intl.DateTimeFormat('it-IT', { dateStyle: 'short' });
const receiptTime = new Intl.DateTimeFormat('it-IT', { timeStyle: 'short' });
const colors = ['#416e59', '#c17e4f', '#658499', '#a9aa64', '#8a7461', '#609085'];
const localDateKey = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const nav: { section: Section; label: string; icon: typeof House }[] = [
  { section: 'home', label: 'Homepage', icon: House }, { section: 'inventory', label: 'Magazzino', icon: Package },
  { section: 'cash', label: 'Cassa', icon: ShoppingBasket }, { section: 'sales', label: 'Vendite', icon: ClipboardList },
  { section: 'statistics', label: 'Statistiche', icon: BarChart3 },
  { section: 'sale-management', label: 'Modifica o Elimina', icon: ClipboardList },
  { section: 'promotions', label: 'Offerte', icon: TrendingUp },
];
const inventoryFilters: { value: 'all' | 'available' | 'low' | 'out'; label: string }[] = [
  { value: 'all', label: 'Tutto' }, { value: 'available', label: 'Disponibile' },
  { value: 'low', label: 'In esaurimento' }, { value: 'out', label: 'Esaurito' },
];
const blankProduct: ProductInput = { code: '', name: '', category: 'Dispensa', sale_price: 0, purchase_price: 0, stock: 0, low_stock_threshold: 5 };
const blankPromotion = (): PromotionInput => ({ name: '', percentage: 10, category: 'Tutte', starts_at: localDateKey(), ends_at: localDateKey(), application_mode: 'Automatica' });
const errorText = (error: unknown) => error instanceof Error ? error.message : 'Operazione non riuscita.';

function Field({ label, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return <label className="field"><span>{label}</span><input {...props} /></label>;
}

function Modal({ title, close, children, wide = false }: { title: string; close: () => void; children: ReactNode; wide?: boolean }) {
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}><section className={`modal${wide ? ' modal-wide' : ''}`} role="dialog" aria-modal="true"><header className="modal-header"><div><p className="eyebrow">GESTIONALE</p><h2>{title}</h2></div><button className="icon-button" onClick={close} aria-label="Chiudi"><X size={18} /></button></header>{children}</section></div>;
}

function ProductForm({ initial, save, close }: { initial: ProductInput; save: (product: ProductInput) => Promise<void>; close: () => void }) {
  const [product, setProduct] = useState(initial);
  const [saving, setSaving] = useState(false);
  const change = (key: keyof ProductInput, value: string) => setProduct((current) => ({ ...current, [key]: ['sale_price', 'purchase_price', 'stock', 'low_stock_threshold'].includes(key) ? Number(value) : value }));
  const submit = async (event: FormEvent) => { event.preventDefault(); setSaving(true); try { await save(product); close(); } finally { setSaving(false); } };
  return <Modal title={initial.name ? 'Modifica articolo' : 'Nuovo articolo'} close={close}><form className="form-grid" onSubmit={submit}>
    <Field label="Nome articolo" value={product.name} onChange={(e) => change('name', e.target.value)} required autoFocus />
    <Field label="Codice a barre" value={product.code} onChange={(e) => change('code', e.target.value)} required />
    <Field label="Categoria" value={product.category} onChange={(e) => change('category', e.target.value)} required />
    <Field label="Prezzo di vendita" type="number" min="0" step="0.01" value={product.sale_price || ''} onChange={(e) => change('sale_price', e.target.value)} required />
    <Field label="Prezzo di acquisto" type="number" min="0" step="0.01" value={product.purchase_price || ''} onChange={(e) => change('purchase_price', e.target.value)} required />
    <Field label="Giacenza" type="number" min="0" value={product.stock || ''} onChange={(e) => change('stock', e.target.value)} required />
    <Field label="Soglia minima avviso" type="number" min="0" value={product.low_stock_threshold || ''} onChange={(e) => change('low_stock_threshold', e.target.value)} required />
    <div className="form-actions"><button className="button button-quiet" type="button" onClick={close}>Annulla</button><button className="button button-primary" disabled={saving}><Check size={16} /> Salva articolo</button></div>
  </form></Modal>;
}

export default function App() {
  const [data, setData] = useState<AppState | null>(null);
  const [section, setSection] = useState<Section>('home');
  const [settingsTab, setSettingsTab] = useState('Nome negozio');
  const [locked, setLocked] = useState(true);
  const [hasPin, setHasPin] = useState(false);
  const [pin, setPin] = useState('');
  const [notice, setNotice] = useState('');
  const [productForm, setProductForm] = useState<ProductInput | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [stockProduct, setStockProduct] = useState<Product | null>(null);
  const [stockInput, setStockInput] = useState('');
  const [saleDialog, setSaleDialog] = useState<Sale | null>(null);
  const [receipt, setReceipt] = useState<Sale | null>(null);
  const [autoPrintReceipt, setAutoPrintReceipt] = useState(false);
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
  const [activePromotion, setActivePromotion] = useState('');
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [camera, setCamera] = useState(false);
  const [shopName, setShopName] = useState('');
  const [archiveFolder, setArchiveFolder] = useState('');
  const [newPin, setNewPin] = useState('');
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [promotion, setPromotion] = useState<PromotionInput>(blankPromotion);

  const refresh = async () => { const next = await window.gestionale.getState(); setData(next); setShopName(next.settings.shop_name); setArchiveFolder(next.settings.archive_folder); return next; };
  const notify = (text: string) => { setNotice(text); window.setTimeout(() => setNotice(''), 3600); };
  useEffect(() => { void window.gestionale.hasPin().then((exists) => { setHasPin(exists); if (!exists) { setLocked(false); void refresh(); } }); }, []);
  useEffect(() => { const openCash = (event: KeyboardEvent) => { if (event.key === 'F2') { event.preventDefault(); setSection('cash'); } }; window.addEventListener('keydown', openCash); return () => window.removeEventListener('keydown', openCash); }, []);
  useEffect(() => { if (section === 'cash') document.getElementById('scanner-field')?.focus(); }, [section]);
  useEffect(() => { if (receipt) { const barcode = document.getElementById('receipt-barcode'); if (barcode) JsBarcode(barcode, receipt.receipt_no, { format: 'CODE128', width: 2.1, height: 48, displayValue: false, margin: 0 }); } }, [receipt]);
  useEffect(() => { if (receipt && autoPrintReceipt) { const timer = window.setTimeout(() => { window.print(); setAutoPrintReceipt(false); }, 0); return () => window.clearTimeout(timer); } }, [receipt, autoPrintReceipt]);

  const categories = [...new Set(data?.products.map((item) => item.category) ?? [])];
  const todayKey = localDateKey();
  const activePromotions = data?.promotions.filter((item) => item.starts_at <= todayKey && item.ends_at >= todayKey) ?? [];
  const automaticOfferFor = (product: Product) => activePromotions.find((item) => item.application_mode === 'Automatica' && (item.category === 'Tutte' || item.category === product.category));
  const effectivePrice = (product: Product) => product.sale_price * (1 - (automaticOfferFor(product)?.percentage ?? 0) / 100);
  const addToCart = (product: Product) => {
    const line = cart.find((item) => item.product_id === product.id);
    if (product.stock - (line?.quantity ?? 0) <= 0) { notify(`Scorta insufficiente per ${product.name}.`); return; }
    setCart((current) => line ? current.map((item) => item.product_id === product.id ? { ...item, quantity: item.quantity + 1 } : item) : [...current, { product_id: product.id, name: product.name, code: product.code, quantity: 1, unit_price: effectivePrice(product), purchase_price: product.purchase_price }]);
  };
  const scanCode = (code: string) => { const normalized = code.trim(); const product = data?.products.find((item) => item.code === normalized); if (product) { addToCart(product); setScannerSearch(''); } else if (normalized && window.confirm(`Il codice ${normalized} non è presente in magazzino. Vuoi aggiungere l'articolo?`)) { setProductForm({ ...blankProduct, code: normalized }); } };
  const saveProduct = async (item: ProductInput) => { try { await window.gestionale.saveProduct(item); await refresh(); setSelectedProduct(null); notify('Articolo salvato'); } catch (error) { notify(errorText(error)); throw error; } };
  const saveStock = async (event: FormEvent) => {
    event.preventDefault();
    if (!stockProduct) return;
    const quantity = Number(stockInput);
    if (!Number.isFinite(quantity) || quantity < 0) { notify('Inserisci una quantità valida.'); return; }
    try {
      await window.gestionale.updateStock(stockProduct.id, quantity);
      await refresh();
      setStockProduct(null);
      notify('Giacenza aggiornata');
    } catch (error) {
      notify(errorText(error));
    }
  };
  const unlock = async (event: FormEvent) => { event.preventDefault(); if (!await window.gestionale.verifyPin(pin)) { notify('PIN non corretto'); return; } setLocked(false); setPin(''); await refresh(); };
  const findSale = () => { const sale = data?.sales.find((item) => item.receipt_no === saleLookup.trim()); if (sale) setSaleDialog({ ...sale, items: sale.items.map((item) => ({ ...item })) }); else notify('Scontrino non trovato'); };
  const updateSale = async () => { if (!saleDialog) return; const items = saleDialog.items.filter((item) => item.quantity > 0); if (!items.length) { notify('Una vendita deve contenere almeno un articolo.'); return; } try { const saleId = saleDialog.id; await window.gestionale.updateSale({ id: saleId, payment_method: saleDialog.payment_method, discount: saleDialog.discount, items }); const next = await refresh(); const updatedSale = next.sales.find((sale) => sale.id === saleId); setSaleLookup(''); setSaleDialog(null); if (!updatedSale) throw new Error('Vendita aggiornata ma non trovata nell’archivio.'); setReceipt(updatedSale); setAutoPrintReceipt(true); notify('Vendita aggiornata'); } catch (error) { notify(errorText(error)); await refresh(); } };
  const deleteSale = async (sale: Sale) => { if (!window.confirm(`Eliminare lo scontrino ${sale.receipt_no}? Le quantità verranno ripristinate.`)) return; try { await window.gestionale.deleteSale(sale.id); await refresh(); setSaleLookup(''); setSaleDialog(null); notify('Vendita eliminata'); } catch (error) { notify(errorText(error)); await refresh(); } };
  const subtotal = cart.reduce((sum, item) => sum + item.quantity * item.unit_price, 0);
  const automaticDiscount = cart.reduce((sum, item) => {
    const product = data?.products.find((candidate) => candidate.id === item.product_id);
    return sum + (product ? Math.max(0, product.sale_price - item.unit_price) * item.quantity : 0);
  }, 0);
  const appliedAutomaticOffers = [...new Map(cart.flatMap((item) => {
    const product = data?.products.find((candidate) => candidate.id === item.product_id);
    const offer = product ? automaticOfferFor(product) : undefined;
    return offer ? [[offer.id, offer] as const] : [];
  })).values()];
  const manualOffer = activePromotions.find((item) => String(item.id) === activePromotion);
  const promotionDiscount = manualOffer ? cart.reduce((sum, item) => { const product = data?.products.find((p) => p.id === item.product_id); return sum + (manualOffer.category === 'Tutte' || manualOffer.category === product?.category ? item.quantity * item.unit_price * manualOffer.percentage / 100 : 0); }, 0) : 0;
  const total = Math.max(0, subtotal - promotionDiscount - Number(discount || 0));
  const changeQuantity = (id: number, amount: number) => {
    const line = cart.find((item) => item.product_id === id);
    const product = data?.products.find((item) => item.id === id);
    if (amount > 0 && line && product && line.quantity >= product.stock) { notify(`Scorta insufficiente per ${line.name}.`); return; }
    setCart((current) => current.map((item) => item.product_id === id ? { ...item, quantity: Math.max(0, item.quantity + amount) } : item).filter((item) => item.quantity > 0));
  };
  const checkout = async () => { try { const sale = await window.gestionale.checkout({ items: cart, payment_method: paymentMethod, discount: promotionDiscount + Number(discount || 0) }); setCart([]); setDiscount(0); setActivePromotion(''); setCheckoutOpen(false); await refresh(); setReceipt(sale); } catch (error) { notify(errorText(error)); await refresh(); } };
  const saveStoreName = async (event: FormEvent) => { event.preventDefault(); await window.gestionale.saveSetting('shop_name', shopName.trim() || 'Il tuo supermercato'); await refresh(); notify('Nome negozio aggiornato'); };
  const chooseFolder = async () => { const chosen = await window.gestionale.chooseArchiveFolder(); if (chosen) { setArchiveFolder(chosen); await refresh(); notify('Cartella archivio aggiornata'); } };
  const savePromotion = async (event: FormEvent) => { event.preventDefault(); try { await window.gestionale.savePromotion(promotion); await refresh(); const wasEditing = promotion.id !== undefined; setPromotion(blankPromotion()); notify(wasEditing ? 'Promozione aggiornata' : 'Promozione creata'); } catch (error) { notify(errorText(error)); } };
  const exportReport = () => { if (!data) return; const doc = new jsPDF(); doc.setFontSize(18); doc.text(data.settings.shop_name, 14, 17); doc.setFontSize(11); doc.text('Report vendite', 14, 25); autoTable(doc, { startY: 32, head: [['Scontrino', 'Data e ora', 'Articoli', 'Pagamento', 'Totale']], body: data.sales.map((sale) => [sale.receipt_no, dateTime.format(new Date(sale.created_at)), String(sale.item_count), sale.payment_method, money.format(sale.total)]), styles: { fontSize: 9 }, headStyles: { fillColor: [48, 84, 66] } }); doc.save(`report-vendite-${new Date().toISOString().slice(0, 10)}.pdf`); };
  const exportInventoryReport = () => { if (!data) return; const doc = new jsPDF({ orientation: 'landscape' }); doc.setFontSize(18); doc.text(data.settings.shop_name, 14, 17); doc.setFontSize(11); doc.text('Report magazzino', 14, 25); autoTable(doc, { startY: 32, head: [['Codice', 'Articolo', 'Categoria', 'Prezzo vendita', 'Prezzo acquisto', 'Giacenza', 'Soglia minima']], body: data.products.map((item) => [item.code, item.name, item.category, money.format(item.sale_price), money.format(item.purchase_price), String(item.stock), String(item.low_stock_threshold)]), styles: { fontSize: 9 }, headStyles: { fillColor: [48, 84, 66] } }); doc.save(`report-magazzino-${new Date().toISOString().slice(0, 10)}.pdf`); };
  const todaySales = data?.sales.filter((sale) => new Date(sale.created_at).toDateString() === new Date().toDateString()) ?? [];
  const dailyTotal = todaySales.reduce((sum, sale) => sum + sale.total, 0);
  const dailyUnits = todaySales.reduce((sum, sale) => sum + sale.item_count, 0);
  const soldCost = data?.sales.reduce((sum, sale) => sum + sale.items.reduce((subtotal, item) => subtotal + item.quantity * item.purchase_price, 0), 0) ?? 0;
  const soldTotal = data?.sales.reduce((sum, sale) => sum + sale.total, 0) ?? 0;
  const stockCost = data?.products.reduce((sum, item) => sum + item.stock * item.purchase_price, 0) ?? 0;
  const stockRetail = data?.products.reduce((sum, item) => sum + item.stock * item.sale_price, 0) ?? 0;
  const categoriesSales = data?.sales.flatMap((sale) => sale.items).reduce<Record<string, number>>((totals, item) => { const cat = data?.products.find((product) => product.id === item.product_id)?.category ?? 'Altro'; totals[cat] = (totals[cat] ?? 0) + item.quantity * item.unit_price; return totals; }, {}) ?? {};
  const chartDays = Array.from({ length: 7 }, (_, index) => { const date = new Date(); date.setDate(date.getDate() - 6 + index); const sales = data?.sales.filter((sale) => new Date(sale.created_at).toDateString() === date.toDateString()) ?? []; return { giorno: date.toLocaleDateString('it-IT', { weekday: 'short' }), totale: sales.reduce((sum, sale) => sum + sale.total, 0) }; });
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
    `${sale.receipt_no} ${sale.payment_method} ${sale.created_at}`.toLowerCase().includes(saleSearch.toLowerCase())
    && (salesCategory === 'Tutte' || sale.items.some((item) => data.products.some((product) => product.id === item.product_id && product.category === salesCategory)))
    && matchesSalesPeriod(sale.created_at)
  ) ?? [];
  const sectionLabel = nav.find((item) => item.section === section)?.label ?? 'Impostazioni';
  const printReceipt = () => window.print();
  const calendarDays = () => { const year = calendarMonth.getFullYear(); const month = calendarMonth.getMonth(); const offset = (new Date(year, month, 1).getDay() + 6) % 7; return [...Array(offset).fill(null), ...Array.from({ length: new Date(year, month + 1, 0).getDate() }, (_, i) => i + 1)]; };

  if (locked) return <div className="lock-screen"><div className="lock-panel"><div className="brand-mark"><Store size={23} /></div><p className="eyebrow">ACCESSO AL GESTIONALE</p><h1>{data?.settings.shop_name ?? 'Il tuo supermercato'}</h1><p className="muted">Inserisci il PIN per continuare</p><form onSubmit={unlock}><Field label="PIN di sicurezza" type="password" value={pin} onChange={(e) => setPin(e.target.value)} autoFocus /><button className="button button-primary full-width"><LockKeyhole size={16} /> Accedi</button></form></div>{notice && <div className="toast">{notice}</div>}</div>;
  if (!data) return <div className="loading-screen"><span className="loader" />Caricamento archivio…</div>;

  return <div className="app-shell">
    <aside className="sidebar"><div className="brand"><div className="brand-mark"><Store size={20} /></div><div><strong>{data.settings.shop_name}</strong><small>GESTIONE NEGOZIO</small></div></div><div className="nav-label">OPERATIVITÀ</div><nav>{nav.map(({ section: target, label, icon: Icon }, index) => <Fragment key={target}>{index === 5 && <div className="nav-label">EXTRA</div>}<button className={`nav-item${section === target ? ' active' : ''}`} onClick={() => setSection(target)}><Icon size={18} /><span>{label}</span>{target === 'cash' && <kbd>F2</kbd>}</button></Fragment>)}</nav><div className="sidebar-bottom"><button className={`nav-item settings-link${section === 'settings' ? ' active' : ''}`} onClick={() => setSection('settings')}><Settings size={18} /><span>Impostazioni</span></button><div className="user-card"><div className="user-avatar">{data.settings.shop_name.slice(0, 1).toUpperCase()}</div><div><strong>Gestore</strong><small>Account locale</small></div><button className="icon-button small" title="Blocca applicazione" onClick={() => { setLocked(true); setPin(''); }}><LockKeyhole size={15} /></button></div></div></aside>
    <main className="main-content"><header className="topbar"><h1>{sectionLabel}</h1><div className="topbar-right"><div className="today-date">{new Intl.DateTimeFormat('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date())}</div><span className="store-chip"><span className="status-dot" />Operativo</span></div></header>

      {section === 'home' && <div className="page-content"><div className="metric-grid"><Metric icon={Banknote} label="Vendite di oggi" value={money.format(dailyTotal)} detail={`${todaySales.length} scontrini emessi`} /><Metric icon={TrendingUp} label="Netto vendite" value={money.format(dailyTotal)} detail="Incasso al netto degli sconti" /><Metric icon={Package} label="Articoli venduti" value={dailyUnits.toLocaleString('it-IT')} detail="Pezzi registrati oggi" /></div><section className="content-section reorder-section"><SectionHeading icon={CircleAlert} title="Da riordinare" detail={`${data.products.filter((p) => p.stock <= p.low_stock_threshold).length} articoli sotto soglia`} action={<button className="text-button" onClick={() => { setInventorySearch(''); setCategory('Tutte'); setInventoryStatus('low'); setSection('inventory'); }}>Vai al magazzino →</button>} /><Table headings={['Articolo', 'Codice', 'Categoria', 'Disponibili', 'Soglia', 'Stato']}><>{data.products.filter((p) => p.stock <= p.low_stock_threshold).slice(0, 5).map((p) => <tr key={p.id} onClick={() => setSelectedProduct(p)}><td className="cell-primary">{p.name}</td><td className="mono">{p.code}</td><td>{p.category}</td><td>{p.stock}</td><td>{p.low_stock_threshold}</td><td><span className="stock-badge low">Riordinare</span></td></tr>)}</></Table></section><section className="content-section"><SectionHeading icon={ClipboardList} title="Ultime vendite" detail="Transazioni più recenti" action={<button className="text-button" onClick={() => setSection('sales')}>Tutte le vendite →</button>} /><SalesTable sales={data.sales.slice(0, 5)} onSelect={setReceipt} /></section></div>}

      {section === 'inventory' && <div className="page-content"><div className="page-toolbar inventory-toolbar"><div><h2>Articoli in magazzino</h2><p>{data.products.length} articoli registrati</p></div><div className="toolbar-actions"><button className="button button-outline" onClick={exportInventoryReport}><ArrowDownToLine size={16} /> Scarica report</button><button className="button button-primary" onClick={() => setProductForm({ ...blankProduct })}><Plus size={16} /> Aggiungi nuovo articolo</button></div></div><div className="filter-row"><SearchInput value={inventorySearch} onChange={setInventorySearch} placeholder="Cerca per nome o codice…" /><label className="select-wrap"><span>Categoria</span><select value={category} onChange={(e) => setCategory(e.target.value)}><option>Tutte</option>{categories.map((item) => <option key={item}>{item}</option>)}</select><ChevronDown size={14} /></label><details className="inventory-filter-dropdown"><summary className="select-wrap"><span>Disponibilità: {inventoryFilters.find((item) => item.value === inventoryStatus)?.label}</span><ChevronDown size={14} /></summary><div className="inventory-status-filters" role="group" aria-label="Filtra prodotti per disponibilità">{inventoryFilters.map(({ value, label }) => <button key={value} className={`status-filter${inventoryStatus === value ? ' active' : ''}`} aria-pressed={inventoryStatus === value} onClick={(event) => { setInventoryStatus(value); event.currentTarget.closest('details')?.removeAttribute('open'); }}>{label}</button>)}</div></details></div><div className="product-grid">{inventoryList.map((product) => <button className="product-tile" key={product.id} onClick={() => setSelectedProduct(product)}><div className="tile-icon"><Package size={20} /></div><span className="tile-category">{product.category}</span><strong>{product.name}</strong><span className="tile-price">{money.format(product.sale_price)}</span><span className={`tile-stock${product.stock <= product.low_stock_threshold ? ' text-low' : ''}`}>{product.stock} disponibili</span></button>)}</div>{inventoryList.length === 0 && <Empty icon={Package} title="Nessun articolo trovato" detail="Modifica la ricerca o aggiungi un articolo." />}</div>}

      {section === 'cash' && <div className="page-content cash-content"><div className="cash-layout"><section className="cash-products"><div className="cash-search-row"><label className="search-field"><Barcode size={17} /><input id="scanner-field" placeholder="Cerca o scansiona un codice a barre…" value={scannerSearch} onChange={(e) => setScannerSearch(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); scanCode(scannerSearch); } }} /></label><button className="icon-button camera-button" title="Scansiona con fotocamera" onClick={() => setCamera(true)}><Camera size={18} /></button></div><div className="cash-product-grid">{data.products.filter((p) => (p.name.toLowerCase().includes(scannerSearch.toLowerCase()) || p.code.includes(scannerSearch)) && p.stock > 0).map((product) => { const remainingStock = Math.max(0, product.stock - (cart.find((item) => item.product_id === product.id)?.quantity ?? 0)); return <button className="cash-product" key={product.id} disabled={remainingStock === 0} onClick={() => addToCart(product)}><span className="tile-category">{product.category}</span><strong>{product.name}</strong><span className="cash-product-bottom"><b>{money.format(effectivePrice(product))}</b><small>{remainingStock} pz</small></span></button>; })}</div></section><aside className="cart-panel"><div className="cart-heading"><div className="cart-heading-title"><h2>CARRELLO <span>{cart.reduce((sum, item) => sum + item.quantity, 0)}</span></h2></div></div><div className="cart-lines">{cart.map((item) => <div className="cart-line" key={item.product_id}><div className="cart-line-name"><strong>{item.name}</strong></div><div className="quantity-control"><button onClick={() => changeQuantity(item.product_id, -1)} aria-label="Rimuovi uno"><Minus size={13} /></button><span>{item.quantity}</span><button onClick={() => changeQuantity(item.product_id, 1)} aria-label="Aggiungi uno"><Plus size={13} /></button></div><strong className="line-total">{money.format(item.quantity * item.unit_price)}</strong></div>)}{!cart.length && <div className="cart-empty"><ShoppingBasket size={25} /><span>Seleziona gli articoli<br />per iniziare una vendita</span></div>}</div><div className="receipt-summary"><div><span>Subtotale</span><span>{money.format(subtotal)}</span></div>{automaticDiscount > 0 && <div className="discount-row"><span>Risparmio offerte automatiche</span><span>− {money.format(automaticDiscount)}</span></div>}{promotionDiscount > 0 && <div className="discount-row"><span>Promozione</span><span>− {money.format(promotionDiscount)}</span></div>}<div className="total-row"><strong>TOTALE</strong><strong>{money.format(total)}</strong></div></div><button className="button button-primary checkout-button" disabled={!cart.length} onClick={() => setCheckoutOpen(true)}>Procedi al pagamento <span>→</span></button></aside></div></div>}

      {section === 'sales' && <div className="page-content"><div className="sale-tools"><button className="button button-outline" onClick={() => setCamera(true)}><Camera size={16} /> Cerca con fotocamera</button><SearchInput value={saleSearch} onChange={setSaleSearch} placeholder="Cerca numero scontrino o pagamento…" /><button className="button button-outline" onClick={exportReport}><ArrowDownToLine size={16} /> Esporta PDF</button></div><div className="sale-filters"><SelectField label="Periodo" value={salesPeriod} onChange={setSalesPeriod} options={['Tutti', 'Oggi', 'Ieri', 'Ultima settimana', 'Ultimo mese', 'Ultimi 3 mesi', 'Da - A']} />{salesPeriod === 'Da - A' && <><Field label="Da" type="date" value={salesFrom} onChange={(event) => setSalesFrom(event.target.value)} /><Field label="A" type="date" value={salesTo} onChange={(event) => setSalesTo(event.target.value)} /></>}<SelectField label="Categoria" value={salesCategory} onChange={setSalesCategory} options={['Tutte', ...categories]} /></div><SalesTable sales={salesList} onSelect={setReceipt} /></div>}

      {section === 'sale-management' && <div className="page-content settings-page"><section className="settings-panel"><div className="settings-title"><h2>Modifica o elimina una vendita</h2><p>Inserisci il numero a 5 cifre stampato sullo scontrino.</p></div><div className="lookup-panel"><button className="button button-primary" onClick={() => setCamera(true)}><Camera size={16} /> Scansiona</button><Field label="Numero scontrino" inputMode="numeric" maxLength={5} value={saleLookup} onChange={(e) => setSaleLookup(e.target.value.replace(/\D/g, ''))} onKeyDown={(e) => { if (e.key === 'Enter') findSale(); }} placeholder="Numero scontrino" /><button className="button button-primary" onClick={findSale}><Search size={16} /> Cerca scontrino</button></div></section></div>}

      {section === 'promotions' && <div className="page-content settings-page"><section className="settings-panel"><div className="settings-title"><h2>Promozioni</h2><p>Crea offerte con periodo e applicazione per categoria.</p></div><form className="form-grid promotion-form" onSubmit={savePromotion}><Field label="Nome offerta" value={promotion.name} onChange={(e) => setPromotion({ ...promotion, name: e.target.value })} required /><Field label="Sconto %" type="number" min="1" max="100" value={promotion.percentage} onChange={(e) => setPromotion({ ...promotion, percentage: Number(e.target.value) })} required /><SelectField label="Categoria" value={promotion.category} onChange={(value) => setPromotion({ ...promotion, category: value })} options={['Tutte', ...categories]} /><SelectField label="Applicazione" value={promotion.application_mode} onChange={(value) => setPromotion({ ...promotion, application_mode: value as Promotion['application_mode'] })} options={['Automatica', 'Manuale']} /><Field label="Dal" type="date" value={promotion.starts_at} onChange={(e) => setPromotion({ ...promotion, starts_at: e.target.value })} required /><Field label="Al" type="date" value={promotion.ends_at} onChange={(e) => setPromotion({ ...promotion, ends_at: e.target.value })} required /><div className="form-actions">{promotion.id !== undefined && <button className="button button-quiet" type="button" onClick={() => setPromotion(blankPromotion())}>Annulla modifica</button>}<button className="button button-primary"><Check size={16} /> {promotion.id === undefined ? 'Crea promozione' : 'Salva modifiche'}</button></div></form><div className="promotion-list">{data.promotions.map((item) => <div className="promotion-row" key={item.id}><div><strong>{item.name}</strong><span>{item.category} · {item.starts_at} — {item.ends_at}</span></div><b>−{item.percentage}%</b><span className="stock-badge">{item.application_mode}</span><button className="button button-outline" onClick={() => setPromotion({ ...item })}><Pencil size={14} /> Modifica</button></div>)}</div></section></div>}

      {section === 'statistics' && <div className="page-content"><div className="page-toolbar"><div><h2>Rendimento e andamento</h2><p>Dati complessivi dello storico disponibile</p></div><span className="period-chip">Dati aggiornati in tempo reale</span></div><div className="metric-grid stats-metrics"><Metric icon={Banknote} label="Vendite" value={money.format(soldTotal)} detail="Incassi registrati" /><Metric icon={CreditCard} label="Acquisto merce venduta" value={money.format(soldCost)} detail="Costo degli articoli venduti" /><Metric icon={TrendingUp} label="Netto stimato" value={money.format(soldTotal - soldCost)} detail="Ricavi meno costo del venduto" /><Metric icon={ShoppingBasket} label="Quantità vendite" value={String(data.sales.reduce((sum, sale) => sum + sale.item_count, 0))} detail="Pezzi nello storico" /></div><div className="metric-grid inventory-values"><Metric icon={Package} label="Valore vendita in magazzino" value={money.format(stockRetail)} detail="Valore al prezzo di vendita" compact /><Metric icon={Archive} label="Valore acquisto in magazzino" value={money.format(stockCost)} detail="Costo delle scorte attuali" compact /><Metric icon={TrendingUp} label="Netto potenziale" value={money.format(stockRetail - stockCost)} detail="Margine potenziale delle scorte" compact /></div><div className="analytics-grid"><section className="panel calendar-panel"><div className="panel-heading"><div><h3>Calendario vendite</h3><p>Incasso per giorno</p></div><div className="month-controls"><button className="icon-button small" onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1))}>‹</button><strong>{calendarMonth.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })}</strong><button className="icon-button small" onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1))}>›</button></div></div><div className="calendar-grid">{['L', 'M', 'M', 'G', 'V', 'S', 'D'].map((day, index) => <span className="calendar-weekday" key={`${day}${index}`}>{day}</span>)}{calendarDays().map((day, index) => { const date = day ? new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), day) : null; const revenue = date ? data.sales.filter((sale) => new Date(sale.created_at).toDateString() === date.toDateString()).reduce((sum, sale) => sum + sale.total, 0) : 0; return <div key={index} className={`calendar-day${revenue ? ' has-sales' : ''}${date?.toDateString() === new Date().toDateString() ? ' today' : ''}`}>{day && <><span>{day}</span>{revenue > 0 && <small>{money.format(revenue)}</small>}</>}</div>; })}</div></section><section className="panel chart-panel"><div className="panel-heading"><div><h3>Vendite giornaliere</h3><p>Ultimi sette giorni</p></div></div><ResponsiveContainer width="100%" height={242}><BarChart data={chartDays} margin={{ top: 14, right: 8, left: -15, bottom: 0 }}><CartesianGrid stroke="#e9ece8" vertical={false} /><XAxis dataKey="giorno" axisLine={false} tickLine={false} tick={{ fill: '#858b85', fontSize: 11 }} /><YAxis axisLine={false} tickLine={false} tick={{ fill: '#858b85', fontSize: 10 }} tickFormatter={(value) => `${value}€`} /><Tooltip formatter={(value) => money.format(Number(value))} /><Bar dataKey="totale" fill="#527962" radius={[4, 4, 0, 0]} maxBarSize={34} /></BarChart></ResponsiveContainer></section></div><section className="panel category-panel"><div className="panel-heading"><div><h3>Vendite per categoria</h3><p>Valore degli articoli venduti</p></div></div><div className="category-chart"><ResponsiveContainer width="100%" height={230}><PieChart><Pie data={Object.entries(categoriesSales).map(([name, value]) => ({ name, value }))} dataKey="value" nameKey="name" innerRadius={57} outerRadius={88} paddingAngle={3}>{Object.keys(categoriesSales).map((name, i) => <Cell key={name} fill={colors[i % colors.length]} />)}</Pie><Tooltip formatter={(value) => money.format(Number(value))} /></PieChart></ResponsiveContainer><div className="chart-legend">{Object.entries(categoriesSales).length ? Object.entries(categoriesSales).map(([name, value], i) => <div key={name}><span style={{ backgroundColor: colors[i % colors.length] }} /><span>{name}</span><strong>{money.format(value)}</strong></div>) : <span className="muted">Le categorie appariranno dopo la prima vendita.</span>}</div></div></section></div>}

      {section === 'settings' && <div className="page-content settings-page"><div className="settings-layout"><nav className="settings-nav">{[{ name: 'Nome negozio', icon: Store }, { name: 'Sicurezza', icon: ShieldCheck }, { name: 'Archivio dati', icon: Archive }].map(({ name, icon: Icon }) => <button key={name} className={settingsTab === name ? 'selected' : ''} onClick={() => setSettingsTab(name)}><Icon size={17} />{name}</button>)}</nav><section className="settings-panel">
        {settingsTab === 'Nome negozio' && <><div className="settings-title"><h2>Nome del negozio</h2><p>Il nome compare nell’applicazione e su ogni scontrino.</p></div><form className="settings-form" onSubmit={saveStoreName}><Field label="Nome attività" value={shopName} onChange={(e) => setShopName(e.target.value)} required /><div className="receipt-preview"><Store size={17} /><span>{shopName || 'Nome negozio'}</span><small>Anteprima intestazione scontrino</small></div><button className="button button-primary"><Check size={16} /> Salva nome</button></form></>}
        {settingsTab === 'Sicurezza' && <><div className="settings-title"><h2>Accesso e sicurezza</h2><p>Proteggi l’apertura del gestionale con un PIN.</p></div><div className="security-status"><div className="security-icon"><ShieldCheck size={20} /></div><div><strong>{hasPin ? 'PIN attivo' : 'Nessun PIN configurato'}</strong><span>{hasPin ? 'Il PIN viene richiesto all’avvio.' : 'Scegli un codice da 4 a 8 cifre.'}</span></div></div><form className="settings-form" onSubmit={async (event) => { event.preventDefault(); try { await window.gestionale.setPin(newPin); setHasPin(true); setNewPin(''); notify('PIN aggiornato'); } catch (error) { notify(errorText(error)); } }}><Field label={hasPin ? 'Nuovo PIN (4–8 cifre)' : 'PIN (4–8 cifre)'} type="password" inputMode="numeric" minLength={4} maxLength={8} pattern="[0-9]{4,8}" value={newPin} onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))} required /><button className="button button-primary"><LockKeyhole size={16} />{hasPin ? 'Aggiorna PIN' : 'Attiva PIN'}</button></form></>}
        {settingsTab === 'Archivio dati' && <><div className="settings-title"><h2>Archivio locale</h2><p>Database SQLite e copie giornaliere dei dati.</p></div><div className="connection-status settings-connection"><span className="status-dot" />Archivio locale attivo</div><div className="database-card"><div className="security-icon"><Archive size={20} /></div><div><strong>Database SQLite</strong><span className="database-path">{data.settings.database_file}</span></div><span className="stock-badge">Attivo</span></div><div className="settings-form"><label className="field"><span>Cartella esportazioni giornaliere</span><div className="folder-input"><input value={archiveFolder} readOnly /><button className="button button-outline" type="button" onClick={() => void chooseFolder()}>Scegli cartella</button></div></label><p className="help-copy">Ogni giorno a mezzanotte vengono aggiornati file TXT e PDF nelle cartelle Magazzino, Cassa, Vendite e Statistiche.</p></div></>}
      </section></div></div>}
    </main>

    {productForm && <ProductForm initial={productForm} save={saveProduct} close={() => setProductForm(null)} />}
    {stockProduct && <Modal title={`Nuova giacenza · ${stockProduct.name}`} close={() => setStockProduct(null)}><form className="form-grid stock-form" onSubmit={(event) => void saveStock(event)}><Field label="Nuova quantità" type="number" min="0" step="any" value={stockInput} onChange={(event) => setStockInput(event.target.value)} required autoFocus /><div className="form-actions"><button className="button button-quiet" type="button" onClick={() => setStockProduct(null)}>Annulla</button><button className="button button-primary"><Check size={16} /> Conferma giacenza</button></div></form></Modal>}{selectedProduct && <div className="drawer-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setSelectedProduct(null); }}><aside className="detail-drawer"><header className="drawer-header"><div><p className="eyebrow">DETTAGLIO ARTICOLO</p><h2>{selectedProduct.name}</h2></div><button className="icon-button" onClick={() => setSelectedProduct(null)}><X size={18} /></button></header><div className="drawer-content"><div className="detail-icon"><Package size={26} /></div><span className="stock-badge">{selectedProduct.category}</span><div className="detail-list"><Detail label="Codice a barre" value={selectedProduct.code} /><Detail label="Prezzo vendita" value={money.format(selectedProduct.sale_price)} /><Detail label="Prezzo acquisto" value={money.format(selectedProduct.purchase_price)} /><Detail label="Giacenza" value={`${selectedProduct.stock} pezzi`} /><Detail label="Soglia minima" value={`${selectedProduct.low_stock_threshold} pezzi`} /><Detail label="Margine unitario" value={money.format(selectedProduct.sale_price - selectedProduct.purchase_price)} /></div></div><footer className="drawer-footer"><button className="button button-outline full-width" onClick={() => { setProductForm({ code: selectedProduct.code, name: selectedProduct.name, category: selectedProduct.category, sale_price: selectedProduct.sale_price, purchase_price: selectedProduct.purchase_price, stock: selectedProduct.stock, low_stock_threshold: selectedProduct.low_stock_threshold }); setSelectedProduct(null); }}><Settings size={15} /> Modifica articolo</button><button className="button button-outline full-width" onClick={() => { setStockInput(String(selectedProduct.stock)); setStockProduct(selectedProduct); setSelectedProduct(null); }}><Package size={15} /> Nuova Giacenza</button></footer></aside></div>}
    {checkoutOpen && <Modal title="Pagamento" close={() => setCheckoutOpen(false)}><div className="payment-content"><div className="payment-total"><span>Totale da pagare</span><strong>{money.format(total)}</strong></div>{automaticDiscount > 0 && <div className="payment-promotion-info"><strong>Offerte automatiche applicate</strong>{appliedAutomaticOffers.map((offer) => <span key={offer.id}>{offer.name} · {offer.percentage}%</span>)}<small>Risparmio: {money.format(automaticDiscount)}</small></div>}<SelectField label="Metodo di pagamento" value={paymentMethod} onChange={setPaymentMethod} options={['Carta', 'Contanti', 'Bancomat', 'Buono']} />{activePromotions.some((item) => item.application_mode === 'Manuale') && <SelectField label="Promozione manuale" value={activePromotion} onChange={setActivePromotion} options={['', ...activePromotions.filter((item) => item.application_mode === 'Manuale').map((item) => String(item.id))]} labels={['Nessuna', ...activePromotions.filter((item) => item.application_mode === 'Manuale').map((item) => `${item.name} · ${item.percentage}%`)]} />}<Field label="Sconto aggiuntivo (€)" type="number" min="0" step="0.01" max={subtotal - promotionDiscount} value={discount} onChange={(e) => setDiscount(Number(e.target.value))} /><div className="payment-note"><ShieldCheck size={16} />Lo scontrino viene registrato nel database locale.</div><button className="button button-primary full-width" onClick={() => void checkout()}><Check size={17} /> Conferma e stampa scontrino</button></div></Modal>}
    {receipt && <Modal title={`Scontrino #${receipt.receipt_no}`} close={() => setReceipt(null)}><div className="receipt-print" id="receipt-print"><div className="receipt-shop">{data.settings.shop_name}</div><div className="receipt-spacer" /><div className="receipt-datetime"><span>{receiptDate.format(new Date(receipt.created_at))}</span><span>{receiptTime.format(new Date(receipt.created_at))}</span></div><div>Numero scontrino: {receipt.receipt_no}</div><div className="receipt-dash" /><div className="receipt-spacer" /><div className="receipt-head"><span>Articolo</span><span>Qtà</span><span>Prezzo</span></div>{receipt.items.map((item, index) => <div className="receipt-item" key={`${item.code}-${index}`}><span>{item.name}</span><span>{item.quantity}</span><span>{money.format(item.unit_price * item.quantity)}</span></div>)}<div className="receipt-dash" /><div className="receipt-total"><strong>TOTALE</strong><strong>{money.format(receipt.total)}</strong></div><div>Pagamento: {receipt.payment_method}</div><div className="receipt-dash" /><div className="receipt-spacer" /><svg id="receipt-barcode" /><div className="receipt-spacer" /><div className="receipt-thanks">Grazie per averci scelto!</div></div><div className="receipt-actions"><button className="button button-primary full-width" onClick={printReceipt}><Printer size={16} /> Stampa scontrino</button></div></Modal>}
    {saleDialog && <Modal title={`Vendita #${saleDialog.receipt_no}`} close={() => setSaleDialog(null)} wide><div className="sale-edit"><div className="sale-edit-fields"><SelectField label="Metodo di pagamento" value={saleDialog.payment_method} onChange={(value) => setSaleDialog({ ...saleDialog, payment_method: value })} options={['Carta', 'Contanti', 'Bancomat', 'Buono']} /><Field label="Sconto (€)" type="number" min="0" step="0.01" value={saleDialog.discount} onChange={(e) => setSaleDialog({ ...saleDialog, discount: Number(e.target.value) })} /></div><div className="edit-item-list"><div className="edit-list-head"><span>Articolo</span><span>Quantità</span><span>Prezzo</span></div>{saleDialog.items.map((item, index) => <div className="edit-item" key={`${item.product_id}-${index}`}><span>{item.name}</span><input aria-label={`Quantità ${item.name}`} type="number" min="0" step="1" value={item.quantity} onChange={(e) => setSaleDialog({ ...saleDialog, items: saleDialog.items.map((line, i) => i === index ? { ...line, quantity: Number(e.target.value) } : line) })} /><span>{money.format(item.unit_price)}</span></div>)}</div><div className="sale-edit-total"><span>Nuovo totale</span><strong>{money.format(Math.max(0, saleDialog.items.reduce((sum, item) => sum + item.quantity * item.unit_price, 0) - saleDialog.discount))}</strong></div><div className="sale-edit-actions"><button className="button button-danger" onClick={() => void deleteSale(saleDialog)}><Trash2 size={15} /> Elimina vendita</button><button className="button button-primary" onClick={() => void updateSale()}><Check size={15} /> Salva modifiche</button></div></div></Modal>}
    {camera && <CameraScanner close={() => setCamera(false)} scan={(code) => { setCamera(false); if (section === 'cash') scanCode(code); else if (section === 'sale-management') { setSaleLookup(code); const sale = data.sales.find((item) => item.receipt_no === code); if (sale) setSaleDialog({ ...sale, items: sale.items.map((item) => ({ ...item })) }); else notify('Codice non associato a uno scontrino'); } else setSaleSearch(code); }} />}
    {notice && <div className="toast">{notice}</div>}
  </div>;
}

function Metric({ icon: Icon, label, value, detail, compact = false }: { icon: typeof House; label: string; value: string; detail: string; compact?: boolean }) {
  return <section className={`metric-card${compact ? ' compact' : ''}`}><div className="metric-icon"><Icon size={18} /></div><span className="metric-label">{label}</span><strong>{value}</strong><small>{detail}</small></section>;
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
function SearchInput({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }) {
  return <label className="search-field"><Search size={17} /><input placeholder={placeholder} value={value} onChange={(event) => onChange(event.target.value)} /></label>;
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