import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';

/** Key-value persistence: native Preferences on iOS (survives WebView purges), localStorage on web. */
const native = Capacitor.isNativePlatform();

export async function loadJSON<T>(key: string): Promise<T | null> {
  try {
    const raw = native ? (await Preferences.get({ key })).value : localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export async function saveJSON(key: string, value: unknown): Promise<void> {
  try {
    const raw = JSON.stringify(value);
    if (native) await Preferences.set({ key, value: raw });
    else localStorage.setItem(key, raw);
  } catch {
    // Storage full or blocked: progress stays in memory for this session.
  }
}
