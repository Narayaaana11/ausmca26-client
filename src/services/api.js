import axios from 'axios';

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';
export const API_ORIGIN = /^https?:\/\//i.test(API_BASE_URL)
  ? API_BASE_URL.replace(/\/api\/?$/, '')
  : '';

export const resolveImageUrl = (value) => {
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith('/')) return `${API_ORIGIN}${value}`;
  return `${API_ORIGIN}/${value}`;
};

const API = axios.create({
  baseURL: API_BASE_URL,
});

const ensureClientId = () => {
  const key = 'bm_client_id';
  const existing = localStorage.getItem(key);

  if (existing) return existing;

  const generated = `client_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  localStorage.setItem(key, generated);
  return generated;
};

API.interceptors.request.use((config) => {
  config.headers = config.headers || {};
  config.headers['x-client-id'] = ensureClientId();
  return config;
});

export const getAllMembers = () => API.get('/members');
export const createMember = (formData, config = {}) => API.post('/members', formData, {
  headers: { 'Content-Type': 'multipart/form-data' },
  ...config,
});

// Memories
export const getMemories = (params) => API.get('/memories', { params });
export const createMemory = (formData, config = {}) => API.post('/memories', formData, {
  headers: { 'Content-Type': 'multipart/form-data' },
  ...config,
});
export const createMemoriesBulk = (formData, config = {}) => API.post('/memories/bulk', formData, {
  headers: { 'Content-Type': 'multipart/form-data' },
  ...config,
});
export const likeMemory = (id) => API.put(`/memories/${id}/like`);
export const addMemoryComment = (id, text) => API.post(`/memories/${id}/comment`, { text });
export const deleteMemory = (id) => API.delete(`/memories/${id}`);

// Events
export const getEvents = () => API.get('/events');
export const createEvent = (formData, config = {}) => API.post('/events', formData, {
  headers: { 'Content-Type': 'multipart/form-data' },
  ...config,
});
export const deleteEvent = (id) => API.delete(`/events/${id}`);

// Posts (Memory Wall)
export const getPosts = () => API.get('/posts');
export const createPost = (formData, config = {}) => API.post('/posts', formData, {
  headers: { 'Content-Type': 'multipart/form-data' },
  ...config,
});
export const likePost = (id) => API.put(`/posts/${id}/like`);
export const addPostComment = (id, text) => API.post(`/posts/${id}/comment`, { text });
export const deletePost = (id) => API.delete(`/posts/${id}`);

// Images
export const uploadImage = (formData, config = {}) => API.post('/images', formData, {
  headers: { 'Content-Type': 'multipart/form-data' },
  ...config,
});
export const getImages = (params) => API.get('/images', { params });
export const deleteImage = (id) => API.delete(`/images/${id}`);
export const upsertImageFaces = (id, faces) => API.post(`/images/${id}/faces`, { faces });
export const getFacePeople = (params) => API.get('/images/faces/people', { params });
export const updateFacePerson = (personId, payload) => API.put(`/images/faces/people/${personId}`, payload);
export const mergeFacePeople = (sourcePersonId, targetPersonId) => API.post('/images/faces/people/merge', { sourcePersonId, targetPersonId });
export const hideFacePerson = (personId) => API.delete(`/images/faces/people/${personId}`);
export const globalSearch = (params) => API.get('/search', { params });
export const getLiveStats = () => API.get('/live-stats');

export default API;
