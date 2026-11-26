'use client';

import NextLink from 'next/link';
import './globals.css';
import { LANDING_ASSETS } from '@/components/landing/landingContent';

export default function RootGlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const referenceCode = error.digest?.trim();

  return (
    <html lang="es-MX" data-astryx-theme="nails" data-theme="light">
      <body>
        <main className="lk-root lk-boundary">
          <section className="lk-boundary-card fx-fade-up" aria-labelledby="global-err-title">
            <header className="lk-boundary-hero lk-boundary-stack">
              <img
                src={LANDING_ASSETS.logoWhite}
                alt="LAIKONA NAILS"
                width={136}
                height={38}
                className="lk-boundary-logo"
              />
              <p className="lk-boundary-code-on-cherry">
                {referenceCode ? `Ref · ${referenceCode}` : 'Interrupción temporal'}
              </p>
              <img
                src={LANDING_ASSETS.strokePorcelain}
                alt=""
                aria-hidden="true"
                width={136}
                height={16}
                className="lk-boundary-stroke"
              />
              <svg
                className="lk-boundary-wave"
                viewBox="0 0 1440 40"
                preserveAspectRatio="none"
                aria-hidden="true"
              >
                <path d="M0 40h1440V22c-120-14-240-20-360-12S840 34 720 34 480 14 360 10 120 20 0 26Z" />
              </svg>
            </header>

            <section className="lk-boundary-body lk-boundary-stack">
              <h1 id="global-err-title" className="lk-serif lk-boundary-title">
                Algo salió mal
              </h1>
              <p style={{ color: 'var(--color-text-secondary)', maxWidth: '28rem' }}>
                Ocurrió una interrupción inesperada. Tus citas y datos están seguros; intenta
                recargar o vuelve al inicio de LAIKONA NAILS.
              </p>
              <nav aria-label="Acciones de recuperación" className="lk-boundary-actions">
                <button
                  type="button"
                  onClick={reset}
                  className="lk-boundary-btn-primary fx-press"
                >
                  Intentar de nuevo
                </button>
                <NextLink href="/" className="lk-boundary-btn-secondary fx-press">
                  Volver al inicio
                </NextLink>
              </nav>
            </section>
          </section>
        </main>
      </body>
    </html>
  );
}
