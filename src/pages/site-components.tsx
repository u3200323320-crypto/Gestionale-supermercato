import { useEffect, useState } from 'react';
import { CalendarDays, Check, ChevronDown, Clock, Eye, MapPin, Pencil, Phone, Store, Trash2, UserRound, X } from 'lucide-react';
import type { AppState, Employee, Product, Sale, Site, SiteStock } from '../shared/types';
import { usePageServices } from './page-services';

export function SiteCard({ site, dailyRevenue, employeeCount, productCount, canManage, onView, onEdit, onDelete }: {
  site: Site;
  dailyRevenue: number;
  employeeCount: number;
  productCount: number;
  canManage: boolean;
  onView: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { text, money } = usePageServices();
  return <article className="site-card">
    <header className="site-card-header"><span className="site-card-icon"><Store size={20} aria-hidden="true" /></span><div><h3>{site.name}</h3><span>{text(site.site_role || 'Punto vendita')}</span></div></header>
    <div className="site-card-info">
      <div className="site-card-info-inline"><MapPin size={14} strokeWidth={2.5} aria-label={text('Indirizzo')} role="img" /><span className="no-translate">{site.address || '—'}</span></div>
      <div className="site-card-info-inline"><Phone size={14} strokeWidth={2.5} aria-label={text('Telefono')} role="img" /><span className="no-translate">{site.phone || '—'}</span></div>
      <div className="site-card-info-inline"><UserRound size={14} strokeWidth={2.5} aria-label={text('Responsabile')} role="img" /><span><strong>{text('Responsabile:')}</strong><span className="site-card-manager-value no-translate">{site.manager_name || '—'}</span></span></div>
      <div className="site-card-info-inline"><CalendarDays size={14} strokeWidth={2.5} aria-label={text('Giorni lavorativi')} role="img" /><span className="no-translate">{site.working_days || '—'}</span></div>
      <div className="site-card-info-inline"><Clock size={14} strokeWidth={2.5} aria-label={text('Orari di apertura')} role="img" /><span className="no-translate">{site.opening_hours || '—'}</span></div>
    </div>
    <div className="site-card-metrics">
      <div className="site-card-metric"><span>{text('Fatturato del giorno')}</span><strong>{money.format(dailyRevenue)}</strong></div>
      <div className="site-card-metric"><span>{text('Dipendenti')}</span><strong>{employeeCount}</strong></div>
      <div className="site-card-metric"><span>{text('Prodotti in sede')}</span><strong>{productCount}</strong></div>
    </div>
    <button className="button button-outline site-card-view" type="button" onClick={onView}><Eye size={14} /> {text('Vedi nel dettaglio')}</button>
    {canManage && <div className="site-card-actions"><button className="button button-danger" type="button" onClick={onDelete}><Trash2 size={14} /> {text('Elimina')}</button><button className="button button-outline" type="button" onClick={onEdit}><Pencil size={14} /> {text('Modifica')}</button></div>}
  </article>;
}
export function OpeningHoursPicker({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const { Field } = usePageServices();
  const getTimes = (hours: string) => {
    const match = hours.match(/((?:[01]\d|2[0-3]):[0-5]\d)\s*[-–]\s*((?:[01]\d|2[0-3]):[0-5]\d)/);
    return { opening: match?.[1] ?? '', closing: match?.[2] ?? '' };
  };
  const initialTimes = getTimes(value);
  const [opening, setOpening] = useState(initialTimes.opening);
  const [closing, setClosing] = useState(initialTimes.closing);
  useEffect(() => {
    const times = getTimes(value);
    setOpening(times.opening);
    setClosing(times.closing);
  }, [value]);
  const updateTimes = (nextOpening: string, nextClosing: string) => {
    setOpening(nextOpening);
    setClosing(nextClosing);
    if (nextOpening && nextClosing) onChange(`${nextOpening} - ${nextClosing}`);
  };
  return <div className="field">
    <span>Orari di apertura</span>
    <details className="opening-hours-picker">
      <summary className="select-wrap"><span>{value || 'Seleziona apertura e chiusura'}</span><ChevronDown size={14} /></summary>
      <div className="opening-hours-options">
        <Field label="Apertura" type="time" value={opening} onChange={(event) => updateTimes(event.target.value, closing)} />
        <Field label="Chiusura" type="time" value={closing} onChange={(event) => updateTimes(opening, event.target.value)} />
        <button className="button button-quiet" type="button" onClick={() => { setOpening(''); setClosing(''); onChange(''); }}>Cancella orari</button>
      </div>
    </details>
  </div>;
}
export function SiteDetailsDrawer({ site, data, close }: { site: Site; data: AppState; close: () => void }) {
  const { text, money, quantityFormat, dateTimeText, formatLocalDate, Table } = usePageServices();
  const employees = data.employees.filter((employee) => employee.operational_site === site.name);
  const sales = data.sales.filter((sale) => sale.site === site.name);
  const expenses = data.expenses.filter((expense) => expense.site === site.name);
  const refunds = data.refunds.filter((refund) => refund.site === site.name);
  const inventory = data.siteStocks.filter((stock) => stock.site_id === site.id && stock.stock > 0);
  const movements = data.stockMovements.filter((movement) => movement.site === site.name || movement.destination === site.name);
  const income = sales.reduce((sum, sale) => sum + sale.total, 0);
  const expenseTotal = expenses.reduce((sum, expense) => sum + expense.amount, 0);
  const refundTotal = refunds.reduce((sum, refund) => sum + refund.amount, 0);
  return <div className="drawer-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}><aside className="detail-drawer site-details-drawer"><header className="drawer-header"><div><p className="eyebrow">DETTAGLIO SEDE</p><h2>{site.name}</h2></div><button className="icon-button" onClick={close} aria-label={text('Chiudi')}><X size={18} /></button></header>
    <div className="site-details-content">
      <div className="site-details-metrics"><div className="site-details-metric"><span>{text('Incassi')}</span><strong>{money.format(income)}</strong></div><div className="site-details-metric"><span>{text('Rimborsi')}</span><strong>{money.format(refundTotal)}</strong></div><div className="site-details-metric"><span>{text('Spese')}</span><strong>{money.format(expenseTotal)}</strong></div><div className="site-details-metric"><span>{text('Scontrini')}</span><strong>{sales.length}</strong></div></div>
      <section><h3>{text('Informazioni sede')}</h3><div className="site-detail-list">{site.address && <span>Indirizzo: {site.address}</span>}{site.phone && <span>Telefono: {site.phone}</span>}{site.email && <span>Email: {site.email}</span>}{site.tax_id && <span>Codice fiscale o partita IVA: {site.tax_id}</span>}{site.manager_name && <span>Responsabile: {site.manager_name}</span>}{site.working_days && <span>Giorni lavorativi: {site.working_days}</span>}{site.opening_hours && <span>Orari di apertura: {site.opening_hours}</span>}{site.notes && <span>Note: {site.notes}</span>}{!site.address && !site.phone && !site.email && !site.tax_id && !site.manager_name && !site.working_days && !site.opening_hours && !site.notes && <span>—</span>}</div></section>
      <section><h3>{text('Dipendenti')} · {employees.length}</h3><div className="site-detail-list">{employees.length ? employees.map((employee) => <span key={employee.id}>{employee.first_name} {employee.last_name} · {text(employee.role)}</span>) : <span>—</span>}</div></section>
      <section><h3>{text('Merce in sede')}</h3><Table headings={['Articolo', 'Giacenza']}><>{inventory.map((stock) => { const product = data.products.find((item) => item.id === stock.product_id); return <tr key={stock.product_id}><td className="cell-primary">{product?.name ?? `#${stock.product_id}`}</td><td>{quantityFormat.format(stock.stock)} {product?.unit ?? 'PEZZO'}</td></tr>; })}{!inventory.length && <tr><td colSpan={2} className="empty-cell">—</td></tr>}</></Table></section>
      <section><h3>{text('Ultimi incassi')}</h3><Table headings={['Data e ora', 'Scontrino', 'Totale']}><>{sales.slice(0, 10).map((sale) => <tr key={sale.id}><td>{dateTimeText(new Date(sale.created_at))}</td><td>#{sale.receipt_no}</td><td className="align-right">{money.format(sale.total)}</td></tr>)}{!sales.length && <tr><td colSpan={3} className="empty-cell">—</td></tr>}</></Table></section>
      <section><h3>{text('Spese e movimenti')} · {expenses.length} / {movements.length}</h3><div className="site-detail-list">{expenses.slice(0, 8).map((expense) => <span key={`expense-${expense.id}`}>{formatLocalDate(expense.expense_date)} · {expense.description} · {money.format(expense.amount)}</span>)}{movements.slice(0, 8).map((movement) => <span key={`movement-${movement.id}`}>{dateTimeText(new Date(movement.created_at))} · {movement.product_name} · {text(movement.movement_type)} {quantityFormat.format(movement.quantity)}</span>)}{!expenses.length && !movements.length && <span>—</span>}</div></section>
    </div></aside></div>;
}
export function SiteStockStatistics({ sites, siteStocks, employees, products }: { sites: Site[]; siteStocks: SiteStock[]; employees: Employee[]; products: Product[] }) {
  const { text, quantityFormat, money, Table } = usePageServices();
  return <section className="panel site-summary-panel"><div className="panel-heading"><div><h3>{text('Magazzino e personale per sede')}</h3><p>{text('Quantità, personale e valore delle scorte per sede')}</p></div></div>
    <Table headings={['Sede', 'Dipendenti', 'Persone che lavorano', 'Articoli disponibili', 'Valore a costo', 'Valore di vendita']}>
      <>{sites.map((site) => {
        const workers = employees.filter((employee) => employee.operational_site === site.name);
        const inventory = siteStocks.filter((stock) => stock.site_id === site.id && stock.stock > 0);
        const cost = inventory.reduce((sum, stock) => sum + stock.stock * (products.find((product) => product.id === stock.product_id)?.purchase_price ?? 0), 0);
        const retail = inventory.reduce((sum, stock) => sum + stock.stock * (products.find((product) => product.id === stock.product_id)?.sale_price ?? 0), 0);
        return <tr key={site.id}>
          <td className="cell-primary">{site.name}</td>
          <td><span className="site-stat-count">{workers.length}</span></td>
          <td><div className="site-stat-people">{workers.map((employee) => <span className="no-translate" key={employee.id}>{employee.first_name} {employee.last_name}</span>)}</div></td>
          <td><div className="site-stock-lines">{inventory.length ? inventory.map((stock) => {
            const product = products.find((item) => item.id === stock.product_id);
            const unit = product?.unit === 'KG' ? 'kg' : product?.unit === 'LITRO' ? 'lit.' : 'pz';
            return <span className="site-stat-stock-line" key={stock.product_id}><strong className="no-translate">{product?.name ?? `#${stock.product_id}`}</strong><small>{quantityFormat.format(stock.stock)} {text(unit)}</small></span>;
          }) : '—'}</div></td>
          <td className="align-right"><span className="site-stat-value">{money.format(cost)}</span></td>
          <td className="align-right"><span className="site-stat-value">{money.format(retail)}</span></td>
        </tr>;
      })}</>
      {!sites.length && <tr><td colSpan={6} className="empty-cell">Nessuna sede trovata.</td></tr>}
    </Table>
  </section>;
}
export function SalesTable({ sales, onSelect }: { sales: Sale[]; onSelect?: (sale: Sale) => void }) {
  const { text, money, dateTimeText, LocalizedNodes } = usePageServices();
  return <div className="table-wrap"><table id="sales-list-table"><thead><tr><th>{text('Numero scontrino')}</th><th>{text('Data e ora')}</th><th>{text('Persona')}</th><th>{text('Articoli')}</th><th>{text('Pagamento')}</th><th className="align-right">{text('Totale')}</th></tr></thead><tbody><LocalizedNodes>{sales.map((sale) => <tr key={sale.id} onClick={onSelect ? () => onSelect(sale) : undefined}><td className="receipt-number">#{sale.receipt_no}</td><td>{dateTimeText(new Date(sale.created_at))}</td><td>{sale.person || '—'}</td><td>{sale.item_count}</td><td><span className="payment-tag">{text(sale.payment_method)}</span></td><td className="align-right cell-primary">{money.format(sale.total)}</td></tr>)}{!sales.length && <tr><td colSpan={6} className="empty-cell">Nessuna vendita registrata.</td></tr>}</LocalizedNodes></tbody></table></div>;
}
