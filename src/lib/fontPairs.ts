export interface FontPair {
  key: string;
  label: string;
  heading: string;
  body: string;
  googleHref: string;
}

export const FONT_PAIRS: FontPair[] = [
  {
    key: 'inter',
    label: 'Inter (default)',
    heading: 'Inter',
    body: 'Inter',
    googleHref: 'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap',
  },
  {
    key: 'space-grotesk-dm-sans',
    label: 'Space Grotesk + DM Sans',
    heading: 'Space Grotesk',
    body: 'DM Sans',
    googleHref: 'https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&display=swap',
  },
  {
    key: 'syne-jakarta',
    label: 'Syne + Plus Jakarta',
    heading: 'Syne',
    body: 'Plus Jakarta Sans',
    googleHref: 'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&family=Syne:wght@600;700;800&display=swap',
  },
  {
    key: 'sora-manrope',
    label: 'Sora + Manrope',
    heading: 'Sora',
    body: 'Manrope',
    googleHref: 'https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700&family=Sora:wght@600;700;800&display=swap',
  },
  {
    key: 'instrument-work-sans',
    label: 'Instrument Serif + Work Sans',
    heading: 'Instrument Serif',
    body: 'Work Sans',
    googleHref: 'https://fonts.googleapis.com/css2?family=Instrument+Serif&family=Work+Sans:wght@400;500;600;700&display=swap',
  },
];

export function getFontPair(key: string): FontPair {
  return FONT_PAIRS.find(p => p.key === key) ?? FONT_PAIRS[0];
}
