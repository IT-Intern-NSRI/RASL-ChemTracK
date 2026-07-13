// src/components/ChemicalSearchFilterBar.tsx
//
// PURE FRONTEND FILE — plain description:
// A search input (matches chemical name), a category dropdown, and a
// "low stock only" checkbox, sitting above the dashboard's chemical list.
// Changing any control updates the page's URL query params, which the
// server-rendered dashboard page reads to refetch the filtered list.

'use client';

import { useRouter, useSearchParams } from 'next/navigation';

export function ChemicalSearchFilterBar() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // def handleFilterChange(): Input is one key (string, one of "search" |
  // "category" | "lowStockOnly") and one value (string). Output is none
  // (side effect: updates the URL's query params via router.push, which
  // triggers the dashboard server component to refetch).
  // Pseudocode:
  //   1. Clone the current searchParams into a mutable URLSearchParams.
  //   2. Set (or delete, if value is empty) the given key.
  //   3. router.push(`/?${params.toString()}`).
  function handleFilterChange(key: string, value: string): void {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    router.push(`/?${params.toString()}`);
  }

  return (
    <div className="filter-bar">
      <input
        type="search"
        placeholder="Search chemicals…"
        defaultValue={searchParams.get('search') ?? ''}
        onChange={(e) => handleFilterChange('search', e.target.value)}
      />
      <input
        type="text"
        placeholder="Category…"
        defaultValue={searchParams.get('category') ?? ''}
        onChange={(e) => handleFilterChange('category', e.target.value)}
      />
      <label className="field field-checkbox">
        <input
          type="checkbox"
          defaultChecked={searchParams.get('lowStockOnly') === 'true'}
          onChange={(e) => handleFilterChange('lowStockOnly', e.target.checked ? 'true' : '')}
        />
        Low stock only
      </label>
    </div>
  );
}
