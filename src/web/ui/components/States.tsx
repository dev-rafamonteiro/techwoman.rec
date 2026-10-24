import type { CSSProperties, ReactNode } from 'react';
import { ApiError } from '../../net/client';
import { Button, LinkButton } from './Button';

/** Esqueleto de carregamento. */
export function Skeleton({ height = 16, width = '100%', style }: { height?: number | string; width?: number | string; style?: CSSProperties }) {
  return <span className="tw-skeleton" aria-hidden="true" style={{ height, width, ...style }} />;
}

/** Lista de cartões em esqueleto (M4, M6, A2…). Anuncia "Carregando" para leitores de tela. */
export function SkeletonList({ rows = 4, height = 110 }: { rows?: number; height?: number }) {
  return (
    <div className="tw-stack" role="status" aria-label="Carregando">
      <span className="tw-sr-only">Carregando…</span>
      {Array.from({ length: rows }, (_, i) => <Skeleton key={i} height={height} style={{ borderRadius: 20 }} />)}
    </div>
  );
}

/** Vazio: texto + próxima ação. */
export function EmptyState({ title, text, action }: { title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="tw-state" role="status">
      <span className="tw-state__icon" aria-hidden="true">∅</span>
      <h2 className="tw-state__title">{title}</h2>
      {text && <p className="tw-state__text">{text}</p>}
      {action}
    </div>
  );
}

/** Erro: mensagem + tentar de novo. Se for sem rede ou 5xx usa texto padrão. */
export function ErrorState({ error, onRetry, title = 'Não foi possível carregar' }: { error?: unknown; onRetry?: () => void; title?: string }) {
  // 403 vira o estado obrigatório "sem permissão"; 401 já é tratado globalmente (volta para M1 com a rota de retorno).
  if (error instanceof ApiError && (error.code === 'FORBIDDEN' || error.status === 403)) return <NoPermission />;
  const msg = error instanceof ApiError ? error.message : 'Algo deu errado. Tente de novo.';
  return (
    <div className="tw-state" role="alert">
      <span className="tw-state__icon" aria-hidden="true">!</span>
      <h2 className="tw-state__title">{title}</h2>
      <p className="tw-state__text">{msg}</p>
      {onRetry && <Button onClick={onRetry}>Tentar de novo</Button>}
    </div>
  );
}

/** Sem permissão. */
export function NoPermission({ homePath }: { homePath?: string }) {
  return (
    <div className="tw-state" role="alert">
      <span className="tw-state__icon" aria-hidden="true">⛔</span>
      <h2 className="tw-state__title">Você não tem acesso a esta área</h2>
      <p className="tw-state__text">Se acha que deveria ter, procure a organização no balcão de apoio.</p>
      {homePath && <LinkButton to={homePath} variant="secondary">Voltar ao início</LinkButton>}
    </div>
  );
}

/** Link inválido / não encontrada (P6 "Não encontramos sua inscrição" usa texto próprio). */
export function NotFoundState() {
  return (
    <div className="tw-state">
      <span className="tw-state__icon" aria-hidden="true">?</span>
      <h2 className="tw-state__title">Página não encontrada</h2>
      <LinkButton to="/" variant="secondary">Ir para o início</LinkButton>
    </div>
  );
}
