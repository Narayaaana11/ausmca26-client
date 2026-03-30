import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, useScroll, useTransform, AnimatePresence } from 'framer-motion';
import { ArrowRight, Image as ImageIcon, Users, Calendar, MessageSquare, Code, Terminal, ChevronRight } from 'lucide-react';
import { io } from 'socket.io-client';
import { API_BASE_URL, getLiveStats } from '../services/api';
import './Home.css';

const SOCKET_URL = (import.meta.env.VITE_SOCKET_URL || API_BASE_URL).replace(/\/api\/?$/, '');
const DEFAULT_LIVE_STATS = {
  activeNodes: '0+',
  memoryBlocks: '0+',
  uptime: '0m',
  batchSpirit: '0%',
};

const normalizeLiveStats = (payload) => {
  if (!payload?.display) return null;

  return {
    activeNodes: payload.display.activeNodes || '0+',
    memoryBlocks: payload.display.memoryBlocks || '0+',
    uptime: payload.display.uptime || '0m',
    batchSpirit: payload.display.batchSpirit || '0%',
  };
};

/* ──────────────────────────────────────────────────────
   COUNTDOWN TIMER (Clean Tech Style)
────────────────────────────────────────────────────── */
const END_DATE = new Date('2026-04-24T00:00:00+05:30');

function useCountdown() {
  const [t, setT] = useState({ mode: 'before', d:0, h:0, m:0, s:0, years:0, months:0, days:0 });
  useEffect(() => {
    function tick() {
      const now = new Date();
      const diff = END_DATE - now;
      if (diff > 0) {
        const total = Math.floor(diff/1000);
        setT({ mode:'before', d:Math.floor(total/86400), h:Math.floor((total%86400)/3600), m:Math.floor((total%3600)/60), s:total%60 });
      } else {
        const el = Math.floor(Math.abs(diff)/1000);
        const td = Math.floor(el/86400);
        const y = Math.floor(td/365), rem = td%365, mo=Math.floor(rem/30), dy=rem%30;
        setT({ mode:'after', years:y, months:mo, days:dy });
      }
    }
    tick(); const id = setInterval(tick,1000); return ()=>clearInterval(id);
  },[]);
  return t;
}

function TechCountdown() {
  const t = useCountdown();
  if (t.mode === 'before') return (
    <div className="tech-timer">
      <div className="tt-box">
        <span className="tt-val">{String(t.d).padStart(2,'0')}</span>
        <span className="tt-lbl">DAYS</span>
      </div>
      <span className="tt-sep">:</span>
      <div className="tt-box">
        <span className="tt-val">{String(t.h).padStart(2,'0')}</span>
        <span className="tt-lbl">HR</span>
      </div>
      <span className="tt-sep">:</span>
      <div className="tt-box">
        <span className="tt-val">{String(t.m).padStart(2,'0')}</span>
        <span className="tt-lbl">MIN</span>
      </div>
      <span className="tt-sep">:</span>
      <div className="tt-box">
        <span className="tt-val">{String(t.s).padStart(2,'0')}</span>
        <span className="tt-lbl">SEC</span>
      </div>
    </div>
  );
  return (
    <div className="tech-timer">
      <div className="tt-box"><span className="tt-val">{t.years}</span><span className="tt-lbl">YRS</span></div>
      <div className="tt-box"><span className="tt-val">{t.months}</span><span className="tt-lbl">MOS</span></div>
      <div className="tt-box"><span className="tt-val">{t.days}</span><span className="tt-lbl">DAYS</span></div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────
   BENTO GRID WITH SPOTLIGHT EFFECT
────────────────────────────────────────────────────── */
const BENTO_ITEMS = [
  { id: 'gallery', to: '/gallery',  title: 'Gallery',  sub: 'Visual Archive', icon: ImageIcon,    span: 'col-span-2' },
  { id: 'yearbook',to: '/yearbook', title: 'Registry', sub: 'The Roster',     icon: Users,        span: 'col-span-1' },
  { id: 'timeline',to: '/timeline', title: 'Timeline', sub: 'Changelog',      icon: Calendar,     span: 'col-span-1' },
  { id: 'wall',    to: '/wall',     title: 'Wall',     sub: 'Guestbook',      icon: MessageSquare,span: 'col-span-2' },
];

function BentoGrid() {
  const gridRef = useRef(null);

  const handleMouseMove = (e) => {
    if (!gridRef.current) return;
    const cards = gridRef.current.querySelectorAll('.bento-card');
    for (const card of cards) {
      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      card.style.setProperty('--mouse-x', `${x}px`);
      card.style.setProperty('--mouse-y', `${y}px`);
    }
  };

  return (
    <div className="bento-wrapper" ref={gridRef} onMouseMove={handleMouseMove}>
      <div className="bento-grid">
        {BENTO_ITEMS.map((item) => (
          <Link to={item.to} key={item.id} className={`bento-card ${item.span}`}>
            <div className="bento-border-glow" />
            <div className="bento-inner">
              <div className="bento-icon-wrapper">
                <item.icon size={20} strokeWidth={1.5} />
              </div>
              <div className="bento-text">
                <h3 className="bento-title">{item.title}</h3>
                <p className="bento-desc">{item.sub}</p>
              </div>
              <div className="bento-arrow">
                <ArrowRight size={16} />
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────
   HOME PAGE (Tech Premium)
────────────────────────────────────────────────────── */
export default function Home() {
  const heroRef = useRef(null);
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ["start start", "end start"] });
  const heroScale   = useTransform(scrollYProgress, [0, 1], [1, 0.9]);
  const heroOpacity = useTransform(scrollYProgress, [0, 0.8], [1, 0]);
  const [liveStats, setLiveStats] = useState(DEFAULT_LIVE_STATS);

  useEffect(() => {
    let isMounted = true;

    const refreshLiveStats = async () => {
      try {
        const response = await getLiveStats();
        const next = normalizeLiveStats(response?.data?.data);
        if (isMounted && next) {
          setLiveStats(next);
        }
      } catch (error) {
        // Keep last known stats if HTTP refresh fails.
      }
    };

    refreshLiveStats();
    const pollId = setInterval(refreshLiveStats, 30000);

    const socket = io(SOCKET_URL, {
      transports: ['polling', 'websocket'],
      withCredentials: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    socket.on('live-stats:update', (payload) => {
      const next = normalizeLiveStats(payload);
      if (next) {
        setLiveStats(next);
      }
    });

    return () => {
      isMounted = false;
      clearInterval(pollId);
      socket.disconnect();
    };
  }, []);

  return (
    <div className="home-tech">
      {/* ── BACKGROUND MESH / GLOW ── */}
      <div className="mesh-layer" aria-hidden="true">
        <div className="mesh-blob blob-1" />
        <div className="mesh-blob blob-2" />
      </div>

      <section ref={heroRef} className="hero-tech">
        <motion.div
          className="hero-tech-content"
          style={{ scale: heroScale, opacity: heroOpacity }}
        >
          {/* Badge */}
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.16,1,0.3,1] }}
          >
            <div className="badge badge-magic" style={{ marginBottom: '24px' }}>
              <Terminal size={12} style={{ marginRight: '6px' }} />
              AUS MCA
            </div>
          </motion.div>

          {/* Heading */}
          <motion.div
            className="hero-headings"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.1, ease: [0.16,1,0.3,1] }}
          >
            <h1 className="t-hero">
              The Class of <br />
              <span className="t-gradient-color">2026.</span>
            </h1>
            <p className="hero-desc">
              A digital scrapbook of our college journey - from first classes to final memories.
            </p>
          </motion.div>

          {/* Actions */}
          <motion.div
            className="hero-actions"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2, ease: [0.16,1,0.3,1] }}
          >
            <Link to="/gallery" className="btn btn-primary">
              Initialize Gallery <ChevronRight size={16} />
            </Link>
            <Link to="/yearbook" className="btn btn-secondary">
              Registry
            </Link>
          </motion.div>

          <motion.div
            className="hero-timer-wrap"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1, delay: 0.4 }}
          >
            <div className="timer-label">TIME TO GRADUATION</div>
            <TechCountdown />
          </motion.div>
        </motion.div>
      </section>

      {/* ── BENTO SECTION ── */}
      <section className="section bento-section">
        <div className="contain">
          <motion.div
            className="section-header"
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-100px' }}
            transition={{ duration: 0.7 }}
          >
            <h2 className="t-h2">AUS MCA 2024 - 2026</h2>
            <p className="t-muted" style={{ fontSize: '1.25rem' }}>Explore every module of our batch's history.</p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-100px' }}
            transition={{ duration: 0.7, delay: 0.1 }}
          >
            <BentoGrid />
          </motion.div>
        </div>
      </section>

      {/* ── STATS FOOTER ── */}
      <section className="section stats-tech-section">
        <div className="contain">
          <div className="stats-tech-grid">
            <div className="st-item">
              <div className="st-val">{liveStats.activeNodes}</div>
              <div className="st-lbl">Active Nodes</div>
            </div>
            <div className="st-item">
              <div className="st-val">{liveStats.memoryBlocks}</div>
              <div className="st-lbl">Memory Blocks</div>
            </div>
            <div className="st-item">
              <div className="st-val">{liveStats.uptime}</div>
              <div className="st-lbl">Uptime</div>
            </div>
            <div className="st-item">
              <div className="st-val">{liveStats.batchSpirit}</div>
              <div className="st-lbl">Batch Spirit</div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
