import type { FallbackProps } from 'react-error-boundary';
import { useTranslation } from 'react-i18next';

const FallBack = ({ resetErrorBoundary }: Partial<FallbackProps>) => {
    const { t } = useTranslation(['errors', 'common']);
    return (
        <div className="flex h-full w-full items-center justify-center p-4">
            <div className="bg-error-muted border border-error/40 text-on-error-muted px-4 py-3 rounded-lg relative flex items-center gap-3" role="alert">
                <span className="text-sm font-medium">
                    {t('errors:generic', { defaultValue: 'Something went wrong. Please try again shortly.' })}
                </span>
                {resetErrorBoundary && (
                    <button
                        type="button"
                        onClick={resetErrorBoundary}
                        className="px-2.5 py-1 text-sm font-medium rounded-lg border border-current/30 text-current hover:bg-current/10 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
                    >
                        {t('common:retry', { defaultValue: 'Retry' })}
                    </button>
                )}
            </div>
        </div>
    );
};

export default FallBack;
