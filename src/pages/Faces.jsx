import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ScanFace, UserRound, X, Image as ImageIcon, RefreshCcw, PencilLine, UserX, GitMerge, ImageUp } from 'lucide-react';
import Lightbox from 'yet-another-react-lightbox';
import DownloadPlugin from 'yet-another-react-lightbox/plugins/download';
import Zoom from 'yet-another-react-lightbox/plugins/zoom';
import toast from 'react-hot-toast';
import { getFacePeople, getImages, hideFacePerson, mergeFacePeople, resolveImageUrl, updateFacePerson, upsertImageFaces } from '../services/api';
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

const mapPeopleToClusters = (people = []) => {
  return people.map((person, index) => {
    const normalizedImages = (person.images || []).map((image) => ({
      id: image.id,
      imageUrl: resolveImageUrl(image.imageUrl),
      thumbUrl: resolveImageUrl(image.thumbUrl || image.imageUrl),
      title: image.title || `Image ${index + 1}`,
      category: image.category || 'general',
      uploadedAt: image.uploadedAt || '',
    }));
    const coverImage = normalizedImages.find((image) => image.id === person.coverImageId);

    return {
      id: person.personId,
      personId: person.personId,
      clusterKey: person.personId,
      displayName: person.displayName || `Person ${index + 1}`,
      coverFace: resolveImageUrl(coverImage?.thumbUrl || normalizedImages[0]?.thumbUrl || normalizedImages[0]?.imageUrl || ''),
      coverImageId: person.coverImageId || normalizedImages[0]?.id || '',
      facesFound: Number(person.faceCount || normalizedImages.length),
      images: normalizedImages,
    };
  });
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
  const [selectedImageIndex, setSelectedImageIndex] = useState(-1);
  const [nameDraft, setNameDraft] = useState('');
  const [mergeTargetId, setMergeTargetId] = useState('');
  const [actionBusy, setActionBusy] = useState(false);

  const refreshCloudPeople = useCallback(async () => {
    const peopleRes = await getFacePeople();
    const backendClusters = mapPeopleToClusters(peopleRes.data.people || []);
    setClusters(backendClusters);
    return backendClusters;
  }, []);

  const runFaceScan = useCallback(async (forceRescan = false) => {
    let cancelled = false;

    const stopIfCancelled = () => cancelled;

    const task = async () => {
      setLoading(true);
      setSelectedCluster(null);
      setStatusText('Loading AI face models...');

      try {
        if (!forceRescan) {
          const backendClusters = await refreshCloudPeople();
          if (backendClusters.length) {
            setClusters(backendClusters);
            setScanMeta({ cached: 0, rescanned: 0 });
            setStatusText('Loaded people from cloud face index.');
            setLoading(false);
            return;
          }
        }

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
              box: {
                x: detectedFace.detection.box.x,
                y: detectedFace.detection.box.y,
                width: detectedFace.detection.box.width,
                height: detectedFace.detection.box.height,
              },
              confidence: detectedFace.detection.score,
              previewUrl: createFacePreview(imageElement, detectedFace.detection.box),
            }));

            if (detections.length) {
              upsertImageFaces(sourceImage.id, detections).catch(() => {});
            }
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

        try {
          const backendClusters = await refreshCloudPeople();
          if (backendClusters.length) {
            setClusters(backendClusters);
          } else {
            setClusters(normalizedClusters);
          }
        } catch {
          setClusters(normalizedClusters);
        }

        setScanMeta({ cached: cachedCount, rescanned: rescannedCount });

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
  }, [refreshCloudPeople]);

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
      displayName: personNames[cluster.clusterKey] || cluster.displayName || `Person ${index + 1}`,
    }));
  }, [clusters, personNames]);

  const progressLabel = useMemo(() => {
    if (!progress.total) return 'Preparing...';
    return `${progress.processed}/${progress.total} images scanned`;
  }, [progress]);

  const applyPersonName = async () => {
    if (!selectedCluster) return;
    const cleaned = nameDraft.trim();

    if (selectedCluster.personId) {
      try {
        await updateFacePerson(selectedCluster.personId, { displayName: cleaned || selectedCluster.displayName });
        await refreshCloudPeople();
        toast.success('Person name updated');
      } catch {
        // Keep local fallback name state if backend update fails.
        toast.error('Cloud update failed. Kept local name only.');
      }
    }

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

  const executePersonAction = async (action) => {
    if (!selectedCluster?.personId) {
      toast.error('This action is only available for cloud-indexed people.');
      return;
    }

    setActionBusy(true);
    try {
      await action();
      const fresh = await refreshCloudPeople();
      const next = fresh.find((cluster) => cluster.personId === selectedCluster.personId) || null;
      setSelectedCluster(next);
    } catch {
      toast.error('Action failed. Please try again.');
    } finally {
      setActionBusy(false);
    }
  };

  const handleMerge = async () => {
    if (!mergeTargetId) {
      toast.error('Select a target person first.');
      return;
    }

    await executePersonAction(async () => {
      await mergeFacePeople(selectedCluster.personId, mergeTargetId);
      toast.success('People merged successfully.');
      setSelectedCluster(null);
    });
  };

  const handleHide = async () => {
    await executePersonAction(async () => {
      await hideFacePerson(selectedCluster.personId);
      toast.success('Person hidden from Faces.');
      setSelectedCluster(null);
    });
  };

  const handleSetCover = async (imageId) => {
    await executePersonAction(async () => {
      await updateFacePerson(selectedCluster.personId, { coverImageId: imageId });
      toast.success('Cover photo updated.');
    });
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
            <button className="btn btn-ghost faces-rescan" onClick={() => setRescanToken((value) => value + 1)} disabled={loading} aria-label="Refresh people list">
              <RefreshCcw size={14} className={loading ? 'spin' : ''} /> Refresh
            </button>
            <button className="btn btn-secondary faces-rescan" onClick={startRescan} disabled={loading} aria-label="Run full face rescan">
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
                  setMergeTargetId('');
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
                <button className="btn-icon btn-ghost" onClick={() => setSelectedCluster(null)} aria-label="Close person details">
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
                  aria-label="Person name"
                />
                <button className="btn btn-primary" onClick={applyPersonName} aria-label="Save person name" disabled={actionBusy}>Save Name</button>
              </div>

              <div className="faces-person-actions" aria-label="Person actions">
                <select
                  className="input-tech"
                  value={mergeTargetId}
                  onChange={(event) => setMergeTargetId(event.target.value)}
                  aria-label="Merge this person into"
                  disabled={actionBusy}
                >
                  <option value="">Merge into...</option>
                  {decoratedClusters
                    .filter((item) => item.personId && item.personId !== selectedCluster.personId)
                    .map((item) => (
                      <option key={item.personId} value={item.personId}>{item.displayName}</option>
                    ))}
                </select>
                <button className="btn btn-ghost" onClick={handleMerge} type="button" disabled={actionBusy || !mergeTargetId} aria-label="Merge person">
                  <GitMerge size={14} /> Merge
                </button>
                <button className="btn btn-ghost" onClick={handleHide} type="button" disabled={actionBusy} aria-label="Hide person">
                  <UserX size={14} /> Hide
                </button>
              </div>

              <div className="faces-modal-grid">
                {selectedCluster.images.map((image, index) => (
                  <div key={image.id} className="faces-image-card-wrap">
                    <button className="faces-image-card" onClick={() => setSelectedImageIndex(index)} type="button" aria-label={`Open ${image.title}`}>
                      <img src={image.thumbUrl} alt={image.title} loading="lazy" />
                      <div className="faces-image-meta">
                        <ImageIcon size={14} />
                        <span>{image.category}</span>
                      </div>
                    </button>
                    {selectedCluster.personId ? (
                      <button
                        className={`btn btn-ghost faces-cover-btn ${selectedCluster.coverImageId === image.id ? 'active' : ''}`}
                        onClick={() => handleSetCover(image.id)}
                        type="button"
                        disabled={actionBusy}
                        aria-label={`Set ${image.title} as cover image`}
                      >
                        <ImageUp size={14} /> {selectedCluster.coverImageId === image.id ? 'Cover' : 'Set Cover'}
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
            </motion.div>
          </div>
        ) : null}
      </AnimatePresence>

      <Lightbox
        open={selectedImageIndex >= 0}
        index={selectedImageIndex}
        close={() => setSelectedImageIndex(-1)}
        slides={(selectedCluster?.images || []).map((image) => ({
          src: image.imageUrl,
          alt: image.title || 'Matched image',
          download: image.imageUrl,
        }))}
        plugins={[DownloadPlugin, Zoom]}
        carousel={{ finite: (selectedCluster?.images || []).length <= 1 }}
        controller={{ closeOnBackdropClick: true }}
      />
    </div>
  );
}
