import type { PrismaClient } from "@/generated/prisma/client";
import type { CategoryInput } from "@/lib/transaction-forms";
import type { CategoryType } from "@/lib/transactions";

/*
 * Categories: two levels (a top-level category and its subcategories), each either a spending or an income category.
 * A subcategory always has its parent's type. Every query is scoped by the owner's id from the session. Categories
 * are archived, never deleted, because splits and budgets refer to them.
 */

/**
 * The starter set a new owner gets: editable defaults, not rules. Nothing in the app depends on these names; totals
 * use transaction kinds, and every name can be renamed or archived.
 */
export const STARTER_CATEGORIES: readonly {
  name: string;
  type: CategoryType;
  isEssential: boolean;
  children: readonly { name: string; isEssential: boolean }[];
}[] = [
  {
    name: "Housing",
    type: "EXPENSE",
    isEssential: true,
    children: [
      { name: "Rent or mortgage", isEssential: true },
      { name: "Utilities", isEssential: true },
      { name: "Home maintenance", isEssential: false },
    ],
  },
  {
    name: "Food",
    type: "EXPENSE",
    isEssential: true,
    children: [
      { name: "Groceries", isEssential: true },
      { name: "Restaurants", isEssential: false },
    ],
  },
  {
    name: "Transportation",
    type: "EXPENSE",
    isEssential: true,
    children: [
      { name: "Fuel", isEssential: true },
      { name: "Public transit", isEssential: true },
      { name: "Car maintenance", isEssential: true },
    ],
  },
  {
    name: "Bills",
    type: "EXPENSE",
    isEssential: true,
    children: [
      { name: "Phone and internet", isEssential: true },
      { name: "Insurance", isEssential: true },
      { name: "Subscriptions", isEssential: false },
    ],
  },
  {
    name: "Health",
    type: "EXPENSE",
    isEssential: true,
    children: [
      { name: "Medical", isEssential: true },
      { name: "Pharmacy", isEssential: true },
    ],
  },
  {
    name: "Personal",
    type: "EXPENSE",
    isEssential: false,
    children: [
      { name: "Shopping", isEssential: false },
      { name: "Entertainment", isEssential: false },
      { name: "Gifts", isEssential: false },
    ],
  },
  {
    name: "Other spending",
    type: "EXPENSE",
    isEssential: false,
    children: [{ name: "Fees", isEssential: false }],
  },
  {
    name: "Income",
    type: "INCOME",
    isEssential: false,
    children: [
      { name: "Paycheck", isEssential: false },
      { name: "Interest", isEssential: false },
      { name: "Other income", isEssential: false },
    ],
  },
];

export type CategoryFailure =
  | "not-found"
  | "duplicate-name"
  | "invalid-parent"
  | "has-active-children"
  | "parent-archived";

export type CategoryResult<T = undefined> =
  { ok: true; value: T } | { ok: false; reason: CategoryFailure };

const ok = <T>(value: T): CategoryResult<T> => ({ ok: true, value });
const fail = (
  reason: CategoryFailure,
): { ok: false; reason: CategoryFailure } => ({
  ok: false,
  reason,
});

/** Unique-index violation on (user, parent, lower(name)). */
function isDuplicateName(error: unknown): boolean {
  const text =
    error instanceof Error ? `${error.message} ${JSON.stringify(error)}` : "";
  return /P2002|23505|Category_userId_parentId_lower_name_key|unique constraint/i.test(
    text,
  );
}

/**
 * Gives an owner the starter categories if they have never had any (archived ones count, so a deliberately emptied
 * list is not refilled). Safe to call on every visit; concurrent calls cannot create duplicates.
 */
export async function ensureStarterCategories(
  prisma: PrismaClient,
  userId: string,
): Promise<boolean> {
  if ((await prisma.category.count({ where: { userId } })) > 0) {
    return false;
  }
  try {
    await prisma.$transaction(async (tx) => {
      for (const [index, parent] of STARTER_CATEGORIES.entries()) {
        await tx.category.create({
          data: {
            userId,
            name: parent.name,
            type: parent.type,
            isEssential: parent.isEssential,
            sortOrder: index,
            children: {
              // userId comes from the composite parent relation.
              create: parent.children.map((child, childIndex) => ({
                name: child.name,
                type: parent.type,
                isEssential: child.isEssential,
                sortOrder: childIndex,
              })),
            },
          },
        });
      }
    });
  } catch (error) {
    if (isDuplicateName(error)) {
      return false; // another request created them first
    }
    throw error;
  }
  return true;
}

export interface CategoryNode {
  id: string;
  name: string;
  type: CategoryType;
  isEssential: boolean;
  archivedAt: Date | null;
  parentId: string | null;
  /** Number of transaction splits using it. */
  splitCount: number;
  children: CategoryNode[];
}

/** The owner's categories as a two-level tree, top-level categories in their sort order. */
export async function listCategoryTree(
  prisma: PrismaClient,
  userId: string,
): Promise<CategoryNode[]> {
  const rows = await prisma.category.findMany({
    where: { userId },
    select: {
      id: true,
      name: true,
      type: true,
      isEssential: true,
      archivedAt: true,
      parentId: true,
      sortOrder: true,
      _count: { select: { splits: true } },
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  const node = (row: (typeof rows)[number]): CategoryNode => ({
    id: row.id,
    name: row.name,
    type: row.type,
    isEssential: row.isEssential,
    archivedAt: row.archivedAt,
    parentId: row.parentId,
    splitCount: row._count.splits,
    children: [],
  });
  const parents = rows.filter((row) => row.parentId === null).map(node);
  const byId = new Map(parents.map((parent) => [parent.id, parent]));
  for (const row of rows) {
    if (row.parentId !== null) {
      byId.get(row.parentId)?.children.push(node(row));
    }
  }
  return parents;
}

export async function createCategory(
  prisma: PrismaClient,
  userId: string,
  input: CategoryInput,
): Promise<CategoryResult<{ id: string }>> {
  let type = input.type;
  if (input.parentId) {
    const parent = await prisma.category.findUnique({
      where: { id_userId: { id: input.parentId, userId } },
      select: { parentId: true, type: true, archivedAt: true },
    });
    // Two levels only: a subcategory's parent must be top-level and active; the child takes the parent's type.
    if (!parent || parent.parentId !== null) {
      return fail("invalid-parent");
    }
    if (parent.archivedAt) {
      return fail("parent-archived");
    }
    type = parent.type;
  }
  const maxSort = await prisma.category.aggregate({
    where: { userId, parentId: input.parentId },
    _max: { sortOrder: true },
  });
  try {
    const created = await prisma.category.create({
      data: {
        userId,
        name: input.name,
        type,
        parentId: input.parentId,
        isEssential: input.isEssential,
        sortOrder: (maxSort._max.sortOrder ?? -1) + 1,
      },
      select: { id: true },
    });
    return ok(created);
  } catch (error) {
    if (isDuplicateName(error)) {
      return fail("duplicate-name");
    }
    throw error;
  }
}

/** Renames a category and sets whether it is essential. Its type and place in the tree do not change. */
export async function updateCategory(
  prisma: PrismaClient,
  userId: string,
  categoryId: string,
  changes: { name: string; isEssential: boolean },
): Promise<CategoryResult> {
  try {
    const { count } = await prisma.category.updateMany({
      where: { id: categoryId, userId },
      data: changes,
    });
    return count === 1 ? ok(undefined) : fail("not-found");
  } catch (error) {
    if (isDuplicateName(error)) {
      return fail("duplicate-name");
    }
    throw error;
  }
}

/**
 * Archives or restores a category. Archived categories stay on existing splits (history keeps its meaning) but can't
 * be chosen for new ones. A parent can only be archived once its subcategories are, and a subcategory can only be
 * restored while its parent is active.
 */
export async function setCategoryArchived(
  prisma: PrismaClient,
  userId: string,
  categoryId: string,
  archived: boolean,
): Promise<CategoryResult> {
  return prisma.$transaction(async (tx) => {
    const category = await tx.category.findUnique({
      where: { id_userId: { id: categoryId, userId } },
      select: {
        parent: { select: { archivedAt: true } },
        children: { where: { archivedAt: null }, select: { id: true } },
      },
    });
    if (!category) {
      return fail("not-found");
    }
    if (archived && category.children.length > 0) {
      return fail("has-active-children");
    }
    if (!archived && category.parent?.archivedAt) {
      return fail("parent-archived");
    }
    await tx.category.update({
      where: { id_userId: { id: categoryId, userId } },
      data: { archivedAt: archived ? new Date() : null },
    });
    return ok(undefined);
  });
}
