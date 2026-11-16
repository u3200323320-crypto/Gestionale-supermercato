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
  reorderCount: number;
  reorderCountLabel: string;
  expiringCount: number;
  expiringCountLabel: string;
  canOpenExpiryList: boolean;
  recentSales: Sale[];
  onOpenReorderList: () => void;
  onOpenExpiryList: () => void;
  onOpenSales: () => void;
  onSelectSale: (sale: Sale) => void;
};

export function HomePage({
  image, dailyGross, salesCount, todayRefunds, dailyProfit, dailyUnitsLabel, reorderCount, reorderCountLabel, expiringCount, expiringCountLabel,
  canOpenExpiryList, recentSales, onOpenReorderList, onOpenExpiryList, onOpenSales, onSelectSale,
}: HomePageProps) {
  const { language, text, money, Metric, SectionHeading } = usePageServices();
  return <div className="page-content home-page">
    <img className="home-banner" src={image} alt="Immagine homepage" />
    <div className="metric-grid">
      <Metric icon={Banknote} label="Vendite di oggi" value={money.format(dailyGross)} detail={`${salesCount} scontrini emessi`} />
      <Metric icon={ArrowDownToLine} label="Rimborsi" value={money.format(todayRefunds)} detail="Rimborsi registrati oggi" />
      <Metric icon={TrendingUp} label="Netto vendite" value={money.format(dailyProfit)} detail="Profitto dopo sconti e costo merce" />
      <Metric icon={Package} label="Articoli venduti" value={dailyUnitsLabel} detail="Pezzi registrati oggi" />
      <Metric icon={CircleAlert} label="Da riordinare" value={reorderCountLabel} detail="Articoli sotto soglia" action={<button className="text-button metric-action" type="button" onClick={onOpenReorderList}>{text('Vedi lista')}</button>} />
      <Metric icon={CircleAlert} label="Avviso date di scadenza" value={expiringCountLabel} detail={expiringCount ? 'Articoli in scadenza entro 10 giorni' : 'Nessun articolo in scadenza nei prossimi 10 giorni'} action={canOpenExpiryList ? <button className="text-button metric-action" type="button" onClick={onOpenExpiryList}>{text('Vedi lista')}</button> : undefined} />
    </div>
    <section className="content-section"><SectionHeading icon={ClipboardList} title="Ultime vendite" detail="Transazioni più recenti" action={<button className="text-button" onClick={onOpenSales}>{language === 'ar' ? 'كل المبيعات ←' : 'Tutte le vendite →'}</button>} /><SalesTable sales={recentSales} onSelect={onSelectSale} /></section>
  </div>;
}
