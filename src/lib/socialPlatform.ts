/**
 * Centralized detection for profile links on supported social platforms.
 *
 * Detection is intentionally URL/hostname based and conservative:
 *  - matches real platform domains (plus their legitimate subdomains)
 *  - rejects lookalike domains or anything that merely contains a brand name
 *  - always returns a generic result for unknown, invalid or non-http(s) URLs
 *
 * The helper is pure and safe to use on both the server and in the client.
 */

export type SocialPlatformName =
  | 'telegram'
  | 'instagram'
  | 'facebook'
  | 'github'
  | 'youtube'
  | 'discord'
  | 'x'
  | 'linkedin'
  | 'twitch'
  | 'reddit'
  | 'tiktok'
  | 'generic';

export type SocialPlatformInfo = {
  platform: SocialPlatformName;
  label: string;
  icon: string;
  color: string;
};

type PlatformDefinition = SocialPlatformInfo & {
  hosts: string[];
};

const GENERIC: SocialPlatformInfo = {
  platform: 'generic',
  label: 'Website',
  icon: 'generic',
  color: '#A1A1AA',
};

const PLATFORMS: PlatformDefinition[] = [
  {
    platform: 'telegram',
    label: 'Telegram',
    icon: 'telegram',
    color: '#229ED9',
    hosts: ['t.me', 'telegram.me'],
  },
  {
    platform: 'instagram',
    label: 'Instagram',
    icon: 'instagram',
    color: '#E4405F',
    hosts: ['instagram.com'],
  },
  {
    platform: 'facebook',
    label: 'Facebook',
    icon: 'facebook',
    color: '#1877F2',
    hosts: ['facebook.com', 'fb.com', 'fb.watch'],
  },
  {
    platform: 'github',
    label: 'GitHub',
    icon: 'github',
    color: '#8B949E',
    hosts: ['github.com'],
  },
  {
    platform: 'youtube',
    label: 'YouTube',
    icon: 'youtube',
    color: '#FF0000',
    hosts: ['youtube.com', 'youtu.be'],
  },
  {
    platform: 'discord',
    label: 'Discord',
    icon: 'discord',
    color: '#5865F2',
    hosts: ['discord.com', 'discord.gg'],
  },
  {
    platform: 'x',
    label: 'X',
    icon: 'x',
    color: '#E7E9EA',
    hosts: ['x.com', 'twitter.com'],
  },
  {
    platform: 'linkedin',
    label: 'LinkedIn',
    icon: 'linkedin',
    color: '#0A66C2',
    hosts: ['linkedin.com'],
  },
  {
    platform: 'twitch',
    label: 'Twitch',
    icon: 'twitch',
    color: '#9146FF',
    hosts: ['twitch.tv'],
  },
  {
    platform: 'reddit',
    label: 'Reddit',
    icon: 'reddit',
    color: '#FF4500',
    hosts: ['reddit.com'],
  },
  {
    platform: 'tiktok',
    label: 'TikTok',
    icon: 'tiktok',
    color: '#FE2C55',
    hosts: ['tiktok.com'],
  },
];

function hostMatches(hostname: string, hosts: string[]): boolean {
  return hosts.some((host) => hostname === host || hostname.endsWith(`.${host}`));
}

/**
 * Detect the social platform for a profile link.
 *
 * Returns a generic result when the URL is unknown, invalid, or uses a
 * non-http(s) protocol. `www.` and legitimate subdomains of the supported
 * platform domains are recognized, while lookalike/embedding domains are not.
 */
export function detectSocialPlatform(url: string): SocialPlatformInfo {
  const value = url?.trim() ?? '';
  if (!value) return GENERIC;

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    // Be tolerant while a user is still typing a link in the editor.
    try {
      parsed = new URL(`https://${value}`);
    } catch {
      return GENERIC;
    }
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return GENERIC;
  }

  const hostname = parsed.hostname.toLowerCase().replace(/\.$/, '');
  for (const platform of PLATFORMS) {
    if (hostMatches(hostname, platform.hosts)) {
      return {
        platform: platform.platform,
        label: platform.label,
        icon: platform.icon,
        color: platform.color,
      };
    }
  }

  return GENERIC;
}
