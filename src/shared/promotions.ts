import type { Product, Promotion, SaleItem } from './types';

const promotionIsActive = (promotion: Promotion, date: string) =>
  promotion.starts_at <= date && promotion.ends_at >= date;

const appliesToCart = (promotion: Promotion, products: Product[], items: SaleItem[], subtotal: number) =>
  subtotal >= promotion.minimum_spend
  && items.some((item) => {
    const product = products.find((candidate) => candidate.id === item.product_id);
    return product && (promotion.category === 'Tutte' || promotion.category === product.category);
  });

export function calculatePromotionDiscounts(
  promotions: Promotion[],
  products: Product[],
  items: SaleItem[],
  date: string,
  manualPromotionId?: number,
) {
  const subtotal = items.reduce((sum, item) => sum + item.quantity * item.unit_price, 0);
  const activePromotions = promotions.filter((promotion) => promotionIsActive(promotion, date));
  const automaticApplicablePromotions = activePromotions.filter((promotion) =>
    promotion.application_mode === 'Automatica' && appliesToCart(promotion, products, items, subtotal),
  );
  const manualApplicablePromotions = activePromotions.filter((promotion) =>
    promotion.application_mode === 'Manuale' && appliesToCart(promotion, products, items, subtotal),
  );
  const automaticPromotionDiscount = (promotion: Promotion) => items.reduce((sum, item) => {
    const product = products.find((candidate) => candidate.id === item.product_id);
    return sum + (product && (promotion.category === 'Tutte' || promotion.category === product.category)
      ? item.quantity * item.unit_price * promotion.percentage / 100
      : 0);
  }, 0);
  const automaticPromotion = automaticApplicablePromotions.reduce<Promotion | undefined>((best, candidate) =>
    !best || automaticPromotionDiscount(candidate) > automaticPromotionDiscount(best) ? candidate : best,
  undefined);
  const manualPromotion = manualApplicablePromotions.find((promotion) => promotion.id === manualPromotionId);
  const automaticDiscount = automaticPromotion ? automaticPromotionDiscount(automaticPromotion) : 0;
  const manualDiscount = manualPromotion ? items.reduce((sum, item) => {
    const product = products.find((candidate) => candidate.id === item.product_id);
    return sum + (product && (manualPromotion.category === 'Tutte' || manualPromotion.category === product.category)
      ? item.quantity * item.unit_price * manualPromotion.percentage / 100
      : 0);
  }, 0) : 0;

  return {
    automaticApplicablePromotions,
    automaticPromotion,
    automaticDiscount,
    manualApplicablePromotions,
    manualPromotion,
    manualDiscount,
  };
}
