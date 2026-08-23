/* Category taxonomy lookups over the curated tables in config.ts:
   exclusion happens at the parse boundary, grouping is a pure function
   any layer can call. Unknown categories group as 'Other' so new
   dataset values surface instead of vanishing. */

import { CATEGORY_GROUPS, EXCLUDED_CATEGORIES, OTHER_GROUP } from '../config';

const groupByCategory = new Map<string, string>();
for (const [group, members] of Object.entries(CATEGORY_GROUPS)) {
  for (const m of members) groupByCategory.set(m, group);
}

export function isExcludedCategory(category: string): boolean {
  return EXCLUDED_CATEGORIES.has(category);
}

/* '' stays '' — uncategorized reports keep their own filter rule
   (PORT_PLAN §6.1), they are not 'Other' */
export function groupOfCategory(category: string): string {
  if (category === '') return '';
  return groupByCategory.get(category) ?? OTHER_GROUP;
}
