'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { BookingWithRelations } from '@/lib/types';

export interface ScheduleDragProposal {
  mode: 'move' | 'resize';
  booking: BookingWithRelations;
  originalDateKey: string;
  originalStaffId: string;
  originalStartMinutes: number;
  originalDurationMinutes: number;
  targetDateKey: string;
  targetStaffId: string;
  targetStartMinutes: number;
  targetDurationMinutes: number;
}

export interface ActiveScheduleDrag {
  mode: 'move' | 'resize';
  bookingId: string;
  targetDateKey: string;
  targetStaffId: string;
  targetStartMinutes: number;
  targetDurationMinutes: number;
  isDragging: boolean;
}

interface StartDragInput {
  mode: 'move' | 'resize';
  booking: BookingWithRelations;
  pointerX: number;
  pointerY: number;
  originDateKey: string;
  originStaffId: string;
  originStartMinutes: number;
  originDurationMinutes: number;
  columnContainer: HTMLElement;
}

interface UseScheduleDragOptions {
  dayStartMinutes: number;
  dayEndMinutes: number;
  snapMinutes?: number;
  minDurationMinutes?: number;
  maxDurationMinutes?: number;
  columnAttribute: 'data-cal-staff' | 'data-cal-date';
  allowCrossColumn: boolean;
  onComplete: (proposal: ScheduleDragProposal) => void;
}

interface CachedColumnRect {
  value: string;
  left: number;
  right: number;
  top: number;
  bottom: number;
}

interface InternalDragSession {
  mode: 'move' | 'resize';
  booking: BookingWithRelations;
  startPointerX: number;
  startPointerY: number;
  originDateKey: string;
  originStaffId: string;
  originStartMinutes: number;
  originDurationMinutes: number;
  columnHeight: number;
  columnTop: number;
  pointerOffsetMinutes: number;
  scrollContainer: HTMLElement | null;
  initialScrollLeft: number;
  initialScrollTop: number;
  initialWindowScrollX: number;
  initialWindowScrollY: number;
  columnRects: CachedColumnRect[];
  hasMoved: boolean;
  targetDateKey: string;
  targetStaffId: string;
  targetStartMinutes: number;
  targetDurationMinutes: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function snapTo(value: number, step: number): number {
  return Math.round(value / step) * step;
}

export function useScheduleDrag({
  dayStartMinutes,
  dayEndMinutes,
  snapMinutes = 15,
  minDurationMinutes = 30,
  maxDurationMinutes = 360,
  columnAttribute,
  allowCrossColumn,
  onComplete,
}: UseScheduleDragOptions) {
  const [activeDrag, setActiveDrag] = useState<ActiveScheduleDrag | null>(null);
  const activeDragRef = useRef<ActiveScheduleDrag | null>(null);
  const sessionRef = useRef<InternalDragSession | null>(null);
  const onCompleteRef = useRef(onComplete);
  const justDraggedRef = useRef(false);

  const totalMinutes = Math.max(60, dayEndMinutes - dayStartMinutes);
  const optionsRef = useRef({
    dayStartMinutes,
    dayEndMinutes,
    snapMinutes,
    minDurationMinutes,
    maxDurationMinutes,
    columnAttribute,
    allowCrossColumn,
    totalMinutes,
  });

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    optionsRef.current = {
      dayStartMinutes,
      dayEndMinutes,
      snapMinutes,
      minDurationMinutes,
      maxDurationMinutes,
      columnAttribute,
      allowCrossColumn,
      totalMinutes,
    };
  }, [
    allowCrossColumn,
    columnAttribute,
    dayEndMinutes,
    dayStartMinutes,
    maxDurationMinutes,
    minDurationMinutes,
    snapMinutes,
    totalMinutes,
  ]);

  const updateActiveDrag = useCallback((next: ActiveScheduleDrag | null) => {
    activeDragRef.current = next;
    setActiveDrag(next);
  }, []);

  const startDrag = useCallback(
    (input: StartDragInput) => {
      const rect = input.columnContainer.getBoundingClientRect();
      if (rect.height <= 0) return;

      const opts = optionsRef.current;
      const pointerMinutes =
        opts.dayStartMinutes + ((input.pointerY - rect.top) / rect.height) * opts.totalMinutes;
      const pointerOffsetMinutes = pointerMinutes - input.originStartMinutes;

      const scrollContainer = input.columnContainer.closest<HTMLElement>('.ad-cal-scroll');
      const columnRects: CachedColumnRect[] = [];
      if (opts.allowCrossColumn) {
        const rowRoot =
          input.columnContainer.closest('.ad-cal-body-row') ??
          input.columnContainer.parentElement ??
          (typeof document !== 'undefined' ? document : null);
        if (rowRoot) {
          const nodes = rowRoot.querySelectorAll<HTMLElement>(`[${opts.columnAttribute}]`);
          for (const el of nodes) {
            const value = el.getAttribute(opts.columnAttribute)?.trim();
            if (!value) continue;
            const colRect = el.getBoundingClientRect();
            columnRects.push({
              value,
              left: colRect.left,
              right: colRect.right,
              top: colRect.top,
              bottom: colRect.bottom,
            });
          }
        }
      }

      sessionRef.current = {
        mode: input.mode,
        booking: input.booking,
        startPointerX: input.pointerX,
        startPointerY: input.pointerY,
        originDateKey: input.originDateKey,
        originStaffId: input.originStaffId,
        originStartMinutes: input.originStartMinutes,
        originDurationMinutes: input.originDurationMinutes,
        columnHeight: rect.height,
        columnTop: rect.top,
        pointerOffsetMinutes,
        scrollContainer,
        initialScrollLeft: scrollContainer?.scrollLeft ?? 0,
        initialScrollTop: scrollContainer?.scrollTop ?? 0,
        initialWindowScrollX: typeof window !== 'undefined' ? window.scrollX : 0,
        initialWindowScrollY: typeof window !== 'undefined' ? window.scrollY : 0,
        columnRects,
        hasMoved: false,
        targetDateKey: input.originDateKey,
        targetStaffId: input.originStaffId,
        targetStartMinutes: input.originStartMinutes,
        targetDurationMinutes: input.originDurationMinutes,
      };
      justDraggedRef.current = false;

      updateActiveDrag({
        mode: input.mode,
        bookingId: input.booking.id,
        targetDateKey: input.originDateKey,
        targetStaffId: input.originStaffId,
        targetStartMinutes: input.originStartMinutes,
        targetDurationMinutes: input.originDurationMinutes,
        isDragging: false,
      });
    },
    [updateActiveDrag],
  );

  const isDragSessionActive = activeDrag !== null;

  useEffect(() => {
    if (!isDragSessionActive) return;

    const handlePointerMove = (event: PointerEvent) => {
      const session = sessionRef.current;
      if (!session) return;

      const opts = optionsRef.current;
      const scrollDeltaX =
        (session.scrollContainer
          ? session.scrollContainer.scrollLeft - session.initialScrollLeft
          : 0) +
        (window.scrollX - session.initialWindowScrollX);
      const scrollDeltaY =
        (session.scrollContainer
          ? session.scrollContainer.scrollTop - session.initialScrollTop
          : 0) +
        (window.scrollY - session.initialWindowScrollY);

      const dx = event.clientX - session.startPointerX;
      const dy = event.clientY - session.startPointerY;
      if (!session.hasMoved && dx * dx + dy * dy < 36) {
        return;
      }
      session.hasMoved = true;

      const alreadyDragging = Boolean(activeDragRef.current?.isDragging);

      if (session.mode === 'move') {
        const pointerMinutes =
          opts.dayStartMinutes +
          ((event.clientY + scrollDeltaY - session.columnTop) / session.columnHeight) *
            opts.totalMinutes;
        const rawStart = pointerMinutes - session.pointerOffsetMinutes;
        const maxStart = opts.dayEndMinutes - session.originDurationMinutes;
        const nextStart = clamp(
          snapTo(rawStart, opts.snapMinutes),
          opts.dayStartMinutes,
          Math.max(opts.dayStartMinutes, maxStart),
        );

        let nextStaffId = session.originStaffId;
        let nextDateKey = session.originDateKey;
        if (opts.allowCrossColumn && session.columnRects.length > 0) {
          const adjustedX = event.clientX + scrollDeltaX;
          for (const col of session.columnRects) {
            if (adjustedX >= col.left && adjustedX <= col.right) {
              if (opts.columnAttribute === 'data-cal-staff') {
                nextStaffId = col.value;
              } else {
                nextDateKey = col.value;
              }
              break;
            }
          }
        }

        if (
          nextStart !== session.targetStartMinutes ||
          nextStaffId !== session.targetStaffId ||
          nextDateKey !== session.targetDateKey ||
          !alreadyDragging
        ) {
          session.targetStartMinutes = nextStart;
          session.targetStaffId = nextStaffId;
          session.targetDateKey = nextDateKey;
          updateActiveDrag({
            mode: 'move',
            bookingId: session.booking.id,
            targetDateKey: nextDateKey,
            targetStaffId: nextStaffId,
            targetStartMinutes: nextStart,
            targetDurationMinutes: session.originDurationMinutes,
            isDragging: true,
          });
        }
      } else {
        const deltaMinutes = ((dy + scrollDeltaY) / session.columnHeight) * opts.totalMinutes;
        const maxAllowed = Math.min(
          opts.maxDurationMinutes,
          opts.dayEndMinutes - session.originStartMinutes,
        );
        const nextDuration = clamp(
          snapTo(session.originDurationMinutes + deltaMinutes, opts.snapMinutes),
          opts.minDurationMinutes,
          Math.max(opts.minDurationMinutes, maxAllowed),
        );

        if (nextDuration !== session.targetDurationMinutes || !alreadyDragging) {
          session.targetDurationMinutes = nextDuration;
          updateActiveDrag({
            mode: 'resize',
            bookingId: session.booking.id,
            targetDateKey: session.originDateKey,
            targetStaffId: session.originStaffId,
            targetStartMinutes: session.originStartMinutes,
            targetDurationMinutes: nextDuration,
            isDragging: true,
          });
        }
      }
    };

    const finishDrag = (cancelled: boolean) => {
      const session = sessionRef.current;
      sessionRef.current = null;
      updateActiveDrag(null);
      if (!session || cancelled || !session.hasMoved) return;

      justDraggedRef.current = true;
      const changed =
        session.targetStartMinutes !== session.originStartMinutes ||
        session.targetStaffId !== session.originStaffId ||
        session.targetDateKey !== session.originDateKey ||
        session.targetDurationMinutes !== session.originDurationMinutes;

      if (changed) {
        onCompleteRef.current({
          mode: session.mode,
          booking: session.booking,
          originalDateKey: session.originDateKey,
          originalStaffId: session.originStaffId,
          originalStartMinutes: session.originStartMinutes,
          originalDurationMinutes: session.originDurationMinutes,
          targetDateKey: session.targetDateKey,
          targetStaffId: session.targetStaffId,
          targetStartMinutes: session.targetStartMinutes,
          targetDurationMinutes: session.targetDurationMinutes,
        });
      }
    };

    const handlePointerUp = () => finishDrag(false);
    const handlePointerCancel = () => finishDrag(true);

    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerCancel);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerCancel);
    };
  }, [isDragSessionActive, updateActiveDrag]);

  const consumeJustDragged = useCallback(() => {
    if (justDraggedRef.current) {
      justDraggedRef.current = false;
      return true;
    }
    return false;
  }, []);

  return {
    activeDrag,
    startDrag,
    consumeJustDragged,
  };
}
