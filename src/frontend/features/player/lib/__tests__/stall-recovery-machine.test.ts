import { describe, expect, it } from 'vitest';
import {
    beginStallRemount,
    consumeStallRecovery,
    INITIAL_STALL_RECOVERY_STATE,
    reconcileRecoveryOnSeek,
} from '@/frontend/features/player/lib/stall-recovery-machine';

describe('stall-recovery-machine 卡顿恢复与 seek 协调状态机', () => {
    it('recoveryKey 变化引起同一 seekToken 重跑时不得误清重挂载目标', () => {
        const seekToken = { time: 42, requestId: 7 };
        const remounting = beginStallRemount(43.25, seekToken);

        const afterSameSeek = reconcileRecoveryOnSeek(remounting, seekToken);
        expect(afterSameSeek).toEqual(remounting);

        const { targetTime, nextState } = consumeStallRecovery(afterSameSeek);
        expect(targetTime).toBe(43.25);
        expect(nextState).toEqual(INITIAL_STALL_RECOVERY_STATE);
    });

    it('重建尚未完成时遇到新一轮 seekToken，立即作废旧恢复目标', () => {
        const initialToken = { time: 42, requestId: 7 };
        const userSeekToken = { time: 100, requestId: 8 };
        const remounting = beginStallRemount(43.25, initialToken);

        const afterUserSeek = reconcileRecoveryOnSeek(remounting, userSeekToken);
        expect(afterUserSeek).toEqual(INITIAL_STALL_RECOVERY_STATE);
        expect(consumeStallRecovery(afterUserSeek).targetTime).toBeNull();
    });

    it('observing 状态下 consume 为幂等空操作', () => {
        const { targetTime, nextState } = consumeStallRecovery(INITIAL_STALL_RECOVERY_STATE);
        expect(targetTime).toBeNull();
        expect(nextState).toEqual(INITIAL_STALL_RECOVERY_STATE);
    });
});
