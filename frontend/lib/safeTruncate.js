export default function safeTruncate(value, decimals = 6) {
  const factor = Math.pow(10, decimals);
  return Math.floor(value * factor) / factor;
}
