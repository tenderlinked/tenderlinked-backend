import pLimit from "p-limit";

// Maximum 3 concurrent requests across the entire application for scraping
export const scraperLimit = pLimit(3);

export async function randomDelay(min: number = 1000, max: number = 3000) {
  const delay = Math.floor(Math.random() * (max - min + 1)) + min;
  await new Promise((resolve) => setTimeout(resolve, delay));
}
