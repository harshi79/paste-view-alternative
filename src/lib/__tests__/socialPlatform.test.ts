import { describe, it, expect } from 'vitest';
import { detectSocialPlatform } from '@/lib/socialPlatform';

describe('detectSocialPlatform', () => {
  it('detects Telegram on t.me and www variants', () => {
    for (const url of [
      'https://t.me/Yori',
      'https://www.t.me/Yori',
      'http://t.me/Yori',
    ]) {
      const result = detectSocialPlatform(url);
      expect(result.platform).toBe('telegram');
      expect(result.label).toBe('Telegram');
      expect(result.icon).toBe('telegram');
      expect(result.color).toBe('#229ED9');
    }
  });

  it('detects Instagram on instagram.com and www variants', () => {
    for (const url of ['https://instagram.com/Yori', 'https://www.instagram.com/Yori']) {
      const result = detectSocialPlatform(url);
      expect(result.platform).toBe('instagram');
      expect(result.label).toBe('Instagram');
      expect(result.icon).toBe('instagram');
      expect(result.color).toBe('#E4405F');
    }
  });

  it('detects Facebook on facebook.com and www variants', () => {
    const result = detectSocialPlatform('https://www.facebook.com/Yori');
    expect(result.platform).toBe('facebook');
    expect(result.label).toBe('Facebook');
    expect(result.icon).toBe('facebook');
    expect(result.color).toBe('#1877F2');
  });

  it('detects GitHub on github.com and legitimate subdomains', () => {
    for (const url of ['https://github.com/Yori', 'https://www.github.com/Yori', 'https://gist.github.com/Yori']) {
      const result = detectSocialPlatform(url);
      expect(result.platform).toBe('github');
      expect(result.label).toBe('GitHub');
      expect(result.icon).toBe('github');
      expect(result.color).toBe('#8B949E');
    }
  });

  it('detects YouTube on youtube.com, m.youtube.com and youtu.be', () => {
    for (const url of [
      'https://youtube.com/@Yori',
      'https://www.youtube.com/@Yori',
      'https://m.youtube.com/@Yori',
      'https://youtu.be/abc123',
    ]) {
      const result = detectSocialPlatform(url);
      expect(result.platform).toBe('youtube');
      expect(result.label).toBe('YouTube');
      expect(result.icon).toBe('youtube');
      expect(result.color).toBe('#FF0000');
    }
  });

  it('detects Discord on discord.com and discord.gg', () => {
    for (const url of ['https://discord.com/users/Yori', 'https://www.discord.com/users/Yori', 'https://discord.gg/Yori']) {
      const result = detectSocialPlatform(url);
      expect(result.platform).toBe('discord');
      expect(result.label).toBe('Discord');
      expect(result.icon).toBe('discord');
      expect(result.color).toBe('#5865F2');
    }
  });

  it('detects X on x.com and legacy twitter.com', () => {
    for (const url of ['https://x.com/Yori', 'https://www.x.com/Yori', 'https://twitter.com/Yori']) {
      const result = detectSocialPlatform(url);
      expect(result.platform).toBe('x');
      expect(result.label).toBe('X');
      expect(result.icon).toBe('x');
      expect(result.color).toBe('#E7E9EA');
    }
  });

  it('supports other common platforms', () => {
    const cases = [
      ['https://www.linkedin.com/in/Yori', 'linkedin', '#0A66C2'],
      ['https://www.twitch.tv/Yori', 'twitch', '#9146FF'],
      ['https://www.reddit.com/user/Yori', 'reddit', '#FF4500'],
      ['https://www.tiktok.com/@Yori', 'tiktok', '#FE2C55'],
    ] as const;

    for (const [url, platform, color] of cases) {
      const result = detectSocialPlatform(url);
      expect(result.platform).toBe(platform);
      expect(result.icon).toBe(platform);
      expect(result.color).toBe(color);
    }
  });

  it('returns a generic result for unknown URLs', () => {
    for (const url of [
      'https://example.com/Yori',
      'https://www.example.org/me',
      'https://yori.dev',
    ]) {
      const result = detectSocialPlatform(url);
      expect(result.platform).toBe('generic');
      expect(result.label).toBe('Website');
      expect(result.icon).toBe('generic');
      expect(result.color).toBe('#A1A1AA');
    }
  });

  it('does not misclassify domains that merely contain a platform name', () => {
    for (const url of [
      'https://github.example.com/Yori',
      'https://mygithub.com/Yori',
      'https://x.com.evil.com/Yori',
      'https://www.notfacebook.com/Yori',
      'https://telegram-org.example.com/Yori',
      'https://youtube.evil.com/@Yori',
    ]) {
      expect(detectSocialPlatform(url).platform).toBe('generic');
    }
  });

  it('returns generic for empty, invalid or non-http(s) URLs', () => {
    for (const url of [
      '',
      '    ',
      'javascript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'ftp://x.com/Yori',
      'mailto:Yori@example.com',
    ]) {
      expect(detectSocialPlatform(url).platform).toBe('generic');
    }
  });
});
