"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Mic, Upload, Copy, Sparkles, BookMarked, ChevronDown, ChevronUp, FileText } from "lucide-react";
import { saveLetterDraft, updateLetterStatus, updateLetterContent, deleteLetter, addLetterNote, getLetterSignedUrl } from "@/app/actions/letters";
import { saveVocabularyCorrection } from "@/app/actions/vocabulary";

type Letter = {
  id: string;
  letter_code: string;
  procedure_type: string | null;
  priority: "routine" | "urgent";
  letter_to: "doctor" | "patient";
  recipient_name: string | null;
  cc: string | null;
  template: string | null;
  content: string | null;
  status: "draft" | "reviewed" | "sent";
  docx_path: string | null;
  notes: string | null;
  created_at: string;
};

const TEMPLATES = [
  { value: "", label: "— Select template —", command: "" },
  { value: "gp_letter", label: "GP / Referring doctor letter", command: "Write a GP letter to the referring doctor summarising this consultation" },
  { value: "preop", label: "Pre-operative assessment", command: "Write a pre-operative assessment letter" },
  { value: "complex_review", label: "Complex review (MBS 132)", command: "Write a complex review letter (MBS item 132)" },
  { value: "initial_consult", label: "Initial consult (MBS 110)", command: "Write an initial consultation letter (MBS item 110)" },
  { value: "followup", label: "Follow-up review", command: "Write a follow-up review letter" },
  { value: "patient_instructions", label: "Patient instructions", command: "Write patient instructions summarising the plan discussed today" },
  { value: "medical_certificate", label: "Medical certificate", command: "Write a medical certificate" },
];

export default function LettersPanel({
  patientId,
  referringSurgeon,
  letters,
}: {
  patientId: string;
  referringSurgeon?: string | null;
  letters: Letter[];
}) {
  const router = useRouter();

  // Letter metadata (left panel)
  const [priority, setPriority] = useState<"routine" | "urgent">("routine");
  const [letterTo, setLetterTo] = useState<"doctor" | "patient">("doctor");
  const [recipientName, setRecipientName] = useState(referringSurgeon || "");
  const [recipientAddress, setRecipientAddress] = useState("");
  const [cc, setCc] = useState("");
  const [template, setTemplate] = useState("");

  // Content
  const [files, setFiles] = useState<File[]>([]);
  const [pastedText, setPastedText] = useState("");
  const [transcript, setTranscript] = useState("");
  const [docType, setDocType] = useState("general");
  const [command, setCommand] = useState("");
  const [letterText, setLetterText] = useState("");
  const [aiData, setAiData] = useState<any>(null);

  // UI state
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [busyLetterId, setBusyLetterId] = useState("");
  const [showSaved, setShowSaved] = useState(true);
  const [workspaceOpen, setWorkspaceOpen] = useState(true);
  const [letterOpen, setLetterOpen] = useState(true);
  const [transcriptCopied, setTranscriptCopied] = useState(false);
  const [viewingLetter, setViewingLetter] = useState<Letter | null>(null);
  const [editedContent, setEditedContent] = useState<Record<string, string>>({});
  const [savingContent, setSavingContent] = useState("");

  // Dictation
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [rawTranscript, setRawTranscript] = useState("");
  const [originalCleanedTranscript, setOriginalCleanedTranscript] = useState("");
  const [dictationError, setDictationError] = useState("");
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<BlobPart[]>([]);

  // Command mic
  const [commandRecording, setCommandRecording] = useState(false);
  const [commandTranscribing, setCommandTranscribing] = useState(false);
  const commandRecorderRef = useRef<MediaRecorder | null>(null);
  const commandChunksRef = useRef<BlobPart[]>([]);

  // Teach form
  const [showTeachForm, setShowTeachForm] = useState(false);
  const [teachWrong, setTeachWrong] = useState("");
  const [teachCorrect, setTeachCorrect] = useState("");
  const [teachCategory, setTeachCategory] = useState("medication");
  const [teachSaving, setTeachSaving] = useState(false);
  const [teachMessage, setTeachMessage] = useState("");

  // ── Dictation ────────────────────────────────────────────────────────────────

  async function startRecording() {
    setDictationError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      audioChunksRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        await handleTranscribe(new Blob(audioChunksRef.current, { type: recorder.mimeType || "audio/webm" }));
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setRecording(true);
    } catch (err: any) {
      setDictationError(err.message || "Could not access microphone");
    }
  }

  function stopRecording() { mediaRecorderRef.current?.stop(); setRecording(false); }

  async function handleTranscribe(audioBlob: Blob) {
    setTranscribing(true);
    setRawTranscript("");
    setDictationError("");
    try {
      const fd = new FormData();
      fd.append("audio", audioBlob, "dictation.webm");
      const res = await fetch("/api/dictation/transcribe", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Transcription failed");
      setRawTranscript(data.rawTranscript || "");
      const cleaned = data.cleanedTranscript || "";
      setOriginalCleanedTranscript((p) => p.trim() ? `${p}\n\n${cleaned}` : cleaned);
      setTranscript((p) => p.trim() ? `${p.trim()}\n\n${cleaned}` : cleaned);
    } catch (err: any) {
      setDictationError(err.message);
    } finally {
      setTranscribing(false);
    }
  }

  // ── Command mic ──────────────────────────────────────────────────────────────

  async function startCommandRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      commandChunksRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) commandChunksRef.current.push(e.data); };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setCommandTranscribing(true);
        try {
          const fd = new FormData();
          fd.append("audio", new Blob(commandChunksRef.current, { type: recorder.mimeType || "audio/webm" }), "command.webm");
          const res = await fetch("/api/dictation/transcribe", { method: "POST", body: fd });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || "Transcription failed");
          setCommand(data.rawTranscript || "");
        } catch (err: any) {
          alert(err.message);
        } finally {
          setCommandTranscribing(false);
        }
      };
      commandRecorderRef.current = recorder;
      recorder.start();
      setCommandRecording(true);
    } catch (err: any) {
      alert(err.message || "Could not access microphone");
    }
  }

  function stopCommandRecording() { commandRecorderRef.current?.stop(); setCommandRecording(false); }

  // ── Generation ───────────────────────────────────────────────────────────────

  function buildFormData() {
    const fd = new FormData();
    files.forEach((f) => fd.append("files", f));
    if (pastedText.trim()) fd.append("pastedText", pastedText);
    if (transcript.trim()) fd.append("transcript", transcript);
    fd.append("docType", docType);
    if (recipientName.trim()) fd.append("recipientName", recipientName);
    return fd;
  }

  async function handleGenerate() {
    if (files.length === 0 && !pastedText.trim() && !transcript.trim()) {
      alert("Please add a file, paste clinical text, or record a transcript first.");
      return;
    }
    setGenerating(true);
    setLetterText("");
    setSaveMessage("");
    try {
      const res = await fetch(`/api/patients/${patientId}/letters/generate`, { method: "POST", body: buildFormData() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Generation failed");
      setLetterText(data.letterText || "");
      setAiData(data.aiData || null);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setGenerating(false);
    }
  }

  async function handleGenerateFromCommand(e: React.FormEvent) {
    e.preventDefault();
    if (!command.trim()) {
      alert('Type or speak an instruction, e.g. "pre-op letter for right hip replacement" or "write to GP".');
      return;
    }
    if (files.length === 0 && !pastedText.trim() && !transcript.trim()) {
      alert("Please add a file, paste clinical text, or record a transcript first.");
      return;
    }
    setGenerating(true);
    setLetterText("");
    setSaveMessage("");
    try {
      const fd = buildFormData();
      fd.append("command", command);
      const res = await fetch(`/api/patients/${patientId}/letters/generate-command`, { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Generation failed");
      setLetterText(data.letterText || "");
      setAiData(data.aiData || null);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setGenerating(false);
    }
  }

  // ── Save ─────────────────────────────────────────────────────────────────────

  async function handleSaveDraft() {
    if (!letterText) return;
    setSaving(true);
    setSaveMessage("");
    try {
      const isPeriopLetter = /pre[\s-]?op|periop|preoperative/i.test(command) || template === "preop";
      const result = await saveLetterDraft(
        patientId,
        letterText,
        aiData?.procedure || template || "",
        isPeriopLetter,
        { priority, letter_to: letterTo, recipient_name: recipientName, recipient_address: recipientAddress, cc, template }
      );
      setSaveMessage(`Saved as ${result.letterCode}`);
      router.refresh();
    } catch (err: any) {
      setSaveMessage(`Error: ${err.message}`);
    } finally {
      setSaving(false);
    }
  }

  // ── Misc handlers ────────────────────────────────────────────────────────────

  async function handleOpenLetter(docxPath: string | null) {
    if (!docxPath) return;
    try {
      window.open(await getLetterSignedUrl(docxPath), "_blank");
    } catch (err: any) {
      alert(err.message);
    }
  }

  async function handleStatusChange(letterId: string, status: "draft" | "reviewed" | "sent") {
    setBusyLetterId(letterId);
    try {
      await updateLetterStatus(letterId, patientId, status);
      router.refresh();
    } finally {
      setBusyLetterId("");
    }
  }

  async function handleDeleteLetter(letterId: string, letterCode: string) {
    if (!confirm(`Delete ${letterCode}? This cannot be undone.`)) return;
    try {
      await deleteLetter(letterId, patientId);
      if (viewingLetter?.id === letterId) setViewingLetter(null);
      router.refresh();
    } catch (err: any) {
      alert(err.message);
    }
  }

  async function handleSaveContent(letterId: string) {
    const content = editedContent[letterId];
    if (content === undefined) return;
    setSavingContent(letterId);
    try {
      await updateLetterContent(letterId, patientId, content);
      router.refresh();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSavingContent("");
    }
  }

  async function handleAddNote(letterId: string) {
    const note = window.prompt("Add a note for this letter:");
    if (note === null) return;
    try {
      await addLetterNote(letterId, patientId, note);
      router.refresh();
    } catch (err: any) {
      alert(err.message);
    }
  }

  async function handleCopyTranscript() {
    if (!transcript) return;
    await navigator.clipboard.writeText(transcript);
    setTranscriptCopied(true);
    setTimeout(() => setTranscriptCopied(false), 2000);
  }

  async function handleTeachSave() {
    if (!teachWrong.trim() || !teachCorrect.trim()) return;
    setTeachSaving(true);
    setTeachMessage("");
    try {
      await saveVocabularyCorrection(teachWrong.trim(), teachCorrect.trim(), teachCategory);
      setTeachMessage(`Saved: "${teachWrong}" → "${teachCorrect}"`);
      setTeachWrong(""); setTeachCorrect("");
      setTimeout(() => { setShowTeachForm(false); setTeachMessage(""); }, 2500);
    } catch (err: any) {
      setTeachMessage(`Error: ${err.message}`);
    } finally {
      setTeachSaving(false);
    }
  }

  const transcriptEdited = originalCleanedTranscript && transcript !== originalCleanedTranscript;

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="flex gap-4 items-start">

      {/* ── LEFT PANEL ── */}
      <div className="w-56 shrink-0 bg-white border border-gray-200 rounded-xl p-4 space-y-4 sticky top-4">

        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Sender</label>
          <p className="text-sm font-medium text-slate-800">Dr. Sahil Vohra</p>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Priority</label>
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value as "routine" | "urgent")}
            className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal"
          >
            <option value="routine">Routine</option>
            <option value="urgent">Urgent</option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase mb-1.5">Letter to</label>
          <div className="flex flex-col gap-1.5">
            {(["doctor", "patient"] as const).map((v) => (
              <label key={v} className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="radio"
                  name="letterTo"
                  value={v}
                  checked={letterTo === v}
                  onChange={() => setLetterTo(v)}
                  className="accent-brand-teal"
                />
                {v === "doctor" ? "Letter to Doctor" : "Letter to Patient"}
              </label>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">
            {letterTo === "doctor" ? "Recipient (Doctor)" : "Recipient"}
          </label>
          <input
            value={recipientName}
            onChange={(e) => setRecipientName(e.target.value)}
            placeholder={letterTo === "doctor" ? "Dr. ..." : "Patient name"}
            className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal"
          />
          {letterTo === "doctor" && (
            <textarea
              value={recipientAddress}
              onChange={(e) => setRecipientAddress(e.target.value)}
              placeholder="Practice / address"
              rows={2}
              className="mt-1.5 w-full rounded-md border border-gray-300 px-2 py-1.5 text-xs resize-none focus:outline-none focus:ring-2 focus:ring-brand-teal"
            />
          )}
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Template</label>
          <select
            value={template}
            onChange={(e) => {
              const t = TEMPLATES.find((x) => x.value === e.target.value);
              setTemplate(e.target.value);
              if (t?.command) setCommand(t.command);
            }}
            className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal"
          >
            {TEMPLATES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">CC</label>
          <input
            value={cc}
            onChange={(e) => setCc(e.target.value)}
            placeholder="Search by name or suburb"
            className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal"
          />
        </div>
      </div>

      {/* ── MAIN AREA ── */}
      <div className="flex-1 min-w-0 space-y-4">

        {/* Top bar: dictation + doc type + upload + generate */}
        <div className="flex flex-wrap items-center gap-3 bg-white border border-gray-200 rounded-xl px-4 py-3">
          <button
            type="button"
            onClick={recording ? stopRecording : startRecording}
            disabled={transcribing}
            className={`flex items-center gap-2 rounded-full text-white text-sm font-medium px-5 py-2 transition select-none ${
              transcribing ? "bg-amber-500 cursor-wait" : recording ? "bg-rose-600 hover:bg-rose-700" : "bg-slate-400 hover:bg-slate-500"
            }`}
          >
            {transcribing ? (
              <><svg className="animate-spin" width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" /></svg>Processing…</>
            ) : recording ? (
              <><span className="flex items-center gap-px h-4">{[0,120,240,360,480].map((d) => (<span key={d} className="w-0.5 bg-white rounded-full" style={{animation:`wave-bar 0.7s ease-in-out infinite`,animationDelay:`${d}ms`,height:"3px"}}/>))}</span>Stop recording</>
            ) : (
              <><Mic size={15}/> Record</>
            )}
          </button>

          {dictationError && <span className="text-sm text-rose-600">{dictationError}</span>}
          <div className="flex-1"/>

          <select
            value={docType}
            onChange={(e) => setDocType(e.target.value)}
            className="rounded-md border border-gray-300 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-brand-teal"
          >
            <option value="general">General / Mixed</option>
            <option value="referral">Referral letter</option>
            <option value="rfa">RFA / Surgical booking form</option>
            <option value="medications">Medication list page</option>
            <option value="pathology">Pathology / blood results</option>
            <option value="ecg">ECG / cardiology</option>
          </select>

          <label className="flex items-center gap-1.5 rounded-md border border-gray-300 text-xs font-medium px-3 py-1.5 cursor-pointer hover:bg-gray-50 transition text-slate-600">
            <Upload size={13}/> Upload files
            <input
              type="file" multiple
              accept=".pdf,.png,.jpg,.jpeg,.tiff,.tif,.bmp,.heic,.heif,.docx,.doc,.txt"
              onChange={(e) => setFiles(Array.from(e.target.files || []))}
              className="hidden"
            />
          </label>

          <button
            type="button"
            onClick={handleGenerate}
            disabled={generating}
            className="flex items-center gap-1.5 rounded-md bg-brand-teal text-white text-sm font-medium px-4 py-2 hover:opacity-90 disabled:opacity-50 transition"
          >
            <Sparkles size={14}/> {generating ? "Generating..." : "Generate letter"}
          </button>
        </div>

        {files.length > 0 && (
          <ul className="text-xs text-gray-500 list-disc list-inside px-1">
            {files.map((f, i) => <li key={i}>{f.name}</li>)}
          </ul>
        )}

        {/* Workspace toggle */}
        <button
          type="button"
          onClick={() => setWorkspaceOpen((o) => !o)}
          className="w-full flex items-center justify-center gap-2 bg-white border border-gray-200 rounded-xl px-4 py-2 text-xs font-medium text-slate-500 hover:bg-gray-50 transition"
        >
          {workspaceOpen ? <ChevronUp size={13}/> : <ChevronDown size={13}/>}
          {workspaceOpen ? "Collapse transcript & notes" : "Expand transcript & notes"}
        </button>

        {/* Transcript / Notes */}
        {workspaceOpen && (
          <div className="grid md:grid-cols-[1.4fr_1fr] gap-4">
            <div className="bg-white border border-gray-200 rounded-xl flex flex-col">
              <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100">
                <h3 className="font-semibold text-sm text-slate-700">Transcript</h3>
                <div className="flex items-center gap-2">
                  {rawTranscript && (
                    <details className="text-xs text-gray-400">
                      <summary className="cursor-pointer">Raw</summary>
                      <p className="mt-1 whitespace-pre-wrap max-w-md">{rawTranscript}</p>
                    </details>
                  )}
                  <button
                    type="button"
                    onClick={handleCopyTranscript}
                    disabled={!transcript}
                    className={`flex items-center gap-1 rounded-md border text-xs font-medium px-2 py-1 transition disabled:opacity-30 disabled:cursor-default ${
                      transcriptCopied ? "border-emerald-500 text-emerald-600 bg-emerald-50" : "border-gray-300 text-gray-500 hover:bg-gray-50"
                    }`}
                  >
                    <Copy size={11}/> {transcriptCopied ? "Copied!" : "Copy"}
                  </button>
                  {transcriptEdited && (
                    <button
                      type="button"
                      onClick={() => { setShowTeachForm((s) => !s); setTeachMessage(""); }}
                      className="flex items-center gap-1 rounded-md border border-brand-teal text-brand-teal text-xs font-medium px-2 py-1 hover:bg-brand-teal/5 transition"
                    >
                      <BookMarked size={11}/> Teach
                    </button>
                  )}
                </div>
              </div>

              {showTeachForm && (
                <div className="px-4 py-3 bg-slate-50 border-b border-gray-100 space-y-2">
                  <p className="text-xs text-gray-500">Save a correction so the app auto-fixes it in future transcriptions.</p>
                  <div className="flex gap-2 flex-wrap">
                    <input value={teachWrong} onChange={(e) => setTeachWrong(e.target.value)} placeholder='Wrong word' className="flex-1 min-w-32 rounded border border-gray-300 px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-brand-teal"/>
                    <input value={teachCorrect} onChange={(e) => setTeachCorrect(e.target.value)} placeholder='Correct word' className="flex-1 min-w-32 rounded border border-gray-300 px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-brand-teal"/>
                    <select value={teachCategory} onChange={(e) => setTeachCategory(e.target.value)} className="rounded border border-gray-300 px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-brand-teal">
                      <option value="medication">Medication</option>
                      <option value="institution">Hospital / institution</option>
                      <option value="person">Person name</option>
                      <option value="clinical">Clinical term</option>
                      <option value="general">General</option>
                    </select>
                    <button type="button" onClick={handleTeachSave} disabled={teachSaving || !teachWrong.trim() || !teachCorrect.trim()} className="rounded-md bg-brand-teal text-white text-xs font-medium px-3 py-1.5 hover:opacity-90 disabled:opacity-50 transition">
                      {teachSaving ? "Saving..." : "Save"}
                    </button>
                  </div>
                  {teachMessage && <p className={`text-xs ${teachMessage.startsWith("Error") ? "text-rose-600" : "text-emerald-700"}`}>{teachMessage}</p>}
                </div>
              )}

              <textarea
                value={transcript}
                onChange={(e) => setTranscript(e.target.value)}
                rows={14}
                placeholder="Your live transcript will display here once you click Record. You can also paste a consultation transcript directly."
                className="flex-1 w-full px-4 py-3 text-sm leading-relaxed border-0 focus:outline-none resize-none rounded-b-xl"
              />
            </div>

            <div className="bg-white border border-gray-200 rounded-xl flex flex-col">
              <div className="px-4 py-2 border-b border-gray-100">
                <h3 className="font-semibold text-sm text-slate-700">Notes / Documents</h3>
              </div>
              <textarea
                value={pastedText}
                onChange={(e) => setPastedText(e.target.value)}
                rows={14}
                placeholder="Paste referral letters, GP summaries, medication lists, pathology, or other clinic notes here."
                className="flex-1 w-full px-4 py-3 text-sm leading-relaxed border-0 focus:outline-none resize-none rounded-b-xl"
              />
            </div>
          </div>
        )}

        {/* Command bar */}
        <form onSubmit={handleGenerateFromCommand} className="flex items-center gap-2 bg-white border border-gray-200 rounded-full px-2 py-1.5">
          <input
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            placeholder='e.g. "pre-op letter for right hip replacement", "MBS 132 letter", "write to GP"'
            className="flex-1 px-3 py-2 text-sm border-0 focus:outline-none bg-transparent"
          />
          <button
            type="button"
            onClick={commandRecording ? stopCommandRecording : startCommandRecording}
            disabled={commandTranscribing}
            className={`w-9 h-9 rounded-full flex items-center justify-center text-white transition ${
              commandTranscribing ? "bg-amber-500 cursor-wait" : commandRecording ? "bg-rose-600" : "bg-slate-400 hover:bg-slate-500"
            }`}
          >
            {commandTranscribing ? (
              <svg className="animate-spin" width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
            ) : commandRecording ? (
              <span className="flex items-center gap-px h-4">{[0,150,300].map((d)=>(<span key={d} className="w-0.5 bg-white rounded-full" style={{animation:`wave-bar 0.7s ease-in-out infinite`,animationDelay:`${d}ms`,height:"3px"}}/>))}</span>
            ) : (
              <Mic size={15}/>
            )}
          </button>
          <button
            type="submit"
            disabled={generating}
            className={`rounded-full text-white text-sm font-medium px-5 py-2 whitespace-nowrap transition ${generating ? "bg-amber-500 cursor-wait" : "bg-brand-navy hover:opacity-90"}`}
          >
            {generating ? "Generating…" : "Generate"}
          </button>
        </form>

        {/* Generated letter — collapsible */}
        {letterText && (
          <div className="bg-white border border-gray-200 rounded-xl">
            <button
              type="button"
              onClick={() => setLetterOpen((o) => !o)}
              className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 transition rounded-t-xl"
            >
              <h3 className="font-semibold text-sm text-slate-700">
                {aiData?.procedure ? `Generated Letter — ${aiData.procedure}` : "Generated Letter"}
              </h3>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(letterText); }}
                  className="flex items-center gap-1 rounded-md border border-gray-300 text-xs font-medium px-2 py-1 hover:bg-gray-100 transition text-slate-600"
                >
                  <Copy size={11}/> Copy
                </button>
                {letterOpen ? <ChevronUp size={15} className="text-gray-400"/> : <ChevronDown size={15} className="text-gray-400"/>}
              </div>
            </button>

            {letterOpen && (
              <>
                <textarea
                  value={letterText}
                  onChange={(e) => setLetterText(e.target.value)}
                  rows={20}
                  className="w-full px-4 py-3 text-sm font-mono leading-relaxed border-t border-gray-100 focus:outline-none resize-none"
                />
                <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 bg-gray-50 rounded-b-xl gap-4">
                  <div className="flex items-center gap-3 text-sm text-slate-500">
                    <span className="font-medium text-slate-700">Status:</span>
                    <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-brand-teal inline-block"/>Draft</span>
                    <span className="text-gray-300">→</span>
                    <span className="text-gray-400">Ready to Review</span>
                    <span className="text-gray-300">→</span>
                    <span className="text-gray-400">Ready to Send</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleSaveDraft}
                    disabled={saving}
                    className="flex items-center gap-1.5 rounded-md bg-brand-teal text-white text-sm font-medium px-5 py-2 hover:opacity-90 disabled:opacity-50 transition"
                  >
                    <FileText size={14}/> {saving ? "Saving..." : "Save"}
                  </button>
                </div>
                {saveMessage && (
                  <div className={`px-4 py-2 text-sm border-t border-gray-100 ${saveMessage.startsWith("Error") ? "text-rose-600" : "text-emerald-700"}`}>
                    {saveMessage}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Saved letters */}
        <div className="bg-white border border-gray-200 rounded-xl">
          <button
            type="button"
            onClick={() => setShowSaved((s) => !s)}
            className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 transition rounded-xl"
          >
            <h3 className="font-semibold text-sm">
              Saved letters {letters.length > 0 && <span className="text-gray-400 font-normal">({letters.length})</span>}
            </h3>
            {showSaved ? <ChevronUp size={14} className="text-gray-400"/> : <ChevronDown size={14} className="text-gray-400"/>}
          </button>

          {showSaved && (
            <div className="px-4 pb-4 space-y-2 border-t border-gray-100 pt-3">
              {letters.length === 0 && <p className="text-sm text-gray-400">No letters saved yet.</p>}
              {letters.map((l) => (
                <div key={l.id} className="border border-gray-200 rounded-lg overflow-hidden text-sm">
                  {/* Letter header row */}
                  <div
                    className="flex items-center justify-between flex-wrap gap-2 px-3 py-2.5 cursor-pointer hover:bg-gray-50 transition"
                    onClick={() => setViewingLetter(viewingLetter?.id === l.id ? null : l)}
                  >
                    <div className="flex items-center gap-2 flex-wrap">
                      <strong>{l.letter_code}</strong>
                      {l.priority === "urgent" && (
                        <span className="rounded-full bg-rose-50 text-rose-600 border border-rose-200 text-xs font-medium px-2 py-0.5">Urgent</span>
                      )}
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        l.status === "sent" ? "bg-emerald-50 text-emerald-700" : l.status === "reviewed" ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-600"
                      }`}>
                        {l.status === "draft" ? "Draft" : l.status === "reviewed" ? "Ready to Review" : "Ready to Send"}
                      </span>
                      {l.recipient_name && <span className="text-xs text-gray-500">To: {l.recipient_name}</span>}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-400">{new Date(l.created_at).toLocaleString("en-AU")}</span>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); handleDeleteLetter(l.id, l.letter_code); }}
                        className="text-gray-300 hover:text-rose-500 transition p-0.5 rounded"
                        title="Delete letter"
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
                        </svg>
                      </button>
                      {viewingLetter?.id === l.id ? <ChevronUp size={13} className="text-gray-400"/> : <ChevronDown size={13} className="text-gray-400"/>}
                    </div>
                  </div>

                  {/* In-app letter editor/viewer */}
                  {viewingLetter?.id === l.id && (
                    <div className="border-t border-gray-100">
                      <textarea
                        value={editedContent[l.id] ?? l.content ?? ""}
                        onChange={(e) => setEditedContent((prev) => ({ ...prev, [l.id]: e.target.value }))}
                        rows={22}
                        className="w-full px-5 py-4 text-sm leading-relaxed font-mono border-0 focus:outline-none resize-none bg-white"
                        placeholder="Letter content..."
                      />

                      {/* Action bar */}
                      <div className="flex items-center gap-2 flex-wrap px-4 py-3 border-t border-gray-100 bg-gray-50 rounded-b-lg">
                        {/* Save edits — only show if content was changed */}
                        {editedContent[l.id] !== undefined && editedContent[l.id] !== l.content && (
                          <button
                            type="button"
                            disabled={savingContent === l.id}
                            onClick={() => handleSaveContent(l.id)}
                            className="rounded-md bg-brand-navy text-white text-xs font-medium px-3 py-1.5 hover:opacity-90 disabled:opacity-50 transition"
                          >
                            {savingContent === l.id ? "Saving..." : "Save edits"}
                          </button>
                        )}

                        {l.status === "draft" && (
                          <button
                            type="button"
                            disabled={busyLetterId === l.id}
                            onClick={() => handleStatusChange(l.id, "reviewed")}
                            className="rounded-md bg-amber-500 text-white text-xs font-medium px-3 py-1.5 hover:bg-amber-600 disabled:opacity-50 transition"
                          >
                            ✓ Ready to Review
                          </button>
                        )}
                        {l.status === "reviewed" && (
                          <>
                            <button
                              type="button"
                              disabled={busyLetterId === l.id}
                              onClick={() => handleStatusChange(l.id, "sent")}
                              className="rounded-md bg-emerald-600 text-white text-xs font-medium px-3 py-1.5 hover:bg-emerald-700 disabled:opacity-50 transition"
                            >
                              ✓ Ready to Send
                            </button>
                            <button
                              type="button"
                              onClick={() => handleOpenLetter(l.docx_path)}
                              className="flex items-center gap-1.5 rounded-md border border-gray-300 text-xs font-medium px-3 py-1.5 hover:bg-gray-100 transition text-slate-600"
                            >
                              <FileText size={12}/> Open Word doc
                            </button>
                          </>
                        )}
                        {l.status === "sent" && (
                          <>
                            <span className="rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-medium px-3 py-1.5">✓ Sent</span>
                            <button
                              type="button"
                              onClick={() => handleOpenLetter(l.docx_path)}
                              className="flex items-center gap-1.5 rounded-md border border-gray-300 text-xs font-medium px-3 py-1.5 hover:bg-gray-100 transition text-slate-600"
                            >
                              <FileText size={12}/> Open Word doc
                            </button>
                          </>
                        )}
                        <button
                          type="button"
                          onClick={() => handleAddNote(l.id)}
                          className="rounded-md border border-gray-300 text-xs font-medium px-3 py-1.5 hover:bg-gray-100 transition ml-auto"
                        >
                          Add note
                        </button>
                        {l.notes && <span className="text-xs text-gray-500 italic">{l.notes}</span>}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
