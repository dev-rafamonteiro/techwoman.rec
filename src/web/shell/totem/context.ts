import { createContext, useContext } from 'react';

/** Totem do evento (monitor touch sem teclado físico): jornada → resultado → inscrição → confirmação sob esta base. */
export const TOTEM_BASE = '/jornada_totem';

export interface Totem {
  /** Abre o painel escondido (toque no logotipo). */
  openPanel: () => void;
  /** Limpa os dados da pessoa e volta ao início da jornada, pronta para a próxima. */
  restart: () => void;
}

export const TotemContext = createContext<Totem | null>(null);

/** null fora do totem. */
export function useTotem(): Totem | null {
  return useContext(TotemContext);
}

export interface FlowPaths {
  home: string;
  jornada: string;
  resultado: string;
  inscricao: string;
  ok: string;
}

const SITE: FlowPaths = { home: '/', jornada: '/jornada', resultado: '/jornada/resultado', inscricao: '/mentoria/inscricao', ok: '/mentoria/inscricao/ok' };
const TOTEM: FlowPaths = { home: TOTEM_BASE, jornada: TOTEM_BASE, resultado: `${TOTEM_BASE}/resultado`, inscricao: `${TOTEM_BASE}/inscricao`, ok: `${TOTEM_BASE}/ok` };

/** Caminhos de P2–P5: no totem o fluxo inteiro fica sob TOTEM_BASE (sem saída para P1 ou P6). */
export function useFlowPaths(): FlowPaths {
  return useTotem() ? TOTEM : SITE;
}
