'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import NameDisplay, { type NameStyle, type NameEffect } from './NameDisplay';
import { formatBytes } from '@/lib/format';

type LinkItem = { label: string; url: string; color: string };

type ProfileState = {
  displayName: string;
  bio: string;
  bioEnabled: boolean;
  avatarUrl: string;
  bannerUrl: string;
  bannerType: 'image' | 'video';
  nameFrom: string;
  nameTo: string;
  nameStyle: NameStyle;
  nameEffect: NameEffect;
  accent: string;
  links: LinkItem[];
};

const EFFECTS: { id: NameEffect; label: string }[] = [
  { id: 'none', label: 'None' },
  { id: 'typewriter', label: '⌨️ Typewriter' },
  { id: 'shimmer', label: '🌊 Shimmer' },
  { id: 'neon', label: '💡 Neon glow' },
  { id: 'rainbow', label: '🌈 Rainbow' },
];

/** Resize an uploaded image client-side and return a JPEG data URL. */
function fileToDataUrl(file: File, maxW: number, maxH: number, quality: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read file'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Could not load image'));
      img.onload = () => {
        const scale = Math.min(1, maxW / img.width, maxH / img.height);
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('Canvas unavailable'));
        ctx.fillStyle = '#0a0a14'; // flatten transparency onto the app background
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

export default function ProfileCustomizer({
  username,
  initial,
}: {
  username: string;
  initial: ProfileState;
}) {
  const router = useRouter();
  const [state, setState] = useState<ProfileState>(initial);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const avatarInput = useRef<HTMLInputElement>(null);
  const bannerInput = useRef<HTMLInputElement>(null);

  function set<K extends keyof ProfileState>(key: K, value: ProfileState[K]) {
    setState((s) => ({ ...s, [key]: value }));
    setSaved(false);
  }

  async function uploadAvatar(file: File) {
    setError('');
    try {
      const dataUrl = await fileToDataUrl(file, 256, 256, 0.85);
      if (dataUrl.length > 200_000) {
        setError('Avatar is too large even after resizing — try a smaller image.');
        return;
      }
      set('avatarUrl', dataUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    }
  }

  async function uploadBanner(file: File) {
    setError('');
    try {
      const dataUrl = await fileToDataUrl(file, 1600, 700, 0.78);
      if (dataUrl.length > 600_000) {
        setError('Banner is too large even after resizing — try a smaller image.');
        return;
      }
      setState((s) => ({ ...s, bannerUrl: dataUrl, bannerType: 'image' }));
      setSaved(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    }
  }

  async function save() {
    setBusy(true);
    setError('');
    const res = await fetch('/api/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(state),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(data.error || 'Could not save.');
      return;
    }
    setSaved(true);
    router.refresh();
  }

  const input =
    'w-full rounded-xl border border-white/10 bg-night-800 px-3.5 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 outline-none focus:border-brand-400/60 focus:ring-2 focus:ring-brand-500/20';
  const label = 'mb-1.5 block text-xs font-semibold uppercase tracking-wider text-zinc-400';
  const card = 'rounded-2xl border border-white/10 bg-night-800/60 p-5 backdrop-blur';

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_380px]">
      {/* ---------------- controls ---------------- */}
      <div className="animate-fade-up space-y-5">
        {/* identity */}
        <div className={card}>
          <h2 className="mb-4 font-bold text-white">👤 Identity</h2>
          <div className="space-y-4">
            <div>
              <label className={label}>Display name</label>
              <input
                className={input}
                maxLength={40}
                value={state.displayName}
                placeholder={username}
                onChange={(e) => set('displayName', e.target.value)}
              />
            </div>
            <div>
              <label className={label}>About me</label>
              <textarea
                className={`${input} min-h-[90px] resize-y`}
                maxLength={1000}
                value={state.bio}
                placeholder="Tell visitors about yourself…"
                onChange={(e) => set('bio', e.target.value)}
              />
              <label className="mt-2 flex w-fit cursor-pointer items-center gap-2 text-sm text-zinc-300">
                <input
                  type="checkbox"
                  checked={state.bioEnabled}
                  onChange={(e) => set('bioEnabled', e.target.checked)}
                  className="h-4 w-4 accent-brand-500"
                />
                Show “About me” on my profile
              </label>
            </div>
          </div>
        </div>

        {/* name styling */}
        <div className={card}>
          <h2 className="mb-4 font-bold text-white">🎨 Name styling</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={label}>Color style</label>
              <select
                className={input}
                value={state.nameStyle}
                onChange={(e) => set('nameStyle', e.target.value as NameStyle)}
              >
                <option value="gradient">Gradient</option>
                <option value="solid">Solid</option>
              </select>
            </div>
            <div>
              <label className={label}>Effect</label>
              <select
                className={input}
                value={state.nameEffect}
                onChange={(e) => set('nameEffect', e.target.value as NameEffect)}
              >
                {EFFECTS.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-4">
              <div>
                <label className={label}>Color A</label>
                <input
                  type="color"
                  className="h-10 w-16 cursor-pointer rounded-lg border border-white/10 bg-transparent"
                  value={state.nameFrom}
                  onChange={(e) => set('nameFrom', e.target.value)}
                />
              </div>
              <div>
                <label className={label}>Color B</label>
                <input
                  type="color"
                  className="h-10 w-16 cursor-pointer rounded-lg border border-white/10 bg-transparent"
                  value={state.nameTo}
                  onChange={(e) => set('nameTo', e.target.value)}
                />
              </div>
              <div>
                <label className={label}>Accent</label>
                <input
                  type="color"
                  className="h-10 w-16 cursor-pointer rounded-lg border border-white/10 bg-transparent"
                  value={state.accent}
                  onChange={(e) => set('accent', e.target.value)}
                />
              </div>
            </div>
          </div>
        </div>

        {/* avatar & banner */}
        <div className={card}>
          <h2 className="mb-4 font-bold text-white">🖼 Avatar & banner</h2>
          <div className="space-y-4">
            <div>
              <label className={label}>Profile picture</label>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => avatarInput.current?.click()}
                  className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-zinc-200 hover:bg-white/10"
                >
                  ⬆ Upload image
                </button>
                <input
                  ref={avatarInput}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(e) => e.target.files?.[0] && uploadAvatar(e.target.files[0])}
                />
                <input
                  className={`${input} flex-1 min-w-[200px]`}
                  placeholder="…or paste an https:// image URL"
                  value={state.avatarUrl.startsWith('data:') ? '(uploaded image)' : state.avatarUrl}
                  onChange={(e) => set('avatarUrl', e.target.value)}
                />
                {state.avatarUrl && (
                  <button
                    type="button"
                    onClick={() => set('avatarUrl', '')}
                    className="text-xs text-zinc-400 hover:text-white"
                  >
                    remove
                  </button>
                )}
              </div>
            </div>

            <div>
              <label className={label}>Profile banner (image or video)</label>
              <div className="flex flex-wrap items-center gap-3">
                <select
                  className={`${input} w-auto`}
                  value={state.bannerType}
                  onChange={(e) => set('bannerType', e.target.value as 'image' | 'video')}
                >
                  <option value="image">Image</option>
                  <option value="video">Video (mp4 URL)</option>
                </select>
                <button
                  type="button"
                  onClick={() => bannerInput.current?.click()}
                  className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-zinc-200 hover:bg-white/10"
                >
                  ⬆ Upload image
                </button>
                <input
                  ref={bannerInput}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(e) => e.target.files?.[0] && uploadBanner(e.target.files[0])}
                />
                <input
                  className={`${input} flex-1 min-w-[200px]`}
                  placeholder={
                    state.bannerType === 'video'
                      ? 'https://example.com/loop.mp4'
                      : 'https://example.com/banner.jpg'
                  }
                  value={state.bannerUrl.startsWith('data:') ? '(uploaded image)' : state.bannerUrl}
                  onChange={(e) => set('bannerUrl', e.target.value)}
                />
                {state.bannerUrl && (
                  <button
                    type="button"
                    onClick={() => set('bannerUrl', '')}
                    className="text-xs text-zinc-400 hover:text-white"
                  >
                    remove
                  </button>
                )}
              </div>
              <p className="mt-2 text-xs text-zinc-500">
                Videos must be a direct .mp4 URL (host it anywhere). Uploaded images are resized
                automatically.
              </p>
            </div>
          </div>
        </div>

        {/* links */}
        <div className={card}>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-bold text-white">🔗 Custom links</h2>
            <button
              type="button"
              onClick={() =>
                state.links.length < 6 &&
                set('links', [...state.links, { label: '', url: '', color: state.accent }])
              }
              disabled={state.links.length >= 6}
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-zinc-200 hover:bg-white/10 disabled:opacity-40"
            >
              + Add link
            </button>
          </div>
          <div className="space-y-3">
            {state.links.length === 0 && (
              <p className="text-sm text-zinc-500">No links yet — add up to 6 colored links.</p>
            )}
            {state.links.map((l, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2">
                <input
                  type="color"
                  className="h-9 w-11 shrink-0 cursor-pointer rounded-lg border border-white/10 bg-transparent"
                  value={l.color}
                  onChange={(e) => {
                    const links = [...state.links];
                    links[i] = { ...l, color: e.target.value };
                    set('links', links);
                  }}
                />
                <input
                  className={`${input} w-32`}
                  placeholder="Label"
                  maxLength={40}
                  value={l.label}
                  onChange={(e) => {
                    const links = [...state.links];
                    links[i] = { ...l, label: e.target.value };
                    set('links', links);
                  }}
                />
                <input
                  className={`${input} flex-1 min-w-[180px]`}
                  placeholder="https://…"
                  value={l.url}
                  onChange={(e) => {
                    const links = [...state.links];
                    links[i] = { ...l, url: e.target.value };
                    set('links', links);
                  }}
                />
                <button
                  type="button"
                  onClick={() => set('links', state.links.filter((_, j) => j !== i))}
                  className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-2 text-xs text-zinc-300 hover:bg-red-500/10 hover:text-red-300"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* save */}
        <div className="flex items-center gap-4">
          <button
            onClick={save}
            disabled={busy}
            className="rounded-xl bg-gradient-to-r from-brand-500 to-brand-600 px-8 py-3 text-sm font-bold text-white shadow-lg shadow-brand-600/40 transition hover:brightness-110 disabled:opacity-60"
          >
            {busy ? 'Saving…' : 'Save profile 💾'}
          </button>
          {saved && <span className="animate-pop text-sm font-semibold text-emerald-400">Saved ✓</span>}
          {error && <span className="text-sm text-red-400">{error}</span>}
        </div>
      </div>

      {/* ---------------- live preview ---------------- */}
      <div className="lg:sticky lg:top-20 lg:self-start">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
          Live preview
        </p>
        <div className="animate-fade-up overflow-hidden rounded-3xl border border-white/10 bg-night-900 shadow-2xl shadow-black/50">
          <div className="relative h-36">
            {state.bannerUrl && state.bannerType === 'video' && !state.bannerUrl.startsWith('data:') ? (
              <video src={state.bannerUrl} autoPlay muted loop playsInline className="h-full w-full object-cover" />
            ) : state.bannerUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={state.bannerUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <div
                className="h-full w-full"
                style={{
                  background: `linear-gradient(120deg, ${state.nameFrom}33, ${state.accent}55 45%, ${state.nameTo}33)`,
                }}
              />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-night-950/90 to-transparent" />
          </div>
          <div className="relative -mt-8 px-5 pb-5">
            {state.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={state.avatarUrl}
                alt=""
                className="h-16 w-16 rounded-full border-4 border-night-950 object-cover shadow-xl"
                style={{ boxShadow: `0 6px 30px ${state.accent}55` }}
              />
            ) : (
              <span className="grid h-16 w-16 place-items-center rounded-full border-4 border-night-950 bg-gradient-to-br from-brand-500 to-cyan-400 text-xl font-black text-night-950">
                {(state.displayName || username).slice(0, 1).toUpperCase()}
              </span>
            )}
            <h3 className="mt-3 text-2xl font-black tracking-tight">
              <NameDisplay
                text={state.displayName || username}
                from={state.nameFrom}
                to={state.nameTo}
                style={state.nameStyle}
                effect={state.nameEffect}
              />
            </h3>
            <p className="mt-0.5 text-xs text-zinc-500">@{username}</p>
            {state.bioEnabled && state.bio && (
              <p className="mt-3 whitespace-pre-wrap text-sm text-zinc-300">{state.bio}</p>
            )}
            {state.links.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {state.links
                  .filter((l) => l.label)
                  .map((l, i) => (
                    <span
                      key={i}
                      className="rounded-full border px-3 py-1 text-xs font-semibold"
                      style={{ borderColor: `${l.color}66`, background: `${l.color}14`, color: l.color }}
                    >
                      🔗 {l.label}
                    </span>
                  ))}
              </div>
            )}
          </div>
        </div>
        <p className="mt-3 text-center text-xs text-zinc-600">
          Uploads resize to ≤{formatBytes(200_000)} (avatar) / ≤{formatBytes(600_000)} (banner)
        </p>
      </div>
    </div>
  );
}
