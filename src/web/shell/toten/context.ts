import { createContext, useContext } from 'react';

/** Toten do evento (monitor touch sem teclado físico): jornada → resultado → inscrição → confirmação sob esta base. */
export const TOTEN_BASE = '/jornada_toten';
/** Variante do toten que, parado, passa um vídeo por cima da jornada. */
export const TOTEN_VIDEO_BASE = '/jornada_toten_video';

/** Base do toten em que o endereço está (ou null fora dele). */
export function totenBaseOf(pathname: string): string | null {
  return [TOTEN_VIDEO_BASE, TOTEN_BASE].find((b) => pathname === b || pathname.startsWith(`${b}/`)) ?? null;
}

export interface Toten {
  /** Endereço do início da jornada neste toten (TOTEN_BASE ou TOTEN_VIDEO_BASE). */
  base: string;
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
const toten = (b: string): FlowPaths => ({ home: b, jornada: b, resultado: `${b}/resultado`, inscricao: `${b}/inscricao`, ok: `${b}/ok` });

/** Caminhos de P2–P5: no toten o fluxo inteiro fica sob a base dele (sem saída para P1 ou P6). */
export function useFlowPaths(): FlowPaths {
  const t = useToten();
  return t ? toten(t.base) : SITE;
}
