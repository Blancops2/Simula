import { Navigate, Route, Routes } from 'react-router-dom';
import { AdminDashboard } from '../pages/AdminDashboard';
import { HistorialPage } from '../pages/HistorialPage';
import { LoginPage } from '../pages/LoginPage';
import { PlantillaEditorPage } from '../pages/PlantillaEditorPage';
import { PensumPage } from '../pages/PensumPage';
import { PlantillasPage } from '../pages/PlantillasPage';
import { SeleccionClasesPage } from '../pages/SeleccionClasesPage';
import { StudentDashboard } from '../pages/StudentDashboard';
import { ProtectedRoute } from './ProtectedRoute';

export function AppRouter() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route element={<ProtectedRoute allowedRoles={['ESTUDIANTE']} />}>
        <Route path="/estudiante" element={<StudentDashboard />} />
        <Route path="/estudiante/historial" element={<HistorialPage />} />
        <Route path="/estudiante/malla" element={<SeleccionClasesPage />} />
        <Route path="/estudiante/pensum" element={<PensumPage />} />
      </Route>

      <Route element={<ProtectedRoute allowedRoles={['ADMINISTRADOR']} />}>
        <Route path="/admin" element={<AdminDashboard />} />
        <Route path="/admin/plantillas" element={<PlantillasPage />} />
        <Route path="/admin/plantillas/:id" element={<PlantillaEditorPage />} />
      </Route>

      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
