import { useForm } from "react-hook-form";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "../Config/supabaseClient";

export default function Login() {
  const { register, handleSubmit, formState: { errors } } = useForm();
  const navigate = useNavigate();

  const onSubmit = async (data) => {
    const { data: session, error } = await supabase.auth.signInWithPassword({
      email: data.username,
      password: data.password,
    });

    if (error) {
      alert("Login failed! " + error.message);
    } else {
      
      navigate("/");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background cyber-grid">
      <div className="w-full max-w-md bg-card/50 backdrop-blur-md p-8 rounded-2xl shadow-lg border border-primary/30">
        <h2 className="text-2xl font-bold text-center text-primary mb-6">Welcome Back</h2>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          <div>
            <label className="block text-sm text-muted-foreground mb-1">Email</label>
            <input
              type="email"
              {...register("username", { required: true })}
              className="w-full p-2 rounded-lg bg-background border border-border focus:outline-none focus:ring-2 focus:ring-primary text-foreground"
              placeholder="Enter your email"
            />
            {errors.username && <p className="text-red-400 text-sm mt-1">Email is required</p>}
          </div>

          <div>
            <label className="block text-sm text-muted-foreground mb-1">Password</label>
            <input
              type="password"
              {...register("password", { required: true })}
              className="w-full p-2 rounded-lg bg-background border border-border focus:outline-none focus:ring-2 focus:ring-primary text-foreground"
              placeholder="Enter password"
            />
            {errors.password && <p className="text-red-400 text-sm mt-1">Password is required</p>}
          </div>

          <button
            type="submit"
            className="w-full py-2 rounded-lg bg-primary text-primary-foreground font-semibold hover:opacity-90 transition"
          >
            Login
          </button>
        </form>

        <p className="text-sm text-center text-muted-foreground mt-4">
          Don’t have an account?{" "}
          <Link to="/signup" className="text-primary hover:underline">
            Sign Up
          </Link>
        </p>
      </div>
    </div>
  );
}
