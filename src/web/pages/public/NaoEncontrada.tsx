import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Brand, HeroMosaic, LinkButton } from '../../ui';
import { TOTEN_BASE } from '../../shell/toten/context';
import './public.css';

/** Depois desse tempo, a página leva para o início sozinha. */
const REDIRECT_S = 5;

/** Rota inexistente (qualquer endereço sem tela): aviso com o visual do site e volta ao início em 5 s. */
export default function NaoEncontrada() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  // no toten, o "início" é o começo da jornada dele (sair para a home deixaria o totem preso no site)
  const home = pathname.startsWith(TOTEN_BASE) ? TOTEN_BASE : '/';
  const [left, setLeft] = useState(REDIRECT_S);

  useEffect(() => {
    const t = setInterval(() => setLeft((n) => n - 1), 1000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (left <= 0) navigate(home, { replace: true });
  }, [left, home, navigate]);

  return (
    <div className="tw-pub tw-404" data-testid="not-found">
      <header className="tw-pub__head">
        <Brand height={44} />
      </header>
      <main className="tw-404__body">
        <div className="tw-404__copy">
          <p className="tw-404__code" aria-hidden="true">404</p>
          <h1>Página não encontrada.</h1>
          <p>O endereço pode estar incompleto ou a página saiu do ar.</p>
          <p aria-live="polite" data-testid="not-found-countdown">
            Levando você para o início em <strong>{Math.max(left, 0)} {left === 1 ? 'segundo' : 'segundos'}</strong>…
          </p>
          <div><LinkButton to={home} replace size="lg" data-testid="not-found-home">Ir para o início agora</LinkButton></div>
        </div>
        <div className="tw-404__art" aria-hidden="true"><HeroMosaic /></div>
      </main>
    </div>
  );
}
