import { ArrowDownToLine } from 'lucide-react';
import { useState } from 'react';
import type { Employee } from '../shared/types';
import { usePageServices } from './page-services';

const activityPageSize = 100;

type ActivityEntry = {
  id: number;
  created_at: string;
  employee_name: string;
  action: string;
  section: string;
  detail: string;
};

type EmployeeTrackerPageProps = {
  employees: Employee[];
  entries: ActivityEntry[];
  period: string;
  onPeriodChange: (value: string) => void;
  from: string;
  onFromChange: (value: string) => void;
  to: string;
  onToChange: (value: string) => void;
  employeeId: string;
  onEmployeeChange: (value: string) => void;
  onExport: () => void;
};

export function EmployeeTrackerPage({
  employees, entries, period, onPeriodChange, from, onFromChange, to, onToChange,
  employeeId, onEmployeeChange, onExport,
}: EmployeeTrackerPageProps) {
  const { FilterSelectField, Field, Table, dateTimeText, text } = usePageServices();
  const filterKey = JSON.stringify([period, from, to, employeeId]);
  const [pagination, setPagination] = useState({ filterKey, visibleCount: activityPageSize });
  const visibleCount = pagination.filterKey === filterKey ? pagination.visibleCount : activityPageSize;
  const visibleEntries = entries.slice(0, visibleCount);
  const showMore = () => setPagination((current) => ({
    filterKey,
    visibleCount: (current.filterKey === filterKey ? current.visibleCount : activityPageSize) + activityPageSize,
  }));
  return <div className="page-content"><div id="employee-tracker-print">
    <div className="inventory-history-actions no-print">
      <FilterSelectField label="Periodo" value={period} onChange={onPeriodChange} options={['Tutti', 'Oggi', 'Ieri', 'Ultima settimana', 'Ultimo mese', 'Da - A']} />
      {period === 'Da - A' && <><Field label="Da" type="date" value={from} onChange={(event) => onFromChange(event.target.value)} /><Field label="A" type="date" value={to} onChange={(event) => onToChange(event.target.value)} /></>}
      <FilterSelectField label="Dipendente" value={employeeId} onChange={onEmployeeChange} options={['Tutti', ...employees.map((employee) => String(employee.id))]} labels={['Tutti', ...employees.map((employee) => `${employee.first_name} ${employee.last_name}`)]} preserveLabels />
      <button className="button button-outline" onClick={onExport}><ArrowDownToLine size={16} /> Scarica lista in PDF</button>
    </div>
    <Table headings={['Data e ora', 'Dipendente', 'Attività', 'Sezione', 'Dettagli']}>
      <>{visibleEntries.map((entry) => <tr key={entry.id}><td>{dateTimeText(new Date(entry.created_at))}</td><td className="cell-primary">{entry.employee_name}</td><td>{text(entry.action)}</td><td>{text(entry.section)}</td><td>{text(entry.detail || '—')}</td></tr>)}</>
      {!entries.length && <tr><td colSpan={5} className="empty-cell">Nessuna attività registrata per i filtri selezionati.</td></tr>}
    </Table>
    {visibleCount < entries.length && <div className="tracker-load-more"><button className="button button-outline" type="button" onClick={showMore}>Mostra altre attività</button></div>}
  </div></div>;
}
