export function voucherCodePrefix(shopName: string): string {
  const normalizedName = shopName
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `${normalizedName || 'Negozio'}-`;
}
