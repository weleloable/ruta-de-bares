import jsQR from 'jsqr';
import { useEffect, useRef, useState, type CSSProperties } from 'react';

/**
 * Lee un QR con la camara, en web (0046): `getUserMedia` con la camara de
 * atras, y cada fotograma, reducido, pasa por jsQR. Al primer QR que lee,
 * avisa y deja de mirar. Al desmontarse apaga la camara.
 *
 * La variante nativa (EscanerQr.tsx) solo avisa: la app se usa en web.
 */
export function EscanerQr({ onLeido }: { onLeido: (texto: string) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const leido = useRef(onLeido);
  leido.current = onLeido;
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let flujo: MediaStream | null = null;
    let cuadro = 0;
    let vivo = true;
    const lienzo = document.createElement('canvas');
    const ctx = lienzo.getContext('2d', { willReadFrequently: true });

    function mirar() {
      if (!vivo) return;
      const v = video.current;
      if (v && ctx && v.readyState >= 2 && v.videoWidth > 0) {
        const escala = Math.min(1, 480 / v.videoWidth);
        lienzo.width = Math.round(v.videoWidth * escala);
        lienzo.height = Math.round(v.videoHeight * escala);
        ctx.drawImage(v, 0, 0, lienzo.width, lienzo.height);
        const img = ctx.getImageData(0, 0, lienzo.width, lienzo.height);
        const qr = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
        if (qr?.data) {
          vivo = false;
          leido.current(qr.data);
          return;
        }
      }
      cuadro = requestAnimationFrame(mirar);
    }

    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError('Este navegador no deja usar la cámara (hace falta abrir la app por https).');
        return;
      }
      try {
        flujo = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
        if (!vivo) {
          flujo.getTracks().forEach((t) => t.stop());
          return;
        }
        const v = video.current;
        if (!v) return;
        v.srcObject = flujo;
        await v.play();
        cuadro = requestAnimationFrame(mirar);
      } catch (e) {
        const nombre = e instanceof Error ? e.name : '';
        setError(
          nombre === 'NotAllowedError'
            ? 'Sin permiso para la cámara. Actívalo en los ajustes del navegador para esta web.'
            : nombre === 'NotFoundError'
              ? 'No se encuentra ninguna cámara.'
              : 'No se pudo abrir la cámara.',
        );
      }
    })();

    return () => {
      vivo = false;
      cancelAnimationFrame(cuadro);
      flujo?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  if (error) return <div style={e.error}>{error}</div>;
  return (
    <div style={e.marco}>
      <video ref={video} style={e.video} muted playsInline />
      <div style={e.visor} />
    </div>
  );
}

const e: Record<string, CSSProperties> = {
  marco: {
    position: 'relative',
    width: '100%',
    aspectRatio: '1 / 1',
    borderRadius: 16,
    overflow: 'hidden',
    background: '#000',
  },
  video: { width: '100%', height: '100%', objectFit: 'cover', display: 'block' },
  visor: {
    position: 'absolute',
    inset: '18%',
    border: '3px solid rgba(255,255,255,0.9)',
    borderRadius: 18,
    boxShadow: '0 0 0 9999px rgba(0,0,0,0.35)',
  },
  error: { padding: 16, borderRadius: 12, background: '#FDECEA', color: '#8A1C1C', fontSize: 14, lineHeight: '20px' },
};
