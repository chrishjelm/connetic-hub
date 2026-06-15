import Pipeline from "@/app/components/Pipeline";

export const dynamic = "force-dynamic";

export default function InvestorsPage() {
  return (
    <Pipeline
      type="investor"
      title="Investors — VCAFX"
      subtitle="People you've sent materials to or discussed the fund with, tracked to an outcome."
      stages={["Identified", "Materials sent", "In discussion", "Committed", "Passed"]}
    />
  );
}
