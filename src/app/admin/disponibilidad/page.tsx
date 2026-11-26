'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { VStack } from '@astryxdesign/core/VStack';
import { Text } from '@astryxdesign/core/Text';
import { Selector } from '@astryxdesign/core/Selector';
import { Banner } from '@astryxdesign/core/Banner';
import { Badge } from '@astryxdesign/core/Badge';
import { Divider } from '@astryxdesign/core/Divider';
import { TabList, Tab } from '@astryxdesign/core/TabList';
import { Check } from 'lucide-react';
import {
  FilterPillBar,
  MetricGrid,
  PageHeader,
  PageSkeleton,
  type MetricTileItem,
} from '@/components/ui';
import { useAdminData } from '@/components/admin/AdminProvider';
import { DateOverridesSection } from '@/components/admin/disponibilidad/DateOverridesSection';
import { RecurringBlocksSection } from '@/components/admin/disponibilidad/RecurringBlocksSection';
import { WeeklyScheduleEditor } from '@/components/admin/disponibilidad/WeeklyScheduleEditor';
import { useEphemeralMessage } from '@/lib/hooks/useEphemeralMessage';

const VisualTroubleshooter = dynamic(
  () =>
    import('@/components/admin/disponibilidad/VisualTroubleshooter').then(
      (mod) => mod.VisualTroubleshooter,
    ),
  {
    ssr: false,
    loading: () => (
      <PageSkeleton kpiCount={0} withSplit={false} ariaLabel="Cargando revisión de horarios" />
    ),
  },
);

export default function AdminAvailabilityPage() {
  const { data, loading, refresh } = useAdminData();
  const [tab, setTab] = useState('weekly');
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null);
  const [savingWeekly, setSavingWeekly] = useState(false);
  const [msg, setMsg] = useState<{ status: 'success' | 'error'; text: string } | null>(null);
  const saveNotice = useEphemeralMessage(3200);

  if (loading || !data) {
    return (
      <PageSkeleton
        kpiCount={3}
        withSplit={false}
        ariaLabel="Cargando disponibilidad y horarios"
      />
    );
  }

  const isOwner = data.session.user.role === 'owner';
  const isSpecialistOnly =
    data.session.user.role === 'specialist' && Boolean(data.session.user.staffMemberId);

  const staffId = isSpecialistOnly
    ? (data.session.user.staffMemberId ?? '')
    : (selectedStaffId ?? data.staff[0]?.id ?? '');

  const activeStaffMember = data.staff.find((s) => s.id === staffId) ?? data.staff[0] ?? null;
  const staffName = activeStaffMember?.name ?? 'la manicurista';

  const currentScheduleRules =
    data.schedules.find((s) => s.staffId === staffId)?.rules ?? [];
  const optimizeContinuousSlots = data.settings.optimizeContinuousSlots ?? false;

  const staffOverrides = data.dateOverrides
    .filter((o) => o.staffId === staffId)
    .toSorted((a, b) => a.overrideDate.localeCompare(b.overrideDate));
  const activeOverrides = staffOverrides.filter((o) => o.overrideDate >= data.serverTodayKey);
  const archivedOverrides = staffOverrides
    .filter((o) => o.overrideDate < data.serverTodayKey)
    .toSorted((a, b) => b.overrideDate.localeCompare(a.overrideDate));

  const staffRecurringBlocks = data.recurringBlocks.filter((b) => b.staffId === staffId);
  const activeRecurringCount = staffRecurringBlocks.filter((b) => b.isActive).length;
  const totalBreaksBadge = activeRecurringCount + activeOverrides.length;
  const activeDaysCount = new Set(currentScheduleRules.map((r) => r.dayOfWeek)).size;

  const kpiItems: MetricTileItem[] = [
    {
      id: 'work-days',
      label: 'Días que trabaja',
      value: `${activeDaysCount} de 7`,
      sub: activeStaffMember?.name ?? 'Manicurista',
    },
    {
      id: 'recurring-count',
      label: 'Descansos fijos',
      value: String(activeRecurringCount),
      sub:
        activeRecurringCount === 1
          ? '1 descanso activo'
          : `${activeRecurringCount} descansos activos`,
    },
    {
      id: 'upcoming-overrides',
      label: 'Vacaciones y cierres',
      value: String(activeOverrides.length),
      sub:
        activeOverrides.length === 1
          ? '1 fecha próxima'
          : `${activeOverrides.length} fechas próximas`,
    },
  ];

  const handleSelectStaff = (nextId: string) => {
    setSelectedStaffId(nextId);
    setMsg(null);
  };

  return (
    <VStack className="ad-page" gap={5}>
      <PageHeader
        eyebrow="Agenda del equipo"
        title="Horarios"
        subtitle="Elige los turnos fijos de cada manicurista, sus descansos y días cerrados."
        meta={
          savingWeekly ? (
            <Text className="fx-save-pill" data-state="saving" role="status" aria-live="polite">
              Guardando...
            </Text>
          ) : saveNotice.message ? (
            <Text className="fx-save-pill" data-state="saved" role="status" aria-live="polite">
              <Check size={12} aria-hidden="true" />
              {saveNotice.message}
            </Text>
          ) : undefined
        }
        actions={
          !isSpecialistOnly ? (
            data.staff.length <= 5 ? (
              <FilterPillBar<string>
                ariaLabel="Elegir manicurista"
                mode="pills"
                size="sm"
                isDisabled={savingWeekly}
                value={staffId}
                onChange={handleSelectStaff}
                options={data.staff.map((st, idx) => ({
                  value: st.id,
                  label: st.name,
                  icon: (
                    <Text className="ad-dot" data-idx={String(idx % 4)} aria-hidden="true">
                      {'\u200B'}
                    </Text>
                  ),
                }))}
              />
            ) : (
              <Selector
                label="Manicurista"
                value={staffId}
                isDisabled={savingWeekly}
                onChange={(v) => v && handleSelectStaff(v)}
                options={data.staff.map((s) => ({ value: s.id, label: s.name }))}
              />
            )
          ) : undefined
        }
      />

      <MetricGrid ariaLabel="Resumen de horarios" items={kpiItems} cols={3} />

      {msg ? (
        <Banner
          status={msg.status}
          role={msg.status === 'error' ? 'alert' : 'status'}
          title={msg.text}
          isDismissable
          onDismiss={() => setMsg(null)}
        />
      ) : null}

      <TabList value={tab} onChange={setTab} hasDivider>
        <Tab value="weekly" label="Turnos de la semana" />
        <Tab
          value="breaks"
          label="Descansos y vacaciones"
          endContent={
            totalBreaksBadge > 0 ? (
              <Badge variant="neutral" label={String(totalBreaksBadge)} />
            ) : undefined
          }
        />
        <Tab value="help" label="¿Por qué no sale una hora?" />
      </TabList>

      {tab === 'weekly' ? (
        <WeeklyScheduleEditor
          key={`weekly-${staffId}`}
          staffId={staffId}
          staffName={staffName}
          currentScheduleRules={currentScheduleRules}
          isOwner={isOwner}
          optimizeContinuousSlots={optimizeContinuousSlots}
          saveNoticeMessage={saveNotice.message}
          onRefresh={refresh}
          onSavedNotice={saveNotice.show}
          onMessage={setMsg}
          onSavingStateChange={setSavingWeekly}
        />
      ) : tab === 'breaks' ? (
        <VStack key={`breaks-${staffId}`} gap={5} className="fx-step-in">
          <DateOverridesSection
            key={`overrides-${staffId}`}
            staffId={staffId}
            staffName={staffName}
            allStaff={data.staff}
            serverTodayKey={data.serverTodayKey}
            activeOverrides={activeOverrides}
            archivedOverrides={archivedOverrides}
            onRefresh={refresh}
            onSavedNotice={saveNotice.show}
            onMessage={setMsg}
          />

          <Divider />

          <RecurringBlocksSection
            key={`recurring-${staffId}`}
            staffId={staffId}
            staffName={staffName}
            recurringBlocks={staffRecurringBlocks}
            onRefresh={refresh}
            onSavedNotice={saveNotice.show}
            onMessage={setMsg}
          />
        </VStack>
      ) : (
        <VStack key="tab-help" className="fx-step-in" gap={0}>
          <VisualTroubleshooter
            staffId={staffId}
            staffMembers={data.staff}
            services={data.services}
            isSpecialistOnly={isSpecialistOnly}
            todayKey={data.serverTodayKey}
            timezone={data.settings.timezone}
            onSelectStaff={handleSelectStaff}
          />
        </VStack>
      )}
    </VStack>
  );
}
