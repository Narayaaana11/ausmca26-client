import { useCallback, useEffect, useMemo, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { UploadCloud, X, Files } from 'lucide-react';

const MAX_SIZE_BYTES = 10 * 1024 * 1024;
const MAX_FILES = 24;

function fileKey(file) {
  return `${file.name}-${file.size}-${file.lastModified}`;
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function compressImage(file) {
  const dataUrl = await fileToDataUrl(file);
  const image = new Image();

  await new Promise((resolve, reject) => {
    image.onload = resolve;
    image.onerror = reject;
    image.src = dataUrl;
  });

  const maxDimension = 1920;
  const scale = Math.min(1, maxDimension / Math.max(image.width, image.height));
  const width = Math.round(image.width * scale);
  const height = Math.round(image.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext('2d');
  context.drawImage(image, 0, 0, width, height);

  const blob = await new Promise((resolve) => {
    canvas.toBlob(resolve, 'image/webp', 0.82);
  });

  if (!blob || blob.size >= file.size) {
    return file;
  }

  return new File([blob], file.name.replace(/\.[^.]+$/, '.webp'), { type: 'image/webp' });
}

export default function BulkImageUpload({ files, onChange, disabled = false, error = '' }) {
  const [previews, setPreviews] = useState([]);

  useEffect(() => {
    const nextPreviews = files.map((file) => ({
      file,
      previewUrl: URL.createObjectURL(file),
    }));

    setPreviews(nextPreviews);

    return () => {
      nextPreviews.forEach(({ previewUrl }) => URL.revokeObjectURL(previewUrl));
    };
  }, [files]);

  const addFiles = useCallback(async (acceptedFiles, rejectedFiles) => {
    const remainingSlots = MAX_FILES - files.length;
    if (remainingSlots <= 0) {
      onChange(files, `You can upload up to ${MAX_FILES} photos at a time.`);
      return;
    }

    const hasRejected = Boolean(rejectedFiles?.length);
    const batch = acceptedFiles.slice(0, remainingSlots);
    const wasTrimmed = acceptedFiles.length > remainingSlots;

    if (!batch.length) {
      if (hasRejected || wasTrimmed) {
        onChange(files, `Only JPG, PNG or WEBP under 10MB are allowed (max ${MAX_FILES} photos).`);
      }
      return;
    }

    const existing = new Set(files.map((file) => fileKey(file)));
    const uniqueBatch = batch.filter((file) => {
      const key = fileKey(file);
      if (existing.has(key)) return false;
      existing.add(key);
      return true;
    });

    const hasSkipped = hasRejected || wasTrimmed || uniqueBatch.length < batch.length;
    const skipMessage = hasSkipped ? `Some files were skipped. Limit: ${MAX_FILES}, JPG/PNG/WEBP, 10MB each.` : '';

    try {
      const optimized = await Promise.all(
        uniqueBatch.map(async (file) => {
          if (file.size > MAX_SIZE_BYTES) {
            return null;
          }
          try {
            return await compressImage(file);
          } catch {
            return file;
          }
        }),
      );

      onChange([...files, ...optimized.filter(Boolean)], skipMessage);
    } catch {
      onChange([...files, ...uniqueBatch], skipMessage);
    }
  }, [files, onChange]);

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop: addFiles,
    multiple: true,
    maxFiles: MAX_FILES,
    disabled,
    noClick: true,
    noKeyboard: true,
    maxSize: MAX_SIZE_BYTES,
    accept: {
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/png': ['.png'],
      'image/webp': ['.webp'],
    },
  });

  const statusText = useMemo(() => {
    if (!files.length) return 'Drop photos here or browse your library';
    const totalSize = files.reduce((sum, file) => sum + file.size, 0);
    return `${files.length} photos selected · ${formatBytes(totalSize)} total`;
  }, [files]);

  return (
    <div className="bulk-upload-wrap">
      <div
        {...getRootProps()}
        className={`drop-area bulk-drop-area ${isDragActive ? 'drag-active' : ''} ${disabled ? 'disabled' : ''}`}
      >
        <input {...getInputProps()} />
        {files.length === 0 ? (
          <div className="drop-text">
            <Files size={24} />
            <span>{isDragActive ? 'Release to add photos' : 'Drop multiple photos or click browse'}</span>
            <span className="drop-sub">Up to 24 photos, JPG/PNG/WEBP, 10MB each</span>
          </div>
        ) : (
          <div className="bulk-preview-grid">
            {previews.map(({ file, previewUrl }, index) => (
              <div key={`${file.name}-${index}`} className="bulk-preview-card">
                <img src={previewUrl} alt={file.name} className="bulk-preview-image" />
                <div className="bulk-preview-meta">
                  <span>{file.name}</span>
                  <span>{Math.round(file.size / 1024)} KB</span>
                </div>
                <button
                  className="bulk-preview-remove"
                  type="button"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    onChange(files.filter((_, fileIndex) => fileIndex !== index), '');
                  }}
                  aria-label={`Remove ${file.name}`}
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="iu-status bulk-status">
        <UploadCloud size={14} />
        <span>{statusText}</span>
      </div>

      <div className="bulk-actions">
        <button className="btn btn-secondary" type="button" onClick={open} disabled={disabled}>
          Add more photos
        </button>
        <button className="btn btn-ghost" type="button" onClick={() => onChange([], '')} disabled={disabled || !files.length}>
          Clear all
        </button>
      </div>

      {error ? <div className="iu-error">{error}</div> : null}
    </div>
  );
}