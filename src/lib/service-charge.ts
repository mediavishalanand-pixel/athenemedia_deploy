/** How the service charge is worked out on proformas and invoices. */
export type ServiceChargeMode = "percent" | "amount" | "gross";

/** Valid gross divisor (e.g. 0.85 or 0.90) or 0 when not usable. */
export const cleanGrossDivisor = (value: unknown) => {
  const n = Number(value);
  return n > 0 && n < 1 ? n : 0;
};

export const readServiceChargeMode = (value: unknown): ServiceChargeMode =>
  value === "amount" ? "amount" : value === "gross" ? "gross" : "percent";

/**
 * percent: media × % · gross: media ÷ divisor × % · amount: fixed value.
 * Gross without a valid divisor falls back to a plain percentage.
 */
export function serviceChargeFor(
  media: number,
  mode: ServiceChargeMode,
  value: number,
  divisor?: number,
) {
  const v = Number(value) || 0;
  if (mode === "amount") return Math.round(v * 100) / 100;
  const d = mode === "gross" ? cleanGrossDivisor(divisor) : 0;
  const base = d ? media / d : media;
  return Math.round(((base * v) / 100) * 100) / 100;
}

export const serviceChargeLabel = (mode: ServiceChargeMode, value: number, divisor?: number) =>
  mode === "amount" || !value
    ? ""
    : ` @ ${value}%${mode === "gross" && cleanGrossDivisor(divisor) ? ` ON GROSS (÷${cleanGrossDivisor(divisor)})` : ""}`;
