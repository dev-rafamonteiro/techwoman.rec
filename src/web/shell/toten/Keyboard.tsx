import { useState, type ReactNode } from 'react';
import { HeroMosaic } from '../../ui/assets/Art';

export type TextTarget = HTMLInputElement | HTMLTextAreaElement;

const TEXT_TYPES = new Set(['text', 'email', 'tel', 'search', 'url', 'password', 'number']);

export function isTextField(el: unknown): el is TextTarget {
  if (el instanceof HTMLTextAreaElement) return !el.readOnly && !el.disabled;
  return el instanceof HTMLInputElement && TEXT_TYPES.has(el.type) && !el.readOnly && !el.disabled;
}

/** email e tel não expõem o cursor (selectionStart = null): nesses, digita no fim. */
function caret(el: TextTarget): [number, number] {
  try {
    if (el.selectionStart != null && el.selectionEnd != null) return [el.selectionStart, el.selectionEnd];
  } catch {
    /* tipo sem seleção */
  }
  return [el.value.length, el.value.length];
}

/**
 * Campos são controlados pelo React: atribuir `el.value` não chega ao estado. Usa o setter nativo e dispara `input`,
 * assim o onChange da página roda igual a uma digitação (máscara do celular, validação, aviso de já inscrita).
 */
function write(el: TextTarget, value: string, pos: number) {
  if (el.maxLength > 0 && value.length > el.maxLength) return;
  Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')!.set!.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  try {
    el.setSelectionRange(pos, pos);
  } catch {
    /* tipo sem seleção */
  }
}

function type(el: TextTarget, text: string) {
  const [s, e] = caret(el);
  write(el, el.value.slice(0, s) + text + el.value.slice(e), s + text.length);
}

function backspace(el: TextTarget) {
  const [s, e] = caret(el);
  if (s !== e) write(el, el.value.slice(0, s) + el.value.slice(e), s);
  else if (s > 0) write(el, el.value.slice(0, s - 1) + el.value.slice(s), s - 1);
}

const DIGITS = '1234567890'.split('');
const ACCENTS = 'áàâãéêíóôõúç'.split('');
const LETTERS = ['qwertyuiop', 'asdfghjklç', 'zxcvbnm'].map((r) => r.split(''));

type Kind = 'char' | 'mod' | 'ok';

/** Teclado na tela do toten: letras, números, acentos e os símbolos de e-mail/LinkedIn (@ . _ -). Celular abre o numérico. */
export function Keyboard({ target, onDone }: { target: TextTarget; onDone: () => void }) {
  const [shift, setShift] = useState(false);
  const [accents, setAccents] = useState(false);
  const [, rerender] = useState(0);
  // nome: maiúscula automática no começo de cada palavra
  const autoCap = target.autocomplete === 'name' && (target.value === '' || target.value.endsWith(' '));
  const upper = shift || autoCap;

  const press = (fn: (el: TextTarget) => void) => {
    if (document.activeElement !== target) target.focus({ preventScroll: true });
    fn(target);
    rerender((n) => n + 1);
  };
  const char = (c: string) => press((el) => {
    type(el, upper ? c.toUpperCase() : c);
    setShift(false);
  });

  const key = (label: ReactNode, onPress: () => void, opts: { kind?: Kind; wide?: number; aria?: string; on?: boolean } = {}) => (
    <button
      key={opts.aria ?? String(label)}
      type="button"
      tabIndex={-1}
      className={`tw-kb__key tw-kb__key--${opts.kind ?? 'char'}${opts.on ? ' is-on' : ''}`}
      style={opts.wide ? { flexGrow: opts.wide } : undefined}
      aria-label={opts.aria}
      aria-pressed={opts.on}
      // sem isso o campo perde o foco a cada tecla (onBlur da página marca o campo e mostra erro no meio da digitação)
      onPointerDown={(e) => e.preventDefault()}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onPress}
    >
      {label}
    </button>
  );

  const bksp = key('⌫', () => press(backspace), { kind: 'mod', wide: 1.5, aria: 'Apagar' });
  const done = key('Pronto', onDone, { kind: 'ok', wide: 2 });
  const numeric = target instanceof HTMLInputElement && target.type === 'tel';

  return (
    <div className="tw-kb" role="group" aria-label="Teclado">
      <div className="tw-kb__art" aria-hidden="true"><HeroMosaic strip /></div>
      {numeric ? (
        <div className="tw-kb__pad">
          {[DIGITS.slice(0, 3), DIGITS.slice(3, 6), DIGITS.slice(6, 9)].map((r, i) => <div className="tw-kb__row" key={i}>{r.map((c) => key(c, () => char(c)))}</div>)}
          <div className="tw-kb__row">{bksp}{key('0', () => char('0'))}{done}</div>
        </div>
      ) : (
        <div className="tw-kb__keys">
          <div className="tw-kb__row">{(accents ? ACCENTS : DIGITS).map((c) => key(upper ? c.toUpperCase() : c, () => char(c)))}</div>
          <div className="tw-kb__row">{LETTERS[0]!.map((c) => key(upper ? c.toUpperCase() : c, () => char(c)))}</div>
          <div className="tw-kb__row">{LETTERS[1]!.map((c) => key(upper ? c.toUpperCase() : c, () => char(c)))}</div>
          <div className="tw-kb__row">
            {key('⇧', () => setShift((s) => !s), { kind: 'mod', wide: 1.5, aria: 'Maiúscula', on: upper })}
            {LETTERS[2]!.map((c) => key(upper ? c.toUpperCase() : c, () => char(c)))}
            {key('-', () => char('-'))}
            {key('_', () => char('_'))}
            {bksp}
          </div>
          <div className="tw-kb__row">
            {key(accents ? '123' : 'áç', () => setAccents((a) => !a), { kind: 'mod', wide: 1.5, aria: accents ? 'Números' : 'Acentos' })}
            {key('@', () => char('@'))}
            {key('.', () => char('.'))}
            {key('espaço', () => char(' '), { wide: 4, aria: 'Espaço' })}
            {key('.com', () => press((el) => type(el, '.com')), { wide: 1.5 })}
            {key('.br', () => press((el) => type(el, '.br')), { wide: 1.5 })}
            {done}
          </div>
        </div>
      )}
    </div>
  );
}
