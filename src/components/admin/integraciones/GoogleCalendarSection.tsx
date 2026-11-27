'use client';

import { useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Grid } from '@astryxdesign/core/Grid';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Banner } from '@astryxdesign/core/Banner';
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput';
import { Selector } from '@astryxdesign/core/Selector';
import { Calendar } from 'lucide-react';
import { ConfirmActionDialog, StatusTag, SurfaceCard } from '@/components/ui';
import type { CalendarConnection, StaffMember } from '@/lib/types';

interface GoogleCalendarSectionProps {
  staff: StaffMember[];
  calendarConnections: CalendarConnection[];
  googleCalendarConfigured: boolean;
  isDemoMode: boolean;
  busyCalendarStaffId: string | null;
  onUpdateDestination: (staffId: string, destinationCalendarId: string) => Promise<void>;
  onUpdateConflictCalendars: (staffId: string, conflictCalendarIds: string[]) => Promise<void>;
  onToggleConnection: (staffId: string, isConnected: boolean) => Promise<void>;
}

export function GoogleCalendarSection({
  staff,
  calendarConnections,
  googleCalendarConfigured,
  isDemoMode,
  busyCalendarStaffId,
  onUpdateDestination,
  onUpdateConflictCalendars,
  onToggleConnection,
}: GoogleCalendarSectionProps) {
  const [pendingDisconnect, setPendingDisconnect] = useState<StaffMember | null>(null);
  const connectedCount = calendarConnections.filter((c) => c.isConnected).length;

  return (
    <>
    <SurfaceCard
      id="gcal-heading"
      icon={<Calendar size={18} aria-hidden="true" />}
      title="Google Calendar"
      subtitle="Para que tus pendientes personales y las citas no se encimen."
      badge={
        <StatusTag
          tone={connectedCount > 0 ? 'success' : 'neutral'}
          showDot={connectedCount > 0}
          label={
            connectedCount > 0
              ? `${connectedCount} conectado${connectedCount === 1 ? '' : 's'}`
              : 'Sin conectar'
          }
          hasTabularNumbers
        />
      }
    >
      <VStack gap={3} className="ad-card-body" paddingBlockStart={4}>
        {!googleCalendarConfigured && !isDemoMode ? (
          <Banner
            status="info"
            role="status"
            title="Google Calendar está listo para activarse"
            description="Falta agregar las credenciales de Google (Client ID y Secret) en el entorno de producción para vincular las cuentas reales."
          />
        ) : null}

        <Grid columns={{ minWidth: 240, max: 3 }} gap={3}>
          {staff.map((st) => {
            const conn = calendarConnections.find((c) => c.staffId === st.id);
            const isBusy = busyCalendarStaffId === st.id;
            const isConnected = Boolean(conn?.isConnected);
            return (
              <VStack key={st.id} className="ad-subpanel" justify="between" gap={3}>
                <VStack gap={2}>
                  <HStack justify="between" align="center" gap={2} wrap="wrap">
                    <VStack gap={0} className="rb-grow">
                      <Text weight="semibold">{st.name}</Text>
                      <Text type="supporting" color="secondary">
                        {conn?.accountEmail || 'Sin cuenta conectada'}
                      </Text>
                    </VStack>
                    <StatusTag
                      tone={isConnected ? 'success' : 'neutral'}
                      showDot={isConnected}
                      label={isConnected ? 'Conectado' : 'Sin conectar'}
                    />
                  </HStack>

                  {isConnected && conn ? (
                    <VStack gap={2}>
                      <Selector
                        label="Guardar citas nuevas en:"
                        size="sm"
                        value={conn.destinationCalendarId}
                        onChange={(val) => {
                          if (val) {
                            void onUpdateDestination(st.id, val);
                          }
                        }}
                        options={conn.availableCalendars.map((c) => ({
                          value: c.id,
                          label: c.summary,
                        }))}
                      />
                      <VStack gap={1}>
                        <Text type="label" color="secondary">
                          Revisar si ya está ocupada en:
                        </Text>
                        {conn.availableCalendars.map((cal) => {
                          const checked = conn.conflictCalendarIds.includes(cal.id);
                          return (
                            <CheckboxInput
                              key={cal.id}
                              size="sm"
                              label={cal.summary}
                              value={checked}
                              onChange={(next) => {
                                const ids = next
                                  ? Array.from(new Set([...conn.conflictCalendarIds, cal.id]))
                                  : conn.conflictCalendarIds.filter((i) => i !== cal.id);
                                void onUpdateConflictCalendars(st.id, ids);
                              }}
                            />
                          );
                        })}
                      </VStack>
                    </VStack>
                  ) : null}
                </VStack>

                <Button
                  type="button"
                  label={
                    isConnected
                      ? 'Desconectar calendario'
                      : 'Conectar Google Calendar'
                  }
                  variant={isConnected ? 'secondary' : 'primary'}
                  size="sm"
                  width="100%"
                  isLoading={isBusy}
                  isDisabled={!isConnected && !googleCalendarConfigured && !isDemoMode}
                  onClick={() => {
                    if (isConnected) {
                      setPendingDisconnect(st);
                    } else {
                      void onToggleConnection(st.id, false);
                    }
                  }}
                />
              </VStack>
            );
          })}
        </Grid>
      </VStack>
    </SurfaceCard>

    <ConfirmActionDialog
      isOpen={Boolean(pendingDisconnect)}
      onOpenChange={(open) => {
        if (!open) setPendingDisconnect(null);
      }}
      title={
        pendingDisconnect
          ? `¿Desconectar Google Calendar de ${pendingDisconnect.name}?`
          : '¿Desconectar calendario?'
      }
      description="Dejaremos de sincronizar citas nuevas y revisar conflictos en este calendario hasta que vuelvas a conectarlo."
      confirmLabel="Sí, desconectar"
      variant="destructive"
      isLoading={Boolean(pendingDisconnect && busyCalendarStaffId === pendingDisconnect.id)}
      onConfirm={async () => {
        if (!pendingDisconnect) return;
        const target = pendingDisconnect;
        setPendingDisconnect(null);
        await onToggleConnection(target.id, true);
      }}
    />
    </>
  );
}
