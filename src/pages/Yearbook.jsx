import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Users, Search, Camera, Plus, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { createMember, getAllMembers, resolveImageUrl } from '../services/api';
import ImageUpload from '../components/ImageUpload';
import './Yearbook.css';

const ROLL_NO_REGEX = /^24M11MC\d{3}$/i;
const INSTAGRAM_LOGO_URL = 'https://images.unsplash.com/photo-1611262588024-d12430b98920?auto=format&fit=crop&w=128&q=80&fm=png';

function AddMemberModal({ onClose, onCreated }) {
  const [photo, setPhoto] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState('');
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    name: '',
    rollNo: '',
    mobile: '',
    section: 'A',
    instagramId: '',
  });

  const validateForm = () => {
    if (!photo) return 'Person photo is required.';
    if (!form.name.trim()) return 'Name is required.';
    if (!ROLL_NO_REGEX.test(form.rollNo.trim())) return 'Roll number format should be 24M11MC176.';
    if (!/^\d{10}$/.test(form.mobile.trim())) return 'Mobile number must be 10 digits.';
    if (!['A', 'B', 'C', 'F'].includes(form.section)) return 'Section must be A, B, C, or F.';
    return '';
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const err = validateForm();
    if (err) {
      setUploadError(err);
      return;
    }

    setLoading(true);
    setUploadError('');
    setUploadProgress(0);

    try {
      const fd = new FormData();
      fd.append('photo', photo);
      fd.append('name', form.name.trim());
      fd.append('rollNo', form.rollNo.trim().toUpperCase());
      fd.append('mobile', form.mobile.trim());
      fd.append('section', form.section);
      fd.append('instagramId', form.instagramId.trim());

      const res = await createMember(fd, {
        onUploadProgress: (evt) => {
          if (!evt.total) return;
          setUploadProgress(Math.round((evt.loaded * 100) / evt.total));
        },
      });

      onCreated(res.data.member);
      toast.success('Member added to registry');
      onClose();
    } catch (apiErr) {
      const message = apiErr?.response?.data?.message || 'Failed to add member';
      setUploadError(message);
      toast.error(message);
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
          <h2>Add Registry Member</h2>
          <button className="btn-icon btn-ghost" onClick={onClose}><X size={18} /></button>
        </div>
        <form className="modal-body" onSubmit={handleSubmit}>
          <ImageUpload
            value={photo}
            onChange={(file, err) => {
              setPhoto(file);
              setUploadError(err || '');
            }}
            disabled={loading}
            progress={uploadProgress}
            error={uploadError}
          />
          <input
            className="input-tech"
            placeholder="Name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <input
            className="input-tech"
            placeholder="Roll Number (24M11MC176)"
            value={form.rollNo}
            onChange={(e) => setForm({ ...form, rollNo: e.target.value.toUpperCase() })}
          />
          <input
            className="input-tech"
            placeholder="Mobile Number"
            maxLength={10}
            value={form.mobile}
            onChange={(e) => setForm({ ...form, mobile: e.target.value.replace(/\D/g, '') })}
          />
          <div className="yb-form-grid">
            <select
              className="input-tech"
              value={form.section}
              onChange={(e) => setForm({ ...form, section: e.target.value })}
            >
              {['A', 'B', 'C', 'F'].map((section) => (
                <option key={section} value={section}>{section}</option>
              ))}
            </select>
            <input
              className="input-tech"
              placeholder="Instagram ID"
              value={form.instagramId}
              onChange={(e) => setForm({ ...form, instagramId: e.target.value })}
            />
          </div>
          <button type="submit" className="btn btn-primary" disabled={loading} style={{ width: '100%', padding: '14px' }}>
            {loading ? <span className="spinner" /> : 'Add Member'}
          </button>
        </form>
      </motion.div>
    </div>
  );
}

function MemberCard({ member }) {
  const getAvatarInitials = (name) => {
    return name.split(' ').map(n=>n[0]).join('').substring(0, 2).toUpperCase();
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.4 }}
      className="tech-card yb-card"
    >
      <div className="yb-avatar-wrapper">
        {member.profilePicture ? (
          <img src={resolveImageUrl(member.profilePicture)} alt={member.name} className="yb-avatar" loading="lazy" />
        ) : (
          <div className="yb-avatar-placeholder">{getAvatarInitials(member.name)}</div>
        )}
      </div>
      <div className="yb-info">
        <h3 className="yb-name">{member.name}</h3>
        <p className="yb-tag t-muted">{member.rollNo || member.email}</p>
        <div className="yb-quote-box">
          <p className="yb-quote">
            {member.branch || 'Section not set'} {member.bio ? `• ${member.bio}` : ''}
          </p>
        </div>
      </div>
      <div className="yb-socials">
        {member.socialLinks?.instagram && (
          <a
            href={member.socialLinks.instagram}
            target="_blank"
            rel="noreferrer"
            className="sc-icon sc-icon-instagram"
            aria-label="Instagram"
            title="Instagram"
          >
            <img src={INSTAGRAM_LOGO_URL} alt="Instagram" className="sc-icon-img" loading="lazy" />
          </a>
        )}
        {member.socialLinks?.linkedin && <a href={member.socialLinks.linkedin} target="_blank" rel="noreferrer" className="sc-icon">IN</a>}
        {member.socialLinks?.twitter && <a href={member.socialLinks.twitter} target="_blank" rel="noreferrer" className="sc-icon">X</a>}
      </div>
    </motion.div>
  );
}

export default function Yearbook() {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);

  useEffect(() => {
    getAllMembers().then(res => {
      setMembers(res.data.members || []);
      setLoading(false);
    }).catch(() => {
      toast.error('Failed to load roster');
      setLoading(false);
    });
  }, []);

  const filtered = members.filter(m =>
    m.name.toLowerCase().includes(search.toLowerCase()) ||
    m.email.toLowerCase().includes(search.toLowerCase()) ||
    (m.rollNo || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="page-wrap">
      <div className="page-hero">
        <h1 className="page-hero-title t-gradient">The <span className="t-gradient-color">Registry.</span></h1>
        <p className="page-hero-sub">The active nodes of the 2024–2026 Batch.</p>
      </div>

      <div className="contain">
        <div className="filters-strip">
          <div className="fs-search">
            <Search size={16} />
            <input className="input-tech" placeholder="Search by name or ID..." value={search} onChange={e=>setSearch(e.target.value)}/>
          </div>
          <button className="btn btn-primary" onClick={() => setShowAdd(true)}>
            <Plus size={16} /> Add
          </button>
          <div className="yb-count badge">
            <Users size={14} style={{ marginRight: 6 }} />
            {filtered.length} Nodes Online
          </div>
        </div>

        {loading ? (
          <div className="yb-grid">
            {Array.from({length: 6}).map((_, i) => <div key={i} className="tech-card skel" style={{height: '320px'}}/>)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <Users size={40} className="empty-state-icon" />
            <h3>No Nodes Found</h3>
            <p>Your query did not return any matches.</p>
          </div>
        ) : (
          <div className="yb-grid">
            {filtered.map(member => (
              <MemberCard key={member._id} member={member} />
            ))}
          </div>
        )}
      </div>

      {showAdd && <AddMemberModal onClose={() => setShowAdd(false)} onCreated={(member) => setMembers((prev) => [member, ...prev])} />}
    </div>
  );
}
