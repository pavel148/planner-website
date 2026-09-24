export type Viewer = { id: string; role: string } | null;
export type OwnedItem = {
  id: string;
  owner_id: string;
  parent_id: string | null;
  is_private: number;
};
export function canManage(viewer: Viewer, ownerId: string) {
  return !!viewer && (viewer.id === ownerId || viewer.role === "superadmin");
}
// A private ancestor hides every descendant, even when its own flag is public.
export function visibleItems<T extends OwnedItem>(
  items: T[],
  viewer: Viewer,
  ownerId: string,
  gardenPrivate: number,
): T[] {
  if (canManage(viewer, ownerId)) return items;
  if (gardenPrivate) return [];
  const byId = new Map(items.map((item) => [item.id, item]));
  return items.filter((item) => {
    const seen = new Set<string>();
    let current: T | undefined = item;
    while (current) {
      if (current.is_private || seen.has(current.id)) return false;
      seen.add(current.id);
      if (!current.parent_id) return true;
      current = byId.get(current.parent_id);
    }
    return false;
  });
}
