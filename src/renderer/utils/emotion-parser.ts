/**
 * Emotion tag parsing utilities for chat messages.
 *
 * Based on ChatVRM's screenplay system:
 * https://github.com/sony/ChatVRM/blob/main/src/features/messages/messages.ts
 *
 * Emotion tags are formatted as [emotion] within message text:
 * - "Hello [happy] there!" → text: "Hello there!", emotion: "happy"
 * - "This is [sad] unfortunate [angry]" → text: "This is unfortunate", emotion: "sad" (first tag wins)
 */

/**
 * Supported emotion types matching VRM expression presets.
 */
export type EmotionType = 'neutral' | 'happy' | 'angry' | 'sad' | 'relaxed';

/**
 * Valid emotion list for validation.
 */
export const EMOTION_TAGS: readonly EmotionType[] = ['neutral', 'happy', 'angry', 'sad', 'relaxed'] as const;

/**
 * Regex pattern to match emotion tags like [happy], [sad], etc.
 * Matches any word character inside square brackets.
 */
export const EMOTION_TAG_PATTERN = /\[(.*?)\]/g;

/**
 * Parsed message with emotion tag stripped and emotion extracted.
 */
export interface ParsedMessage {
  /** Message text with all emotion tags removed */
  text: string;
  /** Parsed emotion (defaults to 'neutral' if no valid tag found) */
  emotion: EmotionType;
}

/**
 * Checks if a string is a valid emotion type.
 */
function isValidEmotion(value: string): value is EmotionType {
  return EMOTION_TAGS.includes(value as EmotionType);
}

/**
 * Parses emotion tags from a message string.
 *
 * Extracts the first valid emotion tag (e.g., [happy], [sad]) from the text,
 * removes all emotion tags, and returns the cleaned text with parsed emotion.
 *
 * @param text - Message text potentially containing emotion tags
 * @returns Parsed message with tags stripped and emotion extracted
 *
 * @example
 * ```ts
 * parseMessageEmotion("Hello [happy] world!")
 * // Returns: { text: "Hello world!", emotion: "happy" }
 *
 * parseMessageEmotion("No emotion here")
 * // Returns: { text: "No emotion here", emotion: "neutral" }
 *
 * parseMessageEmotion("[sad] Bad [angry] day")
 * // Returns: { text: "Bad day", emotion: "sad" }
 * ```
 */
export function parseMessageEmotion(text: string): ParsedMessage {
  // Find first emotion tag
  const firstMatch = text.match(EMOTION_TAG_PATTERN);
  const tagContent = firstMatch?.[1];

  // Extract and validate emotion from tag
  let emotion: EmotionType = 'neutral';
  if (tagContent && isValidEmotion(tagContent)) {
    emotion = tagContent;
  }

  // Remove all emotion tags from text
  const cleanText = text.replace(EMOTION_TAG_PATTERN, '');

  return {
    text: cleanText,
    emotion,
  };
}

/**
 * Parses emotion tags with history-aware default.
 *
 * Same as parseMessageEmotion, but when no emotion tag is found,
 * uses the previous emotion instead of defaulting to 'neutral'.
 * This maintains emotional continuity across streaming message chunks.
 *
 * @param text - Message text potentially containing emotion tags
 * @param prevEmotion - Previous emotion to use as fallback (defaults to 'neutral')
 * @returns Parsed message with tags stripped and emotion extracted
 *
 * @example
 * ```ts
 * // First chunk has explicit emotion
 * parseMessageEmotionWithHistory("[happy] Hello", "neutral")
 * // Returns: { text: "Hello", emotion: "happy" }
 *
 * // Subsequent chunks maintain emotion
 * parseMessageEmotionWithHistory(" world!", "happy")
 * // Returns: { text: "world!", emotion: "happy" }
 *
 * // Emotion can be overridden in any chunk
 * parseMessageEmotionWithHistory("[sad] Goodbye", "happy")
 * // Returns: { text: "Goodbye", emotion: "sad" }
 * ```
 */
export function parseMessageEmotionWithHistory(
  text: string,
  prevEmotion: EmotionType = 'neutral'
): ParsedMessage {
  const result = parseMessageEmotion(text);

  // If no tag found (emotion is 'neutral'), use previous emotion
  if (result.emotion === 'neutral' && !text.match(EMOTION_TAG_PATTERN)) {
    return {
      text: result.text,
      emotion: prevEmotion,
    };
  }

  return result;
}

/**
 * Unit tests (commented out - move to emotion-parser.test.ts for Vitest)
 *
 * @example
 * ```ts
 * import { describe, it, expect } from 'vitest';
 * import { parseMessageEmotion, parseMessageEmotionWithHistory, EMOTION_TAGS } from './emotion-parser';
 *
 * describe('parseMessageEmotion', () => {
 *   it('should extract happy emotion from tag', () => {
 *     const result = parseMessageEmotion('Hello [happy] world!');
 *     expect(result.text).toBe('Hello world!');
 *     expect(result.emotion).toBe('happy');
 *   });
 *
 *   it('should default to neutral when no tag present', () => {
 *     const result = parseMessageEmotion('Just plain text');
 *     expect(result.text).toBe('Just plain text');
 *     expect(result.emotion).toBe('neutral');
 *   });
 *
 *   it('should use first tag when multiple present', () => {
 *     const result = parseMessageEmotion('[sad] Bad [angry] day');
 *     expect(result.text).toBe('Bad day');
 *     expect(result.emotion).toBe('sad');
 *   });
 *
 *   it('should remove all emotion tags from text', () => {
 *     const result = parseMessageEmotion('[happy] Start [sad] middle [angry] end');
 *     expect(result.text).toBe('Start middle end');
 *   });
 *
 *   it('should ignore malformed tags', () => {
 *     const result = parseMessageEmotion('Hello [unknown] world');
 *     expect(result.text).toBe('Hello world');
 *     expect(result.emotion).toBe('neutral');
 *   });
 *
 *   it('should handle all valid emotions', () => {
 *     EMOTION_TAGS.forEach((emotion) => {
 *       const result = parseMessageEmotion(`[${emotion}] test`);
 *       expect(result.emotion).toBe(emotion);
 *       expect(result.text).toBe('test');
 *     });
 *   });
 *
 *   it('should handle empty string', () => {
 *     const result = parseMessageEmotion('');
 *     expect(result.text).toBe('');
 *     expect(result.emotion).toBe('neutral');
 *   });
 *
 *   it('should handle tag only', () => {
 *     const result = parseMessageEmotion('[happy]');
 *     expect(result.text).toBe('');
 *     expect(result.emotion).toBe('happy');
 *   });
 * });
 *
 * describe('parseMessageEmotionWithHistory', () => {
 *   it('should use explicit tag over previous emotion', () => {
 *     const result = parseMessageEmotionWithHistory('[happy] Hello', 'sad');
 *     expect(result.text).toBe('Hello');
 *     expect(result.emotion).toBe('happy');
 *   });
 *
 *   it('should maintain previous emotion when no tag', () => {
 *     const result = parseMessageEmotionWithHistory(' world!', 'happy');
 *     expect(result.text).toBe('world!');
 *     expect(result.emotion).toBe('happy');
 *   });
 *
 *   it('should default to neutral when no prevEmotion provided', () => {
 *     const result = parseMessageEmotionWithHistory('Hello');
 *     expect(result.text).toBe('Hello');
 *     expect(result.emotion).toBe('neutral');
 *   });
 *
 *   it('should handle emotion change in streaming', () => {
 *     const chunks = [
 *       '[happy] Start of message',
 *       ' continues...',
 *       '[sad] but ends badly',
 *     ];
 *
 *     let prevEmotion: EmotionType = 'neutral';
 *     const results = chunks.map((chunk) => {
 *       const result = parseMessageEmotionWithHistory(chunk, prevEmotion);
 *       prevEmotion = result.emotion;
 *       return result;
 *     });
 *
 *     expect(results[0].emotion).toBe('happy');
 *     expect(results[0].text).toBe('Start of message');
 *
 *     expect(results[1].emotion).toBe('happy');
 *     expect(results[1].text).toBe('continues...');
 *
 *     expect(results[2].emotion).toBe('sad');
 *     expect(results[2].text).toBe('but ends badly');
 *   });
 *
 *   it('should not confuse explicit neutral tag with no tag', () => {
 *     const withTag = parseMessageEmotionWithHistory('[neutral] text', 'happy');
 *     expect(withTag.emotion).toBe('neutral');
 *
 *     const withoutTag = parseMessageEmotionWithHistory('text', 'happy');
 *     expect(withoutTag.emotion).toBe('happy');
 *   });
 * });
 * ```
 */
