import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, assetUrl } from '../api/client';
import { useToast } from '../components/toastContext';
import Pagination from '../components/Pagination';
import ConfirmDialog from '../components/ConfirmDialog';

const SORT_OPTIONS = [
  { value: '', label: 'Mặc định' },
  { value: 'title_asc', label: 'Tên A–Z' },
  { value: 'title_desc', label: 'Tên Z–A' },
  { value: 'price_asc', label: 'Giá ↑' },
  { value: 'price_desc', label: 'Giá ↓' },
];

export default function ProductsPage() {
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [books, setBooks] = useState([]);
  const [categories, setCategories] = useState([]);
  const [search, setSearch] = useState(searchParams.get('search') || '');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [sort, setSort] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 10;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [deleteTarget, setDeleteTarget] = useState(null);

  const urlSearch = searchParams.get('search') || '';
  useEffect(() => {
    api.get('/api/categories').then(({ data }) => {
      setCategories(data.categories || data.data || []);
    });
  }, []);

  const load = useCallback(async (p, filters = {}) => {
    setLoading(true);
    setError('');
    try {
      const params = { page: p, limit, ...filters };
      const { data } = await api.get('/api/admin/books', { params });
      setBooks(data.books || data.data || []);
      setTotal(data.total || 0);
    } catch (err) {
      setError(err.response?.data?.error || 'Không tải được danh sách');
    } finally {
      setLoading(false);
    }
  }, []);

  const buildFilters = useCallback(() => {
    const params = {};
    if (categoryFilter) params.category = categoryFilter;
    if (sort) {
      const [field, dir] = sort.split('_');
      params.sortField = field;
      params.sortDir = dir;
    }
    if (search.trim()) params.search = search.trim();
    return params;
  }, [categoryFilter, sort, search]);

  const filtersRef = useRef({});
  filtersRef.current = useMemo(() => buildFilters(), [buildFilters]);

  useEffect(() => {
    setSearch(urlSearch);
    setPage(1);
    load(1, { ...filtersRef.current, search: urlSearch });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlSearch]);

  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    load(1, filtersRef.current);
  }, [categoryFilter, sort, load]);

  const toggleSort = (field) => {
    setSort(sort === `${field}_asc` ? `${field}_desc` : `${field}_asc`);
    setPage(1);
  };

  const onSearch = () => {
    setPage(1);
    setSearchParams(search.trim() ? { search: search.trim() } : {});
  };

  const onClearFilters = () => {
    setSearch('');
    setCategoryFilter('');
    setSort('');
    setPage(1);
    setSearchParams({});
  };

  const onDelete = async () => {
    if (!deleteTarget) return;
    try {
      await api.delete(`/api/admin/books/${deleteTarget.id}`);
      const remaining = books.filter((b) => b.id !== deleteTarget.id);
      setBooks(remaining);
      setTotal((prev) => prev - 1);
      if (remaining.length === 0 && page > 1) {
        setPage(page - 1);
        load(page - 1, buildFilters());
      }
      toast('Đã xóa sách', 'success');
    } catch (err) {
      toast(err.response?.data?.error || 'Xóa thất bại', 'error');
    } finally {
      setDeleteTarget(null);
    }
  };

  const hasFilters = search || categoryFilter || sort;
  const from = total === 0 ? 0 : (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);

  return (
    <div>
      <header className="page-header">
        <div>
          <h2>Sản phẩm</h2>
          <p className="muted">{from}–{to}/{total} sản phẩm</p>
        </div>
        <Link to="/products/new" className="btn primary">+ Thêm sách</Link>
      </header>

      <div className="toolbar card">
        <input type="search" placeholder="Tên, tác giả…" value={search} onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onSearch()} />
        <select value={categoryFilter} onChange={(e) => { setCategoryFilter(e.target.value); setPage(1); }}>
          <option value="">Tất cả danh mục</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={sort} onChange={(e) => { setSort(e.target.value); setPage(1); }}>
          {SORT_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <button type="button" className="btn secondary" onClick={onSearch}>Tìm</button>
        {hasFilters ? <button type="button" className="btn ghost" onClick={onClearFilters}>Xóa lọc</button> : null}
      </div>

      {error ? <p className="error">{error}</p> : null}
      {loading ? <p>Đang tải…</p> : null}

      {!loading && (
        <div className="table-wrap card">
          <table>
            <thead>
              <tr>
                <th style={{width:50}}>STT</th>
                <th style={{width:50}}>Ảnh</th>
                <th className="sortable" onClick={() => toggleSort('title')}>
                  Tiêu đề <span className="sort-icon">{sort.startsWith('title') ? (sort === 'title_asc' ? '▲' : '▼') : ''}</span>
                </th>
                <th>Tác giả</th>
                <th>Danh mục</th>
                <th className="sortable" onClick={() => toggleSort('price')}>
                  Giá <span className="sort-icon">{sort.startsWith('price') ? (sort === 'price_asc' ? '▲' : '▼') : ''}</span>
                </th>
                <th>Tồn kho</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {books.map((book, idx) => (
                <tr key={book.id}>
                  <td className="muted small">{(page - 1) * limit + idx + 1}</td>
                  <td>
                    {book.coverImage || book.image ? (
                      <img src={assetUrl(book.coverImage || book.image)} alt="" className="thumb" />
                    ) : (
                      <div className="thumb-placeholder">📖</div>
                    )}
                  </td>
                  <td><strong>{book.title}</strong></td>
                  <td>{book.author}</td>
                  <td><span className="badge badge-user">{book.category?.name || '—'}</span></td>
                  <td><strong>{(book.price || 0).toLocaleString('vi-VN')} đ</strong></td>
                  <td>
                    <span className={`stock-pill ${(book.stock ?? 50) <= 5 ? 'low' : (book.stock ?? 50) <= 10 ? 'medium' : 'ok'}`}>
                      {(book.stock ?? 50)} cuốn
                    </span>
                  </td>
                  <td className="actions">
                    <Link to={`/products/${book.id}/edit`} className="btn icon-btn primary" title="Sửa">✏️</Link>
                    <button type="button" className="btn icon-btn danger" title="Xóa" onClick={() => setDeleteTarget(book)}>🗑️</button>
                  </td>
                </tr>
              ))}
              {books.length === 0 ? (
                <tr><td colSpan={8} className="muted" style={{textAlign:'center',padding:'2rem'}}>Không có dữ liệu</td></tr>
              ) : null}
            </tbody>
          </table>
          <Pagination page={page} limit={limit} total={total} onChange={(p) => { setPage(p); load(p, buildFilters()); }} />
        </div>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title="Xóa sách"
        message={`Bạn có chắc muốn xóa "${deleteTarget?.title}"?`}
        onConfirm={onDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
