import { ArrowDownToLine, Trash2 } from 'lucide-react';
import type { Product } from '../shared/types';
import { usePageServices } from './page-services';

type ExpiredProductsPageProps = {
  products: Product[];
  onExport: () => void;
  onBack: () => void;
  onDispose: (product: Product) => void;
};

export function ExpiredProductsPage({ products, onExport, onBack, onDispose }: ExpiredProductsPageProps) {
  const { quantityFormat, receiptDate, Table } = usePageServices();
  return <div className="page-content"><div className="page-toolbar"><div><h2>Gestione prodotti scaduti</h2><p>Verifica gli articoli scaduti e registra lo smaltimento.</p></div><div className="toolbar-actions"><button className="button button-outline" disabled={!products.length} onClick={onExport}><ArrowDownToLine size={16} /> Scarica lista</button><button className="button button-outline" onClick={onBack}>Torna al magazzino</button></div></div><Table headings={['Articolo', 'Codice', 'Categoria', 'Giacenza', 'Data di scadenza', 'Azione']}><>{products.map((product) => <tr key={product.id}><td className="cell-primary">{product.name}</td><td className="mono">{product.code}</td><td>{product.category}</td><td>{quantityFormat.format(product.stock)} {product.unit ?? 'PEZZO'}</td><td>{receiptDate.format(new Date(`${product.expiry_date}T00:00:00`))}</td><td><button className="button button-danger" onClick={() => onDispose(product)}><Trash2 size={14} /> Butta articolo</button></td></tr>)}</>{!products.length && <tr><td colSpan={6} className="empty-cell">Non ci sono prodotti scaduti da gestire.</td></tr>}</Table></div>;
}
