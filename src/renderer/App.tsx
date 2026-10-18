import { useEffect, useRef, useState } from 'react';
import type { FormEvent, InputHTMLAttributes, ReactNode } from 'react';
import { Archive, ArrowDownToLine, ArrowLeft, BarChart3, Banknote, Barcode, Camera, Check, ChevronDown, CircleAlert, ClipboardList, CreditCard, Eye, House, LockKeyhole, Minus, Package, Pencil, Plus, Printer, Search, Settings, Share2, ShieldCheck, ShoppingBasket, ShoppingCart, Store, Trash2, TrendingUp, X } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import JSZip from 'jszip';
import JsBarcode from 'jsbarcode';
import { calculatePromotionDiscounts } from '../shared/promotions';
import { voucherCodePrefix } from '../shared/vouchers';
import homeBanner from './home-banner.svg';
import type { AppState, Customer, Employee, EmployeeInput, Expense, LoyaltyCard, Printer as PrinterDevice, Product, ProductInput, ProductUnit, Promotion, PromotionInput, Sale, SaleItem, Section } from '../shared/types';

const money = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' });
const dateTime = new Intl.DateTimeFormat('it-IT', { dateStyle: 'short', timeStyle: 'short' });
const receiptDate = new Intl.DateTimeFormat('it-IT', { dateStyle: 'short' });
const receiptTime = new Intl.DateTimeFormat('it-IT', { timeStyle: 'short' });
const quantityFormat = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 3 });
const receiptQuantity = quantityFormat;
const roundQuantity = (quantity: number) => Math.round((quantity + Number.EPSILON) * 1000) / 1000;
const colors = ['#416e59', '#c17e4f', '#658499', '#a9aa64', '#8a7461', '#609085'];
const localDateKey = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const safeFilePart = (value: string) => value.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-').trim() || 'Dipendente';
const permanentPromotionEnd = '9999-12-31';
const promotionDurations = ['1 giorno', '3 giorni', '7 giorni', '1 mese', 'Sempre', 'Personalizzata'];
const expenseCategories = ['Affitto', 'Utenze', 'Forniture', 'Stipendi', 'Manutenzione', 'Trasporti', 'Altro'];
type PromotionMinimum = 'none' | 'spend' | 'kilograms' | 'pieces' | 'liters';
const nav: { section: Section; label: string; icon: typeof House }[] = [
  { section: 'home', label: 'Homepage', icon: House }, { section: 'inventory', label: 'Magazzino', icon: Package },
  { section: 'cash', label: 'Cassa', icon: ShoppingBasket }, { section: 'sales', label: 'Vendite', icon: ClipboardList },
  { section: 'statistics', label: 'Statistiche', icon: BarChart3 },
];
const sectionNames: Partial<Record<Section, string>> = {
  'inventory-history': 'Storico Magazzino', 'stock-movement': 'Carica e scarica merce',
  promotions: 'Offerta', 'vouchers-create': 'Crea buoni sconto',
  'vouchers-list': 'Lista buoni sconto',
  'accounting-statistics': 'Statistiche', expenses: 'Spese', statistics: 'Analisi vendite', 'financial-balance': 'Bilancio gestionale', clients: 'Clienti',
  'client-list': 'Lista clienti', 'cards-list': 'Lista tessere', 'cards-activate': 'Attiva tessera',
  'cards-create': 'Sviluppa tessera', 'cards-developed': 'Tessere sviluppate', 'expired-products': 'Gestisci articoli scaduti',
  employees: 'Lista Dipendenti', 'employee-create': 'Crea Dipendente', payroll: 'Paga Stipendi',
};
const voucherCodeSpace = 10_000_000_000;
function randomVoucherCode(prefix: string, usedCodes: Set<string>): string {
  const randomValues = new Uint8Array(1);
  let code = '';
  do {
    let digits = '';
    for (let index = 0; index < 10; index += 1) {
      let value: number;
      do {
        window.crypto.getRandomValues(randomValues);
        value = randomValues[0];
      } while (value >= 250);
      digits += String(value % 10);
    }
    code = `${prefix}${digits}`;
  } while (usedCodes.has(code));
  usedCodes.add(code);
  return code;
}
function employeeDocumentImages(documentsData: string): string[] {
  try {
    const parsed: unknown = JSON.parse(documentsData);
    if (Array.isArray(parsed) && parsed.every((image) => typeof image === 'string')) return parsed;
  } catch {
    return documentsData ? [documentsData] : [];
  }
  return documentsData ? [documentsData] : [];
}
function newEmployeeDraft(employees: Employee[]): EmployeeInput {
  const usedRecognitionCodes = new Set(employees.map((employee) => employee.recognition_code));
  const usedBarcodes = new Set(employees.map((employee) => employee.barcode));
  const randomCode = (length: number) => {
    const values = new Uint32Array(1);
    let code = '';
    do {
      window.crypto.getRandomValues(values);
      code = String(values[0] % 10 ** length).padStart(length, '0');
    } while (length === 8 ? usedRecognitionCodes.has(`DIP-${code}`) : usedBarcodes.has(code));
    return code;
  };
  return {
    first_name: '', last_name: '', age: 18, gender: '', home_address: '', email: '', initial_password: '',
    phone: '', operational_site: '', role: '', shift: '', salary: 0, payment_method: 'Contanti', iban: '',
    recognition_code: `DIP-${randomCode(8)}`, barcode: randomCode(12),
    photo_data: '', documents_data: '[]', contract_pdf_data: '',
  };
}
function barcodePng(code: string): string {
  const canvas = document.createElement('canvas');
  JsBarcode(canvas, code, { format: 'CODE128', width: 1.5, height: 36, displayValue: false, margin: 0 });
  return canvas.toDataURL('image/png');
}
function fileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`Impossibile leggere il file ${file.name}.`));
    reader.onload = () => typeof reader.result === 'string'
      ? resolve(reader.result)
      : reject(new Error(`Formato non valido per il file ${file.name}.`));
    reader.readAsDataURL(file);
  });
}
function dataUrlExtension(value: string): string {
  const mime = value.slice(5, value.indexOf(';')).toLowerCase();
  return mime === 'application/pdf' ? 'pdf' : mime === 'image/jpeg' ? 'jpg' : mime === 'image/webp' ? 'webp' : 'png';
}
function imageAsPng(dataUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onerror = () => reject(new Error('Impossibile inserire la foto del dipendente nel PDF.'));
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d');
      if (!context) {
        reject(new Error('Impossibile preparare la foto per il PDF.'));
        return;
      }
      context.drawImage(image, 0, 0);
      resolve(canvas.toDataURL('image/png'));
    };
    image.src = dataUrl;
  });
}
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

function Modal({ title, close, children, wide = false, rightHalf = false, narrowPanel = false }: { title: string; close: () => void; children: ReactNode; wide?: boolean; rightHalf?: boolean; narrowPanel?: boolean }) {
  return <div className={`modal-backdrop${rightHalf ? ' modal-right-half' : ''}`} onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}><section className={`modal${wide ? ' modal-wide' : ''}${rightHalf ? ' modal-payment-panel' : ''}${narrowPanel ? ' modal-payment-narrow' : ''}`} role="dialog" aria-modal="true"><header className="modal-header"><div><p className="eyebrow">GESTIONALE</p><h2>{title}</h2></div><button className="icon-button" onClick={close} aria-label="Chiudi"><X size={18} /></button></header>{children}</section></div>;
}

function BarcodeImage({ value }: { value: string }) {
  const barcode = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (barcode.current) JsBarcode(barcode.current, value, { format: 'CODE128', width: 1.2, height: 28, displayValue: false, margin: 0 });
  }, [value]);
  return <svg className="barcode-image" ref={barcode} role="img" aria-label={`Barcode ${value}`} />;
}

function EmployeeForm({ initial, save, cancel, notify }: { initial: EmployeeInput; save: (employee: EmployeeInput) => Promise<void>; cancel: () => void; notify: (message: string) => void }) {
  const [employee, setEmployee] = useState(initial);
  const [saving, setSaving] = useState(false);
  const documentImages = employeeDocumentImages(employee.documents_data);
  const setAttachment = async (field: 'photo_data' | 'contract_pdf_data', file: File | undefined) => {
    if (!file) return;
    const isContract = field === 'contract_pdf_data';
    const allowedType = isContract ? file.type === 'application/pdf' : ['image/png', 'image/jpeg', 'image/webp'].includes(file.type);
    const maxSize = isContract ? 10 * 1024 * 1024 : 5 * 1024 * 1024;
    if (!allowedType || file.size > maxSize) {
      notify(isContract ? 'Allega un contratto PDF di massimo 10 MB.' : 'Allega un’immagine PNG, JPG o WEBP di massimo 5 MB.');
      return;
    }
    try {
      const dataUrl = await fileAsDataUrl(file);
      setEmployee((current) => ({ ...current, [field]: dataUrl }));
    } catch (error) {
      notify(errorText(error));
    }
  };
  const addDocumentImages = async (files: FileList | null) => {
    if (!files?.length) return;
    const selectedFiles = Array.from(files);
    if (documentImages.length + selectedFiles.length > 20
      || selectedFiles.some((file) => !['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024)) {
      notify('Puoi allegare fino a 20 immagini PNG, JPG o WEBP da massimo 5 MB ciascuna.');
      return;
    }
    try {
      const images = await Promise.all(selectedFiles.map(fileAsDataUrl));
      setEmployee((current) => ({
        ...current,
        documents_data: JSON.stringify([...employeeDocumentImages(current.documents_data), ...images]),
      }));
    } catch (error) {
      notify(errorText(error));
    }
  };
  const removeDocumentImage = (index: number) => {
    setEmployee((current) => ({
      ...current,
      documents_data: JSON.stringify(employeeDocumentImages(current.documents_data).filter((_, imageIndex) => imageIndex !== index)),
    }));
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!employee.photo_data || !documentImages.length || !employee.contract_pdf_data) {
      notify('Allega la foto del dipendente, la foto dei documenti e il contratto PDF.');
      return;
    }
    setSaving(true);
    try {
      await save(employee);
    } catch (error) {
      notify(errorText(error));
    } finally {
      setSaving(false);
    }
  };
  return <form className="employee-form" onSubmit={submit}>
    <div className="employee-uploads">
      <label className="employee-upload">
        <span>Foto del dipendente</span>
        <div className="employee-upload-box">{employee.photo_data ? <img src={employee.photo_data} alt="Foto del dipendente" /> : <><Camera size={25} /><small>Seleziona immagine</small></>}</div>
        <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => void setAttachment('photo_data', event.target.files?.[0])} />
      </label>
      <div className="employee-upload employee-document-upload">
        <span>Foto documenti</span>
        <div className="employee-document-images">{documentImages.map((image, index) => <div className="employee-document-image" key={`${index}-${image.slice(0, 32)}`}><img src={image} alt={`Documento ${index + 1}`} /><button type="button" className="icon-button small" aria-label={`Rimuovi documento ${index + 1}`} onClick={() => removeDocumentImage(index)}><X size={14} /></button></div>)}
          <label className="employee-upload-box employee-document-add"><Camera size={25} /><small>Aggiungi immagini</small><input type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={(event) => { void addDocumentImages(event.target.files); event.currentTarget.value = ''; }} /></label>
        </div>
        <small>PNG, JPG o WEBP · massimo 5 MB ciascuna</small>
      </div>
    </div>
    <label className="field employee-contract"><span>Contratto in PDF</span><input type="file" accept="application/pdf,.pdf" onChange={(event) => void setAttachment('contract_pdf_data', event.target.files?.[0])} />{employee.contract_pdf_data && <small>Contratto PDF allegato</small>}</label>
    <div className="employee-fields">
      <Field label="Nome" value={employee.first_name} onChange={(event) => setEmployee({ ...employee, first_name: event.target.value })} required />
      <Field label="Cognome" value={employee.last_name} onChange={(event) => setEmployee({ ...employee, last_name: event.target.value })} required />
      <Field label="Età" type="number" min="16" max="100" step="1" value={employee.age} onChange={(event) => setEmployee({ ...employee, age: Number(event.target.value) })} required />
      <label className="field"><span>Sesso</span><select value={employee.gender} onChange={(event) => setEmployee({ ...employee, gender: event.target.value })} required><option value="">Seleziona sesso</option><option>Donna</option><option>Uomo</option><option>Altro</option></select></label>
      <Field fieldClassName="employee-wide-field" label="Indirizzo di casa" value={employee.home_address} onChange={(event) => setEmployee({ ...employee, home_address: event.target.value })} required />
      <Field label="Indirizzo email" type="email" value={employee.email} onChange={(event) => setEmployee({ ...employee, email: event.target.value })} required />
      <Field label="Password iniziale" type="password" autoComplete="new-password" minLength={8} value={employee.initial_password} onChange={(event) => setEmployee({ ...employee, initial_password: event.target.value })} required />
      <Field label="Numero di telefono" type="tel" value={employee.phone} onChange={(event) => setEmployee({ ...employee, phone: event.target.value })} required />
      <Field label="Sede Operativa" value={employee.operational_site} onChange={(event) => setEmployee({ ...employee, operational_site: event.target.value })} required />
      <Field label="Ruolo" value={employee.role} onChange={(event) => setEmployee({ ...employee, role: event.target.value })} required />
      <label className="field"><span>Turno</span><select value={employee.shift} onChange={(event) => setEmployee({ ...employee, shift: event.target.value })} required><option value="">Seleziona turno</option><option>Mattina</option><option>Pomeriggio</option><option>Notte</option><option>Turno unico</option><option>Variabile</option></select></label>
      <label className="field"><span>Metodo di pagamento</span><select value={employee.payment_method} onChange={(event) => setEmployee({ ...employee, payment_method: event.target.value as EmployeeInput['payment_method'], iban: event.target.value === 'Bonifico' ? employee.iban : '' })} required><option>Contanti</option><option>Bonifico</option></select></label>
      <Field label="IBAN" value={employee.iban} onChange={(event) => setEmployee({ ...employee, iban: event.target.value.toUpperCase() })} disabled={employee.payment_method !== 'Bonifico'} required={employee.payment_method === 'Bonifico'} />
      <Field label="Stipendio (€)" type="number" min="0" step="0.01" value={employee.salary} onChange={(event) => setEmployee({ ...employee, salary: Number(event.target.value) })} required />
      <Field label="Codice riconoscimento" value={employee.recognition_code} readOnly />
      <label className="field employee-barcode-field"><span>Barcode di riconoscimento</span><div className="employee-barcode"><BarcodeImage value={employee.barcode} /><small>{employee.barcode}</small></div></label>
    </div>
    <div className="form-actions"><button className="button button-quiet" type="button" onClick={cancel}>Annulla</button><button className="button button-primary" disabled={saving}><Check size={16} /> Crea dipendente</button></div>
  </form>;
}

function ProductForm({ initial, save, close, categories, onDelete }: { initial: ProductInput; save: (product: ProductInput) => Promise<void>; close: () => void; categories: string[]; onDelete?: () => Promise<void> }) {
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
    <label className="field product-category-field"><span>Categoria</span><select value={product.category} onChange={(event) => change('category', event.target.value)} required>{[...new Set([...categories, product.category].filter(Boolean))].map((item) => <option key={item}>{item}</option>)}</select></label>
    <div className={`form-actions${onDelete ? ' has-delete' : ''}`}>{onDelete && <button className="button button-danger product-delete-button" type="button" onClick={() => void onDelete()}>Elimina articolo</button>}<button className="button button-quiet" type="button" onClick={close}>Annulla</button><button className="button button-primary" disabled={saving}><Check size={16} /> Salva articolo</button></div>
  </form></Modal>;
}

export default function App() {
  const [data, setData] = useState<AppState | null>(null);
  const [section, setSection] = useState<Section>('home');
  const [openSidebarMenu, setOpenSidebarMenu] = useState<'inventory' | 'offers' | 'statistics' | 'employees' | 'clients' | null>(null);
  const [appTheme, setAppTheme] = useState<'green' | 'blue'>(() => window.localStorage.getItem('app-theme') === 'blue' ? 'blue' : 'green');
  const [stockMovementType, setStockMovementType] = useState<'Carico' | 'Scarico'>('Carico');
  const [stockMovementProduct, setStockMovementProduct] = useState('');
  const [stockMovementQuantity, setStockMovementQuantity] = useState('');
  const [stockMovementNote, setStockMovementNote] = useState('');
  const [stockMovementEmployeeBarcode, setStockMovementEmployeeBarcode] = useState('');
  const [stockMovementDestination, setStockMovementDestination] = useState('');
  const [inventoryHistoryPeriod, setInventoryHistoryPeriod] = useState('Tutti');
  const [inventoryHistoryFrom, setInventoryHistoryFrom] = useState('');
  const [inventoryHistoryTo, setInventoryHistoryTo] = useState('');
  const [inventoryHistorySearch, setInventoryHistorySearch] = useState('');
  const [statisticsPeriod, setStatisticsPeriod] = useState('Tutti');
  const [unsoldListOpen, setUnsoldListOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<string | null>(null);
  const [voucherPrintBatch, setVoucherPrintBatch] = useState<AppState['voucherBatches'][number] | null>(null);
  const [voucherViewBatch, setVoucherViewBatch] = useState<AppState['voucherBatches'][number] | null>(null);
  const [voucherPercentage, setVoucherPercentage] = useState('10');
  const [voucherQuantity, setVoucherQuantity] = useState('1');
  const [voucherStartsAt, setVoucherStartsAt] = useState(localDateKey());
  const [voucherEndsAt, setVoucherEndsAt] = useState(localDateKey());
  const [voucherPreview, setVoucherPreview] = useState<{ discount_percentage: number; starts_at: string; ends_at: string; codes: string[] } | null>(null);
  const [editingVoucherBatchId, setEditingVoucherBatchId] = useState<number | null>(null);
  const [balancePeriod, setBalancePeriod] = useState<'Ultimi 3 mesi' | 'Ultimi 6 mesi' | 'Ultimo anno'>('Ultimi 6 mesi');
  const [printers, setPrinters] = useState<PrinterDevice[]>([]);
  const [locked, setLocked] = useState(true);
  const [hasPin, setHasPin] = useState(false);
  const [pin, setPin] = useState('');
  const [notice, setNotice] = useState('');
  const [productForm, setProductForm] = useState<ProductInput | null>(null);
  const [productEditingId, setProductEditingId] = useState<number | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [stockProduct, setStockProduct] = useState<Product | null>(null);
  const [stockInput, setStockInput] = useState('');
  const [saleDialog, setSaleDialog] = useState<Sale | null>(null);
  const [saleDiscountPercentage, setSaleDiscountPercentage] = useState(0);
  const [saleAdjustment, setSaleAdjustment] = useState<number | null>(null);
  const [receipt, setReceipt] = useState<Sale | null>(null);
  const [cart, setCart] = useState<SaleItem[]>([]);
  const [scannerSearch, setScannerSearch] = useState('');
  const [inventorySearch, setInventorySearch] = useState('');
  const [employeeSearch, setEmployeeSearch] = useState('');
  const [employeeDraft, setEmployeeDraft] = useState<EmployeeInput | null>(null);
  const [employeeDetails, setEmployeeDetails] = useState<Employee | null>(null);
  const [reportExportOpen, setReportExportOpen] = useState(false);
  const [reportExportType, setReportExportType] = useState<'sales-pdf' | 'sales-csv' | 'balance'>('sales-pdf');
  const [customerForm, setCustomerForm] = useState({ first_name: '', last_name: '', phone: '', email: '', address: '' });
  const [cardQuantity, setCardQuantity] = useState('1');
  const [cardDiscount, setCardDiscount] = useState('0');
  const [activationCardId, setActivationCardId] = useState('');
  const [activationCustomerId, setActivationCustomerId] = useState('');
  const [cardSearch, setCardSearch] = useState('');
  const [developedCardSearch, setDevelopedCardSearch] = useState('');
  const [checkoutCardBarcode, setCheckoutCardBarcode] = useState('');
  const [checkoutRedeemPoints, setCheckoutRedeemPoints] = useState('');
  const [payrollMonth, setPayrollMonth] = useState(localDateKey().slice(0, 7));
  const [payrollDate, setPayrollDate] = useState(localDateKey());
  const [expenseSearch, setExpenseSearch] = useState('');
  const [expenseDescription, setExpenseDescription] = useState('');
  const [expenseCategory, setExpenseCategory] = useState(expenseCategories[0]);
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expenseDate, setExpenseDate] = useState(localDateKey());
  const [expenseReceiptData, setExpenseReceiptData] = useState('');
  const [inventoryStatus, setInventoryStatus] = useState<'all' | 'available' | 'low' | 'out'>('available');
  const [saleSearch, setSaleSearch] = useState('');
  const [salesPeriod, setSalesPeriod] = useState('Tutti');
  const [salesFrom, setSalesFrom] = useState('');
  const [salesTo, setSalesTo] = useState('');
  const [salesCategory, setSalesCategory] = useState('Tutte');
  const [category, setCategory] = useState('Tutte');
  const [paymentMethod, setPaymentMethod] = useState('Carta');
  const [voucherCode, setVoucherCode] = useState('');
  const [voucherMessage, setVoucherMessage] = useState('');
  const [voucherDiscountPercentage, setVoucherDiscountPercentage] = useState(0);
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

  useEffect(() => {
    document.documentElement.dataset.theme = appTheme;
    window.localStorage.setItem('app-theme', appTheme);
  }, [appTheme]);

  const refresh = async () => { const next = await window.gestionale.getState(); setData(next); setShopName(next.settings.shop_name); setArchiveFolder(next.settings.archive_folder); return next; };
  const notify = (text: string) => { setNotice(text); window.setTimeout(() => setNotice(''), 3600); };
  const navigateTo = (target: Section) => { setSection(target); setOpenSidebarMenu(null); };
  const saveEmployee = async (employee: EmployeeInput) => {
    await window.gestionale.saveEmployee(employee);
    await refresh();
    setSection('employees');
    setOpenSidebarMenu(null);
    setEmployeeDraft(null);
    notify('Dipendente creato correttamente.');
  };
  const saveExpense = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await window.gestionale.saveExpense({
        description: expenseDescription,
        category: expenseCategory,
        amount: Number(expenseAmount),
        expense_date: expenseDate,
        site: 'Negozio',
        receipt_data: expenseReceiptData,
      });
      await refresh();
      setExpenseDescription('');
      setExpenseCategory(expenseCategories[0]);
      setExpenseAmount('');
      setExpenseDate(localDateKey());
      setExpenseReceiptData('');
      notify('Spesa registrata correttamente.');
    } catch (error) {
      notify(errorText(error));
    }
  };
  const attachExpenseReceipt = async (file: File | undefined) => {
    if (!file) return;
    if (!['application/pdf', 'image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024) {
      notify('Allega una ricevuta PDF, PNG, JPG o WEBP di massimo 10 MB.');
      return;
    }
    try {
      setExpenseReceiptData(await fileAsDataUrl(file));
    } catch (error) {
      notify(errorText(error));
    }
  };
  const deleteExpense = async (expense: Expense) => {
    if (!window.confirm(`Eliminare la spesa "${expense.description}"?`)) return;
    try {
      await window.gestionale.deleteExpense(expense.id);
      await refresh();
      notify('Spesa eliminata.');
    } catch (error) {
      notify(errorText(error));
    }
  };
  const deleteLoyaltyCard = async (card: LoyaltyCard) => {
    if (!window.confirm(`Eliminare la tessera ${card.code}?`)) return;
    try {
      await window.gestionale.deleteLoyaltyCard(card.id);
      await refresh();
      notify('Tessera eliminata.');
    } catch (error) {
      notify(errorText(error));
    }
  };
  const deleteProduct = async (product: Product) => {
    if (!window.confirm(`Eliminare l'articolo "${product.name}"?`)) return;
    try {
      await window.gestionale.deleteProduct(product.id);
      await refresh();
      setSelectedProduct(null);
      setProductForm(null);
      notify('Articolo eliminato.');
    } catch (error) {
      notify(errorText(error));
    }
  };
  const disposeExpiredProduct = async (product: Product) => {
    if (!window.confirm(`Confermi lo smaltimento di ${product.name}? La giacenza verrà scaricata.`)) return;
    try {
      await window.gestionale.disposeExpiredProduct(product.id);
      await refresh();
      notify(`${product.name} smaltito.`);
    } catch (error) {
      notify(errorText(error));
    }
  };
  const createEmployeePdf = async (employee: Employee, doc = new jsPDF(), addPage = false) => {
    if (addPage) doc.addPage();
    const photo = await imageAsPng(employee.photo_data);
    const documents = await Promise.all(employeeDocumentImages(employee.documents_data).map(imageAsPng));
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text('Scheda dipendente', 14, 18);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(`${data?.settings.shop_name ?? ''} · ${receiptDate.format(new Date())}`, 14, 25);
    doc.addImage(photo, 'PNG', 154, 32, 42, 42);
    const details: [string, string][] = [
      ['Nome e cognome', `${employee.first_name} ${employee.last_name}`],
      ['Età', String(employee.age)],
      ['Sesso', employee.gender],
      ['Indirizzo', employee.home_address],
      ['Email', employee.email],
      ['Telefono', employee.phone],
      ['Sede operativa', employee.operational_site],
      ['Ruolo', employee.role],
      ['Turno', employee.shift],
      ['Stipendio', money.format(employee.salary)],
      ['Metodo di pagamento', employee.payment_method],
      ['IBAN', employee.payment_method === 'Bonifico' ? employee.iban : '—'],
      ['Codice riconoscimento', employee.recognition_code],
      ['Barcode', employee.barcode],
      ['Contratto', employee.contract_pdf_data ? 'PDF allegato' : 'Non presente'],
      ['Data di registrazione', dateTime.format(new Date(employee.created_at))],
    ];
    let y = 38;
    details.forEach(([label, value]) => {
      const wrappedValue = doc.splitTextToSize(value || '—', 126);
      doc.setFont('helvetica', 'bold');
      doc.text(`${label}:`, 14, y);
      doc.setFont('helvetica', 'normal');
      doc.text(wrappedValue, 58, y);
      y += Math.max(7, wrappedValue.length * 5);
    });
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('Foto documenti', 14, 151);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    if (!documents.length) doc.text('Nessuna immagine allegata', 14, 160);
    documents.slice(0, 20).forEach((image, index) => {
      const column = index % 4;
      const row = Math.floor(index / 4);
      doc.addImage(image, 'PNG', 14 + column * 46, 157 + row * 26, 42, 22, undefined, 'FAST');
    });
    return doc;
  };
  const createSalaryPdf = (employee: Employee, paymentDate: string, month: string, amount = employee.salary) => {
    const doc = new jsPDF();
    const displayName = `${employee.first_name} ${employee.last_name}`;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.text(data?.settings.shop_name ?? 'Gestionale', 14, 20);
    doc.setFontSize(15);
    doc.text('Ricevuta pagamento stipendio', 14, 38);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.text(`Dipendente: ${displayName}`, 14, 54);
    doc.text(`Ruolo: ${employee.role}`, 14, 63);
    doc.text(`Mese di competenza: ${month}`, 14, 72);
    doc.text(`Data pagamento: ${receiptDate.format(new Date(`${paymentDate}T00:00:00`))}`, 14, 81);
    doc.text(`Metodo: ${employee.payment_method}`, 14, 90);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.text(`Importo: ${money.format(amount)}`, 14, 106);
    doc.setDrawColor(90, 100, 93);
    doc.rect(14, 230, 82, 38);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text('Firma del dipendente per ricevuta', 18, 264);
    doc.line(18, 258, 92, 258);
    return doc;
  };
  const savePdf = (doc: jsPDF, filename: string) => doc.save(filename);
  const exportEmployeePdf = async (employee: Employee) => {
    try {
      const doc = await createEmployeePdf(employee);
      savePdf(doc, `dipendente-${safeFilePart(employee.first_name)}-${safeFilePart(employee.last_name)}.pdf`);
    } catch (error) {
      notify(errorText(error));
    }
  };
  const printEmployeePdf = async (employee: Employee) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      notify('Consenti le finestre popup per stampare la scheda dipendente.');
      return;
    }
    try {
      const doc = await createEmployeePdf(employee);
      const url = URL.createObjectURL(doc.output('blob'));
      printWindow.location.href = url;
      printWindow.addEventListener('afterprint', () => URL.revokeObjectURL(url), { once: true });
      window.setTimeout(() => printWindow.print(), 800);
    } catch (error) {
      printWindow.close();
      notify(errorText(error));
    }
  };
  const exportPayrollZip = async (payments: AppState['payrollPayments']) => {
    if (!data || !payments.length) {
      notify('Non ci sono ricevute da scaricare per questo mese.');
      return;
    }
    const monthDate = new Date(`${payrollMonth}-01T00:00:00`);
    const monthName = monthDate.toLocaleDateString('it-IT', { month: 'long' });
    const folderName = `Stipendi ${monthName.charAt(0).toLocaleUpperCase('it-IT') + monthName.slice(1)} ${monthDate.getFullYear()}`;
    const zip = new JSZip();
    const folder = zip.folder(folderName);
    if (!folder) throw new Error('Impossibile creare la cartella delle ricevute.');
    for (const payment of payments) {
      const employee = data.employees.find((item) => item.id === payment.employee_id);
      if (!employee) throw new Error(`Dipendente non trovato per la ricevuta di ${payment.first_name} ${payment.last_name}.`);
      const pdf = createSalaryPdf(employee, payment.payment_date, payment.pay_month, payment.amount);
      folder.file(`Stipendio-${safeFilePart(employee.first_name)}-${safeFilePart(employee.last_name)}-${payment.payment_date}.pdf`, pdf.output('blob'));
    }
    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${folderName}.zip`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const payEmployee = async (employee: Employee) => {
    try {
      await window.gestionale.paySalary({ employee_id: employee.id, pay_month: payrollMonth, payment_date: payrollDate });
      const next = await refresh();
      const payment = next.payrollPayments.find((item) => item.employee_id === employee.id && item.pay_month === payrollMonth);
      if (payment) savePdf(createSalaryPdf(employee, payment.payment_date, payment.pay_month, payment.amount), `Stipendio-${safeFilePart(employee.first_name)}-${safeFilePart(employee.last_name)}-${payment.payment_date}.pdf`);
      notify(`Stipendio di ${employee.first_name} registrato.`);
    } catch (error) {
      notify(errorText(error));
    }
  };
  const payAllEmployees = async () => {
    if (!data) return;
    const alreadyPaid = new Set(data.payrollPayments.filter((payment) => payment.pay_month === payrollMonth).map((payment) => payment.employee_id));
    const dueEmployees = data.employees.filter((employee) => !alreadyPaid.has(employee.id));
    if (!dueEmployees.length) {
      notify('Tutti gli stipendi di questo mese risultano già pagati.');
      return;
    }
    try {
      await window.gestionale.payAllSalaries({ pay_month: payrollMonth, payment_date: payrollDate });
      const next = await refresh();
      const justPaidIds = new Set(dueEmployees.map((employee) => employee.id));
      const payments = next.payrollPayments.filter((payment) => payment.pay_month === payrollMonth && justPaidIds.has(payment.employee_id));
      try {
        await exportPayrollZip(payments);
      } catch (error) {
        notify(`Stipendi registrati, ma non è stato possibile creare lo ZIP: ${errorText(error)}`);
        return;
      }
      notify('Stipendi registrati e ricevute scaricate.');
    } catch (error) {
      notify(errorText(error));
    }
  };
  const saveCustomer = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await window.gestionale.saveCustomer(customerForm);
      await refresh();
      setCustomerForm({ first_name: '', last_name: '', phone: '', email: '', address: '' });
      notify('Cliente registrato.');
    } catch (error) {
      notify(errorText(error));
    }
  };
  const generateCards = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await window.gestionale.generateLoyaltyCards({ quantity: Number(cardQuantity), discount_percentage: Number(cardDiscount) });
      await refresh();
      setCardQuantity('');
      setCardDiscount('');
      notify('Tessere sviluppate correttamente.');
    } catch (error) {
      notify(errorText(error));
    }
  };
  const activateCard = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await window.gestionale.activateLoyaltyCard({ card_id: Number(activationCardId), customer_id: Number(activationCustomerId) });
      await refresh();
      setActivationCardId('');
      notify('Tessera attivata e associata al cliente.');
    } catch (error) {
      notify(errorText(error));
    }
  };
  const redeemCheckoutPoints = async () => {
    const card = data?.loyaltyCards.find((candidate) => candidate.barcode === checkoutCardBarcode.trim() && candidate.status === 'Attiva');
    if (!card) { notify('Scansiona il barcode di una tessera attiva.'); return; }
    const points = Number(checkoutRedeemPoints);
    if (!Number.isInteger(points) || points < 1 || points > card.points) { notify('Inserisci un numero di punti valido e disponibile.'); return; }
    try {
      await window.gestionale.redeemLoyaltyPoints({ card_id: card.id, points });
      await refresh();
      setCheckoutRedeemPoints('');
      notify('Punti scaricati dalla tessera.');
    } catch (error) {
      notify(errorText(error));
    }
  };
  useEffect(() => { void window.gestionale.hasPin().then((exists) => { setHasPin(exists); if (!exists) { setLocked(false); void refresh(); } }); }, []);
  useEffect(() => { const openCash = (event: KeyboardEvent) => { if (event.key === 'F2') { event.preventDefault(); navigateTo('cash'); } }; window.addEventListener('keydown', openCash); return () => window.removeEventListener('keydown', openCash); }, []);
  useEffect(() => {
    if (section === 'cash' && !camera && !pendingUnknownCode && !productForm) {
      requestAnimationFrame(() => document.getElementById('scanner-field')?.focus());
    }
  }, [section, camera, pendingUnknownCode, productForm]);
  useEffect(() => {
    if (stockProduct) setStockMovementEmployeeBarcode('');
  }, [stockProduct]);
  useEffect(() => { if (receipt) { const barcode = document.getElementById('receipt-barcode'); if (barcode) JsBarcode(barcode, receipt.receipt_no, { format: 'CODE128', width: 2.1, height: 48, displayValue: false, margin: 0 }); } }, [receipt]);
  useEffect(() => {
    if (!voucherPrintBatch) return;
    const clearPrintBatch = () => setVoucherPrintBatch(null);
    window.addEventListener('afterprint', clearPrintBatch);
    window.print();
    return () => window.removeEventListener('afterprint', clearPrintBatch);
  }, [voucherPrintBatch]);

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
  const saveProduct = async (item: ProductInput) => { try { await window.gestionale.saveProduct(item); await refresh(); setSelectedProduct(null); setProductEditingId(null); notify('Articolo salvato'); } catch (error) { notify(errorText(error)); throw error; } };
  const saveStock = async (event: FormEvent) => {
    event.preventDefault();
    if (!stockProduct) return;
    const quantity = Number(stockInput);
    if (!Number.isFinite(quantity) || quantity <= 0) { notify('Inserisci una quantità maggiore di zero.'); return; }
    if (!stockMovementEmployeeBarcode) { notify('Scansiona il barcode del personale prima di registrare il carico.'); return; }
    try {
      await window.gestionale.moveStock({ productId: stockProduct.id, type: 'Carico', quantity, employee_barcode: stockMovementEmployeeBarcode, note: 'Carico da dettaglio articolo' });
      await refresh();
      setStockProduct(null);
      setStockMovementEmployeeBarcode('');
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
      if (!stockMovementEmployeeBarcode) { notify('Scansiona il barcode del personale prima di registrare il movimento.'); return; }
      if (stockMovementType === 'Scarico' && !stockMovementDestination) { notify('Seleziona la sede di destinazione della merce.'); return; }
      await window.gestionale.moveStock({
        productId,
        type: stockMovementType,
        quantity: roundQuantity(quantity),
        employee_barcode: stockMovementEmployeeBarcode,
        destination: stockMovementDestination,
        note: stockMovementNote,
      });
      await refresh();
      setStockMovementQuantity('');
      setStockMovementNote('');
      setStockMovementEmployeeBarcode('');
      setStockMovementDestination('');
      notify(`${stockMovementType} registrato`);
    } catch (error) {
      notify(errorText(error));
    }
  };
  const unlock = async (event: FormEvent) => { event.preventDefault(); if (!await window.gestionale.verifyPin(pin)) { notify('PIN non corretto'); return; } setLocked(false); setPin(''); await refresh(); };
  const startVoucherBatchEdit = (batch: AppState['voucherBatches'][number]) => {
    setEditingVoucherBatchId(batch.id);
    setVoucherPercentage(String(batch.discount_percentage));
    setVoucherStartsAt(batch.starts_at);
    setVoucherEndsAt(batch.ends_at);
    setVoucherPreview(null);
    navigateTo('vouchers-create');
  };
  const generateVoucherPreview = (event: FormEvent) => {
    event.preventDefault();
    const percentage = Number(voucherPercentage);
    const quantity = Number(voucherQuantity);
    if (!Number.isInteger(percentage) || percentage < 1 || percentage > 100
      || !Number.isSafeInteger(quantity) || quantity < 1 || voucherEndsAt < voucherStartsAt) {
      notify('Inserisci una percentuale da 1 a 100, una quantità valida e date corrette.');
      return;
    }
    const existingCodes = new Set(data?.voucherBatches.flatMap((batch) => batch.codes) ?? []);
    const prefix = voucherCodePrefix(data?.settings.shop_name ?? 'Il tuo supermercato');
    const usedShopCodes = [...existingCodes].filter((code) => code.startsWith(prefix)).length;
    if (quantity > voucherCodeSpace - usedShopCodes) {
      notify('Non ci sono abbastanza codici univoci disponibili per questa quantità.');
      return;
    }
    const codes: string[] = [];
    for (let index = 0; index < quantity; index += 1) codes.push(randomVoucherCode(prefix, existingCodes));
    setVoucherPreview({ discount_percentage: percentage, starts_at: voucherStartsAt, ends_at: voucherEndsAt, codes });
  };
  const cancelVoucherPreview = () => {
    setVoucherPreview(null);
    setEditingVoucherBatchId(null);
    setVoucherPercentage('10');
    setVoucherQuantity('1');
    setVoucherStartsAt(localDateKey());
    setVoucherEndsAt(localDateKey());
  };
  const confirmVoucherBatch = async () => {
    if (!voucherPreview) return;
    try {
      await window.gestionale.saveVoucherBatch(voucherPreview);
      await refresh();
      cancelVoucherPreview();
      setSection('vouchers-list');
      notify('Buoni sconto aggiunti alla lista.');
    } catch (error) {
      notify(errorText(error));
    }
  };
  const saveVoucherBatchChanges = async (event: FormEvent) => {
    event.preventDefault();
    const batch = data?.voucherBatches.find((item) => item.id === editingVoucherBatchId);
    const percentage = Number(voucherPercentage);
    if (!batch || !Number.isInteger(percentage) || percentage < 1 || percentage > 100 || voucherEndsAt < voucherStartsAt) {
      notify('Controlla percentuale e date del gruppo.');
      return;
    }
    try {
      await window.gestionale.saveVoucherBatch({
        id: batch.id,
        discount_percentage: percentage,
        starts_at: voucherStartsAt,
        ends_at: voucherEndsAt,
        codes: batch.codes,
      });
      await refresh();
      cancelVoucherPreview();
      setSection('vouchers-list');
      notify('Gruppo di buoni sconto aggiornato.');
    } catch (error) {
      notify(errorText(error));
    }
  };
  const deleteVoucherBatch = async (batch: AppState['voucherBatches'][number]) => {
    if (!window.confirm(`Eliminare il gruppo ${batch.id} e tutti i suoi buoni non utilizzati?`)) return;
    try {
      await window.gestionale.deleteVoucherBatch(batch.id);
      await refresh();
      notify('Gruppo di buoni sconto eliminato.');
    } catch (error) {
      notify(errorText(error));
    }
  };
  const downloadVoucherBatch = (batch: AppState['voucherBatches'][number]) => {
    const doc = new jsPDF();
    const barcodes = batch.codes.map((code) => barcodePng(code));
    doc.setFontSize(16);
    doc.text(`Buoni sconto gruppo ${batch.id}`, 14, 17);
    doc.setFontSize(10);
    doc.text(`Sconto: ${batch.discount_percentage}%`, 14, 25);
    doc.text(`Validità: ${batch.starts_at} - ${batch.ends_at}`, 14, 31);
    autoTable(doc, {
      startY: 38,
      head: [['Codice', 'Barcode', 'Sconto', 'Data inizio', 'Data scadenza']],
      body: batch.codes.map((code) => [code, '', `${batch.discount_percentage}%`, batch.starts_at, batch.ends_at]),
      styles: { fontSize: 9, minCellHeight: 18 },
      headStyles: { fillColor: [56, 104, 78] },
      didDrawCell: (cell) => {
        if (cell.section === 'body' && cell.column.index === 1) {
          doc.addImage(barcodes[cell.row.index], 'PNG', cell.cell.x + 2, cell.cell.y + 3, cell.cell.width - 4, 12);
        }
      },
    });
    doc.save(`buoni-sconto-gruppo-${batch.id}.pdf`);
  };
  const exportLoyaltyCards = (cards: LoyaltyCard[]) => {
    if (!cards.length) {
      notify('Non ci sono tessere da scaricare per questa ricerca.');
      return;
    }
    const doc = new jsPDF();
    const barcodes = cards.map((card) => barcodePng(card.barcode));
    doc.setFontSize(16);
    doc.text('Lista tessere fedeltà', 14, 17);
    autoTable(doc, {
      startY: 25,
      head: [['Codice tessera', 'Barcode', 'Cliente', 'Sconto', 'Punti']],
      body: cards.map((card) => [card.code, '', `${card.first_name ?? ''} ${card.last_name ?? ''}`.trim(), `${card.discount_percentage}%`, String(card.points)]),
      styles: { fontSize: 8, minCellHeight: 18 },
      headStyles: { fillColor: [56, 104, 78] },
      didDrawCell: (cell) => {
        if (cell.section === 'body' && cell.column.index === 1) {
          doc.addImage(barcodes[cell.row.index], 'PNG', cell.cell.x + 2, cell.cell.y + 3, cell.cell.width - 4, 12);
        }
      },
    });
    doc.save('lista-tessere-fedelta.pdf');
  };
  const applyVoucherCode = async (code: string) => {
    const normalized = code.trim();
    setVoucherCode(normalized);
    setVoucherMessage('Verifica del buono in corso…');
    setVoucherDiscountPercentage(0);
    try {
      const result = await window.gestionale.validateVoucher(normalized);
      if (!result.valid) {
        setVoucherMessage(result.message);
        return;
      }
      setVoucherDiscountPercentage(result.discount_percentage);
      setVoucherMessage(`Buono valido · sconto ${result.discount_percentage}%`);
    } catch (error) {
      setVoucherMessage(errorText(error));
    }
  };
  const handleScannedCode = (code: string) => {
    const normalized = code.trim();
    if (!normalized || !data?.settings.barcode_scanner_enabled) return;
    if (!data.settings.barcode_scanner_detected) {
      setData((current) => current ? { ...current, settings: { ...current.settings, barcode_scanner_detected: true } } : current);
      void window.gestionale.saveSetting('barcode_scanner_detected', 'true').catch((error: unknown) => notify(errorText(error)));
    }
    if (checkoutOpen) {
      if (data.loyaltyCards.some((card) => card.barcode === normalized && card.status === 'Attiva')) setCheckoutCardBarcode(normalized);
      else void applyVoucherCode(normalized);
    }
    else if (section === 'stock-movement') {
      const employee = data.employees.find((item) => item.barcode === normalized);
      if (!employee) {
        setStockMovementEmployeeBarcode('');
        notify('Barcode personale non riconosciuto. Scansiona il badge di un dipendente registrato.');
        return;
      }
      setStockMovementEmployeeBarcode(normalized);
      notify(`Personale riconosciuto: ${employee.first_name} ${employee.last_name}.`);
    }
    else if (section === 'cash') scanCode(normalized);
    else if (section === 'inventory' && stockProduct) {
      const employee = data.employees.find((item) => item.barcode === normalized);
      if (!employee) {
        setStockMovementEmployeeBarcode('');
        notify('Barcode personale non riconosciuto. Scansiona il badge di un dipendente registrato.');
        return;
      }
      setStockMovementEmployeeBarcode(normalized);
      notify(`Personale riconosciuto: ${employee.first_name} ${employee.last_name}.`);
    } else if (section === 'inventory') setInventorySearch(normalized);
    else if (section === 'cards-list') setCardSearch(normalized);
    else if (section === 'sales') setSaleSearch(normalized.replace(/\D/g, ''));
  };
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!['cash', 'inventory', 'sales', 'stock-movement', 'cards-list'].includes(section) || !data?.settings.barcode_scanner_enabled) return;
      const now = performance.now();
      const sequence = scannerSequence.current;
      if (event.key === 'Enter') {
        const averageInterval = sequence.value.length > 1 ? (now - sequence.startedAt) / (sequence.value.length - 1) : Infinity;
        if (sequence.value.length >= 4 && now - sequence.startedAt <= 600 && averageInterval <= 75) {
          event.preventDefault();
          event.stopPropagation();
          handleScannedCode(sequence.value);
          if (section === 'cash' && !checkoutOpen) requestAnimationFrame(() => document.getElementById('scanner-field')?.focus());
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
  }, [data, section, checkoutOpen, stockProduct]);
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
  const addMeasuredQuantity = (quantityValue: number) => {
    if (!measuredProduct) return;
    const quantity = roundQuantity(quantityValue);
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
  const confirmMeasuredQuantity = (event: FormEvent) => {
    event.preventDefault();
    addMeasuredQuantity(Number(measuredQuantity));
  };
  const updateSale = async () => {
    if (!saleDialog) return;
    const items = saleDialog.items.filter((item) => item.quantity > 0);
    if (!items.length) { notify('Una vendita deve contenere almeno un articolo.'); return; }
    if (saleDiscountPercentage < 0 || saleDiscountPercentage > 100) { notify('Lo sconto deve essere compreso tra 0 e 100%.'); return; }
    try {
      const saleId = saleDialog.id;
      const previousTotal = saleDialog.total;
      await window.gestionale.updateSale({ id: saleId, payment_method: saleDialog.payment_method, discount: saleDialog.discount, items });
      const next = await refresh();
      const updatedSale = next.sales.find((sale) => sale.id === saleId);
      setSaleDialog(null);
      if (!updatedSale) throw new Error('Vendita aggiornata ma non trovata nell’archivio.');
      setSaleAdjustment(Math.round((updatedSale.total - previousTotal) * 100) / 100);
    } catch (error) {
      notify(errorText(error));
      await refresh();
    }
  };
  const deleteSale = async (sale: Sale) => { if (!window.confirm(`Eliminare lo scontrino ${sale.receipt_no}? Le quantità verranno ripristinate.`)) return; try { await window.gestionale.deleteSale(sale.id); await refresh(); setSaleDialog(null); notify('Vendita eliminata'); } catch (error) { notify(errorText(error)); await refresh(); } };
  const subtotal = cart.reduce((sum, item) => sum + item.quantity * item.unit_price, 0);
  const totalBeforeVoucher = Math.max(0, subtotal - automaticDiscount - manualDiscount);
  const voucherDiscount = Math.round(totalBeforeVoucher * voucherDiscountPercentage) / 100;
  const total = Math.max(0, totalBeforeVoucher - voucherDiscount);
  const checkoutLoyaltyCard = data?.loyaltyCards.find((card) => card.barcode === checkoutCardBarcode.trim() && card.status === 'Attiva');
  const activeLoyaltyCards = (data?.loyaltyCards ?? []).filter((card) => card.status === 'Attiva');
  const developedLoyaltyCards = (data?.loyaltyCards ?? []).filter((card) => card.status === 'Sviluppata');
  const customersWithoutCard = (data?.customers ?? []).filter((customer) =>
    !activeLoyaltyCards.some((card) => card.customer_id === customer.id));
  const filteredDevelopedLoyaltyCards = developedLoyaltyCards.filter((card) =>
    `${card.code} ${card.barcode}`.toLowerCase().includes(developedCardSearch.trim().toLowerCase()));
  const filteredLoyaltyCards = activeLoyaltyCards.filter((card) =>
    `${card.code} ${card.barcode} ${card.first_name ?? ''} ${card.last_name ?? ''}`.toLowerCase().includes(cardSearch.trim().toLowerCase()));
  const stockMovementSites = [...new Set((data?.employees ?? []).map((employee) => employee.operational_site.trim()).filter(Boolean))];
  const changeQuantity = (id: number, amount: number) => {
    const line = cart.find((item) => item.product_id === id);
    const product = data?.products.find((item) => item.id === id);
    const step = line?.unit === 'PEZZO' || !line?.unit ? 1 : 0.1;
    if (amount > 0 && line && product && line.quantity + step > product.stock) { notify(`Scorta insufficiente per ${line.name}.`); return; }
    setCart((current) => current.map((item) => item.product_id === id ? { ...item, quantity: Math.max(0, roundQuantity(item.quantity + amount * step)) } : item).filter((item) => item.quantity > 0));
  };
  const checkout = async () => {
    try {
      const sale = await window.gestionale.checkout({
        items: cart,
        payment_method: paymentMethod,
        voucher_code: voucherCode || undefined,
        loyalty_card_id: checkoutLoyaltyCard?.id,
        manual_promotion_id: promotionDiscounts.manualPromotion?.id,
        automatic_promotion_id: automaticPromotionId,
      });
      setCart([]);
      setVoucherCode('');
      setVoucherMessage('');
      setVoucherDiscountPercentage(0);
      setCheckoutCardBarcode('');
      setCheckoutRedeemPoints('');
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
  const exportReport = (respectTimeFilters: boolean) => {
    if (!data) return;
    const reportSales = data.sales.filter((sale) => !respectTimeFilters || matchesSalesPeriod(sale.created_at));
    const gross = reportSales.reduce((sum, sale) => sum + sale.gross_total, 0);
    const net = reportSales.reduce((sum, sale) => sum + sale.total, 0);
    const cost = reportSales.reduce((sum, sale) => sum + sale.items.reduce((subtotal, item) => subtotal + item.purchase_price * item.quantity, 0), 0);
    const reportPeriod = respectTimeFilters ? ` · Periodo: ${salesPeriod}` : ' · Tutto il periodo';
    const doc = new jsPDF({ orientation: 'portrait' });
    doc.setFillColor(43, 82, 61);
    doc.rect(0, 0, 210, 36, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.text(data.settings.shop_name, 14, 16);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(`Report vendite · Esportato il ${receiptDate.format(new Date())}${reportPeriod}`, 14, 26);
    doc.setTextColor(41, 51, 46);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text(`Vendite: ${reportSales.length}`, 14, 45);
    doc.text(`Lordo: ${money.format(gross)}`, 14, 52);
    doc.text(`Costo merce: ${money.format(cost)}`, 77, 52);
    doc.text(`Profitto: ${money.format(net - cost)}`, 145, 52);
    autoTable(doc, {
      startY: 59,
      head: [['Scontrino', 'Data e ora', 'Articoli', 'Pagamento', 'Prezzo acquisto', 'Prezzo vendita', 'Profitto', 'Sconto', 'Totale']],
      body: reportSales.map((sale) => {
        const purchasePrice = sale.items.reduce((sum, item) => sum + item.quantity * item.purchase_price, 0);
        const salePrice = sale.items.reduce((sum, item) => sum + item.quantity * item.unit_price, 0);
        const items = sale.items.map((item) => `${item.name} × ${quantityFormat.format(item.quantity)}`).join(', ');
        return [sale.receipt_no, dateTime.format(new Date(sale.created_at)), items, sale.payment_method, money.format(purchasePrice), money.format(salePrice), money.format(sale.total - purchasePrice), money.format(sale.discount), money.format(sale.total)];
      }),
      showHead: 'firstPage',
      theme: 'striped',
      styles: { fontSize: 6.5, cellPadding: 2, overflow: 'linebreak', textColor: [49, 60, 53], lineColor: [224, 230, 224] },
      headStyles: { fillColor: [56, 104, 78], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [244, 247, 244] },
      margin: { left: 8, right: 8, bottom: 14 },
      didDrawPage: () => {
        doc.setFontSize(8);
        doc.setTextColor(120, 130, 122);
        doc.text(`${data.settings.shop_name} · Pagina ${doc.getNumberOfPages()}`, 8, 290);
      },
    });
    doc.save(`report-vendite-${respectTimeFilters ? salesPeriod.toLowerCase().replaceAll(' ', '-') : 'tutto'}-${todayKey}.pdf`);
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
  const exportEmployeeList = async () => {
    if (!data) return;
    try {
      if (!data.employees.length) {
        notify('Non ci sono dipendenti da esportare.');
        return;
      }
      const doc = new jsPDF();
      for (const [index, employee] of data.employees.entries()) {
        await createEmployeePdf(employee, doc, index > 0);
      }
      doc.save(`lista-dipendenti-${todayKey}.pdf`);
    } catch (error) {
      notify(errorText(error));
    }
  };
  const exportSalesCsv = (respectTimeFilters: boolean) => {
    if (!data) return;
    const reportSales = data.sales.filter((sale) => !respectTimeFilters || matchesSalesPeriod(sale.created_at));
    const quote = (value: string | number) => `"${String(value).replaceAll('"', '""')}"`;
    const csvNumber = new Intl.NumberFormat('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const csvQuantity = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 3 });
    const rows = [
      ['Numero scontrino', 'Data e ora', 'Metodo di pagamento', 'Articoli', 'Quantità totale', 'Totale lordo', 'Sconto', 'Totale netto'],
      ...reportSales.map((sale) => [
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
  const dailyProfit = todaySales.reduce((sum, sale) =>
    sum + sale.total - sale.items.reduce((cost, item) => cost + item.quantity * item.purchase_price, 0), 0);
  const dailyGross = todaySales.reduce((sum, sale) => sum + sale.gross_total, 0);
  const dailyUnits = todaySales.reduce((sum, sale) => sum + sale.item_count, 0);
  const totalRevenue = data?.sales.reduce((sum, sale) => sum + sale.total, 0) ?? 0;
  const costOfGoodsSold = data?.sales.reduce((sum, sale) =>
    sum + sale.items.reduce((cost, item) => cost + item.quantity * item.purchase_price, 0), 0) ?? 0;
  const totalExpenses = data?.expenses.reduce((sum, expense) => sum + expense.amount, 0) ?? 0;
  const operatingResult = totalRevenue - costOfGoodsSold - totalExpenses;
  const accountingMonthly = Array.from({ length: 6 }, (_, index) => {
    const month = new Date(new Date().getFullYear(), new Date().getMonth() - 5 + index, 1);
    const monthKey = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}`;
    const salesInMonth = data?.sales.filter((sale) => sale.created_at.slice(0, 7) === monthKey) ?? [];
    const revenue = salesInMonth.reduce((sum, sale) => sum + sale.total, 0);
    const goodsCost = salesInMonth.reduce((sum, sale) =>
      sum + sale.items.reduce((cost, item) => cost + item.quantity * item.purchase_price, 0), 0);
    const expenses = data?.expenses.filter((expense) => expense.expense_date.startsWith(monthKey))
      .reduce((sum, expense) => sum + expense.amount, 0) ?? 0;
    return {
      mese: month.toLocaleDateString('it-IT', { month: 'short' }),
      vendite: revenue,
      spese: goodsCost + expenses,
      risultato: revenue - goodsCost - expenses,
      costiMerce: goodsCost,
      speseOperative: expenses,
    };
  });
  const balanceMonthCount = balancePeriod === 'Ultimi 3 mesi' ? 3 : balancePeriod === 'Ultimi 6 mesi' ? 6 : 12;
  const balanceRangeStart = new Date();
  balanceRangeStart.setHours(0, 0, 0, 0);
  const balanceStartDay = balanceRangeStart.getDate();
  const balanceTargetMonth = new Date(balanceRangeStart.getFullYear(), balanceRangeStart.getMonth() - balanceMonthCount, 1);
  balanceRangeStart.setFullYear(
    balanceTargetMonth.getFullYear(),
    balanceTargetMonth.getMonth(),
    Math.min(balanceStartDay, new Date(balanceTargetMonth.getFullYear(), balanceTargetMonth.getMonth() + 1, 0).getDate()),
  );
  const balanceRangeStartKey = localDateKey(balanceRangeStart);
  const balanceSales = data?.sales.filter((sale) => new Date(sale.created_at) >= balanceRangeStart) ?? [];
  const balanceExpenses = data?.expenses.filter((expense) => expense.expense_date >= balanceRangeStartKey && expense.expense_date <= todayKey) ?? [];
  const balanceRevenue = balanceSales.reduce((sum, sale) => sum + sale.total, 0);
  const balanceGoodsCost = balanceSales.reduce((sum, sale) =>
    sum + sale.items.reduce((cost, item) => cost + item.quantity * item.purchase_price, 0), 0);
  const balanceOperatingExpenses = balanceExpenses.reduce((sum, expense) => sum + expense.amount, 0);
  const balanceOperatingResult = balanceRevenue - balanceGoodsCost - balanceOperatingExpenses;
  const balanceFirstMonth = new Date(balanceRangeStart.getFullYear(), balanceRangeStart.getMonth(), 1);
  const balanceMonthsInRange = (new Date().getFullYear() - balanceFirstMonth.getFullYear()) * 12
    + new Date().getMonth() - balanceFirstMonth.getMonth() + 1;
  const balanceMonthly = Array.from({ length: balanceMonthsInRange }, (_, index) => {
    const month = new Date(balanceFirstMonth.getFullYear(), balanceFirstMonth.getMonth() + index, 1);
    const monthKey = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}`;
    const salesInMonth = balanceSales.filter((sale) => sale.created_at.slice(0, 7) === monthKey);
    const revenue = salesInMonth.reduce((sum, sale) => sum + sale.total, 0);
    const goodsCost = salesInMonth.reduce((sum, sale) =>
      sum + sale.items.reduce((cost, item) => cost + item.quantity * item.purchase_price, 0), 0);
    const expenses = balanceExpenses.filter((expense) => expense.expense_date.startsWith(monthKey))
      .reduce((sum, expense) => sum + expense.amount, 0);
    return {
      mese: month.toLocaleDateString('it-IT', { month: 'short', year: 'numeric' }),
      vendite: revenue,
      costiMerce: goodsCost,
      speseOperative: expenses,
      risultato: revenue - goodsCost - expenses,
    };
  });
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
  const statisticsExpenses = (data?.expenses ?? []).filter((expense) =>
    expense.expense_date <= todayKey && (statisticsPeriod === 'Tutti' || expense.expense_date >= localDateKey(statisticsStart)));
  const soldCost = statisticsSales.reduce((sum, sale) => sum + sale.items.reduce((subtotal, item) => subtotal + item.quantity * item.purchase_price, 0), 0);
  const soldTotal = statisticsSales.reduce((sum, sale) => sum + sale.total, 0);
  const estimatedNet = soldTotal - soldCost - statisticsExpenses.reduce((sum, expense) => sum + expense.amount, 0);
  const statisticsStartKey = localDateKey(statisticsStart);
  const statisticsPayroll = (data?.payrollPayments ?? []).filter((payment) =>
    statisticsPeriod === 'Tutti' || (payment.payment_date >= statisticsStartKey && payment.payment_date <= todayKey));
  const statisticsSiteNames = [...new Set([
    ...(data?.employees ?? []).map((employee) => employee.operational_site.trim()),
    ...(statisticsExpenses.map((expense) => expense.site.trim()).filter((site) => site !== 'Non assegnata')),
  ].filter(Boolean))].sort((left, right) => left.localeCompare(right, 'it'));
  const statisticsSiteSummary = statisticsSiteNames.map((site) => {
    const salaries = statisticsPayroll
      .filter((payment) => data?.employees.find((employee) => employee.id === payment.employee_id)?.operational_site === site)
      .reduce((sum, payment) => sum + payment.amount, 0);
    const storeExpenses = statisticsExpenses
      .filter((expense) => expense.site === site && expense.category !== 'Stipendi')
      .reduce((sum, expense) => sum + expense.amount, 0);
    return { site, revenue: null, outgoings: null, salaries, storeExpenses, net: null, profitPercentage: null };
  });
  const soldUnits = statisticsSales.reduce((sum, sale) => sum + sale.item_count, 0);
  const totalTrackedUnits = soldUnits + (data?.products.reduce((sum, product) => sum + product.stock, 0) ?? 0);
  const unsoldProducts = data?.products.filter((product) => product.stock > 0) ?? [];
  const stockCost = data?.products.reduce((sum, item) => sum + item.stock * item.purchase_price, 0) ?? 0;
  const stockRetail = data?.products.reduce((sum, item) => sum + item.stock * item.sale_price, 0) ?? 0;
  const productSales = statisticsSales.flatMap((sale) => sale.items).reduce<Record<number, { quantity: number; revenue: number }>>((totals, item) => {
    const total = totals[item.product_id] ?? { quantity: 0, revenue: 0 };
    totals[item.product_id] = { quantity: total.quantity + item.quantity, revenue: total.revenue + item.quantity * item.unit_price };
    return totals;
  }, {});
  const productSalesRanking = (data?.products ?? []).map((product) => ({
    ...product,
    quantitySold: productSales[product.id]?.quantity ?? 0,
    revenue: productSales[product.id]?.revenue ?? 0,
  })).sort((left, right) => right.quantitySold - left.quantitySold || left.name.localeCompare(right.name, 'it'));
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
  const downloadFinancialBalance = (respectTimeFilters: boolean) => {
    if (!data) return;
    const doc = new jsPDF({ orientation: 'landscape' });
    const reportSales = respectTimeFilters ? balanceSales : data.sales;
    const reportExpenses = respectTimeFilters ? balanceExpenses : data.expenses;
    const reportRevenue = reportSales.reduce((sum, sale) => sum + sale.total, 0);
    const reportGoodsCost = reportSales.reduce((sum, sale) => sum + sale.items.reduce((cost, item) => cost + item.quantity * item.purchase_price, 0), 0);
    const reportOperatingExpenses = reportExpenses.reduce((sum, expense) => sum + expense.amount, 0);
    const periodLabel = respectTimeFilters ? balancePeriod : 'Tutto il periodo';
    const filename = `bilancio-gestionale-${periodLabel.toLowerCase().replaceAll(' ', '-')}-${todayKey}.pdf`;
    const allDates = [...reportSales.map((sale) => sale.created_at.slice(0, 10)), ...reportExpenses.map((expense) => expense.expense_date)].sort();
    const monthlyStartDate = respectTimeFilters || !allDates.length ? balanceFirstMonth : new Date(`${allDates[0]}T00:00:00`);
    const firstMonth = new Date(monthlyStartDate.getFullYear(), monthlyStartDate.getMonth(), 1);
    const monthsCount = Math.max(1, (new Date().getFullYear() - firstMonth.getFullYear()) * 12 + new Date().getMonth() - firstMonth.getMonth() + 1);
    const reportMonthly = Array.from({ length: monthsCount }, (_, index) => {
      const month = new Date(firstMonth.getFullYear(), firstMonth.getMonth() + index, 1);
      const monthKey = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}`;
      const sales = reportSales.filter((sale) => sale.created_at.slice(0, 7) === monthKey);
      const revenue = sales.reduce((sum, sale) => sum + sale.total, 0);
      const cost = sales.reduce((sum, sale) => sum + sale.items.reduce((subtotal, item) => subtotal + item.quantity * item.purchase_price, 0), 0);
      const expenses = reportExpenses.filter((expense) => expense.expense_date.startsWith(monthKey)).reduce((sum, expense) => sum + expense.amount, 0);
      return { month: month.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' }), revenue, cost, expenses, result: revenue - cost - expenses };
    });
    const pageHeading = (title: string) => {
      doc.setFillColor(47, 91, 66);
      doc.rect(0, 0, 297, 28, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.text(title, 12, 13);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.text(`${data.settings.shop_name} · ${periodLabel} · ${receiptDate.format(new Date())}`, 12, 21);
    };
    pageHeading('Bilancio gestionale');
    autoTable(doc, {
      startY: 36,
      head: [['Ricavi vendite', 'Costo merce', 'Spese operative', 'Risultato', 'Valore magazzino']],
      body: [[money.format(reportRevenue), money.format(reportGoodsCost), money.format(reportOperatingExpenses), money.format(reportRevenue - reportGoodsCost - reportOperatingExpenses), money.format(stockCost)]],
      theme: 'grid',
      styles: { fontSize: 9, cellPadding: 5, halign: 'center' },
      headStyles: { fillColor: [56, 104, 78] },
    });
    autoTable(doc, {
      startY: 67,
      head: [['Mese', 'Ricavi', 'Costo merce', 'Spese operative', 'Risultato']],
      body: reportMonthly.map((month) => [month.month, money.format(month.revenue), money.format(month.cost), money.format(month.expenses), money.format(month.result)]),
      theme: 'striped',
      styles: { fontSize: 8, cellPadding: 3 },
      headStyles: { fillColor: [56, 104, 78] },
      didDrawPage: () => {
        doc.setFontSize(8);
        doc.setTextColor(120, 130, 122);
        doc.text(`${data.settings.shop_name} · Pagina ${doc.getNumberOfPages()}`, 12, 202);
      },
    });
    doc.addPage();
    pageHeading('Dettaglio vendite');
    autoTable(doc, {
      startY: 36,
      head: [['Scontrino', 'Data e ora', 'Articoli', 'Costo merce', 'Totale vendita', 'Profitto']],
      body: reportSales.map((sale) => {
        const cost = sale.items.reduce((sum, item) => sum + item.quantity * item.purchase_price, 0);
        const items = sale.items.map((item) => `${item.name} × ${quantityFormat.format(item.quantity)}`).join(', ');
        return [sale.receipt_no, dateTime.format(new Date(sale.created_at)), items, money.format(cost), money.format(sale.total), money.format(sale.total - cost)];
      }),
      theme: 'striped',
      styles: { fontSize: 7.5, cellPadding: 2, overflow: 'linebreak' },
      headStyles: { fillColor: [56, 104, 78] },
      didDrawPage: () => {
        doc.setFontSize(8);
        doc.setTextColor(120, 130, 122);
        doc.text(`${data.settings.shop_name} · Pagina ${doc.getNumberOfPages()}`, 12, 202);
      },
    });
    doc.addPage();
    pageHeading('Dettaglio spese operative');
    autoTable(doc, {
      startY: 36,
      head: [['Data', 'Descrizione', 'Categoria', 'Importo']],
      body: reportExpenses.map((expense) => [expense.expense_date, expense.description, expense.category, money.format(expense.amount)]),
      theme: 'striped',
      styles: { fontSize: 8, cellPadding: 3, overflow: 'linebreak' },
      headStyles: { fillColor: [56, 104, 78] },
      didDrawPage: () => {
        doc.setFontSize(8);
        doc.setTextColor(120, 130, 122);
        doc.text(`${data.settings.shop_name} · Pagina ${doc.getNumberOfPages()}`, 12, 202);
      },
    });
    doc.save(filename);
  };
  const expiryLimit = new Date();
  expiryLimit.setDate(expiryLimit.getDate() + 10);
  const expiryLimitKey = localDateKey(expiryLimit);
  const expiringProducts = data?.products.filter((product) =>
    product.expiry_enabled && product.expiry_date && product.expiry_date >= todayKey && product.expiry_date <= expiryLimitKey
  ) ?? [];
  const expiredProducts = data?.products.filter((product) =>
    product.expiry_enabled && product.expiry_date && product.expiry_date < todayKey && product.stock > 0
  ) ?? [];
  const inventoryList = data?.products.filter((item) =>
    (item.name.toLowerCase().includes(inventorySearch.toLowerCase()) || item.code.includes(inventorySearch))
    && (category === 'Tutte' || item.category === category)
    && (inventoryStatus === 'out' ? item.stock === 0 : item.stock > 0)
    && (inventoryStatus === 'all'
      || (inventoryStatus === 'available' && item.stock > item.low_stock_threshold)
      || (inventoryStatus === 'low' && item.stock > 0 && item.stock <= item.low_stock_threshold)
      || (inventoryStatus === 'out' && item.stock === 0))
  ) ?? [];
  const employeeList = data?.employees.filter((employee) =>
    [employee.first_name, employee.last_name, employee.role, employee.shift, employee.operational_site, employee.email]
      .some((value) => value.toLocaleLowerCase('it').includes(employeeSearch.trim().toLocaleLowerCase('it')))
  ) ?? [];
  const expenseList = data?.expenses.filter((expense) =>
    `${expense.description} ${expense.category} ${expense.site}`.toLocaleLowerCase('it').includes(expenseSearch.trim().toLocaleLowerCase('it'))
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
  const sectionLabel = sectionNames[section] ?? nav.find((item) => item.section === section)?.label ?? 'Impostazioni';
  const startEmployeeCreation = () => {
    if (!data) {
      notify('Archivio non disponibile.');
      return;
    }
    setEmployeeDraft(newEmployeeDraft(data.employees));
    navigateTo('employee-create');
  };
  const printReceipt = () => {
    if (data?.settings.receipt_printer) {
      void window.gestionale.printReceipt().catch((error: unknown) => notify(errorText(error)));
    } else window.print();
  };
  const scanCameraCode = (code: string) => {
    setCamera(false);
    if (checkoutOpen) void applyVoucherCode(code);
    else if (section === 'cash') scanCode(code);
    else if (section === 'inventory') setInventorySearch(code.trim());
    else setSaleSearch(code.replace(/\D/g, ''));
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
    <aside className="sidebar">
      <div className="brand"><div className={`brand-mark${data.settings.shop_logo ? ' has-logo' : ''}`}>{data.settings.shop_logo ? <img src={data.settings.shop_logo} alt="Logo negozio" /> : <Store size={20} />}</div><div><strong>{data.settings.shop_name}</strong><small>GESTIONE NEGOZIO</small></div></div>
      <div className="nav-label">OPERATIVITÀ</div>
      <nav>
        {nav.filter((item) => item.section === 'home').map(({ section: target, label, icon: Icon }) => <button key={target} className={`nav-item${section === target ? ' active' : ''}`} onClick={() => navigateTo(target)}><Icon size={18} /><span>{label}</span></button>)}
        <button aria-expanded={openSidebarMenu === 'inventory'} className={`nav-item${section === 'inventory' || section === 'expired-products' || section === 'inventory-history' || section === 'stock-movement' ? ' active' : ''}`} onClick={() => setOpenSidebarMenu((current) => current === 'inventory' ? null : 'inventory')}><Package size={18} /><span>Magazzino</span><ChevronDown className={`nav-chevron${openSidebarMenu === 'inventory' ? ' open' : ''}`} size={15} /></button>
        {openSidebarMenu === 'inventory' && <div className="sidebar-submenu"><button className={`sidebar-subitem${section === 'inventory' ? ' selected' : ''}`} onClick={() => navigateTo('inventory')}>Magazzino</button><button className={`sidebar-subitem${section === 'inventory-history' ? ' selected' : ''}`} onClick={() => navigateTo('inventory-history')}>Storico Magazzino</button><button className={`sidebar-subitem${section === 'stock-movement' ? ' selected' : ''}`} onClick={() => { setStockMovementProduct(String(data.products[0]?.id ?? '')); navigateTo('stock-movement'); }}>Carica e scarica merce</button></div>}
        {nav.filter((item) => ['cash', 'sales'].includes(item.section)).map(({ section: target, label, icon: Icon }) => <button key={target} className={`nav-item${section === target ? ' active' : ''}`} onClick={() => navigateTo(target)}><Icon size={18} /><span>{label}</span>{target === 'cash' && <kbd>F2</kbd>}</button>)}
        <button aria-expanded={openSidebarMenu === 'statistics'} className={`nav-item${['statistics', 'accounting-statistics', 'expenses'].includes(section) ? ' active' : ''}`} onClick={() => setOpenSidebarMenu((current) => current === 'statistics' ? null : 'statistics')}><BarChart3 size={18} /><span>Statistiche</span><ChevronDown className={`nav-chevron${openSidebarMenu === 'statistics' ? ' open' : ''}`} size={15} /></button>
        {openSidebarMenu === 'statistics' && <div className="sidebar-submenu"><button className={`sidebar-subitem${section === 'accounting-statistics' ? ' selected' : ''}`} onClick={() => navigateTo('accounting-statistics')}>Statistiche</button><button className={`sidebar-subitem${section === 'expenses' ? ' selected' : ''}`} onClick={() => navigateTo('expenses')}>Spese</button><button className={`sidebar-subitem${section === 'statistics' ? ' selected' : ''}`} onClick={() => navigateTo('statistics')}>Analisi vendite</button></div>}
        <div className="nav-label nav-label-extra">GESTIONE EXTRA</div>
        <button aria-expanded={openSidebarMenu === 'offers'} className={`nav-item${['promotions', 'vouchers-create', 'vouchers-list'].includes(section) ? ' active' : ''}`} onClick={() => setOpenSidebarMenu((current) => current === 'offers' ? null : 'offers')}><TrendingUp size={18} /><span>Offerta</span><ChevronDown className={`nav-chevron${openSidebarMenu === 'offers' ? ' open' : ''}`} size={15} /></button>
        {openSidebarMenu === 'offers' && <div className="sidebar-submenu"><button className={`sidebar-subitem${section === 'promotions' ? ' selected' : ''}`} onClick={() => navigateTo('promotions')}>Promozioni</button><button className={`sidebar-subitem${section === 'vouchers-create' ? ' selected' : ''}`} onClick={() => { cancelVoucherPreview(); navigateTo('vouchers-create'); }}>Crea buoni sconto</button><button className={`sidebar-subitem${section === 'vouchers-list' ? ' selected' : ''}`} onClick={() => navigateTo('vouchers-list')}>Lista buoni sconto</button></div>}
        <button aria-expanded={openSidebarMenu === 'clients'} className={`nav-item${['clients', 'client-list', 'cards-list', 'cards-activate', 'cards-create', 'cards-developed'].includes(section) ? ' active' : ''}`} onClick={() => setOpenSidebarMenu((current) => current === 'clients' ? null : 'clients')}><ShoppingBasket size={18} /><span>Clienti</span><ChevronDown className={`nav-chevron${openSidebarMenu === 'clients' ? ' open' : ''}`} size={15} /></button>
        {openSidebarMenu === 'clients' && <div className="sidebar-submenu"><button className={`sidebar-subitem${section === 'client-list' ? ' selected' : ''}`} onClick={() => navigateTo('client-list')}>Lista clienti</button><button className={`sidebar-subitem${section === 'cards-activate' ? ' selected' : ''}`} onClick={() => navigateTo('cards-activate')}>Attiva tessera</button><button className={`sidebar-subitem${section === 'cards-list' ? ' selected' : ''}`} onClick={() => navigateTo('cards-list')}>Lista tessere</button><button className={`sidebar-subitem${section === 'cards-create' ? ' selected' : ''}`} onClick={() => navigateTo('cards-create')}>Sviluppa tessera</button><button className={`sidebar-subitem${section === 'cards-developed' ? ' selected' : ''}`} onClick={() => navigateTo('cards-developed')}>Tessere sviluppate</button></div>}
        <button aria-expanded={openSidebarMenu === 'employees'} className={`nav-item${['employees', 'employee-create', 'payroll'].includes(section) ? ' active' : ''}`} onClick={() => setOpenSidebarMenu((current) => current === 'employees' ? null : 'employees')}><ClipboardList size={18} /><span>Dipendenti</span><ChevronDown className={`nav-chevron${openSidebarMenu === 'employees' ? ' open' : ''}`} size={15} /></button>
        {openSidebarMenu === 'employees' && <div className="sidebar-submenu"><button className={`sidebar-subitem${section === 'employees' ? ' selected' : ''}`} onClick={() => navigateTo('employees')}>Lista Dipendenti</button><button className={`sidebar-subitem${section === 'employee-create' ? ' selected' : ''}`} onClick={startEmployeeCreation}>Crea Dipendente</button><button className={`sidebar-subitem${section === 'payroll' ? ' selected' : ''}`} onClick={() => navigateTo('payroll')}>Paga Stipendi</button></div>}
      </nav>
      <div className="sidebar-bottom"><button className={`nav-item settings-link${section === 'settings' ? ' active' : ''}`} onClick={() => { setSettingsTab(null); navigateTo('settings'); }}><Settings size={18} /><span>Impostazioni</span></button><div className="user-card"><div className="user-avatar">{data.settings.shop_name.slice(0, 1).toUpperCase()}</div><div><strong>Gestore</strong><small>Account locale</small></div></div></div>
    </aside>
    <main className="main-content"><header className="topbar"><h1>{sectionLabel}</h1>{data.settings.shop_logo ? <img className="topbar-logo" src={data.settings.shop_logo} alt="Logo negozio" /> : <div className="topbar-logo-fallback"><Store size={19} /></div>}<div className="topbar-right"><div className="today-date">{new Intl.DateTimeFormat('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date())}</div><span className="store-chip"><span className="status-dot" />Operativo</span></div></header>

      {section === 'home' && <div className="page-content home-page"><img className="home-banner" src={homeBanner} alt="Illustrazione di un supermercato con prodotti freschi" /><div className="metric-grid"><Metric icon={Banknote} label="Vendite di oggi" value={money.format(dailyGross)} detail={`${todaySales.length} scontrini emessi`} /><Metric icon={TrendingUp} label="Netto vendite" value={money.format(dailyProfit)} detail="Profitto dopo sconti e costo merce" /><Metric icon={Package} label="Articoli venduti" value={dailyUnits.toLocaleString('it-IT')} detail="Pezzi registrati oggi" /></div><section className="expiry-alert expiry-home-alert"><div className="expiry-alert-heading"><CircleAlert size={18} /><div><strong>Avviso date di scadenza</strong><span>{expiringProducts.length ? `${expiringProducts.length} ${expiringProducts.length === 1 ? 'articolo' : 'articoli'} in scadenza entro 10 giorni` : 'Nessun articolo in scadenza nei prossimi 10 giorni'}</span></div></div>{expiringProducts.length > 0 && <div className="expiry-list">{expiringProducts.map((product) => <button key={product.id} onClick={() => setSelectedProduct(product)}><span>{product.name}</span><strong>{receiptDate.format(new Date(`${product.expiry_date}T00:00:00`))}</strong></button>)}</div>}</section><section className="content-section reorder-section"><SectionHeading icon={CircleAlert} title="Da riordinare" detail={`${data.products.filter((p) => p.stock <= p.low_stock_threshold).length} articoli sotto soglia`} action={<button className="text-button" onClick={() => { setInventorySearch(''); setCategory('Tutte'); setInventoryStatus('low'); setSection('inventory'); }}>Vai al magazzino →</button>} /><Table headings={['Articolo', 'Codice', 'Categoria', 'Disponibili', 'Soglia', 'Stato']}><>{data.products.filter((p) => p.stock <= p.low_stock_threshold).slice(0, 5).map((p) => <tr key={p.id} onClick={() => setSelectedProduct(p)}><td className="cell-primary">{p.name}</td><td className="mono">{p.code}</td><td>{p.category}</td><td>{p.stock}</td><td>{p.low_stock_threshold}</td><td><span className="stock-badge low">Riordinare</span></td></tr>)}</></Table></section><section className="content-section"><SectionHeading icon={ClipboardList} title="Ultime vendite" detail="Transazioni più recenti" action={<button className="text-button" onClick={() => setSection('sales')}>Tutte le vendite →</button>} /><SalesTable sales={data.sales.slice(0, 5)} onSelect={setReceipt} /></section></div>}

      {section === 'inventory' && <div className="page-content">
        <div className="page-toolbar inventory-toolbar"><div><h2>Articoli in magazzino</h2><p>{data.products.length} articoli registrati</p></div><div className="toolbar-actions"><button className="button button-outline" onClick={exportInventoryReport}><ArrowDownToLine size={16} /> Scarica report</button><button className="button button-primary" onClick={() => { setProductEditingId(null); setProductForm({ ...blankProduct }); }}><Plus size={16} /> Aggiungi nuovo articolo</button></div></div>
        <div className="filter-row"><SearchInput value={inventorySearch} onChange={setInventorySearch} placeholder="Cerca per nome o codice…" /><label className="select-wrap"><span>Categoria</span><select value={category} onChange={(e) => setCategory(e.target.value)}><option>Tutte</option>{categories.map((item) => <option key={item}>{item}</option>)}</select><ChevronDown size={14} /></label><details className="inventory-filter-dropdown"><summary className="select-wrap"><span>Disponibilità: {inventoryFilters.find((item) => item.value === inventoryStatus)?.label}</span><ChevronDown size={14} /></summary><div className="inventory-status-filters" role="group" aria-label="Filtra prodotti per disponibilità">{inventoryFilters.map(({ value, label }) => <button key={value} className={`status-filter${inventoryStatus === value ? ' active' : ''}`} aria-pressed={inventoryStatus === value} onClick={(event) => { setInventoryStatus(value); event.currentTarget.closest('details')?.removeAttribute('open'); }}>{label}</button>)}</div></details></div>
        <div className="expiry-panels">
          <section className="expiry-alert"><div className="expiry-alert-heading"><CircleAlert size={18} /><div><strong>Avviso date di scadenza</strong><span>{expiringProducts.length ? `${expiringProducts.length} ${expiringProducts.length === 1 ? 'articolo' : 'articoli'} in scadenza entro 10 giorni` : 'Nessun articolo in scadenza nei prossimi 10 giorni'}</span></div></div>{expiringProducts.length > 0 && <div className="expiry-list">{expiringProducts.map((product) => <button key={product.id} onClick={() => setSelectedProduct(product)}><span>{product.name}</span><strong>{receiptDate.format(new Date(`${product.expiry_date}T00:00:00`))}</strong></button>)}</div>}</section>
          <section className="expiry-alert expired-alert"><div className="expired-alert-top"><div className="expiry-alert-heading"><CircleAlert size={18} /><div><strong>Prodotti scaduti</strong><span>{expiredProducts.length ? `${expiredProducts.length} ${expiredProducts.length === 1 ? 'articolo scaduto' : 'articoli scaduti'}` : 'Nessun prodotto scaduto'}</span></div></div><button className="text-button expired-manage-link" onClick={() => navigateTo('expired-products')}>Gestisci articoli scaduti</button></div>{expiredProducts.length > 0 && <div className="expiry-list">{expiredProducts.map((product) => <button key={product.id} onClick={() => setSelectedProduct(product)}><span>{product.name}</span><strong>{receiptDate.format(new Date(`${product.expiry_date}T00:00:00`))}</strong></button>)}</div>}</section>
        </div>
        <div className="product-grid">{inventoryList.map((product) => <button className="product-tile" key={product.id} onClick={() => setSelectedProduct(product)}><div className="tile-icon"><Package size={20} /></div><span className="tile-category">{product.category}</span><strong>{product.name}</strong><span className="tile-price">{money.format(product.sale_price)}</span><span className={`tile-stock${product.stock <= product.low_stock_threshold ? ' text-low' : ''}`}>{quantityFormat.format(product.stock)} disponibili</span></button>)}</div>{inventoryList.length === 0 && <Empty icon={Package} title="Nessun articolo trovato" detail="Modifica la ricerca o aggiungi un articolo." />}
      </div>}

      {section === 'expired-products' && <div className="page-content"><div className="page-toolbar"><div><h2>Gestione prodotti scaduti</h2><p>Verifica gli articoli scaduti e registra lo smaltimento.</p></div><button className="button button-outline" onClick={() => navigateTo('inventory')}>Torna al magazzino</button></div><Table headings={['Articolo', 'Codice', 'Categoria', 'Giacenza', 'Data di scadenza', 'Azione']}><>{expiredProducts.map((product) => <tr key={product.id}><td className="cell-primary">{product.name}</td><td className="mono">{product.code}</td><td>{product.category}</td><td>{quantityFormat.format(product.stock)} {product.unit ?? 'PEZZO'}</td><td>{receiptDate.format(new Date(`${product.expiry_date}T00:00:00`))}</td><td><button className="button button-danger" onClick={() => void disposeExpiredProduct(product)}><Trash2 size={14} /> Butta articolo</button></td></tr>)}</>{!expiredProducts.length && <tr><td colSpan={6} className="empty-cell">Non ci sono prodotti scaduti da gestire.</td></tr>}</Table></div>}

      {section === 'inventory-history' && <div className="page-content"><div id="inventory-history-print">
        <div className="inventory-history-actions no-print"><SelectField label="Periodo" value={inventoryHistoryPeriod} onChange={setInventoryHistoryPeriod} options={['Tutti', 'Oggi', 'Ieri', 'Ultima settimana', 'Ultimo mese', 'Da - A']} />{inventoryHistoryPeriod === 'Da - A' && <><Field label="Da" type="date" value={inventoryHistoryFrom} onChange={(event) => setInventoryHistoryFrom(event.target.value)} /><Field label="A" type="date" value={inventoryHistoryTo} onChange={(event) => setInventoryHistoryTo(event.target.value)} /></>}<SearchInput value={inventoryHistorySearch} onChange={setInventoryHistorySearch} placeholder="Cerca articolo, persona o nota…" /><button className="button button-outline" onClick={() => window.print()}><Printer size={16} /> Stampa</button></div>
        <Table headings={['Data e ora', 'Articolo', 'Movimento', 'Quantità', 'Persona', 'Sede', 'Nota']}><>{inventoryHistoryMovements.map((movement) => <tr key={movement.id}><td>{dateTime.format(new Date(movement.created_at))}</td><td className="cell-primary">{movement.product_name}</td><td><span className={`movement-badge ${movement.movement_type === 'Carico' ? 'movement-in' : 'movement-out'}`}>{movement.movement_type}</span></td><td>{quantityFormat.format(movement.quantity)}</td><td>{movement.person || '—'}</td><td>{movement.destination || '—'}</td><td>{movement.note || '—'}</td></tr>)}</>{!inventoryHistoryMovements.length && <tr><td colSpan={7} className="empty-cell">Nessun movimento nel periodo selezionato.</td></tr>}</Table></div></div>}

      {section === 'stock-movement' && <div className="page-content settings-page"><section className="settings-panel"><div className="settings-title"><h2>Carica e scarica merce</h2></div><form className="settings-form movement-form" onSubmit={(event) => void saveStockMovement(event)}><SelectField label="Tipo di movimento" value={stockMovementType} onChange={(value) => setStockMovementType(value === 'Scarico' ? 'Scarico' : 'Carico')} options={['Carico', 'Scarico']} /><SelectField label="Articolo" value={stockMovementProduct} onChange={setStockMovementProduct} options={data.products.map((product) => String(product.id))} labels={data.products.map((product) => `${product.name} · ${product.stock} ${product.unit === 'KG' ? 'kg' : product.unit === 'LITRO' ? 'lit.' : 'pz'} disponibili`)} /><Field label={`Quantità${selectedMovementProduct?.unit === 'KG' ? ' (kg)' : selectedMovementProduct?.unit === 'LITRO' ? ' (litri)' : ''}`} type="number" min={selectedMovementProduct?.unit === 'PEZZO' ? '1' : '0.001'} step={selectedMovementProduct?.unit === 'PEZZO' ? '1' : '0.001'} value={stockMovementQuantity} onChange={(event) => setStockMovementQuantity(event.target.value)} required /><Field fieldClassName="movement-barcode-field" label="Barcode del personale (scansiona il badge)" value={stockMovementEmployeeBarcode} readOnly autoFocus disabled={!data.settings.barcode_scanner_enabled} placeholder={data.settings.barcode_scanner_enabled ? 'In attesa della scansione…' : 'Attiva il lettore barcode nelle impostazioni'} />{stockMovementEmployeeBarcode && <div className="movement-employee-status">{data.employees.find((employee) => employee.barcode === stockMovementEmployeeBarcode)?.first_name} {data.employees.find((employee) => employee.barcode === stockMovementEmployeeBarcode)?.last_name}</div>}{stockMovementType === 'Scarico' && <label className="field"><span>Sede di destinazione</span><select value={stockMovementDestination} onChange={(event) => setStockMovementDestination(event.target.value)} required><option value="">Seleziona la sede</option>{stockMovementSites.map((site) => <option key={site} value={site}>{site}</option>)}</select></label>}<Field label="Nota (facoltativa)" value={stockMovementNote} onChange={(event) => setStockMovementNote(event.target.value)} /><div className="movement-actions"><button className="button button-outline" type="button" onClick={() => { setStockMovementType('Carico'); setStockMovementProduct(String(data.products[0]?.id ?? '')); setStockMovementQuantity(''); setStockMovementEmployeeBarcode(''); setStockMovementDestination(''); setStockMovementNote(''); }}>Annulla</button><button className="button button-primary" disabled={!data.products.length || !data.settings.barcode_scanner_enabled || !stockMovementEmployeeBarcode}><Check size={16} /> Registra</button></div></form></section></div>}

      {section === 'cash' && <div className="page-content cash-content"><div className="cash-layout">
        <section className="cash-products">
          <div className="cash-search-row"><div className="search-field"><Barcode size={17} /><input id="scanner-field" placeholder="Cerca o scansiona un codice a barre…" value={scannerSearch} onChange={(e) => setScannerSearch(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); scanCode(scannerSearch); } }} /><button type="button" className="search-clear" aria-label="Cancella ricerca" disabled={!scannerSearch} onClick={() => setScannerSearch('')}><X size={15} /></button></div><button className="icon-button camera-button" title="Scansiona con fotocamera" onClick={() => setCamera(true)}><Camera size={18} /></button></div>
          <div className="cash-product-grid">{data.products.filter((p) => (p.name.toLowerCase().includes(scannerSearch.toLowerCase()) || p.code.includes(scannerSearch)) && p.stock > 0).map((product) => { const remainingStock = Math.max(0, product.stock - (cart.find((item) => item.product_id === product.id)?.quantity ?? 0)); return <button className="cash-product" key={product.id} disabled={remainingStock === 0} onClick={() => addProductToCart(product)}><span className="tile-category">{product.category}</span><strong>{product.name}</strong><span className="cash-product-bottom"><b>{money.format(product.sale_price)}{product.unit === 'KG' ? ' / kg' : product.unit === 'LITRO' ? ' / lit.' : ''}</b><small>{quantityFormat.format(remainingStock)} {product.unit === 'KG' ? 'kg' : product.unit === 'LITRO' ? 'lit.' : 'pz'}</small></span></button>; })}</div>
        </section>
        <aside className="cart-panel"><div className="cart-heading"><div className="cart-heading-title"><h2>CARRELLO <span>{quantityFormat.format(cart.reduce((sum, item) => sum + item.quantity, 0))}</span></h2></div><button className="icon-button" title="Svuota carrello" aria-label="Svuota carrello" disabled={!cart.length} onClick={() => { setCart([]); setManualPromotionId(undefined); setAutomaticPromotionId(undefined); }}><Trash2 size={17} /></button></div><div className="cart-lines">{cart.map((item) => <div className="cart-line" key={item.product_id}><div className="cart-line-name"><strong>{item.name}</strong><small>{quantityFormat.format(item.quantity)} {item.unit === 'KG' ? 'kg' : item.unit === 'LITRO' ? 'L' : 'pz'}</small></div><div className="quantity-control"><button onClick={() => changeQuantity(item.product_id, -1)} aria-label="Rimuovi uno"><Minus size={13} /></button><span>{quantityFormat.format(item.quantity)}</span><button onClick={() => changeQuantity(item.product_id, 1)} aria-label="Aggiungi uno"><Plus size={13} /></button></div><strong className="line-total">{money.format(item.quantity * item.unit_price)}</strong></div>)}{!cart.length && <div className="cart-empty"><ShoppingBasket size={25} /><span>Seleziona gli articoli<br />per iniziare una vendita</span></div>}</div><div className="receipt-summary"><div><span>Subtotale</span><span>{money.format(subtotal)}</span></div><div className="total-row"><strong>TOTALE</strong><strong>{money.format(subtotal)}</strong></div></div><button className="button button-primary checkout-button" disabled={!cart.length} onClick={() => { setCheckoutCardBarcode(''); setCheckoutRedeemPoints(''); setCheckoutOpen(true); }}>Procedi al pagamento <span>→</span></button></aside>
      </div></div>}

      {section === 'sales' && <div className="page-content"><div className="sale-tools"><button className="button button-outline sale-camera-button" onClick={() => setCamera(true)}><Camera size={16} /> Cerca con fotocamera</button><SearchInput value={saleSearch} onChange={setSaleSearch} placeholder="Cerca numero scontrino…" numericOnly /><button className="button button-outline" onClick={() => { setReportExportType('sales-pdf'); setReportExportOpen(true); }}><ArrowDownToLine size={16} /> Scarica report</button><button className="button button-outline" onClick={() => { setReportExportType('sales-csv'); setReportExportOpen(true); }}><ArrowDownToLine size={16} /> Esporta CSV</button></div><div className="sale-filters"><SelectField label="Periodo" value={salesPeriod} onChange={setSalesPeriod} options={['Tutti', 'Oggi', 'Ieri', 'Ultima settimana', 'Ultimo mese', 'Ultimi 3 mesi', 'Da - A']} />{salesPeriod === 'Da - A' && <><Field label="Da" type="date" value={salesFrom} onChange={(event) => setSalesFrom(event.target.value)} /><Field label="A" type="date" value={salesTo} onChange={(event) => setSalesTo(event.target.value)} /></>}<SelectField label="Categoria" value={salesCategory} onChange={setSalesCategory} options={['Tutte', ...categories]} /></div><SalesTable sales={salesList} onSelect={setReceipt} /></div>}


      {section === 'promotions' && <div className="page-content settings-page"><section className="settings-panel">
        <button className="settings-back" onClick={() => setSection('home')}><ArrowLeft size={15} /> Menu principale</button>
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

      {section === 'employees' && <div className="page-content employee-page">
        <div className="page-toolbar employee-toolbar"><SearchInput value={employeeSearch} onChange={setEmployeeSearch} placeholder="Cerca dipendente, ruolo o sede…" /><div className="toolbar-actions"><button className="button button-outline" onClick={() => void exportEmployeeList()}><ArrowDownToLine size={16} /> Esporta Lista PDF</button></div></div>
        <Table headings={['Foto dipendente', 'Nome', 'Ruolo', 'Turno', 'Sede']}><>{employeeList.map((employee) => <tr className="employee-table-row" key={employee.id} onClick={() => setEmployeeDetails(employee)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setEmployeeDetails(employee); } }} tabIndex={0} aria-label={`Apri informazioni di ${employee.first_name} ${employee.last_name}`}><td><img className="employee-list-photo" src={employee.photo_data} alt={`Foto di ${employee.first_name} ${employee.last_name}`} /></td><td className="cell-primary">{employee.first_name} {employee.last_name}</td><td>{employee.role}</td><td>{employee.shift}</td><td>{employee.operational_site}</td></tr>)}</>{!employeeList.length && <tr><td colSpan={5} className="empty-cell">{data.employees.length ? 'Nessun dipendente corrisponde alla ricerca.' : 'Nessun dipendente registrato.'}</td></tr>}</Table>
      </div>}
      {section === 'employee-create' && employeeDraft && <div className="page-content settings-page"><section className="settings-panel employee-create-panel"><EmployeeForm initial={employeeDraft} save={saveEmployee} cancel={() => { setEmployeeDraft(null); navigateTo('employees'); }} notify={notify} /></section></div>}
      {section === 'payroll' && <div className="page-content">
        <div className="page-toolbar"><div><h2>Gestione stipendi</h2><p>Registra i pagamenti mensili e scarica le ricevute PDF.</p></div></div>
        <div className="panel payroll-toolbar"><Field label="Mese di competenza" type="month" value={payrollMonth} onChange={(event) => setPayrollMonth(event.target.value)} /><Field label="Data di pagamento" type="date" value={payrollDate} onChange={(event) => setPayrollDate(event.target.value)} /><button className="button button-primary" onClick={() => void payAllEmployees()}><Banknote size={15} /> Paga tutti gli stipendi</button><button className="button button-outline" onClick={() => { const payments = data.payrollPayments.filter((payment) => payment.pay_month === payrollMonth); void exportPayrollZip(payments).catch((error: unknown) => notify(errorText(error))); }}><ArrowDownToLine size={15} /> Scarica ricevute del mese</button></div>
        <Table headings={['Dipendente', 'Ruolo', 'Stipendio', 'Metodo', 'Stato', 'Azione']}><>{data.employees.map((employee) => { const payment = data.payrollPayments.find((item) => item.employee_id === employee.id && item.pay_month === payrollMonth); return <tr key={employee.id}><td className="cell-primary">{employee.first_name} {employee.last_name}</td><td>{employee.role}</td><td>{money.format(employee.salary)}</td><td>{employee.payment_method}</td><td><span className={`stock-badge${payment ? '' : ' low'}`}>{payment ? `Pagato il ${payment.payment_date}` : 'Da pagare'}</span></td><td>{payment ? <button className="button button-outline" onClick={() => savePdf(createSalaryPdf(employee, payment.payment_date, payment.pay_month, payment.amount), `Stipendio-${safeFilePart(employee.first_name)}-${safeFilePart(employee.last_name)}-${payment.payment_date}.pdf`)}><ArrowDownToLine size={14} /> Ricevuta</button> : <button className="button button-primary" onClick={() => void payEmployee(employee)}><Check size={14} /> Paga</button>}</td></tr>; })}</>{!data.employees.length && <tr><td colSpan={6} className="empty-cell">Nessun dipendente registrato.</td></tr>}</Table>
      </div>}
      {section === 'clients' && <div className="page-content"><div className="page-toolbar"><div><h2>Gestione clienti e tessere</h2><p>Seleziona una funzione per gestire l’anagrafica e il programma fedeltà.</p></div></div><div className="client-shortcuts">{([['client-list', 'Lista clienti'], ['cards-list', 'Lista tessere'], ['cards-activate', 'Attiva tessera'], ['cards-create', 'Sviluppa tessera'], ['cards-developed', 'Tessere sviluppate']] as const).map(([target, label]) => <button className="panel client-shortcut" key={target} onClick={() => navigateTo(target)}><CreditCard size={20} /><strong>{label}</strong><span>Apri gestione →</span></button>)}</div></div>}
      {section === 'client-list' && <div className="page-content"><section className="panel client-form-panel"><form className="client-form" onSubmit={(event) => void saveCustomer(event)}><Field label="Nome" value={customerForm.first_name} onChange={(event) => setCustomerForm({ ...customerForm, first_name: event.target.value })} required /><Field label="Cognome" value={customerForm.last_name} onChange={(event) => setCustomerForm({ ...customerForm, last_name: event.target.value })} required /><Field label="Telefono" type="tel" value={customerForm.phone} onChange={(event) => setCustomerForm({ ...customerForm, phone: event.target.value })} required /><Field label="Email" type="email" value={customerForm.email} onChange={(event) => setCustomerForm({ ...customerForm, email: event.target.value })} required /><button className="button button-primary customer-submit"><Plus size={15} /> Aggiungi cliente</button></form></section><Table headings={['Nome', 'Telefono', 'Email', 'Indirizzo', 'Registrato']}><>{data.customers.map((customer: Customer) => <tr key={customer.id}><td className="cell-primary">{customer.first_name} {customer.last_name}</td><td>{customer.phone}</td><td>{customer.email}</td><td>{customer.address}</td><td>{receiptDate.format(new Date(customer.created_at))}</td></tr>)}</>{!data.customers.length && <tr><td colSpan={5} className="empty-cell">Nessun cliente registrato.</td></tr>}</Table></div>}
      {section === 'cards-create' && <div className="page-content"><section className="panel client-form-panel"><div className="panel-heading"><div><h2>Sviluppa tessere fedeltà</h2><p>Ogni codice è composto da 5 cifre, dal nome del negozio e da 8 cifre.</p></div></div><form className="client-form card-generation-form" onSubmit={(event) => void generateCards(event)}><Field label="Quantità tessere" type="number" min="1" max="5000" step="1" value={cardQuantity} onChange={(event) => setCardQuantity(event.target.value)} required /><Field label="Percentuale sconto" type="number" min="0" max="100" step="0.01" value={cardDiscount} onChange={(event) => setCardDiscount(event.target.value)} required /><div className="card-form-actions"><button className="button button-outline" type="button" onClick={() => { setCardQuantity(''); setCardDiscount(''); }}>Annulla</button><button className="button button-primary"><Plus size={15} /> Sviluppa tessere</button></div></form></section><div className="page-toolbar"><div className="card-page-heading"><h2>Tessere sviluppate</h2><p>{developedLoyaltyCards.length} tessere non ancora attivate</p></div><button className="button button-outline" onClick={() => navigateTo('cards-developed')}>Visualizza lista</button></div></div>}
      {section === 'cards-developed' && <div className="page-content"><div className="card-list-toolbar"><SearchInput value={developedCardSearch} onChange={setDevelopedCardSearch} placeholder="Cerca tessera per codice…" /><button className="button button-outline" onClick={() => exportLoyaltyCards(filteredDevelopedLoyaltyCards)}><ArrowDownToLine size={16} /> Scarica lista tessere</button></div><Table headings={['Codice tessera', 'Barcode', 'Sconto', 'Stato', 'Data creazione', '']}><>{filteredDevelopedLoyaltyCards.map((card) => <tr key={card.id}><td className="mono">{card.code}</td><td><BarcodeImage value={card.barcode} /></td><td>{card.discount_percentage}%</td><td>{card.status}</td><td>{receiptDate.format(new Date(card.created_at))}</td><td><button className="icon-button small" title="Elimina tessera" aria-label={`Elimina la tessera ${card.code}`} onClick={() => void deleteLoyaltyCard(card)}><Trash2 size={15} /></button></td></tr>)}</>{!filteredDevelopedLoyaltyCards.length && <tr><td colSpan={6} className="empty-cell">{developedLoyaltyCards.length ? 'Nessuna tessera corrisponde alla ricerca.' : 'Nessuna tessera sviluppata in attesa di attivazione.'}</td></tr>}</Table></div>}
      {section === 'cards-activate' && <div className="page-content"><section className="panel client-form-panel"><div className="panel-heading"><div><h2>Attiva tessera</h2></div></div><hr className="client-section-rule" /><form className="client-form card-generation-form" onSubmit={(event) => void activateCard(event)}><label className="field"><span>Tessera sviluppata</span><select value={activationCardId} onChange={(event) => setActivationCardId(event.target.value)} required><option value="">Seleziona tessera</option>{developedLoyaltyCards.map((card) => <option value={card.id} key={card.id}>{card.code} · {card.discount_percentage}%</option>)}</select></label><label className="field"><span>Cliente</span><select value={activationCustomerId} onChange={(event) => setActivationCustomerId(event.target.value)} required><option value="">Seleziona cliente</option>{customersWithoutCard.map((customer) => <option value={customer.id} key={customer.id}>{customer.first_name} {customer.last_name}</option>)}</select></label><div className="card-form-actions"><button className="button button-outline" type="button" onClick={() => { setActivationCardId(''); setActivationCustomerId(''); }}>Annulla</button><button className="button button-primary" disabled={!customersWithoutCard.length || !developedLoyaltyCards.length}><Check size={15} /> Attiva tessera</button></div></form></section></div>}
      {section === 'cards-list' && <div className="page-content"><div className="card-list-toolbar"><SearchInput value={cardSearch} onChange={setCardSearch} placeholder="Cerca tessera per codice o cliente…" /><button className="button button-outline" onClick={() => exportLoyaltyCards(filteredLoyaltyCards)}><ArrowDownToLine size={16} /> Scarica lista tessere</button></div><Table headings={['Codice tessera', 'Barcode', 'Cliente', 'Sconto tessera', 'Punti', 'Valore punti']}><>{filteredLoyaltyCards.map((card) => <tr key={card.id}><td className="mono">{card.code}</td><td><BarcodeImage value={card.barcode} /></td><td className="cell-primary">{card.first_name} {card.last_name}</td><td>{card.discount_percentage}%</td><td>{card.points}</td><td>{money.format(card.points * 0.1)}</td></tr>)}</>{!filteredLoyaltyCards.length && <tr><td colSpan={6} className="empty-cell">{activeLoyaltyCards.length ? 'Nessuna tessera corrisponde alla ricerca.' : 'Nessuna tessera attiva.'}</td></tr>}</Table></div>}

      {section === 'accounting-statistics' && <div className="page-content accounting-page">
        <div className="page-toolbar"><div><h2>Andamento economico</h2><p>Riepilogo delle vendite, del costo merce e delle spese operative.</p></div><button className="button button-outline" onClick={() => { setReportExportType('balance'); setReportExportOpen(true); }}><ArrowDownToLine size={16} /> Scarica report</button></div>
        <div className="metric-grid stats-metrics accounting-metrics">
          <Metric icon={Banknote} label="Vendite nette" value={money.format(totalRevenue)} detail={`${data.sales.length} vendite registrate`} compact />
          <Metric icon={Package} label="Costo della merce venduta" value={money.format(costOfGoodsSold)} detail="Costo d'acquisto degli articoli venduti" compact />
          <Metric icon={ArrowDownToLine} label="Spese operative" value={money.format(totalExpenses)} detail={`${data.expenses.length} spese registrate`} compact />
          <Metric icon={TrendingUp} label="Risultato operativo" value={money.format(operatingResult)} detail="Vendite meno costo merce e spese" compact />
        </div>
        <div className="analytics-grid">
          <section className="panel chart-panel"><div className="panel-heading"><div><h3>Vendite e costi · ultimi 6 mesi</h3><p>Valori mensili in euro</p></div></div><ResponsiveContainer width="100%" height={245}><BarChart data={accountingMonthly}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="mese" /><YAxis /><Tooltip formatter={(value) => money.format(Number(value))} /><Bar dataKey="vendite" name="Vendite nette" fill="#416e59" radius={[3, 3, 0, 0]} /><Bar dataKey="spese" name="Costo merce e spese" fill="#c17e4f" radius={[3, 3, 0, 0]} /></BarChart></ResponsiveContainer></section>
          <section className="panel chart-panel"><div className="panel-heading"><div><h3>Risultato operativo mensile</h3><p>Vendite meno costo merce e spese registrate</p></div></div><ResponsiveContainer width="100%" height={245}><LineChart data={accountingMonthly}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="mese" /><YAxis /><Tooltip formatter={(value) => money.format(Number(value))} /><Line type="monotone" dataKey="risultato" name="Risultato operativo" stroke="#416e59" strokeWidth={2} dot={{ r: 3 }} /></LineChart></ResponsiveContainer></section>
        </div>
      </div>}

      {section === 'expenses' && <div className="page-content accounting-page">
        <section className="panel expense-entry-panel"><div className="panel-heading"><div><h3>Registra una spesa</h3><p>Inserisci descrizione, categoria, importo e data.</p></div></div>
          <form className="expense-form" onSubmit={(event) => void saveExpense(event)}>
            <Field label="Descrizione" value={expenseDescription} onChange={(event) => setExpenseDescription(event.target.value)} required />
            <SelectField label="Categoria" value={expenseCategory} onChange={(value) => { setExpenseCategory(value); if (value !== 'Affitto') setExpenseReceiptData(''); }} options={expenseCategories} />
            <Field label="Importo (€)" type="number" min="0.01" step="0.01" value={expenseAmount} onChange={(event) => setExpenseAmount(event.target.value)} required />
            <Field label="Data" type="date" value={expenseDate} onChange={(event) => setExpenseDate(event.target.value)} required />
            {expenseCategory === 'Affitto' && <label className="field expense-receipt-field"><span>Allega PDF o ricevuta</span><input type="file" accept="application/pdf,image/png,image/jpeg,image/webp" onChange={(event) => { void attachExpenseReceipt(event.target.files?.[0]); event.currentTarget.value = ''; }} required={!expenseReceiptData} />{expenseReceiptData && <small>Ricevuta allegata</small>}</label>}
            <div className="expense-form-actions"><button className="button button-primary"><Plus size={16} /> Registra spesa</button><button className="button button-outline" type="button" onClick={() => { setExpenseDescription(''); setExpenseCategory(expenseCategories[0]); setExpenseAmount(''); setExpenseDate(localDateKey()); setExpenseReceiptData(''); }}>Annulla</button></div>
          </form>
        </section>
        <div className="expense-list-toolbar"><SearchInput value={expenseSearch} onChange={setExpenseSearch} placeholder="Cerca descrizione o categoria…" /></div>
        <Table headings={['Data', 'Descrizione', 'Sede', 'Categoria', 'Importo', 'Ricevuta', '']}>{expenseList.map((expense) => <tr key={expense.id}><td>{expense.expense_date}</td><td className="cell-primary">{expense.description}</td><td>{expense.site}</td><td>{expense.category}</td><td className="align-right">{money.format(expense.amount)}</td><td>{expense.receipt_data ? <a className="button button-outline expense-receipt-download" href={expense.receipt_data} download={`ricevuta-${safeFilePart(expense.description)}.${dataUrlExtension(expense.receipt_data)}`}><ArrowDownToLine size={14} /> Scarica</a> : '—'}</td><td><button className="icon-button small" title="Elimina spesa" aria-label={`Elimina la spesa ${expense.description}`} onClick={() => void deleteExpense(expense)}><Trash2 size={15} /></button></td></tr>)}{!expenseList.length && <tr><td colSpan={7} className="empty-cell">{data.expenses.length ? 'Nessuna spesa corrisponde alla ricerca.' : 'Nessuna spesa registrata.'}</td></tr>}</Table>
      </div>}

      {section === 'financial-balance' && <div id="financial-balance-report" className="page-content accounting-page">
        <div className="page-toolbar balance-toolbar no-print">
          <button className="button button-primary balance-download" onClick={() => { setReportExportType('balance'); setReportExportOpen(true); }}><ArrowDownToLine size={16} /> Scarica bilancio</button>
          <div className="balance-periods" role="group" aria-label="Filtra bilancio per periodo">
            {(['Ultimi 3 mesi', 'Ultimi 6 mesi', 'Ultimo anno'] as const).map((period) => <button key={period} className={`status-filter${balancePeriod === period ? ' active' : ''}`} aria-pressed={balancePeriod === period} onClick={() => setBalancePeriod(period)}>{period}</button>)}
          </div>
        </div>
        <div className="metric-grid accounting-balance-metrics">
          <Metric icon={Banknote} label="Ricavi da vendite" value={money.format(balanceRevenue)} detail={balancePeriod} />
          <Metric icon={Package} label="Costo della merce venduta" value={money.format(balanceGoodsCost)} detail={balancePeriod} />
          <Metric icon={ArrowDownToLine} label="Spese operative" value={money.format(balanceOperatingExpenses)} detail={balancePeriod} />
          <Metric icon={TrendingUp} label="Risultato gestionale" value={money.format(balanceOperatingResult)} detail="Ricavi meno costi e spese" />
        </div>
        <div className="analytics-grid">
          <section className="panel"><div className="panel-heading"><div><h3>Composizione del bilancio</h3><p>{balancePeriod}</p></div></div><div className="balance-breakdown"><Detail label="Ricavi netti" value={money.format(balanceRevenue)} /><Detail label="Costo del venduto" value={`− ${money.format(balanceGoodsCost)}`} /><Detail label="Margine lordo" value={money.format(balanceRevenue - balanceGoodsCost)} /><Detail label="Spese operative" value={`− ${money.format(balanceOperatingExpenses)}`} /><Detail label="Risultato gestionale" value={money.format(balanceOperatingResult)} /></div></section>
          <section className="panel"><div className="panel-heading"><div><h3>Valore del magazzino</h3><p>Valorizzazione della giacenza attuale</p></div></div><div className="balance-breakdown"><Detail label="Valore a costo" value={money.format(stockCost)} /><Detail label="Valore potenziale di vendita" value={money.format(stockRetail)} /><Detail label="Articoli in giacenza" value={`${data.products.filter((product) => product.stock > 0).length}`} /><Detail label="Margine potenziale" value={money.format(stockRetail - stockCost)} /></div></section>
        </div>
        <section className="panel balance-monthly-panel"><div className="panel-heading"><div><h3>Dettaglio mensile · {balancePeriod.toLowerCase()}</h3><p>Ricavi, costo merce, spese operative e risultato</p></div></div><div className="table-wrap"><table><thead><tr><th>Mese</th><th className="align-right">Ricavi</th><th className="align-right">Costo merce</th><th className="align-right">Spese operative</th><th className="align-right">Risultato</th></tr></thead><tbody>{balanceMonthly.map((month) => <tr key={month.mese}><td className="cell-primary">{month.mese}</td><td className="align-right">{money.format(month.vendite)}</td><td className="align-right">{money.format(month.costiMerce)}</td><td className="align-right">{money.format(month.speseOperative)}</td><td className="align-right cell-primary">{money.format(month.risultato)}</td></tr>)}</tbody></table></div></section>
      </div>}

      {(section === 'vouchers-create' || section === 'vouchers-list') && <div className="page-content settings-page"><section className="settings-panel">
        {section === 'vouchers-create' && <div className="voucher-section">
          <div className="settings-title"><h2>{editingVoucherBatchId ? `Modifica gruppo ${editingVoucherBatchId}` : 'Crea buoni sconto'}</h2></div>
          {!voucherPreview ? <form className="form-grid promotion-form voucher-form" onSubmit={editingVoucherBatchId ? saveVoucherBatchChanges : generateVoucherPreview}>
            <Field label="Percentuale di sconto (%)" type="number" min="1" max="100" step="1" value={voucherPercentage} onChange={(event) => setVoucherPercentage(event.target.value)} required />
            {!editingVoucherBatchId && <Field label="Quantità di codici" type="number" min="1" step="1" value={voucherQuantity} onChange={(event) => setVoucherQuantity(event.target.value)} required />}
            <Field label="Data di inizio" type="date" value={voucherStartsAt} onChange={(event) => setVoucherStartsAt(event.target.value)} required />
            <Field label="Data di scadenza" type="date" value={voucherEndsAt} onChange={(event) => setVoucherEndsAt(event.target.value)} required />
            {editingVoucherBatchId
              ? <div className="voucher-edit-actions"><button className="button button-quiet" type="button" onClick={() => { cancelVoucherPreview(); navigateTo('vouchers-list'); }}>Annulla</button><button className="button button-primary"><Check size={16} /> Salva modifiche</button></div>
              : <button className="button button-primary"><Check size={16} /> Genera codici</button>}
          </form> : <>
            <div className="voucher-preview-heading"><strong>{voucherPreview.codes.length} codici · {voucherPreview.discount_percentage}% di sconto</strong><span>{voucherPreview.starts_at} — {voucherPreview.ends_at}</span></div>
            <div id="voucher-print" className="table-wrap voucher-codes"><table><thead><tr><th>Codice</th><th>Barcode</th><th>Sconto</th><th>Inizio</th><th>Scadenza</th></tr></thead><tbody>{voucherPreview.codes.map((code) => <tr key={code}><td className="mono">{code}</td><td><BarcodeImage value={code} /></td><td>{voucherPreview.discount_percentage}%</td><td>{voucherPreview.starts_at}</td><td>{voucherPreview.ends_at}</td></tr>)}</tbody></table></div>
            <div className="voucher-actions no-print"><button className="button button-outline" onClick={() => window.print()}><Printer size={16} /> Stampa codici</button><button className="button button-quiet" onClick={cancelVoucherPreview}>Annulla</button><button className="button button-primary" onClick={() => void confirmVoucherBatch()}><Check size={16} /> Conferma e salva</button></div>
          </>}
        </div>}
        {section === 'vouchers-list' && <div className="voucher-section">
          {!data.voucherBatches.length ? <Empty icon={Barcode} title="Nessun buono sconto" detail="Crea e conferma un gruppo di codici per visualizzarlo qui." /> : <>
            <div className="voucher-batch-list">{data.voucherBatches.map((batch) => <div className="voucher-batch-row" key={batch.id}>
              <div><strong>Gruppo {batch.id}</strong><span>{batch.codes.length} codici · {batch.discount_percentage}% di sconto</span><small>{batch.starts_at} — {batch.ends_at}</small></div>
              <div className="voucher-actions no-print"><button className="icon-button" title="Visualizza codici" aria-label={`Visualizza codici del gruppo ${batch.id}`} onClick={() => setVoucherViewBatch(batch)}><Eye size={17} /></button><button className="button button-outline" onClick={() => startVoucherBatchEdit(batch)}><Pencil size={15} /> Modifica</button><button className="button button-outline" onClick={() => setVoucherPrintBatch(batch)}><Printer size={15} /> Stampa</button><button className="button button-outline" onClick={() => downloadVoucherBatch(batch)}><ArrowDownToLine size={15} /> Scarica lista</button><button className="button button-danger" onClick={() => void deleteVoucherBatch(batch)}><Trash2 size={15} /> Elimina</button></div>
            </div>)}</div>
            {voucherPrintBatch && <div id="voucher-print" className="table-wrap voucher-codes voucher-print-only"><h2>Buoni sconto gruppo {voucherPrintBatch.id} · {voucherPrintBatch.discount_percentage}%</h2><p>{voucherPrintBatch.starts_at} — {voucherPrintBatch.ends_at}</p><table><thead><tr><th>Codice</th><th>Barcode</th><th>Sconto</th><th>Inizio</th><th>Scadenza</th></tr></thead><tbody>{voucherPrintBatch.codes.map((code) => <tr key={code}><td className="mono">{code}</td><td><BarcodeImage value={code} /></td><td>{voucherPrintBatch.discount_percentage}%</td><td>{voucherPrintBatch.starts_at}</td><td>{voucherPrintBatch.ends_at}</td></tr>)}</tbody></table></div>}
          </>}
        </div>}
      </section></div>}

      {section === 'statistics' && <div className="page-content">
        <div className="page-toolbar"><div><h2>Analisi vendite</h2><p>Andamento e prodotti venduti nel periodo selezionato.</p></div><span className="period-chip">Dati aggiornati in tempo reale</span></div>
        <div className="statistics-periods" role="group" aria-label="Filtra statistiche per periodo">{statisticsPeriods.map((period) => <button key={period} className={`status-filter${statisticsPeriod === period ? ' active' : ''}`} aria-pressed={statisticsPeriod === period} onClick={() => setStatisticsPeriod(period)}>{period}</button>)}</div>
        <section className="panel product-sales-panel"><div className="panel-heading"><div><h3>Prodotti più e meno venduti</h3><p>Ordinati dal più venduto al meno venduto nel periodo selezionato.</p></div></div><Table headings={['Posizione', 'Prodotto', 'Quantità venduta', 'Ricavi']}><>{productSalesRanking.map((product, index) => <tr key={product.id}><td>{index + 1}</td><td className="cell-primary">{product.name}</td><td>{quantityFormat.format(product.quantitySold)} {product.unit === 'PEZZO' ? 'pz' : product.unit === 'KG' ? 'kg' : product.unit === 'LITRO' ? 'L' : ''}</td><td>{money.format(product.revenue)}</td></tr>)}</>{!productSalesRanking.length && <tr><td colSpan={4} className="empty-cell">Nessun prodotto registrato.</td></tr>}</Table></section>
        <div className="metric-grid stats-metrics"><Metric icon={Banknote} label="Vendite" value={money.format(soldTotal)} detail="Incassi registrati nel periodo" /><Metric icon={CreditCard} label="Acquisto merce venduta" value={money.format(soldCost)} detail="Costo degli articoli venduti" /><Metric icon={TrendingUp} label="Netto stimato" value={money.format(estimatedNet)} detail="Ricavi meno costo del venduto e spese" /><Metric icon={ShoppingBasket} label="Quantità vendite" value={`${soldUnits.toLocaleString('it-IT')} di ${totalTrackedUnits.toLocaleString('it-IT')}`} detail="Articoli venduti rispetto a quelli ancora in magazzino" action={<button className="text-button metric-action" onClick={() => setUnsoldListOpen(true)}>Vedi lista</button>} /></div>
        <div className="metric-grid inventory-values"><Metric icon={Package} label="Valore vendita in magazzino" value={money.format(stockRetail)} detail="Valore al prezzo di vendita" compact /><Metric icon={Archive} label="Valore acquisto in magazzino" value={money.format(stockCost)} detail="Costo delle scorte attuali" compact /><Metric icon={TrendingUp} label="Netto potenziale" value={money.format(stockRetail - stockCost)} detail="Margine potenziale delle scorte" compact /></div>
        <div className="analytics-grid"><section className="panel calendar-panel"><div className="panel-heading"><div><h3>Calendario vendite</h3><p>Incasso per giorno</p></div><div className="month-controls"><button className="icon-button small" onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1))}>‹</button><strong>{calendarMonth.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })}</strong><button className="icon-button small" onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1))}>›</button></div></div><div className="calendar-grid">{['L', 'M', 'M', 'G', 'V', 'S', 'D'].map((day, index) => <span className="calendar-weekday" key={`${day}${index}`}>{day}</span>)}{calendarDays().map((day, index) => { const date = day ? new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), day) : null; const revenue = date ? statisticsSales.filter((sale) => new Date(sale.created_at).toDateString() === date.toDateString()).reduce((sum, sale) => sum + sale.total, 0) : 0; return <div key={index} className={`calendar-day${revenue ? ' has-sales' : ''}${date?.toDateString() === new Date().toDateString() ? ' today' : ''}`}>{day && <><span>{day}</span>{revenue > 0 && <small>{money.format(revenue)}</small>}</>}</div>; })}</div></section><section className="panel chart-panel"><div className="panel-heading"><div><h3>Vendite giornaliere</h3><p>Ultimi sette giorni nel periodo selezionato</p></div></div><ResponsiveContainer width="100%" height={242}><BarChart data={chartDays} margin={{ top: 14, right: 8, left: -15, bottom: 0 }}><CartesianGrid stroke="#e9ece8" vertical={false} /><XAxis dataKey="giorno" axisLine={false} tickLine={false} tick={{ fill: '#858b85', fontSize: 11 }} /><YAxis axisLine={false} tickLine={false} tick={{ fill: '#858b85', fontSize: 10 }} tickFormatter={(value) => `${value}€`} /><Tooltip formatter={(value) => money.format(Number(value))} /><Bar dataKey="totale" fill="#38684e" radius={[4, 4, 0, 0]} maxBarSize={34} /></BarChart></ResponsiveContainer></section></div>
        <section className="panel site-summary-panel"><div className="panel-heading"><div><h3>Riepilogo per sede</h3><p>Stipendi e spese sono ripartiti per sede; entrate, uscite, netto e percentuale saranno disponibili quando saranno creati gli account per sede.</p></div></div><div className="table-wrap"><table><thead><tr><th>Sede</th><th className="align-right">Totale entrate</th><th className="align-right">Totale uscite</th><th className="align-right">Totale stipendi</th><th className="align-right">Spese del negozio</th><th className="align-right">Netto</th><th className="align-right">Percentuale di guadagno</th></tr></thead><tbody>{statisticsSiteSummary.map((row) => <tr key={row.site}><td className="cell-primary">{row.site}</td><td className="align-right">—</td><td className="align-right">—</td><td className="align-right">{money.format(row.salaries)}</td><td className="align-right">{money.format(row.storeExpenses)}</td><td className="align-right cell-primary">—</td><td className="align-right">—</td></tr>)}{!statisticsSiteSummary.length && <tr><td colSpan={7} className="empty-cell">Nessun dato disponibile per il periodo selezionato.</td></tr>}</tbody></table></div></section>
        <div className="analytics-grid statistics-extra"><section className="panel chart-panel"><div className="panel-heading"><div><h3>Andamento mensile</h3><p>Incasso per mese nel periodo selezionato</p></div></div><ResponsiveContainer width="100%" height={242}><LineChart data={monthlySales} margin={{ top: 14, right: 12, left: -15, bottom: 0 }}><CartesianGrid stroke="#e9ece8" vertical={false} /><XAxis dataKey="mese" axisLine={false} tickLine={false} tick={{ fill: '#858b85', fontSize: 11 }} /><YAxis axisLine={false} tickLine={false} tick={{ fill: '#858b85', fontSize: 10 }} tickFormatter={(value) => `${value}€`} /><Tooltip formatter={(value) => money.format(Number(value))} /><Line type="monotone" dataKey="totale" stroke="#38684e" strokeWidth={3} dot={{ fill: '#38684e', r: 4 }} /></LineChart></ResponsiveContainer></section><section className="panel payment-panel"><div className="panel-heading"><div><h3>Pagamenti per metodo</h3><p>Totale incassato nel periodo</p></div></div><div className="payment-totals">{Object.entries(paymentTotals).length ? Object.entries(paymentTotals).map(([method, amount], index) => <div key={method}><span className="payment-dot" style={{ backgroundColor: colors[index % colors.length] }} /><span>{method}</span><strong>{money.format(amount)}</strong></div>) : <span className="muted">Nessun pagamento nel periodo selezionato.</span>}</div></section></div>
        <section className="panel category-panel"><div className="panel-heading"><div><h3>Vendite per categoria</h3><p>Valore degli articoli venduti nel periodo selezionato</p></div></div><div className="category-chart"><ResponsiveContainer width="100%" height={230}><PieChart><Pie data={Object.entries(categoriesSales).map(([name, value]) => ({ name, value }))} dataKey="value" nameKey="name" innerRadius={57} outerRadius={88} paddingAngle={3}>{Object.keys(categoriesSales).map((name, i) => <Cell key={name} fill={colors[i % colors.length]} />)}</Pie><Tooltip formatter={(value) => money.format(Number(value))} /></PieChart></ResponsiveContainer><div className="chart-legend">{Object.entries(categoriesSales).length ? Object.entries(categoriesSales).map(([name, value], i) => <div key={name}><span style={{ backgroundColor: colors[i % colors.length] }} /><span>{name}</span><strong>{money.format(value)}</strong></div>) : <span className="muted">Le categorie appariranno dopo la prima vendita.</span>}</div></div></section>
      </div>}

      {section === 'settings' && <div className="page-content settings-page"><div className="settings-layout">{settingsTab === null ? <nav className="settings-nav">{[{ name: 'Nome negozio', icon: Store }, { name: 'Sicurezza', icon: ShieldCheck }, { name: 'Archivio dati', icon: Archive }, { name: 'Dispositivi', icon: Barcode }, { name: 'Tema dell’app', icon: Settings }].map(({ name, icon: Icon }) => <button key={name} onClick={() => setSettingsTab(name)}><Icon size={17} />{name}</button>)}</nav> : <section className="settings-panel"><button className="settings-back" onClick={() => setSettingsTab(null)}><ArrowLeft size={15} /> Impostazioni</button>
        {settingsTab === 'Nome negozio' && <><div className="settings-title"><h2>Info negozio</h2><p>Nome e logo del negozio per il menu e la barra superiore.</p></div><form className="settings-form" onSubmit={saveStoreName}><Field label="Nome attività" value={shopName} onChange={(e) => setShopName(e.target.value)} required /><div className="receipt-preview"><Store size={17} /><span>{shopName || 'Nome negozio'}</span><small>Anteprima intestazione scontrino</small></div><div className="shop-logo-setting"><span className="field-label">Logo del negozio</span>{data.settings.shop_logo && <img src={data.settings.shop_logo} alt="Logo attuale" />}<button className="button button-outline" type="button" onClick={() => void chooseShopLogo()}><Store size={15} /> {data.settings.shop_logo ? 'Sostituisci logo' : 'Scegli logo'}</button></div><button className="button button-primary"><Check size={16} /> Salva nome</button></form></>}
        {settingsTab === 'Sicurezza' && <><div className="settings-title"><h2>Accesso e sicurezza</h2><p>Proteggi l’apertura del gestionale con un PIN.</p></div><div className="security-status"><div className="security-icon"><ShieldCheck size={20} /></div><div><strong>{hasPin ? 'PIN attivo' : 'Nessun PIN configurato'}</strong><span>{hasPin ? 'Il PIN viene richiesto all’avvio.' : 'Scegli un codice da 4 a 8 cifre.'}</span></div></div><form className="settings-form" onSubmit={async (event) => { event.preventDefault(); try { await window.gestionale.setPin(newPin); setHasPin(true); setNewPin(''); notify('PIN aggiornato'); } catch (error) { notify(errorText(error)); } }}><Field label={hasPin ? 'Nuovo PIN (4–8 cifre)' : 'PIN (4–8 cifre)'} type="password" inputMode="numeric" minLength={4} maxLength={8} pattern="[0-9]{4,8}" value={newPin} onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))} required /><button className="button button-primary"><LockKeyhole size={16} />{hasPin ? 'Aggiorna PIN' : 'Attiva PIN'}</button></form></>}
        {settingsTab === 'Archivio dati' && <><div className="settings-title"><h2>Archivio locale</h2><p>Database SQLite e copie giornaliere dei dati.</p></div><div className="connection-status settings-connection"><span className="status-dot" />Archivio locale attivo</div><div className="database-card"><div className="security-icon"><Archive size={20} /></div><div><strong>Database SQLite</strong><span className="database-path">{data.settings.database_file}</span></div><span className="stock-badge">Attivo</span></div><div className="settings-form"><label className="field"><span>Cartella esportazioni giornaliere</span><div className="folder-input"><input value={archiveFolder} readOnly /><button className="button button-outline" type="button" onClick={() => void chooseFolder()}>Scegli cartella</button></div></label><p className="help-copy">Ogni giorno a mezzanotte vengono aggiornati file TXT e PDF nelle cartelle Magazzino, Cassa, Vendite e Statistiche.</p></div></>}
        {settingsTab === 'Dispositivi' && <><div className="settings-title"><h2>Dispositivi</h2><p>Configura il lettore di codici a barre e la stampante degli scontrini.</p></div><div className="device-setting"><div className="device-heading"><div className="security-icon"><Barcode size={20} /></div><div><strong>Lettore di codici a barre</strong><span>{data.settings.barcode_scanner_detected ? 'Rilevato: è stata acquisita almeno una scansione su questo computer.' : 'In attesa della prima lettura del lettore USB/HID.'}</span></div><button className={`toggle-button${data.settings.barcode_scanner_enabled ? ' enabled' : ''}`} type="button" role="switch" aria-checked={data.settings.barcode_scanner_enabled} onClick={() => void toggleBarcodeScanner()}>{data.settings.barcode_scanner_enabled ? 'Attivo' : 'Disattivo'}</button></div><p className="help-copy">I lettori USB che si comportano come tastiera vengono riconosciuti automaticamente quando inviano un codice. La preferenza resta salvata tra gli avvii.</p></div><div className="device-setting"><div className="settings-title"><h3>Stampante scontrini</h3><p>Le stampanti rilevate dal sistema possono essere collegate in modo permanente.</p></div><div className="device-printer-row"><SelectField label="Stampante collegata" value={data.settings.receipt_printer} onChange={(value) => void saveReceiptPrinter(value)} options={['', ...printers.map((printer) => printer.name)]} labels={['Seleziona stampante', ...printers.map((printer) => printer.displayName || printer.name)]} /><button className="button button-outline" type="button" onClick={() => void window.gestionale.getPrinters().then(setPrinters).catch((error: unknown) => notify(errorText(error)))}><Printer size={15} /> Rileva stampanti</button></div>{!printers.length && <p className="help-copy">Nessuna stampante rilevata. Verifica che sia collegata e installata nel sistema.</p>}{data.settings.receipt_printer && !printers.some((printer) => printer.name === data.settings.receipt_printer) && <p className="help-copy">La stampante salvata non è attualmente disponibile: selezionane una nuova.</p>}</div></>}
        {settingsTab === 'Tema dell’app' && <><div className="settings-title"><h2>Tema dell’app</h2><p>Scegli il colore principale dell’interfaccia.</p></div><div className="theme-choice-grid"><button type="button" className={`theme-choice${appTheme === 'green' ? ' selected' : ''}`} aria-pressed={appTheme === 'green'} onClick={() => setAppTheme('green')}><span className="theme-swatch theme-swatch-green" /><span><strong>Verde</strong><small>Tema attuale</small></span>{appTheme === 'green' && <Check size={17} />}</button><button type="button" className={`theme-choice${appTheme === 'blue' ? ' selected' : ''}`} aria-pressed={appTheme === 'blue'} onClick={() => setAppTheme('blue')}><span className="theme-swatch theme-swatch-blue" /><span><strong>Blu</strong><small>Accenti blu</small></span>{appTheme === 'blue' && <Check size={17} />}</button></div></>}
      </section>}</div></div>}
    </main>

    {unsoldListOpen && <Modal title="Articoli ancora in magazzino" close={() => setUnsoldListOpen(false)} wide><div id="unsold-list-print"><Table headings={['Articolo', 'Categoria', 'Quantità non venduta', 'Prezzo vendita']}><>{unsoldProducts.map((product) => <tr key={product.id}><td className="cell-primary">{product.name}</td><td>{product.category}</td><td>{product.stock} {product.unit ?? 'PEZZO'}</td><td>{money.format(product.sale_price)}</td></tr>)}</>{!unsoldProducts.length && <tr><td colSpan={4} className="empty-cell">Non risultano articoli rimanenti in magazzino.</td></tr>}</Table></div><div className="unsold-list-actions no-print"><button className="button button-outline" onClick={() => window.print()}><Printer size={16} /> Stampa</button><button className="button button-primary" onClick={() => void shareUnsoldList()}><Share2 size={16} /> Condividi</button></div></Modal>}
    {reportExportOpen && <Modal title={reportExportType.startsWith('sales') ? 'Esporta report vendite' : 'Esporta report contabilità e finanza'} close={() => setReportExportOpen(false)}><div className="report-export-options"><p>Vuoi applicare al report il filtro temporale selezionato ({reportExportType.startsWith('sales') ? salesPeriod : balancePeriod}) o includere tutto il periodo disponibile?</p><button className="button button-primary" onClick={() => { setReportExportOpen(false); if (reportExportType === 'sales-pdf') exportReport(true); else if (reportExportType === 'sales-csv') exportSalesCsv(true); else downloadFinancialBalance(true); }}><Check size={15} /> Rispetta il filtro di tempo</button><button className="button button-outline" onClick={() => { setReportExportOpen(false); if (reportExportType === 'sales-pdf') exportReport(false); else if (reportExportType === 'sales-csv') exportSalesCsv(false); else downloadFinancialBalance(false); }}><ArrowDownToLine size={15} /> Esporta tutto</button></div></Modal>}
    {employeeDetails && <Modal title={`${employeeDetails.first_name} ${employeeDetails.last_name}`} close={() => setEmployeeDetails(null)} rightHalf>
      <div className="employee-detail-content">
        <div className="employee-detail-hero"><img src={employeeDetails.photo_data} alt={`Foto di ${employeeDetails.first_name} ${employeeDetails.last_name}`} /><div><strong>{employeeDetails.role}</strong><span>{employeeDetails.operational_site} · {employeeDetails.shift}</span></div></div>
        <div className="employee-detail-fields">{[['Età', employeeDetails.age], ['Sesso', employeeDetails.gender], ['Indirizzo', employeeDetails.home_address], ['Email', employeeDetails.email], ['Telefono', employeeDetails.phone], ['Ruolo', employeeDetails.role], ['Turno', employeeDetails.shift], ['Sede operativa', employeeDetails.operational_site], ['Stipendio', money.format(employeeDetails.salary)], ['Metodo di pagamento', employeeDetails.payment_method], ['IBAN', employeeDetails.payment_method === 'Bonifico' ? employeeDetails.iban : '—'], ['Codice riconoscimento', employeeDetails.recognition_code], ['Contratto', employeeDetails.contract_pdf_data ? 'PDF allegato' : 'Non presente']].map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}<div className="employee-detail-barcode"><span>Barcode</span><BarcodeImage value={employeeDetails.barcode} /><strong>{employeeDetails.barcode}</strong></div></div>
        <section className="employee-detail-docs"><h3>Foto documenti</h3><div>{employeeDocumentImages(employeeDetails.documents_data).map((image, index) => <img src={image} alt={`Documento ${index + 1}`} key={`${index}-${image.slice(0, 30)}`} />)}</div></section>
      </div>
      <div className="drawer-footer employee-profile-actions"><button className="button button-outline" onClick={() => void exportEmployeePdf(employeeDetails)}><ArrowDownToLine size={15} /> Scarica</button><button className="button button-outline" onClick={() => void printEmployeePdf(employeeDetails)}><Printer size={15} /> Stampa</button><button className="button button-primary" onClick={() => setEmployeeDetails(null)}>Chiudi</button></div>
    </Modal>}
    {voucherViewBatch && <Modal title={`Codici buono · Gruppo ${voucherViewBatch.id}`} close={() => setVoucherViewBatch(null)} wide><div className="voucher-preview-heading"><strong>{voucherViewBatch.discount_percentage}% di sconto</strong><span>{voucherViewBatch.starts_at} — {voucherViewBatch.ends_at}</span></div><Table headings={['Codice', 'Barcode', 'Sconto', 'Inizio', 'Scadenza']}><>{voucherViewBatch.codes.map((code) => <tr key={code}><td className="mono">{code}</td><td><BarcodeImage value={code} /></td><td>{voucherViewBatch.discount_percentage}%</td><td>{voucherViewBatch.starts_at}</td><td>{voucherViewBatch.ends_at}</td></tr>)}</></Table></Modal>}
    {pendingUnknownCode && <Modal title="Articolo non presente" wide close={() => { setPendingUnknownCode(''); setScannerSearch(''); }}><div className="unknown-code-message"><CircleAlert size={26} /><p>Il codice a barre <strong>{pendingUnknownCode}</strong> non è presente tra gli articoli.</p><span>Puoi aggiungerlo come nuovo articolo: il codice acquisito sarà già inserito nel modulo.</span><div className="form-actions"><button className="button button-quiet" onClick={() => { setPendingUnknownCode(''); setScannerSearch(''); }}>Annulla</button><button className="button button-primary" onClick={() => { setProductEditingId(null); setProductForm({ ...blankProduct, code: pendingUnknownCode }); setPendingUnknownCode(''); }}><Plus size={16} /> Aggiungi articolo</button></div></div></Modal>}
    {measuredProduct && <Modal title={measuredProduct.unit === 'KG' ? `Inserisci il peso · ${measuredProduct.name}` : `Inserisci il volume · ${measuredProduct.name}`} close={() => setMeasuredProduct(null)}><form className="form-grid measured-quantity-form" onSubmit={confirmMeasuredQuantity}><p className="measured-price">{money.format(measuredProduct.sale_price)} / {measuredProduct.unit === 'KG' ? 'kg' : 'lit.'}</p><Field label={measuredProduct.unit === 'KG' ? 'Peso in kg' : 'Volume in litri'} type="number" min="0.001" step="0.001" value={measuredQuantity} onChange={(event) => setMeasuredQuantity(event.target.value)} required autoFocus placeholder={measuredProduct.unit === 'KG' ? 'Es. 0,750' : 'Es. 1,500'} /><div className="measured-quantity-options">{(measuredProduct.unit === 'KG' ? [{ label: '50 g', quantity: 0.05 }, { label: '100 g', quantity: 0.1 }, { label: '250 g', quantity: 0.25 }, { label: '500 g', quantity: 0.5 }, { label: '1 kg', quantity: 1 }, { label: '2 kg', quantity: 2 }] : [{ label: '50 ml', quantity: 0.05 }, { label: '100 ml', quantity: 0.1 }, { label: '250 ml', quantity: 0.25 }, { label: '500 ml', quantity: 0.5 }, { label: '1 L', quantity: 1 }, { label: '2 L', quantity: 2 }]).map(({ label, quantity }) => <button className="button button-outline" key={label} type="button" onClick={() => addMeasuredQuantity(quantity)}>{label}</button>)}</div><div className="form-actions"><button className="button button-quiet full-width" type="button" onClick={() => setMeasuredProduct(null)}>Annulla</button><button className="button button-primary full-width"><Check size={16} /> Aggiungi al carrello</button></div></form></Modal>}
    {productForm && <ProductForm initial={productForm} save={saveProduct} close={() => { setProductForm(null); setProductEditingId(null); }} categories={categories} onDelete={productEditingId !== null ? async () => { const product = data.products.find((item) => item.id === productEditingId); if (product) await deleteProduct(product); } : undefined} />}
    {stockProduct && <Modal title={`Aggiungi quantità · ${stockProduct.name}`} close={() => { setStockProduct(null); setStockMovementEmployeeBarcode(''); }}><form className="form-grid stock-form" onSubmit={(event) => void saveStock(event)}>
      <p className="stock-current">Giacenza attuale: <strong>{stockProduct.stock}</strong></p>
      <Field label="Nuova quantità" type="number" min="0.01" step="any" value={stockInput} onChange={(event) => setStockInput(event.target.value)} required placeholder="Quantità da aggiungere" />
      <Field fieldClassName="movement-barcode-field" label="Barcode del personale (scansiona il badge)" value={stockMovementEmployeeBarcode} readOnly autoFocus disabled={!data.settings.barcode_scanner_enabled} placeholder={data.settings.barcode_scanner_enabled ? 'In attesa della scansione…' : 'Attiva il lettore barcode nelle impostazioni'} />
      <div className="form-actions"><button className="button button-quiet full-width" type="button" onClick={() => { setStockProduct(null); setStockMovementEmployeeBarcode(''); }}>Annulla</button><button className="button button-primary full-width" disabled={!data.settings.barcode_scanner_enabled || !stockMovementEmployeeBarcode}><Check size={16} /> Conferma giacenza</button></div>
    </form></Modal>}{selectedProduct && <div className="drawer-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setSelectedProduct(null); }}><aside className="detail-drawer"><header className="drawer-header"><div><p className="eyebrow">DETTAGLIO ARTICOLO</p><h2>{selectedProduct.name}</h2></div><button className="icon-button" onClick={() => setSelectedProduct(null)}><X size={18} /></button></header><div className="drawer-content"><div className="detail-icon"><Package size={26} /></div><span className="stock-badge">{selectedProduct.category}</span><div className="detail-list"><Detail label="Codice a barre" value={selectedProduct.code} /><Detail label="Prezzo vendita" value={money.format(selectedProduct.sale_price)} /><Detail label="Prezzo acquisto" value={money.format(selectedProduct.purchase_price)} /><Detail label="Giacenza" value={`${selectedProduct.stock} ${selectedProduct.unit ?? 'PEZZO'}`} /><Detail label="Soglia minima" value={`${selectedProduct.low_stock_threshold} ${selectedProduct.unit ?? 'PEZZO'}`} />{selectedProduct.expiry_enabled && selectedProduct.expiry_date && <Detail label="Data di scadenza" value={receiptDate.format(new Date(`${selectedProduct.expiry_date}T00:00:00`))} />}<Detail label="Margine unitario" value={money.format(selectedProduct.sale_price - selectedProduct.purchase_price)} /></div></div><footer className="drawer-footer"><button className="button button-outline full-width" onClick={() => { setProductEditingId(selectedProduct.id); setProductForm({ code: selectedProduct.code, name: selectedProduct.name, unit: selectedProduct.unit ?? 'PEZZO', category: selectedProduct.category, sale_price: selectedProduct.sale_price, purchase_price: selectedProduct.purchase_price, stock: selectedProduct.stock, low_stock_threshold: selectedProduct.low_stock_threshold, expiry_enabled: selectedProduct.expiry_enabled, expiry_date: selectedProduct.expiry_date }); setSelectedProduct(null); }}><Settings size={15} /> Modifica articolo</button><button className="button button-outline full-width" onClick={() => { setStockInput(''); setStockProduct(selectedProduct); setSelectedProduct(null); }}><Package size={15} /> Nuova quantità</button></footer></aside></div>}
    {checkoutOpen && <Modal title="Pagamento" close={() => { setCheckoutOpen(false); setVoucherCode(''); setVoucherMessage(''); setVoucherDiscountPercentage(0); setCheckoutCardBarcode(''); setCheckoutRedeemPoints(''); }} rightHalf narrowPanel><div className="payment-content">
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
      <section className="loyalty-checkout"><h3>Tessera fedeltà</h3><Field label="Barcode tessera (scansiona la carta)" value={checkoutCardBarcode} onChange={(event) => setCheckoutCardBarcode(event.target.value.trim())} placeholder="Scansiona o inserisci il barcode" />{checkoutCardBarcode && (checkoutLoyaltyCard ? <div className="loyalty-card-details"><div><strong>{checkoutLoyaltyCard.first_name} {checkoutLoyaltyCard.last_name}</strong><span>{checkoutLoyaltyCard.points} punti disponibili</span></div><div className="loyalty-redeem-controls"><Field label="Punti da scaricare" type="number" min="1" max={checkoutLoyaltyCard.points} step="1" value={checkoutRedeemPoints} onChange={(event) => setCheckoutRedeemPoints(event.target.value)} /><button className="button button-outline" type="button" disabled={!checkoutRedeemPoints || Number(checkoutRedeemPoints) > checkoutLoyaltyCard.points} onClick={() => void redeemCheckoutPoints()}>Scarica punti</button></div></div> : <small className="voucher-status invalid">Tessera non trovata o non attiva.</small>)}{checkoutLoyaltyCard && <small className="loyalty-points-note">I punti valgono 0,10 € ciascuno. Se ne raccoglie 1 per ogni euro intero.</small>}</section>
      <div className="voucher-checkout"><Field label="Buono sconto" value={voucherCode} onChange={(event) => { setVoucherCode(event.target.value); setVoucherMessage(''); setVoucherDiscountPercentage(0); }} placeholder="Scansiona o inserisci il codice" /><button className="button button-outline" type="button" onClick={() => void applyVoucherCode(voucherCode)} disabled={!voucherCode.trim()}><Barcode size={16} /> Verifica</button>{voucherMessage && <small className={voucherDiscountPercentage > 0 ? 'voucher-status valid' : 'voucher-status invalid'}>{voucherMessage}</small>}</div>
      <div className="payment-total">{total < subtotal && <div className="payment-total-before"><span>Prezzo prima dello sconto</span><strong>{money.format(subtotal)}</strong></div>}{voucherDiscount > 0 && <div className="payment-total-before"><span>Buono sconto ({voucherDiscountPercentage}%)</span><strong>− {money.format(voucherDiscount)}</strong></div>}<div className="payment-total-after"><span>Totale da pagare</span><strong>{money.format(total)}</strong></div></div>
      <div className="payment-note"><ShieldCheck size={16} />Lo scontrino viene registrato nel database locale.</div>
      <button className="button button-primary full-width" onClick={() => void checkout()}><Check size={17} /> Conferma e stampa scontrino</button>
    </div></Modal>}
    {receipt && <Modal title={`Scontrino #${receipt.receipt_no}`} close={() => setReceipt(null)}><div className="receipt-print" id="receipt-print"><div className="receipt-shop">{data.settings.shop_name}</div><div className="receipt-spacer" /><div className="receipt-datetime"><span>{receiptDate.format(new Date(receipt.created_at))}</span><span>{receiptTime.format(new Date(receipt.created_at))}</span></div><div>Numero scontrino: {receipt.receipt_no}</div><div className="receipt-dash" /><div className="receipt-head"><span>Articolo</span><span>Qtà</span><span>Prezzo</span></div>{receipt.items.map((item, index) => <div className="receipt-item" key={`${item.code}-${index}`}><span>{item.name}</span><span>{receiptQuantity.format(item.quantity)}{item.unit === 'KG' ? ' kg' : item.unit === 'LITRO' ? ' L' : ''}</span><span>{money.format(item.unit_price * item.quantity)}</span></div>)}<div className="receipt-dash" /><div className="receipt-total"><strong>TOTALE</strong><strong>{money.format(receipt.total)}</strong></div><div className="receipt-payment-savings"><span>Pagamento: {receipt.payment_method}</span>{receipt.discount > 0 && <span>Risparmio: {money.format(receipt.discount)}</span>}</div><div className="receipt-dash" /><div className="receipt-spacer" /><svg id="receipt-barcode" /><div className="receipt-spacer" /><div className="receipt-thanks">Grazie per averci scelto!</div></div><div className="receipt-actions"><button className="button button-primary full-width" onClick={printReceipt}><Printer size={16} /> Stampa scontrino</button></div></Modal>}
    {saleAdjustment !== null && <Modal title="Modifica vendita completata" close={() => setSaleAdjustment(null)}><div className="sale-adjustment-message"><p>{saleAdjustment > 0 ? `Il cliente deve pagare ancora ${money.format(saleAdjustment)}.` : saleAdjustment < 0 ? `Devi rimborsare al cliente ${money.format(Math.abs(saleAdjustment))}.` : 'Non è necessario effettuare un rimborso o un pagamento aggiuntivo.'}</p><button className="button button-primary" onClick={() => setSaleAdjustment(null)}>Ok</button></div></Modal>}
    {saleDialog && <Modal title={`Vendita #${saleDialog.receipt_no}`} close={() => setSaleDialog(null)} wide><div className="sale-edit">
      <div className="sale-edit-fields">
        <SelectField label="Metodo di pagamento" value={saleDialog.payment_method} onChange={(value) => setSaleDialog({ ...saleDialog, payment_method: value })} options={['Carta', 'Contanti', 'Bancomat', 'Buono']} />
        <div className="sale-discount-fields"><Field label="Sconto (%)" type="number" min="0" max="100" step="0.01" value={saleDiscountPercentage} onChange={(e) => changeSaleDiscount(Number(e.target.value))} /><Field label="Sconto (€)" type="number" value={saleDialog.discount.toFixed(2)} readOnly /></div>
      </div>
      <div className="sale-edit-add">
        <button className="button button-primary full-width" type="button" onClick={() => { setSaleCart([]); setSaleProductSearch(''); setSaleAddOpen(true); }}><Plus size={15} /> Aggiungi articolo</button>
      </div>
      <div className="edit-item-list"><div className="edit-list-head"><span>Articolo</span><span>Quantità</span><span>Prezzo</span><span></span></div>{saleDialog.items.map((item, index) => <div className="edit-item" key={`${item.product_id}-${index}`}><span>{item.name}</span><input aria-label={`Quantità ${item.name}`} type="number" min="0" step={item.unit === 'PEZZO' || !item.unit ? '1' : '0.1'} value={item.quantity} onChange={(e) => changeSaleQuantity(index, Number(e.target.value))} /><span>{money.format(item.unit_price)} / {item.unit ?? 'PEZZO'}</span><button className="icon-button small" type="button" title="Rimuovi articolo dalla vendita" aria-label={`Rimuovi ${item.name} dalla vendita`} onClick={() => changeSaleQuantity(index, 0)}><Trash2 size={15} /></button></div>)}</div>
      <div className="sale-edit-total"><span>Sconto in euro</span><strong>{money.format(saleDialog.discount)}</strong></div>
      <div className="sale-edit-total"><span>Nuovo totale</span><strong>{money.format(Math.max(0, saleDialog.items.reduce((sum, item) => sum + item.quantity * item.unit_price, 0) - saleDialog.discount))}</strong></div>
      <div className="sale-edit-actions"><button className="button button-danger" onClick={() => void deleteSale(saleDialog)}><Trash2 size={15} /> Elimina vendita</button><button className="button button-primary" onClick={() => void updateSale()}><Check size={15} /> Salva modifiche</button></div>
    </div></Modal>}
    {saleAddOpen && <div className="drawer-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setSaleAddOpen(false); }}><aside className="detail-drawer sale-add-drawer"><header className="drawer-header"><div><p className="eyebrow">MODIFICA VENDITA</p><h2>Aggiungi articoli</h2></div><button className="icon-button" onClick={() => setSaleAddOpen(false)} aria-label="Chiudi"><X size={18} /></button></header><div className="sale-add-content"><SearchInput value={saleProductSearch} onChange={setSaleProductSearch} placeholder="Cerca articolo o codice…" /><div className="sale-add-products">{availableSaleProducts.filter((product) => product.name.toLowerCase().includes(saleProductSearch.toLowerCase()) || product.code.includes(saleProductSearch)).map((product) => { const selected = saleCart.find((item) => item.product_id === product.id); return <button className={`sale-add-product${selected ? ' selected' : ''}`} key={product.id} onClick={() => addProductToSaleCart(product)}><span><strong>{product.name}</strong><small>{product.code} · {product.stock} {product.unit ?? 'PEZZO'} disponibili</small></span><span>{money.format(product.sale_price)} / {product.unit ?? 'PEZZO'}<b>{selected ? ` · ${selected.quantity}` : ''}</b></span></button>; })}</div><details className="sale-add-cart"><summary><strong>Carrello · {saleCart.length}</strong></summary>{saleCart.map((item) => <span key={item.product_id}>{item.name} · {item.quantity} {item.unit} <b>{money.format(item.quantity * item.unit_price)}</b></span>)}</details><button className="button button-primary full-width sale-add-confirm" disabled={!saleCart.length} onClick={addProductToSale}><ShoppingCart size={16} /> Conferma l'aggiunta</button></div></aside></div>}
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
  return <div className="search-field"><Search size={17} /><input placeholder={placeholder} value={value} inputMode={numericOnly ? 'numeric' : undefined} pattern={numericOnly ? '[0-9]*' : undefined} onChange={(event) => onChange(numericOnly ? event.target.value.replace(/\D/g, '') : event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') event.preventDefault(); }} /><button type="button" className="search-clear" aria-label="Cancella ricerca" disabled={!value} onClick={() => onChange('')}><X size={15} /></button></div>;
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