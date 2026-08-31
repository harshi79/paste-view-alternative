'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import NameDisplay from './NameDisplay';
import Avatar from './Avatar';
import { NAME_EFFECTS, EFFECT_CATEGORIES, type NameEffect, type NameStyle } from '@/lib/nameEffects';
import EmojiStatus from './EmojiStatus';
import SocialPlatformIcon from './SocialPlatformIcon';
import { loadStickerPack, type StickerEntry } from '@/lib/stickerPack';
import { detectSocialPlatform } from '@/lib/socialPlatform';

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
  effectSpeed: number;
  effectIntensity: number;
  accent: string;
  links: LinkItem[];
  statusEmoji: string;
  statusText: string;
};

// Curated emoji set for the status picker (faces, hearts, animals, symbols).
const STATUS_EMOJIS = [
  '😀', '😎', '🥳', '🤩', '😇', '🤠', '🫡', '😴',
  '🔥', '⚡', '✨', '🌟', '💫', '☄️', '🌈', '🌊',
  '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '💯',
  '👍', '👋', '🤝', '🙌', '👀', '💪', '🤙', '🫶',
  '🚀', '🎮', '🎧', '🎨', '📚', '☕', '🍕', '🎉',
  '🐱', '🐶', '🦊', '🐼', '🦄', '🐸', '🐝', '🦋',
  '⚽', '🏆', '🎯', '🧠', '💡', '🔒', '🗿', '🌙',
] as const;

const HEX = /^#[0-9a-fA-F]{6}$/;

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
  const [tab, setTab] = useState<'profile' | 'name' | 'links'>('profile');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [statusPickerTab, setStatusPickerTab] = useState<'unicode' | 'stickers'>('unicode');
  const [statusStickers, setStatusStickers] = useState<StickerEntry[]>([]);

  useEffect(() => {
    if (!showEmojiPicker || statusStickers.length > 0) return;
    let cancelled = false;
    loadStickerPack().then((pack) => {
      if (!cancelled) setStatusStickers(pack);
    });
    return () => {
      cancelled = true;
    };
  }, [showEmojiPicker, statusStickers.length]);

  function set<K extends keyof ProfileState>(key: K, value: ProfileState[K]) {
    setState((s) => ({ ...s, [key]: value }));
    setSaved(false);
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

  const input = 'input';
  const label = 'mb-2 block font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-zinc-500';
  const card = 'card rounded-xl p-5 sm:p-6';
  const tabBtn = (active: boolean) =>
    `inline-flex min-h-[2.75rem] flex-1 items-center justify-center rounded-md px-4 py-2.5 text-sm font-bold uppercase tracking-wide transition-all sm:flex-none ${
      active
        ? 'bg-brand-600 text-white shadow-[2px_2px_0_0_var(--vb-ink)]'
        : 'text-zinc-400 hover:bg-white/[0.06] hover:text-white'
    }`;

  // Effect templates — one-click sets the name effect + colors at once.
  const templates = [
    { id: 'cool', label: 'Cool', from: '#22d3ee', to: '#3b82f6', effect: 'shimmer' as const },
    { id: 'warm', label: 'Warm', from: '#fbbf24', to: '#f97316', effect: 'fire' as const },
    { id: 'neon', label: 'Neon', from: '#a78bfa', to: '#22d3ee', effect: 'neon' as const },
    { id: 'rainbow', label: 'Rainbow', from: '#f472b6', to: '#22d3ee', effect: 'rainbow' as const },
    { id: 'gold', label: 'Gold', from: '#fde68a', to: '#b45309', effect: 'gold' as const },
    { id: 'aurora', label: 'Aurora', from: '#4ade80', to: '#a78bfa', effect: 'aurora' as const },
    { id: 'glitch', label: 'Glitch', from: '#f87171', to: '#22d3ee', effect: 'glitch' as const },
    { id: 'float', label: 'Float', from: '#60a5fa', to: '#a78bfa', effect: 'float' as const },
  ];

  function applyTemplate(t: (typeof templates)[number]) {
    setState((s) => ({
      ...s,
      nameFrom: t.from,
      nameTo: t.to,
      nameEffect: t.effect,
    }));
    setSaved(false);
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start">
      <div className="animate-fade-up space-y-5">
        <div className="card rounded-xl px-5 py-5 sm:px-6 sm:py-6">
          <p className="eyebrow">Profile studio</p>
          <h2 className="mt-4 text-3xl font-black uppercase leading-[0.95] tracking-tight text-white sm:text-4xl">
            Customize your public presence
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-zinc-400 sm:text-base">
            Fine-tune your avatar, banner, display name, animated effects, links, and profile copy.
            The preview updates live so you can polish the final result before saving.
          </p>
          <div className="mt-5 flex w-full flex-wrap items-center gap-2 rounded-lg border-2 border-[color:var(--vb-line-soft)] bg-black/30 p-1">
            <button type="button" className={tabBtn(tab === 'profile')} onClick={() => setTab('profile')}>
              Profile & media
            </button>
            <button type="button" className={tabBtn(tab === 'name')} onClick={() => setTab('name')}>
              Name & effects
            </button>
            <button type="button" className={tabBtn(tab === 'links')} onClick={() => setTab('links')}>
              Links
            </button>
          </div>
        </div>

        {tab === 'profile' && (
          <div className={card}>
            <h2 className="mb-4 text-lg font-black uppercase tracking-tight text-white">Profile</h2>
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

            <hr className="my-5 border-white/5" />

            <div>
              <h2 className="mb-1 text-lg font-black uppercase tracking-tight text-white">Emoji status</h2>
              <p className="mb-3 text-xs leading-5 text-zinc-500">
                A custom emoji shown beside your name and username. Pick from the selector or type
                your own — remove it any time.
              </p>
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                <input
                  className={`${input} w-20 shrink-0 text-center text-xl`}
                  value={state.statusEmoji}
                  maxLength={64}
                  placeholder="😎"
                  aria-label="Status emoji"
                  onChange={(e) => set('statusEmoji', e.target.value)}
                />
                <button
                  type="button"
                  className={tabBtn(false)}
                  onClick={() => setShowEmojiPicker((v) => !v)}
                >
                  {showEmojiPicker ? 'Hide emoji picker' : 'Choose emoji'}
                </button>
                {state.statusEmoji && (
                  <button
                    type="button"
                    onClick={() => set('statusEmoji', '')}
                    className="text-left text-xs text-zinc-400 hover:text-white"
                  >
                    Remove emoji
                  </button>
                )}
              </div>

              {showEmojiPicker && (
                <div className="animate-pop mt-3 max-w-md rounded-lg border-2 border-[color:var(--vb-line)] bg-[color:var(--vb-panel-2)] p-2 shadow-[4px_4px_0_0_var(--vb-ink)]">
                  <div className="mb-2 flex gap-1 rounded-md border border-[color:var(--vb-line-soft)] bg-black/30 p-1">
                    <button
                      type="button"
                      onClick={() => setStatusPickerTab('unicode')}
                      className={tabBtn(statusPickerTab === 'unicode')}
                    >
                      Emoji
                    </button>
                    <button
                      type="button"
                      onClick={() => setStatusPickerTab('stickers')}
                      className={tabBtn(statusPickerTab === 'stickers')}
                    >
                      Custom stickers & GIFs
                    </button>
                  </div>
                  {statusPickerTab === 'unicode' ? (
                    <div className="grid grid-cols-6 gap-1 sm:grid-cols-8">
                      {STATUS_EMOJIS.map((emoji) => (
                        <button
                          key={emoji}
                          type="button"
                          title={emoji}
                          onClick={() => {
                            set('statusEmoji', emoji);
                            setShowEmojiPicker(false);
                          }}
                          className={`grid h-9 w-9 place-items-center rounded-md text-lg transition hover:bg-white/10 ${
                            state.statusEmoji === emoji ? 'bg-brand-600/40 ring-2 ring-brand-400/80' : ''
                          }`}
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  ) : statusStickers.length === 0 ? (
                    <p className="px-2 py-3 text-xs text-zinc-500">Loading sticker pack…</p>
                  ) : (
                    <div className="grid max-h-56 grid-cols-5 gap-1 overflow-y-auto sm:grid-cols-7">
                      {statusStickers.map((sticker) => (
                        <button
                          key={sticker.token}
                          type="button"
                          title={`${sticker.token} — ${sticker.label}`}
                          onClick={() => {
                            set('statusEmoji', sticker.token.toLowerCase());
                            setShowEmojiPicker(false);
                          }}
                          className={`grid h-11 w-11 place-items-center rounded-md text-xl transition hover:bg-white/10 ${
                            state.statusEmoji.toLowerCase() === sticker.token.toLowerCase()
                              ? 'bg-brand-600/40 ring-2 ring-brand-400/80'
                              : ''
                          }`}
                        >
                          <EmojiStatus value={sticker.token} pack={statusStickers} />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="mt-3">
                <label className={label}>Status text (optional)</label>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <input
                    className={input}
                    maxLength={60}
                    placeholder="What are you up to?"
                    value={state.statusText}
                    onChange={(e) => set('statusText', e.target.value)}
                  />
                  {state.statusText && (
                    <button
                      type="button"
                      onClick={() => set('statusText', '')}
                      className="shrink-0 text-left text-xs text-zinc-400 hover:text-white sm:text-right"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>
            </div>

            <hr className="my-5 border-white/5" />

            <h2 className="mb-4 text-lg font-black uppercase tracking-tight text-white">Media (URLs only)</h2>
            <p className="mb-4 text-xs leading-5 text-zinc-500">
              Direct uploads are disabled to keep the database small. Host your avatar and banner
              anywhere (your own CDN, Discord, Imgur, catbox, etc.) and paste the URL below.
            </p>
            <div className="space-y-4">
              <div>
                <label className={label}>Avatar URL</label>
                <input
                  className={input}
                  placeholder="https://example.com/avatar.png"
                  value={state.avatarUrl}
                  onChange={(e) => set('avatarUrl', e.target.value)}
                />
                {state.avatarUrl && (
                  <button
                    type="button"
                    onClick={() => set('avatarUrl', '')}
                    className="mt-1 text-xs text-zinc-400 hover:text-white"
                  >
                    Remove avatar
                  </button>
                )}
              </div>

              <div>
                <label className={label}>Banner</label>
                <div className="grid gap-2 sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)_auto] sm:items-center">
                  <select
                    className={input}
                    value={state.bannerType}
                    onChange={(e) => set('bannerType', e.target.value as 'image' | 'video')}
                  >
                    <option value="image">Image URL</option>
                    <option value="video">Video URL (.mp4)</option>
                  </select>
                  <input
                    className={input}
                    placeholder={
                      state.bannerType === 'video'
                        ? 'https://example.com/loop.mp4'
                        : 'https://example.com/banner.jpg'
                    }
                    value={state.bannerUrl}
                    onChange={(e) => set('bannerUrl', e.target.value)}
                  />
                  {state.bannerUrl ? (
                    <button
                      type="button"
                      onClick={() => set('bannerUrl', '')}
                      className="btn-ghost !rounded-md !px-3.5 !py-2 text-xs uppercase tracking-wide sm:w-auto"
                    >
                      Remove
                    </button>
                  ) : (
                    <div className="hidden sm:block" />
                  )}
                </div>
                <p className="mt-1 text-xs text-zinc-500">
                  Videos must be a direct .mp4 URL. For best results, keep it under 10 MB and use
                  a wide aspect ratio (≥ 1500×500).
                </p>
              </div>

              <div>
                <label className={label}>Accent color</label>
                <div className="flex flex-wrap items-center gap-3">
                  <input
                    type="color"
                    className="h-10 w-16 cursor-pointer rounded-md border-2 border-[color:var(--vb-line)] bg-transparent"
                    value={state.accent}
                    onChange={(e) => set('accent', e.target.value)}
                  />
                  <span className="font-mono text-xs text-zinc-500">{state.accent}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {tab === 'name' && (
          <>
            <div className={card}>
              <h2 className="mb-4 text-lg font-black uppercase tracking-tight text-white">One-click effect templates</h2>
              <div className="flex flex-wrap gap-2">
                {templates.map((template) => (
                  <button
                    key={template.id}
                    type="button"
                    onClick={() => applyTemplate(template)}
                    className="rounded-md border-2 border-[color:var(--vb-line)] bg-[color:var(--vb-panel-2)] px-3 py-2 text-xs font-bold uppercase tracking-wide text-zinc-200 transition-all hover:-translate-x-px hover:-translate-y-px hover:border-brand-400/60 hover:bg-[#1a1a24] hover:shadow-[2px_2px_0_0_var(--vb-ink)]"
                  >
                    {template.label}
                  </button>
                ))}
              </div>
            </div>

            <div className={card}>
              <h2 className="mb-4 text-lg font-black uppercase tracking-tight text-white">Name styling</h2>
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
                    {EFFECT_CATEGORIES.map((category) => {
                      const items = NAME_EFFECTS.filter((effect) => effect.category === category);
                      if (items.length === 0) return null;
                      return (
                        <optgroup key={category} label={category}>
                          {items.map((effect) => (
                            <option key={effect.id} value={effect.id}>
                              {effect.emoji} {effect.label}
                            </option>
                          ))}
                        </optgroup>
                      );
                    })}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={label}>Color A</label>
                    <input
                      type="color"
                      className="h-10 w-16 cursor-pointer rounded-md border-2 border-[color:var(--vb-line)] bg-transparent"
                      value={state.nameFrom}
                      onChange={(e) => set('nameFrom', e.target.value)}
                    />
                  </div>
                  <div>
                    <label className={label}>Color B</label>
                    <input
                      type="color"
                      className="h-10 w-16 cursor-pointer rounded-md border-2 border-[color:var(--vb-line)] bg-transparent"
                      value={state.nameTo}
                      onChange={(e) => set('nameTo', e.target.value)}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className={label}>
                      Speed <span className="font-mono text-zinc-500">{state.effectSpeed}</span>
                    </label>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={state.effectSpeed}
                      onChange={(e) => set('effectSpeed', Number(e.target.value))}
                      className="w-full accent-brand-500"
                    />
                  </div>
                  <div>
                    <label className={label}>
                      Intensity <span className="font-mono text-zinc-500">{state.effectIntensity}</span>
                    </label>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={state.effectIntensity}
                      onChange={(e) => set('effectIntensity', Number(e.target.value))}
                      className="w-full accent-brand-500"
                    />
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {tab === 'links' && (
          <div className={card}>
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="font-bold text-white">Custom links</h2>
              <button
                type="button"
                onClick={() =>
                  state.links.length < 6 &&
                  set('links', [...state.links, { label: '', url: '', color: state.accent }])
                }
                disabled={state.links.length >= 6}
                className="btn-ghost !rounded-xl !px-3.5 !py-2 text-xs disabled:opacity-40"
              >
                + Add link
              </button>
            </div>
            <div className="space-y-3">
              {state.links.length === 0 && (
                <p className="feedback-note text-sm">No links yet — add up to 6 colored links.</p>
              )}
              {state.links.map((link, i) => (
                <div key={i} className="grid gap-2 sm:grid-cols-[auto_9rem_minmax(0,1fr)_auto] sm:items-center">
                  <input
                    type="color"
                    className="h-9 w-11 shrink-0 cursor-pointer rounded-lg border border-white/10 bg-transparent"
                    value={HEX.test(link.color) ? link.color : '#8b5cf6'}
                    onChange={(e) => {
                      const links = [...state.links];
                      links[i] = { ...link, color: e.target.value };
                      set('links', links);
                    }}
                  />
                  <input
                    className={input}
                    placeholder="Label"
                    maxLength={40}
                    value={link.label}
                    onChange={(e) => {
                      const links = [...state.links];
                      links[i] = { ...link, label: e.target.value };
                      set('links', links);
                    }}
                  />
                  <div className="relative min-w-0">
                    {link.url.trim() && (
                      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500">
                        <SocialPlatformIcon
                          platform={detectSocialPlatform(link.url).icon}
                          className="h-4 w-4"
                        />
                      </span>
                    )}
                    <input
                      className={`${input} ${link.url.trim() ? 'pl-9' : ''}`}
                      placeholder="https://…"
                      value={link.url}
                      onChange={(e) => {
                        const links = [...state.links];
                        links[i] = { ...link, url: e.target.value };
                        set('links', links);
                      }}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => set('links', state.links.filter((_, j) => j !== i))}
                    className="btn-danger !rounded-xl !px-3 !py-2 text-xs"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="card flex flex-col items-start gap-3 rounded-xl p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-bold text-white">Apply your changes</p>
            <p className="mt-0.5 text-xs text-zinc-500">
              Everything on the left updates the live preview instantly.
            </p>
          </div>
          <div className="flex w-full flex-col items-start gap-3 sm:w-auto sm:flex-row sm:items-center">
            <button onClick={save} disabled={busy} className="btn-primary w-full px-8 py-3 text-sm disabled:opacity-60 sm:w-auto">
              {busy ? 'Saving…' : 'Save changes'}
            </button>
            {saved && (
              <span className="feedback-success animate-pop px-4 py-2 text-sm font-semibold">Saved</span>
            )}
            {error && <span className="feedback-error px-4 py-2 text-sm">{error}</span>}
          </div>
        </div>
      </div>

      <div className="lg:sticky lg:top-24 lg:self-start">
        <div className="flex items-center justify-between gap-3">
          <p className="eyebrow">Live preview</p>
          <span className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-600">
            Updates as you type
          </span>
        </div>
        {/* Mirrors the public /u/[username] hero: banner → framed avatar
            overlapping the banner edge → aligned name/status row → bio →
            links, so what you see here is what visitors will see. */}
        <div className="animate-fade-up card mt-3 overflow-hidden rounded-xl">
          <div
            className="profile-banner-fallback relative h-24 sm:h-28"
            style={
              {
                '--pf-from': state.nameFrom,
                '--pf-accent': state.accent,
                '--pf-to': state.nameTo,
              } as CSSProperties
            }
          >
            {state.bannerUrl && state.bannerType === 'video' ? (
              <video
                src={state.bannerUrl}
                autoPlay
                muted
                loop
                playsInline
                className="absolute inset-0 h-full w-full object-cover"
              />
            ) : state.bannerUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={state.bannerUrl}
                alt=""
                className="absolute inset-0 h-full w-full object-cover"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
              />
            ) : null}
            <div className="absolute inset-0 bg-gradient-to-t from-night-950/95 via-night-950/30 to-transparent" />
          </div>
          <div className="px-4 pb-5 pt-4">
            <div className="flex min-w-0 items-start gap-3.5">
              <div className="-mt-10 w-fit shrink-0 rounded-xl border-2 border-[color:var(--vb-line)] bg-[color:var(--vb-panel)] p-1 shadow-[4px_4px_0_0_var(--vb-ink)] sm:-mt-11">
                <Avatar
                  value={state.avatarUrl || null}
                  label={state.displayName || username}
                  className="h-16 w-16 sm:h-[4.5rem] sm:w-[4.5rem]"
                />
              </div>
              <div className="min-w-0 pt-0.5">
                {/* Mirrors the public profile header: display name → status
                    emoji/GIF in one aligned row (inline-flex + items-center). */}
                <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1.5">
                  <h3 className="inline-flex min-w-0 max-w-full items-center break-words text-xl font-black uppercase leading-[1.1] tracking-tight sm:text-2xl">
                    <NameDisplay
                      text={state.displayName || username}
                      from={state.nameFrom}
                      to={state.nameTo}
                      style={state.nameStyle}
                      effect={state.nameEffect}
                      speed={state.effectSpeed}
                      intensity={state.effectIntensity}
                    />
                  </h3>
                  {/* Status emoji/GIF sits after the display name, matching the profile page. */}
                  <EmojiStatus
                    value={state.statusEmoji}
                    pack={statusStickers.length > 0 ? statusStickers : undefined}
                    className="inline-flex shrink-0 items-center text-lg leading-none sm:text-xl"
                    title={state.statusText || 'Status'}
                  />
                </div>
                <p className="mt-1.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[11px] leading-5 text-zinc-400">
                  <span className="font-bold text-zinc-300">@{username}</span>
                  {state.statusText && (
                    <>
                      <span aria-hidden className="text-zinc-600">·</span>
                      <span className="min-w-0 break-words text-zinc-400">{state.statusText}</span>
                    </>
                  )}
                </p>
                {state.bioEnabled && state.bio && (
                  <p
                    className="mt-3 whitespace-pre-wrap border-l-4 pl-3 text-sm leading-6 text-zinc-300"
                    style={{ borderColor: `${state.accent}cc` }}
                  >
                    {state.bio}
                  </p>
                )}
                {state.links.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {state.links
                      .filter((link) => link.url.trim())
                      .map((link, i) => {
                        const detected = detectSocialPlatform(link.url);
                        const label = (link.label ?? '').trim() || detected.label;
                        const accent = detected.color;
                        return (
                          <span
                            key={i}
                            className="profile-link"
                            style={{ '--link-accent': accent } as CSSProperties}
                          >
                            <span className="profile-link__icon">
                              <SocialPlatformIcon platform={detected.icon} className="h-3.5 w-3.5" />
                            </span>
                            <span className="profile-link__label">{label}</span>
                            <span className="profile-link__arrow" aria-hidden>
                              ↗
                            </span>
                          </span>
                        );
                      })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
