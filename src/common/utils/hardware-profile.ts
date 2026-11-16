import type { SystemInfo } from '@/common/contracts/system-info';
import type { TranscriptionEngine } from '@/common/contracts/transcription-engine';

/**
 * 本机引导方案预设档位：
 * - `standard`: ≥ 8GB 内存默认推荐，离线开箱即用（ASR + TTS + WordNet + 文本 Embedding）
 * - `light`: < 8GB 内存或空间受限推荐，最小核心体验（ASR + TTS + WordNet）
 */
export type OnboardingTier = 'standard' | 'light';

/** 本机硬件能力评估结果，前后端共用单一事实来源。 */
export interface HardwareProfileAdvice {
    /** 当前平台是否支持 whisper.cpp 硬件加速运行时。 */
    whisperCppSupported: boolean;
    /** 推荐的字幕识别引擎（仅当平台支持 whisper.cpp 且有 GPU 时推 whisper-cpp）。 */
    recommendedTranscriptionEngine: TranscriptionEngine;
    /** 引导页推荐方案档位。 */
    recommendedOnboardingTier: OnboardingTier;
    /** 当内存或算力偏紧时，提示优先接入云端 AI 模型获得更快响应。 */
    preferCloudLlm: boolean;
}

/**
 * 判定指定平台/架构是否随包携带 whisper.cpp (`parakeet-cli`) 运行时。
 * 与 `scripts/download.mjs` 中的 `supportedArchs` 保持完全一致。
 */
export function isWhisperCppSupportedPlatform(platform: string, arch: string): boolean {
    if (platform === 'darwin') {
        return arch === 'arm64' || arch === 'x64';
    }
    if (platform === 'linux' || platform === 'win32') {
        return arch === 'x64';
    }
    return false;
}

/**
 * 根据本机硬件信息计算最优引擎与引导档位建议。
 */
export function evaluateHardwareProfile(hardware: SystemInfo | null | undefined): HardwareProfileAdvice {
    if (!hardware) {
        return {
            whisperCppSupported: true,
            recommendedTranscriptionEngine: 'whisper-cpp',
            recommendedOnboardingTier: 'standard',
            preferCloudLlm: false,
        };
    }

    const whisperCppSupported = hardware.whisperCppSupported ?? (
        hardware.platform && hardware.arch
            ? isWhisperCppSupportedPlatform(hardware.platform, hardware.arch)
            : true
    );
    const hasGpu = hardware.gpuAcceleration !== 'none';
    const recommendedTranscriptionEngine: TranscriptionEngine = whisperCppSupported && hasGpu
        ? 'whisper-cpp'
        : 'sherpa-onnx';

    const mem = hardware.totalMemoryGb;
    const recommendedOnboardingTier: OnboardingTier = mem >= 8 ? 'standard' : 'light';
    const preferCloudLlm = mem < 8;

    return {
        whisperCppSupported,
        recommendedTranscriptionEngine,
        recommendedOnboardingTier,
        preferCloudLlm,
    };
}

/**
 * 判断本机硬件是否能够流畅稳定运行本地部署的外部 AI 模型而不牺牲体验。
 */
export function isHardwareSuitableForLocalAi(hardware: SystemInfo | null | undefined): boolean {
    if (!hardware) return false;
    return hardware.totalMemoryGb >= 8 && (hardware.gpuAcceleration !== 'none' || hardware.totalMemoryGb >= 12);
}
