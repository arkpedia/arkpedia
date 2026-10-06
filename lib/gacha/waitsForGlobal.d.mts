/** A banner record, or any object with its fields (a page's trimmed copy, a test's literal). */
type BannerLike = { pull_type?: string; globalPoolId?: string | null; cnPoolId?: string | null; global_date?: string | null; global_window?: { timingSource?: string | null } | null };
/** The banner kinds whose Global lineup is never CN's. */
export declare const GLOBAL_LINEUP_KINDS: ReadonlySet<string>;
/** Whether a banner waits for Global's own pool or announcement (see waitsForGlobal.mjs). */
export declare function waitsForGlobal<T extends BannerLike>(banner: T | null | undefined): boolean;
