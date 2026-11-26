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
  const sessionRef = useRef<InternalDragSession | null>(null);
  const onCompleteRef = useRef(onComplete);
  const justDraggedRef = useRef(false);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  const totalMinutes = Math.max(60, dayEndMinutes - dayStartMinutes);

  const startDrag = useCallback(
    (input: StartDragInput) => {
      const rect = input.columnContainer.getBoundingClientRect();
      if (rect.height <= 0) return;

      const pointerMinutes =
        dayStartMinutes + ((input.pointerY - rect.top) / rect.height) * totalMinutes;
      const pointerOffsetMinutes = pointerMinutes - input.originStartMinutes;

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
        hasMoved: false,
        targetDateKey: input.originDateKey,
        targetStaffId: input.originStaffId,
        targetStartMinutes: input.originStartMinutes,
        targetDurationMinutes: input.originDurationMinutes,
      };
      justDraggedRef.current = false;

      setActiveDrag({
        mode: input.mode,
        bookingId: input.booking.id,
        targetDateKey: input.originDateKey,
        targetStaffId: input.originStaffId,
        targetStartMinutes: input.originStartMinutes,
        targetDurationMinutes: input.originDurationMinutes,
        isDragging: false,
      });
    },
    [dayStartMinutes, totalMinutes],
  );

  useEffect(() => {
    if (!activeDrag) return;

    const handlePointerMove = (event: PointerEvent) => {
      const session = sessionRef.current;
      if (!session) return;

      const dx = event.clientX - session.startPointerX;
      const dy = event.clientY - session.startPointerY;
      if (!session.hasMoved && dx * dx + dy * dy < 36) {
        return;
      }
      session.hasMoved = true;

      if (session.mode === 'move') {
        const pointerMinutes =
          dayStartMinutes +
          ((event.clientY - session.columnTop) / session.columnHeight) * totalMinutes;
        const rawStart = pointerMinutes - session.pointerOffsetMinutes;
        const maxStart = dayEndMinutes - session.originDurationMinutes;
        const nextStart = clamp(
          snapTo(rawStart, snapMinutes),
          dayStartMinutes,
          Math.max(dayStartMinutes, maxStart),
        );

        let nextStaffId = session.originStaffId;
        let nextDateKey = session.originDateKey;
        if (allowCrossColumn && typeof document !== 'undefined') {
          const hovered = document
            .elementFromPoint(event.clientX, event.clientY)
            ?.closest(`[${columnAttribute}]`);
          const attrValue = hovered?.getAttribute(columnAttribute)?.trim();
          if (attrValue) {
            if (columnAttribute === 'data-cal-staff') {
              nextStaffId = attrValue;
            } else {
              nextDateKey = attrValue;
            }
          }
        }

        if (
          nextStart !== session.targetStartMinutes ||
          nextStaffId !== session.targetStaffId ||
          nextDateKey !== session.targetDateKey ||
          !activeDrag.isDragging
        ) {
          session.targetStartMinutes = nextStart;
          session.targetStaffId = nextStaffId;
          session.targetDateKey = nextDateKey;
          setActiveDrag({
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
        const deltaMinutes = (dy / session.columnHeight) * totalMinutes;
        const maxAllowed = Math.min(
          maxDurationMinutes,
          dayEndMinutes - session.originStartMinutes,
        );
        const nextDuration = clamp(
          snapTo(session.originDurationMinutes + deltaMinutes, snapMinutes),
          minDurationMinutes,
          Math.max(minDurationMinutes, maxAllowed),
        );

        if (nextDuration !== session.targetDurationMinutes || !activeDrag.isDragging) {
          session.targetDurationMinutes = nextDuration;
          setActiveDrag({
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
      setActiveDrag(null);
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
  }, [
    activeDrag,
    allowCrossColumn,
    columnAttribute,
    dayEndMinutes,
    dayStartMinutes,
    maxDurationMinutes,
    minDurationMinutes,
    snapMinutes,
    totalMinutes,
  ]);

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
