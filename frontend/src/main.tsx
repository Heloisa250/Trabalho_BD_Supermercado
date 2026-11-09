import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { SessionRoute } from './routes/SessionRoutes';
import './styles/index.css';

const root = document.getElementById('root');
if (!root) throw new Error('Elemento raiz ausente.');

createRoot(root).render(
  <QueryClientProvider client={new QueryClient()}>
    <BrowserRouter>
      <Routes>
        <Route path="/*" element={<SessionRoute />} />
        <Route path="/login" element={<SessionRoute publicLogin />} />
      </Routes>
    </BrowserRouter>
  </QueryClientProvider>,
);
