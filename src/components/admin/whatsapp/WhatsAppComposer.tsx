'use client';

import type React from 'react';
import { useMemo, useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Grid } from '@astryxdesign/core/Grid';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Banner } from '@astryxdesign/core/Banner';
import { TextInput } from '@astryxdesign/core/TextInput';
import { TextArea } from '@astryxdesign/core/TextArea';
import { Selector } from '@astryxdesign/core/Selector';
import {
  SegmentedControl,
  SegmentedControlItem,
} from '@astryxdesign/core/SegmentedControl';
import { Token } from '@astryxdesign/core/Token';
import { ExternalLink, FileText, Send, Sparkles } from 'lucide-react';
import type {
  WhatsAppTemplateCatalogItemDTO,
  WhatsAppThreadBookingContextDTO,
  WhatsAppThreadSummaryDTO,
} from '@/lib/contracts';
import {
  WHATSAPP_TEMPLATE_CATALOG,
  buildWhatsAppQuickReplies,
  getWhatsAppTemplateCatalogItem,
  renderWhatsAppTemplatePreview,
} from '@/lib/notifications/whatsapp-inbox';
import type { WhatsAppTemplateConfig, WhatsAppTemplateTriggerKey } from '@/lib/types';
import {
  buildWaMeDirectUrl,
  filterManualWhatsAppTemplates,
  normalizeWhatsAppActionResult,
  prefillWhatsAppTemplateParameters,
  resolveConfiguredTemplateName,
  type WhatsAppInboxActionResult,
  type WhatsAppSendMessageInput,
} from './whatsappUiHelpers';

type ComposerMode = 'text' | 'template';

interface WhatsAppComposerProps {
  thread: WhatsAppThreadSummaryDTO;
  nextBooking: WhatsAppThreadBookingContextDTO | null;
  quickReplies: ReadonlyArray<{ id: string; label: string; text: string }>;
  templates: readonly WhatsAppTemplateConfig[];
  templateCatalog: readonly WhatsAppTemplateCatalogItemDTO[];
  waMeUrl: string;
  isWindowOpen: boolean;
  isSending: boolean;
  quotaPercent: number;
  quotaReached: boolean;
  studioName: string;
  studioAddress?: string;
  timezone: string;
  appUrl?: string;
  onSendMessage: (input: WhatsAppSendMessageInput) => Promise<WhatsAppInboxActionResult>;
}

export function WhatsAppComposer({
  thread,
  nextBooking,
  quickReplies,
  templates,
  templateCatalog,
  waMeUrl,
  isWindowOpen,
  isSending,
  quotaPercent,
  quotaReached,
  studioName,
  studioAddress,
  timezone,
  appUrl,
  onSendMessage,
}: WhatsAppComposerProps) {
  const effectiveCatalog =
    templateCatalog.length > 0 ? templateCatalog : WHATSAPP_TEMPLATE_CATALOG;
  const selectableTemplates = useMemo(
    () => filterManualWhatsAppTemplates(effectiveCatalog, templates),
    [effectiveCatalog, templates],
  );
  const defaultTrigger: WhatsAppTemplateTriggerKey =
    (nextBooking &&
      selectableTemplates.find((tpl) => tpl.triggerKey === 'reminder_24h')?.triggerKey) ||
    selectableTemplates[0]?.triggerKey ||
    'booking_confirmed';

  const [modeChoice, setModeChoice] = useState<ComposerMode | null>(null);
  const [draftText, setDraftText] = useState('');
  const [selectedTrigger, setSelectedTrigger] =
    useState<WhatsAppTemplateTriggerKey>(defaultTrigger);
  const [templateParams, setTemplateParams] = useState<string[]>(() =>
    prefillWhatsAppTemplateParameters(defaultTrigger, {
      clientName: thread.contactName,
      studioAddress,
      nextBooking,
      timezone,
      appUrl,
    }),
  );
  const [sendError, setSendError] = useState<{
    message: string;
    fallbackWaMeUrl: string | null;
  } | null>(null);

  const composerMode: ComposerMode = modeChoice ?? (isWindowOpen ? 'text' : 'template');

  const resolvedQuickReplies = useMemo(() => {
    if (quickReplies.length > 0) return quickReplies;
    return buildWhatsAppQuickReplies({
      clientName: thread.contactName,
      salonName: studioName,
      address: studioAddress,
      timezone,
      nextBooking,
      appUrl,
    });
  }, [quickReplies, thread.contactName, studioName, studioAddress, timezone, nextBooking, appUrl]);

  const activeSpec = getWhatsAppTemplateCatalogItem(selectedTrigger);
  const previewText = useMemo(
    () => renderWhatsAppTemplatePreview(selectedTrigger, templateParams),
    [selectedTrigger, templateParams],
  );

  const templateOptions = useMemo(
    () =>
      selectableTemplates.map((tpl) => ({
        value: tpl.triggerKey,
        label: tpl.friendlyTitle,
        description: tpl.description,
      })),
    [selectableTemplates],
  );

  const directWaMeHref =
    composerMode === 'template'
      ? buildWaMeDirectUrl(thread.phoneE164, previewText)
      : draftText.trim()
        ? buildWaMeDirectUrl(thread.phoneE164, draftText)
        : waMeUrl || buildWaMeDirectUrl(thread.phoneE164);

  const handleModeChange = (nextVal: string) => {
    if (nextVal === 'text' || nextVal === 'template') {
      setModeChoice(nextVal);
      setSendError(null);
    }
  };

  const handleSelectTemplate = (nextVal: string) => {
    const matched = selectableTemplates.find((tpl) => tpl.triggerKey === nextVal);
    if (!matched) return;
    setSelectedTrigger(matched.triggerKey);
    setTemplateParams(
      prefillWhatsAppTemplateParameters(matched.triggerKey, {
        clientName: thread.contactName,
        studioAddress,
        nextBooking,
        timezone,
        appUrl,
      }),
    );
    setSendError(null);
  };

  const handleParamChange = (index: number, nextValue: string) => {
    setTemplateParams((prev) => prev.map((item, idx) => (idx === index ? nextValue : item)));
  };

  const submitFreeText = async () => {
    const cleaned = draftText.trim();
    if (!cleaned || isSending || quotaReached || !isWindowOpen) return;
    setSendError(null);
    const outcome = normalizeWhatsAppActionResult(
      await onSendMessage({
        mode: 'text',
        threadId: thread.id,
        clientId: thread.clientId ?? undefined,
        phoneE164: thread.phoneE164,
        contactName: thread.contactName,
        bookingId: nextBooking?.bookingId ?? null,
        bodyText: cleaned,
      }),
      'No se pudo enviar el mensaje por WhatsApp.',
    );

    if (outcome.ok) {
      setDraftText('');
    } else {
      setSendError({
        message: outcome.error ?? 'No se pudo enviar el mensaje.',
        fallbackWaMeUrl: outcome.fallbackWaMeUrl,
      });
    }
  };

  const handleTextFormSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    void submitFreeText();
  };

  const handleTextKeyDown = (e: React.KeyboardEvent<HTMLElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void submitFreeText();
    }
  };

  const handleTemplateFormSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isSending || quotaReached) return;
    setSendError(null);

    const sanitizedParams = activeSpec.parameterLabels.map((_, idx) => {
      const value = templateParams[idx]?.trim();
      return value && value.length > 0 ? value : activeSpec.exampleParameters[idx] ?? '-';
    });

    const outcome = normalizeWhatsAppActionResult(
      await onSendMessage({
        mode: 'template',
        threadId: thread.id,
        clientId: thread.clientId ?? undefined,
        phoneE164: thread.phoneE164,
        contactName: thread.contactName,
        bookingId: nextBooking?.bookingId ?? null,
        triggerKey: selectedTrigger,
        templateName: resolveConfiguredTemplateName(selectedTrigger, templates),
        parameters: sanitizedParams,
      }),
      'No se pudo enviar la plantilla de WhatsApp.',
    );

    if (!outcome.ok) {
      setSendError({
        message: outcome.error ?? 'No se pudo enviar la plantilla.',
        fallbackWaMeUrl: outcome.fallbackWaMeUrl,
      });
    }
  };

  return (
    <VStack as="footer" className="ad-wa-composer" gap={2} aria-label="Redactor de WhatsApp">
      {quotaReached ? (
        <Banner
          status="warning"
          role="status"
          title="Límite mensual de WhatsApp alcanzado (100%)"
          description="Para evitar cobros extra en Meta, continúa esta conversación directamente desde wa.me."
          endContent={
            <Button
              label="Abrir en wa.me"
              variant="primary"
              size="sm"
              icon={<ExternalLink size={14} aria-hidden="true" />}
              href={directWaMeHref}
              target="_blank"
              rel="noopener noreferrer"
            />
          }
        />
      ) : quotaPercent >= 80 ? (
        <Banner
          status="warning"
          role="status"
          title={`Has usado el ${quotaPercent}% de tu cuota mensual de WhatsApp`}
          description="Usa respuestas dentro de la ventana de 24 h cuando sea posible para aprovechar tus envíos."
        />
      ) : null}

      {sendError ? (
        <Banner
          status="error"
          role="alert"
          title={sendError.message}
          isDismissable
          onDismiss={() => setSendError(null)}
          endContent={
            sendError.fallbackWaMeUrl ? (
              <Button
                label="Abrir en wa.me"
                variant="secondary"
                size="sm"
                icon={<ExternalLink size={14} aria-hidden="true" />}
                href={sendError.fallbackWaMeUrl}
                target="_blank"
                rel="noopener noreferrer"
              />
            ) : undefined
          }
        />
      ) : null}

      <HStack justify="between" align="center" gap={2} wrap="wrap">
        <SegmentedControl
          label="Modo de envío de WhatsApp"
          value={composerMode}
          size="sm"
          onChange={handleModeChange}
        >
          <SegmentedControlItem value="text" label="Texto libre" />
          <SegmentedControlItem value="template" label="Plantilla Meta" />
        </SegmentedControl>

        <Text type="supporting" color="secondary">
          {composerMode === 'text' && isWindowOpen
            ? 'Enter envía · Shift+Enter salto de línea'
            : 'Plantilla oficial aprobada por Meta'}
        </Text>
      </HStack>

      {composerMode === 'text' ? (
        !isWindowOpen ? (
          <Banner
            status="info"
            role="status"
            title="Ventana de 24 horas cerrada"
            description="Meta solo permite texto libre durante las 24 horas posteriores al último mensaje de la clienta. Usa una plantilla aprobada o continúa en wa.me."
            endContent={
              <HStack gap={1.5} wrap="wrap">
                <Button
                  type="button"
                  label="Usar plantilla Meta"
                  variant="primary"
                  size="sm"
                  icon={<FileText size={14} aria-hidden="true" />}
                  onClick={() => setModeChoice('template')}
                />
                <Button
                  label="Abrir en wa.me"
                  variant="secondary"
                  size="sm"
                  icon={<ExternalLink size={14} aria-hidden="true" />}
                  href={directWaMeHref}
                  target="_blank"
                  rel="noopener noreferrer"
                />
              </HStack>
            }
          />
        ) : (
          <VStack gap={2}>
            {resolvedQuickReplies.length > 0 ? (
              <HStack
                className="ad-wa-quick-replies"
                gap={1.5}
                align="center"
                wrap="wrap"
                aria-label="Respuestas rápidas"
              >
                <Sparkles size={13} aria-hidden="true" />
                {resolvedQuickReplies.map((reply) => (
                  <Button
                    key={reply.id}
                    type="button"
                    label={reply.label}
                    variant="secondary"
                    size="sm"
                    isDisabled={isSending || quotaReached}
                    onClick={() => setDraftText(reply.text)}
                  />
                ))}
              </HStack>
            ) : null}

            <form onSubmit={handleTextFormSubmit}>
              <VStack gap={2}>
                <TextArea
                  label={`Escribir mensaje a ${thread.contactName}`}
                  isLabelHidden
                  placeholder={`Escribe un mensaje para ${thread.contactName}…`}
                  rows={2}
                  value={draftText}
                  onChange={setDraftText}
                  onKeyDown={handleTextKeyDown}
                  isDisabled={isSending || quotaReached}
                />
                <HStack justify="between" align="center" gap={2} wrap="wrap">
                  <Button
                    label="Abrir en wa.me"
                    variant="ghost"
                    size="sm"
                    icon={<ExternalLink size={14} aria-hidden="true" />}
                    href={directWaMeHref}
                    target="_blank"
                    rel="noopener noreferrer"
                  />
                  <Button
                    type="submit"
                    label={isSending ? 'Enviando…' : 'Enviar'}
                    variant="primary"
                    size="sm"
                    icon={<Send size={14} aria-hidden="true" />}
                    isLoading={isSending}
                    isDisabled={isSending || quotaReached || !draftText.trim()}
                  />
                </HStack>
              </VStack>
            </form>
          </VStack>
        )
      ) : (
        <form onSubmit={(e) => void handleTemplateFormSubmit(e)}>
          <VStack gap={3}>
            <Selector
              label="Plantilla aprobada por Meta"
              size="sm"
              value={selectedTrigger}
              options={templateOptions}
              isDisabled={isSending}
              onChange={handleSelectTemplate}
            />

            <Grid columns={{ minWidth: 155, max: 3 }} gap={2}>
              {activeSpec.parameterLabels.map((paramLabel, idx) => (
                <TextInput
                  key={`${selectedTrigger}-p-${idx}`}
                  label={paramLabel}
                  size="sm"
                  placeholder={activeSpec.exampleParameters[idx] ?? ''}
                  value={templateParams[idx] ?? ''}
                  isDisabled={isSending}
                  onChange={(nextVal) => handleParamChange(idx, nextVal)}
                />
              ))}
            </Grid>

            <VStack className="ad-wa-template-preview" gap={1.5}>
              <HStack justify="between" align="center" gap={2} wrap="wrap">
                <Text type="supporting" color="secondary" weight="semibold">
                  Vista previa
                </Text>
                <Token
                  size="sm"
                  label={resolveConfiguredTemplateName(selectedTrigger, templates)}
                />
              </HStack>
              <Text size="sm" textWrap="pretty">
                {previewText}
              </Text>
              {activeSpec.quickReplyButtons && activeSpec.quickReplyButtons.length > 0 ? (
                <HStack gap={1.5} wrap="wrap">
                  {activeSpec.quickReplyButtons.map((btnLabel) => (
                    <Token key={btnLabel} size="sm" label={btnLabel} />
                  ))}
                </HStack>
              ) : null}
            </VStack>

            <HStack justify="between" align="center" gap={2} wrap="wrap">
              <Button
                label="Abrir en wa.me"
                variant="secondary"
                size="sm"
                icon={<ExternalLink size={14} aria-hidden="true" />}
                href={directWaMeHref}
                target="_blank"
                rel="noopener noreferrer"
              />
              <Button
                type="submit"
                label={isSending ? 'Enviando plantilla…' : 'Enviar plantilla'}
                variant="primary"
                size="sm"
                icon={<Send size={14} aria-hidden="true" />}
                isLoading={isSending}
                isDisabled={isSending || quotaReached}
              />
            </HStack>
          </VStack>
        </form>
      )}
    </VStack>
  );
}
