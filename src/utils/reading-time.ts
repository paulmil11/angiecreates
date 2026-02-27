/**
 * CJK-aware reading time calculator.
 * Chinese characters counted at ~350 chars/min, Latin words at ~238 wpm.
 */
export function getReadingTime(content: string): string {
  const text = content.replace(/<[^>]*>/g, '');

  // Count CJK characters
  const cjkChars = (text.match(/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/g) || []).length;

  // Count Latin words (strip CJK first)
  const latinText = text.replace(/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/g, ' ');
  const latinWords = latinText.trim().split(/\s+/).filter(w => w.length > 0).length;

  const minutes = Math.ceil((cjkChars / 350) + (latinWords / 238));
  return `${Math.max(1, minutes)} 分鐘閱讀`;
}
