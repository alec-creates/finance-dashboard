export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-4 px-4 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">
        Finance Dashboard
      </h1>
      <p className="text-zinc-600 dark:text-zinc-400">
        Personal budgeting, investments, net worth and forecasting. The project
        is in Phase 1 (foundation); see TASKS.md for progress.
      </p>
    </main>
  );
}
