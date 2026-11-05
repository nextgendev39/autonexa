import { appConfig } from "@/config/app";
import { countryFlag } from "@/lib/vehicles/countries";

export type PhoneCountry = {
  code: string;
  name: string;
  dialCode: string;
  /** Digits after country code for a typical national number (min–max). */
  nationalMin: number;
  nationalMax: number;
};

/**
 * Dial-code countries for phone inputs. UAE first (default market).
 * Keep this list practical for a UAE dealership — not every ISO country.
 */
export const PHONE_COUNTRIES: PhoneCountry[] = [
  { code: "AE", name: "United Arab Emirates", dialCode: "+971", nationalMin: 8, nationalMax: 9 },
  { code: "SA", name: "Saudi Arabia", dialCode: "+966", nationalMin: 8, nationalMax: 9 },
  { code: "KW", name: "Kuwait", dialCode: "+965", nationalMin: 7, nationalMax: 8 },
  { code: "QA", name: "Qatar", dialCode: "+974", nationalMin: 7, nationalMax: 8 },
  { code: "BH", name: "Bahrain", dialCode: "+973", nationalMin: 7, nationalMax: 8 },
  { code: "OM", name: "Oman", dialCode: "+968", nationalMin: 7, nationalMax: 8 },
  { code: "IN", name: "India", dialCode: "+91", nationalMin: 10, nationalMax: 10 },
  { code: "PK", name: "Pakistan", dialCode: "+92", nationalMin: 10, nationalMax: 10 },
  { code: "EG", name: "Egypt", dialCode: "+20", nationalMin: 9, nationalMax: 10 },
  { code: "GB", name: "United Kingdom", dialCode: "+44", nationalMin: 9, nationalMax: 10 },
  { code: "US", name: "United States", dialCode: "+1", nationalMin: 10, nationalMax: 10 },
  { code: "CA", name: "Canada", dialCode: "+1", nationalMin: 10, nationalMax: 10 },
  { code: "DE", name: "Germany", dialCode: "+49", nationalMin: 6, nationalMax: 12 },
  { code: "FR", name: "France", dialCode: "+33", nationalMin: 9, nationalMax: 9 },
  { code: "IT", name: "Italy", dialCode: "+39", nationalMin: 6, nationalMax: 11 },
  { code: "TR", name: "Turkey", dialCode: "+90", nationalMin: 10, nationalMax: 10 },
  { code: "PH", name: "Philippines", dialCode: "+63", nationalMin: 9, nationalMax: 10 },
  { code: "BD", name: "Bangladesh", dialCode: "+880", nationalMin: 8, nationalMax: 10 },
  { code: "NP", name: "Nepal", dialCode: "+977", nationalMin: 8, nationalMax: 10 },
  { code: "LK", name: "Sri Lanka", dialCode: "+94", nationalMin: 7, nationalMax: 9 },
  { code: "CN", name: "China", dialCode: "+86", nationalMin: 7, nationalMax: 11 },
  { code: "JP", name: "Japan", dialCode: "+81", nationalMin: 8, nationalMax: 10 },
  { code: "AU", name: "Australia", dialCode: "+61", nationalMin: 8, nationalMax: 9 },
];

const dialDigits = appConfig.phone.countryCode;

export function defaultPhoneCountry(): PhoneCountry {
  return (
    PHONE_COUNTRIES.find((country) => country.code === "AE") ??
    PHONE_COUNTRIES[0]
  );
}

export function phoneCountryByCode(code: string | null | undefined): PhoneCountry {
  if (!code) return defaultPhoneCountry();
  return PHONE_COUNTRIES.find((country) => country.code === code) ?? defaultPhoneCountry();
}

/** Longest dial match first so +971 wins over +97, +1 shared CA/US prefers US unless known. */
export function detectPhoneCountry(e164: string | null | undefined): PhoneCountry {
  if (!e164) return defaultPhoneCountry();
  const digits = e164.replace(/\D/g, "");
  if (!digits) return defaultPhoneCountry();

  const sorted = [...PHONE_COUNTRIES].sort(
    (a, b) => b.dialCode.replace(/\D/g, "").length - a.dialCode.replace(/\D/g, "").length,
  );

  for (const country of sorted) {
    const code = country.dialCode.replace(/\D/g, "");
    if (digits.startsWith(code)) {
      // Prefer UAE when ambiguous short prefixes aren't an issue; US/CA share +1.
      if (code === "1") {
        return phoneCountryByCode("US");
      }
      return country;
    }
  }

  return defaultPhoneCountry();
}

export function phoneCountryLabel(country: PhoneCountry) {
  return `${countryFlag(country.code)} ${country.dialCode}`;
}

/**
 * Normalize national or partial input into E.164 for the selected country.
 * Returns null when the national length is outside the country's expected range.
 */
export function normalizeInternationalPhone(input: string, country: PhoneCountry) {
  const countryDigits = country.dialCode.replace(/\D/g, "");
  let digits = input.replace(/\D/g, "");

  if (digits.startsWith(`00${countryDigits}`)) {
    digits = digits.slice(countryDigits.length + 2);
  } else if (digits.startsWith(countryDigits)) {
    digits = digits.slice(countryDigits.length);
  }

  if (digits.startsWith("0")) digits = digits.slice(1);

  if (
    digits.length < country.nationalMin ||
    digits.length > country.nationalMax ||
    !/^\d+$/.test(digits)
  ) {
    return null;
  }

  return `${country.dialCode}${digits}`;
}

/**
 * Extract national digits from an E.164 (or raw) value for the given country.
 */
export function nationalFromInternational(value: string, country: PhoneCountry) {
  const countryDigits = country.dialCode.replace(/\D/g, "");
  let digits = value.replace(/\D/g, "");

  if (digits.startsWith(`00${countryDigits}`)) {
    digits = digits.slice(countryDigits.length + 2);
  } else if (digits.startsWith(countryDigits)) {
    digits = digits.slice(countryDigits.length);
  }

  if (digits.startsWith("0")) digits = digits.slice(1);
  return digits;
}

/**
 * Store UAE numbers as E.164 (`+9715...`). Display formatting stays separate.
 * Kept for auth / legacy UAE-only fields.
 */
export function normalizeUaePhone(input: string) {
  const digits = input.replace(/\D/g, "");
  let national = digits;

  if (national.startsWith(`00${dialDigits}`)) {
    national = national.slice(dialDigits.length + 2);
  } else if (national.startsWith(dialDigits)) {
    national = national.slice(dialDigits.length);
  }

  if (national.startsWith("0")) national = national.slice(1);
  if (!/^[2-9]\d{7,8}$/.test(national)) return null;
  return `${appConfig.phone.dialCode}${national}`;
}

export function nationalFromE164(value: string) {
  const normalized = normalizeUaePhone(value);
  if (!normalized) return value.replace(/\D/g, "").replace(/^971/, "").replace(/^0/, "");
  return normalized.slice(appConfig.phone.dialCode.length);
}

export function formatUaePhone(value: string) {
  const normalized = normalizeUaePhone(value);
  if (!normalized) return value;
  const national = normalized.slice(appConfig.phone.dialCode.length);
  if (national.length === 9) {
    return `${appConfig.phone.dialCode} ${national.slice(0, 2)} ${national.slice(2, 5)} ${national.slice(5)}`;
  }
  return `${appConfig.phone.dialCode} ${national.slice(0, 1)} ${national.slice(1, 4)} ${national.slice(4)}`;
}

/** Loose E.164 check for international acquisition contacts. */
export function isValidE164(value: string) {
  return /^\+[1-9]\d{6,14}$/.test(value);
}
