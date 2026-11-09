import { describe, expect, it } from 'vitest';
import { DEFAULT_AREAS } from '../../src/db/event.js';
import { canonicalSpecialty, KNOWLEDGE_TRACKS, SPECIALTIES_BY_TRACK, trackKeysForSpecialties } from '../../src/shared/trilhas.js';

describe('trilhas de conhecimento', () => {
  it('define as oito trilhas e descrições acessíveis', () => {
    expect(KNOWLEDGE_TRACKS.map(({ label }) => label)).toEqual([
      'Desenvolvimento',
      'Qualidade',
      'Inteligência Artificial',
      'Dados',
      'Infraestrutura',
      'Gestão e Liderança',
      'Produtos e Negócios',
      'Carreira em TI',
    ]);
    expect(KNOWLEDGE_TRACKS.every(({ description }) => description.length > 40)).toBe(true);
  });

  it.each(KNOWLEDGE_TRACKS)('classifica os temas comerciais de $label', (track) => {
    expect(trackKeysForSpecialties(track.specialties)).toEqual([track.key]);
  });

  it('oferece as opções agrupadas por trilha e em ordem alfabética', () => {
    expect(SPECIALTIES_BY_TRACK.map((track) => track.key)).toEqual(KNOWLEDGE_TRACKS.map((track) => track.key));
    for (const track of SPECIALTIES_BY_TRACK) {
      expect(track.specialties).toEqual([...track.specialties].sort((a, b) => a.localeCompare(b, 'pt-BR')));
    }
    expect(SPECIALTIES_BY_TRACK.find((track) => track.key === 'gestao-e-agilidade')?.specialties).not.toContain('Agilidade');
  });

  it('padroniza as opções de Desenvolvimento', () => {
    expect(KNOWLEDGE_TRACKS[0].specialties).toEqual([
      'Desenvolvimento Back-end',
      'Desenvolvimento Front-end / UX',
      'Desenvolvimento Full Stack',
      'Desenvolvimento SAP',
      'Desenvolvimento ServiceNow',
    ]);
  });

  it('normaliza acentos e caixa, aceita grafias antigas e remove trilhas duplicadas', () => {
    expect(trackKeysForSpecialties([
      '  CIÊNCIA   DE DADOS ',
      'Desendolvimento Front-end',
      'Desendolvimento Back-end',
    ])).toEqual(['dados', 'desenvolvimento']);
  });

  it('apresenta grafias corrigidas nos temas conhecidos e preserva temas personalizados', () => {
    expect(canonicalSpecialty('Desendolvimento Front-end')).toBe('Desenvolvimento Front-end / UX');
    expect(canonicalSpecialty('desendolvimento back-end')).toBe('Desenvolvimento Back-end');
    expect(canonicalSpecialty('Inicio de Profissão')).toBe('Início de Profissão');
    expect(canonicalSpecialty(' Tema personalizado ')).toBe('Tema personalizado');
  });

  it('converte os nomes anteriores de Desenvolvimento para as opções padronizadas', () => {
    expect(canonicalSpecialty('Desenvolvimento')).toBe('Desenvolvimento Full Stack');
    expect(canonicalSpecialty('Desenvolvimento de Software')).toBe('Desenvolvimento Full Stack');
    expect(canonicalSpecialty('Desenvolvimento Backend Java')).toBe('Desenvolvimento Back-end');
    expect(canonicalSpecialty('UX')).toBe('Desenvolvimento Front-end / UX');
    expect(trackKeysForSpecialties(['Desenvolvimento Front-end / UX'])).toEqual(['desenvolvimento']);
  });

  it('classifica uma mentora em mais de uma trilha e ignora temas não mapeados', () => {
    expect(trackKeysForSpecialties(['Quality Assurance', 'Produtos digitais', 'Tema não cadastrado'])).toEqual([
      'qualidade',
      'produtos-e-negocios',
    ]);
  });

  it('retorna lista vazia quando não há tema correspondente', () => {
    expect(trackKeysForSpecialties(['Tema sem trilha'])).toEqual([]);
  });
});

describe('trilhas e áreas do evento', () => {
  it('cada trilha é uma área padrão do evento, com a mesma chave', () => {
    expect(DEFAULT_AREAS.map(({ key }) => key)).toEqual(KNOWLEDGE_TRACKS.map(({ key }) => key));
  });

  it.each([
    ['Agilidade', 'Metodologia ágil', 'gestao-e-agilidade'],
    ['Engenharia Backend', 'Desenvolvimento Back-end', 'desenvolvimento'],
    ['Início de carreira', 'Início de Profissão', 'carreira-em-ti'],
    ['Transição de carreira técnica para gestão e liderança em TI', 'Transição de carreira técnica para gestão liderança TI', 'gestao-e-agilidade'],
  ])('tema já cadastrado "%s" entra no catálogo', (theme, canonical, track) => {
    expect(canonicalSpecialty(theme)).toBe(canonical);
    expect(trackKeysForSpecialties([theme])).toEqual([track]);
  });
});
