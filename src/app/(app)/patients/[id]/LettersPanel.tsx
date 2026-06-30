"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Mic, Square, Upload, Copy, Sparkles, BookMarked, ChevronDown, ChevronUp } from "lucide-react";
import { saveLetterDraft, updateLetterStatus, addLetterNote, getLetterSignedUrl } from "@/app/actions/letters";
import { saveVocabularyCorrection } from "@/app/actions/vocabulary";

type Letter = {
  id: string;
  letter_code: string;
  procedure_type: string | null;
  status: "draft" | "reviewed" | "sent";
  docx_path: string | null;
  notes: string | null;
  created_at: string;
};

export default function LettersPanel({
  patientId,
  letters,
}: {
  patientId: string;
  letters: Letter[];
}) {
  const router = useRouter();

  const [files, setFiles] = useState<File[]>([]);
  const [pastedText, setPastedText] = useState("");
  const [transcript, setTranscript] = useState("");
  const [docType, setDocType] = useState("general");
  const [command, setCommand] = useState("");
  const [letterText, setLetterText] = useState("");
  const [aiData, setAiData] = useState<any>(null);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [busyLetterId, setBusyLetterId] = useState("");
  const [showSaved, setShowSaved] = useState(false);

  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [rawTranscript, setRawTranscript] = useState("");
  const [originalCleanedTranscript, setOriginalCleanedTranscript] = useState("");
  const [dictationError, setDictationError] = useState("");

  // Teach / correction form
  const [showTeachForm, setShowTeachForm] = useState(false);
  const [teachWrong, setTeachWrong] = useState("");
  const [teachCorrect, setTeachCorrect] = useState("");
  const [teachCategory, setTeachCategory] = useState("medication");
  const [teachSaving, setTeachSaving] = useState(false);
  const [teachMessage, setTeachMessage] = useState("");
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<BlobPart[]>([]);

  const [commandRecording, setCommandRecording] = useState(false);
  const [commandTranscribing, setCommandTranscribing] = useState(false);
  const commandRecorderRef = useRef<MediaRecorder | null>(null);
  const commandChunksRef = useRef<BlobPart[]>([]);

  async function startCommandRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      commandChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) commandChunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        const audioBlob = new Blob(commandChunksRef.current, { type: recorder.mimeType || "audio/webm" });
        await handleCommandTranscribe(audioBlob);
      };

      commandRecorderRef.current = recorder;
      recorder.start();
      setCommandRecording(true);
    } catch (err: any) {
      alert(err.message || "Could not access microphone");
    }
  }

  function stopCommandRecording() {
    commandRecorderRef.current?.stop();
    setCommandRecording(false);
  }

  async function handleCommandTranscribe(audioBlob: Blob) {
    setCommandTranscribing(true);

    try {
      const formData = new FormData();
      formData.append("audio", audioBlob, "command.webm");

      const res = await fetch("/api/dictation/transcribe", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || "Transcription failed");

      setCommand(data.rawTranscript || "");
    } catch (err: any) {
      alert(err.message);
    } finally {
      setCommandTranscribing(false);
    }
  }

  async function startRecording() {
    setDictationError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      audioChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        const audioBlob = new Blob(audioChunksRef.current, { type: recorder.mimeType || "audio/webm" });
        await handleTranscribe(audioBlob);
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setRecording(true);
    } catch (err: any) {
      setDictationError(err.message || "Could not access microphone");
    }
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop();
    setRecording(false);
  }

  async function handleTranscribe(audioBlob: Blob) {
    setTranscribing(true);
    setRawTranscript("");
    setDictationError("");

    try {
      const formData = new FormData();
      formData.append("audio", audioBlob, "dictation.webm");

      const res = await fetch("/api/dictation/transcribe", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || "Transcription failed");

      setRawTranscript(data.rawTranscript || "");
      const cleaned = data.cleanedTranscript || "";
      setOriginalCleanedTranscript((prev) => (prev.trim() ? `${prev}\n\n${cleaned}` : cleaned));
      setTranscript((prev) => (prev.trim() ? `${prev.trim()}\n\n${cleaned}` : cleaned));
    } catch (err: any) {
      setDictationError(err.message);
    } finally {
      setTranscribing(false);
    }
  }

  async function handleGenerate() {
    if (files.length === 0 && !pastedText.trim() && !transcript.trim()) {
      alert("Please choose one or more files, paste clinical text, or add a transcript.");
      return;
    }

    const formData = new FormData();
    files.forEach((file) => formData.append("files", file));
    if (pastedText.trim()) formData.append("pastedText", pastedText);
    if (transcript.trim()) formData.append("transcript", transcript);
    formData.append("docType", docType);

    setGenerating(true);
    setLetterText("");
    setSaveMessage("");

    try {
      const res = await fetch(`/api/patients/${patientId}/letters/generate`, {
        method: "POST",
        body: formData,
      });
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
      alert("Type or speak an instruction, e.g. \"write to the GP\" or \"MBS item 132 letter\".");
      return;
    }

    if (files.length === 0 && !pastedText.trim() && !transcript.trim()) {
      alert("Please choose one or more files, paste clinical text, or add a transcript first.");
      return;
    }

    const formData = new FormData();
    files.forEach((file) => formData.append("files", file));
    if (pastedText.trim()) formData.append("pastedText", pastedText);
    if (transcript.trim()) formData.append("transcript", transcript);
    formData.append("docType", docType);
    formData.append("command", command);

    setGenerating(true);
    setLetterText("");
    setSaveMessage("");

    try {
      const res = await fetch(`/api/patients/${patientId}/letters/generate-command`, {
        method: "POST",
        body: formData,
      });
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

  async function handleSaveDraft() {
    if (!letterText) return;

    setSaving(true);
    setSaveMessage("");

    try {
      const result = await saveLetterDraft(patientId, letterText, aiData?.procedure || "");
      setSaveMessage(`Saved as ${result.letterCode}`);
      router.refresh();
    } catch (err: any) {
      setSaveMessage(`Error: ${err.message}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleOpenLetter(docxPath: string | null) {
    if (!docxPath) return;
    try {
      const url = await getLetterSignedUrl(docxPath);
      window.open(url, "_blank");
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

  async function handleCopyLetter() {
    if (!letterText) return;
    await navigator.clipboard.writeText(letterText);
  }

  async function handleTeachSave() {
    if (!teachWrong.trim() || !teachCorrect.trim()) return;
    setTeachSaving(true);
    setTeachMessage("");
    try {
      await saveVocabularyCorrection(teachWrong.trim(), teachCorrect.trim(), teachCategory);
      setTeachMessage(`Saved: "${teachWrong}" → "${teachCorrect}". Applied to future transcriptions.`);
      setTeachWrong("");
      setTeachCorrect("");
      setTimeout(() => {
        setShowTeachForm(false);
        setTeachMessage("");
      }, 2500);
    } catch (err: any) {
      setTeachMessage(`Error: ${err.message}`);
    } finally {
      setTeachSaving(false);
    }
  }

  const transcriptEdited = originalCleanedTranscript && transcript !== originalCleanedTranscript;

  const [workspaceOpen, setWorkspaceOpen] = useState(true);

  const [transcriptCopied, setTranscriptCopied] = useState(false);

  async function handleCopyTranscript() {
    if (!transcript) return;
    await navigator.clipboard.writeText(transcript);
    setTranscriptCopied(true);
    setTimeout(() => setTranscriptCopied(false), 2000);
  }

  return (
    <div className="space-y-4">
      {/* Top bar: dictation control + doc type + file upload */}
      <div className="flex flex-wrap items-center gap-3 bg-white border border-gray-200 rounded-xl px-4 py-3">
        <button
          type="button"
          onClick={recording ? stopRecording : startRecording}
          disabled={transcribing}
          className={`flex items-center gap-2 rounded-full text-white text-sm font-medium px-5 py-2 transition select-none ${
            transcribing
              ? "bg-amber-500 cursor-wait"
              : recording
              ? "bg-rose-600 hover:bg-rose-700"
              : "bg-slate-400 hover:bg-slate-500"
          }`}
        >
          {transcribing ? (
            <>
              <svg className="animate-spin" width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
              </svg>
              Processing…
            </>
          ) : recording ? (
            <>
              {/* Animated waveform bars */}
              <span className="flex items-center gap-px h-4">
                {[0, 120, 240, 360, 480].map((delay) => (
                  <span
                    key={delay}
                    className="w-0.5 bg-white rounded-full"
                    style={{ animation: `wave-bar 0.7s ease-in-out infinite`, animationDelay: `${delay}ms`, height: "3px" }}
                  />
                ))}
              </span>
              Stop recording
            </>
          ) : (
            <>
              <Mic size={15} /> Record
            </>
          )}
        </button>

        {dictationError && <span className="text-sm text-rose-600">{dictationError}</span>}

        <div className="flex-1" />

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
          <Upload size={13} /> Upload files
          <input
            type="file"
            multiple
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
          <Sparkles size={14} /> {generating ? "Generating..." : "Generate letter"}
        </button>
      </div>

      {files.length > 0 && (
        <ul className="text-xs text-gray-500 list-disc list-inside px-1">
          {files.map((f, i) => (
            <li key={i}>{f.name}</li>
          ))}
        </ul>
      )}

      {/* Workspace toggle bar */}
      <button
        type="button"
        onClick={() => setWorkspaceOpen((o) => !o)}
        className="w-full flex items-center justify-center gap-2 bg-white border border-gray-200 rounded-xl px-4 py-2 text-xs font-medium text-slate-500 hover:bg-gray-50 transition"
      >
        {workspaceOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        {workspaceOpen ? "Collapse transcript & notes" : "Expand transcript & notes"}
      </button>

      {/* Transcript / Notes two-column workspace */}
      {workspaceOpen && (
        <div className="grid md:grid-cols-[1.4fr_1fr] gap-4">
          {/* Transcript panel */}
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
                  title="Copy transcript"
                  className={`flex items-center gap-1 rounded-md border text-xs font-medium px-2 py-1 transition disabled:opacity-30 disabled:cursor-default ${
                    transcriptCopied
                      ? "border-emerald-500 text-emerald-600 bg-emerald-50"
                      : "border-gray-300 text-gray-500 hover:bg-gray-50"
                  }`}
                >
                  <Copy size={11} /> {transcriptCopied ? "Copied!" : "Copy"}
                </button>
                {transcriptEdited && (
                  <button
                    type="button"
                    onClick={() => { setShowTeachForm((s) => !s); setTeachMessage(""); }}
                    title="Teach the app a correction you made"
                    className="flex items-center gap-1 rounded-md border border-brand-teal text-brand-teal text-xs font-medium px-2 py-1 hover:bg-brand-teal/5 transition"
                  >
                    <BookMarked size={11} /> Teach
                  </button>
                )}
              </div>
            </div>

            {showTeachForm && (
              <div className="px-4 py-3 bg-slate-50 border-b border-gray-100 space-y-2">
                <p className="text-xs text-gray-500">Save a correction so the app auto-fixes it in future transcriptions.</p>
                <div className="flex gap-2 flex-wrap">
                  <input
                    value={teachWrong}
                    onChange={(e) => setTeachWrong(e.target.value)}
                    placeholder='Wrong word (e.g. "carbizide")'
                    className="flex-1 min-w-32 rounded border border-gray-300 px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-brand-teal"
                  />
                  <input
                    value={teachCorrect}
                    onChange={(e) => setTeachCorrect(e.target.value)}
                    placeholder='Correct word (e.g. "Karvezide")'
                    className="flex-1 min-w-32 rounded border border-gray-300 px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-brand-teal"
                  />
                  <select
                    value={teachCategory}
                    onChange={(e) => setTeachCategory(e.target.value)}
                    className="rounded border border-gray-300 px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-brand-teal"
                  >
                    <option value="medication">Medication</option>
                    <option value="institution">Hospital / institution</option>
                    <option value="person">Person name</option>
                    <option value="clinical">Clinical term</option>
                    <option value="general">General</option>
                  </select>
                  <button
                    type="button"
                    onClick={handleTeachSave}
                    disabled={teachSaving || !teachWrong.trim() || !teachCorrect.trim()}
                    className="rounded-md bg-brand-teal text-white text-xs font-medium px-3 py-1.5 hover:opacity-90 disabled:opacity-50 transition"
                  >
                    {teachSaving ? "Saving..." : "Save"}
                  </button>
                </div>
                {teachMessage && (
                  <p className={`text-xs ${teachMessage.startsWith("Error") ? "text-rose-600" : "text-emerald-700"}`}>{teachMessage}</p>
                )}
              </div>
            )}

            <textarea
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              rows={14}
              placeholder="Your live transcript will display here once you click Record. You can also paste a consultation transcript directly. This takes priority over documents for medication changes, patient-reported history, and the peri-operative plan."
              className="flex-1 w-full px-4 py-3 text-sm leading-relaxed border-0 focus:outline-none resize-none rounded-b-xl"
            />
          </div>

          {/* Notes / Documents panel */}
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
          placeholder='Specify type: "pre-op letter for right hip replacement", "MBS 132 letter", "write to GP", "patient instructions"'
          className="flex-1 px-3 py-2 text-sm border-0 focus:outline-none bg-transparent"
        />
        <button
          type="button"
          onClick={commandRecording ? stopCommandRecording : startCommandRecording}
          disabled={commandTranscribing}
          title={commandRecording ? "Stop recording" : "Speak your instruction"}
          className={`w-9 h-9 rounded-full flex items-center justify-center text-white transition ${
            commandTranscribing
              ? "bg-amber-500 cursor-wait"
              : commandRecording
              ? "bg-rose-600"
              : "bg-slate-400 hover:bg-slate-500"
          }`}
        >
          {commandTranscribing ? (
            <svg className="animate-spin" width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
              <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
            </svg>
          ) : commandRecording ? (
            <span className="flex items-center gap-px h-4">
              {[0, 150, 300].map((delay) => (
                <span
                  key={delay}
                  className="w-0.5 bg-white rounded-full"
                  style={{ animation: `wave-bar 0.7s ease-in-out infinite`, animationDelay: `${delay}ms`, height: "3px" }}
                />
              ))}
            </span>
          ) : (
            <Mic size={15} />
          )}
        </button>
        <button
          type="submit"
          disabled={generating}
          className={`rounded-full text-white text-sm font-medium px-5 py-2 whitespace-nowrap transition ${
            generating ? "bg-amber-500 cursor-wait" : "bg-brand-navy hover:opacity-90"
          }`}
        >
          {generating ? "Generating…" : "Generate"}
        </button>
      </form>

      {/* Output card */}
      {letterText && (
        <div className="bg-white border border-gray-200 rounded-xl">
          <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100">
            <h3 className="font-semibold text-sm text-slate-700">{aiData?.procedure ? `Letter — ${aiData.procedure}` : "Generated Document"}</h3>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleCopyLetter}
                className="flex items-center gap-1.5 rounded-md border border-gray-300 text-xs font-medium px-3 py-1 hover:bg-gray-50 transition text-slate-600"
              >
                <Copy size={12} /> Copy
              </button>
              <button
                type="button"
                onClick={handleSaveDraft}
                disabled={saving}
                className="rounded-md bg-brand-teal text-white text-xs font-medium px-3 py-1.5 hover:opacity-90 disabled:opacity-50 transition"
              >
                {saving ? "Saving..." : "Save draft"}
              </button>
            </div>
          </div>

          <textarea
            value={letterText}
            onChange={(e) => setLetterText(e.target.value)}
            rows={18}
            className="w-full px-4 py-3 text-sm font-mono leading-relaxed border-0 focus:outline-none resize-none rounded-b-xl"
          />

          {saveMessage && (
            <div className={`px-4 py-2 text-sm border-t border-gray-100 ${saveMessage.startsWith("Error") ? "text-rose-600" : "text-emerald-700"}`}>
              {saveMessage}
            </div>
          )}
        </div>
      )}

      {/* Saved letters, collapsible */}
      <div className="bg-white border border-gray-200 rounded-xl">
        <button
          type="button"
          onClick={() => setShowSaved((s) => !s)}
          className="w-full flex items-center justify-between px-4 py-3 text-left"
        >
          <h3 className="font-semibold text-sm">
            Saved letters {letters.length > 0 && <span className="text-gray-400 font-normal">({letters.length})</span>}
          </h3>
          <span className="text-gray-400 text-xs">{showSaved ? "Hide" : "Show"}</span>
        </button>

        {showSaved && (
          <div className="px-4 pb-4">
            {letters.length === 0 && <p className="text-sm text-gray-400">No letters saved yet.</p>}

            <ul className="space-y-2">
              {letters.map((l) => (
                <li key={l.id} className="border border-gray-200 rounded-md p-3 text-sm">
                  <div className="flex items-center justify-between">
                    <div>
                      <strong>{l.letter_code}</strong>
                      <span
                        className={`ml-2 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                          l.status === "sent"
                            ? "bg-emerald-50 text-emerald-700"
                            : l.status === "reviewed"
                            ? "bg-amber-50 text-amber-700"
                            : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {l.status}
                      </span>
                    </div>
                    <span className="text-xs text-gray-400">{new Date(l.created_at).toLocaleString("en-AU")}</span>
                  </div>

                  {l.procedure_type && <p className="text-gray-500 mt-1">{l.procedure_type}</p>}
                  {l.notes && <p className="text-gray-500 mt-1">Note: {l.notes}</p>}

                  <div className="flex gap-2 mt-2 flex-wrap">
                    <button
                      type="button"
                      onClick={() => handleOpenLetter(l.docx_path)}
                      className="rounded-md bg-brand-teal text-white text-xs font-medium px-2 py-1 hover:opacity-90"
                    >
                      Open letter
                    </button>
                    <button
                      type="button"
                      disabled={busyLetterId === l.id}
                      onClick={() => handleStatusChange(l.id, "reviewed")}
                      className="rounded-md bg-amber-50 text-amber-700 text-xs font-medium px-2 py-1 hover:bg-amber-100 transition"
                    >
                      Mark as reviewed
                    </button>
                    <button
                      type="button"
                      disabled={busyLetterId === l.id}
                      onClick={() => handleStatusChange(l.id, "sent")}
                      className="rounded-md bg-emerald-50 text-emerald-700 text-xs font-medium px-2 py-1 hover:bg-emerald-100 transition"
                    >
                      Mark as sent
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAddNote(l.id)}
                      className="rounded-md border border-gray-300 text-xs font-medium px-2 py-1 hover:bg-gray-50"
                    >
                      Add note
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
