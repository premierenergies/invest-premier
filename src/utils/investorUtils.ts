export const getFundGroup = (name: string): string =>
  (name || "").trim().toUpperCase(); // full name only (no first-2-words grouping)
