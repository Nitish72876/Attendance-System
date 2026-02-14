import { useEffect, useState } from "react";
import {
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { TrendingUp, TrendingDown, Download } from "lucide-react";
import { supabase } from "../Config/supabaseClient";

const COLORS = ["#00ffff", "#ff00ff", "#00ff00", "#ffff00"];

export default function Reports() {
  const [dailyData, setDailyData] = useState([]);
  const [stats, setStats] = useState({
    average: 0,
    arrived: 0,
    absent: 0,
  });
  const [departmentData, setDepartmentData] = useState([]);

  useEffect(() => {
    fetchData();
    const channel = supabase
      .channel("realtime-reports")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "attendance_records" },
        fetchData
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, []);

  //  Get Indian Date
  const getIndianDate = (d = new Date()) => {
    const istOffset = 5.5 * 60 * 60 * 1000;
    const ist = new Date(d.getTime() + istOffset);
    return ist.toISOString().split("T")[0];
  };

  const getIndianLabel = (d = new Date()) => {
    const istOffset = 5.5 * 60 * 60 * 1000;
    const ist = new Date(d.getTime() + istOffset);
    return `${ist.getDate()} ${ist.toLocaleString("en-US", { month: "short" })}`;
  };

  const fetchData = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { data: personnel, error: pErr } = await supabase
      .from("personnel")
      .select("*")
      .eq("user_email", user.email);
    if (pErr) return console.error("Personnel fetch error:", pErr.message);

    const { data: attendance, error: aErr } = await supabase
      .from("attendance_records")
      .select("*")
      .eq("user_email", user.email);
    if (aErr) return console.error("Attendance fetch error:", aErr.message);

    processReportData(personnel || [], attendance || []);
  };

  const processReportData = (personnel, attendance) => {
    const today = getIndianDate();
    const total = personnel.length;

    //  Today’s records
    const todayRecords = attendance.filter((r) => r.date === today);
    const arrived = todayRecords.filter((r) => r.in_time && !r.out_time).length;
    const present = todayRecords.filter((r) => r.in_time && r.out_time).length;
    const attendedIds = todayRecords.map((r) => r.personnel_id);
    const absent = personnel.filter((p) => !attendedIds.includes(p.id)).length;

    const avg = total > 0 ? (present / total) * 100 : 0;
    const arrRate = total > 0 ? (arrived / total) * 100 : 0;
    const absRate = total > 0 ? (absent / total) * 100 : 0;

    setStats({
      average: avg.toFixed(1),
      arrived: arrRate.toFixed(1),
      absent: absRate.toFixed(1),
    });

    //  Department-wise
    const deptCounts = {};
    personnel.forEach((p) => {
      const dept = p.department || "Unknown";
      deptCounts[dept] = (deptCounts[dept] || 0) + 1;
    });
    setDepartmentData(
      Object.entries(deptCounts).map(([name, value]) => ({ name, value }))
    );

    //  Weekly (last 7 days including today)
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = getIndianDate(d);
      const label = getIndianLabel(d);

      const dayRecords = attendance.filter((rec) => rec.date === dateStr);
      const dayPresent = dayRecords.filter((r) => r.in_time).length;
      const rate = total > 0 ? (dayPresent / total) * 100 : 0;

      days.push({
        date: label,
        attendance: rate.toFixed(1),
      });
    }

    setDailyData(days);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-primary">ANALYTICS & REPORTS</h1>
          <p className="text-muted-foreground">Daily attendance insights</p>
        </div>
        <button className="flex items-center gap-2 rounded bg-primary px-4 py-2 font-bold text-black hover:bg-primary/80 transition-colors">
          <Download className="h-4 w-4" />
          EXPORT REPORT
        </button>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-lg border border-primary/30 bg-card p-6">
          <p className="text-sm text-muted-foreground mb-2">Average Attendance</p>
          <p className="text-3xl font-bold text-primary mb-2">{stats.average}%</p>
          <div className="flex items-center gap-1 text-sm text-green-400">
            <TrendingUp className="h-4 w-4" />
            <span>Live</span>
          </div>
        </div>

        <div className="rounded-lg border border-primary/30 bg-card p-6">
          <p className="text-sm text-muted-foreground mb-2">Arrived (Not Checked Out)</p>
          <p className="text-3xl font-bold text-yellow-400 mb-2">{stats.arrived}%</p>
          <div className="flex items-center gap-1 text-sm text-yellow-400">
            <TrendingUp className="h-4 w-4" />
            <span>Currently Checked In</span>
          </div>
        </div>

        <div className="rounded-lg border border-primary/30 bg-card p-6">
          <p className="text-sm text-muted-foreground mb-2">Absent Rate</p>
          <p className="text-3xl font-bold text-red-400 mb-2">{stats.absent}%</p>
          <div className="flex items-center gap-1 text-sm text-green-400">
            <TrendingDown className="h-4 w-4" />
            <span>Real-time</span>
          </div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-primary/30 bg-card p-6">
          <h2 className="mb-4 text-xl font-bold text-primary">DAILY ATTENDANCE TREND</h2>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={dailyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,255,255,0.1)" />
              <XAxis dataKey="date" stroke="rgba(0,255,255,0.5)" />
              <YAxis stroke="rgba(0,255,255,0.5)" />
              <Tooltip
                contentStyle={{
                  backgroundColor: "rgba(0,0,0,0.8)",
                  border: "1px solid rgba(0,255,255,0.3)",
                  borderRadius: "8px",
                }}
              />
              <Line
                type="monotone"
                dataKey="attendance"
                stroke="#00ffff"
                strokeWidth={2}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="rounded-lg border border-primary/30 bg-card p-6">
          <h2 className="mb-4 text-xl font-bold text-primary">DEPARTMENT DISTRIBUTION</h2>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={departmentData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                outerRadius={100}
                fill="#8884d8"
                dataKey="value"
              >
                {departmentData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  backgroundColor: "rgba(0,0,0,0.8)",
                  border: "1px solid rgba(0,255,255,0.3)",
                  borderRadius: "8px",
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
