import { ArrowDownToLine, ArrowLeft, Printer } from 'lucide-react';
import type { Product, Site } from '../shared/types';
import { usePageServices } from './page-services';

export function SiteMerchandisePage({ site, products, onBack, onDownload }: {
  site: Site;
  products: Product[];
  onBack: () => void;
  onDownload: () => void;
}) {
  const { text, quantityFormat, Table } = usePageServices();
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
      <Table headings={['Articolo', 'Codice', 'Categoria', 'Quantità']}><>
        {products.map((product) => <tr key={product.id}>
          <td className="cell-primary">{product.name}</td>
          <td className="no-translate">{product.code}</td>
          <td>{product.category}</td>
          <td className="no-translate">{quantityFormat.format(product.stock)} {product.unit ?? 'PEZZO'}</td>
        </tr>)}
        {!products.length && <tr><td colSpan={4} className="empty-cell">{text('Nessun prodotto presente in questa sede.')}</td></tr>}
      </></Table>
    </div>
  </div>;
}
