"use client"

import { useRef, useState, useEffect } from "react"
import { Camera, StopCircle, User, CheckCircle } from "lucide-react"
import * as faceapi from "face-api.js"
import { supabase } from "../Config/supabaseClient"

export default function FaceRecognition() {
  const videoRef = useRef(null)
  const [isStreaming, setIsStreaming] = useState(false)
  const [recognitionStatus, setRecognitionStatus] = useState("idle")
  const [recognizedPerson, setRecognizedPerson] = useState(null)
  const [modelsLoaded, setModelsLoaded] = useState(false)
  const faceMatcherRef = useRef(null)
  const personnelCacheRef = useRef({})
  const mountedRef = useRef(true)

  //  Load face-api models and personnel data on mount
  useEffect(() => {
    mountedRef.current = true
    const init = async () => {
      try {
        const MODEL_URL = "/models"
        await Promise.all([
          faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
          faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
          faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
        ])
        setModelsLoaded(true)
        console.log("✅ face-api models loaded")
        await loadPersonnelDescriptors()
      } catch (err) {
        console.error("Model load error:", err)
        alert("Failed to load face models.")
      }
    }
    init()

    return () => {
      mountedRef.current = false
      stopCamera()
    }
  }, [])

  //  Get current logged-in user
  const getCurrentUserEmail = async () => {
    const { data } = await supabase.auth.getUser()
    return data?.user?.email || null
  }

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
        audio: false,
      })
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
        setIsStreaming(true)
        setRecognitionStatus("scanning")
      }
    } catch (err) {
      console.error("Error accessing camera:", err)
      alert("Unable to access camera.")
    }
  }

  const stopCamera = () => {
    try {
      if (videoRef.current && videoRef.current.srcObject) {
        videoRef.current.srcObject.getTracks().forEach((t) => t.stop())
        videoRef.current.srcObject = null
      }
    } catch {}
    setIsStreaming(false)
    setRecognitionStatus("idle")
    setRecognizedPerson(null)
  }

  //  Load personnel only for the current user's email
  const loadPersonnelDescriptors = async () => {
    try {
      const userEmail = await getCurrentUserEmail()
      if (!userEmail) {
        alert("User not logged in.")
        return
      }

      const { data, error } = await supabase
        .from("personnel")
        .select("*")
        .eq("user_email", userEmail)

      if (error) throw error
      const descriptors = []
      const cache = {}

      for (const row of data || []) {
        cache[String(row.id)] = row
        if (!row.face_encoding) continue

        let arr = row.face_encoding
        if (typeof arr === "string") {
          try {
            arr = JSON.parse(arr)
          } catch {
            continue
          }
        }
        if (!Array.isArray(arr) || arr.length === 0) continue
        descriptors.push(new faceapi.LabeledFaceDescriptors(String(row.id), [new Float32Array(arr)]))
      }

      personnelCacheRef.current = cache
      faceMatcherRef.current = new faceapi.FaceMatcher(descriptors, 0.6)
      console.log(`✅ Loaded ${descriptors.length} descriptors for ${userEmail}`)
    } catch (err) {
      console.error("Error loading personnel:", err)
    }
  }

  const captureFrameToCanvas = () => {
    if (!videoRef.current) return null
    const video = videoRef.current
    const canvas = document.createElement("canvas")
    canvas.width = video.videoWidth || 640
    canvas.height = video.videoHeight || 480
    const ctx = canvas.getContext("2d", { willReadFrequently: true })
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    return canvas
  }

  //  Handle attendance update
  const updateAttendanceRecord = async (personRow) => {
    try {
      const now = new Date()
      const today = new Date().toLocaleDateString("en-CA") // "YYYY-MM-DD" in local timezone


      //  Normalize today to date-only comparison (handles timestamp columns)
      const { data: records, error: selectError } = await supabase
        .from("attendance_records")
        .select("*")
        .eq("personnel_id", personRow.id)
        .order("created_at", { ascending: false })

      if (selectError) throw selectError

      // Filter for today only (in case Supabase stores full timestamps)
      const todayRecords = records.filter(
        (r) => r.date?.split("T")[0] === today
      )
      const existing = todayRecords[0]

      const nowISO = now.toISOString()

      //  No record yet → check-in
      if (!existing) {
        const { error: insertError } = await supabase.from("attendance_records").insert([
          {
            personnel_id: personRow.id,
            user_email: personRow.user_email,
            name: personRow.name,
            department: personRow.department,
            role: personRow.role,
            date: today,
            in_time: nowISO,
            status: "Arrived",
            created_at: nowISO,
          },
        ])
        if (insertError) throw insertError

        
        return { action: "checked-in", time: nowISO }
      }

      //  Has record but no out_time → check-out
      if (!existing.out_time) {
        const { error: updateError } = await supabase
          .from("attendance_records")
          .update({
            out_time: nowISO,
            status: "Present",
          })
          .eq("id", existing.id)
        if (updateError) throw updateError

        
        return { action: "checked-out", time: nowISO }
      }

      //  Already checked out → show alert
      alert(`${personRow.name} has already checked in and out for today.`)
      return { action: "already-checked-out", time: nowISO }

    } catch (err) {
      console.error("❌ Attendance update failed:", err)
      alert("Attendance update failed. Check console for details.")
      throw err
    }
  }


  const scanFace = async () => {
    if (!isStreaming) return alert("Start the camera first.")
    if (!modelsLoaded) return alert("Wait for models to load.")
    setRecognitionStatus("processing")
    setRecognizedPerson(null)

    try {
      const canvas = captureFrameToCanvas()
      if (!canvas) throw new Error("Failed to capture frame.")
      const detection = await faceapi
        .detectSingleFace(canvas)
        .withFaceLandmarks()
        .withFaceDescriptor()

      if (!detection?.descriptor) {
        alert("No face detected.")
        setRecognitionStatus("scanning")
        return
      }

      if (!faceMatcherRef.current) await loadPersonnelDescriptors()
      const bestMatch = faceMatcherRef.current.findBestMatch(detection.descriptor)

      if (!bestMatch || bestMatch.label === "unknown") {
        setRecognitionStatus("recognized")
        setRecognizedPerson({ name: "No match", id: "-", department: "-", role: "-", status: "-" })
        return
      }

      const matchedId = bestMatch.label
      const personRow = personnelCacheRef.current[matchedId]
      if (!personRow) return

      const result = await updateAttendanceRecord(personRow)

      setRecognizedPerson({
        name: personRow.name,
        id: personRow.id,
        department: personRow.department,
        role: personRow.role,
        status:
          result.action === "checked-in"
            ? "Checked In"
            : result.action === "checked-out"
            ? "Checked Out"
            : "Already Checked Out",
        time: new Date().toLocaleTimeString(),
      })

      setRecognitionStatus("recognized")
    } catch (err) {
      console.error("Scan error:", err)
      alert("Scan failed.")
      setRecognitionStatus("scanning")
    }
  }

  //  UI unchanged
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-primary">FACE RECOGNITION SCANNER</h1>
        <p className="text-muted-foreground">Biometric attendance verification system</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="rounded-lg border border-primary/30 bg-card p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-bold text-primary">CAMERA FEED</h2>
              <div className="flex items-center gap-2">
                <div className={`h-2 w-2 rounded-full ${isStreaming ? "bg-green-400 animate-pulse" : "bg-red-400"}`} />
                <span className="text-sm text-muted-foreground">{isStreaming ? "ACTIVE" : "INACTIVE"}</span>
              </div>
            </div>

            <div className="relative aspect-video overflow-hidden rounded-lg border-2 border-primary/30 bg-black">
              <video ref={videoRef} autoPlay playsInline className="h-full w-full object-cover" />
              {!isStreaming && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/80">
                  <div className="text-center">
                    <Camera className="mx-auto h-16 w-16 text-primary/50 mb-4" />
                    <p className="text-muted-foreground">Camera feed inactive</p>
                  </div>
                </div>
              )}
              {recognitionStatus === "scanning" && (
                <div className="absolute inset-0 border-4 border-primary/50 animate-pulse" />
              )}
              {recognitionStatus === "processing" && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                  <div className="text-center">
                    <div className="h-16 w-16 mx-auto border-4 border-primary border-t-transparent rounded-full animate-spin mb-4" />
                    <p className="text-primary font-bold">PROCESSING...</p>
                  </div>
                </div>
              )}
            </div>

            <div className="mt-4 flex gap-3">
              {!isStreaming ? (
                <button
                  onClick={startCamera}
                  className="flex items-center gap-2 rounded bg-primary px-6 py-3 font-bold text-black hover:bg-primary/80 transition-colors glow-cyan"
                >
                  <Camera className="h-5 w-5" />
                  START CAMERA
                </button>
              ) : (
                <>
                  <button
                    onClick={stopCamera}
                    className="flex items-center gap-2 rounded bg-red-500 px-6 py-3 font-bold text-white hover:bg-red-600 transition-colors"
                  >
                    <StopCircle className="h-5 w-5" />
                    STOP CAMERA
                  </button>
                  <button
                    onClick={scanFace}
                    disabled={recognitionStatus === "processing"}
                    className="flex items-center gap-2 rounded bg-secondary px-6 py-3 font-bold text-black hover:bg-secondary/80 transition-colors disabled:opacity-50 glow-magenta"
                  >
                    <User className="h-5 w-5" />
                    SCAN FACE
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Recognition Results */}
        <div className="space-y-4">
          <div className="rounded-lg border border-primary/30 bg-card p-6">
            <h2 className="mb-4 text-xl font-bold text-primary">SCAN STATUS</h2>
            {recognitionStatus === "idle" && (
              <div className="text-center py-8">
                <Camera className="mx-auto h-12 w-12 text-muted-foreground mb-3" />
                <p className="text-muted-foreground">Awaiting scan...</p>
              </div>
            )}
            {recognitionStatus === "scanning" && (
              <div className="text-center py-8">
                <div className="h-12 w-12 mx-auto border-4 border-primary border-t-transparent rounded-full animate-spin mb-3" />
                <p className="text-primary font-bold">Ready to scan</p>
              </div>
            )}
            {recognitionStatus === "processing" && (
              <div className="text-center py-8">
                <div className="h-12 w-12 mx-auto border-4 border-secondary border-t-transparent rounded-full animate-spin mb-3" />
                <p className="text-secondary font-bold">Analyzing face...</p>
              </div>
            )}
            {recognitionStatus === "recognized" && recognizedPerson && (
              <div className="space-y-4">
                <div className="flex items-center justify-center">
                  <CheckCircle className="h-16 w-16 text-green-400" />
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-green-400 mb-2">RECOGNIZED</p>
                  <div className="space-y-2 text-left bg-muted/20 rounded p-4 border border-primary/20">
                    <div>
                      <p className="text-xs text-muted-foreground">Name</p>
                      <p className="font-bold text-foreground">{recognizedPerson.name}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Employee ID</p>
                      <p className="font-bold text-foreground">{recognizedPerson.id}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Department</p>
                      <p className="font-bold text-foreground">{recognizedPerson.department}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Role</p>
                      <p className="font-bold text-foreground">{recognizedPerson.role}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Status</p>
                      <p className="font-bold text-foreground">{recognizedPerson.status}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Time</p>
                      <p className="font-bold text-primary">{recognizedPerson.time}</p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="rounded-lg border border-primary/30 bg-card p-6">
            <h3 className="mb-3 font-bold text-primary">SYSTEM INFO</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Recognition Engine</span>
                <span className="text-foreground">Manual scan</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Threshold</span>
                <span className="text-green-400">0.6</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Profiles</span>
                <span className="text-foreground">{Object.keys(personnelCacheRef.current || {}).length} Profiles</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
