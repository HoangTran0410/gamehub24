import { v4 as uuidv4 } from "uuid";

export function calculateSize(obj: any): { json: string; size: number } {
  const json = JSON.stringify(obj);
  const size = Buffer.byteLength(json, "utf8");
  return { json, size };
}

export function log(...args: any[]) {
  const now = new Date();

  // This automatically calculates the offset for Vietnam (ICT)
  const vietnamTime = now.toLocaleString("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour12: false, // Use 24-hour format if preferred
  });

  console.log(`[${vietnamTime}]`, ...args);
}

export function formatSize(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(2)} KB`;
  if (size < 1024 * 1024 * 1024)
    return `${(size / (1024 * 1024)).toFixed(2)} MB`;
  return `${(size / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function uuidShort(): string {
  return uuidv4().substring(0, 8);
}
