import { ArrowDownToLine, Banknote, Package, TrendingUp } from 'lucide-react';
import type { Employee, Product, Site, SiteStock } from '../shared/types';
import { SiteStockStatistics } from './site-components';
import { usePageServices } from './page-services';

type SiteStatisticsRow = Site & {
  income: number;
  expenses: number;
  balance: number;
  receipts: number;
  stockIn: number;
  stockOut: number;
};

type SiteStatisticsPageProps = {
  period: string;
  onPeriodChange: (value: string) => void;
  siteFilter: string;
  onSiteFilterChange: (value: string) => void;
  from: string;
  onFromChange: (value: string) => void;
  to: string;
  onToChange: (value: string) => void;
  sites: Site[];
  selectedStats: SiteStatisticsRow[];
  income: number;
  expenses: number;
  siteStocks: SiteStock[];
  employees: Employee[];
  products: Product[];
};

export function SiteStatisticsPage({
  period, onPeriodChange, siteFilter, onSiteFilterChange, from, onFromChange, to, onToChange,
  sites, selectedStats, income, expenses, siteStocks, employees, products,
}: SiteStatisticsPageProps) {
  const { money, quantityFormat, SelectField, Field, Table, Metric } = usePageServices();
  return <div className="page-content accounting-page site-statistics-page"><div className="site-statistics-filters"><SelectField label="Periodo" value={period} onChange={onPeriodChange} options={['Oggi', 'Ultima settimana', 'Ultimo mese', 'Ultimi 3 mesi', 'Ultimi 6 mesi', 'Tutto', 'Da - A']} /><SelectField label="Sede" value={siteFilter} onChange={onSiteFilterChange} options={['Tutte', ...sites.map((site) => site.name)]} />{period === 'Da - A' && <><Field label="Da" type="date" value={from} onChange={(event) => onFromChange(event.target.value)} /><Field label="A" type="date" value={to} onChange={(event) => onToChange(event.target.value)} /></>}</div><div className="metric-grid accounting-metrics"><Metric icon={Banknote} label="Entrate sedi" value={money.format(income)} detail={period} /><Metric icon={ArrowDownToLine} label="Uscite sedi" value={money.format(expenses)} detail={period} /><Metric icon={TrendingUp} label="Saldo sedi" value={money.format(income - expenses)} detail="Entrate meno uscite" /><Metric icon={Package} label="Sedi attive" value={String(selectedStats.length)} detail="Sedi nel filtro selezionato" /></div><section className="panel site-summary-panel"><div className="panel-heading"><div><h3>Entrate e uscite per sede</h3><p>{period}</p></div></div><Table headings={['Sede', 'Entrate', 'Uscite', 'Saldo', 'Scontrini', 'Carico merce', 'Scarico merce']}><>{selectedStats.map((site) => <tr key={site.id}><td className="cell-primary">{site.name}</td><td className="align-right">{money.format(site.income)}</td><td className="align-right">{money.format(site.expenses)}</td><td className="align-right cell-primary">{money.format(site.balance)}</td><td>{site.receipts}</td><td>{quantityFormat.format(site.stockIn)}</td><td>{quantityFormat.format(site.stockOut)}</td></tr>)}</>{!selectedStats.length && <tr><td colSpan={7} className="empty-cell">Nessuna sede trovata.</td></tr>}</Table></section><SiteStockStatistics sites={sites.filter((site) => siteFilter === 'Tutte' || site.name === siteFilter)} siteStocks={siteStocks} employees={employees} products={products} /></div>;
}
