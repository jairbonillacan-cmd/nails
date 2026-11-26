'use client';

import { Button } from '@astryxdesign/core/Button';
import { BrandStage } from '@/components/brand/BrandStage';

export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const referenceCode = error.digest?.trim();

  return (
    <BrandStage
      eyebrow={referenceCode ? `Referencia ${referenceCode}` : 'Algo falló'}
      title="No pudimos cargar esto"
      body="Fue un error de nuestro lado. Tus citas siguen guardadas; intenta de nuevo en un momento."
      actions={
        <>
          <Button
            type="button"
            label="Intentar de nuevo"
            variant="primary"
            size="lg"
            className="fx-press lk-stage-primary"
            onClick={reset}
          />
          <Button label="Ir al inicio" variant="ghost" size="lg" className="fx-press lk-stage-ghost" href="/" />
        </>
      }
    />
  );
}
