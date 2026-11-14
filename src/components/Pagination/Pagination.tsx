import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent, RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { PAGE_SIZES } from '../../../shared/query.js';
import './Pagination.css';

export interface PaginationProps {
  page: number;
  totalPages: number;
  /** Rows matching the current filters/search (not the unfiltered total). */
  total: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  /** A request is in flight: dims the bar, keeps it clickable. */
  busy?: boolean;
  /** Scrolled into view after a page change (the top of the list). */
  scrollRef?: RefObject<HTMLElement | null>;
}

/**
 * The site's only pagination control. Renders nothing until there is more than
 * the smallest page size of rows, so it disappears by itself when a filter or
 * search leaves 25 rows or fewer.
 *
 *   26–50 of 312        « ‹  1  [ 2 ]  13  › »        PER PAGE [25 ▾]
 *
 * The centre number is editable: type a page, press Enter or leave the field.
 */
export default function Pagination({ page, totalPages, total, pageSize, onPageChange, onPageSizeChange, busy, scrollRef }: PaginationProps) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(String(page));
  const cancelled = useRef(false);
  useEffect(() => setDraft(String(page)), [page]);

  if (total <= PAGE_SIZES[0]) return null;

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  const multi = totalPages > 1;

  function go(p: number) {
    const next = Math.min(Math.max(1, p), totalPages);
    if (next !== page) {
      onPageChange(next);
      const el = scrollRef?.current;
      if (el && el.getBoundingClientRect().top < 0) el.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }
  }

  function commit() {
    if (cancelled.current) {
      cancelled.current = false;
      setDraft(String(page));
      return;
    }
    const n = parseInt(draft, 10);
    if (Number.isFinite(n)) go(n);
    setDraft(String(Number.isFinite(n) ? Math.min(Math.max(1, n), totalPages) : page));
  }

  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') e.currentTarget.blur();
    else if (e.key === 'Escape') {
      cancelled.current = true;   // the blur below must not commit the stale draft
      e.currentTarget.blur();
    }
  }

  const atStart = page <= 1;
  const atEnd = page >= totalPages;

  return (
    <nav className={`pager${busy ? ' pager--busy' : ''}`} aria-label={t('pagination.label')} aria-busy={busy || undefined}>
      <div className="pager__info">
        {t('pagination.showing', { from, to, total })}
      </div>

      {multi && (
        <div className="pager__nav">
          <button type="button" className="pager__btn" disabled={atStart} onClick={() => go(1)} aria-label={t('pagination.first')} title={t('pagination.first')}>
            <i className="fas fa-angles-left" />
          </button>
          <button type="button" className="pager__btn" disabled={atStart} onClick={() => go(page - 1)} aria-label={t('pagination.prev')} title={t('pagination.prev')}>
            <i className="fas fa-angle-left" />
          </button>
          <button type="button" className="pager__btn pager__edge" disabled={atStart} onClick={() => go(1)} aria-label={t('pagination.goTo', { page: 1 })}>
            1
          </button>
          <input
            className="pager__current"
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={draft}
            aria-label={t('pagination.page')}
            onChange={(e) => setDraft(e.target.value.replace(/\D/g, '').slice(0, 6))}
            onFocus={(e) => e.currentTarget.select()}
            onBlur={commit}
            onKeyDown={onKey}
          />
          <button type="button" className="pager__btn pager__edge" disabled={atEnd} onClick={() => go(totalPages)} aria-label={t('pagination.goTo', { page: totalPages })}>
            {totalPages}
          </button>
          <button type="button" className="pager__btn" disabled={atEnd} onClick={() => go(page + 1)} aria-label={t('pagination.next')} title={t('pagination.next')}>
            <i className="fas fa-angle-right" />
          </button>
          <button type="button" className="pager__btn" disabled={atEnd} onClick={() => go(totalPages)} aria-label={t('pagination.last')} title={t('pagination.last')}>
            <i className="fas fa-angles-right" />
          </button>
        </div>
      )}

      <label className="pager__size">
        <span>{t('pagination.perPage')}</span>
        <select className="pager__select" value={pageSize} onChange={(e) => onPageSizeChange(Number(e.target.value))}>
          {PAGE_SIZES.map((n) => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>
      </label>
    </nav>
  );
}
