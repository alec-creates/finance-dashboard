import type { CategoryNode } from "@/server/services/categories";

import type { CategoryOption } from "./transaction-form";

/**
 * Categories offered in the transaction form: active ones, plus any archived category already used by the transaction
 * being edited (so editing doesn't silently drop it). Parents with no remaining options are left out.
 */
export function categoryOptions(
  tree: readonly CategoryNode[],
  keepIds: ReadonlySet<string> = new Set(),
): CategoryOption[] {
  const usable = (node: CategoryNode) =>
    !node.archivedAt || keepIds.has(node.id);
  return tree
    .map((parent) => ({
      id: parent.id,
      name: parent.archivedAt ? `${parent.name} (archived)` : parent.name,
      type: parent.type,
      parentUsable: usable(parent),
      children: parent.children.filter(usable).map((child) => ({
        id: child.id,
        name: child.archivedAt ? `${child.name} (archived)` : child.name,
      })),
    }))
    .filter((parent) => parent.parentUsable || parent.children.length > 0)
    .map(({ parentUsable, ...parent }) => ({
      ...parent,
      selectable: parentUsable,
    }));
}
