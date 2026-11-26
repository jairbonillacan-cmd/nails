'use client';

import { useMemo, useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Grid } from '@astryxdesign/core/Grid';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Selector } from '@astryxdesign/core/Selector';
import { TextInput } from '@astryxdesign/core/TextInput';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { Check, Copy, ExternalLink, Eye, Globe, Sparkles } from 'lucide-react';
import {
  AdminConfigChip,
  AdminConfigSection,
} from '@/components/admin/config/AdminConfigPrimitives';
import { useEphemeralMessage } from '@/lib/hooks/useEphemeralMessage';
import type { Service, StaffMember } from '@/lib/types';

type DisplayStyle = 'inline' | 'floating' | 'popup';

interface EmbedGeneratorCardProps {
  appUrl: string;
  salonName: string;
  accentColor: string;
  services: Service[];
  staff: StaffMember[];
}

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
    return [
      frameTag,
      `  src="${safeUrl}"`,
      `  title="Reservar en ${safeSalon}"`,
      `  loading="lazy"`,
      `  style="width:100%;min-height:46rem;border:0;border-radius:1rem;overflow:hidden;"`,
      `  allow="clipboard-write"`,
      `>${frameClose}`,
    ].join('\n');
  }

  if (params.mode === 'floating') {
    return [
      `<button`,
      `  type="button"`,
      `  id="laikona-float-btn"`,
      `  aria-haspopup="dialog"`,
      `  style="position:fixed;right:1.25rem;bottom:1.25rem;z-index:9999;padding:0.75rem 1.25rem;border:0;border-radius:99rem;background:${safeAccent};color:white;font:600 0.9375rem/1.2 system-ui,sans-serif;cursor:pointer;box-shadow:0 0.75rem 1.75rem rgba(0,0,0,0.22);"`,
      `>${safeLabel}</button>`,
      `<dialog id="laikona-float-modal" style="width:min(100%,46rem);height:min(90vh,48rem);padding:0;border:0;border-radius:1rem;overflow:hidden;">`,
      `  ${frameTag} src="${safeUrl}" title="Reservar en ${safeSalon}" style="width:100%;height:100%;border:0;">${frameClose}`,
      `</dialog>`,
      `<script>`,
      `  (function(){`,
      `    var b=document.getElementById('laikona-float-btn'),d=document.getElementById('laikona-float-modal');`,
      `    if(!b||!d)return;`,
      `    b.addEventListener('click',function(){d.showModal();});`,
      `    d.addEventListener('click',function(e){if(e.target===d)d.close();});`,
      `  })();`,
      `</script>`,
    ].join('\n');
  }

  return [
    `<button`,
    `  type="button"`,
    `  id="laikona-popup-trigger"`,
    `  aria-haspopup="dialog"`,
    `  style="display:inline-flex;align-items:center;gap:0.5rem;padding:0.75rem 1.35rem;border:0;border-radius:99rem;background:${safeAccent};color:white;font:600 0.9375rem/1.2 system-ui,sans-serif;cursor:pointer;"`,
    `>${safeLabel}</button>`,
    `<dialog id="laikona-popup-dialog" style="width:min(100%,46rem);height:min(90vh,48rem);padding:0;border:0;border-radius:1rem;overflow:hidden;">`,
    `  ${frameTag} src="${safeUrl}" title="Reservar en ${safeSalon}" style="width:100%;height:100%;border:0;">${frameClose}`,
    `</dialog>`,
    `<script>`,
    `  (function(){`,
    `    var b=document.getElementById('laikona-popup-trigger'),d=document.getElementById('laikona-popup-dialog');`,
    `    if(!b||!d)return;`,
    `    b.addEventListener('click',function(){d.showModal();});`,
    `    d.addEventListener('click',function(e){if(e.target===d)d.close();});`,
    `  })();`,
    `</script>`,
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
  const copyFeedback = useEphemeralMessage(2400);

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
    if (staffSlug !== 'all') {
      qs.set('staff', staffSlug);
    }
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

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(websiteCode);
      copyFeedback.show('Código copiado. Pégalo en tu sitio web.');
    } catch {
      copyFeedback.show('Selecciona y copia el código manualmente.');
    }
  };

  const selectedService = publicServices.find((s) => s.slug === serviceSlug) ?? null;
  const selectedStaff = activeStaff.find((s) => s.bookingSlug === staffSlug) ?? null;
  const isCopied = Boolean(copyFeedback.message);

  return (
    <AdminConfigSection
      id="brand-website-agenda-heading"
      icon={<Globe size={16} aria-hidden="true" />}
      title="Poner tu agenda en otra web"
      subtitle="Copia este código y pégalo en WordPress, Wix, Shopify o cualquier página que ya tengas."
      badge={<AdminConfigChip label="Listo para pegar" tone="accent" />}
      footer={
        <Text type="supporting" color="secondary" role="status" aria-live="polite">
          {copyFeedback.message ??
            'Muestra solo tu calendario con tus colores y horarios reales, sin barras extras.'}
        </Text>
      }
    >
      <VStack gap={4} className="ad-card-body" paddingBlockStart={4}>
        <SegmentedControl
          label="Cómo mostrar tu agenda"
          layout="fill"
          size="sm"
          value={mode}
          onChange={(val) => {
            if (val === 'inline' || val === 'floating' || val === 'popup') {
              setMode(val);
            }
          }}
        >
          <SegmentedControlItem value="inline" label="Dentro de tu página" />
          <SegmentedControlItem value="floating" label="Botón flotante" />
          <SegmentedControlItem value="popup" label="Ventana al dar clic" />
        </SegmentedControl>

        <Grid columns={{ minWidth: 160, max: 2 }} gap={3}>
          <Selector
            label="Servicio inicial (opcional)"
            size="sm"
            value={serviceSlug}
            onChange={(val) => setServiceSlug(val || 'all')}
            options={[
              { value: 'all', label: 'Todos los servicios' },
              ...publicServices.map((srv) => ({
                value: srv.slug,
                label: srv.name,
              })),
            ]}
          />
          <Selector
            label="Manicurista (opcional)"
            size="sm"
            value={staffSlug}
            onChange={(val) => setStaffSlug(val || 'all')}
            options={[
              { value: 'all', label: 'Todo el equipo' },
              ...activeStaff.map((st) => ({
                value: st.bookingSlug,
                label: st.name,
              })),
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
              {mode === 'inline'
                ? 'Se verá así: tu agenda abierta dentro de la página'
                : mode === 'floating'
                  ? 'Se verá así: un botón fijo en la esquina inferior'
                  : 'Se verá así: un botón que abre tu agenda en una ventana'}
            </Text>
          </HStack>

          <Text type="supporting" color="secondary">
            {selectedService ? `Servicio: ${selectedService.name}` : 'Todos los servicios'} ·{' '}
            {selectedStaff ? `Manicurista: ${selectedStaff.name}` : 'Todo el equipo'}
          </Text>

          {mode === 'inline' ? (
            <HStack gap={2} wrap="wrap" justify="center">
              <Button
                type="button"
                label="Ver ejemplo"
                variant="secondary"
                size="sm"
                icon={<Eye size={14} aria-hidden="true" />}
                onClick={() => setPreviewOpen(true)}
              />
              <Button
                label="Abrir vista compacta"
                variant="ghost"
                size="sm"
                icon={<ExternalLink size={14} aria-hidden="true" />}
                href={compactBookingPath}
                target="_blank"
                rel="noopener noreferrer"
              />
            </HStack>
          ) : (
            <Button
              type="button"
              label={buttonLabel.trim() || 'Agendar cita'}
              variant="primary"
              size="sm"
              icon={<Eye size={14} aria-hidden="true" />}
              onClick={() => setPreviewOpen(true)}
            />
          )}
        </VStack>

        <pre className="ad-embed-code">
          <code>{websiteCode}</code>
        </pre>

        <HStack gap={2} wrap="wrap">
          <Button
            type="button"
            label={isCopied ? 'Código copiado' : 'Copiar código'}
            variant="primary"
            size="sm"
            icon={
              isCopied ? (
                <Check size={14} aria-hidden="true" className="fx-pop" />
              ) : (
                <Copy size={14} aria-hidden="true" />
              )
            }
            onClick={() => void handleCopyCode()}
          />
          <Button
            label="Abrir vista compacta"
            variant="secondary"
            size="sm"
            icon={<ExternalLink size={14} aria-hidden="true" />}
            href={compactBookingPath}
            target="_blank"
            rel="noopener noreferrer"
          />
        </HStack>
      </VStack>

      <Dialog
        isOpen={previewOpen}
        onOpenChange={setPreviewOpen}
        width={520}
        padding={5}
      >
        <DialogHeader
          title={`Vista previa · ${
            mode === 'inline'
              ? 'Agenda en tu página'
              : mode === 'floating'
                ? 'Botón flotante'
                : 'Ventana de reservas'
          }`}
          subtitle="Así verán tu agenda las clientas que entren desde otra página web."
          onOpenChange={setPreviewOpen}
        />
        <VStack gap={3} paddingBlockStart={4} className="fx-sheet-in">
          <VStack className="ad-surface" data-tone="subtle" data-padded="true" gap={2}>
            <HStack justify="between" align="center" wrap="wrap" gap={2}>
              <VStack gap={0.5}>
                <Text weight="bold">{salonName}</Text>
                <Text type="supporting" color="secondary">
                  Vista compacta de reservas
                </Text>
              </VStack>
              <AdminConfigChip label="Activa" tone="success" />
            </HStack>
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
              <Text className="ad-code-pill" color="secondary">
                {compactBookingUrl}
              </Text>
            </VStack>
            <HStack gap={2} wrap="wrap" justify="end">
              <Button
                type="button"
                label="Cerrar"
                variant="ghost"
                size="sm"
                onClick={() => setPreviewOpen(false)}
              />
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
        </VStack>
      </Dialog>
    </AdminConfigSection>
  );
}
