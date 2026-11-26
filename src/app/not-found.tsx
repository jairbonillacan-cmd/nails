import { Button } from '@astryxdesign/core/Button';
import { BrandStage } from '@/components/brand/BrandStage';

export default function NotFound() {
  return (
    <BrandStage
      eyebrow="404"
      title="Esta página no existe"
      body="Puede que el enlace haya cambiado. Tu cita y tus datos siguen igual."
      actions={
        <>
          <Button label="Agendar cita" variant="primary" size="lg" className="fx-press lk-stage-primary" href="/reservar" />
          <Button label="Ir al inicio" variant="ghost" size="lg" className="fx-press lk-stage-ghost" href="/" />
        </>
      }
    />
  );
}
