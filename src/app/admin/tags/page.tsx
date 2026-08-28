import type { Metadata } from 'next';
import { asc } from 'drizzle-orm';
import { requireAdmin } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { tags } from '@/lib/db/schema';
import AdminNav from '@/components/AdminNav';
import TagsAdminClient from '@/components/TagsAdminClient';

export const metadata: Metadata = { title: 'Tags · Admin' };
export const dynamic = 'force-dynamic';

export default async function AdminTagsPage() {
  await requireAdmin();
  const db = await getDb();
  const rows = await db.select().from(tags).orderBy(asc(tags.label));
  return (
    <div className="pt-10">
      <AdminNav active="/admin/tags" />
      <h1 className="mt-6 text-2xl font-black tracking-tight text-white">Tags</h1>
      <p className="mt-1 text-sm text-zinc-400">
        Create the tag library you can award to any user. Each tag has a label, a color, and an
        optional effect.
      </p>
      <TagsAdminClient initial={rows} />
    </div>
  );
}
