import { ClipboardList, Plus } from 'lucide-react';
import type { Employee } from '../shared/types';
import { usePageServices } from './page-services';

type EmployeeListPageProps = {
  employees: Employee[];
  totalEmployees: number;
  search: string;
  onSearch: (value: string) => void;
  onAdd: () => void;
  onOpen: (employee: Employee) => void;
};

export function EmployeeListPage({ employees, totalEmployees, search, onSearch, onAdd, onOpen }: EmployeeListPageProps) {
  const { SearchInput, Empty } = usePageServices();
  return <div className="page-content employee-page">
    <div className="page-toolbar employee-toolbar"><SearchInput value={search} onChange={onSearch} placeholder="Cerca dipendente, ruolo o sede…" /><div className="toolbar-actions"><button className="button button-primary" onClick={onAdd}><Plus size={16} /> Aggiungi dipendente</button></div></div>
    <section className="employee-list-panel"><div className="employee-card-grid">{employees.map((employee) => <button className="employee-card" key={employee.id} onClick={() => onOpen(employee)} aria-label={`Apri informazioni di ${employee.first_name} ${employee.last_name}`}><img className="employee-list-photo" src={employee.photo_data} alt={`Foto di ${employee.first_name} ${employee.last_name}`} /><span><small>Nome</small><strong>{employee.first_name}</strong></span><span><small>Cognome</small><strong>{employee.last_name}</strong></span><span><small>Ruolo</small><strong>{employee.role}</strong></span><span><small>Sede</small><strong>{employee.operational_site}</strong></span></button>)}{!employees.length && <Empty icon={ClipboardList} title={totalEmployees ? 'Nessun dipendente corrisponde alla ricerca.' : 'Nessun dipendente registrato.'} detail="" />}</div></section>
  </div>;
}
