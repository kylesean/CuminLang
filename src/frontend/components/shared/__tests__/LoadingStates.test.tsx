import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
    ContextStudioListSkeleton,
    HomeLoadingSkeleton,
    PlayerLoadingSkeleton,
    StartupLoading,
    WorkspaceContentSkeleton,
} from '../LoadingStates';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string) => key,
    }),
}));

describe('LoadingStates', () => {
    it('StartupLoading 同时展示品牌标识、无障碍加载状态与可读文案', () => {
        render(<StartupLoading />);

        expect(screen.getByRole('status', { name: 'loading' })).toBeInTheDocument();
        expect(screen.getByText('loading')).toBeInTheDocument();
        expect(screen.getByText('uminLang')).toBeInTheDocument();
    });

    it.each([
        { name: 'WorkspaceContentSkeleton', renderFn: () => <WorkspaceContentSkeleton />, testId: 'workspace-loading-skeleton' },
        { name: 'PlayerLoadingSkeleton', renderFn: () => <PlayerLoadingSkeleton />, testId: 'player-loading-skeleton' },
        { name: 'HomeLoadingSkeleton', renderFn: () => <HomeLoadingSkeleton />, testId: 'home-loading-skeleton' },
    ])('$name 提供 Astryx 骨架容器并暴露无障碍 status 语义', ({ renderFn, testId }) => {
        render(renderFn());

        const container = screen.getByTestId(testId);
        expect(container).toHaveAttribute('role', 'status');
        expect(container).toHaveAttribute('aria-label', 'loading');
    });

    it('ContextStudioListSkeleton 使用列表骨架占位并透传 ariaLabel', () => {
        render(<ContextStudioListSkeleton ariaLabel="正在加载语境资产..." />);

        const container = screen.getByTestId('context-studio-loading-skeleton');
        expect(container).toHaveAttribute('role', 'status');
        expect(container).toHaveAttribute('aria-label', '正在加载语境资产...');
    });
});
