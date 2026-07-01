"use client";

import { useState, useRef, useTransition } from "react";
import {
  Mic, MicOff, Sparkles, Save, Trash2, Plus, X,
  ChevronDown, ChevronUp, ClipboardList, FileText, Copy, Check, ScanLine,
} from "lucide-react";
import { saveWardNote, deleteWardNote, updateProblemList, updateWardLocation } from "@/app/actions/patients";

type WardNote = {
  id: string;
  note_type: string;
  note_text: string;
  author_name: string | null;
  created_at: string;
};

const NOTE_TYPES = [
  "Simple ward round",
  "Complex ward round",
  "Progress note",
  "Admission note",
  "Initial consult",
  "Handover note",
  "Discharge summary draft",
];

const GENERATE_TYPES = ["Ward Round Plan", "Handover", "Discharge Summary", "Allied Health Summary"] as const;

export default function WardPanel({
  patientId,
  initialNotes,
  initialProblemList,
  initialWardLocation,
}: {
  patientId: string;
  initialNotes: WardNote[];
  initialProblemList: string[];
  initialWardLocation: string | null;
}) {
  const [notes, setNotes] = useState<WardNote[]>(initialNotes);
  const [problemList, setProblemList] = useState<string[]>(initialProblemList);
  const [wardLocation, setWardLocation] = useState(initialWardLocation ?? "");
  const [wardLocationSaved, setWardLocationSaved] = useState(true);

  // Note composer
  const [noteType, setNoteType] = useState("Progress note");
  const [rawNote, setRawNote] = useState("");
  const [cleanedNote, setCleanedNote] = useState("");
  const [showCleaned, setShowCleaned] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [saving, setSaving] = useState(false);

  // Dictation
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  // Problem list
  const [newProblem, setNewProblem] = useState("");
  const [, startProblemTransition] = useTransition();

  // Scan document
  const [scanning, setScanning] = useState(false);
  const scanInputRef = useRef<HTMLInputElement>(null);

  // Generate
  const [generating, setGenerating] = useState<string | null>(null);
  const [generatedOutput, setGeneratedOutput] = useState<{ type: string; text: string } | null>(null);
  const [copied, setCopied] = useState(false);

  // Timeline collapse
  const [timelineOpen, setTimelineOpen] = useState(true);

  // ── Dictation ──────────────────────────────────────────────────────────────

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream, { mimeType: "audio/webm" });
      chunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        setTranscribing(true);
        try {
          const form = new FormData();
          form.append("audio", blob, "dictation.webm");
          const res = await fetch("/api/dictation/transcribe", { method: "POST", body: form });
          const data = await res.json();
          if (data.rawTranscript) {
            setRawNote((prev) => prev ? prev + " " + data.rawTranscript : data.rawTranscript);
          }
        } finally {
          setTranscribing(false);
        }
      };
      mr.start();
      mediaRecorderRef.current = mr;
      setRecording(true);
    } catch {
      alert("Microphone access denied");
    }
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop();
    setRecording(false);
  }

  // ── AI Clean ───────────────────────────────────────────────────────────────

  async function handleClean() {
    if (!rawNote.trim()) return;
    setCleaning(true);
    try {
      const res = await fetch(`/api/patients/${patientId}/ward/clean-note`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawNote, noteType, problemList }),
      });
      const data = await res.json();
      if (data.cleanedNote) {
        setCleanedNote(data.cleanedNote);
        setShowCleaned(true);
      }
    } finally {
      setCleaning(false);
    }
  }

  // ── Save note ──────────────────────────────────────────────────────────────

  async function handleSave() {
    const text = showCleaned ? cleanedNote : rawNote;
    if (!text.trim()) return;
    setSaving(true);
    const result = await saveWardNote(patientId, noteType, text);
    if (!result.error) {
      // Optimistic add — reload will sync properly on next server render
      const newNote: WardNote = {
        id: Math.random().toString(),
        note_type: noteType,
        note_text: text,
        author_name: null,
        created_at: new Date().toISOString(),
      };
      setNotes((prev) => [newNote, ...prev]);
      setRawNote("");
      setCleanedNote("");
      setShowCleaned(false);
    }
    setSaving(false);
  }

  // ── Delete note ────────────────────────────────────────────────────────────

  async function handleDelete(noteId: string) {
    await deleteWardNote(noteId, patientId);
    setNotes((prev) => prev.filter((n) => n.id !== noteId));
  }

  // ── Problem list ───────────────────────────────────────────────────────────

  function addProblem() {
    const p = newProblem.trim();
    if (!p || problemList.includes(p)) return;
    const updated = [...problemList, p];
    setProblemList(updated);
    setNewProblem("");
    startProblemTransition(() => { updateProblemList(patientId, updated); });
  }

  function removeProblem(problem: string) {
    const updated = problemList.filter((x) => x !== problem);
    setProblemList(updated);
    startProblemTransition(() => { updateProblemList(patientId, updated); });
  }

  // ── Ward location ──────────────────────────────────────────────────────────

  async function saveLocation() {
    await updateWardLocation(patientId, wardLocation);
    setWardLocationSaved(true);
  }

  // ── Scan document (Document Intelligence) ─────────────────────────────────

  async function handleScanDoc(file: File) {
    setScanning(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`/api/patients/${patientId}/ward/scan-doc`, {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (data.extractedText) {
        setRawNote((prev) => prev ? prev + "\n\n--- Scanned document ---\n" + data.extractedText : data.extractedText);
        setShowCleaned(false);
      } else {
        alert(data.error || "Could not extract text from document");
      }
    } catch {
      alert("Scan failed — please try again");
    } finally {
      setScanning(false);
    }
  }

  // ── Generate ───────────────────────────────────────────────────────────────

  async function handleGenerate(type: string) {
    setGenerating(type);
    setGeneratedOutput(null);
    try {
      const res = await fetch(`/api/patients/${patientId}/ward/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type }),
      });
      const data = await res.json();
      if (data.output) {
        setGeneratedOutput({ type, text: data.output });
      }
    } finally {
      setGenerating(null);
    }
  }

  function copyGenerated() {
    if (!generatedOutput) return;
    navigator.clipboard.writeText(generatedOutput.text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">

      {/* Ward location + Problem list */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Ward location */}
        <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
          <h3 className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Ward / Location</h3>
          <div className="flex gap-2">
            <input
              value={wardLocation}
              onChange={(e) => { setWardLocation(e.target.value); setWardLocationSaved(false); }}
              placeholder="e.g. 4B, Bed 12"
              className="flex-1 border border-gray-200 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-brand-teal/50"
            />
            <button
              onClick={saveLocation}
              disabled={wardLocationSaved}
              className="text-xs px-3 py-1.5 rounded bg-brand-teal text-white hover:opacity-90 disabled:opacity-40"
            >
              Save
            </button>
          </div>
        </div>

        {/* Problem list */}
        <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
          <h3 className="text-xs font-semibold text-slate-600 uppercase tracking-wide flex items-center gap-1.5">
            <ClipboardList className="h-3.5 w-3.5 text-brand-teal" />
            Active Problem List
          </h3>
          <div className="flex gap-2">
            <input
              value={newProblem}
              onChange={(e) => setNewProblem(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addProblem(); } }}
              placeholder="Add problem…"
              className="flex-1 border border-gray-200 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-brand-teal/50"
            />
            <button
              onClick={addProblem}
              className="flex items-center gap-1 text-xs px-3 py-1.5 rounded bg-brand-teal text-white hover:opacity-90"
            >
              <Plus className="h-3 w-3" /> Add
            </button>
          </div>
          {problemList.length > 0 && (
            <ul className="space-y-1">
              {problemList.map((p, i) => (
                <li key={i} className="flex items-center justify-between bg-slate-50 rounded px-3 py-1.5 text-sm">
                  <span className="text-slate-700">{i + 1}. {p}</span>
                  <button onClick={() => removeProblem(p)} className="text-gray-300 hover:text-rose-500">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {problemList.length === 0 && (
            <p className="text-xs text-gray-400">No active problems added yet.</p>
          )}
        </div>
      </div>

      {/* Note composer */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold text-slate-600 uppercase tracking-wide">New Note</h3>
          <select
            value={noteType}
            onChange={(e) => setNoteType(e.target.value)}
            className="border border-gray-200 rounded px-2.5 py-1 text-xs text-slate-600 focus:outline-none focus:ring-1 focus:ring-brand-teal/50"
          >
            {NOTE_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>

        {/* Toggle raw / cleaned */}
        {cleanedNote && (
          <div className="flex gap-2 text-xs">
            <button
              onClick={() => setShowCleaned(false)}
              className={`px-3 py-1 rounded-full border ${!showCleaned ? "bg-brand-teal text-white border-brand-teal" : "text-gray-500 border-gray-200"}`}
            >Raw dictation</button>
            <button
              onClick={() => setShowCleaned(true)}
              className={`px-3 py-1 rounded-full border ${showCleaned ? "bg-brand-teal text-white border-brand-teal" : "text-gray-500 border-gray-200"}`}
            >AI formatted</button>
          </div>
        )}

        <textarea
          value={showCleaned ? cleanedNote : rawNote}
          onChange={(e) => showCleaned ? setCleanedNote(e.target.value) : setRawNote(e.target.value)}
          rows={8}
          placeholder={`Dictate or type your ${noteType.toLowerCase()}…`}
          className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-brand-teal/50 resize-y"
        />

        <div className="flex items-center gap-2 flex-wrap">
          {/* Dictation button */}
          <button
            onClick={recording ? stopRecording : startRecording}
            disabled={transcribing}
            className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border font-medium transition ${
              recording
                ? "bg-rose-50 border-rose-200 text-rose-600 animate-pulse"
                : "border-gray-200 text-gray-600 hover:bg-gray-50"
            }`}
          >
            {recording ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
            {transcribing ? "Transcribing…" : recording ? "Stop recording" : "Dictate"}
          </button>

          {/* Scan document */}
          <label className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border cursor-pointer transition ${scanning ? "border-amber-200 text-amber-600 opacity-70" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}>
            <ScanLine className="h-3.5 w-3.5" />
            {scanning ? "Scanning…" : "Scan document"}
            <input
              ref={scanInputRef}
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.tiff,.tif,.bmp,.heic,.heif"
              className="hidden"
              disabled={scanning}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) { handleScanDoc(f); e.target.value = ""; } }}
            />
          </label>

          {/* AI format */}
          <button
            onClick={handleClean}
            disabled={cleaning || !rawNote.trim()}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-violet-200 text-violet-600 hover:bg-violet-50 disabled:opacity-40"
          >
            <Sparkles className="h-3.5 w-3.5" />
            {cleaning ? "Formatting…" : "AI format"}
          </button>

          {/* Save */}
          <button
            onClick={handleSave}
            disabled={saving || (!rawNote.trim() && !cleanedNote.trim())}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md bg-brand-teal text-white hover:opacity-90 disabled:opacity-40 ml-auto"
          >
            <Save className="h-3.5 w-3.5" />
            {saving ? "Saving…" : "Save note"}
          </button>
        </div>
      </div>

      {/* Generate section */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
        <h3 className="text-xs font-semibold text-slate-600 uppercase tracking-wide flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5 text-violet-500" />
          Generate from ward notes
        </h3>
        <div className="flex gap-2 flex-wrap">
          {GENERATE_TYPES.map((type) => (
            <button
              key={type}
              onClick={() => handleGenerate(type)}
              disabled={!!generating}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-violet-200 text-violet-700 hover:bg-violet-50 disabled:opacity-40"
            >
              <FileText className="h-3.5 w-3.5" />
              {generating === type ? "Generating…" : type}
            </button>
          ))}
        </div>

        {generatedOutput && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-slate-600">{generatedOutput.type}</p>
              <button
                onClick={copyGenerated}
                className="flex items-center gap-1 text-xs text-gray-500 hover:text-slate-700"
              >
                {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <textarea
              value={generatedOutput.text}
              onChange={(e) => setGeneratedOutput({ ...generatedOutput, text: e.target.value })}
              rows={14}
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-brand-teal/50 resize-y"
            />
          </div>
        )}
      </div>

      {/* Notes timeline */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <button
          onClick={() => setTimelineOpen((o) => !o)}
          className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition"
        >
          <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide flex items-center gap-2">
            Ward Notes
            <span className="rounded-full bg-brand-teal/10 text-brand-teal text-[10px] font-semibold px-2 py-0.5">
              {notes.length}
            </span>
          </span>
          {timelineOpen ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
        </button>

        {timelineOpen && (
          <div className="divide-y divide-gray-100">
            {notes.length === 0 && (
              <p className="px-4 py-6 text-sm text-gray-400 text-center">No ward notes yet.</p>
            )}
            {notes.map((note) => (
              <div key={note.id} className="px-4 py-3 space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] uppercase tracking-wide font-semibold text-brand-teal bg-brand-teal/10 px-2 py-0.5 rounded-full">
                      {note.note_type}
                    </span>
                    {note.author_name && (
                      <span className="text-[10px] text-gray-400">{note.author_name}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] text-gray-400">
                      {new Date(note.created_at).toLocaleString("en-AU", {
                        day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
                      })}
                    </span>
                    <button
                      onClick={() => handleDelete(note.id)}
                      className="text-gray-300 hover:text-rose-500 transition"
                      title="Delete note"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                <p className="text-sm text-slate-700 whitespace-pre-wrap font-mono leading-relaxed">
                  {note.note_text}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
