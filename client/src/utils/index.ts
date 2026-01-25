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
  if (floor) {
    return min + Math.floor(Math.random() * (max - min + 1));
  }
  return min + Math.random() * (max - min);
}

export function uuid() {
  // basic js uuid
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
    var r = (Math.random() * 16) | 0,
      v = c == "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function formatTimeAgo(time: number | string): {
  en: string;
  vi: string;
} {
  const diff = new Date().getTime() - new Date(time).getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (minutes < 1) return { en: "Just now", vi: "Vừa xong" };
  if (minutes < 60)
    return {
      en: `${minutes}m ago`,
      vi: `${minutes}p trước`,
    };
  if (hours < 24)
    return {
      en: `${hours}h ago`,
      vi: `${hours}h trước`,
    };
  return {
    en: `${days}d ago`,
    vi: `${days}d trước`,
  };
}
