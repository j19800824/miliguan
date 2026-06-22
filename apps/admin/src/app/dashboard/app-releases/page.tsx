import PageContainer from '@/components/layout/page-container';
import { requirePermission } from '@/lib/auth/server';
import { listAppReleases } from '@/lib/database.js';
import {
  AppReleasesClient,
  type AppRelease
} from '@/features/app-releases/components/app-releases-client';

export const metadata = {
  title: '米粒冠后台 - 应用发布'
};
export const dynamic = 'force-dynamic';

export default async function AppReleasesPage() {
  const user = await requirePermission('app-releases:view');
  const releases = (await listAppReleases('android')) as AppRelease[];
  const canEdit = user.permissions.includes('app-releases:edit');

  return (
    <PageContainer>
      <AppReleasesClient initialReleases={releases} canEdit={canEdit} />
    </PageContainer>
  );
}
