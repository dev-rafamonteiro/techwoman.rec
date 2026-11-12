import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Button, CheckboxField, Overlay, RadioCards } from '../../ui';
import { clearJourney } from '../../pages/public/lib/journey';
import { saveAnswers } from '../../pages/public/lib/journeyData';
import { TOTEN_BASE, TotenContext, type Toten } from './context';
import { Keyboard, isTextField, type TextTarget } from './Keyboard';
import './toten.css';

type Res = 'landscape' | 'portrait' | 'fill';
interface Settings { keyboard: boolean; res: Res; zoom: string }

const DEFAULTS: Settings = { keyboard: true, res: 'landscape', zoom: '1' };
const SIZES: Record<Exclude<Res, 'fill'>, [number, number]> = { landscape: [1920, 1080], portrait: [1080, 1920] };
const SETTINGS_KEY = 'tw:toten';
/** Sem toque nesse prazo, os dados da pessoa saem da tela e a jornada volta ao início. */
const IDLE_MS = 120_000;
/** Com `video`: sem toque nesse prazo, o vídeo cobre a tela (a jornada fica como estava, por baixo). */
const VIDEO_IDLE_MS = 5_000;

/** Configuração do aparelho (não da pessoa): localStorage, para sobreviver a recarregar a página. */
function loadSettings(): Settings {
  try {
    return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') as Partial<Settings>) };
  } catch {
    return DEFAULTS;
  }
}

function useViewport(): [number, number] {
  const [v, setV] = useState<[number, number]>([window.innerWidth, window.innerHeight]);
  useEffect(() => {
    const on = () => setV([window.innerWidth, window.innerHeight]);
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return v;
}

/**
 * Toten (/jornada_toten): a mesma jornada P2 → P3 → P4 → P5 num palco de 1920×1080 ou 1080×1920 escalado para caber
 * na tela, com teclado próprio (o monitor não tem teclado físico). Toque no logotipo abre o painel de configuração.
 * `video` (/jornada_toten_video): parado por VIDEO_IDLE_MS, o vídeo cobre a tela; um toque o tira. Na resolução
 * vertical (1080×1920) passa `videoPortrait`, se houver; nas outras, `video`.
 */
export default function TotenLayout({ base = TOTEN_BASE, video, videoPortrait }: { base?: string; video?: string; videoPortrait?: string }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [settings, setSettings] = useState(loadSettings);
  const [panel, setPanel] = useState(false);
  const [target, setTarget] = useState<TextTarget | null>(null);
  const [vw, vh] = useViewport();

  const update = (patch: Partial<Settings>) => setSettings((s) => {
    const next = { ...s, ...patch };
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
    } catch {
      /* armazenamento indisponível: vale até recarregar */
    }
    return next;
  });

  const dirty = useRef(false);
  const restart = useCallback(() => {
    clearJourney();
    saveAnswers(null);
    dirty.current = false;
    setPanel(false);
    setTarget(null);
    (document.activeElement as HTMLElement | null)?.blur?.();
    navigate(base, { replace: true });
  }, [navigate, base]);
  const ctx = useMemo<Toten>(() => ({ base, openPanel: () => setPanel(true), restart }), [base, restart]);

  const [playing, setPlaying] = useState(false);
  const player = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (!video || playing || panel) return;
    let t = setTimeout(() => setPlaying(true), VIDEO_IDLE_MS);
    const on = () => {
      clearTimeout(t);
      t = setTimeout(() => setPlaying(true), VIDEO_IDLE_MS);
    };
    document.addEventListener('pointerdown', on, true);
    document.addEventListener('keydown', on, true);
    return () => {
      clearTimeout(t);
      document.removeEventListener('pointerdown', on, true);
      document.removeEventListener('keydown', on, true);
    };
  }, [video, playing, panel]);
  useEffect(() => {
    const v = player.current;
    if (!v) return;
    if (playing) {
      v.currentTime = 0;
      void v.play().catch(() => undefined);
    } else v.pause();
  }, [playing]);

  useEffect(() => {
    let last = Date.now();
    const on = () => {
      last = Date.now();
      dirty.current = true;
    };
    document.addEventListener('pointerdown', on, true);
    document.addEventListener('keydown', on, true);
    const timer = setInterval(() => {
      if (dirty.current && Date.now() - last > IDLE_MS) restart();
    }, 5000);
    return () => {
      document.removeEventListener('pointerdown', on, true);
      document.removeEventListener('keydown', on, true);
      clearInterval(timer);
    };
  }, [restart]);

  useEffect(() => {
    if (!settings.keyboard) {
      setTarget(null);
      // devolve o inputmode original dos campos que o teclado da tela tinha assumido
      document.querySelectorAll<HTMLElement>('[data-tw-im]').forEach((el) => {
        const im = el.dataset['twIm'];
        if (im) el.setAttribute('inputmode', im);
        else el.removeAttribute('inputmode');
        delete el.dataset['twIm'];
      });
      return;
    }
    const onIn = (e: FocusEvent) => {
      const el = e.target;
      if (!isTextField(el)) return setTarget(null);
      // inputmode=none: o teclado do sistema (touch do Windows/Android) não abre por cima do nosso
      if (el.dataset['twIm'] === undefined) el.dataset['twIm'] = el.getAttribute('inputmode') ?? '';
      el.setAttribute('inputmode', 'none');
      setTarget(el);
    };
    const onOut = () => setTimeout(() => {
      if (!isTextField(document.activeElement)) setTarget(null);
    }, 0);
    document.addEventListener('focusin', onIn);
    document.addEventListener('focusout', onOut);
    if (isTextField(document.activeElement)) setTarget(document.activeElement);
    return () => {
      document.removeEventListener('focusin', onIn);
      document.removeEventListener('focusout', onOut);
    };
  }, [settings.keyboard]);

  // o teclado encolhe a área da página: traz o campo para o meio do que sobrou
  useEffect(() => {
    if (!target) return;
    const id = requestAnimationFrame(() => target.scrollIntoView({ block: 'center', behavior: 'smooth' }));
    return () => cancelAnimationFrame(id);
  }, [target]);

  const [w, h] = settings.res === 'fill' ? [vw, vh] : SIZES[settings.res];
  const scale = Math.min(vw / w, vh / h);
  const src = settings.res === 'portrait' ? videoPortrait ?? video : video;

  return (
    <TotenContext.Provider value={ctx}>
      <div className="tw-toten" data-testid="toten">
        <div className="tw-toten__stage" style={{ width: w, height: h, transform: `translate(-50%, -50%) scale(${scale})` }}>
          <div className="tw-toten__screen" style={{ zoom: settings.zoom }}>
            {/* location.key: cada navegação (inclusive para a mesma rota, ao reiniciar) monta a página do zero */}
            <Outlet key={location.key} />
          </div>
          {target && <Keyboard key={target.name} target={target} onDone={() => target.blur()} />}
        </div>
        {src && (
          // preventDefault: o toque que tira o vídeo não chega à página (nem foca um campo por baixo)
          <div className={`tw-toten__video${playing ? ' is-on' : ''}`} data-testid="toten-video"
            onPointerDown={(e) => { e.preventDefault(); setPlaying(false); }}>
            <video ref={player} key={src} src={src} muted loop playsInline preload="auto" />
          </div>
        )}
      </div>
      <Overlay title="Configurações do toten" open={panel} onClose={() => setPanel(false)}>
        <div className="tw-stack" data-testid="toten-panel">
          <CheckboxField label="Abrir o teclado da tela ao tocar num campo" checked={settings.keyboard}
            onChange={(e) => update({ keyboard: e.target.checked })} data-testid="toten-keyboard" />
          <RadioCards legend="Resolução" name="toten-res" stacked value={settings.res} onChange={(res) => update({ res })}
            options={[
              { value: 'landscape', label: 'Horizontal · 1920 × 1080' },
              { value: 'portrait', label: 'Vertical · 1080 × 1920' },
              { value: 'fill', label: 'Tela inteira, sem escala' },
            ]} />
          <RadioCards legend="Tamanho do conteúdo" name="toten-zoom" value={settings.zoom} onChange={(zoom) => update({ zoom })}
            options={[{ value: '1', label: '100%' }, { value: '1.25', label: '125%' }, { value: '1.5', label: '150%' }, { value: '1.75', label: '175%' }]} />
          <div className="tw-row">
            <Button variant="secondary" onClick={() => void document.documentElement.requestFullscreen?.().catch(() => undefined)}>Tela cheia</Button>
            <Button variant="secondary" onClick={restart} data-testid="toten-restart">Reiniciar jornada</Button>
            <Button onClick={() => setPanel(false)}>Fechar</Button>
          </div>
        </div>
      </Overlay>
    </TotenContext.Provider>
  );
}
