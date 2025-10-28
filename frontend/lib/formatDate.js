import { formatDistanceToNowStrict, formatISO } from "date-fns";

export function getRelativeTime(dateString) {
  const date = new Date(dateString);
  return formatDistanceToNowStrict(date, { addSuffix: true });
}

export function getUTCFormatted(dateString) {
  const date = new Date(dateString);
  return date.toISOString();
}
