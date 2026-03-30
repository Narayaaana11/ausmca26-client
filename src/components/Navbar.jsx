import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Image as ImageIcon, Users, Calendar, MessageSquare, Menu, X } from 'lucide-react';
import ausLogo from '../assets/auslogo.png';
import './Navbar.css';

const LINKS = [
  { to: '/gallery',  label: 'Gallery',  icon: ImageIcon },
  { to: '/yearbook', label: 'Registry', icon: Users },
  { to: '/timeline', label: 'Timeline', icon: Calendar },
  { to: '/wall',     label: 'Wall',     icon: MessageSquare },
];

export default function Navbar() {
  const loc = useLocation();
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => setMobileOpen(false), [loc.pathname]);

  return (
    <>
      <motion.nav
        className={`nav-dock ${scrolled ? 'dock-scrolled' : ''}`}
        initial={{ y: -100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 200, damping: 20 }}
      >
        <div className="dock-inner">
          <Link to="/" className="dock-brand">
            <div className="dock-logo">
              <img src={ausLogo} alt="AUS MCA logo" className="dock-logo-img" />
            </div>
            <div className="dock-brand-text">
              <span className="dock-brand-main">MCA '26</span>
            </div>
          </Link>

          <div className="dock-links">
            {LINKS.map(({ to, label }) => {
              const active = loc.pathname === to;
              return (
                <Link key={to} to={to} className={`dock-link ${active ? 'active' : ''}`}>
                  {active && (
                    <motion.div
                      layoutId="dock-indicator"
                      className="dock-indicator"
                      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                    />
                  )}
                  <span className="dock-link-text">{label}</span>
                </Link>
              );
            })}
          </div>

          <div className="dock-right">
            <span className="dock-credit">Developed by IndentDev</span>
            <div className="badge badge-magic">
              <div className="status-dot pulse" /> Live
            </div>
          </div>

          <button className="dock-menu-btn" onClick={() => setMobileOpen(!mobileOpen)}>
            {mobileOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </motion.nav>

      {/* Mobile Menu */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            className="mobile-menu-overlay"
            initial={{ opacity: 0, backdropFilter: 'blur(0px)' }}
            animate={{ opacity: 1, backdropFilter: 'blur(16px)' }}
            exit={{ opacity: 0, backdropFilter: 'blur(0px)' }}
          >
            <motion.div
              className="mobile-menu-content"
              initial={{ scale: 0.95, y: -20, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.95, y: -20, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            >
              <div className="mobile-menu-header">
                <span className="t-h3 t-gradient">Menu</span>
                <button className="btn-icon" onClick={() => setMobileOpen(false)}><X size={20} /></button>
              </div>
              <div className="mobile-links">
                <div className="mob-credit">Developed by IndentDev</div>
                <Link to="/" className={`mob-link ${loc.pathname === '/' ? 'active' : ''}`}>
                  Home
                </Link>
                {LINKS.map(({ to, label, icon: Icon }) => (
                  <Link key={to} to={to} className={`mob-link ${loc.pathname === to ? 'active' : ''}`}>
                    <Icon size={18} /> {label}
                  </Link>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
