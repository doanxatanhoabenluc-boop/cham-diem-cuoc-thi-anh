import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import PublicResults from './PublicResults.jsx';
import './style.css';

const isPublicResults = window.location.pathname.replace(/\/+$/, '') === '/ket-qua';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>{isPublicResults ? <PublicResults /> : <App />}</React.StrictMode>
);
