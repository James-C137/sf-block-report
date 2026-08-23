import { describe, expect, it } from 'vitest';
import { groupOfCategory, isExcludedCategory } from '../src/model/categories';
import { CATEGORY_GROUPS, EXCLUDED_CATEGORIES } from '../src/config';

describe('category taxonomy', () => {
  it('maps known dataset categories to their curated groups', () => {
    expect(groupOfCategory('Larceny Theft')).toBe('Theft');
    expect(groupOfCategory('Motor Vehicle Theft')).toBe('Vehicle Theft');
    expect(groupOfCategory('Assault')).toBe('Assault & Violence');
    expect(groupOfCategory('Malicious Mischief')).toBe('Vandalism & Arson');
    expect(groupOfCategory('Drug Offense')).toBe('Drugs & Vice');
    expect(groupOfCategory('Forgery And Counterfeiting')).toBe('Fraud & Forgery');
  });

  it('unknown categories land in Other instead of vanishing', () => {
    expect(groupOfCategory('Some Future Dataset Category')).toBe('Other');
  });

  it("uncategorized stays '' — it has its own filter rule, it is not Other", () => {
    expect(groupOfCategory('')).toBe('');
  });

  it('flags administrative categories for exclusion', () => {
    expect(isExcludedCategory('Case Closure')).toBe(true);
    expect(isExcludedCategory('Non-Criminal')).toBe(true);
    expect(isExcludedCategory('Larceny Theft')).toBe(false);
  });

  it('no category is both excluded and grouped', () => {
    const grouped = new Set(Object.values(CATEGORY_GROUPS).flat());
    for (const ex of EXCLUDED_CATEGORIES) expect(grouped.has(ex)).toBe(false);
  });
});
