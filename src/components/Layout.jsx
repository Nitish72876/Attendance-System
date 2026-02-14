"use client"

import { Outlet, Link, useLocation, useNavigate } from "react-router-dom"
import { Camera, Users, FileText, BarChart3, Home, Menu, LogOut } from "lucide-react"
import { useState } from "react"
import { supabase } from "../Config/supabaseClient" // make sure path is correct

export default function Layout() {
  const location = useLocation()
  const navigate = useNavigate()
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [loggingOut, setLoggingOut] = useState(false)

  const navigation = [
    { name: "Dashboard", href: "/", icon: Home },
    { name: "Face Recognition", href: "/face-recognition", icon: Camera },
    { name: "Attendance Records", href: "/records", icon: FileText },
    { name: "Personnel", href: "/personnel", icon: Users },
    { name: "Reports", href: "/reports", icon: BarChart3 },
  ]

  const handleLogout = async () => {
  // Clear any local data if needed
  localStorage.removeItem("isAuthenticated")
  localStorage.removeItem("supabase.auth.token") // optional, clears stale sessions

  // Redirect immediately
  navigate("/login")
}


  return (
    <div className="min-h-screen bg-background cyber-grid">
      {/* Sidebar */}
      <aside
        className={`fixed left-0 top-0 z-40 h-screen transition-transform ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        } w-64 border-r border-primary/30 bg-card/50 backdrop-blur-sm`}
      >
        <div className="flex h-full flex-col">
          {/* Logo */}
          <div className="flex h-16 items-center gap-2 border-b border-primary/30 px-6">
            <div className="h-8 w-8 rounded bg-primary/20 flex items-center justify-center">
              <Camera className="h-5 w-5 text-primary" />
            </div>
            <span className="text-lg font-bold text-primary">ATTENDANCE_SYS</span>
          </div>

          {/* Navigation */}
          <nav className="flex-1 space-y-1 p-4">
            {navigation.map((item) => {
              const isActive = location.pathname === item.href
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  className={`flex items-center gap-3 rounded px-3 py-2 text-sm transition-colors ${
                    isActive
                      ? "bg-primary/20 text-primary glow-cyan"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  <item.icon className="h-5 w-5" />
                  {item.name}
                </Link>
              )
            })}
          </nav>

          {/* Footer Section */}
          <div className="border-t border-primary/30 p-4 space-y-3">
            {/* Admin Info */}
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center">
                <span className="text-sm font-bold text-primary">AD</span>
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">Admin</p>
                <p className="text-xs text-muted-foreground">System Operator</p>
              </div>
            </div>

            {/* Logout Button */}
            <button
              type="button"
              onClick={handleLogout}
              disabled={loggingOut}
              className={`mt-3 w-full flex items-center justify-center gap-2 py-2 rounded-lg ${
                loggingOut
                  ? "bg-primary/30 text-muted-foreground cursor-wait"
                  : "bg-primary/20 text-primary hover:bg-primary hover:text-primary-foreground"
              } transition-all`}
            >
              <LogOut className="h-4 w-4" />
              {loggingOut ? "Signing out..." : "Logout"}
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className={`transition-all ${sidebarOpen ? "ml-64" : "ml-0"}`}>
        <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b border-primary/30 bg-card/50 backdrop-blur-sm px-6">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="text-muted-foreground hover:text-foreground"
          >
            <Menu className="h-6 w-6" />
          </button>
          <div className="flex-1" />
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
            <span className="text-sm text-muted-foreground">SYSTEM ONLINE</span>
          </div>
        </header>

        <main className="p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
