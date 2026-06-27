"use client";

import { useState, useEffect } from "react";
import type { ActivityLevel } from "@/lib/profile";

interface ProfileData {
  age: number;
  heightCm: number;
  weightKg: number;
  sex: "male" | "female";
  activityLevel: ActivityLevel;
  goal?: string;
  updatedAt: string;
  bmr: number;
  tdee: number;
  bmi: number;
}

interface Props {
  onClose: () => void;
  onTDEEChange?: (tdee: number) => void;
}

const ACTIVITY_LABELS: Record<ActivityLevel, string> = {
  sedentary:   "Sedentary (desk job, no exercise)",
  light:       "Light (1–3 days/week)",
  moderate:    "Moderate (3–5 days/week)",
  active:      "Active (6–7 days/week)",
  very_active: "Very active (hard training daily)",
};

const BMI_LABEL = (bmi: number) => {
  if (bmi < 18.5) return { label: "Underweight", color: "text-sky-400" };
  if (bmi < 25)   return { label: "Normal",      color: "text-emerald-400" };
  if (bmi < 30)   return { label: "Overweight",  color: "text-amber-400" };
  return              { label: "Obese",        color: "text-red-400" };
};

export default function ProfilePanel({ onClose, onTDEEChange }: Props) {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    age: 30, heightCm: 175, weightKg: 75, sex: "male" as "male" | "female",
    activityLevel: "moderate" as ActivityLevel, goal: "",
  });

  useEffect(() => {
    fetch("/api/profile").then((r) => r.json()).then((data) => {
      if (data) {
        setProfile(data);
        setForm({
          age: data.age, heightCm: data.heightCm, weightKg: data.weightKg,
          sex: data.sex, activityLevel: data.activityLevel, goal: data.goal ?? "",
        });
      } else {
        setEditing(true);
      }
    });
  }, []);

  async function save() {
    setSaving(true);
    const res = await fetch("/api/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    setProfile(data);
    setSaving(false);
    setEditing(false);
    onTDEEChange?.(data.tdee);
  }

  const bmiInfo = profile ? BMI_LABEL(profile.bmi) : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-md shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
          <h2 className="text-white font-bold text-lg">Personal Profile</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Stats row (shown when not editing) */}
          {profile && !editing && (
            <>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: "BMR", value: profile.bmr, unit: "kcal" },
                  { label: "TDEE", value: profile.tdee, unit: "kcal" },
                  { label: "BMI", value: profile.bmi, unit: bmiInfo?.label ?? "" },
                ].map(({ label, value, unit }) => (
                  <div key={label} className="bg-gray-800 rounded-xl p-3 text-center">
                    <p className="text-xs text-gray-400 mb-0.5">{label}</p>
                    <p className={`text-xl font-bold tabular-nums ${label === "BMI" ? (bmiInfo?.color ?? "text-white") : "text-emerald-400"}`}>{value}</p>
                    <p className="text-[10px] text-gray-500">{unit}</p>
                  </div>
                ))}
              </div>

              <div className="bg-gray-800 rounded-xl p-4 space-y-1.5 text-sm">
                {[
                  ["Age", `${profile.age} years`],
                  ["Height", `${profile.heightCm} cm`],
                  ["Weight", `${profile.weightKg} kg`],
                  ["Sex", profile.sex.charAt(0).toUpperCase() + profile.sex.slice(1)],
                  ["Activity", ACTIVITY_LABELS[profile.activityLevel].split(" (")[0]],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between">
                    <span className="text-gray-400">{k}</span>
                    <span className="text-white font-medium">{v}</span>
                  </div>
                ))}
                {profile.goal && (
                  <div className="pt-1 border-t border-gray-700">
                    <span className="text-gray-400 block text-xs mb-0.5">Goal</span>
                    <span className="text-white font-medium">{profile.goal}</span>
                  </div>
                )}
              </div>

              <button
                onClick={() => setEditing(true)}
                className="w-full py-2.5 rounded-xl bg-gray-700 hover:bg-gray-600 text-white text-sm font-medium transition-colors"
              >
                Edit profile
              </button>
            </>
          )}

          {/* Edit form */}
          {editing && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                {(["age", "heightCm", "weightKg"] as const).map((field) => (
                  <div key={field} className={field === "age" ? "col-span-1" : "col-span-1"}>
                    <label className="block text-xs text-gray-400 mb-1">
                      {field === "age" ? "Age (years)" : field === "heightCm" ? "Height (cm)" : "Weight (kg)"}
                    </label>
                    <input
                      type="number"
                      value={form[field]}
                      onChange={(e) => setForm((f) => ({ ...f, [field]: Number(e.target.value) }))}
                      className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                ))}

                <div>
                  <label className="block text-xs text-gray-400 mb-1">Sex</label>
                  <select
                    value={form.sex}
                    onChange={(e) => setForm((f) => ({ ...f, sex: e.target.value as "male" | "female" }))}
                    className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-emerald-500"
                  >
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1">Activity level</label>
                <select
                  value={form.activityLevel}
                  onChange={(e) => setForm((f) => ({ ...f, activityLevel: e.target.value as ActivityLevel }))}
                  className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-emerald-500"
                >
                  {(Object.entries(ACTIVITY_LABELS) as [ActivityLevel, string][]).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1">Health goal</label>
                <input
                  type="text"
                  value={form.goal}
                  onChange={(e) => setForm((f) => ({ ...f, goal: e.target.value }))}
                  placeholder="e.g. Build muscle and improve recovery"
                  className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="flex gap-3 pt-1">
                {profile && (
                  <button
                    onClick={() => setEditing(false)}
                    className="flex-1 py-2.5 rounded-xl bg-gray-700 hover:bg-gray-600 text-white text-sm font-medium transition-colors"
                  >
                    Cancel
                  </button>
                )}
                <button
                  onClick={save}
                  disabled={saving}
                  className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-bold transition-colors"
                >
                  {saving ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
