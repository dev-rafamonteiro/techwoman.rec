import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';

interface FieldShell {
  label: string;
  optional?: boolean;
  hint?: ReactNode;
  error?: string;
  ok?: string;
}

function Shell({ id, label, optional, hint, error, ok, children }: FieldShell & { id: string; children: ReactNode }) {
  return (
    <div className="tw-field">
      <label className="tw-field__label" htmlFor={id}>
        {label} {optional && <span className="tw-field__opt">(opcional)</span>}
      </label>
      {children}
      {error ? (
        <span id={`${id}-msg`} className="tw-field__error" role="alert"><span aria-hidden="true">⚠ </span>{error}</span>
      ) : ok ? (
        <span id={`${id}-msg`} className="tw-field__ok"><span aria-hidden="true">✓ </span>{ok}</span>
      ) : hint ? (
        <span id={`${id}-msg`} className="tw-field__hint">{hint}</span>
      ) : null}
    </div>
  );
}

const describedBy = (id: string, f: FieldShell) => (f.error || f.ok || f.hint ? `${id}-msg` : undefined);

/** Campo de texto com rótulo, dica e erro por campo (validação em tempo real feita pela tela). */
export function TextField({ label, optional, hint, error, ok, ...rest }: FieldShell & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  return (
    <Shell id={id} label={label} optional={optional} hint={hint} error={error} ok={ok}>
      <input {...rest} id={id} className="tw-input" aria-invalid={error ? true : undefined} data-ok={ok && !error ? true : undefined} aria-describedby={describedBy(id, { label, hint, error, ok })} />
    </Shell>
  );
}

export function TextArea({ label, optional, hint, error, ok, ...rest }: FieldShell & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const id = useId();
  return (
    <Shell id={id} label={label} optional={optional} hint={hint} error={error} ok={ok}>
      <textarea {...rest} id={id} className="tw-textarea" aria-invalid={error ? true : undefined} data-ok={ok && !error ? true : undefined} aria-describedby={describedBy(id, { label, hint, error, ok })} />
    </Shell>
  );
}

export function SelectField({ label, optional, hint, error, ok, children, ...rest }: FieldShell & SelectHTMLAttributes<HTMLSelectElement>) {
  const id = useId();
  return (
    <Shell id={id} label={label} optional={optional} hint={hint} error={error} ok={ok}>
      <select {...rest} id={id} className="tw-select" aria-invalid={error ? true : undefined} data-ok={ok && !error ? true : undefined} aria-describedby={describedBy(id, { label, hint, error, ok })}>
        {children}
      </select>
    </Shell>
  );
}

export function CheckboxField({ label, error, ...rest }: { label: ReactNode; error?: string } & Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>) {
  const id = useId();
  return (
    <div className="tw-field">
      <label className="tw-check" htmlFor={id}>
        <input {...rest} id={id} type="checkbox" aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-msg` : undefined} />
        <span>{label}</span>
      </label>
      {error && <span id={`${id}-msg`} className="tw-field__error" role="alert">{error}</span>}
    </div>
  );
}

export interface RadioOption<V extends string> {
  value: V;
  label: string;
}

/** Opções em cartões 2x2 (período preferido em P4/P6). */
export function RadioCards<V extends string>({ legend, name, options, value, onChange, error, hint }: {
  legend: string;
  name: string;
  options: readonly RadioOption<V>[];
  value: V | null;
  onChange: (v: V) => void;
  error?: string;
  hint?: ReactNode;
}) {
  const id = useId();
  return (
    <fieldset className="tw-field" style={{ border: 0, padding: 0, margin: 0 }} aria-describedby={error || hint ? `${id}-msg` : undefined}>
      <legend className="tw-field__label" style={{ padding: 0, marginBottom: 8 }}>{legend}</legend>
      <div className="tw-radio-grid" role="radiogroup" aria-label={legend}>
        {options.map((o) => (
          <label key={o.value} className="tw-radio-card">
            <input type="radio" name={name} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} />
            {o.label}
          </label>
        ))}
      </div>
      {error ? <span id={`${id}-msg`} className="tw-field__error" role="alert">{error}</span> : hint ? <span id={`${id}-msg`} className="tw-field__hint">{hint}</span> : null}
    </fieldset>
  );
}
