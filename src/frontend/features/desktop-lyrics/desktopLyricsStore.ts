import { create } from 'zustand';
import {
    createEmptyDesktopLyricsSnapshot,
    type DesktopLyricsSnapshot,
    type DesktopLyricsStatePayload,
    type DesktopLyricsWindowState,
} from '@/common/contracts/desktop-lyrics';

export type DesktopLyricsStylePreset = 'frosted' | 'outline' | 'amber';
export type DesktopLyricsFontSize = 'sm' | 'md' | 'lg';
export type DesktopLyricsOpacity = 'low' | 'medium' | 'high';

export interface DesktopLyricsPreferences {
    preset: DesktopLyricsStylePreset;
    fontSize: DesktopLyricsFontSize;
    opacity: DesktopLyricsOpacity;
    showTranslation: boolean;
}

const PREFS_STORAGE_KEY = 'cuminlang.desktopLyricsPrefs';

const DEFAULT_PREFS: DesktopLyricsPreferences = {
    preset: 'frosted',
    fontSize: 'md',
    opacity: 'medium',
    showTranslation: true,
};

const VALID_PRESETS = new Set<DesktopLyricsStylePreset>(['frosted', 'outline', 'amber']);
const VALID_SIZES = new Set<DesktopLyricsFontSize>(['sm', 'md', 'lg']);
const VALID_OPACITIES = new Set<DesktopLyricsOpacity>(['low', 'medium', 'high']);

const loadPrefs = (): DesktopLyricsPreferences => {
    if (typeof window === 'undefined') {
        return DEFAULT_PREFS;
    }
    try {
        const raw = window.localStorage.getItem(PREFS_STORAGE_KEY);
        if (!raw) return DEFAULT_PREFS;
        const parsed = JSON.parse(raw) as Partial<DesktopLyricsPreferences>;
        return {
            preset: parsed.preset && VALID_PRESETS.has(parsed.preset) ? parsed.preset : DEFAULT_PREFS.preset,
            fontSize: parsed.fontSize && VALID_SIZES.has(parsed.fontSize) ? parsed.fontSize : DEFAULT_PREFS.fontSize,
            opacity: parsed.opacity && VALID_OPACITIES.has(parsed.opacity) ? parsed.opacity : DEFAULT_PREFS.opacity,
            showTranslation: typeof parsed.showTranslation === 'boolean' ? parsed.showTranslation : DEFAULT_PREFS.showTranslation,
        };
    } catch {
        return DEFAULT_PREFS;
    }
};

const persistPrefs = (prefs: DesktopLyricsPreferences): void => {
    if (typeof window === 'undefined') return;
    try {
        window.localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify(prefs));
    } catch {
        // 隐私模式或存储受限场景下保留内存态样式即可
    }
};

interface DesktopLyricsStoreState {
    open: boolean;
    locked: boolean;
    snapshot: DesktopLyricsSnapshot;
    prefs: DesktopLyricsPreferences;
    applyPayload: (payload: DesktopLyricsStatePayload) => void;
    applyWindowState: (state: DesktopLyricsWindowState) => void;
    updatePrefs: (patch: Partial<DesktopLyricsPreferences>) => void;
}

export const useDesktopLyricsStore = create<DesktopLyricsStoreState>((set) => ({
    open: false,
    locked: false,
    snapshot: createEmptyDesktopLyricsSnapshot(),
    prefs: loadPrefs(),

    applyPayload: (payload) => {
        set({
            open: payload.windowState.open,
            locked: payload.windowState.locked,
            snapshot: payload.snapshot,
        });
    },

    applyWindowState: (windowState) => {
        set({
            open: windowState.open,
            locked: windowState.locked,
        });
    },

    updatePrefs: (patch) => {
        set((state) => {
            const next = { ...state.prefs, ...patch };
            persistPrefs(next);
            return { prefs: next };
        });
    },
}));
