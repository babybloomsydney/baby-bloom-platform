import { ProfileTestClient } from './ProfileTestClient';

export default function ProfileTestPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-3 py-6 px-4">
      <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2">
        <p className="text-xs text-amber-700 font-medium">Profile Test Page — brainstorming sandbox with mock data</p>
      </div>
      <ProfileTestClient />
    </div>
  );
}
