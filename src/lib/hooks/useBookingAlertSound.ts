'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';

type BrowserNotificationPermission = NotificationPermission | 'unsupported';

interface UseBookingAlertSoundOptions {
  enabled?: boolean;
  eventSeq?: number;
  salonName?: string;
}

type AudioContextCtor = typeof globalThis.AudioContext;

type AudioContextWindow = typeof globalThis & {
  AudioContext?: AudioContextCtor;
  webkitAudioContext?: AudioContextCtor;
};

function getAudioContextConstructor(): AudioContextCtor | null {
  if (typeof window === 'undefined') return null;
  const win = window as AudioContextWindow;
  return win.AudioContext ?? win.webkitAudioContext ?? null;
}

function readNotificationPermission(): BrowserNotificationPermission {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  return window.Notification.permission;
}

function subscribeNoop(): () => void {
  return () => undefined;
}

function getServerPermission(): BrowserNotificationPermission {
  return 'default';
}

export function useBookingAlertSound(options: UseBookingAlertSoundOptions = {}) {
  const { enabled = true, eventSeq = 0, salonName } = options;
  const browserPermission = useSyncExternalStore(
    subscribeNoop,
    readNotificationPermission,
    getServerPermission,
  );
  const [permissionOverride, setPermissionOverride] =
    useState<BrowserNotificationPermission | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const lastSeqRef = useRef<number>(eventSeq);

  const notificationPermission = permissionOverride ?? browserPermission;

  useEffect(() => {
    return () => {
      const ctx = audioCtxRef.current;
      audioCtxRef.current = null;
      if (ctx && ctx.state !== 'closed') {
        void ctx.close().catch(() => undefined);
      }
    };
  }, []);

  const playBookingChime = useCallback(async (): Promise<boolean> => {
    const AudioCtor = getAudioContextConstructor();
    if (!AudioCtor) return false;
    try {
      let ctx = audioCtxRef.current;
      if (!ctx || ctx.state === 'closed') {
        ctx = new AudioCtor();
        audioCtxRef.current = ctx;
      }
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }
      const now = ctx.currentTime;
      const scheduleTone = (
        freq: number,
        startOffset: number,
        duration: number,
        peakGain: number,
        type: OscillatorType,
      ) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, now + startOffset);

        gain.gain.setValueAtTime(0.0001, now + startOffset);
        gain.gain.exponentialRampToValueAtTime(peakGain, now + startOffset + 0.018);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + startOffset + duration);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + startOffset);
        osc.stop(now + startOffset + duration + 0.02);
      };

      scheduleTone(783.99, 0, 0.28, 0.11, 'sine');
      scheduleTone(1046.5, 0.12, 0.44, 0.13, 'sine');
      scheduleTone(1567.98, 0.12, 0.32, 0.025, 'triangle');
      return true;
    } catch {
      return false;
    }
  }, []);

  const requestBrowserNotifications =
    useCallback(async (): Promise<BrowserNotificationPermission> => {
      if (typeof window === 'undefined' || !('Notification' in window)) {
        setPermissionOverride('unsupported');
        return 'unsupported';
      }
      try {
        const current = window.Notification.permission;
        if (current === 'granted') {
          setPermissionOverride('granted');
          return 'granted';
        }
        const permission = await window.Notification.requestPermission();
        setPermissionOverride(permission);
        return permission;
      } catch {
        const fallback = readNotificationPermission();
        setPermissionOverride(fallback);
        return fallback;
      }
    }, []);

  const toggleMute = useCallback(() => {
    setIsMuted((prev) => !prev);
  }, []);

  useEffect(() => {
    if (eventSeq <= lastSeqRef.current) return;
    lastSeqRef.current = eventSeq;
    if (!enabled || isMuted) return;

    void playBookingChime();

    if (
      typeof window !== 'undefined' &&
      'Notification' in window &&
      window.Notification.permission === 'granted' &&
      typeof document !== 'undefined' &&
      document.visibilityState === 'hidden'
    ) {
      try {
        const title = salonName
          ? `${salonName} · Nueva actividad en agenda`
          : 'Nueva actividad en agenda';
        const notice = new window.Notification(title, {
          body: 'Se registró o actualizó una cita en tiempo real.',
        });
        void notice;
      } catch {
        return;
      }
    }
  }, [enabled, eventSeq, isMuted, playBookingChime, salonName]);

  return {
    playBookingChime,
    requestBrowserNotifications,
    notificationPermission,
    isMuted,
    toggleMute,
  };
}
