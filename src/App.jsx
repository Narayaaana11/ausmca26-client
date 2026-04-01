import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import Navbar from './components/Navbar';
import Home from './pages/Home';
import Gallery from './pages/Gallery';
import Yearbook from './pages/Yearbook';
import Timeline from './pages/Timeline';
import Wall from './pages/Wall';
import Faces from './pages/Faces';

function App() {
  return (
    <BrowserRouter>
      <div className="app">
        {/* Ambient gold orbs */}
        <div className="gold-orbs" aria-hidden="true">
          <div className="gold-orb gold-orb-1" />
          <div className="gold-orb gold-orb-2" />
          <div className="gold-orb gold-orb-3" />
          <div className="gold-orb gold-orb-4" />
        </div>

        <Navbar />

        <Routes>
          <Route path="/"         element={<Home />} />
          <Route path="/gallery"  element={<Gallery />} />
          <Route path="/yearbook" element={<Yearbook />} />
          <Route path="/timeline" element={<Timeline />} />
          <Route path="/wall"     element={<Wall />} />
          <Route path="/faces"    element={<Faces />} />
          <Route path="*"         element={<Navigate to="/" replace />} />
        </Routes>

        <Toaster
          position="bottom-center"
          toastOptions={{
            style: {
              background: 'rgba(10,10,10,0.97)',
              color: '#ffffff',
              border: '1px solid rgba(255,255,255,0.12)',
              backdropFilter: 'blur(20px)',
              borderRadius: '12px',
              fontSize: '0.875rem',
              boxShadow: '0 8px 40px rgba(0,0,0,0.6)',
              maxWidth: 'calc(100vw - 32px)',
            },
            success: {
              iconTheme: { primary: '#0070F3', secondary: '#000' },
            },
            error: {
              iconTheme: { primary: '#FF0080', secondary: '#fff' },
            },
          }}
        />
      </div>
    </BrowserRouter>
  );
}

export default App;
