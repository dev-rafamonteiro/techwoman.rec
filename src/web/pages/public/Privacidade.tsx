import { Card, Hero } from '../../ui';

/** /privacidade · texto da LGPD e controladora ainda em definição (pendência do Felipe). Medição de uso: UI-SPEC > Medição de uso. */
export default function Privacidade() {
  return (
    <div className="tw-page tw-stack" data-testid="privacidade">
      <Hero title="Aviso de privacidade" />
      <Card><p>Aviso de privacidade em definição</p></Card>
      <Card>
        <h2 style={{ marginTop: 0 }} data-testid="privacidade-analytics">Medição de uso</h2>
        <p style={{ marginBottom: 0 }}>
          Para entender como o site é usado, contamos visitas e ações nas páginas públicas de forma anônima, com uma
          ferramenta de medição própria (Umami) hospedada por nós. Não usamos cookies, não guardamos nome, e-mail,
          telefone nem o seu link pessoal, e não acompanhamos você em outros sites. Se o seu navegador pede para não ser
          rastreado (Do Not Track), nada é medido.
        </p>
      </Card>
    </div>
  );
}
