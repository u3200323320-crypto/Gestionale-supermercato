import { ArrowDownToLine, ArrowLeft, Printer } from 'lucide-react';
import type { Product, ProductUnit, Site } from '../shared/types';
import { usePageServices } from './page-services';

export function SiteMerchandisePage({ site, products, onBack, onDownload }: {
  site: Site;
  products: Product[];
  onBack: () => void;
  onDownload: () => void;
}) {
  const { language, text, money, quantityFormat, receiptDate, Table } = usePageServices();
  const headings = language === 'ar'
    ? ['المنتج', 'الرمز', 'الفئة', 'سعر البيع', 'سعر الشراء', 'الربح', 'المخزون', 'حد التنبيه', 'تاريخ الصلاحية']
    : ['Articolo', 'Codice', 'Categoria', 'Vendita', 'Acquisto', 'Profitto', 'Giacenza', 'Soglia', 'Scadenza'];
  const totals = products.reduce((sum, product) => {
    const unit = product.unit ?? 'PEZZO';
    sum.sale += product.sale_price * product.stock;
    sum.purchase += product.purchase_price * product.stock;
    sum.profit += (product.sale_price - product.purchase_price) * product.stock;
    sum.stock[unit] += product.stock;
    sum.threshold[unit] += product.low_stock_threshold;
    return sum;
  }, {
    sale: 0,
    purchase: 0,
    profit: 0,
    stock: { KG: 0, LITRO: 0, PEZZO: 0 },
    threshold: { KG: 0, LITRO: 0, PEZZO: 0 },
  });
  const formatUnitTotals = (values: Record<ProductUnit, number>) => (['KG', 'LITRO', 'PEZZO'] as const)
    .filter((unit) => values[unit] > 0)
    .map((unit) => {
      const label = language === 'ar'
        ? unit === 'KG' ? 'كغ' : unit === 'LITRO' ? 'لتر' : 'قطعة'
        : unit === 'KG' ? 'kg' : unit === 'LITRO' ? 'lit.' : 'pz';
      return `${quantityFormat.format(values[unit])} ${label}`;
    })
    .join(' · ') || '0';
  return <div className="page-content site-merchandise-page">
    <div className="page-toolbar no-print">
      <div>
        <button className="settings-back" type="button" onClick={onBack}><ArrowLeft size={15} /> {text('Torna alla lista sedi')}</button>
        <h2>{text('Merce nella sede')}: {site.name}</h2>
        <p>{products.length} {text('articoli presenti')}</p>
      </div>
      <div className="toolbar-actions">
        <button className="button button-outline" type="button" onClick={onDownload}><ArrowDownToLine size={16} /> {text('Scarica report')}</button>
        <button className="button button-primary" type="button" onClick={() => window.print()}><Printer size={16} /> {text('Stampa lista')}</button>
      </div>
    </div>
    <div id="site-merchandise-print">
      <h2 className="site-merchandise-print-heading">{text('Merce nella sede')}: {site.name}</h2>
      <Table headings={headings}><>
        {products.map((product) => {
          const unit = language === 'ar'
            ? product.unit === 'KG' ? 'كغ' : product.unit === 'LITRO' ? 'لتر' : 'قطعة'
            : product.unit === 'KG' ? 'kg' : product.unit === 'LITRO' ? 'lit.' : 'pz';
          return <tr key={product.id}>
            <td className="cell-primary">{product.name}</td>
            <td className="no-translate">{product.code}</td>
            <td>{product.category}</td>
            <td>{money.format(product.sale_price)}</td>
            <td>{money.format(product.purchase_price)}</td>
            <td>{money.format(product.sale_price - product.purchase_price)}</td>
            <td>{quantityFormat.format(product.stock)} {unit}</td>
            <td>{quantityFormat.format(product.low_stock_threshold)} {unit}</td>
            <td>{product.expiry_enabled && product.expiry_date ? receiptDate.format(new Date(`${product.expiry_date}T00:00:00`)) : '—'}</td>
          </tr>;
        })}
        {!products.length && <tr><td colSpan={9} className="empty-cell">{text('Nessun prodotto presente in questa sede.')}</td></tr>}
        <tr className="site-merchandise-total-row">
          <td>{text('Totale')}</td>
          <td />
          <td />
          <td>{money.format(totals.sale)}</td>
          <td>{money.format(totals.purchase)}</td>
          <td>{money.format(totals.profit)}</td>
          <td>{formatUnitTotals(totals.stock)}</td>
          <td>{formatUnitTotals(totals.threshold)}</td>
          <td>—</td>
        </tr>
      </></Table>
    </div>
  </div>;
}
