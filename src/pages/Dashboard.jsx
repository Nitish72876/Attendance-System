import { useEffect, useState } from "react";
import { Users, CheckCircle, XCircle, Clock } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { supabase } from "../Config/supabaseClient";

export default function Dashboard() {
  const [stats, setStats] = useState({
    totalPersonnel: 0,
    present: 0,
    absent: 0,
    late: 0,
  });
  const [attendanceData, setAttendanceData] = useState([]);
  const [recentActivity, setRecentActivity] = useState([]);

  useEffect(() => {
    fetchDashboardData();
    const channel = supabase
      .channel("realtime-dashboard")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "attendance_records" },
        fetchDashboardData
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, []);

  // Helper: get today's date string in IST (YYYY-MM-DD)
  const getIndianDate = (d = new Date()) => {
    // IST = UTC + 5:30
    const istOffset = 5.5 * 60 * 60 * 1000;
    const ist = new Date(d.getTime() + istOffset);
    return ist.toISOString().split("T")[0];
  };

  const formatDateTime = (dateTime) => {
    if (!dateTime) return "-";
    try {
      const d = new Date(dateTime);
      if (isNaN(d)) return "-";
      return `${d.toLocaleDateString("en-IN", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })} - ${d.toLocaleTimeString("en-IN", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      })}`;
    } catch {
      return "-";
    }
  };

  const fetchDashboardData = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    // Fetch personnel for this logged-in user
    const { data: personnel, error: personnelError } = await supabase
      .from("personnel")
      .select("*")
      .eq("user_email", user.email);

    if (personnelError) {
      console.error("❌ Error fetching personnel:", personnelError.message);
      return;
    }

    // Fetch attendance_records for this logged-in user
    const { data: attendance, error: attendanceError } = await supabase
      .from("attendance_records")
      .select("*")
      .eq("user_email", user.email)
      .order("in_time", { ascending: false });

    if (attendanceError) {
      console.error("❌ Error fetching attendance:", attendanceError.message);
      return;
    }

    processDashboardData(personnel || [], attendance || []);
  };

  const processDashboardData = (personnel, attendance) => {
    // Today's date in IST
    const today = getIndianDate();

    const totalPersonnel = personnel.length;

    // Today's records based on attendance.date (assumed stored as YYYY-MM-DD)
    const todayRecords = attendance.filter((rec) => rec.date === today);

    // Arrived (checked in but not checked out) and Present (in & out)
    const arrived = todayRecords.filter((r) => r.in_time && !r.out_time).length;
    const present = todayRecords.filter((r) => r.in_time && r.out_time).length;

    // Late arrivals: consider in_time present and compare local time (IST)
    const late = todayRecords.filter((r) => {
      if (!r.in_time) return false;
      // r.in_time is an ISO datetime (server). Convert to Date object and shift to IST for hour/min check.
      const dt = new Date(r.in_time);
      // convert to IST by adding offset
      const ist = new Date(dt.getTime() + 5.5 * 60 * 60 * 1000);
      const hour = ist.getHours();
      const minute = ist.getMinutes();
      // late if after 9:30 (09:30 exclusive)
      return hour > 9 || (hour === 9 && minute > 30);
    }).length;

    // Absent = personnel not appearing in today's attendance
    const attendedIds = todayRecords.map((r) => r.personnel_id);
    const absent = personnel.filter((p) => !attendedIds.includes(p.id)).length;

    // Weekly (rolling 5 days) — oldest → newest (so chart shows: oldest ... today)
    // We explicitly build array oldest -> today so labels appear like "Sat, Sun, Mon, Tue, Wed"
    const last5Days = [];
    for (let offset = 4; offset >= 0; offset--) {
      const base = new Date();
      base.setDate(base.getDate() - offset);
      // use IST date string for matching
      const dateStr = getIndianDate(base);
      // find attendance entries that match dateStr
      const dayRecords = attendance.filter((rec) => rec.date === dateStr);
      const presentCount = dayRecords.filter((r) => r.in_time).length;
      const absentCount = totalPersonnel - presentCount;
      // label as short weekday in IST
      const labelDate = new Date(base.getTime() + 5.5 * 60 * 60 * 1000);
      const weekday = labelDate.toLocaleDateString("en-IN", { weekday: "short" });
      last5Days.push({
        day: weekday,
        present: presentCount,
        absent: absentCount < 0 ? 0 : absentCount,
      });
    }

    // Recent activity: keep last 5 attendance rows (already ordered by in_time desc above)
    const recent = (attendance || [])
      .slice(0, 5)
      .map((r, index) => {
        const person = personnel.find((p) => p.id === r.personnel_id);
        const isLate = (() => {
          if (!r.in_time) return false;
          const dt = new Date(r.in_time);
          const ist = new Date(dt.getTime() + 5.5 * 60 * 60 * 1000);
          const hour = ist.getHours();
          const minute = ist.getMinutes();
          return hour > 9 || (hour === 9 && minute > 30);
        })();
        return {
          id: index + 1,
          name: person?.name || "Unknown",
          image_url: person?.image_url || null,
          action: r.out_time ? "Check Out" : "Check In",
          time: formatDateTime(r.out_time || r.in_time),
          status: isLate ? "late" : "success",
        };
      });

    setStats({
      totalPersonnel,
      present: arrived + present,
      absent,
      late,
    });
    setAttendanceData(last5Days);
    setRecentActivity(recent);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-primary">ATTENDANCE COMMAND CENTER</h1>
        <p className="text-muted-foreground">Real-time attendance monitoring system</p>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total Personnel"
          value={stats.totalPersonnel}
          icon={<Users className="h-8 w-8 text-primary/50" />}
        />
        <StatCard
          label="Present Today"
          value={stats.present}
          color="text-green-400"
          icon={<CheckCircle className="h-8 w-8 text-green-400/50" />}
        />
        <StatCard
          label="Absent Today"
          value={stats.absent}
          color="text-red-400"
          icon={<XCircle className="h-8 w-8 text-red-400/50" />}
        />
        <StatCard
          label="Late Arrivals"
          value={stats.late}
          color="text-yellow-400"
          icon={<Clock className="h-8 w-8 text-yellow-400/50" />}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Weekly Attendance Chart */}
        <div className="rounded-lg border border-primary/30 bg-card p-6">
          <h2 className="mb-4 text-xl font-bold text-primary">WEEKLY ATTENDANCE</h2>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={attendanceData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,255,255,0.1)" />
              <XAxis dataKey="day" stroke="rgba(0,255,255,0.5)" />
              <YAxis stroke="rgba(0,255,255,0.5)" />
              <Tooltip
                contentStyle={{
                  backgroundColor: "rgba(0,0,0,0.8)",
                  border: "1px solid rgba(0,255,255,0.3)",
                  borderRadius: "8px",
                }}
              />
              <Bar dataKey="present" fill="#00ffff" />
              <Bar dataKey="absent" fill="#ff0080" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Recent Activity */}
        <div className="rounded-lg border border-primary/30 bg-card p-6">
          <h2 className="mb-4 text-xl font-bold text-primary">RECENT ACTIVITY</h2>
          <div className="space-y-3">
            {recentActivity.map((activity) => (
              <div
                key={activity.id}
                className="flex items-center justify-between rounded border border-primary/20 bg-muted/20 p-3"
              >
                <div className="flex items-center gap-3">
                  {activity.image_url ? (
                    <img
                      src={activity.image_url}
                      alt={activity.name}
                      className="h-10 w-10 rounded-full object-cover"
                    />
                  ) : (
                    <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center">
                      <span className="text-xs font-bold text-primary">
                        {activity.name
                          .split(" ")
                          .map((n) => n[0])
                          .join("")}
                      </span>
                    </div>
                  )}
                  <div>
                    <p className="font-medium text-foreground">{activity.name}</p>
                    <p className="text-xs text-muted-foreground">{activity.action}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm text-foreground">{activity.time}</p>
                  <p
                    className={`text-xs ${activity.status === "success" ? "text-green-400" : "text-yellow-400"}`}
                  >
                    {activity.status === "success" ? "On Time" : "Late"}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

const StatCard = ({ label, value, color = "text-primary", icon }) => (
  <div className="rounded-lg border border-primary/30 bg-card p-6">
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className={`text-3xl font-bold ${color}`}>{value}</p>
      </div>
      {icon}
    </div>
  </div>
);
