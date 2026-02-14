import { useEffect, useState } from "react";
import { UserPlus, Search } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../Config/supabaseClient";

export default function Personnel() {
  const navigate = useNavigate();
  const [personnel, setPersonnel] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [userEmail, setUserEmail] = useState(null);

  // Get current logged-in user
  useEffect(() => {
    const getUser = async () => {
      const { data } = await supabase.auth.getUser();
      if (data?.user?.email) setUserEmail(data.user.email);
    };
    getUser();
  }, []);

  // Fetch personnel data
  useEffect(() => {
    if (!userEmail) return;

    const fetchPersonnel = async () => {
      const { data, error } = await supabase
        .from("personnel")
        .select("id, name, department, role, status, image_url, user_email")
        .eq("user_email", userEmail);

      if (error) console.error("Error fetching personnel:", error);
      else setPersonnel(data || []);
    };

    fetchPersonnel();

    // Real-time updates
    const channel = supabase
      .channel("realtime:personnel")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "personnel" },
        (payload) => {
          if (payload.new.user_email === userEmail) {
            fetchPersonnel(); // refresh immediately
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userEmail]);

  // Filter search results
  const filteredPersonnel = personnel.filter(
    (p) =>
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.department.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.role.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-primary">PERSONNEL DATABASE</h1>
          <p className="text-muted-foreground">Manage employee profiles</p>
        </div>
        <button
          onClick={() => navigate("/personnel/add")}
          className="flex items-center gap-2 rounded bg-primary px-4 py-2 font-bold text-black hover:bg-primary/80 transition-colors glow-cyan"
        >
          <UserPlus className="h-4 w-4" />
          ADD PERSONNEL
        </button>
      </div>

      {/* Search */}
      <div className="rounded-lg border border-primary/30 bg-card p-6">
        <div className="mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search personnel..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full rounded border border-primary/30 bg-muted/20 py-2 pl-10 pr-4 text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
            />
          </div>
        </div>

        {/* Personnel Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredPersonnel.length > 0 ? (
            filteredPersonnel.map((person) => (
              <div
                key={person.id}
                className="rounded-lg border border-primary/30 bg-muted/20 p-4 hover:border-primary/50 transition-colors"
              >
                <div className="mb-3 flex items-center gap-3">
                  {person.image_url ? (
                    <img
                      src={person.image_url}
                      alt={person.name}
                      className="h-12 w-12 rounded-full object-cover border border-primary/40"
                    />
                  ) : (
                    <div className="h-12 w-12 rounded-full bg-primary/20 flex items-center justify-center">
                      <span className="font-bold text-primary">
                        {person.name
                          .split(" ")
                          .map((n) => n[0])
                          .join("")}
                      </span>
                    </div>
                  )}
                  <div>
                    <p className="font-bold text-foreground">{person.name}</p>
                    <p className="text-xs text-muted-foreground">{person.role}</p>
                  </div>
                </div>

                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Department</span>
                    <span className="text-foreground">{person.department}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Role</span>
                    <span className="text-foreground">{person.role}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Status</span>
                    <span
                      className={
                        person.status === "Active"
                          ? "text-green-400"
                          : "text-red-400"
                      }
                    >
                      {person.status}
                    </span>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <p className="text-center text-muted-foreground">
              No personnel found.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
