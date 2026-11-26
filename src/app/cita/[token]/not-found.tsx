import { Button } from '@astryxdesign/core/Button';
import { BrandStage } from '@/components/brand/BrandStage';

export default function CitaNotFound() {
  return (
    <BrandStage
      eyebrow="Enlace incompleto"
      title="No encontramos esta cita"
      body="Revisa que el enlace de WhatsApp o correo esté completo, o búscala con tu número de celular."
      actions={
        <>
          <Button label="Buscar en Mis citas" variant="primary" size="lg" className="fx-press lk-stage-primary" href="/mis-citas" />
          <Button label="Agendar otra" variant="ghost" size="lg" className="fx-press lk-stage-ghost" href="/reservar" />
        </>
      }
    />
  );
}
