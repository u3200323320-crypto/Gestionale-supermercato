import { ArrowDownToLine, Banknote, CircleAlert, ClipboardList, Package, TrendingUp } from 'lucide-react';
import type { Sale } from '../shared/types';
import { usePageServices } from './page-services';
import { SalesTable } from './site-components';

type HomePageProps = {
  image: string;
  dailyGross: number;
  salesCount: number;
  todayRefunds: number;
  dailyProfit: number;
  dailyUnitsLabel: string;
  lowStockCountLabel: string;
  expiringCount: number;
  expiringCountLabel: string;
  canOpenExpiryList: boolean;
  recentSales: Sale[];
  canOpenLowStock: boolean;
  onOpenLowStock: () => void;
  onOpenExpiryList: () => void;
  onOpenSales: () => void;
  onSelectSale: (sale: Sale) => void;
};

export function HomePage({
  image, dailyGross, salesCount, todayRefunds, dailyProfit, dailyUnitsLabel, lowStockCountLabel, expiringCount, expiringCountLabel,
  canOpenExpiryList, recentSales, canOpenLowStock, onOpenLowStock, onOpenExpiryList, onOpenSales, onSelectSale,
}: HomePageProps) {
  const { language, text, money, Metric, SectionHeading } = usePageServices();
  return <div className="page-content home-page">
    <img className="home-banner" src={image} alt="Immagine homepage" />
    <div className="metric-grid">
      <Metric icon={Banknote} label="Vendite di oggi" value={money.format(dailyGross)} detail={`${salesCount} scontrini emessi`} />
      <Metric icon={ArrowDownToLine} label="Rimborsi" value={money.format(todayRefunds)} detail="Rimborsi registrati oggi" />
      <Metric icon={TrendingUp} label="Netto vendite" value={money.format(dailyProfit)} detail="Profitto dopo sconti e costo merce" />
      <Metric icon={Package} label="Articoli venduti" value={dailyUnitsLabel} detail="Pezzi registrati oggi" />
      <Metric icon={CircleAlert} label="Merce in esaurimento" value={lowStockCountLabel} detail="Articoli in esaurimento o esauriti nelle sedi" action={canOpenLowStock ? <button className="text-button metric-action" type="button" onClick={onOpenLowStock}>{text('Vedi lista')}</button> : undefined} />
      <Metric icon={CircleAlert} label="Avviso date di scadenza" value={expiringCountLabel} detail={expiringCount ? 'Articoli in scadenza entro 10 giorni' : 'Nessun articolo in scadenza nei prossimi 10 giorni'} action={canOpenExpiryList ? <button className="text-button metric-action" type="button" onClick={onOpenExpiryList}>{text('Vedi lista')}</button> : undefined} />
    </div>
    <section className="content-section"><SectionHeading icon={ClipboardList} title="Ultime vendite" detail="Transazioni più recenti" action={<button className="text-button" onClick={onOpenSales}>{language === 'ar' ? 'كل المبيعات ←' : 'Tutte le vendite →'}</button>} /><SalesTable sales={recentSales} onSelect={onSelectSale} /></section>
  </div>;
}
