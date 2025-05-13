import React from 'react';
import ReactDOM from 'react-dom/client';
import { RouterWrapper } from './router';
import './index.css';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <RouterWrapper />
  </React.StrictMode>
);