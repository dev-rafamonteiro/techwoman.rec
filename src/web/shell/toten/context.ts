import { createContext, useContext } from 'react';

/** Toten do evento (monitor touch sem teclado físico): jornada → resultado → inscrição → confirmação sob esta base. */
export const TOTEN_BASE = '/jornada_toten';

export interface Toten {
  /** Abre o painel escondido (toque no logotipo). */
  openPanel: () => void;
  /** Limpa os dados da pessoa e volta ao início da jornada, pronta para a próxima. */
  restart: () => void;
}

export const TotenContext = createContext<Toten | null>(null);

/** null fora do toten. */
export function useToten(): Toten | null {
  return useContext(TotenContext);
}

export interface FlowPaths {
  home: string;
  jornada: string;
  resultado: string;
  inscricao: string;
  ok: string;
}

const SITE: FlowPaths = { home: '/', jornada: '/jornada', resultado: '/jornada/resultado', inscricao: '/mentoria/inscricao', ok: '/mentoria/inscricao/ok' };
const TOTEN: FlowPaths = { home: TOTEN_BASE, jornada: TOTEN_BASE, resultado: `${TOTEN_BASE}/resultado`, inscricao: `${TOTEN_BASE}/inscricao`, ok: `${TOTEN_BASE}/ok` };

/** Caminhos de P2–P5: no toten o fluxo inteiro fica sob TOTEN_BASE (sem saída para P1 ou P6). */
export function useFlowPaths(): FlowPaths {
  return useToten() ? TOTEN : SITE;
}
