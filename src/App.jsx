// src/App.jsx
import { Routes, Route } from "react-router-dom"
import Layout from "./components/Layout"
import Dashboard from "./pages/Dashboard"
import FaceRecognition from "./pages/FaceRecognition"
import AttendanceRecords from "./pages/AttendanceRecords"
import Personnel from "./pages/Personnel"
import Reports from "./pages/Reports"
import Login from "./pages/Login"
import Signup from "./pages/Signup"
import ProtectedRoute from "./components/ProtectedRoute"
import AddPersonnel from "./pages/AddPersonnel"

function App() {
  return (
    <Routes>
      {/* Public Routes */}
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />

      {/* Protected Routes */}
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="face-recognition" element={<FaceRecognition />} />
        <Route path="records" element={<AttendanceRecords />} />
        <Route path="personnel" element={<Personnel />} />
        <Route path="personnel/add" element={<AddPersonnel />} />
        <Route path="reports" element={<Reports />} />
      </Route>

      {/* Catch-all route (if user navigates to unknown URL) */}
      <Route path="*" element={<Login />} />
    </Routes>
  )
}

export default App
