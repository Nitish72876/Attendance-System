import { useState, useRef, useEffect } from "react";
import { Camera, Upload } from "lucide-react";
import { supabase } from "../Config/supabaseClient";
import * as faceapi from "face-api.js";

export default function AddPersonnel() {
  const [formData, setFormData] = useState({
    name: "",
    department: "",
    role: "",
    status: "Active",
  });
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const videoRef = useRef(null);
  const [userEmail, setUserEmail] = useState(null);

  // Load models
  useEffect(() => {
    const loadModels = async () => {
      try {
        await faceapi.nets.ssdMobilenetv1.loadFromUri("/models");
        await faceapi.nets.faceLandmark68Net.loadFromUri("/models");
        await faceapi.nets.faceRecognitionNet.loadFromUri("/models");
        setModelsLoaded(true);
        console.log(" Face-api models loaded successfully");
      } catch (error) {
        console.error("❌ Error loading face-api models:", error);
      }
    };
    loadModels();
  }, []);

  // Get logged-in user email
  useEffect(() => {
    const fetchUser = async () => {
      const { data } = await supabase.auth.getUser();
      if (data?.user?.email) setUserEmail(data.user.email);
    };
    fetchUser();
  }, []);

  // Upload handler
  const handleUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };
  
  const startCamera = async () => {
  try {
    // Ask explicitly for permission
    const permission = await navigator.mediaDevices.getUserMedia({ video: true });
    if (videoRef.current) {
      videoRef.current.srcObject = permission;
    }
    setCameraActive(true);
  } catch (err) {
    console.error("Camera access error:", err);
    alert("Unable to access camera. Please allow camera permission and try again.");
  }
};


  // Capture photo
  const capturePhoto = () => {
    if (!videoRef.current) return;
    const canvas = document.createElement("canvas");
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(videoRef.current, 0, 0);
    canvas.toBlob((blob) => {
      const file = new File([blob], `captured-${Date.now()}.png`, {
        type: "image/png",
      });
      setImageFile(file);
      setImagePreview(URL.createObjectURL(file));
      stopCamera();
    });
  };

  // Stop camera
  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      videoRef.current.srcObject.getTracks().forEach((track) => track.stop());
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
  };

  // Get encoding
  const getFaceEncoding = async (imageFile) => {
    const img = await faceapi.bufferToImage(imageFile);
    const detection = await faceapi
      .detectSingleFace(img)
      .withFaceLandmarks()
      .withFaceDescriptor();
    if (!detection) throw new Error("No face detected in the image.");
    return Array.from(detection.descriptor);
  };

  // Submit
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!imageFile) return alert("Please upload or capture an image.");
    if (!modelsLoaded) return alert("Wait — face models still loading.");
    setLoading(true);

    try {
      // Upload image
      const fileName = `${Date.now()}-${imageFile.name}`;
      const { error: uploadError } = await supabase.storage
        .from("personnel-images")
        .upload(fileName, imageFile);
      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage
        .from("personnel-images")
        .getPublicUrl(fileName);
      const imageUrl = publicUrlData.publicUrl;

      // Get encoding
      const faceEncoding = await getFaceEncoding(imageFile);

      // Insert data
      const { error: insertError } = await supabase.from("personnel").insert([
        {
          name: formData.name,
          department: formData.department,
          role: formData.role,
          status: formData.status,
          image_url: imageUrl,
          face_encoding: faceEncoding,
          user_email: userEmail,
        },
      ]);

      if (insertError) throw insertError;

      alert(" Personnel added successfully!");
      resetForm();
    } catch (err) {
      console.error("❌ Failed to add personnel:", err);
      alert(`❌ Failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Reset
  const resetForm = () => {
    setFormData({ name: "", department: "", role: "", status: "Active" });
    setImageFile(null);
    setImagePreview(null);
  };

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-primary">ADD PERSONNEL</h1>
      <p className="text-muted-foreground">
        Fill in details and upload <b>one clear face photo</b> or capture it using your camera.
      </p>

      <form
        onSubmit={handleSubmit}
        className="rounded-lg border border-primary/30 bg-card p-6 space-y-6 backdrop-blur-md"
      >
        {/* Input Fields */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <input
            type="text"
            placeholder="Full Name"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            className="rounded-lg border border-primary/30 bg-muted/20 p-2 text-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary/40 focus:outline-none transition"
          />

          <input
            type="text"
            placeholder="Department"
            value={formData.department}
            onChange={(e) =>
              setFormData({ ...formData, department: e.target.value })
            }
            className="rounded-lg border border-primary/30 bg-muted/20 p-2 text-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary/40 focus:outline-none transition"
          />

          <select
            value={formData.role}
            onChange={(e) => setFormData({ ...formData, role: e.target.value })}
            className="w-full px-4 py-2 border border-primary/30 rounded-lg bg-background text-foreground focus:ring-2 focus:ring-primary focus:outline-none"
          >
            <option value="">Select Role</option>
            <option value="Teacher">Teacher</option>
            <option value="Student">Student</option>
          </select>

          <select
            value={formData.status}
            onChange={(e) =>
              setFormData({ ...formData, status: e.target.value })
            }
            className="w-full px-4 py-2 border border-primary/30 rounded-lg bg-background text-foreground focus:ring-2 focus:ring-primary focus:outline-none"
          >
            <option value="Active">Active</option>
            <option value="Inactive">Inactive</option>
          </select>
        </div>

        {/* Upload or Capture */}
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row gap-4">
            <label className="flex items-center justify-center gap-2 w-fit cursor-pointer rounded-lg border border-primary/40 bg-muted/20 px-4 py-2 text-primary hover:bg-primary hover:text-black transition">
              <Upload className="h-4 w-4" />
              <span>Select Image</span>
              <input
                type="file"
                accept="image/*"
                onChange={handleUpload}
                className="hidden"
              />
            </label>

            <button
              type="button"
              onClick={() => {
                startCamera();
              }}
              className="flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 font-semibold text-black hover:bg-primary/80 transition"
            >
              <Camera className="h-4 w-4" />
              Use Camera
            </button>
          </div>

          {/* Camera view */}
          {cameraActive && (
            <div className="space-y-3">
              <div className="relative w-full max-w-md mx-auto rounded-lg overflow-hidden border border-primary/30">
                <video ref={videoRef} autoPlay playsInline className="w-full" />
              </div>
              <div className="flex gap-3 justify-center">
                <button
                  type="button"
                  onClick={capturePhoto}
                  className="bg-primary px-4 py-2 rounded-lg text-black font-semibold"
                >
                  Capture
                </button>
                <button
                  type="button"
                  onClick={stopCamera}
                  className="bg-red-500 text-white px-4 py-2 rounded-lg"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {imagePreview && (
            <div className="flex flex-col items-center">
              <img
                src={imagePreview}
                alt="Preview"
                className="w-32 h-32 object-cover rounded-lg border border-primary/30"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Selected / Captured Image
              </p>
            </div>
          )}
        </div>

        {/* Submit */}
        <div className="flex justify-end pt-4">
          <button
            type="submit"
            disabled={loading}
            className="rounded-lg bg-primary px-6 py-2 font-semibold text-black hover:bg-primary/80 transition"
          >
            {loading ? "Uploading..." : "Add"}
          </button>
        </div>
      </form>
    </div>
  );
}
