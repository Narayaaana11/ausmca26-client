import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Heart, MessageCircle, X, Search, Plus, Camera, Download } from 'lucide-react';
import toast from 'react-hot-toast';
import { getMemories, createMemory, likeMemory, resolveImageUrl } from '../services/api';
import ImageUpload from '../components/ImageUpload';
import './Gallery.css';

const EVENTS = ['All', 'Freshers', 'Cultural', 'Sports', 'Farewell', 'Trip', 'Classroom', 'General'];
const YEARS  = ['All', '2024', '2025', '2026'];

/* ── Upload Modal ── */
function UploadModal({ onClose, onSuccess }) {
  const [file, setFile] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState('');
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ year:'2025', event:'General' });

  const submitWithRetry = async (payload, retries = 2) => {
    let attempt = 0;
    let lastError;

    while (attempt <= retries) {
      try {
        return await createMemory(payload, {
          onUploadProgress: (evt) => {
            if (!evt.total) return;
            setUploadProgress(Math.round((evt.loaded * 100) / evt.total));
          },
        });
      } catch (err) {
        lastError = err;
        const status = err?.response?.status;
        const retriable = !status || status >= 500;
        if (!retriable || attempt === retries) break;
      }
      attempt += 1;
    }

    throw lastError;
  };

  const handleSubmit = async e => {
    e.preventDefault();
    if(!file) return toast.error('Select an image');
    setLoading(true);
    setUploadProgress(0);
    setUploadError('');
    try {
      const fd = new FormData();
      fd.append('image', file);
      Object.entries(form).forEach(([k,v]) => fd.append(k,v));
      const res = await submitWithRetry(fd);
      onSuccess(res.data.memory);
      toast.success('Image uploaded to cloud successfully');
      onClose();
    } catch {
      setUploadError('Upload failed after retry. Please try again.');
      toast.error('Upload failed');
    }
    finally { setLoading(false); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <motion.div className="modal-content" onClick={e=>e.stopPropagation()}
        initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}>
        <div className="modal-header">
          <h2>Create Memory Block</h2>
          <button className="btn-icon btn-ghost" onClick={onClose}><X size={18}/></button>
        </div>
        <div className="modal-body">
          <ImageUpload
            value={file}
            onChange={(nextFile, err) => {
              setFile(nextFile);
              setUploadError(err || '');
            }}
            disabled={loading}
            progress={uploadProgress}
            error={uploadError}
          />
          <div className="split-form">
            <select className="input-tech" value={form.year} onChange={e=>setForm({...form,year:e.target.value})}>
              {YEARS.slice(1).map(y=><option key={y}>{y}</option>)}
            </select>
            <select className="input-tech" value={form.event} onChange={e=>setForm({...form,event:e.target.value})}>
              {EVENTS.slice(1).map(ev=><option key={ev}>{ev}</option>)}
            </select>
          </div>
          <button onClick={handleSubmit} className="btn btn-primary" disabled={loading} style={{width:'100%', padding:'14px'}}>
            {loading ? <span className="spinner"/> : 'Deploy Image'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

function PreviewModal({ memory, onClose }) {
  if (!memory) return null;

  const imageUrl = resolveImageUrl(memory.imageUrl);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <motion.div
        className="gallery-preview-modal"
        onClick={(e) => e.stopPropagation()}
        initial={{ scale: 0.96, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.96, opacity: 0 }}
      >
        <div className="gallery-preview-stage">
          <div className="gallery-preview-controls">
            <a
              className="btn-icon gallery-preview-btn"
              href={imageUrl}
              download
              target="_blank"
              rel="noreferrer"
              aria-label="Download image"
              onClick={(event) => event.stopPropagation()}
            >
              <Download size={18} />
            </a>
            <button className="btn-icon gallery-preview-btn" onClick={onClose} aria-label="Close preview">
              <X size={18} />
            </button>
          </div>
          <img
            src={imageUrl}
            alt={memory.title || 'Preview image'}
            className="gallery-preview-image"
          />
        </div>
      </motion.div>
    </div>
  );
}

function MemCard({ m, onLike, onPreview }) {
  return (
    <motion.div layout initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9 }} className="tech-card card-gallery">
      <div className="cg-img">
        <img
          src={resolveImageUrl(m.thumbnailUrl || m.imageUrl)}
          alt={m.title}
          loading="lazy"
          onClick={() => onPreview(m)}
          className="cg-clickable"
        />
        <div className="cg-overlay">
          <button className={`cg-btn ${m._liked ? 'liked' : ''}`} onClick={()=>onLike(m._id)}>
            <Heart size={14} fill={m._liked?'currentColor':'none'} /> {m.likes.length}
          </button>
          <div className="cg-btn"><MessageCircle size={14} /> {m.comments.length}</div>
        </div>
      </div>
      <div className="cg-body">
        <div className="cg-tags">
          <span className="badge">{m.event}</span>
          <span className="badge">{m.year}</span>
        </div>
      </div>
    </motion.div>
  );
}

export default function Gallery() {
  const [memories, setMemories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterEvent, setFilterEvent] = useState('All');
  const [filterYear, setFilterYear] = useState('All');
  const [search, setSearch] = useState('');
  const [showUpload, setShowUpload] = useState(false);
  const [previewMemory, setPreviewMemory] = useState(null);

  useEffect(() => {
    getMemories().then(r => { setMemories(r.data.memories); setLoading(false); }).catch(()=>setLoading(false));
  }, []);

  const handleLike = async id => {
    try {
      const r = await likeMemory(id);
      setMemories(p => p.map(m => m._id === id ? { ...m, _liked: r.data.liked, likes: r.data.liked ? [...m.likes, 'x'] : m.likes.slice(0, -1) } : m));
    } catch {}
  };

  const filtered = memories.filter(m => 
    (filterEvent==='All' || m.event===filterEvent) &&
    (filterYear==='All' || m.year===filterYear) &&
    (!search || m.title.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="page-wrap">
      <div className="page-hero">
        <h1 className="page-hero-title t-gradient">Image <span className="t-gradient-color">Registry.</span></h1>
        <p className="page-hero-sub">Secure storage for captured visual data.</p>
      </div>

      <div className="contain">
        <div className="filters-strip">
          <div className="fs-search">
            <Search size={16} />
            <input className="input-tech" placeholder="Query images..." value={search} onChange={e=>setSearch(e.target.value)}/>
          </div>
          <div className="fs-pills">
            {EVENTS.map(e => <button key={e} className={`badge ${filterEvent===e?'active':''}`} onClick={()=>setFilterEvent(e)}>{e}</button>)}
          </div>
          <button className="btn btn-primary" onClick={()=>setShowUpload(true)}><Plus size={16}/> New Entry</button>
        </div>

        {loading ? (
          <div className="grid-gallery">
            {Array.from({length:8}).map((_,i)=><div key={i} className="tech-card skel" style={{height:'300px'}}/>)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <Camera size={40} className="empty-state-icon" />
            <h3>Registry is Empty</h3>
            <p>No records found matching current query parameters.</p>
            <button className="btn btn-secondary" onClick={()=>setShowUpload(true)}>Initialize Record</button>
          </div>
        ) : (
          <motion.div className="grid-gallery" layout>
            <AnimatePresence>
              {filtered.map(m => <MemCard key={m._id} m={m} onLike={handleLike} onPreview={setPreviewMemory} />)}
            </AnimatePresence>
          </motion.div>
        )}
      </div>

      <AnimatePresence>
        {showUpload && <UploadModal onClose={()=>setShowUpload(false)} onSuccess={m=>setMemories(p=>[m,...p])} />}
        {previewMemory && <PreviewModal memory={previewMemory} onClose={() => setPreviewMemory(null)} />}
      </AnimatePresence>
    </div>
  );
}
