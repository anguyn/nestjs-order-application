import { randomBytes } from 'crypto';
/**
 * Generate a random voucher code
 * Format: XXX-XXXX-XXXX (e.g., ABC-1234-XYZW)
 */
export function generateVoucherCode(length: number = 12): string {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const segments = [3, 4, 4]; // XXX-XXXX-XXXX format

  const code = segments
    .map((segmentLength) => {
      let segment = '';
      for (let i = 0; i < segmentLength; i++) {
        const randomIndex = Math.floor(Math.random() * characters.length);
        segment += characters[randomIndex];
      }
      return segment;
    })
    .join('-');

  return code;
}

/**
 * Generate a simple numeric voucher code
 * Format: 12 digits (e.g., 123456789012)
 */
export function generateNumericVoucherCode(length: number = 12): string {
  let code = '';
  for (let i = 0; i < length; i++) {
    code += Math.floor(Math.random() * 10);
  }
  return code;
}

/**
 * Generate a custom prefix voucher code
 * Format: PREFIX-XXXX-XXXX (e.g., SUMMER-AB12-CD34)
 */
export function generatePrefixedVoucherCode(
  prefix: string,
  length: number = 8,
): string {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';

  for (let i = 0; i < length; i++) {
    const randomIndex = Math.floor(Math.random() * characters.length);
    code += characters[randomIndex];

    // Add hyphen every 4 characters
    if ((i + 1) % 4 === 0 && i + 1 < length) {
      code += '-';
    }
  }

  return `${prefix.toUpperCase()}-${code}`;
}

/**
 * Validate voucher code format
 */
export function isValidVoucherCodeFormat(code: string): boolean {
  // Check basic format: XXX-XXXX-XXXX or similar patterns
  const pattern = /^[A-Z0-9]{3,}-[A-Z0-9]{4,}-[A-Z0-9]{4,}$/;
  return pattern.test(code);
}

/**
 * Generate voucher code with crypto (more secure, requires crypto module)
 * Use this if you need cryptographically secure random codes
 */
export function generateSecureVoucherCode(): string {
  const buffer = randomBytes(6);
  const code = buffer.toString('hex').toUpperCase();

  // Format: XXXX-XXXX-XXXX
  return `${code.slice(0, 4)}-${code.slice(4, 8)}-${code.slice(8, 12)}`;
}
