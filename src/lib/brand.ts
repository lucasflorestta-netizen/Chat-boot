import { mediaUrl } from './api';

export const DEFAULT_BRAND_NAME = 'Customer Center';
export const DEFAULT_BRAND_LOGO = '/logo-customer-center.png';

const BRAND_NAME_KEY = 'brand_name';
const BRAND_LOGO_KEY = 'brand_logo';

export function readStoredBrand(): { name: string; logo: string } {
  try {
    const name = localStorage.getItem(BRAND_NAME_KEY)?.trim();
    const logo = localStorage.getItem(BRAND_LOGO_KEY)?.trim();
    return {
      name: name || DEFAULT_BRAND_NAME,
      logo: logo || DEFAULT_BRAND_LOGO,
    };
  } catch {
    return { name: DEFAULT_BRAND_NAME, logo: DEFAULT_BRAND_LOGO };
  }
}

export function writeStoredBrand(name: string, logoUrl: string | null) {
  try {
    localStorage.setItem(BRAND_NAME_KEY, name.trim() || DEFAULT_BRAND_NAME);
    if (logoUrl) {
      localStorage.setItem(BRAND_LOGO_KEY, logoUrl);
    } else {
      localStorage.removeItem(BRAND_LOGO_KEY);
    }
  } catch {
    // ignore quota / private mode
  }
}

export function resolveBrandLogoSrc(logoUrl: string | null | undefined): string {
  if (!logoUrl) return DEFAULT_BRAND_LOGO;
  if (logoUrl.startsWith('/') && !logoUrl.startsWith('/uploads/')) {
    return logoUrl;
  }
  return mediaUrl(logoUrl) || DEFAULT_BRAND_LOGO;
}
