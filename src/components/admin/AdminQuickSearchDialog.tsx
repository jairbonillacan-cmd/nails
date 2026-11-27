'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { Layout, LayoutContent, LayoutFooter } from '@astryxdesign/core/Layout';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { TextInput } from '@astryxdesign/core/TextInput';
import { List, ListItem } from '@astryxdesign/core/List';
import { Text } from '@astryxdesign/core/Text';
import { Calendar, CalendarDays, Search, Sparkles, Tag, Users } from 'lucide-react';
import { agendaHref, clientasHref } from '@/lib/admin-links';
import {
  formatCurrency,
  formatDateShortInTimezone,
  formatDuration,
  formatPhoneDisplay,
  formatTimeInTimezone,
} from '@/lib/format';
import { useQuickSearchKeyboardNav } from '@/lib/hooks/useAdminCache';
import { roleCanAccess } from '@/lib/rbac';
import { EmptyStateCard } from '@/components/ui/EmptyStateCard';
import { BookingStatusTag } from '@/components/ui/StatusTag';
import type { AdminOverviewPayload } from './AdminProvider';
import { buildQuickSearchResults } from './adminSearchIndex';

interface AdminQuickSearchDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  data: AdminOverviewPayload;
}

export function AdminQuickSearchDialog({
  isOpen,
  onOpenChange,
  data,
}: AdminQuickSearchDialogProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const tz = data.settings.timezone || 'America/Mexico_City';
  const currency = data.settings.currency;
  const canViewClients = roleCanAccess(data.session.user.role, 'clients');
  const serviceTargetHref = roleCanAccess(data.session.user.role, 'services')
    ? '/admin/servicios'
    : agendaHref({ new: true });

  const {
    dateJumps,
    matchedBookings,
    matchedClients,
    matchedServices,
    matchedNav,
    flatOptions,
  } = useMemo(() => buildQuickSearchResults(data, query), [data, query]);

  const safeActiveIndex =
    flatOptions.length === 0 ? -1 : Math.min(activeIndex, flatOptions.length - 1);
  const activeOption = safeActiveIndex >= 0 ? flatOptions[safeActiveIndex] : undefined;

  const handleClose = useCallback(() => {
    onOpenChange(false);
    setQuery('');
    setActiveIndex(0);
  }, [onOpenChange]);

  const handleNavigate = useCallback(
    (href: string) => {
      handleClose();
      router.push(href);
    },
    [handleClose, router],
  );

  const handleQueryChange = (nextQuery: string) => {
    setQuery(nextQuery);
    setActiveIndex(0);
  };

  const scrollOptionIntoView = useCallback((optionId: string | undefined) => {
    if (!optionId || typeof document === 'undefined') return;
    document.getElementById(optionId)?.scrollIntoView({ block: 'nearest' });
  }, []);

  const handleMove = useCallback(
    (delta: -1 | 1 | 'first' | 'last') => {
      if (flatOptions.length === 0) return;
      const nextIndex =
        delta === 'first'
          ? 0
          : delta === 'last'
            ? flatOptions.length - 1
            : delta === 1
              ? (safeActiveIndex + 1) % flatOptions.length
              : safeActiveIndex <= 0
                ? flatOptions.length - 1
                : safeActiveIndex - 1;
      setActiveIndex(nextIndex);
      scrollOptionIntoView(flatOptions[nextIndex]?.optionId);
    },
    [flatOptions, safeActiveIndex, scrollOptionIntoView],
  );

  const handleSelectActive = useCallback(() => {
    if (activeOption) {
      handleNavigate(activeOption.href);
    }
  }, [activeOption, handleNavigate]);

  useQuickSearchKeyboardNav({
    isOpen,
    itemCount: flatOptions.length,
    inputRef,
    onMove: handleMove,
    onSelectActive: handleSelectActive,
    onClose: handleClose,
  });

  const hasResults = flatOptions.length > 0;
  const bookingsOffset = dateJumps.length;
  const clientsOffset = bookingsOffset + matchedBookings.length;
  const servicesOffset = clientsOffset + matchedClients.length;
  const navOffset = servicesOffset + matchedServices.length;

  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={(open) => {
        onOpenChange(open);
        if (!open) {
          setQuery('');
          setActiveIndex(0);
        }
      }}
      width={560}
      maxHeight="min(86dvh, calc(100dvh - 2rem))"
      padding={5}
    >
      <Layout
        header={
          <DialogHeader
            title="Búsqueda y comandos"
            subtitle="Escribe un nombre, un teléfono o una fecha como «mañana» o «15 dic»."
            hasDivider
            onOpenChange={onOpenChange}
          />
        }
        content={
          <LayoutContent>
            <VStack gap={4}>
              <TextInput
                ref={inputRef}
                label="Buscar en el panel"
                isLabelHidden
                placeholder={
                  canViewClients
                    ? 'Clienta, teléfono, servicio, código NL-…, fecha (mañana, 15 dic) o sección…'
                    : 'Cita, servicio, código NL-…, fecha (mañana, 15 dic) o sección…'
                }
                value={query}
                onChange={handleQueryChange}
                role="combobox"
                aria-expanded={hasResults}
                aria-controls="ad-search-results"
                aria-autocomplete="list"
                aria-activedescendant={activeOption?.optionId}
                startIcon={<Search size={16} aria-hidden="true" />}
                hasClear
                hasAutoFocus
              />

              {!hasResults ? (
                <VStack role="status">
                  <EmptyStateCard
                    framed={false}
                    isCompact
                    title="Sin coincidencias"
                    description={
                      canViewClients
                        ? `No encontramos resultados para «${query}». Prueba con una clienta, servicio, teléfono, fecha (ejemplo: viernes o 15 dic) o sección.`
                        : `No encontramos resultados para «${query}». Prueba con una cita, servicio, fecha (ejemplo: viernes o 15 dic) o sección.`
                    }
                  />
                </VStack>
              ) : (
                <VStack
                  id="ad-search-results"
                  role="listbox"
                  aria-label="Resultados de búsqueda"
                  gap={3}
                >
                  {dateJumps.length > 0 ? (
                    <VStack className="ad-surface" gap={0}>
                      <HStack gap={1.5} align="center" justify="between" className="ad-section-head">
                        <HStack gap={1.5} align="center">
                          <Calendar size={14} aria-hidden="true" />
                          <Text type="label" color="secondary" weight="semibold">
                            Ir a fecha en Agenda
                          </Text>
                        </HStack>
                        <Text type="supporting" color="secondary" hasTabularNumbers>
                          {dateJumps.length}
                        </Text>
                      </HStack>
                      <List hasDividers density="compact" role="presentation">
                        {dateJumps.map((jump, idx) => {
                          const isActive = safeActiveIndex === idx;
                          const optionId = `ad-search-opt-${jump.id}`;
                          return (
                            <ListItem
                              key={jump.id}
                              id={optionId}
                              role="option"
                              aria-selected={isActive}
                              isSelected={isActive}
                              className="ad-search-item"
                              data-active={isActive ? 'true' : 'false'}
                              label={jump.label}
                              description={
                                <Text type="supporting" color="secondary" hasTabularNumbers>
                                  {jump.description}
                                </Text>
                              }
                              onMouseEnter={() => setActiveIndex(idx)}
                              onClick={() => handleNavigate(jump.href)}
                            />
                          );
                        })}
                      </List>
                    </VStack>
                  ) : null}

                  {matchedBookings.length > 0 ? (
                    <VStack className="ad-surface" gap={0}>
                      <HStack gap={1.5} align="center" justify="between" className="ad-section-head">
                        <HStack gap={1.5} align="center">
                          <CalendarDays size={14} aria-hidden="true" />
                          <Text type="label" color="secondary" weight="semibold">
                            Citas
                          </Text>
                        </HStack>
                        <Text type="supporting" color="secondary" hasTabularNumbers>
                          {matchedBookings.length}
                        </Text>
                      </HStack>
                      <List hasDividers density="compact" role="presentation">
                        {matchedBookings.map((b, idx) => {
                          const flatIdx = bookingsOffset + idx;
                          const isActive = safeActiveIndex === flatIdx;
                          const optionId = `ad-search-opt-booking-${b.id}`;
                          return (
                            <ListItem
                              key={b.id}
                              id={optionId}
                              role="option"
                              aria-selected={isActive}
                              isSelected={isActive}
                              className="ad-search-item"
                              data-active={isActive ? 'true' : 'false'}
                              label={`${b.client.fullName} — ${b.service.name}`}
                              description={
                                <Text type="supporting" color="secondary" hasTabularNumbers>
                                  {b.bookingCode} · {formatDateShortInTimezone(b.startAt, tz)} ·{' '}
                                  {formatTimeInTimezone(b.startAt, tz)} · {b.staff.name}
                                </Text>
                              }
                              endContent={
                                <BookingStatusTag
                                  status={b.status}
                                  hasPaymentProof={Boolean(b.paymentProofUrl)}
                                />
                              }
                              onMouseEnter={() => setActiveIndex(flatIdx)}
                              onClick={() =>
                                handleNavigate(agendaHref({ q: b.bookingCode }))
                              }
                            />
                          );
                        })}
                      </List>
                    </VStack>
                  ) : null}

                  {matchedClients.length > 0 ? (
                    <VStack className="ad-surface" gap={0}>
                      <HStack gap={1.5} align="center" justify="between" className="ad-section-head">
                        <HStack gap={1.5} align="center">
                          <Users size={14} aria-hidden="true" />
                          <Text type="label" color="secondary" weight="semibold">
                            Clientas
                          </Text>
                        </HStack>
                        <Text type="supporting" color="secondary" hasTabularNumbers>
                          {matchedClients.length}
                        </Text>
                      </HStack>
                      <List hasDividers density="compact" role="presentation">
                        {matchedClients.map((c, idx) => {
                          const flatIdx = clientsOffset + idx;
                          const isActive = safeActiveIndex === flatIdx;
                          const optionId = `ad-search-opt-client-${c.id}`;
                          return (
                            <ListItem
                              key={c.id}
                              id={optionId}
                              role="option"
                              aria-selected={isActive}
                              isSelected={isActive}
                              className="ad-search-item"
                              data-active={isActive ? 'true' : 'false'}
                              label={c.fullName}
                              description={
                                <Text type="supporting" color="secondary" hasTabularNumbers>
                                  {formatPhoneDisplay(c.phoneE164)}
                                  {c.instagramHandle ? ` · ${c.instagramHandle}` : ''}
                                </Text>
                              }
                              onMouseEnter={() => setActiveIndex(flatIdx)}
                              onClick={() =>
                                handleNavigate(clientasHref({ q: c.phoneE164 }))
                              }
                            />
                          );
                        })}
                      </List>
                    </VStack>
                  ) : null}

                  {matchedServices.length > 0 ? (
                    <VStack className="ad-surface" gap={0}>
                      <HStack gap={1.5} align="center" justify="between" className="ad-section-head">
                        <HStack gap={1.5} align="center">
                          <Tag size={14} aria-hidden="true" />
                          <Text type="label" color="secondary" weight="semibold">
                            Servicios
                          </Text>
                        </HStack>
                        <Text type="supporting" color="secondary" hasTabularNumbers>
                          {matchedServices.length}
                        </Text>
                      </HStack>
                      <List hasDividers density="compact" role="presentation">
                        {matchedServices.map((s, idx) => {
                          const flatIdx = servicesOffset + idx;
                          const isActive = safeActiveIndex === flatIdx;
                          const optionId = `ad-search-opt-service-${s.id}`;
                          return (
                            <ListItem
                              key={s.id}
                              id={optionId}
                              role="option"
                              aria-selected={isActive}
                              isSelected={isActive}
                              className="ad-search-item"
                              data-active={isActive ? 'true' : 'false'}
                              label={s.name}
                              description={
                                <Text type="supporting" color="secondary" hasTabularNumbers>
                                  {formatCurrency(s.priceCents, currency)} ·{' '}
                                  {formatDuration(s.durationMinutes)}
                                </Text>
                              }
                              onMouseEnter={() => setActiveIndex(flatIdx)}
                              onClick={() => handleNavigate(serviceTargetHref)}
                            />
                          );
                        })}
                      </List>
                    </VStack>
                  ) : null}

                  {matchedNav.length > 0 ? (
                    <VStack className="ad-surface" gap={0}>
                      <HStack gap={1.5} align="center" className="ad-section-head">
                        <Sparkles size={14} aria-hidden="true" />
                        <Text type="label" color="secondary" weight="semibold">
                          Acciones y secciones
                        </Text>
                      </HStack>
                      <List hasDividers density="compact" role="presentation">
                        {matchedNav.map((item, idx) => {
                          const flatIdx = navOffset + idx;
                          const isActive = safeActiveIndex === flatIdx;
                          const optionId = `ad-search-opt-nav-${idx}`;
                          return (
                            <ListItem
                              key={item.href}
                              id={optionId}
                              role="option"
                              aria-selected={isActive}
                              isSelected={isActive}
                              className="ad-search-item"
                              data-active={isActive ? 'true' : 'false'}
                              label={item.label}
                              description={
                                <Text type="supporting" color="secondary">
                                  {item.description}
                                </Text>
                              }
                              onMouseEnter={() => setActiveIndex(flatIdx)}
                              onClick={() => handleNavigate(item.href)}
                            />
                          );
                        })}
                      </List>
                    </VStack>
                  ) : null}
                </VStack>
              )}
            </VStack>
          </LayoutContent>
        }
        footer={
          <LayoutFooter hasDivider>
            <HStack justify="between" align="center" gap={2} wrap="wrap">
              <HStack gap={2} align="center" wrap="wrap">
                <HStack gap={1} align="center">
                  <kbd className="ad-kbd">↑ ↓</kbd>
                  <Text type="supporting" color="secondary">
                    mover
                  </Text>
                </HStack>
                <HStack gap={1} align="center">
                  <kbd className="ad-kbd">Enter</kbd>
                  <Text type="supporting" color="secondary">
                    abrir
                  </Text>
                </HStack>
                <HStack gap={1} align="center">
                  <kbd className="ad-kbd">N</kbd>
                  <Text type="supporting" color="secondary">
                    nueva cita
                  </Text>
                </HStack>
                <HStack gap={1} align="center">
                  <kbd className="ad-kbd">G A</kbd>
                  <Text type="supporting" color="secondary">
                    agenda
                  </Text>
                </HStack>
              </HStack>
              <HStack gap={1.5} align="center">
                <kbd className="ad-kbd">Esc</kbd>
                <Text type="supporting" color="secondary">
                  salir
                </Text>
              </HStack>
            </HStack>
          </LayoutFooter>
        }
      />
    </Dialog>
  );
}
