'use client';

import { useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Grid } from '@astryxdesign/core/Grid';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { TextInput } from '@astryxdesign/core/TextInput';
import { TextArea } from '@astryxdesign/core/TextArea';
import { Selector } from '@astryxdesign/core/Selector';
import { Banner } from '@astryxdesign/core/Banner';
import { Divider } from '@astryxdesign/core/Divider';
import {
  HelpCircle,
  Images,
  Plus,
  RotateCcw,
  Trash2,
  Upload,
} from 'lucide-react';
import {
  ConfirmActionDialog,
  EmptyStateCard,
  StatusTag,
  SurfaceCard,
} from '@/components/ui';
import { UploadDropzone } from '@/components/ui/UploadDropzone';
import {
  formatFileSize,
  prepareClientImageFile,
  readFileAsDataUrl,
} from '@/components/booking/bookingHelpers';
import { fetchJsonWithTimeout } from '@/lib/http/client-fetch';
import { resolveLandingContent } from '@/lib/landing-config';
import { buildSalonFaqs } from '@/lib/seo/structured-data';
import type {
  GalleryItem,
  LandingContent,
  LandingFaqItem,
  SalonSettings,
  Service,
} from '@/lib/types';

interface LandingGalleryFaqSectionProps {
  draft: SalonSettings;
  gallery: GalleryItem[];
  activeServices: Service[];
  onUpdateDraft: (patch: Partial<SalonSettings>) => void;
  onRefresh: () => Promise<void>;
  onNotify: (message: string) => void;
}

const GALLERY_CATEGORY_OPTIONS = [
  { value: 'Acrílico escultural', label: 'Acrílico escultural' },
  { value: 'Softgel', label: 'Softgel' },
  { value: 'Rubber', label: 'Rubber' },
  { value: 'Gel semipermanente', label: 'Gel semipermanente' },
  { value: 'Nail art 3D', label: 'Nail art 3D' },
  { value: 'PediSpa', label: 'PediSpa' },
];

export function LandingGalleryFaqSection({
  draft,
  gallery,
  activeServices,
  onUpdateDraft,
  onRefresh,
  onNotify,
}: LandingGalleryFaqSectionProps) {
  const resolved = resolveLandingContent(draft);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('Acrílico escultural');
  const [serviceId, setServiceId] = useState<string>('');
  const [caption, setCaption] = useState('');
  const [previewDataUrl, setPreviewDataUrl] = useState<string | null>(null);
  const [fileMeta, setFileMeta] = useState<{ name: string; size: string } | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteItem, setConfirmDeleteItem] = useState<GalleryItem | null>(null);

  const patchLanding = (patch: Partial<LandingContent>) => {
    onUpdateDraft({
      landingContent: {
        ...draft.landingContent,
        ...patch,
      },
    });
  };

  const handleGalleryFile = async (file: File | null) => {
    if (!file) return;
    setUploadError(null);
    const prepared = await prepareClientImageFile(file);
    if (prepared.error) {
      setUploadError(prepared.error);
      return;
    }
    try {
      const dataUrl = await readFileAsDataUrl(prepared.file);
      setPreviewDataUrl(dataUrl);
      setFileMeta({ name: prepared.file.name, size: formatFileSize(prepared.file.size) });
    } catch {
      setUploadError('No se pudo leer esa foto. Intenta de nuevo.');
    }
  };

  const handleUploadGalleryItem = async () => {
    if (!previewDataUrl) {
      setUploadError('Elige primero una foto de tu set.');
      return;
    }
    const cleanTitle = title.trim();
    if (!cleanTitle) {
      setUploadError('Ponle un nombre corto al diseño (ejemplo: French perlado).');
      return;
    }
    setUploading(true);
    setUploadError(null);
    try {
      const result = await fetchJsonWithTimeout('/api/admin/brand', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: cleanTitle,
          caption: caption.trim(),
          category,
          imageUrl: previewDataUrl,
          serviceId: serviceId || null,
          isFeatured: true,
        }),
      });
      if (!result.ok) {
        setUploadError(result.error || 'No se pudo subir la foto.');
        return;
      }
      setTitle('');
      setCaption('');
      setServiceId('');
      setPreviewDataUrl(null);
      setFileMeta(null);
      await onRefresh();
      onNotify('Foto agregada a tu galería');
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteGalleryItem = async (id: string) => {
    setDeletingId(id);
    setUploadError(null);
    try {
      const result = await fetchJsonWithTimeout(`/api/admin/brand?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      if (!result.ok) {
        setUploadError(result.error || 'No se pudo eliminar esa foto.');
        return;
      }
      await onRefresh();
      onNotify('Foto eliminada');
    } finally {
      setDeletingId(null);
    }
  };

  const customFaqs = draft.landingContent.customFaqs ?? [];
  const serviceOptions = [
    { value: '', label: 'Ningún servicio específico' },
    ...activeServices.map((srv) => ({ value: srv.id, label: srv.name })),
  ];

  const loadSuggestedFaqs = () => {
    const generated = buildSalonFaqs({
      ...draft,
      landingContent: { ...draft.landingContent, customFaqs: [] },
    });
    const editable: LandingFaqItem[] = generated.map((item) => ({
      id: item.id,
      question: item.question,
      answer: item.answer,
    }));
    patchLanding({ customFaqs: editable });
  };

  const updateFaq = (index: number, patch: Partial<LandingFaqItem>) => {
    const next = customFaqs.map((item, idx) =>
      idx === index ? { ...item, ...patch } : item,
    );
    patchLanding({ customFaqs: next });
  };

  const addEmptyFaq = () => {
    const next: LandingFaqItem = {
      id: `faq-${Date.now()}`,
      question: '',
      answer: '',
    };
    patchLanding({ customFaqs: [...customFaqs, next] });
  };

  return (
    <VStack gap={4}>
      <SurfaceCard
        id="landing-gallery-heading"
        icon={<Images size={16} aria-hidden="true" />}
        title="Galería de creaciones"
        subtitle="Sube fotos de tus sets recientes. Se publican de inmediato en el carrusel de tu portada."
        badge={
          <StatusTag
            tone={gallery.length > 0 ? 'accent' : 'neutral'}
            label={gallery.length === 1 ? '1 foto propia' : `${gallery.length} fotos propias`}
          />
        }
      >
        <VStack gap={4} className="ad-card-body" paddingBlockStart={4}>
          <Selector
            label="Qué fotos mostrar en tu portada"
            value={resolved.galleryMode}
            onChange={(v) => {
              if (v === 'mix' || v === 'custom_only') {
                patchLanding({ galleryMode: v });
              }
            }}
            options={[
              {
                value: 'mix',
                label: 'Mis fotos primero + galería base del estudio',
              },
              {
                value: 'custom_only',
                label: 'Mostrar solo las fotos que suba aquí',
              },
            ]}
          />

          <VStack gap={3} className="ad-subpanel">
            <Text weight="semibold" size="sm">
              Subir nueva foto de set
            </Text>

            {uploadError ? (
              <Banner
                status="error"
                role="alert"
                title={uploadError}
                isDismissable
                onDismiss={() => setUploadError(null)}
              />
            ) : null}

            <UploadDropzone
              label="Foto del set"
              previewUrl={previewDataUrl}
              previewAlt={title || 'Vista previa del set'}
              fileName={fileMeta?.name ?? null}
              fileSizeLabel={fileMeta?.size ?? null}
              placeholder="Elige o arrastra la foto del diseño"
              readyLabel="Foto lista para publicar"
              replaceLabel="Cambiar foto"
              clearLabel="Quitar"
              isDisabled={uploading}
              onSelectFile={(file) => void handleGalleryFile(file)}
              onClear={() => {
                setPreviewDataUrl(null);
                setFileMeta(null);
              }}
            />

            <Grid columns={{ minWidth: 160, max: 2 }} gap={3}>
              <TextInput
                label="Nombre del diseño"
                placeholder="Ejemplo: French cherry con perlas"
                value={title}
                onChange={setTitle}
                isDisabled={uploading}
              />
              <Selector
                label="Técnica o estilo"
                value={category}
                onChange={setCategory}
                options={GALLERY_CATEGORY_OPTIONS}
                isDisabled={uploading}
              />
            </Grid>

            <Grid columns={{ minWidth: 160, max: 2 }} gap={3}>
              <Selector
                label="Servicio sugerido al tocar"
                value={serviceId}
                onChange={setServiceId}
                options={serviceOptions}
                isDisabled={uploading}
              />
              <TextInput
                label="Nota breve (opcional)"
                placeholder="Ejemplo: Largo M en punta almendra"
                value={caption}
                onChange={setCaption}
                isOptional
                isDisabled={uploading}
              />
            </Grid>

            <HStack justify="end">
              <Button
                type="button"
                label={uploading ? 'Subiendo foto…' : 'Publicar en galería'}
                variant="primary"
                size="sm"
                icon={<Upload size={14} aria-hidden="true" />}
                isLoading={uploading}
                isDisabled={uploading || !previewDataUrl}
                onClick={() => void handleUploadGalleryItem()}
              />
            </HStack>
          </VStack>

          <Divider />

          {gallery.length === 0 ? (
            <EmptyStateCard
              icon={<Images size={18} aria-hidden="true" />}
              title="Aún no subes fotos propias"
              description="Mientras subes tus primeros sets, tu portada muestra las fotos editoriales base de LAIKONA."
            />
          ) : (
            <VStack className="ad-gallery-grid" role="list" aria-label="Fotos publicadas">
              {gallery.map((item) => {
                const linkedService = activeServices.find((srv) => srv.id === item.serviceId);
                return (
                  <VStack
                    key={item.id}
                    className="ad-gallery-card"
                    role="listitem"
                    gap={2}
                  >
                    <VStack className="ad-gallery-thumb">
                      <img
                        src={item.imageUrl}
                        alt={item.title}
                        className="ad-gallery-thumb-img"
                        loading="lazy"
                      />
                    </VStack>
                    <VStack gap={0.5} paddingInline={3} paddingBlockEnd={3}>
                      <Text weight="semibold" size="sm">
                        {item.title}
                      </Text>
                      <Text type="supporting" color="secondary">
                        {item.category}
                        {linkedService ? ` · ${linkedService.name}` : ''}
                      </Text>
                      <HStack justify="end" paddingBlockStart={1}>
                        <Button
                          type="button"
                          label={deletingId === item.id ? 'Quitando…' : 'Quitar'}
                          variant="ghost"
                          size="sm"
                          icon={<Trash2 size={14} aria-hidden="true" />}
                          isDisabled={deletingId === item.id}
                          onClick={() => setConfirmDeleteItem(item)}
                        />
                      </HStack>
                    </VStack>
                  </VStack>
                );
              })}
            </VStack>
          )}
        </VStack>
      </SurfaceCard>

      <SurfaceCard
        id="landing-faq-heading"
        icon={<HelpCircle size={16} aria-hidden="true" />}
        title="Preguntas frecuentes"
        subtitle="Responde las dudas más comunes antes de que te escriban por DM."
        badge={
          <StatusTag
            tone={customFaqs.length > 0 ? 'accent' : 'neutral'}
            label={customFaqs.length > 0 ? `${customFaqs.length} editadas` : 'Automáticas'}
          />
        }
      >
        <VStack gap={4} className="ad-card-body" paddingBlockStart={4}>
          <Grid columns={{ minWidth: 160, max: 2 }} gap={3}>
            <TextInput
              label="Título de la sección"
              placeholder="Preguntas frecuentes"
              value={draft.landingContent.faqTitle ?? ''}
              onChange={(v) => patchLanding({ faqTitle: v })}
              isOptional
            />
            <TextInput
              label="Subtítulo"
              placeholder="Anticipos, reagendado, retoques y todo lo que necesitas saber…"
              value={draft.landingContent.faqSubtitle ?? ''}
              onChange={(v) => patchLanding({ faqSubtitle: v })}
              isOptional
            />
          </Grid>

          {customFaqs.length === 0 ? (
            <HStack
              className="ad-subpanel"
              justify="between"
              align="center"
              gap={3}
              wrap="wrap"
            >
              <VStack gap={0.5}>
                <Text size="sm" weight="medium">
                  6 preguntas automáticas activas
                </Text>
                <Text type="supporting" color="secondary">
                  Se llenan solas con tu anticipo, dirección y horas de cancelación. Si quieres cambiar el texto o agregar más, tócalas aquí.
                </Text>
              </VStack>
              <Button
                type="button"
                label="Editar preguntas"
                variant="secondary"
                size="sm"
                onClick={loadSuggestedFaqs}
              />
            </HStack>
          ) : (
            <VStack gap={3}>
              {customFaqs.map((faq, idx) => (
                <VStack key={faq.id} className="ad-subpanel" gap={2}>
                  <HStack justify="between" align="center" gap={2}>
                    <Text type="label" color="secondary" weight="semibold">
                      Pregunta {idx + 1}
                    </Text>
                    <Button
                      type="button"
                      label="Quitar"
                      variant="ghost"
                      size="sm"
                      icon={<Trash2 size={14} aria-hidden="true" />}
                      onClick={() =>
                        patchLanding({
                          customFaqs: customFaqs.filter((_, i) => i !== idx),
                        })
                      }
                    />
                  </HStack>
                  <TextInput
                    label={`Pregunta ${idx + 1}`}
                    isLabelHidden
                    placeholder="Ejemplo: ¿Atienden con diseño que yo traiga?"
                    value={faq.question}
                    onChange={(v) => updateFaq(idx, { question: v })}
                  />
                  <TextArea
                    label={`Respuesta ${idx + 1}`}
                    isLabelHidden
                    placeholder="Escribe una respuesta clara y amable…"
                    value={faq.answer}
                    onChange={(v) => updateFaq(idx, { answer: v })}
                    rows={2}
                  />
                </VStack>
              ))}

              <HStack justify="between" align="center" gap={2} wrap="wrap">
                <Button
                  type="button"
                  label="Agregar pregunta"
                  variant="secondary"
                  size="sm"
                  icon={<Plus size={14} aria-hidden="true" />}
                  isDisabled={customFaqs.length >= 12}
                  onClick={addEmptyFaq}
                />
                <Button
                  type="button"
                  label="Volver a automáticas"
                  variant="ghost"
                  size="sm"
                  icon={<RotateCcw size={14} aria-hidden="true" />}
                  onClick={() => patchLanding({ customFaqs: [] })}
                />
              </HStack>
            </VStack>
          )}
        </VStack>
      </SurfaceCard>

      {confirmDeleteItem ? (
        <ConfirmActionDialog
          isOpen
          onOpenChange={(open) => {
            if (!open && !deletingId) setConfirmDeleteItem(null);
          }}
          title={`¿Quitar "${confirmDeleteItem.title}" de tu galería?`}
          description="Dejará de aparecer en el carrusel de tu portada pública."
          confirmLabel="Sí, quitar foto"
          cancelLabel="Volver"
          variant="destructive"
          isLoading={deletingId === confirmDeleteItem.id}
          onConfirm={async () => {
            const targetId = confirmDeleteItem.id;
            await handleDeleteGalleryItem(targetId);
            setConfirmDeleteItem(null);
          }}
        />
      ) : null}
    </VStack>
  );
}
