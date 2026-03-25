/**
 * Sanitizes user input before routing to AI or shell.
 * Prevents prompt injection and control character abuse.
 */

const MAX_INPUT_LENGTH = 10_000
const CONTROL_CHAR_REGEX = /[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g

export interface SanitizeOptions {
  readonly maxLength?: number
  readonly allowControlChars?: boolean
  readonly stripAnsiCodes?: boolean
}

export function sanitizeInput(
  input: string,
  options: SanitizeOptions = {},
): { readonly sanitized: string; readonly error?: string } {
  const {
    maxLength = MAX_INPUT_LENGTH,
    allowControlChars = false,
    stripAnsiCodes = true,
  } = options

  // Check length before processing
  if (input.length > maxLength) {
    return {
      sanitized: input.slice(0, maxLength),
      error: `Input exceeds maximum length of ${maxLength} characters`,
    }
  }

  let sanitized = input

  // Strip ANSI escape codes if requested
  if (stripAnsiCodes) {
    sanitized = sanitized.replace(
      /\x1b\[[0-9;]*[mGKH]/g,
      '',
    )
  }

  // Remove control characters (except tab, newline, carriage return)
  if (!allowControlChars) {
    sanitized = sanitized.replace(CONTROL_CHAR_REGEX, '')
  }

  return { sanitized }
}

/**
 * Checks if input looks like a potential prompt injection attack.
 */
export function detectPromptInjection(input: string): boolean {
  const injectionPatterns = [
    /ignore\s+(all\s+)?(previous|above)/i,
    /disregard\s+(all\s+)?(instructions|prompts?)/i,
    /forget\s+(everything|all\s+(instructions|prompts?))/i,
    /override\s+(your\s+)?(programming|instructions)/i,
    /\[SYSTEM\]:?\s*(ignore|override)/i,
    /\[ADMIN\]:?\s*(ignore|override)/i,
    /(jailbreak|jail\s*break)/i,
    /<script[^>]*>.*?<\/script>/is,
    /javascript:/i,
  ]

  return injectionPatterns.some((pattern) => pattern.test(input))
}
