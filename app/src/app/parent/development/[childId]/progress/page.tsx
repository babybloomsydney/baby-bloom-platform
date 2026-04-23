import { getDashboardData } from "@/lib/actions/bapp/progress";
import { BAppProgressView } from "@/components/bapp/BAppProgressView";

export default async function ParentProgressPage({
  params,
}: {
  params: { childId: string };
}) {
  const result = await getDashboardData(params.childId);

  return (
    <BAppProgressView
      dashboard={result.data}
    />
  );
}
