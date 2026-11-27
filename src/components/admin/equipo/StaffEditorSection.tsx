'use client';

import { useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Grid } from '@astryxdesign/core/Grid';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Avatar } from '@astryxdesign/core/Avatar';
import { TextInput } from '@astryxdesign/core/TextInput';
import { TextArea } from '@astryxdesign/core/TextArea';
import { NumberInput } from '@astryxdesign/core/NumberInput';
import { Switch } from '@astryxdesign/core/Switch';
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput';
import { Divider } from '@astryxdesign/core/Divider';
import { CalendarDays, Check, Clock, Copy, Pencil, Percent, Save, UserPlus, Users } from 'lucide-react';
import {
  ActionRow,
  CopyableField,
  EmptyStateCard,
  StatusTag,
  SurfaceCard,
} from '@/components/ui';
import { FormDialog } from '@/components/ui/FormDialog';
import { UploadDropzone } from '@/components/ui/UploadDropzone';
import { updateCajaStaffCommission } from '@/components/admin/caja/cajaActions';
import { readFileAsDataUrl, validateClientImageFile } from '@/components/booking/bookingHelpers';
import { staffAvatar } from '@/components/landing/landingContent';
import { agendaHref, cajaHref, horariosHref } from '@/lib/admin-links';
import { useCopyToClipboard } from '@/lib/hooks/useCopyToClipboard';
import { useExternalSync } from '@/lib/hooks/useExternalSync';
import {
  FORM_SUBMIT_OK,
  formSubmitError,
  formSubmitResultFromResponse,
  type FormSubmitResult,
} from '@/lib/forms/form-submit';
import type { Service, StaffMember } from '@/lib/types';

const CommissionRateDialog = dynamic(
  () =>
    import('@/components/admin/caja/CommissionRateDialog').then(
      (mod) => mod.CommissionRateDialog,
    ),
  { ssr: false },
);

interface StaffEditorSectionProps {
  staff: StaffMember[];
  services: Service[];
  appUrl: string;
  currency?: 'MXN' | 'USD';
  defaultCommissionPercent: number;
  retailCommissionPercent?: number;
  canManageCommissions?: boolean;
  busyId: string | null;
  focusStaffId?: string | null;
  onClearFocusStaffId?: () => void;
  onRequestToggleStaffActive: (st: StaffMember, checked: boolean) => void;
  onRefresh: () => Promise<void>;
  onNotice: (message: string) => void;
}

export function StaffEditorSection({
  staff,
  services,
  appUrl,
  currency = 'MXN',
  defaultCommissionPercent,
  retailCommissionPercent = 10,
  canManageCommissions = true,
  busyId,
  focusStaffId = null,
  onClearFocusStaffId,
  onRequestToggleStaffActive,
  onRefresh,
  onNotice,
}: StaffEditorSectionProps) {
  const [editingStaffId, setEditingStaffId] = useState<string | null>(null);
  const [commissionStaffId, setCommissionStaffId] = useState<string | null>(null);
  const [highlightedStaffId, setHighlightedStaffId] = useState<string | null>(focusStaffId);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [sName, setSName] = useState('');
  const [sRoleTitle, setSRoleTitle] = useState('Nail Artist');
  const [sBio, setSBio] = useState('');
  const [sCommission, setSCommission] = useState(defaultCommissionPercent || 35);
  const [sServiceIds, setSServiceIds] = useState<string[] | null>(null);
  const [sAvatarUrl, setSAvatarUrl] = useState<string | null>(null);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [sPosition, setSPosition] = useState<number | null>(null);
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);
  const clipboard = useCopyToClipboard(2400);
  const lastFocusedStaffKeyRef = useRef('');

  const allServiceIds = services.map((s) => s.id);
  const orderedStaff = staff.toSorted((a, b) => a.displayOrder - b.displayOrder);
  const effectiveServiceIds = sServiceIds ?? allServiceIds;
  const baseOrigin = (
    appUrl.trim() ||
    (typeof window !== 'undefined' ? window.location.origin : 'https://laikona.nails')
  ).replace(/\/+$/, '');
  const editingStaff = editingStaffId
    ? (staff.find((item) => item.id === editingStaffId) ?? null)
    : null;
  const editingCommissionStaff = commissionStaffId
    ? (staff.find((item) => item.id === commissionStaffId) ?? null)
    : null;

  const handleSaveCommissionRate = async (
    staffMember: StaffMember,
    nextPercent: number,
  ): Promise<FormSubmitResult> => {
    const result = await updateCajaStaffCommission(staffMember, nextPercent);
    if (!result.ok) {
      return formSubmitError(result.error ?? 'No se pudo actualizar la comisión.');
    }
    await onRefresh();
    onNotice(
      result.message ?? `Comisión de ${staffMember.name} actualizada a ${nextPercent}%`,
    );
    return FORM_SUBMIT_OK;
  };

  const focusSyncKey =
    focusStaffId && orderedStaff.length > 0
      ? `equipo-focus|${focusStaffId}`
      : 'equipo-focus-idle';

  useExternalSync(focusSyncKey, async (signal, key) => {
    if (signal.aborted || !key.startsWith('equipo-focus|') || !focusStaffId) return;
    if (lastFocusedStaffKeyRef.current === key) return;
    lastFocusedStaffKeyRef.current = key;
    const match = orderedStaff.find((item) => item.id === focusStaffId);
    if (!match) return;
    setHighlightedStaffId(match.id);
    setIsEditorOpen(true);
    setEditingStaffId(match.id);
    setSName(match.name);
    setSRoleTitle(match.roleTitle);
    setSBio(match.bio);
    setSCommission(match.commissionPercent);
    setSServiceIds(match.serviceIds.length > 0 ? [...match.serviceIds] : [...allServiceIds]);
    setSAvatarUrl(match.avatarUrl);
    setAvatarError(null);
    setSPosition(orderedStaff.findIndex((item) => item.id === match.id) + 1);
  });

  const startEditingStaff = (st: StaffMember) => {
    setHighlightedStaffId(st.id);
    setIsEditorOpen(true);
    setEditingStaffId(st.id);
    setSName(st.name);
    setSRoleTitle(st.roleTitle);
    setSBio(st.bio);
    setSCommission(st.commissionPercent);
    setSServiceIds(st.serviceIds.length > 0 ? [...st.serviceIds] : [...allServiceIds]);
    setSAvatarUrl(st.avatarUrl);
    setAvatarError(null);
    setSPosition(orderedStaff.findIndex((item) => item.id === st.id) + 1);
  };

  const resetStaffForm = () => {
    setIsEditorOpen(false);
    setEditingStaffId(null);
    setSName('');
    setSRoleTitle('Nail Artist');
    setSBio('');
    setSCommission(defaultCommissionPercent || 35);
    setSServiceIds(null);
    setSAvatarUrl(null);
    setAvatarError(null);
    setSPosition(null);
    lastFocusedStaffKeyRef.current = '';
    onClearFocusStaffId?.();
  };

  const applyStaffOrder = async (savedId: string, position: number): Promise<boolean> => {
    const saved = orderedStaff.find((item) => item.id === savedId);
    if (!saved) return false;
    const rest = orderedStaff.filter((item) => item.id !== savedId);
    const next = [...rest.slice(0, position - 1), saved, ...rest.slice(position - 1)];
    for (const [index, item] of next.entries()) {
      if (item.displayOrder === index) continue;
      const res = await fetch('/api/admin/team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'staff', data: { id: item.id, name: item.name, displayOrder: index } }),
      });
      if (!res.ok) return false;
    }
    return true;
  };

  const handleAvatarFile = async (file: File | null) => {
    if (!file) return;
    setAvatarError(null);
    const err = await validateClientImageFile(file);
    if (err) {
      setAvatarError(err);
      return;
    }
    try {
      setSAvatarUrl(await readFileAsDataUrl(file));
    } catch {
      setAvatarError('No se pudo leer esa foto. Intenta con otra.');
    }
  };

  const toggleStaffService = (serviceId: string, checked: boolean) => {
    setSServiceIds((prev) => {
      const base = prev ?? allServiceIds;
      return checked ? Array.from(new Set([...base, serviceId])) : base.filter((id) => id !== serviceId);
    });
  };

  const saveStaff = async (): Promise<FormSubmitResult> => {
    if (services.length > 0 && effectiveServiceIds.length === 0) {
      return formSubmitError('Elige al menos un servicio que haga.');
    }
    const existing = editingStaffId ? staff.find((item) => item.id === editingStaffId) : null;
    try {
      const res = await fetch('/api/admin/team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'staff',
          data: {
            ...(existing
              ? { id: existing.id, isActive: existing.isActive }
              : { displayOrder: orderedStaff.length }),
            name: sName.trim(),
            roleTitle: sRoleTitle.trim() || 'Nail Artist',
            bio: sBio.trim(),
            avatarUrl: sAvatarUrl,
            commissionPercent: sCommission,
            serviceIds: effectiveServiceIds.length > 0 ? effectiveServiceIds : allServiceIds,
          },
        }),
      });
      if (!res.ok) return formSubmitResultFromResponse(res, 'No se pudo guardar a la profesional.');
      const currentPosition = existing
        ? orderedStaff.findIndex((item) => item.id === existing.id) + 1
        : null;
      if (existing && sPosition !== null && sPosition !== currentPosition) {
        const reordered = await applyStaffOrder(existing.id, sPosition);
        if (!reordered) {
          await onRefresh();
          return formSubmitError('Se guardaron los cambios, pero no se pudo cambiar su lugar en tu página.');
        }
      }
      await onRefresh();
      onNotice(existing ? 'Cambios guardados' : 'Profesional agregada');
      return FORM_SUBMIT_OK;
    } catch {
      return formSubmitError('Sin conexión. No se pudo guardar a la profesional.');
    }
  };

  const handleCopyStaffLink = async (slug: string, name: string) => {
    const url = `${baseOrigin}/reservar?staff=${slug}`;
    setCopiedSlug(slug);
    await clipboard.copy(
      url,
      `Link directo de ${name} copiado.`,
      `Copia manualmente /reservar?staff=${slug}`,
    );
  };

  return (
    <VStack gap={4}>
      <Text type="supporting" color="secondary" role="status" aria-live="polite" className="rb-sr-only">
        {clipboard.feedback ?? ''}
      </Text>

      <SurfaceCard
        id="team-staff-heading"
        title="Profesionales del salón"
        subtitle="Cada una tiene su link propio de citas y porcentaje de comisión."
        count={staff.length}
        actions={
          <Button
            type="button"
            label="Agregar"
            variant="secondary"
            size="sm"
            icon={<UserPlus size={14} aria-hidden="true" />}
            onClick={() => {
              resetStaffForm();
              setIsEditorOpen(true);
            }}
          />
        }
      >
        {staff.length === 0 ? (
          <VStack className="ad-empty" gap={2}>
            <EmptyStateCard
              framed={false}
              isCompact
              icon={<Users size={22} aria-hidden="true" />}
              title="Aún no hay profesionales"
              description="Agrega a tu primera profesional para abrir horarios y recibir citas."
            />
          </VStack>
        ) : (
          <VStack as="ul" className="ad-row-list" gap={0}>
            {orderedStaff.map((st, idx) => {
              const isEditingThis = editingStaffId === st.id;
              const isCopied = copiedSlug === st.bookingSlug && clipboard.copied;
              const isRowBusy = busyId === st.id;
              return (
                <li key={st.id} className={isRowBusy ? 'fx-busy' : undefined} aria-busy={isRowBusy || undefined}>
                  <ActionRow
                    leading={<Avatar name={st.name} src={staffAvatar(st.avatarUrl, idx)} size="md" />}
                    title={
                      <HStack gap={1.5} align="center" wrap="wrap">
                        <Text weight="semibold">{st.name}</Text>
                        <StatusTag tone="neutral" label={`${st.commissionPercent}% comisión`} hasTabularNumbers />
                        <StatusTag tone="neutral" label={`${st.serviceIds.length} servicios`} hasTabularNumbers />
                      </HStack>
                    }
                    subtitle={`${st.roleTitle.trim() || 'Nail Artist'}${st.bio.trim() ? ` · ${st.bio.trim()}` : ''}`}
                    isSelected={isEditingThis || highlightedStaffId === st.id}
                    isMuted={!st.isActive}
                    onClick={() => startEditingStaff(st)}
                    actions={
                      <HStack gap={1.5} align="center" wrap="wrap">
                        <Button
                          label="Agenda"
                          variant="ghost"
                          size="sm"
                          icon={<CalendarDays size={13} aria-hidden="true" />}
                          href={agendaHref({ staff: st.id })}
                        />
                        <Button
                          label="Horarios"
                          variant="ghost"
                          size="sm"
                          icon={<Clock size={13} aria-hidden="true" />}
                          href={horariosHref({ staff: st.id })}
                        />
                        <Button
                          label="Comisiones"
                          variant="ghost"
                          size="sm"
                          icon={<Percent size={13} aria-hidden="true" />}
                          href={cajaHref({ tab: 'comisiones', staff: st.id })}
                        />
                        {canManageCommissions ? (
                          <Button
                            type="button"
                            label="Editar %"
                            variant="ghost"
                            size="sm"
                            icon={<Pencil size={13} aria-hidden="true" />}
                            onClick={() => setCommissionStaffId(st.id)}
                          />
                        ) : null}
                        <Button
                          type="button"
                          label={isCopied ? 'Link copiado' : 'Copiar link'}
                          variant={isCopied ? 'primary' : 'secondary'}
                          size="sm"
                          icon={isCopied ? <Check size={13} aria-hidden="true" className="fx-pop" /> : <Copy size={13} aria-hidden="true" />}
                          onClick={() => void handleCopyStaffLink(st.bookingSlug, st.name)}
                        />
                        <Switch
                          label={`Activa ${st.name}`}
                          isLabelHidden
                          size="sm"
                          value={st.isActive}
                          isLoading={isRowBusy}
                          isDisabled={Boolean(busyId) && !isRowBusy}
                          onChange={(checked) => onRequestToggleStaffActive(st, checked)}
                        />
                      </HStack>
                    }
                  />
                </li>
              );
            })}
          </VStack>
        )}
      </SurfaceCard>

      <FormDialog
        isOpen={isEditorOpen}
        onOpenChange={(open) => {
          if (!open) resetStaffForm();
        }}
        title={editingStaffId ? `Editar a ${editingStaff?.name ?? 'profesional'}` : 'Agregar profesional'}
        subtitle="Perfil, comisión, foto y servicios que atiende."
        width="min(38rem, 96vw)"
        submitFooter={{
          formId: 'staff-editor-form',
          submitLabel: editingStaffId ? 'Guardar cambios' : 'Agregar',
          submitIcon: editingStaffId ? (
            <Save size={15} aria-hidden="true" />
          ) : (
            <UserPlus size={15} aria-hidden="true" />
          ),
          isSubmitDisabled: sName.trim().length < 2,
        }}
      >
        {(controls) => (
          <form
            id="staff-editor-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (sName.trim().length < 2) return;
              controls.submit(saveStaff);
            }}
          >
            <VStack gap={4}>
              {editingStaff ? (
                <VStack gap={2}>
                  <CopyableField
                    label="Link directo de citas"
                    value={`${baseOrigin}/reservar?staff=${editingStaff.bookingSlug}`}
                    displayValue={`/reservar?staff=${editingStaff.bookingSlug}`}
                    copyLabel="Copiar link"
                    copiedLabel="Link copiado"
                    feedbackMessage={`Link directo de ${editingStaff.name} copiado.`}
                    monospace
                  />
                  <HStack gap={1.5} align="center" wrap="wrap">
                    <Button
                      label="Agenda"
                      variant="secondary"
                      size="sm"
                      icon={<CalendarDays size={14} aria-hidden="true" />}
                      href={agendaHref({ staff: editingStaff.id })}
                    />
                    <Button
                      label="Horarios"
                      variant="secondary"
                      size="sm"
                      icon={<Clock size={14} aria-hidden="true" />}
                      href={horariosHref({ staff: editingStaff.id })}
                    />
                    <Button
                      label="Comisiones"
                      variant="secondary"
                      size="sm"
                      icon={<Percent size={14} aria-hidden="true" />}
                      href={cajaHref({ tab: 'comisiones', staff: editingStaff.id })}
                    />
                  </HStack>
                </VStack>
              ) : null}

              <VStack gap={3}>
                <Text type="label" weight="semibold" color="secondary">
                  Datos principales
                </Text>
                <Grid columns={{ minWidth: 200, max: 2 }} gap={3}>
                  <TextInput
                    label="Nombre"
                    placeholder="Ejemplo: Fernanda Ruiz"
                    value={sName}
                    onChange={setSName}
                    isRequired
                  />
                  <TextInput
                    label="Puesto"
                    placeholder="Ejemplo: Nail Artist"
                    value={sRoleTitle}
                    onChange={setSRoleTitle}
                  />
                </Grid>

                {sPosition !== null && orderedStaff.length > 1 ? (
                  <Grid columns={{ minWidth: 200, max: 2 }} gap={3}>
                    <NumberInput
                      label="Comisión (%)"
                      description="Lo que gana de cada servicio."
                      value={sCommission}
                      min={0}
                      max={100}
                      isIntegerOnly
                      onChange={setSCommission}
                    />
                    <NumberInput
                      label="Lugar en tu página"
                      description="1 aparece como destacada."
                      value={sPosition}
                      min={1}
                      max={orderedStaff.length}
                      isIntegerOnly
                      onChange={(v) =>
                        setSPosition(Math.min(orderedStaff.length, Math.max(1, Math.round(v))))
                      }
                    />
                  </Grid>
                ) : (
                  <NumberInput
                    label="Comisión (%)"
                    description="Lo que gana de cada servicio."
                    value={sCommission}
                    min={0}
                    max={100}
                    isIntegerOnly
                    onChange={setSCommission}
                  />
                )}

                <TextArea
                  label="Presentación"
                  description="Se ve en tu página pública de citas."
                  placeholder="Ejemplo: Especialista en softgel, rubber y nail art minimalista."
                  value={sBio}
                  onChange={setSBio}
                  rows={2}
                  isOptional
                />
              </VStack>

              <Divider />

              <UploadDropzone
                label="Foto de perfil"
                helperText={
                  sAvatarUrl
                    ? 'Aparece en tu página y al elegir profesional.'
                    : 'Sin foto se usa una imagen de la marca. Una foto real genera más confianza.'
                }
                previewUrl={sAvatarUrl}
                previewAlt={sName ? `Foto de ${sName}` : 'Foto de la profesional'}
                placeholder="Elige una foto de su rostro o de su trabajo"
                readyLabel="Foto lista"
                replaceLabel="Cambiar foto"
                clearLabel="Quitar foto"
                error={avatarError}
                isOptional
                onSelectFile={(file) => void handleAvatarFile(file)}
                onClear={() => setSAvatarUrl(null)}
              />

              {services.length > 0 ? (
                <>
                  <Divider />
                  <VStack gap={2}>
                    <HStack justify="between" align="center" gap={2} wrap="wrap">
                      <HStack gap={2} align="center">
                        <Text type="label" weight="semibold" color="secondary">
                          Servicios que realiza
                        </Text>
                        <StatusTag
                          tone={effectiveServiceIds.length === 0 ? 'warning' : 'neutral'}
                          label={`${effectiveServiceIds.length} de ${services.length}`}
                          hasTabularNumbers
                        />
                      </HStack>
                      {services.length > 1 ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          label={
                            effectiveServiceIds.length === services.length
                              ? 'Quitar todos'
                              : 'Seleccionar todos'
                          }
                          onClick={() =>
                            setSServiceIds(
                              effectiveServiceIds.length === services.length
                                ? []
                                : [...allServiceIds],
                            )
                          }
                        />
                      ) : null}
                    </HStack>
                    <VStack className="ad-subpanel" gap={0}>
                      <Grid columns={{ minWidth: 190, max: 2 }} gap={2}>
                        {services.map((srv) => (
                          <CheckboxInput
                            key={srv.id}
                            size="sm"
                            label={srv.name}
                            value={effectiveServiceIds.includes(srv.id)}
                            onChange={(checked) => toggleStaffService(srv.id, checked)}
                          />
                        ))}
                      </Grid>
                    </VStack>
                  </VStack>
                </>
              ) : null}
            </VStack>
          </form>
        )}
      </FormDialog>

      {editingCommissionStaff ? (
        <CommissionRateDialog
          key={`${editingCommissionStaff.id}-${editingCommissionStaff.commissionPercent}`}
          staffMember={editingCommissionStaff}
          staffRow={null}
          retailCommissionPercent={retailCommissionPercent}
          periodLabel="Perfil de equipo"
          currency={currency}
          onOpenChange={(open) => {
            if (!open) setCommissionStaffId(null);
          }}
          onSaveCommission={handleSaveCommissionRate}
        />
      ) : null}
    </VStack>
  );
}
