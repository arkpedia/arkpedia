import dynamic from 'next/dynamic';

/* The site's operator quick preview (OperatorPreview), loaded the first time a reader opens
   one. Pass `nativeModal`: it then opens as a native modal <dialog>, in the top layer, so it
   needs no portal wherever the picture that opens it sits. Recruitment, the Reward Tracker,
   the Operator Planner's artwork and the Account page's Pull History open this one. */
export const LazyOperatorPreview = dynamic(() => import('./OperatorPreview').then(module => module.OperatorPreview), { ssr: false });
