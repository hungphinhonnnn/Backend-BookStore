import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api/client';
import { useToast } from '../components/toastContext';
import Pagination from '../components/Pagination';
import ConfirmDialog from '../components/ConfirmDialog';

const ROLES = [
  { value: 'user', label: 'Người dùng', badge: 'badge-user' },
  { value: 'staff', label: 'Nhân viên', badge: 'badge-staff' },
  { value: 'admin', label: 'Admin', badge: 'badge-admin' },
];

function roleInfo(value) {
  return ROLES.find((r) => r.value === value) || { label: value, badge: 'badge-user' };
}

function statusBadge(value) {
  const map = { active: 'badge-active', banned: 'badge-banned', suspended: 'badge-suspended' };
  const labels = { active: 'Hoạt động', banned: 'Đã khóa', suspended: 'Tạm khóa' };
  return { cls: `badge ${map[value] || 'badge-user'}`, label: labels[value] || value };
}

export default function UsersPage() {
  const toast = useToast();
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 15;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [deleteTarget, setDeleteTarget] = useState(null);

  const load = useCallback(async (p, filters = {}) => {
    setLoading(true);
    setError('');
    try {
      const params = { page: p, limit, ...filters };
      const { data } = await api.get('/api/admin/users', { params });
      setUsers(data.users || data.data || []);
      setTotal(data.total || 0);
    } catch (err) {
      setError(err.response?.data?.error || 'Không tải được danh sách');
    } finally {
      setLoading(false);
    }
  }, []);

  const buildFilters = useCallback(() => {
    const params = {};
    if (search.trim()) params.search = search.trim();
    if (roleFilter) params.role = roleFilter;
    if (statusFilter) params.status = statusFilter;
    return params;
  }, [search, roleFilter, statusFilter]);

  const filtersRef = useRef({});
  filtersRef.current = useMemo(() => buildFilters(), [buildFilters]);

  useEffect(() => {
    load(1, filtersRef.current);
  }, [roleFilter, statusFilter, load]);

  const onSearch = () => {
    setPage(1);
    load(1, buildFilters());
  };

  const nextRole = (current) => {
    const order = ['user', 'staff', 'admin'];
    return order[(order.indexOf(current) + 1) % order.length];
  };

  const onToggleRole = async (id, currentRole) => {
    const newRole = nextRole(currentRole);
    const label = roleInfo(newRole).label;
    if (!window.confirm(`Đổi vai trò thành "${label}"?`)) return;
    try {
      const { data } = await api.patch(`/api/admin/users/${id}/role`, { role: newRole });
      setUsers((prev) => prev.map((u) => (u.id === id ? data.user : u)));
      toast(`Đã đổi vai trò thành ${label}`, 'success');
    } catch (err) {
      toast(err.response?.data?.error || 'Đổi vai trò thất bại', 'error');
    }
  };

  const onToggleStatus = async (user, newStatus) => {
    const labels = { active: 'kích hoạt', banned: 'khóa vĩnh viễn', suspended: 'tạm khóa' };
    if (!window.confirm(`Xác nhận ${labels[newStatus]} tài khoản "${user.username}"?`)) return;
    try {
      const { data } = await api.patch(`/api/admin/users/${user.id}/status`, { status: newStatus });
      setUsers((prev) => prev.map((u) => (u.id === user.id ? data.user : u)));
      toast(`Đã ${labels[newStatus]} tài khoản`, 'success');
    } catch (err) {
      toast(err.response?.data?.error || 'Cập nhật trạng thái thất bại', 'error');
    }
  };

  const onDelete = async () => {
    if (!deleteTarget) return;
    try {
      await api.delete(`/api/admin/users/${deleteTarget.id}`);
      const remaining = users.filter((u) => u.id !== deleteTarget.id);
      setUsers(remaining);
      setTotal((prev) => prev - 1);
      if (remaining.length === 0 && page > 1) {
        setPage(page - 1);
        load(page - 1, buildFilters());
      }
      toast('Đã xóa tài khoản', 'success');
    } catch (err) {
      toast(err.response?.data?.error || 'Xóa thất bại', 'error');
    } finally {
      setDeleteTarget(null);
    }
  };

  const from = total === 0 ? 0 : (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);

  return (
    <div>
      <header className="page-header">
        <div>
          <h2>Tài khoản</h2>
          <p className="muted">{from}–{to}/{total} tài khoản</p>
        </div>
      </header>

      <div className="toolbar card">
        <input type="search" placeholder="Tìm theo tên, email…" value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onSearch()} />
        <select value={roleFilter} onChange={(e) => { setRoleFilter(e.target.value); setPage(1); }}>
          <option value="">Tất cả vai trò</option>
          <option value="user">Người dùng</option>
          <option value="staff">Nhân viên</option>
          <option value="admin">Admin</option>
        </select>
        <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}>
          <option value="">Tất cả trạng thái</option>
          <option value="active">Hoạt động</option>
          <option value="suspended">Tạm khóa</option>
          <option value="banned">Đã khóa</option>
        </select>
        <button type="button" className="btn secondary" onClick={onSearch}>Tìm</button>
      </div>

      {error ? <p className="error">{error}</p> : null}
      {loading ? <p>Đang tải…</p> : null}

      {!loading && (
        <div className="table-wrap card">
          <table>
            <thead>
              <tr>
                <th style={{width:50}}>STT</th>
                <th>Họ tên</th>
                <th>Email</th>
                <th>Vai trò</th>
                <th>Trạng thái</th>
                <th>Ngày tạo</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {users.map((u, idx) => {
                const r = roleInfo(u.role);
                const s = statusBadge(u.status);
                return (
                  <tr key={u.id}>
                    <td className="muted small">{(page - 1) * limit + idx + 1}</td>
                    <td>
                      <strong>{u.firstName} {u.lastName}</strong>
                      <div className="muted small">@{u.username}</div>
                    </td>
                    <td>{u.email}</td>
                    <td><span className={`badge ${r.badge}`}>{r.label}</span></td>
                    <td><span className={s.cls}>{s.label}</span></td>
                    <td className="muted small">{u.createdAt ? new Date(u.createdAt).toLocaleDateString('vi-VN') : '—'}</td>
                    <td className="actions" style={{flexWrap:'wrap'}}>
                      <button type="button" className="btn icon-btn secondary" title="Đổi vai trò (user→staff→admin)"
                        onClick={() => onToggleRole(u.id, u.role)}>🔄</button>
                      {u.status === 'active' ? (
                        <>
                          <button type="button" className="btn icon-btn" style={{background:'#fef3c7'}} title="Tạm khóa"
                            onClick={() => onToggleStatus(u, 'suspended')}>⏸️</button>
                          <button type="button" className="btn icon-btn" style={{background:'#fee2e2'}} title="Khóa vĩnh viễn"
                            onClick={() => onToggleStatus(u, 'banned')}>🚫</button>
                        </>
                      ) : (
                        <button type="button" className="btn icon-btn success" title="Kích hoạt"
                          onClick={() => onToggleStatus(u, 'active')}>✅</button>
                      )}
                      <button type="button" className="btn icon-btn danger" title="Xóa"
                        onClick={() => setDeleteTarget(u)} disabled={u.role === 'admin'}>🗑️</button>
                    </td>
                  </tr>
                );
              })}
              {users.length === 0 ? (
                <tr><td colSpan={7} className="muted" style={{textAlign:'center',padding:'2rem'}}>Không có dữ liệu</td></tr>
              ) : null}
            </tbody>
          </table>
          <Pagination page={page} limit={limit} total={total} onChange={(p) => { setPage(p); load(p, buildFilters()); }} />
        </div>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title="Xóa tài khoản"
        message={`Bạn có chắc muốn xóa tài khoản "${deleteTarget?.username}"?`}
        onConfirm={onDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
