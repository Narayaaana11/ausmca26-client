import { useCallback, useEffect, useMemo } from 'react';
import { useDropzone } from 'react-dropzone';
import { Camera, UploadCloud } from 'lucide-react';

const MAX_SIZE_BYTES = 10 * 1024 * 1024;

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
  const img = new Image();

  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = reject;
    img.src = dataUrl;
  });

  const maxDimension = 1920;
  const scale = Math.min(1, maxDimension / Math.max(img.width, img.height));
  const width = Math.round(img.width * scale);
  const height = Math.round(img.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, width, height);

  const blob = await new Promise((resolve) => {
    canvas.toBlob(resolve, 'image/webp', 0.82);
  });

  if (!blob || blob.size >= file.size) {
    return file;
  }

  return new File([blob], file.name.replace(/\.[^.]+$/, '.webp'), { type: 'image/webp' });
}

export default function ImageUpload({
  value,
  onChange,
  disabled = false,
  progress = 0,
  error = '',
}) {
  const previewUrl = useMemo(() => {
    if (!value) return '';
    return URL.createObjectURL(value);
  }, [value]);

  const onDrop = useCallback(async (acceptedFiles, rejectedFiles) => {
    if (rejectedFiles?.length) {
      onChange(null, 'Only JPG, PNG or WEBP under 10MB are allowed.');
      return;
    }

    const firstFile = acceptedFiles?.[0];
    if (!firstFile) return;

    if (firstFile.size > MAX_SIZE_BYTES) {
      onChange(null, 'File exceeds 10MB limit.');
      return;
    }

    try {
      const optimized = await compressImage(firstFile);
      onChange(optimized, '');
    } catch {
      onChange(firstFile, '');
    }
  }, [onChange]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: false,
    maxFiles: 1,
    disabled,
    maxSize: MAX_SIZE_BYTES,
    accept: {
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/png': ['.png'],
      'image/webp': ['.webp'],
    },
  });

  const statusText = useMemo(() => {
    if (!value) return 'Drop an image here or click to browse';
    return `${value.name} (${Math.round(value.size / 1024)} KB)`;
  }, [value]);

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  return (
    <div className="iu-wrap">
      <div
        {...getRootProps()}
        className={`drop-area ${isDragActive ? 'drag-active' : ''} ${disabled ? 'disabled' : ''}`}
      >
        <input {...getInputProps()} />
        {previewUrl ? (
          <img src={previewUrl} alt="Preview" className="drop-preview" />
        ) : (
          <div className="drop-text">
            <Camera size={24} />
            <span>{isDragActive ? 'Release to upload' : 'Drop file here or click'}</span>
            <span className="drop-sub">JPG, PNG, WEBP | Max 10MB</span>
          </div>
        )}
      </div>

      <div className="iu-status">
        <UploadCloud size={14} />
        <span>{statusText}</span>
      </div>

      {!!progress && progress < 100 && (
        <div className="iu-progress">
          <div className="iu-progress-bar" style={{ width: `${progress}%` }} />
        </div>
      )}

      {error ? <div className="iu-error">{error}</div> : null}
    </div>
  );
}
