/** A banner record, or any object with its fields (a page's trimmed copy, a test's literal). */
type BannerLike = { globalLineupPending?: boolean; pull_type?: string; globalPoolId?: string | null; cnPoolId?: string | null; global_date?: string | null; global_window?: { timingSource?: string | null } | null };
/** The banner kinds whose Global lineup must be confirmed independently. */
export declare const GLOBAL_LINEUP_KINDS: ReadonlySet<string>;
/** Whether a banner waits for Global's own pool or announcement (see waitsForGlobal.mjs). */
export declare function waitsForGlobal<T extends BannerLike>(banner: T | null | undefined): boolean;

/** Strip unconfirmed Global lineup and art, preserving the source's forecast timing. */
export declare function globalBannerPreview<T extends BannerLike>(banner: T): T;
