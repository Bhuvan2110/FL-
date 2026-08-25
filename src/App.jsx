import { Routes, Route } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { ProtectedRoute, AdminRoute } from './components/ProtectedRoute'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Datasets from './pages/Datasets'
import Train from './pages/Train'
import Compare from './pages/Compare'
import Predict from './pages/Predict'
import Runs from './pages/Runs'
import Monitor from './pages/Monitor'
import SystemHealth from './pages/SystemHealth'
import { Audit, Users } from './pages/Admin'

function Shell({ children }) {
  return <ProtectedRoute><Layout>{children}</Layout></ProtectedRoute>
}
function AdminShell({ children }) {
  return <Shell><AdminRoute>{children}</AdminRoute></Shell>
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login"         element={<Login />} />
        <Route path="/auth/callback" element={<Login />} />
        <Route path="/"              element={<Shell><Dashboard /></Shell>} />
        <Route path="/datasets"      element={<Shell><Datasets /></Shell>} />
        <Route path="/train"         element={<Shell><Train /></Shell>} />
        <Route path="/compare"       element={<Shell><Compare /></Shell>} />
        <Route path="/predict"       element={<Shell><Predict /></Shell>} />
        <Route path="/runs"          element={<Shell><Runs /></Shell>} />
        <Route path="/monitor"       element={<Shell><Monitor /></Shell>} />
        <Route path="/health"        element={<Shell><SystemHealth /></Shell>} />
        <Route path="/audit"         element={<AdminShell><Audit /></AdminShell>} />
        <Route path="/users"         element={<AdminShell><Users /></AdminShell>} />
        <Route path="*"              element={<Shell><Dashboard /></Shell>} />
      </Routes>
    </AuthProvider>
  )
}
