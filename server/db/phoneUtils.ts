/**
 * Normalizes any phone number string to a canonical digits-only key.
 * Specifically normalizes Egyptian numbers across all formats:
 *   "+20 100 456 1122" -> "201004561122"
 *   "00201004561122"   -> "201004561122"
 *   "01004561122"      -> "201004561122"
 *   "+2001004561122"   -> "201004561122"
 * And international numbers:
 *   "+971 50 443 2211" -> "971504432211"
 *   "00971504432211"   -> "971504432211"
 */
export function normalizePhone(rawPhone: string): string {
  if (!rawPhone) return '';

  // Keep digits only
  let digits = String(rawPhone).replace(/\D+/g, '');
  if (!digits) return '';

  // Strip international 00 prefix (e.g., 0020... -> 20..., 00971... -> 971...)
  if (digits.startsWith('00')) {
    digits = digits.slice(2);
  }

  // Handle "+2001..." where a leading 0 was kept after country code 20
  if (digits.startsWith('2001') && digits.length === 13) {
    digits = '20' + digits.slice(3);
  }

  // Handle Egyptian local mobile format: 11 digits starting with 010, 011, 012, or 015
  if (/^01[0125]\d{8}$/.test(digits)) {
    digits = '2' + digits; // "01004561122" -> "201004561122"
  }

  // Handle 10-digit Egyptian mobile missing leading 0 (e.g., "1004561122")
  if (/^1[0125]\d{8}$/.test(digits)) {
    digits = '20' + digits;
  }

  return digits;
}
