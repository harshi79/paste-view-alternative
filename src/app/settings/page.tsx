import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth';
import ProfileCustomizer from '@/components/ProfileCustomizer';

export const metadata: Metadata = { title: 'Customize profile' };
export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const { user, profile } = await requireUser();

  return (
    <div className="pt-10">
      <div className="animate-fade-up mb-8">
        <h1 className="text-3xl font-black tracking-tight text-white">Profile settings</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Configure your avatar, banner, animated name and links. Changes preview live.
        </p>
      </div>

      <ProfileCustomizer
        username={user.username}
        initial={{
          displayName: profile.displayName ?? '',
          bio: profile.bio ?? '',
          bioEnabled: profile.bioEnabled,
          avatarUrl: profile.avatarUrl ?? '',
          bannerUrl: profile.bannerUrl ?? '',
          bannerType: profile.bannerType as 'image' | 'video',
          nameFrom: profile.nameFrom,
          nameTo: profile.nameTo,
          nameStyle: profile.nameStyle as 'solid' | 'gradient',
          nameEffect: profile.nameEffect as 'none' | 'typewriter' | 'shimmer' | 'neon' | 'rainbow' | 'fire' | 'glitch' | 'wave' | 'aurora' | 'gold',
          effectSpeed: profile.effectSpeed,
          effectIntensity: profile.effectIntensity,
          accent: profile.accent,
          links: profile.links ?? [],
        }}
      />
    </div>
  );
}
