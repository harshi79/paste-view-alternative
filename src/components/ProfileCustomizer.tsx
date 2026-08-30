'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import NameDisplay, { type NameStyle, type NameEffect, NAME_EFFECTS } from './NameDisplay';

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
  const label = 'mb-2 block text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500';
  const card = 'card rounded-[28px] p-5 sm:p-6';
  const tabBtn = (active: boolean) =>
    `rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors ${
      active
        ? 'bg-white/10 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]'
        : 'text-zinc-400 hover:bg-white/[0.04] hover:text-white'
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
    { id: 'wave', label: 'Wave', from: '#60a5fa', to: '#a78bfa', effect: 'wave' as const },
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
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_400px] lg:items-start">
      <div className="animate-fade-up space-y-5">
        <div className="card rounded-[28px] px-5 py-5 sm:px-6 sm:py-6">
          <p className="eyebrow">Profile studio</p>
          <h2 className="mt-4 text-3xl font-black tracking-tight text-white">Customize your public presence</h2>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-zinc-400 sm:text-base">
            Fine-tune your avatar, banner, display name, animated effects, links, and profile copy.
            The preview updates live so you can polish the final result before saving.
          </p>
          <div className="mt-5 inline-flex flex-wrap items-center gap-2 rounded-2xl border border-white/[0.08] bg-black/10 p-1">
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
            <h2 className="mb-4 font-bold text-white">Profile</h2>
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
              <h2 className="mb-1 font-bold text-white">Emoji status</h2>
              <p className="mb-3 text-xs text-zinc-500">
                A custom emoji shown beside your name and username. Pick from the selector or type
                your own — remove it any time.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  className={`${input} w-20 shrink-0 text-center text-xl`}
                  value={state.statusEmoji}
                  maxLength={8}
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
                    className="text-xs text-zinc-400 hover:text-white"
                  >
                    remove emoji
                  </button>
                )}
              </div>

              {showEmojiPicker && (
                <div className="animate-pop mt-3 grid max-w-md grid-cols-8 gap-1 rounded-xl border border-white/10 bg-night-900/70 p-2">
                  {STATUS_EMOJIS.map((e) => (
                    <button
                      key={e}
                      type="button"
                      onClick={() => {
                        set('statusEmoji', e);
                        setShowEmojiPicker(false);
                      }}
                      className={`grid h-9 w-9 place-items-center rounded-lg text-lg transition hover:bg-white/10 ${
                        state.statusEmoji === e ? 'bg-brand-500/25 ring-1 ring-brand-400/60' : ''
                      }`}
                    >
                      {e}
                    </button>
                  ))}
                </div>
              )}

              <div className="mt-3">
                <label className={label}>Status text (optional)</label>
                <div className="flex items-center gap-2">
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
                      className="shrink-0 text-xs text-zinc-400 hover:text-white"
                    >
                      clear
                    </button>
                  )}
                </div>
              </div>
            </div>

            <hr className="my-5 border-white/5" />

            <h2 className="mb-4 font-bold text-white">Media (URLs only)</h2>
            <p className="mb-4 text-xs text-zinc-500">
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
                    remove avatar
                  </button>
                )}
              </div>

              <div>
                <label className={label}>Banner</label>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    className={`${input} w-auto`}
                    value={state.bannerType}
                    onChange={(e) => set('bannerType', e.target.value as 'image' | 'video')}
                  >
                    <option value="image">Image URL</option>
                    <option value="video">Video URL (.mp4)</option>
                  </select>
                  <input
                    className={`${input} flex-1 min-w-[200px]`}
                    placeholder={
                      state.bannerType === 'video'
                        ? 'https://example.com/loop.mp4'
                        : 'https://example.com/banner.jpg'
                    }
                    value={state.bannerUrl}
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
                <p className="mt-1 text-xs text-zinc-500">
                  Videos must be a direct .mp4 URL. For best results, keep it under 10 MB and use
                  a wide aspect ratio (≥ 1500×500).
                </p>
              </div>

              <div>
                <label className={label}>Accent color</label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    className="h-10 w-16 cursor-pointer rounded-lg border border-white/10 bg-transparent"
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
              <h2 className="mb-4 font-bold text-white">One-click effect templates</h2>
              <div className="flex flex-wrap gap-2">
                {templates.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => applyTemplate(t)}
                    className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-zinc-200 transition hover:border-brand-400/40"
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            <div className={card}>
              <h2 className="mb-4 font-bold text-white">Name styling</h2>
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
                    {NAME_EFFECTS.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.emoji} {e.label}
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
                </div>
                <div className="grid grid-cols-2 gap-4">
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
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-bold text-white">Custom links</h2>
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
                    value={HEX.test(l.color) ? l.color : '#8b5cf6'}
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
        )}

        <div className="flex flex-wrap items-center gap-4">
          <button onClick={save} disabled={busy} className="btn-primary px-8 py-3 text-sm disabled:opacity-60">
            {busy ? 'Saving…' : 'Save changes'}
          </button>
          {saved && <span className="animate-pop text-sm font-semibold text-emerald-400">Saved</span>}
          {error && <span className="text-sm text-red-400">{error}</span>}
        </div>
      </div>

      <div className="lg:sticky lg:top-24 lg:self-start">
        <p className="eyebrow">Live preview</p>
        <div className="animate-fade-up mt-3 overflow-hidden rounded-[28px] border border-white/10 bg-night-900 shadow-2xl shadow-black/50">
          <div className="relative h-36">
            {state.bannerUrl && state.bannerType === 'video' ? (
              <video
                src={state.bannerUrl}
                autoPlay
                muted
                loop
                playsInline
                className="h-full w-full object-cover"
              />
            ) : state.bannerUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={state.bannerUrl}
                alt=""
                className="h-full w-full object-cover"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
              />
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
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
              />
            ) : (
              <span className="grid h-16 w-16 place-items-center rounded-full border-4 border-night-950 bg-gradient-to-br from-brand-500 to-cyan-400 text-xl font-black text-night-950">
                {(state.displayName || username).slice(0, 1).toUpperCase()}
              </span>
            )}
            <h3 className="mt-3 text-2xl font-black tracking-tight">
              {state.statusEmoji && (
                <span className="mr-1.5 inline-block align-[-0.12em] text-[0.85em]">
                  {state.statusEmoji}
                </span>
              )}
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
            <p className="mt-0.5 text-xs text-zinc-500">
              {state.statusEmoji && <span className="mr-1">{state.statusEmoji}</span>}
              @{username}
              {state.statusText && <span className="text-zinc-600"> · {state.statusText}</span>}
            </p>
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
                      style={{
                        borderColor: `${l.color}66`,
                        background: `${l.color}14`,
                        color: l.color,
                      }}
                    >
                      {l.label}
                    </span>
                  ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
