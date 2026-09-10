import { useState } from 'react';
import { fmt } from '../lib/format';

export default function ProductPicker({ products, onPick, onClose }) {
  const [q, setQ] = useState('');
  const rows = products.filter(p => p.description.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="modal-bg" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal">
        <span className="close-x" onClick={onClose}>✕</span>
        <h2>Select a product</h2>
        <input className="search" style={{ width: '100%', marginBottom: 10 }} placeholder="Search..."
          autoFocus value={q} onChange={e => setQ(e.target.value)} />
        <div style={{ maxHeight: 400, overflow: 'auto' }}>
          <table><tbody>
            {rows.map(p => (
              <tr key={p.id} style={{ cursor: 'pointer' }} onClick={() => onPick(p)}>
                <td>{p.description}</td>
                <td className="muted">{p.category}</td>
                <td>{p.cost ? fmt(p.cost) : <span className="flag">no cost set</span>}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td className="empty">No matches.</td></tr>}
          </tbody></table>
        </div>
      </div>
    </div>
  );
}
