export function p(str: string | undefined | null): string {
    return (str ?? '').toLowerCase().trim();
}

export const joinUrl = (base: string, path: string): string => {
    return base.replace(/\/+$/, '') + '/' + path.replace(/^\/+/, '');
};

export default class Util {
    static p = p;
    static joinUrl = joinUrl;

    public static trim(str: string | null | undefined): string {
        return (str ?? '').trim();
    }
}

export const emptyFunc = () => {
    return;
};
