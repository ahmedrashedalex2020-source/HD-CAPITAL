/**
 * Converts Arabic-Indic (٠-٩) and Eastern Arabic/Persian (۰-۹) numerals to standard ASCII digits (0-9).
 */
export function convertArabicDigitsToEnglish(input: string): string {
  if (!input) return '';
  return String(input)
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}

/**
 * Normalizes any phone number string to a canonical digits-only key.
 * Converts Arabic/Hindi digits first before stripping non-numeric characters.
 * Specifically normalizes Egyptian numbers across all formats:
 *   "٠١٠٠٤٥٦١١٢٢"      -> "201004561122"
 *   "p:+201004561122"  -> "201004561122"
 *   "+20 100 456 1122" -> "201004561122"
 *   "00201004561122"   -> "201004561122"
 *   "01004561122"      -> "201004561122"
 *   "+2001004561122"   -> "201004561122"
 *   "1004561122"       -> "201004561122"
 * And international numbers:
 *   "+971 50 443 2211" -> "971504432211"
 *   "00971504432211"   -> "971504432211"
 */
export function normalizePhone(rawPhone: string): string {
  if (!rawPhone) return '';

  // 1. Convert Arabic/Persian numerals to English ASCII digits first
  const asciiText = convertArabicDigitsToEnglish(String(rawPhone))
    .replace(/^p:/i, '')
    .trim();

  // 2. Keep digits only
  let digits = asciiText.replace(/\D+/g, '');
  if (!digits) return '';

  // 3. Strip international 00 prefix (e.g., 0020... -> 20..., 00971... -> 971...)
  while (digits.startsWith('00')) {
    digits = digits.slice(2);
  }

  // 4. Handle "+2001..." where a leading 0 was kept after country code 20
  if (digits.startsWith('2001') && digits.length === 13) {
    digits = '20' + digits.slice(3);
  }

  // 5. Handle Egyptian local mobile format: 11 digits starting with 010, 011, 012, or 015
  if (/^01[0125]\d{8}$/.test(digits)) {
    digits = '2' + digits; // "01004561122" -> "201004561122"
  }

  // 6. Handle 10-digit Egyptian mobile missing leading 0 (e.g., "1004561122")
  if (/^1[0125]\d{8}$/.test(digits)) {
    digits = '20' + digits;
  }

  return digits;
}

/**
 * Returns the canonical match key for comparing phone numbers across the system.
 * Normalizes Egyptian numbers to `201XXXXXXXXX` (and matches last 10 digits for Egyptian mobile numbers).
 */
export function getPhoneMatchKey(rawPhone: string): string {
  const norm = normalizePhone(rawPhone);
  if (!norm || norm.length < 8) return '';
  if (/^201[0125]\d{8}$/.test(norm)) {
    return norm; // Canonical 12-digit Egyptian format: 201XXXXXXXXX
  }
  return norm;
}

