import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { HOME_SEO, PAGES_SEO } from '../seo';

const PRIVATE = /^\/(admin|mentora|entrar)(\/|$)/;

/**
 * Título e descrição da página pública ao navegar na SPA (src/web/seo.ts). Fora do mapa volta ao da home;
 * admin, mentora e login ficam de fora: o admin define o próprio título (useTitle), e o efeito do filho roda antes deste.
 */
export function PageMeta() {
  const { pathname } = useLocation();
  useEffect(() => {
    if (PRIVATE.test(pathname)) return;
    const seo = PAGES_SEO[pathname.replace(/(.)\/+$/, '$1')] ?? HOME_SEO;
    document.title = seo.title;
    document.querySelector<HTMLMetaElement>('meta[name="description"]')?.setAttribute('content', seo.description);
  }, [pathname]);
  return null;
}
