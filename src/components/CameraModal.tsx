"use client";

import { useRef, useEffect, useState } from "react";

interface Props {
  onCapture: (file: File) => void;
  onClose: () => void;
}

export default function CameraModal({ onCapture, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError]       = useState<string | null>(null);
  const [ready, setReady]       = useState(false);
  const [facingMode, setFacing] = useState<"environment" | "user">("environment");

  useEffect(() => {
    let stream: MediaStream | null = null;
    setReady(false);
    setError(null);

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode } })
      .then((s) => {
        stream = s;
        if (videoRef.current) videoRef.current.srcObject = s;
        setReady(true);
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : "Camera access denied");
      });

    return () => { stream?.getTracks().forEach((t) => t.stop()); };
  }, [facingMode]);

  function capture() {
    if (!videoRef.current || !ready) return;
    const v = videoRef.current;
    const canvas = document.createElement("canvas");
    canvas.width  = v.videoWidth;
    canvas.height = v.videoHeight;
    canvas.getContext("2d")?.drawImage(v, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (blob) onCapture(new File([blob], `photo-${Date.now()}.jpg`, { type: "image/jpeg" }));
      },
      "image/jpeg",
      0.92
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-lg">
        {error ? (
          <div className="text-center space-y-3 py-12">
            <p className="text-4xl">📷</p>
            <p className="text-sm text-red-400">{error}</p>
            <p className="text-xs text-gray-500">Check browser camera permissions and try again.</p>
          </div>
        ) : (
          /* eslint-disable-next-line jsx-a11y/media-has-caption */
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full max-h-[60vh] object-cover rounded-2xl"
          />
        )}
      </div>

      <div className="flex items-center gap-6 mt-8">
        <button
          onClick={onClose}
          className="px-5 py-2.5 rounded-xl bg-gray-800 text-gray-300 text-sm font-medium hover:bg-gray-700 transition-colors"
        >
          Cancel
        </button>

        <button
          onClick={capture}
          disabled={!ready}
          className="w-[72px] h-[72px] rounded-full bg-white shadow-xl flex items-center justify-center disabled:opacity-40 active:scale-95 transition-transform"
          aria-label="Take photo"
        >
          <div className="w-14 h-14 rounded-full bg-white border-4 border-gray-300" />
        </button>

        <button
          onClick={() => setFacing((m) => (m === "environment" ? "user" : "environment"))}
          className="px-5 py-2.5 rounded-xl bg-gray-800 text-gray-300 text-sm font-medium hover:bg-gray-700 transition-colors"
          aria-label="Flip camera"
        >
          Flip
        </button>
      </div>
    </div>
  );
}
