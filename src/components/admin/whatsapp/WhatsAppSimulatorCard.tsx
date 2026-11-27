'use client';

import { useState } from 'react';
import type { z } from 'zod';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Grid } from '@astryxdesign/core/Grid';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Banner } from '@astryxdesign/core/Banner';
import { Selector } from '@astryxdesign/core/Selector';
import { TextInput } from '@astryxdesign/core/TextInput';
import { Token } from '@astryxdesign/core/Token';
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  CalendarPlus,
  CalendarX2,
  Check,
  FlaskConical,
  Send,
  Smartphone,
} from 'lucide-react';
import { StatusTag, SurfaceCard } from '@/components/ui';
import type {
  WhatsAppSimulateEventSchema,
  WhatsAppSimulateResponseDTO,
} from '@/lib/contracts';
import { formatPhoneDisplay } from '@/lib/format';
import { canonicalizeWhatsAppPhoneE164 } from '@/lib/notifications/whatsapp-inbox';

type WhatsAppSimulateEventInput = z.infer<typeof WhatsAppSimulateEventSchema>;

interface WhatsAppSimulatorCardProps {
  simulatorAllowed: boolean;
  mode: 'demo' | 'supabase';
  isSimulating: boolean;
  simulationResult: WhatsAppSimulateResponseDTO | null;
  onRunSimulation: (input: WhatsAppSimulateEventInput) => Promise<boolean>;
  onOpenChat: (phoneE164: string) => void;
}

interface PresetClientOption {
  id: string;
  label: string;
  name: string;
  phone: string;
  sampleMessageId: string;
}

const PRESET_CLIENTS: readonly PresetClientOption[] = [
  {
    id: 'sofia',
    label: 'Sofía Ramírez · 222 412 3987 (Cita NL-1042)',
    name: 'Sofía Ramírez',
    phone: '+522224123987',
    sampleMessageId: 'wmsg-sofia-2',
  },
  {
    id: 'andrea',
    label: 'Andrea López · 222 876 5112 (Anticipo NL-1044)',
    name: 'Andrea López',
    phone: '+522228765112',
    sampleMessageId: 'wmsg-andrea-3',
  },
  {
    id: 'mariana',
    label: 'Mariana Torres · 222 398 7441 (Softgel NL-1043)',
    name: 'Mariana Torres',
    phone: '+522223987441',
    sampleMessageId: 'wmsg-mariana-2',
  },
  {
    id: 'paula',
    label: 'Paula Herrera · 222 210 9883 (Completada NL-1039)',
    name: 'Paula Herrera',
    phone: '+522222109883',
    sampleMessageId: 'wmsg-paula-1',
  },
  {
    id: 'valeria',
    label: 'Valeria Mendoza · 222 771 1223 (Ventana cerrada)',
    name: 'Valeria Mendoza',
    phone: '+522227711223',
    sampleMessageId: 'wmsg-valeria-1',
  },
  {
    id: 'custom',
    label: 'Otro número personalizado…',
    name: 'Daniela Prueba',
    phone: '+522229112233',
    sampleMessageId: 'wmsg-sofia-2',
  },
];

export function WhatsAppSimulatorCard({
  simulatorAllowed,
  mode,
  isSimulating,
  simulationResult,
  onRunSimulation,
  onOpenChat,
}: WhatsAppSimulatorCardProps) {
  const [selectedPresetId, setSelectedPresetId] = useState<string>('sofia');
  const [customName, setCustomName] = useState('Daniela Prueba');
  const [customPhone, setCustomPhone] = useState('+522229112233');
  const [customText, setCustomText] = useState('');
  const [activeScenario, setActiveScenario] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  const selectedPreset =
    PRESET_CLIENTS.find((item) => item.id === selectedPresetId) ?? PRESET_CLIENTS[0]!;
  const isCustom = selectedPresetId === 'custom';
  const targetName = (isCustom ? customName : selectedPreset.name).trim() || 'Clienta prueba';
  const rawPhone = isCustom ? customPhone : selectedPreset.phone;
  const targetPhone = canonicalizeWhatsAppPhoneE164(rawPhone);
  const latestCreatedMessageId =
    simulationResult?.createdMessages && simulationResult.createdMessages.length > 0
      ? simulationResult.createdMessages[simulationResult.createdMessages.length - 1]?.id
      : null;
  const targetMessageId = latestCreatedMessageId || selectedPreset.sampleMessageId;

  const triggerSimulation = async (scenarioKey: string, input: WhatsAppSimulateEventInput) => {
    if (isSimulating) return;
    setValidationError(null);
    setActiveScenario(scenarioKey);
    try {
      await onRunSimulation(input);
    } finally {
      setActiveScenario(null);
    }
  };

  const handlePhoneRequiredScenario = (
    scenarioKey: string,
    buildInput: (phone: string) => WhatsAppSimulateEventInput,
  ) => {
    if (!targetPhone) {
      setValidationError('Escribe un número de WhatsApp válido de al menos 10 dígitos.');
      return;
    }
    void triggerSimulation(scenarioKey, buildInput(targetPhone));
  };

  const handleCustomTextSubmit = () => {
    const cleanText = customText.trim();
    if (!cleanText) {
      setValidationError('Escribe un texto de prueba como si fuera la clienta.');
      return;
    }
    if (!targetPhone) {
      setValidationError('Escribe un número de WhatsApp válido de al menos 10 dígitos.');
      return;
    }
    void triggerSimulation('custom_text', {
      event: 'inbound_text',
      phone: targetPhone,
      clientName: targetName,
      bodyText: cleanText,
    }).then(() => {
      setCustomText('');
    });
  };

  return (
    <SurfaceCard
      id="wa-simulator-heading"
      icon={<FlaskConical size={17} aria-hidden="true" />}
      title="Simulador interactivo de WhatsApp"
      subtitle="Prueba mensajes entrantes, respuestas automáticas, ecos desde celular (Coexistence) y estados de entrega."
      badge={
        <StatusTag
          tone={simulatorAllowed ? 'accent' : 'neutral'}
          showDot={simulatorAllowed}
          label={
            !simulatorAllowed
              ? 'Desactivado en producción'
              : mode === 'demo'
                ? 'Modo demo activo'
                : 'Pruebas habilitadas'
          }
        />
      }
    >
      <VStack gap={4} className="ad-card-body" paddingBlockStart={4}>
        {!simulatorAllowed ? (
          <Banner
            status="info"
            role="status"
            title="Simulador desactivado en producción"
            description="Para proteger las conversaciones reales de tus clientas, el simulador solo está disponible en modo demo o en entornos de prueba."
          />
        ) : (
          <>
            {validationError ? (
              <Banner
                status="error"
                role="alert"
                title={validationError}
                isDismissable
                onDismiss={() => setValidationError(null)}
              />
            ) : null}

            <VStack gap={3} className="ad-subpanel">
              <Selector
                label="Clienta de prueba"
                value={selectedPresetId}
                isDisabled={isSimulating}
                onChange={(val) => {
                  if (val) {
                    setSelectedPresetId(val);
                    setValidationError(null);
                  }
                }}
                options={PRESET_CLIENTS.map((item) => ({
                  value: item.id,
                  label: item.label,
                }))}
              />

              {isCustom ? (
                <Grid columns={{ minWidth: 180, max: 2 }} gap={2}>
                  <TextInput
                    label="Nombre de la clienta"
                    value={customName}
                    onChange={setCustomName}
                    isDisabled={isSimulating}
                  />
                  <TextInput
                    label="WhatsApp (+52)"
                    placeholder="+52 222 911 2233"
                    value={customPhone}
                    onChange={setCustomPhone}
                    isDisabled={isSimulating}
                  />
                </Grid>
              ) : (
                <Text type="supporting" color="secondary" hasTabularNumbers>
                  Simulando como {selectedPreset.name} ({formatPhoneDisplay(selectedPreset.phone)}).
                </Text>
              )}
            </VStack>

            <VStack gap={2}>
              <Text size="sm" weight="semibold">
                Escenarios en 1 clic
              </Text>
              <HStack gap={2} wrap="wrap">
                <Button
                  type="button"
                  label="CONFIRMAR"
                  variant="secondary"
                  size="sm"
                  icon={<Check size={14} aria-hidden="true" />}
                  isLoading={isSimulating && activeScenario === 'confirm'}
                  isDisabled={isSimulating}
                  onClick={() =>
                    handlePhoneRequiredScenario('confirm', (phone) => ({
                      event: 'inbound_button',
                      phone,
                      clientName: targetName,
                      buttonAction: 'confirm',
                    }))
                  }
                />
                <Button
                  type="button"
                  label="REAGENDAR"
                  variant="secondary"
                  size="sm"
                  icon={<CalendarClock size={14} aria-hidden="true" />}
                  isLoading={isSimulating && activeScenario === 'reschedule'}
                  isDisabled={isSimulating}
                  onClick={() =>
                    handlePhoneRequiredScenario('reschedule', (phone) => ({
                      event: 'inbound_button',
                      phone,
                      clientName: targetName,
                      buttonAction: 'reschedule',
                    }))
                  }
                />
                <Button
                  type="button"
                  label="CANCELAR"
                  variant="secondary"
                  size="sm"
                  icon={<CalendarX2 size={14} aria-hidden="true" />}
                  isLoading={isSimulating && activeScenario === 'cancel'}
                  isDisabled={isSimulating}
                  onClick={() =>
                    handlePhoneRequiredScenario('cancel', (phone) => ({
                      event: 'inbound_button',
                      phone,
                      clientName: targetName,
                      buttonAction: 'cancel',
                    }))
                  }
                />
                <Button
                  type="button"
                  label="Agendar cita"
                  variant="secondary"
                  size="sm"
                  icon={<CalendarPlus size={14} aria-hidden="true" />}
                  isLoading={isSimulating && activeScenario === 'booking_flow'}
                  isDisabled={isSimulating}
                  onClick={() =>
                    handlePhoneRequiredScenario('booking_flow', (phone) => ({
                      event: 'booking_flow',
                      phone,
                      clientName: targetName,
                    }))
                  }
                />
                <Button
                  type="button"
                  label="Eco desde celular"
                  variant="secondary"
                  size="sm"
                  icon={<Smartphone size={14} aria-hidden="true" />}
                  isLoading={isSimulating && activeScenario === 'coexistence_echo'}
                  isDisabled={isSimulating}
                  onClick={() =>
                    handlePhoneRequiredScenario('coexistence_echo', (phone) => ({
                      event: 'coexistence_echo',
                      phone,
                      clientName: targetName,
                      bodyText:
                        '¡Hola! Te confirmo desde el celular del estudio que ya tenemos listo tu espacio.',
                    }))
                  }
                />
                <Button
                  type="button"
                  label="Simular fallo de entrega"
                  variant="ghost"
                  size="sm"
                  icon={<AlertTriangle size={14} aria-hidden="true" />}
                  isLoading={isSimulating && activeScenario === 'delivery_failed'}
                  isDisabled={isSimulating}
                  onClick={() =>
                    void triggerSimulation('delivery_failed', {
                      event: 'delivery_status',
                      messageId: targetMessageId,
                      status: 'failed',
                      errorCode: '131047',
                      errorMessage:
                        'Ventana de 24 h cerrada (simulado); reintenta con una plantilla aprobada.',
                    })
                  }
                />
              </HStack>
            </VStack>

            <HStack gap={2} align="end" wrap="wrap">
              <VStack style={{ flex: '1 1 16rem', minWidth: 0 }}>
                <TextInput
                  label="Mensaje libre entrante de la clienta"
                  placeholder="Ej. Hola, ¿tienen lugar hoy a las 4:00 p.m. para Rubber?"
                  value={customText}
                  onChange={setCustomText}
                  isDisabled={isSimulating}
                />
              </VStack>
              <Button
                type="button"
                label={isSimulating && activeScenario === 'custom_text' ? 'Simulando…' : 'Simular texto'}
                variant="primary"
                size="sm"
                icon={<Send size={14} aria-hidden="true" />}
                isLoading={isSimulating && activeScenario === 'custom_text'}
                isDisabled={isSimulating || !customText.trim()}
                onClick={handleCustomTextSubmit}
              />
            </HStack>

            {simulationResult ? (
              <VStack gap={3} className="ad-wa-sim-result" role="status" aria-live="polite">
                <HStack justify="between" align="center" wrap="wrap" gap={2}>
                  <HStack gap={1.5} align="center" wrap="wrap">
                    <StatusTag
                      tone={simulationResult.ok ? 'success' : 'warning'}
                      showDot
                      label={simulationResult.ok ? 'Simulación ejecutada' : 'Sin cambios'}
                    />
                    <Token size="sm" label={simulationResult.event} />
                    {simulationResult.bookingCode ? (
                      <Token size="sm" color="green" label={`Cita ${simulationResult.bookingCode}`} />
                    ) : null}
                  </HStack>
                  {simulationResult.phoneE164 ? (
                    <Button
                      type="button"
                      label="Ver en Mensajes"
                      variant="primary"
                      size="sm"
                      icon={<ArrowRight size={14} aria-hidden="true" />}
                      onClick={() => onOpenChat(simulationResult.phoneE164)}
                    />
                  ) : null}
                </HStack>

                {simulationResult.sideEffectSummary ? (
                  <Text size="sm" weight="medium">
                    {simulationResult.sideEffectSummary}
                  </Text>
                ) : null}

                {simulationResult.replyText ? (
                  <VStack gap={1}>
                    <Text type="supporting" color="secondary" weight="semibold">
                      Respuesta automática generada
                    </Text>
                    <Text type="supporting" color="secondary" textWrap="pretty" className="ad-msg-preview">
                      {simulationResult.replyText}
                    </Text>
                  </VStack>
                ) : null}

                <HStack gap={2} wrap="wrap">
                  <StatusTag
                    tone="neutral"
                    hasTabularNumbers
                    label={`${simulationResult.createdMessages.length} ${simulationResult.createdMessages.length === 1 ? 'mensaje creado' : 'mensajes creados'}`}
                  />
                  {simulationResult.processed.attendanceConfirmed > 0 ? (
                    <StatusTag
                      tone="success"
                      hasTabularNumbers
                      label={`${simulationResult.processed.attendanceConfirmed} asistencia confirmada`}
                    />
                  ) : null}
                  {simulationResult.processed.echoes > 0 ? (
                    <StatusTag
                      tone="info"
                      hasTabularNumbers
                      label={`${simulationResult.processed.echoes} eco Coexistence`}
                    />
                  ) : null}
                  {simulationResult.processed.statuses > 0 ? (
                    <StatusTag
                      tone="warning"
                      hasTabularNumbers
                      label={`${simulationResult.processed.statuses} estado actualizado`}
                    />
                  ) : null}
                </HStack>
              </VStack>
            ) : null}
          </>
        )}
      </VStack>
    </SurfaceCard>
  );
}
