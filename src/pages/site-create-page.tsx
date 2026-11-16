import { ArrowLeft, Check, ChevronDown } from 'lucide-react';
import type { FormEvent } from 'react';
import type { Employee, SiteInput } from '../shared/types';
import { OpeningHoursPicker } from './site-components';
import { usePageServices } from './page-services';

type SiteCreatePageProps = {
  draft: SiteInput;
  managers: Employee[];
  roles: string[];
  workingDays: string[];
  showCustomRole: boolean;
  customRole: string;
  onDraftChange: (draft: SiteInput) => void;
  onRoleChange: (role: string) => void;
  onCustomRoleChange: (role: string) => void;
  onAddCustomRole: () => void;
  onBack: () => void;
  onCancel: () => void;
  onSave: (event: FormEvent<HTMLFormElement>) => void;
};

export function SiteCreatePage({
  draft, managers, roles, workingDays, showCustomRole, customRole, onDraftChange, onRoleChange,
  onCustomRoleChange, onAddCustomRole, onBack, onCancel, onSave,
}: SiteCreatePageProps) {
  const { Field } = usePageServices();
  return <div className="page-content settings-page">
    <section className="settings-panel">
      <button className="settings-back" onClick={onBack}><ArrowLeft size={15} /> Lista sedi</button>
      {draft.id && <div className="settings-title"><h2>Modifica sede</h2><p>Inserisci i riferimenti e le informazioni operative del punto vendita.</p></div>}
      <form className="settings-form site-form" onSubmit={(event) => onSave(event)}>
        <Field label="Nome sede" value={draft.name} onChange={(event) => onDraftChange({ ...draft, name: event.target.value })} required />
        <label className="field"><span>Ruolo sede</span><select value={draft.site_role ?? 'Punto vendita'} onChange={(event) => onRoleChange(event.target.value)} required><option value="">Seleziona tipo sede</option>{roles.map((role) => <option key={role}>{role}</option>)}<option value="__other__">Nuovo ruolo</option></select></label>
        {showCustomRole && <div className="custom-role-field"><Field label="Nuovo ruolo" value={customRole} onChange={(event) => onCustomRoleChange(event.target.value)} /><button className="button button-outline" type="button" disabled={!customRole.trim()} onClick={onAddCustomRole}>Aggiungi alla lista</button></div>}
        <Field label="Indirizzo" value={draft.address} onChange={(event) => onDraftChange({ ...draft, address: event.target.value })} />
        <Field label="Telefono" type="tel" value={draft.phone} onChange={(event) => onDraftChange({ ...draft, phone: event.target.value })} />
        <Field label="Email sede" type="email" value={draft.email ?? ''} onChange={(event) => onDraftChange({ ...draft, email: event.target.value })} />
        <label className="field"><span>Responsabile sede</span><select value={draft.manager_name ?? ''} onChange={(event) => onDraftChange({ ...draft, manager_name: event.target.value })}><option value="">Seleziona responsabile</option>{managers.map((employee) => { const name = `${employee.first_name} ${employee.last_name}`; return <option key={employee.id} value={name}>{name}</option>; })}</select></label>
        <div className="field">
          <span>Giorni lavorativi</span>
          <details className="working-days-picker">
            <summary className="select-wrap"><span>{draft.working_days || 'Seleziona i giorni lavorativi'}</span><ChevronDown size={14} /></summary>
            <div className="working-days-options" role="group" aria-label="Seleziona i giorni lavorativi">
              {workingDays.map((day) => {
                const selectedDays = new Set((draft.working_days ?? '').split(',').map((value) => value.trim()).filter(Boolean));
                return <label key={day}><input type="checkbox" checked={selectedDays.has(day)} onChange={(event) => {
                  const nextDays = new Set(selectedDays);
                  if (event.currentTarget.checked) nextDays.add(day);
                  else nextDays.delete(day);
                  onDraftChange({ ...draft, working_days: workingDays.filter((option) => nextDays.has(option)).join(', ') });
                }} />{day}</label>;
              })}
            </div>
          </details>
        </div>
        <OpeningHoursPicker value={draft.opening_hours ?? ''} onChange={(opening_hours) => onDraftChange({ ...draft, opening_hours })} />
        <label className="field site-notes-field"><span>Note</span><textarea rows={3} maxLength={1000} value={draft.notes ?? ''} onChange={(event) => onDraftChange({ ...draft, notes: event.target.value })} /></label>
        <div className="form-actions"><button className="button button-quiet" type="button" onClick={onCancel}>Annulla</button><button className="button button-primary"><Check size={16} /> Salva sede</button></div>
      </form>
    </section>
  </div>;
}
