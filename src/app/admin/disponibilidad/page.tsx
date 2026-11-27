'use client';

import { useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter, useSearchParams } from 'next/navigation';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Selector } from '@astryxdesign/core/Selector';
import { Banner } from '@astryxdesign/core/Banner';
import { Badge } from '@astryxdesign/core/Badge';
import { Divider } from '@astryxdesign/core/Divider';
import { TabList, Tab } from '@astryxdesign/core/TabList';
import { BarChart3, CalendarDays, Check, Users } from 'lucide-react';
import {
  FilterPillBar,
  PageHeader,
  PageSkeleton,
  SkeletonBlock,
} from '@/components/ui';
import { useAdminData } from '@/components/admin/AdminProvider';
import { WeeklyScheduleEditor } from '@/components/admin/disponibilidad/WeeklyScheduleEditor';
import {
  agendaHref,
  equipoHref,
  horariosHref,
  parseHorariosParams,
  reportesHref,
  type HorariosTabParam,
} from '@/lib/admin-links';
import { useEphemeralMessage } from '@/lib/hooks/useEphemeralMessage';
import { useExternalSync } from '@/lib/hooks/useExternalSync';
import { roleCanAccess } from '@/lib/rbac';

type AvailabilityViewTab = 'weekly' | 'breaks' | 'help';

function horariosParamToViewTab(param?: HorariosTabParam): AvailabilityViewTab {
  if (param === 'excepciones' || param === 'bloqueos') return 'breaks';
  if (param === 'diagnostico') return 'help';
  return 'weekly';
}

function viewTabToHorariosParam(tab: AvailabilityViewTab): HorariosTabParam {
  if (tab === 'breaks') return 'bloqueos';
  if (tab === 'help') return 'diagnostico';
  return 'horarios';
}

const DateOverridesSection = dynamic(
  () =>
    import('@/components/admin/disponibilidad/DateOverridesSection').then(
      (mod) => mod.DateOverridesSection,
    ),
  {
    ssr: false,
    loading: () => <SkeletonBlock width="100%" height="16rem" radius={3} />,
  },
);

const RecurringBlocksSection = dynamic(
  () =>
    import('@/components/admin/disponibilidad/RecurringBlocksSection').then(
      (mod) => mod.RecurringBlocksSection,
    ),
  {
    ssr: false,
    loading: () => <SkeletonBlock width="100%" height="14rem" radius={3} />,
  },
);

const VisualTroubleshooter = dynamic(
  () =>
    import('@/components/admin/disponibilidad/VisualTroubleshooter').then(
      (mod) => mod.VisualTroubleshooter,
    ),
  {
    ssr: false,
    loading: () => (
      <PageSkeleton
        kpiCount={0}
        withSplit={false}
        withHeader={false}
        ariaLabel="Cargando revisión de horarios"
      />
    ),
  },
);

export default function AdminAvailabilityPage() {
  const { data, loading, refresh } = useAdminData();
  const router = useRouter();
  const searchParams = useSearchParams();
  const parsedParams = parseHorariosParams(searchParams);

  const [tab, setTab] = useState<AvailabilityViewTab>(() =>
    horariosParamToViewTab(parsedParams.tab),
  );
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(
    () => parsedParams.staff ?? null,
  );
  const [savingWeekly, setSavingWeekly] = useState(false);
  const [msg, setMsg] = useState<{ status: 'success' | 'error'; text: string } | null>(null);
  const saveNotice = useEphemeralMessage(3200);
  const lastUrlSyncKeyRef = useRef('');

  const urlSyncKey = data
    ? `horarios-ready|${parsedParams.staff ?? ''}|${parsedParams.tab ?? ''}|${parsedParams.date ?? ''}|${parsedParams.serviceId ?? ''}`
    : 'horarios-loading';

  useExternalSync(urlSyncKey, async (signal, key) => {
    if (signal.aborted || !key.startsWith('horarios-ready') || !data) return;
    if (lastUrlSyncKeyRef.current === key) return;
    lastUrlSyncKeyRef.current = key;

    const isSpecialist =
      data.session.user.role === 'specialist' && Boolean(data.session.user.staffMemberId);
    if (!isSpecialist && parsedParams.staff) {
      if (data.staff.some((s) => s.id === parsedParams.staff)) {
        setSelectedStaffId(parsedParams.staff);
      }
    }
    if (parsedParams.tab) {
      setTab(horariosParamToViewTab(parsedParams.tab));
    }
  });

  if (loading || !data) {
    return (
      <PageSkeleton
        kpiCount={0}
        withSplit={false}
        ariaLabel="Cargando disponibilidad y horarios"
      />
    );
  }

  const isOwner = data.session.user.role === 'owner';
  const isSpecialistOnly =
    data.session.user.role === 'specialist' && Boolean(data.session.user.staffMemberId);
  const canViewTeam = roleCanAccess(data.session.user.role, 'team');
  const canViewReports = roleCanAccess(data.session.user.role, 'reports');

  const validSelectedStaffId =
    selectedStaffId && data.staff.some((s) => s.id === selectedStaffId)
      ? selectedStaffId
      : null;
  const staffId = isSpecialistOnly
    ? (data.session.user.staffMemberId ?? '')
    : (validSelectedStaffId ?? data.staff[0]?.id ?? '');

  const activeStaffMember = data.staff.find((s) => s.id === staffId) ?? data.staff[0] ?? null;
  const staffName = activeStaffMember?.name ?? 'la profesional';

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

  const syncUrl = (nextStaffId: string, nextTab: AvailabilityViewTab) => {
    const nextHref = horariosHref({
      ...(nextStaffId && !isSpecialistOnly ? { staff: nextStaffId } : {}),
      tab: viewTabToHorariosParam(nextTab),
      ...(nextTab === 'help' && parsedParams.date ? { date: parsedParams.date } : {}),
      ...(nextTab === 'help' && parsedParams.serviceId ? { serviceId: parsedParams.serviceId } : {}),
    });
    router.replace(nextHref, { scroll: false });
  };

  const handleSelectStaff = (nextId: string) => {
    setSelectedStaffId(nextId);
    setMsg(null);
    syncUrl(nextId, tab);
  };

  const handleChangeTab = (nextRaw: string) => {
    const nextTab: AvailabilityViewTab =
      nextRaw === 'breaks' ? 'breaks' : nextRaw === 'help' ? 'help' : 'weekly';
    setTab(nextTab);
    syncUrl(staffId, nextTab);
  };

  return (
    <VStack className="ad-page" gap={5}>
      <PageHeader
        title="Horarios"
        subtitle="Cuándo atiende cada profesional."
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
                ariaLabel="Elegir profesional"
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
                label="Profesional"
                value={staffId}
                isDisabled={savingWeekly}
                onChange={(v) => v && handleSelectStaff(v)}
                options={data.staff.map((s) => ({ value: s.id, label: s.name }))}
              />
            )
          ) : undefined
        }
      />

      {staffId ? (
        <HStack className="ad-toolbar" justify="between" align="center" gap={2} wrap="wrap">
          <Text type="supporting" color="secondary">
            Accesos de {staffName}
          </Text>
          <HStack gap={1.5} align="center" wrap="wrap">
            <Button
              label="Ver su agenda"
              variant="ghost"
              size="sm"
              icon={<CalendarDays size={14} aria-hidden="true" />}
              href={agendaHref({ staff: staffId })}
            />
            {canViewTeam ? (
              <Button
                label="Perfil y comisión"
                variant="ghost"
                size="sm"
                icon={<Users size={14} aria-hidden="true" />}
                href={equipoHref({ staffId })}
              />
            ) : null}
            {canViewReports ? (
              <Button
                label="Ocupación en Reportes"
                variant="ghost"
                size="sm"
                icon={<BarChart3 size={14} aria-hidden="true" />}
                href={reportesHref({ period: '30d', staff: staffId })}
              />
            ) : null}
          </HStack>
        </HStack>
      ) : null}

      {msg ? (
        <Banner
          status={msg.status}
          role={msg.status === 'error' ? 'alert' : 'status'}
          title={msg.text}
          isDismissable
          onDismiss={() => setMsg(null)}
        />
      ) : null}

      <TabList value={tab} onChange={handleChangeTab} hasDivider>
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
        <VStack key={`breaks-${staffId}`} gap={5}>
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
            allStaff={data.staff}
            serverTodayKey={data.serverTodayKey}
            recurringBlocks={staffRecurringBlocks}
            onRefresh={refresh}
            onSavedNotice={saveNotice.show}
            onMessage={setMsg}
          />
        </VStack>
      ) : (
        <VStack key="tab-help" gap={0}>
          <VisualTroubleshooter
            key={`help-${parsedParams.date ?? 'today'}-${parsedParams.serviceId ?? 'default'}`}
            staffId={staffId}
            staffMembers={data.staff}
            services={data.services}
            isSpecialistOnly={isSpecialistOnly}
            todayKey={data.serverTodayKey}
            initialDate={parsedParams.date ?? null}
            initialServiceId={parsedParams.serviceId ?? null}
            timezone={data.settings.timezone}
            onSelectStaff={handleSelectStaff}
          />
        </VStack>
      )}
    </VStack>
  );
}
