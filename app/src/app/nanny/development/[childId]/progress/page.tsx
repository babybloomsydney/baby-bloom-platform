import { getDashboardData } from "@/lib/actions/bapp/progress";
import { BAppProgressView } from "@/components/bapp/BAppProgressView";

export default async function ProgressPage({
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
