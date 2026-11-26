'use client';

import { useMemo, useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Grid } from '@astryxdesign/core/Grid';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Selector } from '@astryxdesign/core/Selector';
import { TextInput } from '@astryxdesign/core/TextInput';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { ExternalLink, Eye, Globe, Sparkles } from 'lucide-react';
import {
  CopyableField,
  FilterPillBar,
  StatusTag,
  SurfaceCard,
} from '@/components/ui';
import type { Service, StaffMember } from '@/lib/types';

type DisplayStyle = 'inline' | 'floating' | 'popup';

interface EmbedGeneratorCardProps {
  appUrl: string;
  salonName: string;
  accentColor: string;
  services: Service[];
  staff: StaffMember[];
}

const EMBED_MODE_OPTIONS = [
  { value: 'inline' as const, label: 'Dentro de tu página' },
  { value: 'floating' as const, label: 'Botón flotante' },
  { value: 'popup' as const, label: 'Ventana al dar clic' },
];

const MODE_COPY: Record<DisplayStyle, { preview: string; dialogTitle: string }> = {
  inline: {
    preview: 'Se verá así: tu agenda abierta dentro de la página',
    dialogTitle: 'Agenda en tu página',
  },
  floating: {
    preview: 'Se verá así: un botón fijo en la esquina inferior',
    dialogTitle: 'Botón flotante',
  },
  popup: {
    preview: 'Se verá así: un botón que abre tu agenda en una ventana',
    dialogTitle: 'Ventana de reservas',
  },
};

function escapeHtmlAttr(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function sanitizeAccentColor(value: string): string {
  const trimmed = value.trim();
  return /^#[0-9a-fA-F]{3,8}$/.test(trimmed) ? trimmed : 'currentColor';
}

function buildWebsiteCode(params: {
  mode: DisplayStyle;
  bookingUrl: string;
  salonName: string;
  buttonLabel: string;
  accentColor: string;
}): string {
  const safeUrl = escapeHtmlAttr(params.bookingUrl);
  const safeSalon = escapeHtmlAttr(params.salonName);
  const safeLabel = escapeHtmlAttr(params.buttonLabel.trim() || 'Agendar cita');
  const safeAccent = sanitizeAccentColor(params.accentColor);
  const frameTag = ['<', 'iframe'].join('');
  const frameClose = ['</', 'iframe>'].join('');

  if (params.mode === 'inline') {
    return `${frameTag} src="${safeUrl}" title="Reservar en ${safeSalon}" loading="lazy" style="width:100%;min-height:46rem;border:0;border-radius:1rem;overflow:hidden;" allow="clipboard-write">${frameClose}`;
  }

  const isFloating = params.mode === 'floating';
  const btnId = isFloating ? 'laikona-float-btn' : 'laikona-popup-trigger';
  const dlgId = isFloating ? 'laikona-float-modal' : 'laikona-popup-dialog';
  const btnStyle = isFloating
    ? `position:fixed;right:1.25rem;bottom:1.25rem;z-index:9999;padding:0.75rem 1.25rem;border:0;border-radius:99rem;background:${safeAccent};color:white;font:600 0.9375rem/1.2 system-ui,sans-serif;cursor:pointer;box-shadow:0 0.75rem 1.75rem rgba(0,0,0,0.22);`
    : `display:inline-flex;align-items:center;gap:0.5rem;padding:0.75rem 1.35rem;border:0;border-radius:99rem;background:${safeAccent};color:white;font:600 0.9375rem/1.2 system-ui,sans-serif;cursor:pointer;`;

  return [
    `<button type="button" id="${btnId}" aria-haspopup="dialog" style="${btnStyle}">${safeLabel}</button>`,
    `<dialog id="${dlgId}" style="width:min(100%,46rem);height:min(90vh,48rem);padding:0;border:0;border-radius:1rem;overflow:hidden;">`,
    `  ${frameTag} src="${safeUrl}" title="Reservar en ${safeSalon}" style="width:100%;height:100%;border:0;">${frameClose}`,
    `</dialog>`,
    `<script>(function(){var b=document.getElementById('${btnId}'),d=document.getElementById('${dlgId}');if(!b||!d)return;b.addEventListener('click',function(){d.showModal();});d.addEventListener('click',function(e){if(e.target===d)d.close();});})();</script>`,
  ].join('\n');
}

export function EmbedGeneratorCard({
  appUrl,
  salonName,
  accentColor,
  services,
  staff,
}: EmbedGeneratorCardProps) {
  const [mode, setMode] = useState<DisplayStyle>('inline');
  const [serviceSlug, setServiceSlug] = useState('all');
  const [staffSlug, setStaffSlug] = useState('all');
  const [buttonLabel, setButtonLabel] = useState('Agendar cita');
  const [previewOpen, setPreviewOpen] = useState(false);

  const publicServices = useMemo(
    () =>
      services
        .filter((s) => s.isActive && !s.isPrivate)
        .toSorted((a, b) => a.displayOrder - b.displayOrder),
    [services],
  );
  const activeStaff = useMemo(
    () =>
      staff
        .filter((s) => s.isActive)
        .toSorted((a, b) => a.displayOrder - b.displayOrder),
    [staff],
  );

  const baseOrigin = (
    appUrl.trim() ||
    (typeof window !== 'undefined' ? window.location.origin : 'https://laikona.nails')
  ).replace(/\/+$/, '');

  const compactBookingPath = useMemo(() => {
    const pathBase =
      serviceSlug !== 'all' ? `/reservar/${encodeURIComponent(serviceSlug)}` : '/reservar';
    const qs = new URLSearchParams({ embed: '1' });
    if (staffSlug !== 'all') qs.set('staff', staffSlug);
    return `${pathBase}?${qs.toString()}`;
  }, [serviceSlug, staffSlug]);

  const compactBookingUrl = `${baseOrigin}${compactBookingPath}`;
  const websiteCode = useMemo(
    () =>
      buildWebsiteCode({
        mode,
        bookingUrl: compactBookingUrl,
        salonName,
        buttonLabel,
        accentColor,
      }),
    [mode, compactBookingUrl, salonName, buttonLabel, accentColor],
  );

  const selectedService = publicServices.find((s) => s.slug === serviceSlug) ?? null;
  const selectedStaff = activeStaff.find((s) => s.bookingSlug === staffSlug) ?? null;

  return (
    <SurfaceCard
      id="brand-website-agenda-heading"
      icon={<Globe size={16} aria-hidden="true" />}
      title="Poner tu agenda en otra web"
      subtitle="Copia este código y pégalo en WordPress, Wix, Shopify o cualquier página que ya tengas."
      badge={<StatusTag label="Listo para pegar" tone="accent" />}
      footer={
        <Text type="supporting" color="secondary">
          Muestra solo tu calendario con tus colores y horarios reales, sin barras extras.
        </Text>
      }
    >
      <VStack gap={4} className="ad-card-body" paddingBlockStart={4}>
        <FilterPillBar
          ariaLabel="Cómo mostrar tu agenda"
          mode="segmented"
          layout="fill"
          value={mode}
          options={EMBED_MODE_OPTIONS}
          onChange={setMode}
        />

        <Grid columns={{ minWidth: 160, max: 2 }} gap={3}>
          <Selector
            label="Servicio inicial (opcional)"
            size="sm"
            value={serviceSlug}
            onChange={(val) => setServiceSlug(val || 'all')}
            options={[
              { value: 'all', label: 'Todos los servicios' },
              ...publicServices.map((srv) => ({ value: srv.slug, label: srv.name })),
            ]}
          />
          <Selector
            label="Profesional (opcional)"
            size="sm"
            value={staffSlug}
            onChange={(val) => setStaffSlug(val || 'all')}
            options={[
              { value: 'all', label: 'Todo el equipo' },
              ...activeStaff.map((st) => ({ value: st.bookingSlug, label: st.name })),
            ]}
          />
        </Grid>

        {mode !== 'inline' ? (
          <TextInput
            label="Texto del botón"
            size="sm"
            value={buttonLabel}
            placeholder="Agendar cita"
            onChange={setButtonLabel}
          />
        ) : null}

        <VStack className="ad-embed-preview" gap={2}>
          <HStack gap={1.5} align="center" wrap="wrap" justify="center">
            <Sparkles size={14} aria-hidden="true" />
            <Text type="supporting" weight="semibold">
              {MODE_COPY[mode].preview}
            </Text>
          </HStack>
          <Text type="supporting" color="secondary">
            {selectedService ? `Servicio: ${selectedService.name}` : 'Todos los servicios'} ·{' '}
            {selectedStaff ? `Profesional: ${selectedStaff.name}` : 'Todo el equipo'}
          </Text>
          <HStack gap={2} wrap="wrap" justify="center">
            <Button
              type="button"
              label={mode === 'inline' ? 'Ver ejemplo' : buttonLabel.trim() || 'Agendar cita'}
              variant={mode === 'inline' ? 'secondary' : 'primary'}
              size="sm"
              icon={<Eye size={14} aria-hidden="true" />}
              onClick={() => setPreviewOpen(true)}
            />
            {mode === 'inline' ? (
              <Button
                label="Abrir vista compacta"
                variant="ghost"
                size="sm"
                icon={<ExternalLink size={14} aria-hidden="true" />}
                href={compactBookingPath}
                target="_blank"
                rel="noopener noreferrer"
              />
            ) : null}
          </HStack>
        </VStack>

        <CopyableField
          label="Código para tu página web"
          value={websiteCode}
          copyLabel="Copiar código"
          copiedLabel="Código copiado"
          feedbackMessage="Código copiado. Pégalo en tu página web."
          layout="stacked"
          monospace
          endExtra={
            <Button
              label="Abrir vista compacta"
              variant="secondary"
              size="md"
              icon={<ExternalLink size={14} aria-hidden="true" />}
              href={compactBookingPath}
              target="_blank"
              rel="noopener noreferrer"
            />
          }
        />
      </VStack>

      <Dialog isOpen={previewOpen} onOpenChange={setPreviewOpen} width={520} padding={5}>
        <DialogHeader
          title={`Vista previa · ${MODE_COPY[mode].dialogTitle}`}
          subtitle="Así verán tu agenda las clientas que entren desde otra página web."
          onOpenChange={setPreviewOpen}
        />
        <VStack gap={3} paddingBlockStart={4} className="fx-sheet-in">
          <SurfaceCard
            tone="subtle"
            padded
            title={salonName}
            subtitle="Vista compacta de reservas"
            headingLevel={3}
            badge={<StatusTag label="Activa" tone="success" showDot />}
          >
            <VStack gap={3}>
              <VStack className="ad-subpanel" gap={1.5}>
                <Text type="supporting" weight="semibold">
                  {selectedService
                    ? `Servicio seleccionado: ${selectedService.name}`
                    : 'Paso 1 · Elegir servicio del catálogo'}
                </Text>
                <Text type="supporting" color="secondary">
                  {selectedStaff
                    ? `Horarios de ${selectedStaff.name}`
                    : 'Horarios en tiempo real de todo el equipo'}
                </Text>
                <CopyableField value={compactBookingUrl} copyLabel="Copiar enlace" copiedLabel="Copiado" monospace />
              </VStack>
              <HStack gap={2} wrap="wrap" justify="end">
                <Button type="button" label="Cerrar" variant="ghost" size="sm" onClick={() => setPreviewOpen(false)} />
                <Button
                  label="Abrir vista compacta"
                  variant="primary"
                  size="sm"
                  icon={<ExternalLink size={14} aria-hidden="true" />}
                  href={compactBookingPath}
                  target="_blank"
                  rel="noopener noreferrer"
                />
              </HStack>
            </VStack>
          </SurfaceCard>
        </VStack>
      </Dialog>
    </SurfaceCard>
  );
}
