const pad = (value: number): string => String(value).padStart(2, "0");

export const toDate = (input?: Date | string | number | null): Date | null => {
  if (input === null || input === undefined) {
    return null;
  }

  if (input instanceof Date) {
    return Number.isNaN(input.getTime()) ? null : input;
  }

  const parsed = new Date(input);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export const getTodayDate = (): Date => new Date();

export const getTodayIsoDate = (): string => formatDateForApi(new Date());

export const formatDate = (
  input?: Date | string | number | null,
  locale = "en-US",
  options: Intl.DateTimeFormatOptions = {
    year: "numeric",
    month: "short",
    day: "2-digit",
  },
): string => {
  const date = toDate(input);
  if (!date) {
    return "";
  }
  return new Intl.DateTimeFormat(locale, options).format(date);
};

export const formatDateTime = (
  input?: Date | string | number | null,
  locale = "en-US",
  options: Intl.DateTimeFormatOptions = {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  },
): string => {
  const date = toDate(input);
  if (!date) {
    return "";
  }
  return new Intl.DateTimeFormat(locale, options).format(date);
};

export const formatDateForApi = (input?: Date | string | number | null): string => {
  const date = toDate(input);
  if (!date) {
    return "";
  }
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

export const formatTimeForApi = (input?: Date | string | number | null): string => {
  const date = toDate(input);
  if (!date) {
    return "";
  }
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
};

export const isToday = (input?: Date | string | number | null): boolean => {
  const date = toDate(input);
  if (!date) {
    return false;
  }

  const today = new Date();
  return (
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate()
  );
};

export const addDays = (input: Date | string | number, days: number): Date => {
  const baseDate = toDate(input) ?? new Date();
  const result = new Date(baseDate);
  result.setDate(result.getDate() + days);
  return result;
};
