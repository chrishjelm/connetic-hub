import Pipeline from "@/app/components/pipeline";

export const dynamic = "force-dynamic";

export default function StartupsPage() {
  return (
    <Pipeline
      type="startup"
      title="Startups"
      subtitle="Founders you're evaluating for investment, tracked to an outcome."
      stages={["Sourced", "Intro call", "Diligence", "Term sheet", "Invested", "Passed"]}
    />
  );
}
