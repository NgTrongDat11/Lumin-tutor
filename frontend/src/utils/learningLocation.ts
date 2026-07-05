export function getLearningLocationUrl(value: string | null | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return /^https?:\/\/\S+$/i.test(trimmed) ? trimmed : null;
}
