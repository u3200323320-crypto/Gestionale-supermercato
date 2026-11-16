import { Fragment, useState } from 'react';
import type { FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Eye, FolderOpen, Mail, Pencil, Phone, Plus, Store, Trash2, X } from 'lucide-react';
import type { Product, Site, Supplier, SupplierInput, SupplierOrder, SupplierOrderInput } from '../shared/types';
import { usePageServices } from './page-services';

export function SupplierListPage({ suppliers, orders, onSave, notify }: { suppliers: Supplier[]; orders: SupplierOrder[]; onSave: (supplier: SupplierInput) => Promise<void>; notify: (message: string) => void }) {
  const { dateTimeText, errorText, formatLocalDate, money, quantityFormat, Field, Modal, Table, Detail, Empty, SelectField, LocalizedNodes } = usePageServices();
  const [draft, setDraft] = useState<SupplierInput | null>(null);
  const [details, setDetails] = useState<Supplier | null>(null);
  const [saving, setSaving] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!draft) return;
    setSaving(true);
    try {
      await onSave(draft);
      setDraft(null);
    } catch (error) {
      notify(errorText(error));
    } finally {
      setSaving(false);
    }
  };
  const supplierOrders = details ? orders.filter((order) => order.supplier_id === details.id) : [];
  const orderedProducts = new Map<string, { name: string; code: string; unit: string; quantity: number }>();
  supplierOrders.forEach((order) => order.items.forEach((item) => {
    const key = item.product_code || `${item.product_name}-${item.unit}`;
    const current = orderedProducts.get(key);
    orderedProducts.set(key, {
      name: item.product_name,
      code: item.product_code,
      unit: item.unit,
      quantity: (current?.quantity ?? 0) + item.quantity,
    });
  }));
  return <LocalizedNodes><div className="page-content supplier-page">
    <div className="page-toolbar"><div><p>{suppliers.length} fornitori registrati</p></div><button className="button button-primary" type="button" onClick={() => setDraft({ name: '', contact_name: '', phone: '', email: '', address: '', notes: '' })}><Plus size={16} /> Aggiungi fornitore</button></div>
    <div className="supplier-card-grid">{suppliers.map((supplier) => <article className="supplier-card" key={supplier.id}><div className="supplier-card-icon"><Store size={20} /></div><h3>{supplier.name}</h3><span className="supplier-card-contact"><Phone size={14} aria-hidden="true" /><strong>Telefono:</strong><span>{supplier.phone || 'non disponibile'}</span></span><span className="supplier-card-contact"><Mail size={14} aria-hidden="true" /><strong>Email:</strong><span className="no-translate">{supplier.email || 'non disponibile'}</span></span><div className="supplier-card-actions"><button className="button button-outline" type="button" onClick={() => setDraft({ id: supplier.id, name: supplier.name, contact_name: supplier.contact_name, phone: supplier.phone, email: supplier.email, address: supplier.address, notes: supplier.notes })}><Pencil size={14} /> Modifica</button><button className="button button-outline" type="button" onClick={() => setDetails(supplier)}><Eye size={14} /> Dai un’occhiata</button></div></article>)}{!suppliers.length && <div className="empty-cell supplier-empty">Nessun fornitore registrato.</div>}</div>
    {draft && <Modal title={draft.id ? 'Modifica fornitore' : 'Aggiungi fornitore'} close={() => setDraft(null)} wide portal><form className="form-grid supplier-form" onSubmit={(event) => void submit(event)}><Field label="Nome fornitore" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} maxLength={120} required autoFocus /><Field label="Nome referente" value={draft.contact_name} onChange={(event) => setDraft({ ...draft, contact_name: event.target.value })} maxLength={120} /><Field label="Telefono" type="tel" value={draft.phone} onChange={(event) => setDraft({ ...draft, phone: event.target.value })} maxLength={40} /><Field label="Email" type="email" value={draft.email} onChange={(event) => setDraft({ ...draft, email: event.target.value })} maxLength={254} /><Field label="Indirizzo" value={draft.address} onChange={(event) => setDraft({ ...draft, address: event.target.value })} maxLength={240} /><label className="field supplier-notes"><span>Note</span><textarea rows={3} maxLength={1000} value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} /></label><div className="form-actions"><button className="button button-quiet" type="button" onClick={() => setDraft(null)}>Annulla</button><button className="button button-primary" disabled={saving}><Check size={16} /> Salva fornitore</button></div></form></Modal>}
    {details && createPortal(<LocalizedNodes><div className="drawer-backdrop supplier-details-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setDetails(null); }}><aside className="detail-drawer supplier-details-drawer"><header className="drawer-header"><div><p className="eyebrow">DETTAGLIO FORNITORE</p><h2>{details.name}</h2></div><button className="icon-button" type="button" onClick={() => setDetails(null)} aria-label="Chiudi"><X size={18} /></button></header><div className="drawer-content"><div className="detail-list supplier-detail-list"><Detail label="Nome fornitore" value={details.name} /><Detail label="Referente" value={details.contact_name || '—'} /><Detail label="Telefono" value={details.phone || '—'} /><Detail label="Email" value={details.email || '—'} /><Detail label="Indirizzo" value={details.address || '—'} /><Detail label="Registrato il" value={dateTimeText(new Date(details.created_at))} /><Detail label="Note" value={details.notes || '—'} /></div><section className="supplier-ordered-products"><h3>Articoli ordinati</h3><p>{supplierOrders.length} ordini registrati</p>{orderedProducts.size ? <div>{[...orderedProducts.values()].map((item) => <article key={`${item.code}-${item.unit}`}><strong>{item.name}</strong><span>{item.code} · {quantityFormat.format(item.quantity)} {item.unit}</span></article>)}</div> : <p className="empty-cell">Nessun articolo ordinato da questo fornitore.</p>}</section></div></aside></div></LocalizedNodes>, document.body)}
  </div></LocalizedNodes>;
}
export function SupplierOrderPage({ suppliers, products, sites, orders, onSave, onReceive, onItemUpdate, onItemDelete, notify }: { suppliers: Supplier[]; products: Product[]; sites: Site[]; orders: SupplierOrder[]; onSave: (order: SupplierOrderInput) => Promise<void>; onReceive: (orderId: number, itemId: number | null, barcode: string) => Promise<void>; onItemUpdate: (orderId: number, itemId: number, quantity: number, unitCost: number, barcode: string) => Promise<void>; onItemDelete: (orderId: number, itemId: number, barcode: string) => Promise<void>; notify: (message: string) => void }) {
  const { dateTimeText, errorText, formatLocalDate, money, quantityFormat, Field, Modal, Table, Detail, Empty, SelectField, LocalizedNodes } = usePageServices();
  const [supplierId, setSupplierId] = useState('');
  const [siteId, setSiteId] = useState('');
  const [productId, setProductId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [unitCost, setUnitCost] = useState('');
  const [expectedArrivalDate, setExpectedArrivalDate] = useState('');
  const [orderStatus, setOrderStatus] = useState<'pending' | 'received'>('pending');
  const [items, setItems] = useState<SupplierOrderInput['items']>([]);
  const [barcodeAction, setBarcodeAction] = useState<{ type: 'register' } | { type: 'receive'; order: SupplierOrder; itemId: number | null; itemName?: string } | { type: 'update-item' | 'delete-item'; order: SupplierOrder; item: SupplierOrder['items'][number] } | null>(null);
  const [expandedOrderId, setExpandedOrderId] = useState<number | null>(null);
  const [employeeBarcode, setEmployeeBarcode] = useState('');
  const [editQuantity, setEditQuantity] = useState('');
  const [editUnitCost, setEditUnitCost] = useState('');
  const [saving, setSaving] = useState(false);
  const selectedProduct = products.find((product) => String(product.id) === productId);
  const addItem = () => {
    const parsedQuantity = Number(quantity);
    const parsedCost = Number(unitCost);
    if (!selectedProduct || !Number.isFinite(parsedQuantity) || parsedQuantity <= 0 || !Number.isFinite(parsedCost) || parsedCost < 0) {
      notify('Seleziona un articolo e inserisci quantità e costo validi.');
      return;
    }
    if (items.some((item) => item.product_id === selectedProduct.id)) {
      notify('L’articolo è già presente nell’ordine.');
      return;
    }
    setItems((current) => [...current, { product_id: selectedProduct.id, quantity: parsedQuantity, unit_cost: parsedCost }]);
    setProductId('');
    setQuantity('');
    setUnitCost('');
  };
  const submitOrder = () => {
    if (!supplierId || !siteId || !items.length || (orderStatus === 'pending' && !expectedArrivalDate)) {
      notify('Seleziona fornitore e sede, aggiungi articoli e indica la data prevista di arrivo.');
      return;
    }
    setEmployeeBarcode('');
    setBarcodeAction({ type: 'register' });
  };
  const confirmBarcodeAction = async (event: FormEvent) => {
    event.preventDefault();
    if (!employeeBarcode.trim() || !barcodeAction) return;
    setSaving(true);
    try {
      if (barcodeAction.type === 'register') {
        const received = orderStatus === 'received';
        await onSave({ supplier_id: Number(supplierId), site_id: Number(siteId), expected_arrival_date: received ? null : expectedArrivalDate, received, employee_barcode: employeeBarcode.trim(), notes: '', items });
        setSupplierId('');
        setSiteId('');
        setProductId('');
        setQuantity('');
        setUnitCost('');
        setItems([]);
      } else if (barcodeAction.type === 'receive') {
        await onReceive(barcodeAction.order.id, barcodeAction.itemId, employeeBarcode.trim());
      } else if (barcodeAction.type === 'update-item') {
        await onItemUpdate(barcodeAction.order.id, barcodeAction.item.id, Number(editQuantity), Number(editUnitCost), employeeBarcode.trim());
      } else {
        await onItemDelete(barcodeAction.order.id, barcodeAction.item.id, employeeBarcode.trim());
      }
      setExpectedArrivalDate('');
      setOrderStatus('pending');
      setBarcodeAction(null);
      setEmployeeBarcode('');
    } catch (error) {
      notify(errorText(error));
    } finally {
      setSaving(false);
    }
  };
  return <LocalizedNodes><div className="page-content supplier-page">
    {!suppliers.length ? <Empty icon={Store} title="Registra prima un fornitore" detail="Aggiungi un fornitore dalla sezione Lista fornitori." /> : <div className="supplier-order-layout">
      <div className="panel supplier-order-form"><SelectField label="Fornitore" value={supplierId} onChange={setSupplierId} options={['', ...suppliers.map((supplier) => String(supplier.id))]} labels={['Seleziona fornitore', ...suppliers.map((supplier) => supplier.name)]} /><SelectField label="Sede di ricevimento" value={siteId} onChange={setSiteId} options={['', ...sites.map((site) => String(site.id))]} labels={['Seleziona sede', ...sites.map((site) => site.name)]} /><SelectField label="Articolo" value={productId} onChange={(value) => { setProductId(value); const product = products.find((item) => String(item.id) === value); setUnitCost(product ? String(product.purchase_price) : ''); }} options={['', ...products.map((product) => String(product.id))]} labels={['Seleziona articolo', ...products.map((product) => `${product.name} · ${product.code}`)]} /><div className="supplier-order-line-inputs"><Field label="Quantità" type="number" min="1" step="1" value={quantity} onChange={(event) => setQuantity(event.target.value)} /><Field label="Costo unitario (€)" type="number" min="0" step="0.01" value={unitCost} onChange={(event) => setUnitCost(event.target.value)} /></div><button className="button button-outline" type="button" disabled={!productId} onClick={addItem}><Plus size={15} /> Aggiungi articolo</button></div>
      <section className="panel supplier-order-items"><div className="panel-heading"><div><h3>Articoli nell’ordine</h3><p>{items.length} articoli</p></div></div><div className="supplier-order-item-list">{items.map((item) => { const product = products.find((candidate) => candidate.id === item.product_id); if (!product) return null; return <div className="supplier-order-item" key={item.product_id}><div><strong>{product.name}</strong><small>{quantityFormat.format(item.quantity)} {product.unit ?? 'PEZZO'} × {money.format(item.unit_cost)}</small></div><strong>{money.format(item.quantity * item.unit_cost)}</strong><button className="icon-button small" type="button" title="Rimuovi articolo" aria-label={`Rimuovi ${product.name}`} onClick={() => setItems((current) => current.filter((entry) => entry.product_id !== item.product_id))}><X size={14} /></button></div>; })}{!items.length && <p className="empty-cell">Aggiungi articoli per comporre l’ordine.</p>}<div className="supplier-order-total"><span>Totale stimato</span><strong>{money.format(items.reduce((sum, item) => sum + item.quantity * item.unit_cost, 0))}</strong></div><div className="supplier-order-controls"><div className="supplier-order-status"><SelectField label="Stato ordine" value={orderStatus} onChange={(value) => setOrderStatus(value as 'pending' | 'received')} options={['pending', 'received']} labels={['In attesa di ricevimento', 'Ordine già ricevuto']} />{orderStatus === 'pending' && <Field label="Data prevista di arrivo" type="date" value={expectedArrivalDate} onChange={(event) => setExpectedArrivalDate(event.target.value)} />}</div><button className="button button-primary full-width" type="button" disabled={saving || !items.length || !supplierId || !siteId || (orderStatus === 'pending' && !expectedArrivalDate)} onClick={submitOrder}><Check size={16} /> Registra ordine</button></div></div></section>
    </div>}
    <section className="supplier-orders-history"><div className="panel-heading"><div><h3>Ordini registrati</h3><p>{orders.length} ordini</p></div></div><Table headings={['Ordine', 'Data', 'Fornitore', 'Sede', 'Articoli', 'Stato', 'Totale']}><>{orders.map((order) => {
      const hasReceivedItems = order.items.some((item) => item.received_at);
      return <Fragment key={order.id}><tr><td><button className="supplier-order-folder" type="button" aria-expanded={expandedOrderId === order.id} onClick={() => setExpandedOrderId((current) => current === order.id ? null : order.id)}><FolderOpen size={15} /> #{order.id}<ChevronDown size={13} /></button></td><td>{dateTimeText(new Date(order.created_at))}</td><td>{order.supplier_name}</td><td>{order.site_name || '—'}</td><td>{order.items.length}</td><td>{order.received_at ? 'Ricevuto' : hasReceivedItems ? 'Parzialmente ricevuto' : order.expected_arrival_date ? `Previsto ${formatLocalDate(order.expected_arrival_date)}` : '—'}</td><td>{money.format(order.items.reduce((sum, item) => sum + item.quantity * item.unit_cost, 0))}</td></tr>{expandedOrderId === order.id && <tr><td className="supplier-order-details-cell" colSpan={7}><div className="supplier-order-details"><div className="supplier-order-details-heading"><strong>Articoli dell’ordine #{order.id}</strong>{!order.received_at && <button className="button button-outline" type="button" onClick={() => { setEmployeeBarcode(''); setBarcodeAction({ type: 'receive', order, itemId: null }); }}><Check size={14} /> Ricevi tutto l’ordine</button>}</div>{order.items.map((item) => <div className="supplier-order-received-item" key={item.id}><div><strong>{item.product_name}</strong><small>{item.product_code} · {quantityFormat.format(item.quantity)} {item.unit} × {money.format(item.unit_cost)}</small></div>{item.received_at ? <span className="supplier-order-received-label">Ricevuto · modifica non disponibile</span> : <div className="supplier-order-item-actions"><button className="button button-outline" type="button" onClick={() => { setEmployeeBarcode(''); setEditQuantity(String(item.quantity)); setEditUnitCost(String(item.unit_cost)); setBarcodeAction({ type: 'update-item', order, item }); }}><Pencil size={14} /> Modifica</button><button className="button button-danger" type="button" onClick={() => { setEmployeeBarcode(''); setBarcodeAction({ type: 'delete-item', order, item }); }}><Trash2 size={14} /> Elimina</button><button className="button button-outline" type="button" onClick={() => { setEmployeeBarcode(''); setBarcodeAction({ type: 'receive', order, itemId: item.id, itemName: item.product_name }); }}><Check size={14} /> Ricevi articolo</button></div>}</div>)}</div></td></tr>}</Fragment>;
    })}{!orders.length && <tr><td colSpan={7} className="empty-cell">Nessun ordine registrato.</td></tr>}</></Table></section>
    {barcodeAction && <Modal title={barcodeAction.type === 'receive' ? barcodeAction.itemId === null ? 'Conferma ricevimento ordine' : 'Conferma ricevimento articolo' : barcodeAction.type === 'register' ? 'Conferma registrazione ordine' : barcodeAction.type === 'update-item' ? 'Modifica articolo ordine' : 'Elimina articolo ordine'} close={() => setBarcodeAction(null)} wide portal><form className="form-grid supplier-order-barcode-form" onSubmit={(event) => void confirmBarcodeAction(event)}><p className="supplier-order-barcode-description">{barcodeAction.type === 'receive' ? `${barcodeAction.itemName ? `Articolo: ${barcodeAction.itemName}` : `Ordine #${barcodeAction.order.id}`}. Scansiona il barcode della persona che conferma il ricevimento.` : barcodeAction.type === 'register' ? 'Scansiona il barcode del dipendente che registra l’ordine.' : `Ordine #${barcodeAction.order.id} · ${barcodeAction.item.product_name}. Scansiona il barcode del dipendente per confermare.`}</p>{barcodeAction.type === 'update-item' && <div className="supplier-order-line-inputs"><Field label="Quantità" type="number" min="0.001" step="0.001" value={editQuantity} onChange={(event) => setEditQuantity(event.target.value)} required /><Field label="Costo unitario (€)" type="number" min="0" step="0.01" value={editUnitCost} onChange={(event) => setEditUnitCost(event.target.value)} required /></div>}<Field label="Barcode dipendente" value={employeeBarcode} onChange={(event) => setEmployeeBarcode(event.target.value)} autoFocus required /><div className="form-actions"><button className="button button-quiet" type="button" onClick={() => setBarcodeAction(null)}>Annulla</button><button className={`button ${barcodeAction.type === 'delete-item' ? 'button-danger' : 'button-primary'}`} disabled={saving}><Check size={16} /> {barcodeAction.type === 'register' ? 'Registra e conferma' : barcodeAction.type === 'receive' ? 'Conferma ricevimento' : barcodeAction.type === 'update-item' ? 'Salva modifiche' : 'Conferma eliminazione'}</button></div></form></Modal>}
  </div></LocalizedNodes>;
}
