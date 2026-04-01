import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ScanFace, UserRound, X, Image as ImageIcon, RefreshCcw, PencilLine, Download } from 'lucide-react';
import { getImages, resolveImageUrl } from '../services/api';
import './Faces.css';

const MODEL_URL = 'https://cdn.jsdelivr.net/npm/face-api.js-models@0.1.4/weights';
const FACE_MATCH_THRESHOLD = 0.5;
const MAX_IMAGES_TO_SCAN = 180;
const FACE_CACHE_KEY = 'bm_faces_cache_v1';
const FACE_NAMES_KEY = 'bm_faces_names_v1';

const descriptorDistance = (first, second) => {
  if (!first || !second || first.length !== second.length) return Number.POSITIVE_INFINITY;

  let sum = 0;
  for (let index = 0; index < first.length; index += 1) {
    const delta = first[index] - second[index];
    sum += delta * delta;
  }

  return Math.sqrt(sum);
};

const averageDescriptors = (descriptors) => {
  if (!descriptors.length) return [];

  const output = Array.from({ length: descriptors[0].length }, () => 0);
  descriptors.forEach((descriptor) => {
    for (let index = 0; index < descriptor.length; index += 1) {
      output[index] += descriptor[index];
    }
  });

  return output.map((value) => value / descriptors.length);
};

const createFacePreview = (imageElement, box) => {
  const canvas = document.createElement('canvas');
  const padX = box.width * 0.22;
  const padY = box.height * 0.3;
  const sourceX = Math.max(0, box.x - padX);
  const sourceY = Math.max(0, box.y - padY);
  const sourceWidth = Math.min(imageElement.width - sourceX, box.width + padX * 2);
  const sourceHeight = Math.min(imageElement.height - sourceY, box.height + padY * 2);

  canvas.width = 200;
  canvas.height = 200;

  const context = canvas.getContext('2d');
  context.drawImage(imageElement, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, 200, 200);

  return canvas.toDataURL('image/webp', 0.82);
};

const dedupeByImage = (images) => {
  const seen = new Set();
  return images.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
};

const readJsonStorage = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
};

const writeJsonStorage = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore quota failures; feature still works without persistence.
  }
};

const buildClusterKey = (images, facesFound) => {
  const keySeed = images
    .map((image) => image.id)
    .sort()
    .slice(0, 12)
    .join('|');
  return `${keySeed}::${facesFound}`;
};

const clusterFaces = (faceRecords) => {
  const workingClusters = [];

  faceRecords.forEach((record) => {
    const faceDescriptor = record.descriptor;
    let bestCluster = null;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (let clusterIndex = 0; clusterIndex < workingClusters.length; clusterIndex += 1) {
      const cluster = workingClusters[clusterIndex];
      const currentDistance = descriptorDistance(faceDescriptor, cluster.centroid);
      if (currentDistance < bestDistance) {
        bestDistance = currentDistance;
        bestCluster = cluster;
      }
    }

    if (!bestCluster || bestDistance > FACE_MATCH_THRESHOLD) {
      workingClusters.push({
        id: `face-${workingClusters.length + 1}`,
        centroid: faceDescriptor,
        descriptors: [faceDescriptor],
        facesFound: 1,
        coverFace: record.previewUrl,
        images: [record.image],
      });
      return;
    }

    bestCluster.descriptors.push(faceDescriptor);
    bestCluster.centroid = averageDescriptors(bestCluster.descriptors);
    bestCluster.facesFound += 1;
    bestCluster.images.push(record.image);
  });

  return workingClusters
    .map((cluster) => {
      const images = dedupeByImage(cluster.images);
      return {
        id: cluster.id,
        clusterKey: buildClusterKey(images, cluster.facesFound),
        coverFace: cluster.coverFace,
        facesFound: cluster.facesFound,
        images,
      };
    })
    .filter((cluster) => cluster.images.length > 0)
    .sort((first, second) => second.images.length - first.images.length);
};

export default function Faces() {
  const [clusters, setClusters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [rescanToken, setRescanToken] = useState(0);
  const [statusText, setStatusText] = useState('Loading image registry...');
  const [progress, setProgress] = useState({ processed: 0, total: 0 });
  const [scanMeta, setScanMeta] = useState({ cached: 0, rescanned: 0 });
  const [personNames, setPersonNames] = useState(() => readJsonStorage(FACE_NAMES_KEY, {}));
  const [selectedCluster, setSelectedCluster] = useState(null);
  const [selectedImage, setSelectedImage] = useState(null);
  const [nameDraft, setNameDraft] = useState('');

  const runFaceScan = useCallback(async (forceRescan = false) => {
    let cancelled = false;

    const stopIfCancelled = () => cancelled;

    const task = async () => {
      setLoading(true);
      setSelectedCluster(null);
      setStatusText('Loading AI face models...');

      try {
        const faceapi = await import('face-api.js');

        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
          faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
          faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
        ]);

        if (stopIfCancelled()) return;

        setStatusText('Fetching all uploaded images...');
        const response = await getImages();
        const allImages = (response.data.images || []).slice(0, MAX_IMAGES_TO_SCAN).map((item) => ({
          id: item._id,
          imageUrl: resolveImageUrl(item.imageUrl),
          thumbUrl: resolveImageUrl(item.thumbnailUrl || item.imageUrl),
          title: item.title || 'Untitled image',
          category: item.category || 'general',
          uploadedAt: item.uploadedAt || '',
        }));

        if (stopIfCancelled()) return;

        const cache = readJsonStorage(FACE_CACHE_KEY, { version: 1, byImageId: {} });
        const byImageId = cache.byImageId || {};
        const nextCacheByImage = {};
        const faceRecords = [];
        let cachedCount = 0;
        let rescannedCount = 0;

        setProgress({ processed: 0, total: allImages.length });
        setStatusText('Detecting faces and grouping similar people...');

        for (let imageIndex = 0; imageIndex < allImages.length; imageIndex += 1) {
          if (stopIfCancelled()) return;

          const sourceImage = allImages[imageIndex];
          const fingerprint = `${sourceImage.imageUrl}|${sourceImage.uploadedAt}`;
          const cached = byImageId[sourceImage.id];

          if (!forceRescan && cached?.fingerprint === fingerprint && Array.isArray(cached?.detections)) {
            cached.detections.forEach((detectedFace) => {
              faceRecords.push({
                descriptor: detectedFace.descriptor,
                previewUrl: detectedFace.previewUrl,
                image: sourceImage,
              });
            });
            nextCacheByImage[sourceImage.id] = cached;
            cachedCount += 1;
            setProgress({ processed: imageIndex + 1, total: allImages.length });
            continue;
          }

          let detections = [];
          try {
            const imageElement = await faceapi.fetchImage(sourceImage.imageUrl);
            const rawDetections = await faceapi
              .detectAllFaces(imageElement, new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.45 }))
              .withFaceLandmarks()
              .withFaceDescriptors();

            detections = rawDetections.map((detectedFace) => ({
              descriptor: Array.from(detectedFace.descriptor),
              previewUrl: createFacePreview(imageElement, detectedFace.detection.box),
            }));
          } catch {
            detections = [];
          }

          detections.forEach((detectedFace) => {
            faceRecords.push({
              descriptor: detectedFace.descriptor,
              previewUrl: detectedFace.previewUrl,
              image: sourceImage,
            });
          });

          nextCacheByImage[sourceImage.id] = {
            fingerprint,
            detections,
          };
          rescannedCount += 1;
          setProgress({ processed: imageIndex + 1, total: allImages.length });
        }

        if (stopIfCancelled()) return;

        writeJsonStorage(FACE_CACHE_KEY, {
          version: 1,
          byImageId: nextCacheByImage,
          updatedAt: new Date().toISOString(),
        });

        const normalizedClusters = clusterFaces(faceRecords);

        setScanMeta({ cached: cachedCount, rescanned: rescannedCount });
        setClusters(normalizedClusters);

        if (!normalizedClusters.length) {
          setStatusText('No detectable faces were found in the current image library.');
        } else {
          setStatusText('Scan complete. Click a person to view all matching images.');
        }
      } catch {
        setStatusText('Face scan failed. Please check image access and model loading.');
      } finally {
        if (!stopIfCancelled()) {
          setLoading(false);
        }
      }
    };

    task();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cleanup = () => {};
    const start = async () => {
      cleanup = (await runFaceScan(false)) || (() => {});
    };
    start();
    return () => cleanup();
  }, [runFaceScan, rescanToken]);

  useEffect(() => {
    writeJsonStorage(FACE_NAMES_KEY, personNames);
  }, [personNames]);

  const decoratedClusters = useMemo(() => {
    return clusters.map((cluster, index) => ({
      ...cluster,
      displayName: personNames[cluster.clusterKey] || `Person ${index + 1}`,
    }));
  }, [clusters, personNames]);

  const progressLabel = useMemo(() => {
    if (!progress.total) return 'Preparing...';
    return `${progress.processed}/${progress.total} images scanned`;
  }, [progress]);

  const applyPersonName = () => {
    if (!selectedCluster) return;
    const cleaned = nameDraft.trim();
    setPersonNames((previous) => ({
      ...previous,
      [selectedCluster.clusterKey]: cleaned || selectedCluster.displayName,
    }));
  };

  const startRescan = async () => {
    setLoading(true);
    setStatusText('Running full rescan...');
    await runFaceScan(true);
  };

  return (
    <div className="page-wrap">
      <div className="page-hero">
        <h1 className="page-hero-title t-gradient">Face <span className="t-gradient-color">Clusters.</span></h1>
        <p className="page-hero-sub">People detected from every uploaded image, grouped by similarity.</p>
      </div>

      <div className="contain">
        <div className="faces-status tech-card">
          <div className="faces-status-main">
            <ScanFace size={18} />
            <span>{statusText}</span>
          </div>
          <div className="faces-status-actions">
            <div className="faces-status-meta">
              {loading
                ? progressLabel
                : `${decoratedClusters.length} groups | ${scanMeta.cached} cached | ${scanMeta.rescanned} scanned`}
            </div>
            <button className="btn btn-ghost faces-rescan" onClick={() => setRescanToken((value) => value + 1)} disabled={loading}>
              <RefreshCcw size={14} className={loading ? 'spin' : ''} /> Refresh
            </button>
            <button className="btn btn-secondary faces-rescan" onClick={startRescan} disabled={loading}>
              <RefreshCcw size={14} className={loading ? 'spin' : ''} /> Full Rescan
            </button>
          </div>
        </div>

        {loading ? (
          <div className="faces-grid">
            {Array.from({ length: 8 }).map((_, index) => (
              <div key={index} className="tech-card skel" style={{ height: 230 }} />
            ))}
          </div>
        ) : decoratedClusters.length === 0 ? (
          <div className="empty-state">
            <UserRound size={40} className="empty-state-icon" />
            <h3>No faces grouped yet</h3>
            <p>Try uploading clearer front-facing portraits to improve recognition.</p>
          </div>
        ) : (
          <motion.div className="faces-grid" layout>
            {decoratedClusters.map((cluster) => (
              <motion.button
                key={cluster.id}
                className="tech-card face-card"
                onClick={() => {
                  setSelectedCluster(cluster);
                  setNameDraft(cluster.displayName);
                }}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                whileHover={{ y: -4 }}
                type="button"
              >
                <img src={cluster.coverFace} alt="Detected face" className="face-cover" loading="lazy" />
                <div className="face-card-body">
                  <div className="face-card-title">{cluster.displayName}</div>
                  <div className="face-card-meta">
                    <span className="badge">{cluster.images.length} photos</span>
                    <span className="badge">{cluster.facesFound} faces</span>
                  </div>
                </div>
              </motion.button>
            ))}
          </motion.div>
        )}
      </div>

      <AnimatePresence>
        {selectedCluster ? (
          <div className="modal-overlay" onClick={() => setSelectedCluster(null)}>
            <motion.div
              className="faces-modal"
              onClick={(event) => event.stopPropagation()}
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
            >
              <div className="faces-modal-header">
                <div>
                  <h3>{selectedCluster.displayName}</h3>
                  <p>{selectedCluster.images.length} images with this person</p>
                </div>
                <button className="btn-icon btn-ghost" onClick={() => setSelectedCluster(null)}>
                  <X size={18} />
                </button>
              </div>

              <div className="faces-name-edit">
                <PencilLine size={14} />
                <input
                  className="input-tech"
                  value={nameDraft}
                  onChange={(event) => setNameDraft(event.target.value)}
                  placeholder="Name this person"
                />
                <button className="btn btn-primary" onClick={applyPersonName}>Save Name</button>
              </div>

              <div className="faces-modal-grid">
                {selectedCluster.images.map((image) => (
                  <button key={image.id} className="faces-image-card" onClick={() => setSelectedImage(image)} type="button">
                    <img src={image.thumbUrl} alt={image.title} loading="lazy" />
                    <div className="faces-image-meta">
                      <ImageIcon size={14} />
                      <span>{image.category}</span>
                    </div>
                  </button>
                ))}
              </div>
            </motion.div>
          </div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {selectedImage ? (
          <div className="modal-overlay" onClick={() => setSelectedImage(null)}>
            <motion.div
              className="faces-preview"
              onClick={(event) => event.stopPropagation()}
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
            >
              <div className="faces-preview-stage">
                <div className="faces-preview-controls">
                  <a
                    className="btn-icon faces-preview-btn"
                    href={selectedImage.imageUrl}
                    download
                    target="_blank"
                    rel="noreferrer"
                    aria-label="Download image"
                  >
                    <Download size={18} />
                  </a>
                  <button className="btn-icon faces-preview-btn" onClick={() => setSelectedImage(null)} aria-label="Close preview">
                    <X size={18} />
                  </button>
                </div>
                <img src={selectedImage.imageUrl} alt={selectedImage.title} className="faces-preview-image" />
              </div>
            </motion.div>
          </div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
