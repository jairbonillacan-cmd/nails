'use client';

import { useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Grid } from '@astryxdesign/core/Grid';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Avatar } from '@astryxdesign/core/Avatar';
import { TextInput } from '@astryxdesign/core/TextInput';
import { NumberInput } from '@astryxdesign/core/NumberInput';
import { Switch } from '@astryxdesign/core/Switch';
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput';
import { Divider } from '@astryxdesign/core/Divider';
import { Collapsible } from '@astryxdesign/core/Collapsible';
import { Check, Copy, Save, UserPlus, Users } from 'lucide-react';
import {
  ActionRow,
  CopyableField,
  EmptyStateCard,
  StatusTag,
  SurfaceCard,
} from '@/components/ui';
import { FormDialog } from '@/components/ui/FormDialog';
import { UploadDropzone } from '@/components/ui/UploadDropzone';
import { readFileAsDataUrl, validateClientImageFile } from '@/components/booking/bookingHelpers';
import { staffAvatar } from '@/components/landing/landingContent';
import { useCopyToClipboard } from '@/lib/hooks/useCopyToClipboard';
import {
  FORM_SUBMIT_OK,
  formSubmitError,
  formSubmitResultFromResponse,
  type FormSubmitResult,
} from '@/lib/forms/form-submit';
import type { Service, StaffMember } from '@/lib/types';

interface StaffEditorSectionProps {
  staff: StaffMember[];
  services: Service[];
  appUrl: string;
  defaultCommissionPercent: number;
  busyId: string | null;
  onRequestToggleStaffActive: (st: StaffMember, checked: boolean) => void;
  onRefresh: () => Promise<void>;
  onNotice: (message: string) => void;
}

export function StaffEditorSection({
  staff,
  services,
  appUrl,
  defaultCommissionPercent,
  busyId,
  onRequestToggleStaffActive,
  onRefresh,
  onNotice,
}: StaffEditorSectionProps) {
  const [editingStaffId, setEditingStaffId] = useState<string | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [sName, setSName] = useState('');
  const [sRoleTitle, setSRoleTitle] = useState('Nail Artist');
  const [sBio, setSBio] = useState('');
  const [sCommission, setSCommission] = useState(defaultCommissionPercent || 35);
  const [sServiceIds, setSServiceIds] = useState<string[] | null>(null);
  const [sAvatarUrl, setSAvatarUrl] = useState<string | null>(null);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);
  const clipboard = useCopyToClipboard(2400);

  const allServiceIds = services.map((s) => s.id);
  const effectiveServiceIds = sServiceIds ?? allServiceIds;
  const baseOrigin = (
    appUrl.trim() ||
    (typeof window !== 'undefined' ? window.location.origin : 'https://laikona.nails')
  ).replace(/\/+$/, '');
  const editingStaff = editingStaffId
    ? (staff.find((item) => item.id === editingStaffId) ?? null)
    : null;

  const startEditingStaff = (st: StaffMember) => {
    setIsEditorOpen(true);
    setEditingStaffId(st.id);
    setSName(st.name);
    setSRoleTitle(st.roleTitle);
    setSBio(st.bio);
    setSCommission(st.commissionPercent);
    setSServiceIds(st.serviceIds.length > 0 ? [...st.serviceIds] : [...allServiceIds]);
    setSAvatarUrl(st.avatarUrl);
    setAvatarError(null);
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
            ...(existing ? { id: existing.id, isActive: existing.isActive } : {}),
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
            {staff.map((st, idx) => {
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
                    isSelected={isEditingThis}
                    isMuted={!st.isActive}
                    onClick={() => startEditingStaff(st)}
                    actions={
                      <HStack gap={2} align="center" wrap="wrap">
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
        subtitle="Nombre, comisión y los servicios que hace."
        width="min(34rem, 96vw)"
      >
        {(controls) => (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (sName.trim().length < 2) return;
            controls.submit(saveStaff);
          }}
        >
          <VStack gap={3}>
            {editingStaff ? (
              <CopyableField
                label={`Link directo de ${editingStaff.name}`}
                value={`${baseOrigin}/reservar?staff=${editingStaff.bookingSlug}`}
                displayValue={`/reservar?staff=${editingStaff.bookingSlug}`}
                copyLabel="Copiar link"
                copiedLabel="Link copiado"
                feedbackMessage={`Link directo de ${editingStaff.name} copiado.`}
                monospace
              />
            ) : null}

            <TextInput label="Nombre" placeholder="Ejemplo: Fernanda Ruiz" value={sName} onChange={setSName} isRequired />
            <Grid columns={{ minWidth: 140, max: 2 }} gap={3}>
              <TextInput label="Puesto" placeholder="Ejemplo: Nail Artist" value={sRoleTitle} onChange={setSRoleTitle} />
              <NumberInput
                label="Comisión (%)"
                description="Lo que gana de cada servicio."
                value={sCommission}
                min={0}
                max={100}
                isIntegerOnly
                onChange={setSCommission}
              />
            </Grid>
            <TextInput
              label="Presentación"
              description="Se ve en tu página de citas."
              placeholder="Opcional"
              value={sBio}
              onChange={setSBio}
              isOptional
            />

            <UploadDropzone
              label="Foto"
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
                <Collapsible
                  className="ad-disclosure"
                  defaultIsOpen={Boolean(editingStaffId)}
                  trigger={
                    <HStack gap={2} align="center">
                      <Text weight="semibold" size="sm">Servicios que realiza</Text>
                      <StatusTag tone="neutral" label={`${effectiveServiceIds.length} de ${services.length}`} hasTabularNumbers />
                    </HStack>
                  }
                >
                  <VStack paddingBlockStart={2}>
                    <Grid columns={{ minWidth: 150, max: 2 }} gap={1.5}>
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
                </Collapsible>
              </>
            ) : null}

            <HStack gap={2} justify="end" wrap="wrap">
              <Button
                type="button"
                label="Cancelar"
                variant="secondary"
                isDisabled={controls.isSubmitting}
                onClick={controls.close}
              />
              <Button
                type="submit"
                label={editingStaffId ? 'Guardar cambios' : 'Agregar'}
                variant="primary"
                icon={editingStaffId ? <Save size={15} aria-hidden="true" /> : <UserPlus size={15} aria-hidden="true" />}
                isLoading={controls.isSubmitting}
                isDisabled={sName.trim().length < 2 || controls.isSubmitting}
              />
            </HStack>
          </VStack>
        </form>
        )}
      </FormDialog>
    </VStack>
  );
}
