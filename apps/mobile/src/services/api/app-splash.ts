import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import { getApiClient, shouldUseMocks } from './client';

const CACHE_KEY = 'miliguan.startupSplash.v1';

export interface StartupSplashConfig {
  enabled: boolean;
  imageUrl: string;
  localImageUri?: string;
  version: string;
  durationMs: number;
}

export const DEFAULT_STARTUP_SPLASH: StartupSplashConfig = {
  enabled: true,
  imageUrl: '',
  localImageUri: '',
  version: 'bundled-default',
  durationMs: 1200,
};

function normalizeConfig(input: Partial<StartupSplashConfig>): StartupSplashConfig {
  const durationMs = Number(input.durationMs ?? DEFAULT_STARTUP_SPLASH.durationMs);
  return {
    enabled: input.enabled !== false,
    imageUrl: String(input.imageUrl ?? ''),
    localImageUri: String(input.localImageUri ?? ''),
    version: String(input.version ?? DEFAULT_STARTUP_SPLASH.version),
    durationMs: Number.isFinite(durationMs)
      ? Math.max(0, Math.min(durationMs, 5000))
      : DEFAULT_STARTUP_SPLASH.durationMs,
  };
}

export async function loadCachedStartupSplash(): Promise<StartupSplashConfig> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (!raw) return DEFAULT_STARTUP_SPLASH;
    return normalizeConfig(JSON.parse(raw));
  } catch {
    return DEFAULT_STARTUP_SPLASH;
  }
}

async function cacheStartupSplash(config: StartupSplashConfig): Promise<void> {
  try {
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(config));
  } catch {
    /* ignore cache quota errors */
  }
}

function splashCacheFile(config: StartupSplashConfig): string | null {
  const baseDir = FileSystem.cacheDirectory || FileSystem.documentDirectory;
  if (!baseDir || !config.imageUrl) return null;
  const version = `${config.version}-${config.imageUrl}`
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(0, 96);
  return `${baseDir}miliguan-startup-splash-${version}.png`;
}

async function downloadStartupSplash(config: StartupSplashConfig): Promise<StartupSplashConfig> {
  const target = splashCacheFile(config);
  if (!target) return { ...config, localImageUri: '' };

  try {
    const existing = await FileSystem.getInfoAsync(target);
    if (!existing.exists) {
      await FileSystem.downloadAsync(config.imageUrl, target);
    }
    return { ...config, localImageUri: target };
  } catch {
    return config;
  }
}

export async function refreshStartupSplash(): Promise<StartupSplashConfig> {
  if (shouldUseMocks()) return DEFAULT_STARTUP_SPLASH;

  const current = await loadCachedStartupSplash();
  try {
    const fresh = normalizeConfig(
      await getApiClient()<Partial<StartupSplashConfig>>('/api/mobile/app-splash'),
    );
    const downloaded = await downloadStartupSplash(fresh);
    await cacheStartupSplash(downloaded);
    return downloaded;
  } catch {
    return current;
  }
}
