import { useEffect, useState } from "react";
import { Search, Download, Calendar } from "lucide-react";
import { supabase } from "../Config/supabaseClient";
import jsPDF from "jspdf";
import "jspdf-autotable";

// Helper: today's date in IST (yyyy-mm-dd)
const getTodayIST = () => {
  const now = new Date();
  // Convert to IST string then parse components
  const istStr = now.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
  // istStr example: "05/11/2025, 1:23:45 PM" -> date part is dd/mm/yyyy
  const datePart = istStr.split(",")[0].trim();
  const [dd, mm, yyyy] = datePart.split("/");
  return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
};

export default function AttendanceRecords() {
  const [records, setRecords] = useState([]); // merged records to display
  const [personnel, setPersonnel] = useState([]); // personnel list for current user
  const [userEmail, setUserEmail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedDate, setSelectedDate] = useState("");

  // Get current logged-in user
  useEffect(() => {
    const getUser = async () => {
      const { data, error } = await supabase.auth.getUser();
      if (error) {
        console.error("Error getting user:", error.message);
        return;
      }
      setUserEmail(data?.user?.email || null);
    };
    getUser();
  }, []);

  // Fetch personnel + attendance and build merged view
  useEffect(() => {
    if (!userEmail) return;

    const fetchData = async () => {
      setLoading(true);
      try {
        // 1) fetch personnel for this user
        const { data: ppl, error: pplErr } = await supabase
          .from("personnel")
          .select("*")
          .eq("user_email", userEmail);

        if (pplErr) throw pplErr;
        const personnelList = ppl || [];
        setPersonnel(personnelList);

        // 2) fetch all attendance_records for this user (we will display multiple dates)
        const { data: att, error: attErr } = await supabase
          .from("attendance_records")
          .select("*")
          .eq("user_email", userEmail)
          .order("date", { ascending: false })
          .order("created_at", { ascending: false });

        if (attErr) throw attErr;
        const attendanceList = att || [];

        // 3) compute today's date in IST
        const today = getTodayIST();

        // 4) find personnel who DO NOT have an attendance record for today's date
        const presentTodayIds = new Set(
          attendanceList.filter((a) => a.date === today).map((a) => String(a.personnel_id))
        );

        // 5) create synthesized absent rows (in-memory only) for today's missing personnel
        const synthesizedAbsents = personnelList
          .filter((p) => !presentTodayIds.has(String(p.id)))
          .map((p) => ({
            // create an id that won't collide with real DB ids
            id: `synth-abs-${p.id}-${today}`,
            personnel_id: p.id,
            user_email: userEmail,
            name: p.name,
            department: p.department,
            role: p.role,
            in_time: null,
            out_time: null,
            status: "Absent",
            date: today,
            // mark as synthesized so you can treat differently if needed
            _synthesized: true,
          }));

        // 6) merge real attendance rows with synthesized absents
        //    keep real attendance as-is, then append synthesizedAbsents
        //    then sort by date descending (newest first), and show synthesized absents for today
        const merged = [...attendanceList, ...synthesizedAbsents].sort((a, b) => {
          // sort by date desc, then synthesized marker last for same date maybe? We'll put synthesized along with same date.
          if (a.date === b.date) {
            // prefer real records first (non-synthesized) then synthesized
            if (a._synthesized && !b._synthesized) return 1;
            if (!a._synthesized && b._synthesized) return -1;
            // fallback: by in_time (null last)
            const aTime = a.in_time ? new Date(a.in_time).getTime() : 0;
            const bTime = b.in_time ? new Date(b.in_time).getTime() : 0;
            return bTime - aTime;
          }
          // compare date strings yyyy-mm-dd lexicographically
          return b.date.localeCompare(a.date);
        });

        // 7) ensure each merged item has name/department/role (attendance rows may already have them but ensure fallback)
        const final = merged.map((row) => {
          if (row._synthesized) {
            return row; // already populated
          }
          // if attendance row lacks personnel meta, try to find it in personnelList
          const p = personnelList.find((x) => String(x.id) === String(row.personnel_id));
          return {
            ...row,
            name: row.name || p?.name || "--",
            department: row.department || p?.department || "--",
            role: row.role || p?.role || "--",
          };
        });

        setRecords(final);
      } catch (err) {
        console.error("Error fetching attendance/personnel:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();

    // subscribe to realtime updates for attendance_records and personnel to update UI live
    const channel = supabase
      .channel("realtime-attendance-records")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "attendance_records" },
        () => {
          // re-fetch when attendance changes
          // keep this simple - call fetchData again by triggering effect via userEmail change is not possible,
          // so just call fetchData directly (redefine fetchData as separate function if needed).
          // For simplicity, we trigger a simple re-run by calling fetchData again:
          (async () => {
            try {
              setLoading(true);
              // fetch minimal: attendance + recompute synthesized absents
              const { data: att, error: attErr } = await supabase
                .from("attendance_records")
                .select("*")
                .eq("user_email", userEmail)
                .order("date", { ascending: false })
                .order("created_at", { ascending: false });
              if (attErr) throw attErr;
              const attendanceList = att || [];

              const today = getTodayIST();
              const presentTodayIds = new Set(
                attendanceList.filter((a) => a.date === today).map((a) => String(a.personnel_id))
              );

              const synthesizedAbsents = personnel
                .filter((p) => !presentTodayIds.has(String(p.id)))
                .map((p) => ({
                  id: `synth-abs-${p.id}-${today}`,
                  personnel_id: p.id,
                  user_email: userEmail,
                  name: p.name,
                  department: p.department,
                  role: p.role,
                  in_time: null,
                  out_time: null,
                  status: "Absent",
                  date: today,
                  _synthesized: true,
                }));

              const merged = [...attendanceList, ...synthesizedAbsents].sort((a, b) => {
                if (a.date === b.date) {
                  if (a._synthesized && !b._synthesized) return 1;
                  if (!a._synthesized && b._synthesized) return -1;
                  const aTime = a.in_time ? new Date(a.in_time).getTime() : 0;
                  const bTime = b.in_time ? new Date(b.in_time).getTime() : 0;
                  return bTime - aTime;
                }
                return b.date.localeCompare(a.date);
              });

              const final = merged.map((row) => {
                if (row._synthesized) return row;
                const p = personnel.find((x) => String(x.id) === String(row.personnel_id));
                return {
                  ...row,
                  name: row.name || p?.name || "--",
                  department: row.department || p?.department || "--",
                  role: row.role || p?.role || "--",
                };
              });

              setRecords(final);
            } catch (e) {
              console.error("Realtime update handling error:", e);
            } finally {
              setLoading(false);
            }
          })();
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "personnel" },
        () => {
          // refetch on personnel change so synthesized absentees stay correct
          // simple approach: re-run the main fetch by changing userEmail (not practical) — instead call fetchData again:
          // Call fetchData directly (redeclare fetchData or move to outer scope).
          // For simplicity, reload the page data by brute-force: call window.location.reload() is harsh; instead call the same fetchData logic by triggering a small re-fetch.
          (async () => {
            try {
              setLoading(true);
              const { data: ppl, error: pplErr } = await supabase
                .from("personnel")
                .select("*")
                .eq("user_email", userEmail);
              if (pplErr) throw pplErr;
              setPersonnel(ppl || []);

              const { data: att, error: attErr } = await supabase
                .from("attendance_records")
                .select("*")
                .eq("user_email", userEmail)
                .order("date", { ascending: false })
                .order("created_at", { ascending: false });
              if (attErr) throw attErr;

              const attendanceList = att || [];
              const today = getTodayIST();
              const presentTodayIds = new Set(
                attendanceList.filter((a) => a.date === today).map((a) => String(a.personnel_id))
              );

              const synthesizedAbsents = (ppl || [])
                .filter((p) => !presentTodayIds.has(String(p.id)))
                .map((p) => ({
                  id: `synth-abs-${p.id}-${today}`,
                  personnel_id: p.id,
                  user_email: userEmail,
                  name: p.name,
                  department: p.department,
                  role: p.role,
                  in_time: null,
                  out_time: null,
                  status: "Absent",
                  date: today,
                  _synthesized: true,
                }));

              const merged = [...attendanceList, ...synthesizedAbsents].sort((a, b) => {
                if (a.date === b.date) {
                  if (a._synthesized && !b._synthesized) return 1;
                  if (!a._synthesized && b._synthesized) return -1;
                  const aTime = a.in_time ? new Date(a.in_time).getTime() : 0;
                  const bTime = b.in_time ? new Date(b.in_time).getTime() : 0;
                  return bTime - aTime;
                }
                return b.date.localeCompare(a.date);
              });

              const final = merged.map((row) => {
                if (row._synthesized) return row;
                const p = (ppl || []).find((x) => String(x.id) === String(row.personnel_id));
                return {
                  ...row,
                  name: row.name || p?.name || "--",
                  department: row.department || p?.department || "--",
                  role: row.role || p?.role || "--",
                };
              });

              setRecords(final);
            } catch (e) {
              console.error("Realtime personnel update error:", e);
            } finally {
              setLoading(false);
            }
          })();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userEmail]);

  // Filter logic
  const filteredRecords = records.filter((record) => {
    const matchSearch =
      record.name?.toLowerCase().includes(search.toLowerCase()) ||
      record.department?.toLowerCase().includes(search.toLowerCase());
    const matchDate = selectedDate ? record.date === selectedDate : true;
    return matchSearch && matchDate;
  });

  // Export to PDF (kept — you previously removed, but code left in file; keep working)
  const exportToPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(14);
    doc.text("Attendance Records", 14, 16);

    const tableColumn = ["Name", "Department", "Role", "Check In", "Check Out", "Status", "Date"];
    const tableRows = [];

    filteredRecords.forEach((rec) => {
      tableRows.push([
        rec.name,
        rec.department,
        rec.role || "--",
        rec.in_time ? new Date(rec.in_time).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata" }) : "--",
        rec.out_time ? new Date(rec.out_time).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata" }) : "--",
        rec.status || (rec._synthesized ? "Absent" : "--"),
        rec.date,
      ]);
    });

    doc.autoTable({
      head: [tableColumn],
      body: tableRows,
      startY: 25,
    });

    const today = getTodayIST();
    doc.save(`Attendance_${today}.pdf`);
  };

  if (loading) {
    return <div className="text-center mt-10 text-primary">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-primary">ATTENDANCE RECORDS</h1>
          <p className="text-muted-foreground">Realtime attendance data</p>
        </div>
        <button
          onClick={exportToPDF}
          className="flex items-center gap-2 rounded bg-primary px-4 py-2 font-bold text-black hover:bg-primary/80 transition-colors"
        >
          <Download className="h-4 w-4" />
          EXPORT
        </button>
      </div>

      <div className="rounded-lg border border-primary/30 bg-card p-6">
        <div className="mb-6 flex gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or department..."
              className="w-full rounded border border-primary/30 bg-muted/20 py-2 pl-10 pr-4 text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
            />
          </div>
          <div className="relative">
            <Calendar className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="rounded border border-primary/30 bg-muted/20 py-2 pl-10 pr-4 text-foreground focus:border-primary focus:outline-none"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-primary/30">
                <th className="pb-3 text-left text-sm font-bold text-primary">NAME</th>
                <th className="pb-3 text-left text-sm font-bold text-primary">DEPARTMENT</th>
                <th className="pb-3 text-left text-sm font-bold text-primary">ROLE</th>
                <th className="pb-3 text-left text-sm font-bold text-primary">CHECK IN</th>
                <th className="pb-3 text-left text-sm font-bold text-primary">CHECK OUT</th>
                <th className="pb-3 text-left text-sm font-bold text-primary">STATUS</th>
                <th className="pb-3 text-left text-sm font-bold text-primary">DATE</th>
              </tr>
            </thead>
            <tbody>
              {filteredRecords.length > 0 ? (
                filteredRecords.map((record) => (
                  <tr key={record.id} className="border-b border-primary/10 hover:bg-muted/20">
                    <td className="py-4 text-foreground">{record.name}</td>
                    <td className="py-4 text-muted-foreground">{record.department}</td>
                    <td className="py-4 text-muted-foreground">{record.role || "--"}</td>
                    <td className="py-4 text-foreground">
                      {record.in_time
                        ? new Date(record.in_time).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata" })
                        : "--"}
                    </td>
                    <td className="py-4 text-foreground">
                      {record.out_time
                        ? new Date(record.out_time).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata" })
                        : "--"}
                    </td>
                    <td className="py-4">
                      <span
                        className={`rounded px-2 py-1 text-xs font-bold ${
                          (record.status === "Present" || (record.in_time && record.out_time))
                            ? "bg-green-400/20 text-green-400"
                            : (record.status === "Arrived" || (record.in_time && !record.out_time))
                            ? "bg-yellow-400/20 text-yellow-400"
                            : "bg-red-400/20 text-red-400"
                        }`}
                      >
                        {record.status || (record._synthesized ? "Absent" : "--")}
                      </span>
                    </td>
                    <td className="py-4 text-muted-foreground">{record.date}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="7" className="py-4 text-center text-muted-foreground">
                    No records found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
