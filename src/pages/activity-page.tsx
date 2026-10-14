import { type CareData } from "@/hooks/use-care-data";
import { ActivityCard, PageHeading } from "@/components/page-parts";

export function ActivityPage({ care }: { care: CareData }) {
  return (
    <>
      <PageHeading title="Activity" />
      <ActivityCard activity={care.activity} members={care.members} />
    </>
  );
}
