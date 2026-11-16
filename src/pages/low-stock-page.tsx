import { ArrowDownToLine, Package, Share2 } from 'lucide-react';
import type { Product, Site } from '../shared/types';
import { usePageServices } from './page-services';

type LowStockProduct = Product & { siteStock: number };
type LowStockPageProps = {
  sites: Site[];
  getProductsForSite: (siteId: number) => LowStockProduct[];
  onDownload: () => void;
  onShare: () => void;
};

export function LowStockPage({ sites, getProductsForSite, onDownload, onShare }: LowStockPageProps) {
  const { quantityFormat, Table, Empty } = usePageServices();
  return <div className="page-content low-stock-page"><div className="page-toolbar low-stock-toolbar"><div className="toolbar-actions"><button className="button button-outline" onClick={onDownload}><ArrowDownToLine size={16} /> Scarica lista</button><button className="button button-primary" onClick={onShare}><Share2 size={16} /> Condividi lista</button></div></div>{sites.length ? sites.map((site) => { const products = getProductsForSite(site.id); return <section className="panel low-stock-site-panel" key={site.id}><div className="panel-heading"><div><h3>{site.name}</h3><p>{products.length} articoli in esaurimento</p></div></div><Table headings={['Articolo', 'Codice', 'Categoria', 'Giacenza', 'Soglia minima']}><>{products.map((product) => <tr key={product.id}><td className="cell-primary">{product.name}</td><td className="mono">{product.code}</td><td>{product.category}</td><td>{quantityFormat.format(product.siteStock)} {product.unit === 'KG' ? 'kg' : product.unit === 'LITRO' ? 'L' : 'pz'}</td><td>{quantityFormat.format(product.low_stock_threshold)} {product.unit === 'KG' ? 'kg' : product.unit === 'LITRO' ? 'L' : 'pz'}</td></tr>)}</>{!products.length && <tr><td colSpan={5} className="empty-cell">Nessun articolo in esaurimento in questa sede.</td></tr>}</Table></section>; }) : <Empty icon={Package} title="Nessuna sede registrata." detail="" />}</div>;
}
