import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence } from 'framer-motion';
import { Loader2, Search, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { globalSearch } from '../services/api';
import './GlobalSearchModal.css';

const TYPE_LABELS = {
  image: 'Gallery',
  memory: 'Timeline',
  post: 'Wall',
  member: 'Registry',
  facePerson: 'Faces',
};

const TYPE_ROUTE = {
  image: '/gallery',
  memory: '/timeline',
  post: '/wall',
  member: '/yearbook',
  facePerson: '/faces',
};

const getRouteForItem = (item) => TYPE_ROUTE[item.entityType] || '/';

export default function GlobalSearchModal({ open, onClose }) {
  const navigate = useNavigate();
  const inputRef = useRef(null);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');

  useEffect(() => {
    if (!open) return undefined;
    const timer = setTimeout(() => {
      inputRef.current?.focus();
    }, 40);
    return () => clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), 220);
    return () => clearTimeout(timer);
  }, [query]);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['global-search', debouncedQuery],
    queryFn: async () => {
      const response = await globalSearch({ q: debouncedQuery, limit: 14 });
      return response.data;
    },
    enabled: open,
    staleTime: 20_000,
  });

  const items = useMemo(() => data?.items || [], [data?.items]);

  const groupedItems = useMemo(() => {
    return items.reduce((acc, item) => {
      const type = item.entityType || 'other';
      if (!acc[type]) acc[type] = [];
      acc[type].push(item);
      return acc;
    }, {});
  }, [items]);

  const openResult = (item) => {
    navigate(getRouteForItem(item), {
      state: {
        searchItemId: item.entityId,
        searchItemType: item.entityType,
        searchQuery: debouncedQuery,
      },
    });
    onClose();
  };

  return (
    <AnimatePresence>
      {open ? (
        <div className="search-modal-overlay" onClick={onClose} role="presentation">
          <motion.div
            className="search-modal"
            onClick={(event) => event.stopPropagation()}
            initial={{ opacity: 0, y: -10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.98 }}
            transition={{ duration: 0.18 }}
            role="dialog"
            aria-modal="true"
            aria-label="Global search"
          >
            <div className="search-input-wrap">
              <Search size={18} aria-hidden="true" />
              <input
                ref={inputRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search gallery, timeline, wall, registry, and faces"
                className="search-input"
                aria-label="Search everything"
              />
              <button className="btn-icon btn-ghost" onClick={onClose} type="button" aria-label="Close search">
                <X size={18} />
              </button>
            </div>

            <div className="search-result-wrap" role="listbox" aria-label="Search results">
              {isLoading || isFetching ? (
                <div className="search-empty">
                  <Loader2 size={16} className="spin" /> Searching...
                </div>
              ) : items.length === 0 ? (
                <div className="search-empty">
                  {debouncedQuery ? 'No results found.' : 'Start typing to search all pages.'}
                </div>
              ) : (
                Object.entries(groupedItems).map(([type, typeItems]) => (
                  <section key={type} className="search-group" aria-label={TYPE_LABELS[type] || type}>
                    <h4>{TYPE_LABELS[type] || type}</h4>
                    {typeItems.map((item) => (
                      <button
                        key={`${item.entityType}-${item.entityId}`}
                        className="search-result-item"
                        onClick={() => openResult(item)}
                        type="button"
                      >
                        <div className="search-result-main">{item.title || 'Untitled'}</div>
                        <div className="search-result-sub">
                          {(item.text || '').slice(0, 88) || 'Open matching content'}
                        </div>
                      </button>
                    ))}
                  </section>
                ))
              )}
            </div>

            <div className="search-footnote">
              <span>Shortcut: Ctrl/Cmd + K</span>
              <span>{data?.total || 0} results</span>
            </div>
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>
  );
}
