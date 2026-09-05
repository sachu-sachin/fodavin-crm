export function ComingSoon({ phase }: { phase: string }) {
  return (
    <div className="rounded-lg border border-dashed bg-card p-10 text-center">
      <p className="text-sm font-medium">Coming in {phase}</p>
      <p className="mt-1 text-sm text-muted-foreground">
        This module is scaffolded and ready to build out next.
      </p>
    </div>
  );
}
