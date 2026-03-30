import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Calendar, ChevronLeft, ChevronRight, Plus, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { getEvents, createEvent } from '../services/api';
import './Timeline.css';

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEK_DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

const toInputDate = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const formatDisplayDate = (inputDate) => {
  if (!inputDate) return 'dd-mm-yyyy';
  const [year, month, day] = inputDate.split('-');
  return `${day}-${month}-${year}`;
};

function TimelineDatePicker({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const [viewDate, setViewDate] = useState(value ? new Date(value) : new Date());

  const startOfMonth = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1);
  const endOfMonth = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 0);
  const leadingDays = startOfMonth.getDay();
  const daysInMonth = endOfMonth.getDate();

  const days = [];
  for (let i = 0; i < leadingDays; i += 1) {
    days.push({ key: `empty-${i}`, type: 'empty' });
  }
  for (let day = 1; day <= daysInMonth; day += 1) {
    const currentDate = new Date(viewDate.getFullYear(), viewDate.getMonth(), day);
    days.push({
      key: toInputDate(currentDate),
      type: 'day',
      day,
      value: toInputDate(currentDate),
    });
  }

  const changeMonth = (offset) => {
    setViewDate((prev) => new Date(prev.getFullYear(), prev.getMonth() + offset, 1));
  };

  return (
    <div className="tl-date-field">
      <button type="button" className="input-tech tl-date-trigger" onClick={() => setOpen((prev) => !prev)}>
        {formatDisplayDate(value)}
        <Calendar size={14} />
      </button>

      {open && (
        <div className="tl-date-popover">
          <div className="tl-date-popover-head">
            <button type="button" className="btn-icon btn-ghost" onClick={() => changeMonth(-1)}>
              <ChevronLeft size={16} />
            </button>
            <span>{MONTH_NAMES[viewDate.getMonth()]} {viewDate.getFullYear()}</span>
            <button type="button" className="btn-icon btn-ghost" onClick={() => changeMonth(1)}>
              <ChevronRight size={16} />
            </button>
          </div>

          <div className="tl-date-grid tl-date-week-head">
            {WEEK_DAYS.map((day) => <span key={day}>{day}</span>)}
          </div>

          <div className="tl-date-grid">
            {days.map((item) => {
              if (item.type === 'empty') return <span key={item.key} className="tl-date-empty" />;
              const active = value === item.value;

              return (
                <button
                  key={item.key}
                  type="button"
                  className={`tl-date-day ${active ? 'active' : ''}`}
                  onClick={() => {
                    onChange(item.value);
                    setOpen(false);
                  }}
                >
                  {item.day}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── EVENT MODAL ── */
function EventModal({ onClose, onSuccess }) {
  const [form, setForm] = useState({ title: '', date: '', description: '', type: 'Academic' });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await createEvent(form);
      onSuccess(res.data.event);
      toast.success('Event logged successfully');
      onClose();
    } catch { toast.error('Failed to log event'); }
    finally { setLoading(false); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <motion.div className="modal-content tl-modal-content" onClick={e=>e.stopPropagation()}
        initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}>
        <div className="modal-header">
          <h2>Log Timeline Event</h2>
          <button className="btn-icon btn-ghost" onClick={onClose}><X size={18}/></button>
        </div>
        <form onSubmit={handleSubmit} className="modal-body">
          <input className="input-tech" placeholder="Event Title" required value={form.title} onChange={e=>setForm({...form,title:e.target.value})} />
          <div className="split-form">
            <TimelineDatePicker value={form.date} onChange={(value) => setForm({ ...form, date: value })} />
            <select className="input-tech" value={form.type} onChange={e=>setForm({...form,type:e.target.value})}>
              {['Academic','Cultural','Sports','Trip','Other'].map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
          <textarea className="input-tech" rows={3} placeholder="Event Description..." value={form.description} onChange={e=>setForm({...form,description:e.target.value})} />
          <button type="submit" className="btn btn-primary" disabled={loading} style={{width:'100%', padding:'14px'}}>
            {loading ? <span className="spinner"/> : 'Record Event'}
          </button>
        </form>
      </motion.div>
    </div>
  );
}

export default function Timeline() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    getEvents().then(res => {
      setEvents(res.data.events);
      setLoading(false);
    }).catch(() => {
      toast.error('Failed to load timeline');
      setLoading(false);
    });
  }, []);

  const sortedEvents = [...events].sort((a,b) => new Date(a.date) - new Date(b.date));

  return (
    <div className="page-wrap">
      <div className="page-hero">
        <h1 className="page-hero-title t-gradient">The <span className="t-gradient-color">Changelog.</span></h1>
        <p className="page-hero-sub">A sequential record of our two-year journey.</p>
      </div>

      <div className="contain">
        <div className="filters-strip">
          <div className="fs-search">
            <span className="t-muted" style={{fontFamily: 'var(--f-mono)', fontSize: '0.8rem'}}>SORTED CHRONOLOGICALLY</span>
          </div>
          <button className="btn btn-primary" onClick={()=>setShowModal(true)}><Plus size={16}/> Log Event</button>
        </div>

        {loading ? (
          <div className="tl-container">
            {Array.from({length:4}).map((_,i) => <div key={i} className="tech-card skel" style={{height:'140px', marginBottom: '24px', width: '80%'}}/>)}
          </div>
        ) : sortedEvents.length === 0 ? (
          <div className="empty-state">
            <Calendar size={40} className="empty-state-icon" />
            <h3>No Logs Available</h3>
            <p>The timeline has not been initialized with any events.</p>
          </div>
        ) : (
          <div className="tl-container">
            <div className="tl-line" />
            
            {sortedEvents.map((ev, i) => {
              const dateObj = new Date(ev.date);
              const m = dateObj.toLocaleString('en-US', { month: 'short' }).toUpperCase();
              const d = dateObj.getDate();
              const y = dateObj.getFullYear();

              return (
                <motion.div 
                  key={ev._id} 
                  initial={{ opacity: 0, x: -20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true, margin: '-50px' }}
                  transition={{ duration: 0.5, delay: i * 0.1 }}
                  className="tl-item"
                >
                  <div className="tl-node tooltip" data-tip={ev.type}>
                    <div className="tl-node-inner" />
                  </div>
                  
                  <div className="tl-date">
                    <span className="tl-m">{m}</span>
                    <span className="tl-d">{String(d).padStart(2,'0')}</span>
                    <span className="tl-y">{y}</span>
                  </div>

                  <div className="tech-card tl-card">
                    <div className="tl-card-head">
                      <h3 className="tl-title">{ev.title}</h3>
                      <span className="badge">{ev.type}</span>
                    </div>
                    {ev.description && <p className="tl-desc">{ev.description}</p>}
                    <div className="tl-meta">
                      Logged by {ev.createdBy?.name || 'System'}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      {showModal && <EventModal onClose={()=>setShowModal(false)} onSuccess={m=>setEvents([...events,m])} />}
    </div>
  );
}
