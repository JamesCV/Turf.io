import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';

const native = Capacitor.isNativePlatform();
let enabled = true;

export function setHapticsEnabled(on: boolean): void {
  enabled = on;
}

export const haptic = {
  light(): void {
    if (!enabled) return;
    if (native) void Haptics.impact({ style: ImpactStyle.Light });
  },
  medium(): void {
    if (!enabled) return;
    if (native) void Haptics.impact({ style: ImpactStyle.Medium });
  },
  heavy(): void {
    if (!enabled) return;
    if (native) void Haptics.impact({ style: ImpactStyle.Heavy });
  },
  success(): void {
    if (!enabled) return;
    if (native) void Haptics.notification({ type: NotificationType.Success });
  },
  error(): void {
    if (!enabled) return;
    if (native) void Haptics.notification({ type: NotificationType.Error });
  },
};
