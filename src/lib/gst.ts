/**
 * GST split rule: same state as the company (state code 33 by default) → CGST + SGST.
 * Any other state code → IGST only.
 */
export type GstRates = { cgstRate: number; sgstRate: number; igstRate: number };

export function isInterState(companyStateCode: string, otherStateCode: string) {
  const a = String(companyStateCode ?? "").trim();
  const b = String(otherStateCode ?? "").trim();
  if (!b) return false;
  return a !== b;
}

export function gstRatesFor(
  companyStateCode: string,
  otherStateCode: string,
  defaults: { cgst: number; sgst: number; igst: number },
): GstRates {
  return isInterState(companyStateCode, otherStateCode)
    ? { cgstRate: 0, sgstRate: 0, igstRate: defaults.igst }
    : { cgstRate: defaults.cgst, sgstRate: defaults.sgst, igstRate: 0 };
}

/** GST state codes (as printed on a GSTIN) mapped to the state or union territory name. */
export const GST_STATES: Record<string, string> = {
  "01": "Jammu and Kashmir",
  "02": "Himachal Pradesh",
  "03": "Punjab",
  "04": "Chandigarh",
  "05": "Uttarakhand",
  "06": "Haryana",
  "07": "Delhi",
  "08": "Rajasthan",
  "09": "Uttar Pradesh",
  "10": "Bihar",
  "11": "Sikkim",
  "12": "Arunachal Pradesh",
  "13": "Nagaland",
  "14": "Manipur",
  "15": "Mizoram",
  "16": "Tripura",
  "17": "Meghalaya",
  "18": "Assam",
  "19": "West Bengal",
  "20": "Jharkhand",
  "21": "Odisha",
  "22": "Chhattisgarh",
  "23": "Madhya Pradesh",
  "24": "Gujarat",
  "25": "Daman and Diu",
  "26": "Dadra and Nagar Haveli and Daman and Diu",
  "27": "Maharashtra",
  "28": "Andhra Pradesh",
  "29": "Karnataka",
  "30": "Goa",
  "31": "Lakshadweep",
  "32": "Kerala",
  "33": "Tamil Nadu",
  "34": "Puducherry",
  "35": "Andaman and Nicobar Islands",
  "36": "Telangana",
  "37": "Andhra Pradesh",
  "38": "Ladakh",
  "97": "Other Territory",
  "99": "Centre Jurisdiction",
};

/** "33" or "3" → "Tamil Nadu". Returns "" when the code is not a known state code. */
export function stateForCode(code: string) {
  const digits = String(code ?? "").replace(/\D/g, "");
  if (!digits) return "";
  const padded = digits.slice(0, 2).padStart(2, "0");
  return GST_STATES[padded] ?? "";
}

