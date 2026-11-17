import { Plus } from 'lucide-react';
import type { Employee, Sale, Site, SiteStock } from '../shared/types';
import { SiteCard } from './site-components';
import { usePageServices } from './page-services';

type SiteListPageProps = {
  section: 'site-list' | 'site-management';
  sites: Site[];
  sales: Sale[];
  employees: Employee[];
  siteStocks: SiteStock[];
  canManage: boolean;
  onCreate: () => void;
  onView: (site: Site) => void;
  onMerchandise: (site: Site) => void;
  onEdit: (site: Site) => void;
  onDelete: (site: Site) => void;
};

export function SiteListPage({ section, sites, sales, employees, siteStocks, canManage, onCreate, onView, onMerchandise, onEdit, onDelete }: SiteListPageProps) {
  return <div className="page-content"><div className="page-toolbar"><div>{section === 'site-management' && <h2>Gestione sedi</h2>}<p>{sites.length} sedi registrate</p></div>{canManage && <button className="button button-primary" onClick={onCreate}><Plus size={16} /> Aggiungi sede</button>}</div><div className="site-card-grid">{sites.map((site) => <SiteCard key={site.id} site={site} dailyRevenue={sales.filter((sale) => sale.site === site.name && new Date(sale.created_at).toDateString() === new Date().toDateString()).reduce((sum, sale) => sum + sale.total, 0)} employeeCount={employees.filter((employee) => employee.operational_site === site.name).length} productCount={siteStocks.filter((stock) => stock.site_id === site.id && stock.stock > 0).length} canManage={canManage} onView={() => onView(site)} onMerchandise={() => onMerchandise(site)} onEdit={() => onEdit(site)} onDelete={() => onDelete(site)} />)}{!sites.length && <div className="empty-cell site-empty">Nessuna sede registrata.</div>}</div></div>;
}
