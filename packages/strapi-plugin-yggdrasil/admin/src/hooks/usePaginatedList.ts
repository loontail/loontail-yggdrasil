import { useCallback, useEffect, useState } from 'react';

type FetchFn<T> = (
  search: string,
  page: number,
) => Promise<{
  data: T[];
  meta: { pagination: { total: number; pageCount: number } };
}>;

interface PaginatedListState<T> {
  items: T[];
  total: number;
  page: number;
  pageCount: number;
  loading: boolean;
  search: string;
}

interface PaginatedListActions {
  setSearch: (value: string) => void;
  clearSearch: () => void;
  submitSearch: () => void;
  changePage: (pageNumber: number) => void;
  refresh: () => void;
}

const SEARCH_DEBOUNCE_MS = 350;

export const usePaginatedList = <T>(
  fetchFn: FetchFn<T>,
  onError?: (err: unknown) => void,
): [PaginatedListState<T>, PaginatedListActions] => {
  const [items, setItems] = useState<T[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(1);
  const [loading, setLoading] = useState(false);
  const [search, setSearchValue] = useState('');

  const runFetch = useCallback(
    async (searchTerm: string, pageNumber: number) => {
      setLoading(true);
      try {
        const res = await fetchFn(searchTerm, pageNumber);
        setItems(res.data);
        setTotal(res.meta.pagination.total);
        setPageCount(res.meta.pagination.pageCount);
      } catch (err) {
        setItems([]);
        setTotal(0);
        setPageCount(1);
        onError?.(err);
      } finally {
        setLoading(false);
      }
    },
    [fetchFn, onError],
  );

  // Initial load fires immediately; subsequent `search` changes are debounced.
  useEffect(() => {
    const delay = search ? SEARCH_DEBOUNCE_MS : 0;
    const timer = setTimeout(() => {
      setPage(1);
      runFetch(search, 1);
    }, delay);
    return () => clearTimeout(timer);
  }, [search, runFetch]);

  const setSearch = useCallback((value: string) => setSearchValue(value), []);
  const clearSearch = useCallback(() => setSearchValue(''), []);
  const submitSearch = useCallback(() => runFetch(search, 1), [search, runFetch]);
  const changePage = useCallback(
    (pageNumber: number) => {
      setPage(pageNumber);
      runFetch(search, pageNumber);
    },
    [search, runFetch],
  );
  const refresh = useCallback(() => runFetch(search, page), [search, page, runFetch]);

  return [
    { items, total, page, pageCount, loading, search },
    { setSearch, clearSearch, submitSearch, changePage, refresh },
  ];
};
