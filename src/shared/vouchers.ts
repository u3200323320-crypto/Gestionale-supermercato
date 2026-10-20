export function voucherCodePrefix(shopName: string): string {
  const normalizedName = shopName
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^A-Za-z0-9]/g, '');
  return normalizedName || 'STORE';
}
