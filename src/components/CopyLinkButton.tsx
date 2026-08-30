'use client';

import { useState } from 'react';

/**
 * Renders a "Copy link" button that, on click, copies the full
 * paste URL to the clipboard. The actual URL is only computed in
 * the browser (so it never appears in the initial HTML).
 */
export default function CopyLinkButton({ id }: { id: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    const url = `${window.location.origin}/p/${id}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = url;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  return (
    <button
      type="button"
      onClick={copy}
      className="btn-primary !px-3.5 !py-2 text-xs font-semibold"
    >
      {copied ? '✓ Link copied' : 'Copy link'}
    </button>
  );
}
