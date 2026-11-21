import { ArrowDownToLine, Camera, ChevronDown } from 'lucide-react';
import type { SyntheticEvent } from 'react';
import type { Sale, Site } from '../shared/types';
import { SalesTable } from './site-components';
import { usePageServices } from './page-services';

type SalesPageProps = {
  search: string;
  onSearch: (value: string) => void;
  canExportReport: boolean;
  canExportCsv: boolean;
  onOpenCamera: () => void;
  onOpenReport: () => void;
  onExportCsv: () => void;
  categories: string[];
  category: string;
  onCategoryChange: (value: string) => void;
  period: string;
  onPeriodChange: (value: string) => void;
  periods: string[];
  site: string;
  onSiteChange: (value: string) => void;
  sites: Site[];
  from: string;
  onFromChange: (value: string) => void;
  to: string;
  onToChange: (value: string) => void;
  sales: Sale[];
  onSelect: (sale: Sale) => void;
};

export function SalesPage({
  search, onSearch, canExportReport, canExportCsv, onOpenCamera, onOpenReport, onExportCsv,
  categories, category, onCategoryChange, period, onPeriodChange, periods, site, onSiteChange,
  sites, from, onFromChange, to, onToChange, sales, onSelect,
}: SalesPageProps) {
  const { SearchInput, Field, text } = usePageServices();
  const closeOtherFilters = (event: SyntheticEvent<HTMLDetailsElement>) => {
    if (event.currentTarget.open) document.querySelectorAll<HTMLDetailsElement>('.filter-dropdown[open]').forEach((dropdown) => {
      if (dropdown !== event.currentTarget) dropdown.open = false;
    });
  };
  return <div className="page-content"><div className="sale-tools"><button className="button button-outline sale-camera-button" onClick={onOpenCamera}><Camera size={18} /> {text('Cerca con fotocamera')}</button><SearchInput value={search} onChange={onSearch} placeholder={text('Cerca numero scontrino…')} numericOnly />{canExportReport && <button className="button button-outline sale-report-button" onClick={onOpenReport}><ArrowDownToLine size={16} /> {text('Scarica report')}</button>}{canExportCsv && <button className="button button-outline" onClick={onExportCsv}><ArrowDownToLine size={16} /> Esporta CSV</button>}</div><div className="sale-filters"><details className="statistics-period-dropdown filter-dropdown" onToggle={closeOtherFilters}><summary className="select-wrap"><span>{text('Categoria')}: {text(category)}</span><ChevronDown size={14} /></summary><div className="statistics-period-options" role="group" aria-label={text('Filtra vendite per categoria')}>{['Tutte', ...categories].map((option) => <button key={option} className={`status-filter${category === option ? ' active' : ''}`} aria-pressed={category === option} onClick={(event) => { onCategoryChange(option); event.currentTarget.closest('details')?.removeAttribute('open'); }}>{text(option)}</button>)}</div></details><details className="statistics-period-dropdown filter-dropdown" onToggle={closeOtherFilters}><summary className="select-wrap"><span>{text('Periodo')}: {text(period)}</span><ChevronDown size={14} /></summary><div className="statistics-period-options" role="group" aria-label={text('Filtra vendite per periodo')}>{periods.map((option) => <button key={option} className={`status-filter${period === option ? ' active' : ''}`} aria-pressed={period === option} onClick={(event) => { onPeriodChange(option); event.currentTarget.closest('details')?.removeAttribute('open'); }}>{text(option)}</button>)}</div></details><details className="statistics-period-dropdown filter-dropdown" onToggle={closeOtherFilters}><summary className="select-wrap"><span>{text('Sede')}: {text(site)}</span><ChevronDown size={14} /></summary><div className="statistics-period-options" role="group" aria-label={text('Filtra vendite per sede')}>{['Tutte', ...sites.map((item) => item.name)].map((option) => <button key={option} className={`status-filter${site === option ? ' active' : ''}`} aria-pressed={site === option} onClick={(event) => { onSiteChange(option); event.currentTarget.closest('details')?.removeAttribute('open'); }}>{text(option)}</button>)}</div></details>{period === 'Da - A' && <><Field label="Da" type="date" value={from} onChange={(event) => onFromChange(event.target.value)} /><Field label="A" type="date" value={to} onChange={(event) => onToChange(event.target.value)} /></>}</div><SalesTable sales={sales} onSelect={onSelect} /></div>;
}
