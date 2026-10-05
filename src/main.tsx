import { createRoot } from 'react-dom/client';
import { apiReady } from './api';
import App from './App';
import '@fontsource-variable/inter';
import '@fontsource-variable/noto-sans-jp';
import './styles.css';

apiReady.then(() => {
  createRoot(document.getElementById('root')!).render(<App />);
});
