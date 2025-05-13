import { BrowserRouter } from 'react-router-dom';
import App from './App';

export function RouterWrapper() {
  return (
    <BrowserRouter>
      <App />
    </BrowserRouter>
  );
}