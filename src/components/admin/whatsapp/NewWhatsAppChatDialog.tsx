'use client';

import { useId, useMemo, useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Grid } from '@astryxdesign/core/Grid';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Banner } from '@astryxdesign/core/Banner';
import { TextInput } from '@astryxdesign/core/TextInput';
import { Selector } from '@astryxdesign/core/Selector';
import { Token } from '@astryxdesign/core/Token';
import { ExternalLink, Send } from 'lucide-react';
import type { WhatsAppTemplateCatalogItemDTO } from '@/lib/contracts';
import {
  WHATSAPP_TEMPLATE_CATALOG,
  canonicalizeWhatsAppPhoneE164,
  getWhatsAppTemplateCatalogItem,
  renderWhatsAppTemplatePreview,
} from '@/lib/notifications/whatsapp-inbox';
import {
  FORM_SUBMIT_OK,
  formSubmitError,
  type FormSubmitResult,
} from '@/lib/forms/form-submit';
import type { WhatsAppTemplateConfig, WhatsAppTemplateTriggerKey } from '@/lib/types';
import { FormDialog } from '@/components/ui/FormDialog';
import {
  buildWaMeDirectUrl,
  filterManualWhatsAppTemplates,
  normalizeWhatsAppActionResult,
  prefillWhatsAppTemplateParameters,
  resolveConfiguredTemplateName,
  type WhatsAppInboxActionResult,
  type WhatsAppStartNewChatInput,
} from './whatsappUiHelpers';

export interface NewWhatsAppChatClientOption {
  id: string;
  fullName: string;
  phoneE164: string;
}

interface NewWhatsAppChatDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  initialPhone?: string | null;
  initialName?: string | null;
  studioName: string;
  studioAddress?: string;
  timezone?: string;
  appUrl?: string;
  templateCatalog?: readonly WhatsAppTemplateCatalogItemDTO[];
  configuredTemplates?: readonly WhatsAppTemplateConfig[];
  clients?: readonly NewWhatsAppChatClientOption[];
  quotaReached?: boolean;
  onStartNewChat: (input: WhatsAppStartNewChatInput) => Promise<WhatsAppInboxActionResult>;
}

export function NewWhatsAppChatDialog({
  isOpen,
  onOpenChange,
  initialPhone = null,
  initialName = null,
  studioName,
  studioAddress,
  timezone,
  appUrl,
  templateCatalog = WHATSAPP_TEMPLATE_CATALOG,
  configuredTemplates,
  clients,
  quotaReached = false,
  onStartNewChat,
}: NewWhatsAppChatDialogProps) {
  const formId = useId();
  const selectableTemplates = useMemo(
    () => filterManualWhatsAppTemplates(templateCatalog, configuredTemplates),
    [templateCatalog, configuredTemplates],
  );
  const defaultTrigger: WhatsAppTemplateTriggerKey =
    selectableTemplates[0]?.triggerKey ?? 'booking_confirmed';

  const [wasOpen, setWasOpen] = useState(isOpen);
  const [selectedClientId, setSelectedClientId] = useState<string>('');
  const [phoneInput, setPhoneInput] = useState(initialPhone ?? '');
  const [contactName, setContactName] = useState(initialName ?? '');
  const [triggerKey, setTriggerKey] = useState<WhatsAppTemplateTriggerKey>(defaultTrigger);
  const [parameters, setParameters] = useState<string[]>(() =>
    prefillWhatsAppTemplateParameters(defaultTrigger, {
      clientName: initialName,
      studioAddress,
      timezone,
      appUrl,
    }),
  );
  const [fallbackWaMeUrl, setFallbackWaMeUrl] = useState<string | null>(null);

  if (wasOpen !== isOpen) {
    setWasOpen(isOpen);
    if (isOpen) {
      const nextPhone = initialPhone ?? '';
      const nextName = initialName ?? '';
      setSelectedClientId('');
      setPhoneInput(nextPhone);
      setContactName(nextName);
      setTriggerKey(defaultTrigger);
      setParameters(
        prefillWhatsAppTemplateParameters(defaultTrigger, {
          clientName: nextName,
          studioAddress,
          timezone,
          appUrl,
        }),
      );
      setFallbackWaMeUrl(null);
    }
  }

  const activeSpec = getWhatsAppTemplateCatalogItem(triggerKey);
  const previewText = useMemo(
    () => renderWhatsAppTemplatePreview(triggerKey, parameters),
    [triggerKey, parameters],
  );

  const canonicalPhone = canonicalizeWhatsAppPhoneE164(phoneInput);
  const hasValidPhone = canonicalPhone.replace(/\D/g, '').length >= 10;
  const directWaMeUrl = hasValidPhone
    ? buildWaMeDirectUrl(canonicalPhone, previewText)
    : null;

  const templateOptions = useMemo(
    () =>
      selectableTemplates.map((tpl) => ({
        value: tpl.triggerKey,
        label: tpl.friendlyTitle,
        description: tpl.description,
      })),
    [selectableTemplates],
  );

  const clientOptions = useMemo(
    () =>
      (clients ?? []).map((client) => ({
        value: client.id,
        label: client.fullName,
        description: client.phoneE164,
      })),
    [clients],
  );

  const handleSelectClient = (clientId: string) => {
    setSelectedClientId(clientId);
    const matched = clients?.find((c) => c.id === clientId);
    if (!matched) return;
    setPhoneInput(matched.phoneE164);
    setContactName(matched.fullName);
    setParameters(
      prefillWhatsAppTemplateParameters(triggerKey, {
        clientName: matched.fullName,
        studioAddress,
        timezone,
        appUrl,
      }),
    );
  };

  const handleTemplateChange = (nextValue: string) => {
    const matched = selectableTemplates.find((tpl) => tpl.triggerKey === nextValue);
    if (!matched) return;
    setTriggerKey(matched.triggerKey);
    setParameters(
      prefillWhatsAppTemplateParameters(matched.triggerKey, {
        clientName: contactName,
        studioAddress,
        timezone,
        appUrl,
      }),
    );
  };

  const handleParamChange = (index: number, nextValue: string) => {
    setParameters((prev) => prev.map((item, idx) => (idx === index ? nextValue : item)));
  };

  const handleContactNameChange = (nextName: string) => {
    setContactName(nextName);
    const firstName = nextName.trim().split(/\s+/)[0];
    if (firstName && activeSpec.parameterLabels[0]?.toLowerCase().includes('clienta')) {
      setParameters((prev) =>
        prev.map((item, idx) => (idx === 0 ? firstName : item)),
      );
    }
  };

  const handleSubmit = async (): Promise<FormSubmitResult> => {
    setFallbackWaMeUrl(null);
    if (!hasValidPhone) {
      return formSubmitError('Escribe un número de WhatsApp válido (al menos 10 dígitos).');
    }

    const sanitizedParams = activeSpec.parameterLabels.map((_, idx) => {
      const value = parameters[idx]?.trim();
      return value && value.length > 0 ? value : activeSpec.exampleParameters[idx] ?? '-';
    });

    const outcome = normalizeWhatsAppActionResult(
      await onStartNewChat({
        phoneE164: canonicalPhone,
        contactName: contactName.trim() || undefined,
        triggerKey,
        templateName: resolveConfiguredTemplateName(triggerKey, configuredTemplates),
        parameters: sanitizedParams,
      }),
      'No se pudo iniciar la conversación por WhatsApp.',
    );

    if (!outcome.ok) {
      if (outcome.fallbackWaMeUrl) {
        setFallbackWaMeUrl(outcome.fallbackWaMeUrl);
      }
      return formSubmitError(outcome.error);
    }
    return FORM_SUBMIT_OK;
  };

  return (
    <FormDialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      title="Iniciar conversación por WhatsApp"
      subtitle={`Para escribir por primera vez desde ${studioName}, Meta requiere una plantilla aprobada.`}
      width="min(36rem, 96vw)"
      submitFooter={{
        formId,
        submitLabel: 'Enviar plantilla',
        submitIcon: <Send size={14} aria-hidden="true" />,
        isSubmitDisabled: !hasValidPhone || quotaReached,
      }}
    >
      {(controls) => (
        <form
          id={formId}
          onSubmit={(e) => {
            e.preventDefault();
            controls.submit(handleSubmit);
          }}
        >
          <VStack gap={3}>
            {quotaReached ? (
              <Banner
                status="warning"
                role="status"
                title="Cuota mensual de WhatsApp alcanzada"
                description="No es posible iniciar conversaciones automáticas este mes. Puedes escribir directamente desde wa.me."
                endContent={
                  directWaMeUrl ? (
                    <Button
                      label="Abrir en wa.me"
                      variant="primary"
                      size="sm"
                      icon={<ExternalLink size={14} aria-hidden="true" />}
                      href={directWaMeUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    />
                  ) : undefined
                }
              />
            ) : null}

            {fallbackWaMeUrl ? (
              <HStack justify="end">
                <Button
                  label="Continuar en wa.me"
                  variant="secondary"
                  size="sm"
                  icon={<ExternalLink size={14} aria-hidden="true" />}
                  href={fallbackWaMeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                />
              </HStack>
            ) : null}

            {clientOptions.length > 0 ? (
              <Selector
                label="Elegir clienta existente"
                placeholder="Buscar en tu directorio (opcional)…"
                value={selectedClientId}
                options={clientOptions}
                hasSearch
                searchPlaceholder="Nombre o teléfono…"
                isOptional
                onChange={handleSelectClient}
              />
            ) : null}

            <Grid columns={{ minWidth: 180, max: 2 }} gap={3}>
              <TextInput
                label="WhatsApp"
                type="tel"
                placeholder="+52 222 000 0000"
                description={
                  hasValidPhone
                    ? `Formato internacional: ${canonicalPhone}`
                    : 'Ingresa 10 dígitos de México o incluye código de país.'
                }
                value={phoneInput}
                onChange={setPhoneInput}
                isRequired
              />
              <TextInput
                label="Nombre de la clienta"
                placeholder="Ejemplo: Sofía Ramírez"
                value={contactName}
                onChange={handleContactNameChange}
                isOptional
              />
            </Grid>

            <Selector
              label="Plantilla oficial de Meta"
              value={triggerKey}
              options={templateOptions}
              onChange={handleTemplateChange}
              isRequired
            />

            <Grid columns={{ minWidth: 160, max: 2 }} gap={2}>
              {activeSpec.parameterLabels.map((paramLabel, idx) => (
                <TextInput
                  key={`${triggerKey}-param-${idx}`}
                  label={paramLabel}
                  size="sm"
                  placeholder={activeSpec.exampleParameters[idx] ?? ''}
                  value={parameters[idx] ?? ''}
                  onChange={(nextVal) => handleParamChange(idx, nextVal)}
                />
              ))}
            </Grid>

            <VStack className="ad-wa-template-preview" gap={1.5}>
              <HStack justify="between" align="center" gap={2} wrap="wrap">
                <Text type="supporting" color="secondary" weight="semibold">
                  Vista previa en WhatsApp
                </Text>
                <Token
                  size="sm"
                  label={resolveConfiguredTemplateName(triggerKey, configuredTemplates)}
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
          </VStack>
        </form>
      )}
    </FormDialog>
  );
}
