import { ChevronLeftIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { PageHeader } from "@/components/app-shell/page-header";
import {
  AddCategoryForm,
  CategoryList,
  type ManagedCategory,
} from "@/components/transactions/category-manager";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { requireUser } from "@/server/auth/session";
import { getPrisma } from "@/server/db/client";
import {
  ensureStarterCategories,
  listCategoryTree,
  type CategoryNode,
} from "@/server/services/categories";

export const metadata: Metadata = { title: "Categories" };

export default function CategoriesPage() {
  return (
    <div className="max-w-3xl">
      <Button
        variant="ghost"
        size="sm"
        asChild
        className="mb-2 -ml-2 text-muted-foreground"
      >
        <Link href="/settings">
          <ChevronLeftIcon aria-hidden />
          Settings
        </Link>
      </Button>
      <PageHeader
        title="Categories"
        description="Group spending and income. Totals use transaction kinds, so renaming a category never changes them."
      />
      <Suspense fallback={<Skeleton className="h-96 w-full rounded-xl" />}>
        <Categories />
      </Suspense>
    </div>
  );
}

function managed(node: CategoryNode): ManagedCategory {
  return {
    id: node.id,
    name: node.name,
    type: node.type,
    isEssential: node.isEssential,
    archived: node.archivedAt !== null,
    usedBy: node.splitCount,
    children: node.children.map(managed),
  };
}

async function Categories() {
  const user = await requireUser();
  const prisma = getPrisma();
  await ensureStarterCategories(prisma, user.id);
  const tree = (await listCategoryTree(prisma, user.id)).map(managed);
  const sections = [
    { type: "EXPENSE", title: "Spending" },
    { type: "INCOME", title: "Income" },
  ] as const;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>
            <h2>Add a category</h2>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <AddCategoryForm
            parents={tree
              .filter((parent) => !parent.archived)
              .map(({ id, name, type }) => ({ id, name, type }))}
          />
        </CardContent>
      </Card>
      {sections.map((section) => {
        const categories = tree.filter((node) => node.type === section.type);
        return (
          <Card key={section.type} className="gap-0 pb-0">
            <CardHeader className="pb-3">
              <CardTitle>
                <h2>{section.title}</h2>
              </CardTitle>
              <CardDescription>
                Archive a category to hide it from new transactions; past
                transactions keep it.
              </CardDescription>
            </CardHeader>
            <CardContent className="border-t px-0">
              {categories.length === 0 ? (
                <p className="px-4 py-3 text-sm text-muted-foreground">
                  No {section.title.toLowerCase()} categories yet.
                </p>
              ) : (
                <CategoryList categories={categories} />
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
