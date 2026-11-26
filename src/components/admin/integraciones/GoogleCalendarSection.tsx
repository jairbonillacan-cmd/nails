'use client';

import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Grid } from '@astryxdesign/core/Grid';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput';
import { Selector } from '@astryxdesign/core/Selector';
import { Calendar } from 'lucide-react';
import { StatusTag, SurfaceCard } from '@/components/ui';
import type { CalendarConnection, StaffMember } from '@/lib/types';

interface GoogleCalendarSectionProps {
  staff: StaffMember[];
  calendarConnections: CalendarConnection[];
  busyCalendarStaffId: string | null;
  onUpdateDestination: (staffId: string, destinationCalendarId: string) => Promise<void>;
  onUpdateConflictCalendars: (staffId: string, conflictCalendarIds: string[]) => Promise<void>;
  onToggleConnection: (staffId: string, isConnected: boolean) => Promise<void>;
}

export function GoogleCalendarSection({
  staff,
  calendarConnections,
  busyCalendarStaffId,
  onUpdateDestination,
  onUpdateConflictCalendars,
  onToggleConnection,
}: GoogleCalendarSectionProps) {
  const connectedCount = calendarConnections.filter((c) => c.isConnected).length;

  return (
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
        <Grid columns={{ minWidth: 240, max: 3 }} gap={3}>
          {staff.map((st) => {
            const conn = calendarConnections.find((c) => c.staffId === st.id);
            const isBusy = busyCalendarStaffId === st.id;
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
                      tone={conn?.isConnected ? 'success' : 'neutral'}
                      showDot={Boolean(conn?.isConnected)}
                      label={conn?.isConnected ? 'Conectado' : 'Sin conectar'}
                    />
                  </HStack>

                  {conn?.isConnected ? (
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
                    conn?.isConnected
                      ? 'Desconectar calendario'
                      : 'Conectar Google Calendar'
                  }
                  variant={conn?.isConnected ? 'secondary' : 'primary'}
                  size="sm"
                  width="100%"
                  isLoading={isBusy}
                  onClick={() => void onToggleConnection(st.id, Boolean(conn?.isConnected))}
                />
              </VStack>
            );
          })}
        </Grid>
      </VStack>
    </SurfaceCard>
  );
}
