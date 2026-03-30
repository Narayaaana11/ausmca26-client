import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageSquare, Heart, Terminal, X, RefreshCcw } from 'lucide-react';
import toast from 'react-hot-toast';
import { getPosts, createPost, likePost } from '../services/api';
import './Wall.css';

function PostModal({ onClose, onSuccess }) {
  const [authorName, setAuthorName] = useState('');
  const [content, setContent] = useState('');
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!content.trim()) return toast.error('Message payload cannot be empty.');
    if (!isAnonymous && !authorName.trim()) return toast.error('Please enter your name.');
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append('authorName', authorName.trim());
      fd.append('content', content);
      fd.append('isAnonymous', isAnonymous);
      fd.append('backgroundColor', '#000000');
      const res = await createPost(fd);
      onSuccess(res.data.post);
      toast.success('Message Broadcasted');
      onClose();
    } catch { toast.error('Transmission Failed'); }
    finally { setLoading(false); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <motion.div className="modal-content" onClick={e=>e.stopPropagation()}
        initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}>
        <div className="modal-header">
          <h2>Broadcast Message</h2>
          <button className="btn-icon btn-ghost" onClick={onClose}><X size={18}/></button>
        </div>
        <form onSubmit={handleSubmit} className="modal-body">
          <input
            className="input-tech"
            placeholder="Your identity (name)"
            value={authorName}
            onChange={e=>setAuthorName(e.target.value)}
            disabled={isAnonymous}
          />
          <textarea className="input-tech" style={{minHeight: 180, fontSize: '1.1rem'}} placeholder="Enter message payload..." value={content} onChange={e=>setContent(e.target.value)} autoFocus />
          <label className="checkbox-wrap">
            <input type="checkbox" checked={isAnonymous} onChange={e=>setIsAnonymous(e.target.checked)} />
            <span className="cb-box" />
            <span className="cb-label">Transmit anonymously (hide sender identity)</span>
          </label>
          <button type="submit" className="btn btn-primary" disabled={loading} style={{width:'100%', padding:'14px'}}>
            {loading ? <span className="spinner"/> : 'Broadcast'}
          </button>
        </form>
      </motion.div>
    </div>
  );
}

export default function Wall() {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => { loadPosts(); }, []);

  const loadPosts = async () => {
    setLoading(true);
    try {
      const res = await getPosts();
      setPosts(res.data.posts);
    } catch { toast.error('Failed to connect to message registry'); }
    finally { setLoading(false); }
  };

  const handleLike = async (id) => {
    try {
      const res = await likePost(id);
      setPosts(p => p.map(post => post._id === id ? {
        ...post, _liked: res.data.liked, likes: res.data.liked ? [...post.likes, 'x'] : post.likes.slice(0,-1)
      } : post));
    } catch { }
  };

  return (
    <div className="page-wrap">
      <div className="page-hero">
        <h1 className="page-hero-title t-gradient">Message <span className="t-gradient-color">Queue.</span></h1>
        <p className="page-hero-sub">Public broadcasting channel for the 2024–2026 nodes.</p>
      </div>

      <div className="contain">
        <div className="wall-controls">
          <div className="wc-status badge">
            <div className="status-dot pulse" style={{background: 'var(--accent-1)'}}/> System Online
          </div>
          <div className="wc-actions">
            <button className="btn btn-ghost" onClick={loadPosts} disabled={loading}><RefreshCcw size={14} className={loading?'spin':''}/> Sync</button>
            <button className="btn btn-primary" onClick={()=>setShowModal(true)}><Terminal size={14}/> Broadcast</button>
          </div>
        </div>

        {loading ? (
          <div className="wall-masonry">
            {Array.from({length: 6}).map((_, i) => <div key={i} className="tech-card skel" style={{height: 180 + Math.random() * 100}}/>)}
          </div>
        ) : posts.length === 0 ? (
          <div className="empty-state">
            <MessageSquare size={40} className="empty-state-icon" />
            <h3>Message Queue Empty</h3>
            <p>No messages have been broadcasted yet. Be the first.</p>
          </div>
        ) : (
          <div className="wall-masonry">
            {posts.map(post => (
              <motion.div key={post._id}
                initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                className="tech-card wall-card"
              >
                <div className="wall-card-content">{post.content}</div>
                <div className="wall-card-footer">
                  <div className="wall-meta">
                    <span className="wm-avatar">{post.isAnonymous ? '?' : (post.author?.name?.[0] || 'U')}</span>
                    <div className="wm-info">
                      <span className="wm-name">{post.isAnonymous ? 'Anonymous Node' : post.author?.name}</span>
                      <span className="wm-time">{new Date(post.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <button className={`btn-icon btn-ghost wall-like ${post._liked ? 'liked' : ''}`} onClick={()=>handleLike(post._id)}>
                    <Heart size={14} fill={post._liked ? 'currentColor' : 'none'} />
                    <span style={{fontSize:'0.75rem', fontWeight:600}}>{post.likes.length}</span>
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      <AnimatePresence>
        {showModal && <PostModal onClose={()=>setShowModal(false)} onSuccess={p=>setPosts([p,...posts])} />}
      </AnimatePresence>
    </div>
  );
}
