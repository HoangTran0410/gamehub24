// 1000 to 1.000
export function formatNumber(num: number) {
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

const PriceFormatter = new Intl.NumberFormat("en", {
  notation: "compact",
  maximumFractionDigits: 1,
});
export function formatPrice(num: number): string {
  if (num < 1_000_000) return formatNumber(num);
  return PriceFormatter.format(num);
}

export function randInRange(
  min: number,
  max: number,
  floor: boolean = false,
): number {
  const diff = Math.random() * (max - min + 1);
  return min + (floor ? Math.floor(diff) : diff);
}
