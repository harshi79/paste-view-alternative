import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth';
import BookmarksList from '@/components/BookmarksList';

export const metadata: Metadata = { title: 'Saved posts' };
export const dynamic = 'force-dynamic';

export default async function BookmarksPage() {
  // Same server-side auth convention as /notifications: the page guard
  // redirects signed-out visitors to /login, and the client component
  // then talks to the session-scoped bookmarks endpoint for its data
  // and mutations.
  await requireUser();
  return <BookmarksList />;
}
