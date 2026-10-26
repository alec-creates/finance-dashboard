import type { LucideIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/** Placeholder for a section that is planned but not built yet (see TASKS.md). */
export function ComingSoon({
  icon: Icon,
  title,
  description,
  planned,
  roadmap,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  /** What the section will offer, one short line each. */
  planned: readonly string[];
  /** Where it is on the roadmap, e.g. "Task 7". */
  roadmap: string;
}) {
  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <div className="mb-2 flex items-center justify-between gap-3">
          <span className="flex size-10 items-center justify-center rounded-lg bg-muted">
            <Icon className="size-5 text-muted-foreground" aria-hidden />
          </span>
          <Badge variant="secondary">Planned · {roadmap}</Badge>
        </div>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2 text-sm">
          {planned.map((item) => (
            <li key={item} className="flex gap-2">
              <span
                className="mt-2 size-1.5 shrink-0 rounded-full bg-muted-foreground/60"
                aria-hidden
              />
              {item}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
