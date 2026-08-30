import { describe, expect, it } from 'vitest';
import {
  isStickerToken,
  normalizeUnicodeStatus,
  resolveStatusEmoji,
} from '@/lib/statusEmoji';
import type { StickerEntry } from '@/lib/stickerPack';

const pack: StickerEntry[] = [
  { token: ':wave:', url: 'https://cdn.example/wave.png', emoji: '👋', label: 'Wave' },
  { token: ':dance:', url: 'https://cdn.example/dance.gif', emoji: '💃', label: 'Dance' },
];

describe('emoji status validation and resolution', () => {
  it('preserves Unicode emoji graphemes without UTF-16 truncation', () => {
    expect(normalizeUnicodeStatus('👨‍👩‍👧‍👦')).toBe('👨‍👩‍👧‍👦');
    expect(normalizeUnicodeStatus('❤️')).toBe('❤️');
    expect(resolveStatusEmoji('🔥', pack)).toEqual({ kind: 'unicode', value: '🔥' });
  });

  it('accepts canonical sticker tokens and resolves them from the existing pack', () => {
    expect(isStickerToken(':wave:')).toBe(true);
    expect(isStickerToken(':naruto-hug-2:')).toBe(true);
    expect(resolveStatusEmoji(':wave:', pack)).toEqual({
      kind: 'sticker', token: ':wave:', sticker: pack[0],
    });
  });

  it('resolves a custom GIF status to its animated image URL and fallback', () => {
    const resolved = resolveStatusEmoji(':dance:', pack);
    expect(resolved.kind).toBe('sticker');
    if (resolved.kind === 'sticker') {
      expect(resolved.sticker).toMatchObject({
        url: 'https://cdn.example/dance.gif', emoji: '💃', label: 'Dance',
      });
    }
  });

  it('rejects arbitrary URLs, HTML, scripts and ordinary text as Unicode statuses', () => {
    expect(normalizeUnicodeStatus('https://evil.example/x.gif')).toBeNull();
    expect(normalizeUnicodeStatus('javascript:alert(1)')).toBeNull();
    expect(normalizeUnicodeStatus('<img src=x>')).toBeNull();
    expect(normalizeUnicodeStatus('hello')).toBeNull();
  });

  it('fails safely when a stored sticker token no longer exists', () => {
    expect(resolveStatusEmoji(':removed:', pack)).toEqual({
      kind: 'sticker', token: ':removed:', sticker: null,
    });
  });
});
