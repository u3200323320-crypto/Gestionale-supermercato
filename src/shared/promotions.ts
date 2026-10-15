import type { Product, Promotion, SaleItem } from './types';

const promotionIsActive = (promotion: Promotion, date: string) =>
  promotion.starts_at <= date && promotion.ends_at >= date;

const appliesToCart = (promotion: Promotion, products: Product[], items: SaleItem[], subtotal: number) => {
  const unitFor = (item: SaleItem) => item.unit ?? products.find((product) => product.id === item.product_id)?.unit ?? 'PEZZO';
  const matchingItems = items.filter((item) => {
    const product = products.find((candidate) => candidate.id === item.product_id);
    return product && (promotion.category === 'Tutte' || promotion.category === product.category);
  });
  const bundleUnits = promotion.discount_type === 'buy_get'
    ? matchingItems.filter((item) => unitFor(item) === 'PEZZO').reduce((sum, item) => sum + Math.floor(item.quantity + Number.EPSILON), 0)
    : 0;
  const bundleMinimum = promotion.discount_type === 'buy_get' ? promotion.buy_quantity + promotion.free_quantity : 0;
  return subtotal >= promotion.minimum_spend
    && matchingItems.length > 0
    && (promotion.discount_type !== 'buy_get' || (bundleMinimum > 0 && bundleUnits >= bundleMinimum))
    && matchingItems.reduce((sum, item) => sum + (unitFor(item) === 'KG' ? item.quantity : 0), 0) >= (promotion.minimum_kilograms ?? 0)
    && matchingItems.reduce((sum, item) => sum + (unitFor(item) === 'PEZZO' ? item.quantity : 0), 0) >= (promotion.minimum_pieces ?? 0)
    && matchingItems.reduce((sum, item) => sum + (unitFor(item) === 'LITRO' ? item.quantity : 0), 0) >= (promotion.minimum_liters ?? 0);
};

function calculatePromotionDiscount(promotion: Promotion, products: Product[], items: SaleItem[]): number {
  const matchingItems = items.filter((item) => {
    const product = products.find((candidate) => candidate.id === item.product_id);
    return product && (promotion.category === 'Tutte' || promotion.category === product.category);
  });
  if (promotion.discount_type !== 'buy_get') {
    return matchingItems.reduce((sum, item) => sum + item.quantity * item.unit_price * promotion.percentage / 100, 0);
  }

  const freeUnits = Math.floor(
    matchingItems
      .filter((item) => (item.unit ?? products.find((product) => product.id === item.product_id)?.unit ?? 'PEZZO') === 'PEZZO')
      .reduce((sum, item) => sum + Math.floor(item.quantity + Number.EPSILON), 0)
      / (promotion.buy_quantity + promotion.free_quantity),
  ) * promotion.free_quantity;
  let remainingFreeUnits = freeUnits;
  return matchingItems
    .filter((item) => (item.unit ?? products.find((product) => product.id === item.product_id)?.unit ?? 'PEZZO') === 'PEZZO')
    .sort((first, second) => first.unit_price - second.unit_price)
    .reduce((discount, item) => {
      const freeFromItem = Math.min(Math.floor(item.quantity + Number.EPSILON), remainingFreeUnits);
      remainingFreeUnits -= freeFromItem;
      return discount + freeFromItem * item.unit_price;
    }, 0);
}

export function calculatePromotionDiscounts(
  promotions: Promotion[],
  products: Product[],
  items: SaleItem[],
  date: string,
  manualPromotionId?: number,
  automaticPromotionId?: number | null,
) {
  const subtotal = items.reduce((sum, item) => sum + item.quantity * item.unit_price, 0);
  const activePromotions = promotions.filter((promotion) => promotionIsActive(promotion, date));
  const automaticApplicablePromotions = activePromotions.filter((promotion) =>
    promotion.application_mode === 'Automatica' && appliesToCart(promotion, products, items, subtotal),
  );
  const manualApplicablePromotions = activePromotions.filter((promotion) =>
    promotion.application_mode === 'Manuale' && appliesToCart(promotion, products, items, subtotal),
  );
  const automaticPromotionDiscount = (promotion: Promotion) => calculatePromotionDiscount(promotion, products, items);
  const bestAutomaticPromotion = automaticApplicablePromotions.reduce<Promotion | undefined>((best, candidate) =>
    !best || automaticPromotionDiscount(candidate) > automaticPromotionDiscount(best) ? candidate : best,
  undefined);
  const automaticPromotion = automaticPromotionId === undefined
    ? bestAutomaticPromotion
    : automaticApplicablePromotions.find((promotion) => promotion.id === automaticPromotionId);
  const manualPromotion = manualApplicablePromotions.find((promotion) => promotion.id === manualPromotionId);
  const automaticDiscount = automaticPromotion ? automaticPromotionDiscount(automaticPromotion) : 0;
  const manualDiscount = manualPromotion
    ? Math.min(calculatePromotionDiscount(manualPromotion, products, items), Math.max(0, subtotal - automaticDiscount))
    : 0;

  return {
    automaticApplicablePromotions,
    automaticPromotion,
    automaticDiscount,
    manualApplicablePromotions,
    manualPromotion,
    manualDiscount,
  };
}
