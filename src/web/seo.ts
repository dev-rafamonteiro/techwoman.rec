/**
 * Título e descrição por página pública (Google e prévia de link). Usado em dois lugares:
 * - build (vite.config.ts): gera dist/<rota>.html com essas tags, servido pelo nginx (try_files $uri.html);
 * - app (PageMeta): atualiza título e descrição ao navegar dentro da SPA.
 * Rotas novas aqui também entram em public/sitemap.xml.
 */
export const SITE_URL = 'https://techwoman.dev';

export type PageSeo = { title: string; description: string };

export const HOME_SEO: PageSeo = {
  title: 'Tech Woman · Mentoria para mulheres em tecnologia',
  description:
    'Tech Woman é um movimento para ampliar a presença feminina na tecnologia e na inovação. Descubra sua área e ganhe uma mentoria individual com mulheres que já trilharam o caminho.',
};

export const PAGES_SEO: Record<string, PageSeo> = {
  '/': HOME_SEO,
  '/jornada': {
    title: 'Jornada: descubra sua área na tecnologia · Tech Woman',
    description:
      'Responda algumas perguntas e encare desafios rápidos para descobrir sua aptidão na tecnologia. No final, inscreva-se na mentoria da sua área.',
  },
  '/mentoras': {
    title: 'Mentoras · Tech Woman',
    description:
      'Conheça as mentoras do Tech Woman: mulheres que já trilharam o caminho na tecnologia e estão prontas para conversar com você em uma mentoria individual.',
  },
  '/mentoria/inscricao': {
    title: 'Inscrição na mentoria · Tech Woman',
    description:
      'Inscreva-se na mentoria do Tech Woman: escolha a área, o horário e a mentora entre as vagas disponíveis. A confirmação chega por e-mail.',
  },
  '/privacidade': {
    title: 'Privacidade · Tech Woman',
    description: 'Como o Tech Woman trata os dados de quem se inscreve na mentoria.',
  },
};
