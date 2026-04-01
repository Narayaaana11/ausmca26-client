import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Heart, MessageCircle, X, Search, Plus, Camera, UploadCloud } from 'lucide-react';
import toast from 'react-hot-toast';
import Lightbox from 'yet-another-react-lightbox';
import Download from 'yet-another-react-lightbox/plugins/download';
import Zoom from 'yet-another-react-lightbox/plugins/zoom';
import { getMemories, createMemoriesBulk, likeMemory, resolveImageUrl } from '../services/api';
import BulkImageUpload from '../components/BulkImageUpload';
import './Gallery.css';

const EVENTS = ['All', 'Freshers', 'Cultural', 'Sports', 'Farewell', 'Trip', 'Classroom', 'General'];
const YEARS = ['All', '2024', '2025', '2026'];

/* -- Upload Modal -- */
function UploadModal({ onClose, onSuccess }) {
  const [files, setFiles] = useState([]);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState('');
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ year: '2025', event: 'General' });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!files.length) return toast.error('Select at least one photo');

    setLoading(true);
    setUploadProgress(0);
    setUploadError('');

    try {
      const fd = new FormData();
      files.forEach((file) => fd.append('images', file));
      Object.entries(form).forEach(([key, value]) => fd.append(key, value));

      const response = await createMemoriesBulk(fd, {
        onUploadProgress: (evt) => {
          if (!evt.total) return;
          setUploadProgress(Math.round((evt.loaded * 100) / evt.total));
        },
      });

      const uploaded = Array.isArray(response.data?.memories) ? response.data.memories : [];
      const failedCount = Number(response.data?.failedCount || 0);

      if (!uploaded.length) {
        throw new Error(response.data?.message || 'No photos were uploaded.');
      }

      onSuccess(uploaded);

      if (failedCount > 0) {
        toast.success(`${uploaded.length} photos uploaded, ${failedCount} failed`);
      } else {
        toast.success(`${uploaded.length} photos uploaded successfully`);
      }

      onClose();
    } catch (error) {
      setUploadError(error?.response?.data?.message || 'Bulk upload failed. You can retry without losing the selected queue.');
      toast.error('Bulk upload failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <motion.div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
      >
        <div className="modal-header">
          <h2>Add Photos in Bulk</h2>
          <button className="btn-icon btn-ghost" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="modal-body">
          <BulkImageUpload
            files={files}
            onChange={(nextFiles, err) => {
              setFiles(nextFiles);
              setUploadError(err || '');
            }}
            disabled={loading}
            error={uploadError}
          />

          <div className="split-form">
            <select
              className="input-tech"
              value={form.year}
              onChange={(e) => setForm({ ...form, year: e.target.value })}
            >
              {YEARS.slice(1).map((year) => (
                <option key={year}>{year}</option>
              ))}
            </select>

            <select
              className="input-tech"
              value={form.event}
              onChange={(e) => setForm({ ...form, event: e.target.value })}
            >
              {EVENTS.slice(1).map((event) => (
                <option key={event}>{event}</option>
              ))}
            </select>
          </div>

          <button
            onClick={handleSubmit}
            className="btn btn-primary"
            disabled={loading}
            style={{ width: '100%', padding: '14px' }}
          >
            {loading ? <span className="spinner" /> : (files.length ? `Upload ${files.length} Photo${files.length === 1 ? '' : 's'}` : 'Upload Photos')}
          </button>

          {!!uploadProgress && uploadProgress < 100 ? (
            <div className="bulk-upload-progress">
              <div className="bulk-upload-progress-head">
                <span>
                  <UploadCloud size={14} /> Uploading selected photos...
                </span>
                <span>{uploadProgress}%</span>
              </div>
              <div className="iu-progress">
                <div className="iu-progress-bar" style={{ width: `${uploadProgress}%` }} />
              </div>
            </div>
          ) : null}
        </div>
      </motion.div>
    </div>
  );
}

function MemCard({ m, onLike, onPreview }) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9 }}
      className="tech-card card-gallery"
    >
      <div className="cg-img">
        <img
          src={resolveImageUrl(m.thumbnailUrl || m.imageUrl)}
          alt={m.title}
          loading="lazy"
          onClick={() => onPreview(m._id)}
          className="cg-clickable"
        />
        <div className="cg-overlay">
          <button className={`cg-btn ${m._liked ? 'liked' : ''}`} onClick={() => onLike(m._id)}>
            <Heart size={14} fill={m._liked ? 'currentColor' : 'none'} /> {m.likes.length}
          </button>
          <div className="cg-btn">
            <MessageCircle size={14} /> {m.comments.length}
          </div>
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
  const [previewIndex, setPreviewIndex] = useState(-1);

  useEffect(() => {
    getMemories()
      .then((response) => {
        setMemories(response.data.memories);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const handleLike = async (id) => {
    try {
      const response = await likeMemory(id);
      setMemories((previous) => previous.map((memory) => (
        memory._id === id
          ? {
              ...memory,
              _liked: response.data.liked,
              likes: response.data.liked ? [...memory.likes, 'x'] : memory.likes.slice(0, -1),
            }
          : memory
      )));
    } catch {}
  };

  const filtered = memories.filter((memory) => (
    (filterEvent === 'All' || memory.event === filterEvent)
    && (filterYear === 'All' || memory.year === filterYear)
    && (!search || (memory.title || '').toLowerCase().includes(search.toLowerCase()))
  ));

  const slides = filtered.map((memory) => ({
    src: resolveImageUrl(memory.imageUrl),
    alt: memory.title || 'Preview image',
    download: resolveImageUrl(memory.imageUrl),
  }));

  const openPreviewById = (id) => {
    const index = filtered.findIndex((memory) => memory._id === id);
    if (index >= 0) setPreviewIndex(index);
  };

  return (
    <div className="page-wrap">
      <div className="page-hero">
        <h1 className="page-hero-title t-gradient">
          Image <span className="t-gradient-color">Registry.</span>
        </h1>
        <p className="page-hero-sub">Secure storage for captured visual data.</p>
      </div>

      <div className="contain">
        <div className="filters-strip">
          <div className="fs-search">
            <Search size={16} />
            <input
              className="input-tech"
              placeholder="Query images..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="fs-pills">
            {EVENTS.map((event) => (
              <button
                key={event}
                className={`badge ${filterEvent === event ? 'active' : ''}`}
                onClick={() => setFilterEvent(event)}
              >
                {event}
              </button>
            ))}
          </div>

          <button className="btn btn-primary" onClick={() => setShowUpload(true)}>
            <Plus size={16} /> New Entry
          </button>
        </div>

        {loading ? (
          <div className="grid-gallery">
            {Array.from({ length: 8 }).map((_, index) => (
              <div key={index} className="tech-card skel" style={{ height: '300px' }} />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <Camera size={40} className="empty-state-icon" />
            <h3>Registry is Empty</h3>
            <p>No records found matching current query parameters.</p>
            <button className="btn btn-secondary" onClick={() => setShowUpload(true)}>
              Initialize Record
            </button>
          </div>
        ) : (
          <motion.div className="grid-gallery" layout>
            <AnimatePresence>
              {filtered.map((memory) => (
                <MemCard key={memory._id} m={memory} onLike={handleLike} onPreview={openPreviewById} />
              ))}
            </AnimatePresence>
          </motion.div>
        )}
      </div>

      <AnimatePresence>
        {showUpload && (
          <UploadModal
            onClose={() => setShowUpload(false)}
            onSuccess={(items) => setMemories((previous) => [...items, ...previous])}
          />
        )}
      </AnimatePresence>

      <Lightbox
        open={previewIndex >= 0}
        index={previewIndex}
        close={() => setPreviewIndex(-1)}
        slides={slides}
        plugins={[Download, Zoom]}
        carousel={{ finite: filtered.length <= 1 }}
        controller={{ closeOnBackdropClick: true }}
      />
    </div>
  );
}
