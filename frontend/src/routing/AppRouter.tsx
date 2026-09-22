import { Navigate, Route, Routes } from 'react-router-dom';
import { AdminDashboard } from '../pages/AdminDashboard';
import { EstudiantePlanEstudioPage } from '../pages/EstudiantePlanEstudioPage';
import { HistorialPage } from '../pages/HistorialPage';
import { ImportarHistorialPage } from '../pages/ImportarHistorialPage';
import { LoginPage } from '../pages/LoginPage';
import { PlantillaEditorPage } from '../pages/PlantillaEditorPage';
import { PensumPage } from '../pages/PensumPage';
import { PeriodosPage } from '../pages/PeriodosPage';
import { PlanEstudioPage } from '../pages/PlanEstudioPage';
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
        <Route path="/estudiante/historial/importar" element={<ImportarHistorialPage />} />
        <Route path="/estudiante/malla" element={<SeleccionClasesPage />} />
        <Route path="/estudiante/pensum" element={<PensumPage />} />
        <Route path="/estudiante/plan-estudio" element={<EstudiantePlanEstudioPage />} />
      </Route>

      <Route element={<ProtectedRoute allowedRoles={['ADMINISTRADOR']} />}>
        <Route path="/admin" element={<AdminDashboard />} />
        <Route path="/admin/plantillas" element={<PlantillasPage />} />
        <Route path="/admin/plantillas/:id" element={<PlantillaEditorPage />} />
        <Route path="/admin/periodos" element={<PeriodosPage />} />
        <Route path="/admin/plan-estudio" element={<PlanEstudioPage />} />
      </Route>

      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
