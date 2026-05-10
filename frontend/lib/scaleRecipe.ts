export function scaleQuantity(text: string, factor: number): string {
  if (!text || factor === 1) return text;

  return text.replace(
    /(\d+\.?\d*)(\s*\/\s*(\d+\.?\d*))?/g,
    (match, num1, _, num2) => {
      let value: number;
      if (num2) {
        value = parseFloat(num1) / parseFloat(num2);
      } else {
        value = parseFloat(num1);
      }
      const scaled = value * factor;
      return Number.isInteger(scaled)
        ? String(scaled)
        : scaled.toFixed(scaled >= 10 ? 0 : 1);
    }
  );
}
