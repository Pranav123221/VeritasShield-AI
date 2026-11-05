
import { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";
import { supabase } from "../lib/supabase";


type Source = {
  title?: string;
  url?: string;
  relationship?: string;
  evidence?: string;
  publisher?: string;
  relevance?: string;
  reliability?: string;
  reliability_reason?: string;
  limitations?: string;
};

type VerifyResult = {
  claim: string;
  verdict: string;
  assessment?: string;
  evidence_summary?: string;
  uncertainty?: string;
  sources?: Source[];
  model?: string;
};

type LiveEvent = {
  id: number;
  event: string;
  message: string;
  details?: Record<string, any>;
  timestamp: number;
};

type EventItem = {
  label: string;
  detail: string;
  time: string;
  event?: string;
};

type ImageClaimResult = {
  claim: string;
  visual_basis?: string;
  verdict: string;
  assessment?: string;
  evidence_summary?: string;
  uncertainty?: string;
  sources?: Source[];
  model?: string;
};

type ImageInvestigationResult = {
  status?: string;
  investigation_type?: string;
  filename?: string;
  visual_summary?: string;
  visible_text?: string[];
  claims?: ImageClaimResult[];
  limitations?: string[];
  model?: string;
};

type URLClaimResult = {
  claim: string;
  context?: string;
  verdict: string;
  assessment?: string;
  evidence_summary?: string;
  uncertainty?: string;
  sources?: Source[];
  model?: string;
};

type URLInvestigationResult = {
  status?: string;
  investigation_type?: string;
  submitted_url?: string;
  final_url?: string;
  page_title?: string;
  page_description?: string;
  page_summary?: string;
  claims?: URLClaimResult[];
  limitations?: string[];
  model?: string;
};

type AudioTurn = {
  turn_id?: string | number;
  start_ms?: number;
  end_ms?: number;
  speaker?: string;
  transcript?: string;
};

type AudioClaimResult = {
  claim: string;
  context?: string;
  transcription_uncertainty?: string;
  verdict: string;
  assessment?: string;
  evidence_summary?: string;
  uncertainty?: string;
  sources?: Source[];
  model?: string;
};

type AudioInvestigationResult = {
  status?: string;
  investigation_type?: string;
  transcript?: string;
  turns?: AudioTurn[];
  audio_duration_ms?: number;
  audio_info?: {
    duration_seconds?: number;
    sample_rate?: number;
    channels?: number;
    sample_width?: number;
  };
  page_summary?: string;
  claims?: AudioClaimResult[];
  limitations?: string[];
  transcription_model?: string;
  verification_model?: string;
  session_id?: string;
};
type HistoryItem = {
  id: string;
  type: string;
  status: string;
  verdict?: string | null;
  model?: string | null;
  created_at?: string | null;
  completed_at?: string | null;
  input_preview?: string | null;
};

type InvestigationDetail = {
  investigation: {
    id: string;
    type?: string;
    investigation_type?: string;
    status: string;
    input_text?: string | null;
    submitted_url?: string | null;
    verdict?: string | null;
    assessment?: string | null;
    evidence_summary?: string | null;
    uncertainty?: string | null;
    model?: string | null;
    result?: Record<string, any> | null;
    created_at?: string | null;
    completed_at?: string | null;
  };
  sources: Source[];
  events: Array<{
    event_type: string;
    message: string;
    details?: Record<string, any>;
    created_at?: string;
  }>;
  files: Array<{
    original_filename: string;
    content_type: string;
    size_bytes: number;
    sha256: string;
  }>;
};

type ReportType = "text" | "image" | "url" | "audio";

const API_URL = "http://127.0.0.1:8000/api/verify";
const HEALTH_URL = "http://127.0.0.1:8000/health";
const IMAGE_API_URL = "http://127.0.0.1:8000/api/investigate-image";
const URL_API_URL = "http://127.0.0.1:8000/api/investigate-url";
const AUDIO_API_URL = "http://127.0.0.1:8000/api/investigate-audio";
const EVENTS_API_URL = "http://127.0.0.1:8000/api/events";
const HISTORY_API_URL = "http://127.0.0.1:8000/api/investigations";

const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
const MAX_AUDIO_SIZE = 30 * 1024 * 1024;

const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

const LIVE_EVENT_TYPES = [
  "investigation_started",
  "web_search_started",
  "web_search_completed",
  "sources_validated",
  "verdict_generated",
  "image_analysis_started",
  "image_analysis_completed",
  "claims_extracted",
  "page_fetch_started",
  "page_fetch_completed",
  "page_fetched",
  "claim_extraction_started",
  "claim_extraction_completed",
  "claims_extracted_from_page",
  "claim_verification_started",
  "claim_verification_completed",
  "claim_verification_failed",
  "source_domain_discovered",
  "completed",
  "failed",
  "audio_investigation_started",
  "audio_transcription_started",
  "audio_transcription_completed",
  "audio_claim_extraction_started",
  "audio_claims_extracted",
  "audio_claim_verification_started",
  "audio_claim_verification_completed",
  "audio_claim_verification_failed",
  "audio_investigation_completed",
];

function verdictClass(value = "") {
  const v = value.toLowerCase();
  if (v.includes("support")) return "supported";
  if (v.includes("contradict")) return "contradicted";
  return "inconclusive";
}

function generateCaseId() {
  return `VS-${new Date()
    .toISOString()
    .replace(/[-:TZ.]/g, "")
    .slice(0, 14)}`;
}

function generateInvestigationId() {
  return crypto.randomUUID();
}

function formatEventTime(timestamp?: number) {
  return timestamp
    ? new Date(timestamp * 1000).toLocaleTimeString()
    : new Date().toLocaleTimeString();
}

function formatDate(value = new Date()) {
  return value.toLocaleString();
}

function formatDuration(milliseconds?: number) {
  if (milliseconds === undefined || milliseconds === null || milliseconds <= 0) {
    return "Unknown";
  }

  const totalSeconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

async function readApiResponse(response: Response) {
  const text = await response.text();

  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw new Error("The server returned an invalid response.");
  }
}

function safeText(value?: string | number | null) {
  return value === undefined || value === null || value === ""
    ? "Not provided"
    : String(value);
}

function App() {
  const [claim, setClaim] = useState("");
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [selectedSource, setSelectedSource] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState("");
  const [imageResult, setImageResult] =
    useState<ImageInvestigationResult | null>(null);
  const [imageLoading, setImageLoading] = useState(false);

  const [pageUrl, setPageUrl] = useState("");
  const [urlResult, setUrlResult] =
    useState<URLInvestigationResult | null>(null);
  const [urlLoading, setUrlLoading] = useState(false);

  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioResult, setAudioResult] =
    useState<AudioInvestigationResult | null>(null);
  const [audioLoading, setAudioLoading] = useState(false);

  const [error, setError] = useState("");
  const [events, setEvents] = useState<EventItem[]>([]);
  const [liveEvents, setLiveEvents] = useState<LiveEvent[]>([]);
  const [caseId, setCaseId] = useState("");
  const [investigationId, setInvestigationId] = useState("");
  const [historyItems, setHistoryItems] = useState<HistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [selectedHistoryId, setSelectedHistoryId] = useState("");
  const [savedDetail, setSavedDetail] =
  useState<InvestigationDetail | null>(null);
  const [caseStartedAt, setCaseStartedAt] = useState<Date | null>(null);

  const [apiStatus, setApiStatus] = useState<
    "checking" | "connected" | "disconnected"
  >("checking");

  const [liveConnection, setLiveConnection] = useState<
    "idle" | "connecting" | "connected" | "disconnected"
  >("idle");

  const [activeModel, setActiveModel] = useState("Awaiting model response");
  const [activeDomains, setActiveDomains] = useState<string[]>([]);
  const [activeStage, setActiveStage] = useState("Awaiting investigation");
  const [completedClaims, setCompletedClaims] = useState(0);
  const [totalClaims, setTotalClaims] = useState(0);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [reportType, setReportType] = useState<ReportType>("text");

  const eventSourceRef = useRef<AbortController | null>(null);
  const processedClaimEventsRef = useRef<Set<string>>(new Set());

  const anyLoading =
    loading || imageLoading || urlLoading || audioLoading;

  const activeReport = useMemo(() => {
    if (imageResult) return "image";
    if (urlResult) return "url";
    if (audioResult) return "audio";
    if (result) return "text";
    return null;
  }, [result, imageResult, urlResult, audioResult]);
  useEffect(() => {
  if (!showHistory) return;

  const timer = setTimeout(() => {
    const section = document.getElementById("history");

    if (section) {
      window.scrollTo({
        top: section.getBoundingClientRect().top + window.scrollY - 20,
        behavior: "smooth",
      });
    }
  }, 100);

  return () => clearTimeout(timer);
}, [showHistory]);

  // API HEALTH
  useEffect(() => {
    let active = true;

    async function checkHealth() {
      try {
        const response = await fetch(HEALTH_URL);
        const data = await response.json();

        if (active) {
          setApiStatus(
            response.ok && data.status === "ok"
              ? "connected"
              : "disconnected"
          );
        }
      } catch {
        if (active) setApiStatus("disconnected");
      }
    }

    checkHealth();
    const interval = window.setInterval(checkHealth, 15000);

    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, []);

 useEffect(() => {
  return () => {
    eventSourceRef.current?.abort();
  };
}, []);

  useEffect(() => {
    if (!imageFile) {
      setImagePreview("");
      return;
    }

    const objectUrl = URL.createObjectURL(imageFile);
    setImagePreview(objectUrl);

    return () => URL.revokeObjectURL(objectUrl);
  }, [imageFile]);

    useEffect(() => {
    loadHistory();
  }, []);

  // DERIVED DATA
  const allSources = useMemo(() => {
    const collected: Source[] = [];

    if (result?.sources) collected.push(...result.sources);

    imageResult?.claims?.forEach((item) => {
      if (item.sources) collected.push(...item.sources);
    });

    urlResult?.claims?.forEach((item) => {
      if (item.sources) collected.push(...item.sources);
    });

    audioResult?.claims?.forEach((item) => {
      if (item.sources) collected.push(...item.sources);
    });

    const seen = new Set<string>();

    return collected.filter((source) => {
      const key = source.url || source.title || JSON.stringify(source);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [result, imageResult, urlResult, audioResult]);

  const sources = allSources;

  const allClaims = useMemo(() => {
    const items: Array<{
      claim: string;
      verdict: string;
      sources?: Source[];
    }> = [];

    if (result) {
      items.push({
        claim: result.claim,
        verdict: result.verdict,
        sources: result.sources,
      });
    }

    imageResult?.claims?.forEach((item) => items.push(item));
    urlResult?.claims?.forEach((item) => items.push(item));
    audioResult?.claims?.forEach((item) => items.push(item));

    return items;
  }, [result, imageResult, urlResult, audioResult]);

  const verdictCounts = useMemo(
    () => ({
      supported: allClaims.filter((item) =>
        item.verdict.toLowerCase().includes("support")
      ).length,
      contradicted: allClaims.filter((item) =>
        item.verdict.toLowerCase().includes("contradict")
      ).length,
      inconclusive: allClaims.filter((item) =>
        item.verdict.toLowerCase().includes("inconclusive")
      ).length,
    }),
    [allClaims]
  );

  const reliabilityCounts = useMemo(
    () => ({
      high: sources.filter(
        (source) => source.reliability?.toLowerCase() === "high"
      ).length,
      moderate: sources.filter(
        (source) => source.reliability?.toLowerCase() === "moderate"
      ).length,
      limited: sources.filter(
        (source) => source.reliability?.toLowerCase() === "limited"
      ).length,
      unknown: sources.filter(
        (source) =>
          !["high", "moderate", "limited"].includes(
            source.reliability?.toLowerCase() || ""
          )
      ).length,
    }),
    [sources]
  );

  const verdict =
    result?.verdict ||
    (allClaims.length === 1 ? allClaims[0].verdict : "Awaiting analysis");

  const selected =
    selectedSource === null ? null : sources[selectedSource] ?? null;

  const graphNodes = useMemo(() => {
    const count = sources.length;
    if (!count) return [];

    const cx = 330;
    const cy = 225;
    const rx = count === 1 ? 0 : 205;
    const ry = count === 1 ? 0 : 145;

    return sources.map((source, index) => {
      const angle = (Math.PI * 2 * index) / count - Math.PI / 2;

      return {
        ...source,
        index,
        x: cx + Math.cos(angle) * rx,
        y: cy + Math.sin(angle) * ry,
      };
    });
  }, [sources]);

  // LIVE EVENT STREAM
  function closeLiveStream() {
    eventSourceRef.current?.abort();
    eventSourceRef.current = null;
  }

  function startLiveStream(runId: string) {
    closeLiveStream();

    processedClaimEventsRef.current = new Set();

    setLiveEvents([]);
    setDetailsOpen(false);
    setActiveDomains([]);
    setActiveModel("Waiting for provider response");
    setActiveStage("Connecting to investigation pipeline");
    setCompletedClaims(0);
    setTotalClaims(0);
    setLiveConnection("connecting");
    let investigationFinished = false;

    const controller = new AbortController();
eventSourceRef.current = controller;

async function connectStream() {
  try {
    const {
      data: { session },

      error,
    } = await supabase.auth.getSession();

    if (error || !session?.access_token) {
      throw new Error("Authentication session unavailable.");
    }

    const response = await fetch(
      `${EVENTS_API_URL}/${encodeURIComponent(runId)}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          Accept: "text/event-stream",
        },
        signal: controller.signal,
      }
    );

    if (!response.ok) {
      throw new Error(`Live stream failed: HTTP ${response.status}`);
    }

    if (!response.body) {
      throw new Error("Live stream response body unavailable.");
    }

    setLiveConnection("connected");
    setActiveStage("Live event stream connected");

    const reader = response.body.getReader();

    const decoder = new TextDecoder();
    let buffer = "";

    while (!controller.signal.aborted) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      buffer = buffer.replace(/\r\n/g, "\n");

      let boundary: number;

      while ((boundary = buffer.indexOf("\n\n")) !== -1) {
        const frame = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);

        let eventName = "message";
        const dataLines: string[] = [];

        for (const line of frame.split("\n")) {
          if (line.startsWith("event:")) {
            eventName = line.slice(6).trim();
          } else if (line.startsWith("data:")) {
            dataLines.push(line.slice(5).trimStart());
          }
        }

        if (
          dataLines.length > 0 &&
          LIVE_EVENT_TYPES.includes(eventName)
        ) {
          handleLiveEvent(
            new MessageEvent(eventName, {
              data: dataLines.join("\n"),
            })
          );
        }
      }
    }

  if (!controller.signal.aborted && !investigationFinished) {
  setLiveConnection("disconnected");
}

  } catch (err) {
    if (controller.signal.aborted) return;

    console.error("Live stream error:", err);
    setLiveConnection("disconnected");
    setActiveStage("Live stream connection failed");
  }
}

void connectStream();
    function handleLiveEvent(event: MessageEvent) {
      try {
        const payload = JSON.parse(event.data) as LiveEvent;

        const eventKey =
          payload.id !== undefined && payload.id !== null
            ? `${runId}:${payload.id}`
            : `${runId}:${payload.event}:${payload.timestamp}:${payload.message}`;

        setLiveEvents((previous) => {
          if (previous.some((item) => {
            const itemKey =
              item.id !== undefined && item.id !== null
                ? `${runId}:${item.id}`
                : `${runId}:${item.event}:${item.timestamp}:${item.message}`;
            return itemKey === eventKey;
          })) {
            return previous;
          }

          return [...previous, payload].slice(-200);
        });

        const details = payload.details || {};
        setActiveStage(payload.message || payload.event);

        if (details.model) {
          setActiveModel(String(details.model));
        }

        if (details.domain) {
          setActiveDomains((previous) =>
            previous.includes(String(details.domain))
              ? previous
              : [...previous, String(details.domain)]
          );
        }

        if (Array.isArray(details.domains)) {
          setActiveDomains((previous) => [
            ...new Set([...previous, ...details.domains.map(String)]),
          ]);
        }

        if (typeof details.total_claims === "number") {
          setTotalClaims(details.total_claims);
        }

        // Only completed or failed verification events count as completed work.
        const isVerificationFinished =
          payload.event === "claim_verification_completed" ||
          payload.event === "claim_verification_failed" ||
          payload.event === "audio_claim_verification_completed" ||
          payload.event === "audio_claim_verification_failed";

        if (isVerificationFinished && !processedClaimEventsRef.current.has(eventKey)) {
          processedClaimEventsRef.current.add(eventKey);

          setCompletedClaims((previous) => {
            const next = previous + 1;
            return totalClaims > 0 ? Math.min(next, totalClaims) : next;
          });
        }

        if (
  payload.event === "completed" ||
  payload.event === "audio_investigation_completed"
) {
  investigationFinished = true;
  setActiveStage("Investigation completed");
}

        if (
          payload.event === "failed" ||
          payload.event === "audio_claim_verification_failed"
        ) {
          setActiveStage(payload.message || "Investigation failed");
        }

        setEvents((previous) => {
          if (previous.some((item) => item.event === payload.event &&
            item.time === formatEventTime(payload.timestamp) &&
            item.detail === payload.message)) {
            return previous;
          }

          return [
            ...previous,
            {
              label: payload.event.replaceAll("_", " ").toUpperCase(),
              detail: payload.message,
              time: formatEventTime(payload.timestamp),
              event: payload.event,
            },
          ];
        });
      } catch {
        // Ignore malformed event payloads.
      }
    }


  }

  function startCase(label: string, detail: string): string {
    const submittedAt = new Date();
    const generatedCaseId = generateCaseId();
    const runId = generateInvestigationId();

    setCaseId(generatedCaseId);
    setInvestigationId(runId);
    setCaseStartedAt(submittedAt);

    setEvents([
      {
        label,
        detail,
        time: submittedAt.toLocaleTimeString(),
      },
    ]);

    startLiveStream(runId);
    return runId;
  }

  function addEvent(label: string, detail: string) {
    setEvents((previous) => [
      ...previous,
      {
        label,
        detail,
        time: new Date().toLocaleTimeString(),
      },
    ]);
  }

  // TEXT INVESTIGATION
  async function investigate() {
    if (!claim.trim() || anyLoading) return;

    setLoading(true);
    setError("");
    setResult(null);
    setImageResult(null);
    setUrlResult(null);
    setAudioResult(null);
    setSelectedSource(null);

    const runId = startCase(
      "Investigation request submitted",
      "Claim sent to the verification backend."
    );

    try {
      const response = await fetch(API_URL, {
        method: "POST",
        headers: {
  "Content-Type": "application/json",
  "X-Investigation-ID": runId,
  Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
},
        body: JSON.stringify({ claim: claim.trim() }),
      });

      const data = await readApiResponse(response);

      if (!response.ok) {
        throw new Error(
          data.detail || data.message || "The investigation request failed."
        );
      }

      setResult(data);
      setReportType("text");
      setApiStatus("connected");
      setActiveModel(data.model || "Model not reported");

      addEvent(
        "Investigation response received",
        `${data.sources?.length ?? 0} source record(s) returned by the provider.`
      );
    } catch (err) {
      setApiStatus("disconnected");
      setError(
        err instanceof Error
          ? err.message
          : "Unable to connect to the investigation server."
      );
    } finally {
      setLoading(false);
    }
  }

  // IMAGE INVESTIGATION
  function handleImageSelection(file: File | null) {
    setError("");
    setImageResult(null);

    if (!file) {
      setImageFile(null);
      return;
    }

    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      setImageFile(null);
      setError("Unsupported image format. Choose PNG, JPG, JPEG or WEBP.");
      return;
    }

    if (file.size > MAX_IMAGE_SIZE) {
      setImageFile(null);
      setError("Image size must not exceed 10 MB.");
      return;
    }

    setImageFile(file);
  }

  async function investigateImage() {
    if (!imageFile || anyLoading) return;

    setImageLoading(true);
    setError("");
    setImageResult(null);
    setResult(null);
    setUrlResult(null);
    setAudioResult(null);
    setSelectedSource(null);

    const runId = startCase(
      "Image investigation submitted",
      `${imageFile.name} sent for visual analysis and claim verification.`
    );

    try {
      const formData = new FormData();
      formData.append("file", imageFile);

      const response = await fetch(IMAGE_API_URL, {
        method: "POST",
        headers: {
    "X-Investigation-ID": runId,
    Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
  },
        body: formData,
      });

      const data = await readApiResponse(response);

      if (!response.ok) {
        throw new Error(
          data.detail || data.message || "The image investigation request failed."
        );
      }

      setImageResult(data);
      setReportType("image");
      setApiStatus("connected");
      setActiveModel(data.model || "Model not reported");

      addEvent(
        "Image investigation completed",
        `Visual analysis returned with ${data.claims?.length ?? 0} claim(s).`
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to complete image investigation."
      );
    } finally {
      setImageLoading(false);
    }
  }

  // URL INVESTIGATION
  async function investigateURL() {
    if (!pageUrl.trim() || anyLoading) return;

    let parsedUrl: URL;

    try {
      parsedUrl = new URL(pageUrl.trim());

      if (!["http:", "https:"].includes(parsedUrl.protocol)) {
        throw new Error("Only HTTP and HTTPS URLs are supported.");
      }
    } catch (err) {
      setError(
        err instanceof Error && err.message.includes("Only HTTP")
          ? err.message
          : "Enter a valid webpage URL, including https://"
      );
      return;
    }

    setUrlLoading(true);
    setError("");
    setUrlResult(null);
    setResult(null);
    setImageResult(null);
    setAudioResult(null);
    setSelectedSource(null);

    const runId = startCase(
      "URL investigation submitted",
      `${parsedUrl.hostname} submitted for webpage analysis.`
    );

    try {
      const response = await fetch(URL_API_URL, {
        method: "POST",
        headers: {
  "Content-Type": "application/json",
  "X-Investigation-ID": runId,
  Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
},
        body: JSON.stringify({ url: parsedUrl.toString() }),
      });

      const data = await readApiResponse(response);

      if (!response.ok) {
        throw new Error(
          data.detail || data.message || "The URL investigation request failed."
        );
      }

      setUrlResult(data);
      setReportType("url");
      setApiStatus("connected");
      setActiveModel(data.model || "Model not reported");

      addEvent(
        "URL investigation completed",
        `Webpage analysis returned with ${data.claims?.length ?? 0} claim(s).`
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to complete URL investigation."
      );
    } finally {
      setUrlLoading(false);
    }
  }

  // AUDIO INVESTIGATION
  function handleAudioSelection(file: File | null) {
    setError("");
    setAudioResult(null);

    if (!file) {
      setAudioFile(null);
      return;
    }

    const isWav =
      file.name.toLowerCase().endsWith(".wav") ||
      ["audio/wav", "audio/x-wav", "audio/wave"].includes(file.type);

    if (!isWav) {
      setAudioFile(null);
      setError("Unsupported audio format. Please select a WAV file.");
      return;
    }

    if (file.size > MAX_AUDIO_SIZE) {
      setAudioFile(null);
      setError("Audio file size must not exceed 30 MB.");
      return;
    }

    if (file.size === 0) {
      setAudioFile(null);
      setError("The selected audio file is empty.");
      return;
    }

    setAudioFile(file);
  }

  async function investigateAudio() {
    if (!audioFile || anyLoading) return;

    setAudioLoading(true);
    setError("");
    setAudioResult(null);
    setResult(null);
    setImageResult(null);
    setUrlResult(null);
    setSelectedSource(null);

    const runId = startCase(
      "Audio investigation submitted",
      `${audioFile.name} submitted for transcription and claim verification.`
    );

    try {
      const formData = new FormData();
      formData.append("file", audioFile);

      const response = await fetch(AUDIO_API_URL, {
  method: "POST",
  headers: {
    "X-Investigation-ID": runId,
    Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
  },
  body: formData,
});

      const data = await readApiResponse(response);

      if (!response.ok) {
        throw new Error(
          data.detail || data.message || "The audio investigation request failed."
        );
      }

      setAudioResult(data);
      setReportType("audio");
      setApiStatus("connected");
      setActiveModel(
        data.verification_model || data.transcription_model || "Model not reported"
      );

      addEvent(
        "Audio investigation completed",
        `Transcription returned with ${data.claims?.length ?? 0} claim(s).`
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to complete audio investigation."
      );
    } finally {
      setAudioLoading(false);
    }
  }
    // HISTORY API
  async function loadHistory() {
  setHistoryLoading(true);
  setHistoryError("");

  try {
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError || !session?.access_token) {
      throw new Error("Please sign in again to view your history.");
    }

    const response = await fetch(
      `${HISTORY_API_URL}?limit=50&offset=0`,
      {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      }
    );

    const data = await readApiResponse(response);

    if (!response.ok) {
      throw new Error(data.detail || "Unable to load investigation history.");
    }

    setHistoryItems(data.investigations || []);
  } catch (err) {
    setHistoryError(
      err instanceof Error ? err.message : "Unable to load history."
    );
  } finally {
    setHistoryLoading(false);
  }
}

  // SAVED INVESTIGATION DETAIL
  async function loadInvestigationDetail(id: string) {
  setHistoryError("");
  setSavedDetail(null);
  setSelectedHistoryId(id);

  try {
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError || !session?.access_token) {
      throw new Error("Please sign in again to view investigation details.");
    }

    const response = await fetch(`${HISTORY_API_URL}/${id}`, {
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    });

    const data = await readApiResponse(response);

    if (!response.ok) {
      throw new Error(data.detail || "Unable to load investigation details.");
    }

    setSavedDetail(data);
  } catch (err) {
    setHistoryError(
      err instanceof Error ? err.message : "Unable to load investigation."
    );
  }
}

  // PDF REPORT
  function downloadPDF() {
    if (!activeReport) {
      setError("Complete an investigation before generating a PDF report.");
      return;
    }

    setReportType(activeReport);
    window.setTimeout(() => {
      window.print();
    }, 150);
  }

  // RESET
  function clearWorkspace() {
    closeLiveStream();

    processedClaimEventsRef.current = new Set();

    setClaim("");
    setResult(null);

    setImageFile(null);
    setImageResult(null);

    setPageUrl("");
    setUrlResult(null);

    setAudioFile(null);
    setAudioResult(null);

    setSelectedSource(null);
    setError("");
    setEvents([]);
    setLiveEvents([]);
    setCaseId("");
    setInvestigationId("");
    setCaseStartedAt(null);

    setActiveDomains([]);
    setActiveModel("Awaiting model response");
    setActiveStage("Awaiting investigation");
    setCompletedClaims(0);
    setTotalClaims(0);
    setLiveConnection("idle");
    setDetailsOpen(false);
  }

  function scrollTo(id: string) {
    document.getElementById(id)?.scrollIntoView({
      behavior: "smooth",
    });
  }

  const reportTitle = {
    text: "Text Investigation Report",
    image: "Image Investigation Report",
    url: "URL Investigation Report",
    audio: "Audio Investigation Report",
  }[reportType];

  // REPORT CONTENT SHARED BY PDF AND ON-SCREEN VIEW
  function renderReportSources(sourceList?: Source[]) {
    if (!sourceList?.length) {
      return <p>No validated source records were returned.</p>;
    }

    return (
      <div className="pdf-source-list">
        {sourceList.map((source, index) => (
          <article className="pdf-source" key={`${source.url}-${index}`}>
            <h4>{source.title || `Source ${index + 1}`}</h4>
            {source.url && (
              <p className="pdf-url">
                <a href={source.url}>{source.url}</a>
              </p>
            )}
            <p><strong>Publisher:</strong> {safeText(source.publisher)}</p>
            <p><strong>Relationship:</strong> {safeText(source.relationship)}</p>
            <p><strong>Reliability:</strong> {safeText(source.reliability)}</p>
            <p><strong>Reliability basis:</strong> {safeText(source.reliability_reason)}</p>
            <p><strong>Relevance:</strong> {safeText(source.relevance)}</p>
            <p><strong>Evidence:</strong> {safeText(source.evidence)}</p>
            <p><strong>Limitations:</strong> {safeText(source.limitations)}</p>
          </article>
        ))}
      </div>
    );
  }

  function renderPDFClaims(
    claims: Array<{
      claim: string;
      verdict: string;
      assessment?: string;
      evidence_summary?: string;
      uncertainty?: string;
      sources?: Source[];
      context?: string;
      visual_basis?: string;
      transcription_uncertainty?: string;
    }> = []
  ) {
    if (!claims.length) {
      return <p>No verifiable factual claims were extracted.</p>;
    }

    return (
      <div className="pdf-claims">
        {claims.map((item, index) => (
          <article className="pdf-claim" key={`${item.claim}-${index}`}>
            <div className="pdf-claim-heading">
              <h3>Claim {String(index + 1).padStart(2, "0")}</h3>
              <strong>{safeText(item.verdict).toUpperCase()}</strong>
            </div>
            <p className="pdf-claim-text">{item.claim}</p>
            {item.context && (
              <p><strong>Context:</strong> {item.context}</p>
            )}
            {item.visual_basis && (
              <p><strong>Visual basis:</strong> {item.visual_basis}</p>
            )}
            <p><strong>Assessment:</strong> {safeText(item.assessment)}</p>
            <p><strong>Evidence summary:</strong> {safeText(item.evidence_summary)}</p>
            {item.transcription_uncertainty && (
              <p><strong>Transcription uncertainty:</strong> {item.transcription_uncertainty}</p>
            )}
            <p><strong>Uncertainty:</strong> {safeText(item.uncertainty)}</p>
            <h4>Evidence sources</h4>
            {renderReportSources(item.sources)}
          </article>
        ))}
      </div>
    );
  }

  function renderPDFReportBody() {
    if (reportType === "text" && result) {
      return (
        <>
          <section className="pdf-section">
            <h2>Primary claim</h2>
            <p className="pdf-primary-claim">{result.claim}</p>
            <p><strong>Verdict:</strong> {safeText(result.verdict)}</p>
            <p><strong>Model:</strong> {safeText(result.model)}</p>
          </section>
          <section className="pdf-section">
            <h2>Assessment and uncertainty</h2>
            <p><strong>Assessment:</strong> {safeText(result.assessment)}</p>
            <p><strong>Evidence summary:</strong> {safeText(result.evidence_summary)}</p>
            <p><strong>Uncertainty:</strong> {safeText(result.uncertainty)}</p>
          </section>
          <section className="pdf-section">
            <h2>Retrieved evidence sources</h2>
            {renderReportSources(result.sources)}
          </section>
        </>
      );
    }

    if (reportType === "image" && imageResult) {
      return (
        <>
          <section className="pdf-section">
            <h2>Image metadata</h2>
            <p><strong>Filename:</strong> {safeText(imageResult.filename || imageFile?.name)}</p>
            <p><strong>Investigation type:</strong> {safeText(imageResult.investigation_type)}</p>
            <p><strong>Model:</strong> {safeText(imageResult.model)}</p>
            <p><strong>Visual summary:</strong> {safeText(imageResult.visual_summary)}</p>
          </section>
          <section className="pdf-section">
            <h2>Visible text extracted</h2>
            {imageResult.visible_text?.length ? (
              <ul>{imageResult.visible_text.map((line, i) => <li key={i}>{line}</li>)}</ul>
            ) : <p>No visible text was extracted.</p>}
          </section>
          <section className="pdf-section">
            <h2>Claim verification</h2>
            {renderPDFClaims(imageResult.claims || [])}
          </section>
          <section className="pdf-section">
            <h2>Investigation limitations</h2>
            {imageResult.limitations?.length ? (
              <ul>{imageResult.limitations.map((item, i) => <li key={i}>{item}</li>)}</ul>
            ) : <p>No limitations were reported by the provider.</p>}
          </section>
        </>
      );
    }

    if (reportType === "url" && urlResult) {
      return (
        <>
          <section className="pdf-section">
            <h2>Webpage metadata</h2>
            <p><strong>Page title:</strong> {safeText(urlResult.page_title)}</p>
            <p><strong>Submitted URL:</strong> {safeText(urlResult.submitted_url)}</p>
            <p><strong>Final URL:</strong> {safeText(urlResult.final_url)}</p>
            <p><strong>Page description:</strong> {safeText(urlResult.page_description)}</p>
            <p><strong>Page summary:</strong> {safeText(urlResult.page_summary)}</p>
            <p><strong>Investigation type:</strong> {safeText(urlResult.investigation_type)}</p>
            <p><strong>Model:</strong> {safeText(urlResult.model)}</p>
          </section>
          <section className="pdf-section">
            <h2>Claim verification</h2>
            {renderPDFClaims(urlResult.claims || [])}
          </section>
          <section className="pdf-section">
            <h2>Investigation limitations</h2>
            {urlResult.limitations?.length ? (
              <ul>{urlResult.limitations.map((item, i) => <li key={i}>{item}</li>)}</ul>
            ) : <p>No limitations were reported by the provider.</p>}
          </section>
        </>
      );
    }

    if (reportType === "audio" && audioResult) {
      return (
        <>
          <section className="pdf-section">
            <h2>Audio metadata</h2>
            <p><strong>Filename:</strong> {safeText(audioFile?.name)}</p>
            <p><strong>Duration:</strong> {formatDuration(audioResult.audio_duration_ms)}</p>
            <p><strong>Sample rate:</strong> {safeText(audioResult.audio_info?.sample_rate)} Hz</p>
            <p><strong>Channels:</strong> {safeText(audioResult.audio_info?.channels)}</p>
            <p><strong>Sample width:</strong> {safeText(audioResult.audio_info?.sample_width)}</p>
            <p><strong>Transcription model:</strong> {safeText(audioResult.transcription_model)}</p>
            <p><strong>Verification model:</strong> {safeText(audioResult.verification_model)}</p>
            <p><strong>Session ID:</strong> {safeText(audioResult.session_id)}</p>
          </section>
          <section className="pdf-section">
            <h2>Transcript summary</h2>
            <p>{safeText(audioResult.page_summary)}</p>
          </section>
          <section className="pdf-section">
            <h2>Full transcript</h2>
            <p className="pdf-transcript">{safeText(audioResult.transcript)}</p>
          </section>
          <section className="pdf-section">
            <h2>Speaker turns</h2>
            {audioResult.turns?.length ? (
              <div className="pdf-turns">
                {audioResult.turns.map((turn, index) => (
                  <p key={index}>
                    <strong>{safeText(turn.speaker)}</strong>
                    {" • "}
                    {formatDuration(turn.start_ms)} – {formatDuration(turn.end_ms)}
                    {" • "}
                    {safeText(turn.transcript)}
                  </p>
                ))}
              </div>
            ) : <p>No speaker turns were returned.</p>}
          </section>
          <section className="pdf-section">
            <h2>Claim verification</h2>
            {renderPDFClaims(audioResult.claims || [])}
          </section>
          <section className="pdf-section">
            <h2>Investigation limitations</h2>
            {audioResult.limitations?.length ? (
              <ul>{audioResult.limitations.map((item, i) => <li key={i}>{item}</li>)}</ul>
            ) : <p>No limitations were reported by the provider.</p>}
            <p>
              This report evaluates claims extracted from the recognized transcript
              against external evidence. Speech recognition can introduce errors.
              Speaker diarization labels are not identity verification. This pipeline
              does not determine whether a voice is cloned, synthetic or authentic.
            </p>
          </section>
        </>
      );
    }

    return <p>No completed investigation report is available.</p>;
  }

  return (
    <div className="workstation">
      <style>{`
        .live-monitor-compact {
          padding: 12px;
          border: 1px solid rgba(120,160,170,.18);
          border-radius: 8px;
          background: rgba(15,29,37,.55);
        }
        .live-monitor-compact .live-monitor-item {
          margin-top: 12px;
        }
        .live-monitor-compact .live-monitor-item strong {
          display: block;
          overflow-wrap: anywhere;
        }
        .live-progress-track {
          height: 5px;
          width: 100%;
          overflow: hidden;
          margin-top: 8px;
          border-radius: 10px;
          background: rgba(255,255,255,.1);
        }
        .live-progress-fill {
          height: 100%;
          background: #53c6aa;
          transition: width .25s ease;
        }
        .live-details-button {
          width: 100%;
          margin-top: 13px;
          padding: 9px 10px;
          cursor: pointer;
          border: 1px solid rgba(100,190,180,.35);
          border-radius: 5px;
          color: #8fe0cf;
          background: rgba(70,160,145,.08);
          font-size: 10px;
          font-weight: 700;
          letter-spacing: .08em;
        }
        .live-details-panel {
          margin-top: 10px;
          border: 1px solid rgba(120,160,170,.18);
          border-radius: 6px;
          overflow: hidden;
        }
        .live-details-heading {
          padding: 10px;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: .08em;
          border-bottom: 1px solid rgba(120,160,170,.15);
        }
        .live-details-list {
          max-height: 290px;
          overflow-y: auto;
          overscroll-behavior: contain;
          padding: 8px;
        }
        .live-detail-event {
          padding: 9px 5px;
          border-bottom: 1px solid rgba(120,160,170,.12);
        }
        .live-detail-event:last-child { border-bottom: 0; }
        .live-detail-event strong {
          display: block;
          font-size: 9px;
          overflow-wrap: anywhere;
        }
        .live-detail-event p {
          margin: 4px 0;
          font-size: 10px;
          line-height: 1.5;
          overflow-wrap: anywhere;
        }
        .live-detail-event small {
          font-size: 9px;
          opacity: .6;
        }
        .pdf-download-button {
          border: 1px solid rgba(91,190,164,.5);
          color: #8ce0c9;
          background: rgba(45,130,110,.12);
          border-radius: 5px;
          padding: 10px 14px;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: .07em;
          cursor: pointer;
        }
        .pdf-report-root { display: none; }
        .pdf-report-root a { color: #135e91; overflow-wrap: anywhere; }
        .pdf-report-root p, .pdf-report-root li {
          line-height: 1.55;
          overflow-wrap: anywhere;
        }
        .pdf-report-header {
          border-bottom: 2px solid #18333b;
          padding-bottom: 16px;
          margin-bottom: 20px;
        }
        .pdf-report-header h1 {
          font-size: 25px;
          margin: 8px 0;
          color: #142c35;
        }
        .pdf-report-brand {
          font-size: 11px;
          letter-spacing: .16em;
          font-weight: 800;
          color: #217e73;
        }
        .pdf-report-subtitle {
          font-size: 11px;
          color: #5d6a70;
        }
        .pdf-meta-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px 20px;
          margin: 18px 0;
          font-size: 11px;
        }
        .pdf-section {
          margin: 20px 0;
          break-inside: auto;
        }
        .pdf-section h2 {
          font-size: 15px;
          color: #183943;
          border-bottom: 1px solid #cbd6d9;
          padding-bottom: 7px;
        }
        .pdf-claim {
          padding: 12px 0;
          border-bottom: 1px solid #dce3e5;
          break-inside: avoid;
        }
        .pdf-claim-heading {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 10px;
        }
        .pdf-claim-heading h3 { font-size: 13px; }
        .pdf-claim-heading strong {
          font-size: 10px;
          border: 1px solid #9aabad;
          padding: 4px 7px;
        }
        .pdf-claim-text { font-weight: 700; }
        .pdf-source {
          margin: 10px 0;
          padding: 10px;
          border: 1px solid #dce3e5;
          break-inside: avoid;
        }
        .pdf-source h4 { margin: 0 0 7px; }
        .pdf-source p { font-size: 10px; margin: 4px 0; }
        .pdf-url { overflow-wrap: anywhere; }
        .pdf-primary-claim { font-size: 15px; font-weight: 700; }
        .pdf-transcript { white-space: pre-wrap; }
        .pdf-report-footer {
          border-top: 1px solid #cbd6d9;
          margin-top: 30px;
          padding-top: 10px;
          font-size: 9px;
          color: #66757b;
        }
        @media print {
          @page { size: A4; margin: 16mm; }
          body { background: white !important; color: #17262d !important; }
          body * { visibility: hidden !important; }
          .pdf-report-root, .pdf-report-root * {
            visibility: visible !important;
          }
          .pdf-report-root {
            display: block !important;
            position: absolute !important;
            inset: 0 auto auto 0 !important;
            width: 100% !important;
            color: #17262d !important;
            background: white !important;
            font-family: Arial, sans-serif !important;
            font-size: 11px !important;
          }
          .pdf-report-root a { color: #135e91 !important; }
          .pdf-section, .pdf-claim, .pdf-source {
            break-inside: avoid-page;
          }
          .pdf-report-root h1, .pdf-report-root h2, .pdf-report-root h3 {
            break-after: avoid;
          }
        }
      `}</style>

      <header className="topbar">
        <a className="brand" href="/">
          <div className="brand-symbol">
            <svg viewBox="0 0 32 32" aria-hidden="true">
              <path d="M16 2 27 7v8c0 7-4.7 12-11 15C9.7 27 5 22 5 15V7z" />
              <path d="m11 16 3.2 3.2L21 12" />
            </svg>
          </div>
          <div>
            <div className="brand-title">VERITAS<span>SHIELD</span></div>
            <div className="brand-subtitle">DIGITAL FORENSICS PLATFORM</div>
          </div>
        </a>

        <div className="topbar-meta">
          <span className="environment">INVESTIGATION ENVIRONMENT</span>
          <span className="online-indicator" aria-live="polite">
            <i />
            {apiStatus === "checking"
              ? "CHECKING API"
              : apiStatus === "connected"
                ? "API CONNECTED"
                : "API DISCONNECTED"}
          </span>
          <span className="top-version">BUILD 02.0</span>
        </div>
      </header>

      <div className="workspace-layout">
        <aside className="sidebar">
          <div className="side-section-label">WORKSPACE</div>

          <button className="side-link active" onClick={() => scrollTo("investigation")}>
            <span className="side-icon">⌕</span>
            New investigation
          </button>

         <button
  className="side-link"
  onClick={() => {
    setShowHistory(true);
    loadHistory();
  }}
>
  <span className="side-icon">◴</span>
  Investigation history
</button>


          <button className="side-link" onClick={() => scrollTo("network")}>
            <span className="side-icon">⌘</span>
            Evidence network
          </button>
          <button className="side-link" onClick={() => scrollTo("timeline")}>
            <span className="side-icon">◷</span>
            Event timeline
          </button>
          <button className="side-link" onClick={() => scrollTo("register")}>
            <span className="side-icon">▤</span>
            Source register
          </button>

          <div className="sidebar-divider" />
          <div className="side-section-label">LIVE INTELLIGENCE MONITOR</div>

          <div className="live-monitor live-monitor-compact">
            <div className="live-monitor-status">
              <span className={`live-status-dot ${liveConnection}`} />
              <strong>
                {liveConnection === "connected"
                  ? "STREAM CONNECTED"
                  : liveConnection === "connecting"
                    ? "CONNECTING"
                    : liveConnection === "disconnected"
                      ? "STREAM DISCONNECTED"
                      : "MONITOR STANDBY"}
              </strong>
            </div>

            <div className="live-monitor-item">
              <small>ACTIVE MODEL</small>
              <strong title={activeModel}>{activeModel}</strong>
            </div>

            <div className="live-monitor-item">
              <small>PIPELINE STATUS</small>
              <strong>{activeStage}</strong>
            </div>

            <div className="live-monitor-item">
              <small>CLAIM VERIFICATION PROGRESS</small>
              <strong>
                {totalClaims > 0
                  ? `${Math.min(completedClaims, totalClaims)} / ${totalClaims}`
                  : anyLoading
                    ? `${completedClaims} completed`
                    : "—"}
              </strong>
              {totalClaims > 0 && (
                <div className="live-progress-track">
                  <div
                    className="live-progress-fill"
                    style={{
                      width: `${Math.min(100, (completedClaims / totalClaims) * 100)}%`,
                    }}
                  />
                </div>
              )}
            </div>

            <div className="live-monitor-item">
              <small>DISCOVERED DOMAINS</small>
              <strong>{activeDomains.length}</strong>
              {activeDomains.length > 0 && (
                <div className="live-domain-list">
                  {activeDomains.slice(0, 5).map((domain) => (
                    <span key={domain}>{domain}</span>
                  ))}
                  {activeDomains.length > 5 && (
                    <span>+{activeDomains.length - 5} more</span>
                  )}
                </div>
              )}
            </div>

            <div className="live-monitor-item">
              <small>LIVE EVENTS</small>
              <strong>{liveEvents.length}</strong>
            </div>

            <button
              type="button"
              className="live-details-button"
              onClick={() => setDetailsOpen((open) => !open)}
              aria-expanded={detailsOpen}
            >
              {detailsOpen ? "HIDE DETAILS ↑" : "VIEW DETAILS ↓"}
            </button>
          </div>

          {detailsOpen && (
            <div className="live-details-panel">
              <div className="live-details-heading">
                LIVE EVENT HISTORY • {liveEvents.length}
              </div>
              <div className="live-details-list">
                {liveEvents.length ? (
                  liveEvents.slice().reverse().map((event, index) => (
                    <article
                      className="live-detail-event"
                      key={`${event.id}-${event.timestamp}-${index}`}
                    >
                      <strong>{event.event.replaceAll("_", " ").toUpperCase()}</strong>
                      <p>{event.message}</p>
                      <small>{formatEventTime(event.timestamp)}</small>
                      {event.details?.domain && (
                        <p>Domain: {String(event.details.domain)}</p>
                      )}
                      {event.details?.claim_index !== undefined && (
                        <p>Claim index: {String(event.details.claim_index)}</p>
                      )}
                    </article>
                  ))
                ) : (
                  <div className="timeline-empty">
                    No live events received yet.
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="sidebar-divider" />
          <div className="side-section-label">ACTIVE CASE</div>

          <div className="active-case">
            <span className="case-indicator" />
            <div>
              <strong>{caseId || "NO ACTIVE CASE"}</strong>
              <small>
                {anyLoading
                  ? "PROCESSING"
                  : result || imageResult || urlResult || audioResult
                    ? "REPORT RECEIVED"
                    : "AWAITING INPUT"}
              </small>
            </div>
          </div>

          <div className="sidebar-bottom">
            <div className="sidebar-bottom-mark">VS / INTEL</div>
            <p>
              Evidence-led analysis.
              <br />
              Human judgment remains essential.
            </p>
          </div>
        </aside>

        <main className="main-content">
          <section className="command-header" id="investigation">
            <div>
              <div className="breadcrumb">OPERATIONS <span>/</span> INVESTIGATION</div>
              <h1>Investigation console</h1>
              <p>Examine claims. Retrieve evidence. Inspect source relationships.</p>
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {activeReport && (
                <button className="pdf-download-button" onClick={downloadPDF}>
                  ↓ DOWNLOAD PDF REPORT
                </button>
              )}
              <button className="clear-button" onClick={clearWorkspace}>
                ↺ RESET CASE
              </button>
              <button
  className="clear-button logout-button"
  type="button"
  onClick={async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error("Logout failed:", error);
      alert("Unable to sign out. Please try again.");
    }
  }}
>
  ↪ SIGN OUT
</button>
            </div>
          </section>

          {/* INVESTIGATION HISTORY */}
          {showHistory && (
<section className="history-panel" id="history">
  <div className="section-heading">
    <div>
      <h2>Investigation history</h2>
      <p>Review previously saved investigations and their evidence.</p>
    </div>
    <button
      className="clear-button"
      type="button"
      onClick={loadHistory}
      disabled={historyLoading}
    >
      {historyLoading ? "LOADING..." : "↻ REFRESH"}
    </button>
  </div>

  {historyError && (
    <div className="history-error">{historyError}</div>
  )}

  {historyLoading && historyItems.length === 0 ? (
    <p>Loading saved investigations...</p>
  ) : historyItems.length === 0 ? (
    <p>No saved investigations found.</p>
  ) : (
    <div className="history-list">
      {historyItems.map((item) => (
        <button
          type="button"
          key={item.id}
          className={`history-item ${
            selectedHistoryId === item.id ? "selected" : ""
          }`}
          onClick={() => loadInvestigationDetail(item.id)}
        >
          <strong>{item.type.toUpperCase()} INVESTIGATION</strong>
          <span>{item.input_preview || item.id}</span>
          <small>
            {item.status} • {item.verdict || "Verdict pending"} •{" "}
            {item.created_at
              ? new Date(item.created_at).toLocaleString()
              : "Date unavailable"}
          </small>
        </button>
      ))}
    </div>
  )}

  {savedDetail && (
    <div className="history-detail">
      <h3>Saved investigation details</h3>
      <p><strong>ID:</strong> {savedDetail.investigation.id}</p>
      <p><strong>Type:</strong> {savedDetail.investigation.investigation_type || savedDetail.investigation.type}</p>
      <p><strong>Status:</strong> {savedDetail.investigation.status}</p>
      <p><strong>Verdict:</strong> {savedDetail.investigation.verdict || "Not available"}</p>
      <p><strong>Model:</strong> {savedDetail.investigation.model || "Not available"}</p>

      <h4>Assessment</h4>
      <p>{savedDetail.investigation.assessment || "No assessment available."}</p>

      <h4>Evidence summary</h4>
      <p>{savedDetail.investigation.evidence_summary || "No evidence summary available."}</p>

      <h4>Evidence sources ({savedDetail.sources.length})</h4>
      {savedDetail.sources.length ? (
        savedDetail.sources.map((source, index) => (
          <article className="history-source" key={`${source.url}-${index}`}>
            <strong>{source.title}</strong>
            <p>{source.evidence}</p>
            <small>{source.relationship} • {source.reliability || "Reliability unavailable"}</small>
            {source.url && (
              <a href={source.url} target="_blank" rel="noreferrer">
                Open source ↗
              </a>
            )}
          </article>
        ))
      ) : (
        <p>No evidence sources saved.</p>
      )}

      <h4>Investigation events ({savedDetail.events.length})</h4>
      {savedDetail.events.map((event, index) => (
        <p key={`${event.event_type}-${index}`}>
          <strong>{event.event_type}:</strong> {event.message}
        </p>
      ))}

      <h4>Uploaded files ({savedDetail.files.length})</h4>
      {savedDetail.files.length ? (
        savedDetail.files.map((file, index) => (
          <p key={`${file.sha256}-${index}`}>
            {file.original_filename} • {(file.size_bytes / 1024).toFixed(1)} KB
          </p>
        ))
      ) : (
        <p>No uploaded files recorded.</p>
      )}
    </div>
  )}
</section>
          )}

          {/* TEXT INVESTIGATION */}
          <section className="query-console">
            <div className="console-heading">
              <div className="console-title">
                <span className="console-icon">⌕</span>
                <div>
                  <strong>CLAIM INPUT</strong>
                  <small>PRIMARY INVESTIGATION SUBJECT</small>
                </div>
              </div>
              <span className="console-tag">TEXT ANALYSIS / ACTIVE</span>
            </div>
            <textarea
              value={claim}
              onChange={(event) => setClaim(event.target.value)}
              placeholder="Enter a claim, statement, headline or information you want to investigate..."
              maxLength={3000}
              disabled={anyLoading}
            />
            <div className="console-footer">
              <span>{claim.length.toLocaleString()} / 3,000 CHARACTERS</span>
              <button onClick={investigate} disabled={!claim.trim() || anyLoading}>
                {loading ? "PROCESSING REQUEST ..." : "INITIATE INVESTIGATION  →"}
              </button>
            </div>
          </section>

          {/* IMAGE INVESTIGATION */}
          <section className="image-console">
            <div className="console-heading">
              <div className="console-title">
                <span className="console-icon">▧</span>
                <div>
                  <strong>IMAGE INVESTIGATION</strong>
                  <small>VISUAL ANALYSIS / CLAIM EXTRACTION / WEB VERIFICATION</small>
                </div>
              </div>
              <span className="console-tag">MULTIMODAL ANALYSIS</span>
            </div>
            <div className="image-upload-area">
              <label className="image-upload-label" htmlFor="evidence-image">
                <span className="image-upload-symbol">＋</span>
                <span>
                  <strong>{imageFile ? "CHANGE EVIDENCE IMAGE" : "SELECT EVIDENCE IMAGE"}</strong>
                  <small>PNG, JPG, JPEG or WEBP • Maximum 10 MB</small>
                </span>
              </label>
              <input
                id="evidence-image"
                className="image-file-input"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                disabled={anyLoading}
                onChange={(event) => {
                  handleImageSelection(event.target.files?.[0] ?? null);
                  event.currentTarget.value = "";
                }}
              />
              {imageFile && (
                <div className="image-selected-file">
                  {imageFile.name} • {(imageFile.size / (1024 * 1024)).toFixed(2)} MB
                </div>
              )}
              {imagePreview && (
                <img className="image-preview" src={imagePreview} alt="Selected evidence preview" />
              )}
            </div>
            <div className="image-console-footer">
              <span>IMAGE CONTENT IS ANALYZED SEPARATELY FROM AUTHENTICITY.</span>
              <button onClick={investigateImage} disabled={!imageFile || anyLoading}>
                {imageLoading ? "ANALYZING IMAGE ..." : "INITIATE IMAGE INVESTIGATION  →"}
              </button>
            </div>
          </section>

          {/* URL INVESTIGATION */}
          <section className="url-console">
            <div className="console-heading">
              <div className="console-title">
                <span className="console-icon">↗</span>
                <div>
                  <strong>URL INVESTIGATION</strong>
                  <small>WEBPAGE ANALYSIS / CLAIM EXTRACTION / EVIDENCE VERIFICATION</small>
                </div>
              </div>
              <span className="console-tag">WEB INTELLIGENCE</span>
            </div>
            <div className="url-input-area">
              <label htmlFor="investigation-url">WEBPAGE URL</label>
              <input
                id="investigation-url"
                type="url"
                value={pageUrl}
                onChange={(event) => setPageUrl(event.target.value)}
                placeholder="https://example.com/article"
                disabled={anyLoading}
              />
              <p>
                Submit a public webpage to extract factual claims and investigate
                them against retrieved evidence.
              </p>
            </div>
            <div className="url-console-footer">
              <span>PUBLIC HTTP / HTTPS WEBPAGES ONLY</span>
              <button onClick={investigateURL} disabled={!pageUrl.trim() || anyLoading}>
                {urlLoading ? "INVESTIGATING WEBPAGE ..." : "INITIATE URL INVESTIGATION  →"}
              </button>
            </div>
          </section>

          {/* AUDIO INVESTIGATION */}
          <section className="image-console">
            <div className="console-heading">
              <div className="console-title">
                <span className="console-icon">♫</span>
                <div>
                  <strong>AUDIO INVESTIGATION</strong>
                  <small>SPEECH TRANSCRIPTION / CLAIM EXTRACTION / WEB VERIFICATION</small>
                </div>
              </div>
              <span className="console-tag">VOICE INTELLIGENCE</span>
            </div>
            <div className="image-upload-area">
              <label className="image-upload-label" htmlFor="evidence-audio">
                <span className="image-upload-symbol">＋</span>
                <span>
                  <strong>{audioFile ? "CHANGE AUDIO RECORDING" : "SELECT AUDIO RECORDING"}</strong>
                  <small>WAV • Mono • 16-bit PCM • 16 kHz / 24 kHz • Maximum 30 MB</small>
                </span>
              </label>
              <input
                id="evidence-audio"
                className="image-file-input"
                type="file"
                accept=".wav,audio/wav,audio/x-wav,audio/wave"
                disabled={anyLoading}
                onChange={(event) => {
                  handleAudioSelection(event.target.files?.[0] ?? null);
                  event.currentTarget.value = "";
                }}
              />
              {audioFile && (
                <div className="image-selected-file">
                  {audioFile.name} • {(audioFile.size / (1024 * 1024)).toFixed(2)} MB
                </div>
              )}
            </div>
            <div className="image-console-footer">
              <span>TRANSCRIPTION AND FACTUAL VERIFICATION DO NOT ESTABLISH SPEAKER IDENTITY.</span>
              <button onClick={investigateAudio} disabled={!audioFile || anyLoading}>
                {audioLoading ? "INVESTIGATING AUDIO ..." : "INITIATE AUDIO INVESTIGATION  →"}
              </button>
            </div>
          </section>

          {error && (
            <div className="error-banner">
              <strong>REQUEST FAILED</strong>
              <span>{error}</span>
            </div>
          )}

          {/* INTELLIGENCE OVERVIEW */}
          <div className="section-toolbar">
            <div>
              <span className="section-index">01</span>
              <span className="section-name">INTELLIGENCE OVERVIEW</span>
            </div>
            <span className="section-state">
              {anyLoading
                ? "REQUEST PROCESSING"
                : result || imageResult || urlResult || audioResult
                  ? "REPORT AVAILABLE"
                  : "AWAITING INVESTIGATION"}
            </span>
          </div>

          <section className="intel-grid">
            <article className="intel-card verdict-card">
              <div className="card-topline">
                <span>ASSESSMENT VERDICT</span>
                <span className="card-symbol">V / 01</span>
              </div>
              <div className={`verdict-indicator ${verdictClass(verdict)}`}>
                {allClaims.length
                  ? verdict.toUpperCase()
                  : anyLoading
                    ? "PROCESSING"
                    : "NO ASSESSMENT"}
              </div>
              <p>
                {allClaims.length
                  ? "Provider-reported assessment. Review evidence and uncertainty before drawing conclusions."
                  : "The assessment will appear here after an investigation response is received."}
              </p>
            </article>
            <article className="intel-card">
              <div className="card-topline">
                <span>SOURCE RECORDS</span>
                <span className="card-symbol">S / 02</span>
              </div>
              <div className="metric-value">{String(sources.length).padStart(2, "0")}</div>
              <p>Unique source records across the active report.</p>
            </article>
            <article className="intel-card">
              <div className="card-topline">
                <span>MODEL</span>
                <span className="card-symbol">M / 03</span>
              </div>
              <div className="model-value">
                {result?.model || imageResult?.model || urlResult?.model ||
                  audioResult?.verification_model || audioResult?.transcription_model ||
                  activeModel}
              </div>
              <p>Model identifier reported by the investigation service.</p>
            </article>
          </section>

          {/* DYNAMIC ANALYTICS */}
          <section className="investigation-grid">
            <article className="panel">
              <div className="panel-header">
                <div>
                  <div className="panel-kicker">02 / VERDICT DISTRIBUTION</div>
                  <h2>Claim analysis metrics</h2>
                </div>
                <span className="panel-counter">{allClaims.length} CLAIMS</span>
              </div>
              {allClaims.length ? (
                <div className="analytics-content">
                  {[
                    { label: "SUPPORTED", count: verdictCounts.supported, className: "supported" },
                    { label: "CONTRADICTED", count: verdictCounts.contradicted, className: "contradicted" },
                    { label: "INCONCLUSIVE", count: verdictCounts.inconclusive, className: "inconclusive" },
                  ].map((item) => (
                    <div className="analytics-row" key={item.label}>
                      <div className="analytics-label">
                        <span>{item.label}</span><strong>{item.count}</strong>
                      </div>
                      <div className="analytics-track">
                        <div className={`analytics-fill ${item.className}`}
                          style={{ width: `${(item.count / allClaims.length) * 100}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="timeline-empty">Verdict analytics will populate after claim verification.</div>
              )}
            </article>

            <article className="panel">
              <div className="panel-header">
                <div>
                  <div className="panel-kicker">03 / SOURCE RELIABILITY</div>
                  <h2>Reliability distribution</h2>
                </div>
                <span className="panel-counter">{sources.length} SOURCES</span>
              </div>
              {sources.length ? (
                <div className="analytics-content">
                  {[
                    { label: "HIGH", count: reliabilityCounts.high },
                    { label: "MODERATE", count: reliabilityCounts.moderate },
                    { label: "LIMITED", count: reliabilityCounts.limited },
                    { label: "UNKNOWN", count: reliabilityCounts.unknown },
                  ].map((item) => (
                    <div className="analytics-row" key={item.label}>
                      <div className="analytics-label">
                        <span>{item.label}</span><strong>{item.count}</strong>
                      </div>
                      <div className="analytics-track">
                        <div className="analytics-fill reliability-fill"
                          style={{ width: `${(item.count / sources.length) * 100}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="timeline-empty">Reliability metrics require returned source records.</div>
              )}
            </article>
          </section>

          {/* EVIDENCE NETWORK */}
          <section className="investigation-grid">
            <article className="panel network-panel" id="network">
              <div className="panel-header">
                <div>
                  <div className="panel-kicker">04 / RELATIONSHIP ANALYSIS</div>
                  <h2>Evidence network</h2>
                </div>
                <span className="panel-counter">{sources.length} NODES</span>
              </div>
              {sources.length > 0 ? (
                <>
                  <div className="network-canvas">
                    <svg className="network-svg" viewBox="0 0 660 450"
                      role="img" aria-label="Claim and retrieved source network">
                      <defs>
                        <pattern id="grid" width="24" height="24" patternUnits="userSpaceOnUse">
                          <path d="M 24 0 L 0 0 0 24" fill="none" stroke="#24323b" strokeWidth=".6" />
                        </pattern>
                      </defs>
                      <rect width="660" height="450" fill="url(#grid)" />
                      {graphNodes.map((node) => (
                        <line key={`edge-${node.index}`} x1="330" y1="225"
                          x2={node.x} y2={node.y} className="network-edge" />
                      ))}
                      <circle cx="330" cy="225" r="78" className="central-halo" />
                      <circle cx="330" cy="225" r="57" className="central-node" />
                      <text x="330" y="219" textAnchor="middle" className="central-label">CLAIM</text>
                      <text x="330" y="237" textAnchor="middle" className="central-sub">PRIMARY SUBJECT</text>
                      {graphNodes.map((node) => (
                        <g key={`node-${node.index}`}
                          className={`source-node ${selectedSource === node.index ? "selected" : ""} ${node.relationship?.toLowerCase() || "neutral"}`}
                          onClick={() => setSelectedSource(node.index)}
                          role="button" tabIndex={0}
                          aria-label={`Inspect source ${node.index + 1}`}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") setSelectedSource(node.index);
                          }}>
                          <circle cx={node.x} cy={node.y} r="17" className="node-hit-area" />
                          <circle cx={node.x} cy={node.y} r="6" className="node-dot" />
                          <text x={node.x} y={node.y - 22} textAnchor="middle" className="node-label">
                            S{String(node.index + 1).padStart(2, "0")}
                          </text>
                        </g>
                      ))}
                    </svg>
                    <div className="network-legend">
                      <span><i className="legend-claim" /> PRIMARY CLAIM</span>
                      <span><i className="legend-source" /> RETRIEVED SOURCE</span>
                      <span><i className="legend-edge" /> SOURCE LINK</span>
                    </div>
                  </div>
                  <div className="network-note">
                    Source links indicate retrieval association only. They do not imply evidential support or contradiction.
                  </div>
                </>
              ) : (
                <div className="network-empty">
                  <div className="empty-orbit">⌘</div>
                  <strong>NETWORK NOT POPULATED</strong>
                  <p>Submit an investigation to populate the graph with returned source records.</p>
                </div>
              )}
            </article>

            <aside className="panel inspector-panel">
              <div className="panel-header">
                <div>
                  <div className="panel-kicker">05 / SOURCE INSPECTION</div>
                  <h2>Intelligence inspector</h2>
                </div>
                <span className="inspector-live">LIVE</span>
              </div>
              {selected ? (
                <div className="inspector-content">
                  <div className="inspector-id">SOURCE S{String((selectedSource ?? 0) + 1).padStart(2, "0")}</div>
                  <h3>{selected.title || "Untitled source"}</h3>
                  {[
                    ["PUBLISHER", selected.publisher],
                    ["RELATIONSHIP", selected.relationship],
                    ["RELEVANCE", selected.relevance],
                    ["RELIABILITY", selected.reliability],
                    ["RELIABILITY BASIS", selected.reliability_reason],
                    ["SOURCE LIMITATIONS", selected.limitations],
                    ["EXTRACTED EVIDENCE", selected.evidence],
                  ].map(([label, value]) => (
                    <div className="inspector-field" key={label}>
                      <label>{label}</label><p>{safeText(value)}</p>
                    </div>
                  ))}
                  {selected.url && (
                    <a className="inspect-link" href={selected.url} target="_blank" rel="noreferrer">
                      OPEN ORIGINAL SOURCE ↗
                    </a>
                  )}
                </div>
              ) : (
                <div className="inspector-empty">
                  <div className="inspector-crosshair">＋</div>
                  <strong>NO SOURCE SELECTED</strong>
                  <p>Select a node in the evidence network or a record below to inspect its metadata.</p>
                </div>
              )}
            </aside>
          </section>

          {/* LIVE EVENT TIMELINE */}
          <section className="panel timeline-panel" id="timeline">
            <div className="panel-header">
              <div>
                <div className="panel-kicker">06 / EXECUTION RECORD</div>
                <h2>Investigation event log</h2>
              </div>
              <span className="panel-counter">{events.length} EVENTS</span>
            </div>
            {events.length ? (
              <div className="event-list">
                {events.map((event, index) => (
                  <div className="event-row" key={`${event.label}-${index}`}>
                    <span className="event-dot" />
                    <span className="event-time">{event.time}</span>
                    <div className="event-description">
                      <strong>{event.label}</strong>
                      <small>{event.detail}</small>
                    </div>
                    <span className="event-index">EVT-{String(index + 1).padStart(3, "0")}</span>
                  </div>
                ))}
                {anyLoading && (
                  <div className="event-row pending-event">
                    <span className="event-dot pending-dot" />
                    <span className="event-time">IN PROGRESS</span>
                    <div className="event-description">
                      <strong>{activeStage}</strong>
                      <small>Waiting for the next backend investigation event.</small>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="timeline-empty">No execution events recorded yet.</div>
            )}
          </section>

          {/* SOURCE REGISTER */}
          <section className="panel register-panel" id="register">
            <div className="panel-header">
              <div>
                <div className="panel-kicker">07 / REFERENCE MANAGEMENT</div>
                <h2>Source register</h2>
              </div>
              <span className="panel-counter">{sources.length} RECORDS</span>
            </div>
            {sources.length ? (
              <div className="register-table">
                <div className="register-row register-head">
                  <span>REF ID</span><span>SOURCE TITLE</span><span>RELATIONSHIP</span><span>INSPECT</span>
                </div>
                {sources.map((source, index) => (
                  <button className={`register-row register-item ${selectedSource === index ? "chosen" : ""}`}
                    key={`${source.url}-${index}`} onClick={() => setSelectedSource(index)}>
                    <span className="register-ref">S{String(index + 1).padStart(2, "0")}</span>
                    <span className="register-title">{source.title || source.url || "Untitled source"}</span>
                    <span className="register-relationship">
                      {source.relationship || "UNCLASSIFIED"} • {source.reliability || "UNKNOWN"}
                    </span>
                    <span className="register-action">INSPECT ↗</span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="timeline-empty">Source records will appear here when returned by the provider.</div>
            )}
          </section>

          {/* EXISTING IMAGE REPORT */}
          {imageResult && (
            <section className="panel image-report">
              <div className="panel-header">
                <div>
                  <div className="panel-kicker">08 / MULTIMODAL INVESTIGATION</div>
                  <h2>Image analysis report</h2>
                </div>
                <span className="panel-counter">{imageResult.claims?.length ?? 0} CLAIMS</span>
              </div>
              <div className="image-report-meta">
                <span>FILE: {imageResult.filename || imageFile?.name || "Uploaded image"}</span>
                <span>MODEL: {imageResult.model || "Unknown"}</span>
              </div>
              <div className="image-report-block">
                <label>VISUAL SUMMARY</label>
                <p>{imageResult.visual_summary || "No visual summary returned."}</p>
              </div>
              <div className="image-report-block">
                <label>VISIBLE TEXT</label>
                {imageResult.visible_text?.length
                  ? <ul>{imageResult.visible_text.map((line, index) => <li key={index}>{line}</li>)}</ul>
                  : <p>No visible text was extracted.</p>}
              </div>
              <div className="image-claims-list">
                <div className="image-report-block"><label>EXTRACTED CLAIMS & VERIFICATION</label></div>
                {imageResult.claims?.length ? imageResult.claims.map((item, index) => (
                  <article className="image-claim-card" key={`${item.claim}-${index}`}>
                    <div className="image-claim-heading">
                      <span>CLAIM {String(index + 1).padStart(2, "0")}</span>
                      <strong className={`verdict-indicator ${verdictClass(item.verdict)}`}>{item.verdict.toUpperCase()}</strong>
                    </div>
                    <h3>{item.claim}</h3>
                    <div className="image-report-columns">
                      {[
                        ["VISUAL BASIS", item.visual_basis],
                        ["ASSESSMENT", item.assessment],
                        ["EVIDENCE SUMMARY", item.evidence_summary],
                        ["UNCERTAINTY", item.uncertainty],
                      ].map(([label, value]) => (
                        <div key={label}><label>{label}</label><p>{safeText(value)}</p></div>
                      ))}
                    </div>
                    {item.sources?.length ? (
                      <div className="image-claim-sources">
                        <label>VERIFIED SOURCE RECORDS</label>
                        {item.sources.map((source, i) => (
                          <div className="image-source-row" key={`${source.url}-${i}`}>
                            <span>{source.relationship || "Neutral"}</span>
                            <a href={source.url} target="_blank" rel="noreferrer">{source.title || source.url} ↗</a>
                          </div>
                        ))}
                      </div>
                    ) : <p className="image-no-sources">No validated sources returned. Treat this claim as inconclusive.</p>}
                  </article>
                )) : <p>No verifiable factual claims were extracted from this image.</p>}
              </div>
              {imageResult.limitations?.length ? (
                <div className="image-report-block image-limitations">
                  <label>ANALYSIS LIMITATIONS</label>
                  <ul>{imageResult.limitations.map((item, index) => <li key={index}>{item}</li>)}</ul>
                </div>
              ) : null}
            </section>
          )}

          {/* EXISTING URL REPORT */}
          {urlResult && (
            <section className="panel url-report">
              <div className="panel-header">
                <div>
                  <div className="panel-kicker">09 / WEB INTELLIGENCE INVESTIGATION</div>
                  <h2>URL investigation report</h2>
                </div>
                <span className="panel-counter">{urlResult.claims?.length ?? 0} CLAIMS</span>
              </div>
              <div className="image-report-meta">
                <span>PAGE: {urlResult.page_title || "Untitled webpage"}</span>
                <span>MODEL: {urlResult.model || "Unknown"}</span>
             </div>

{([
  ["SUBMITTED URL", urlResult.submitted_url],
  ["FINAL URL", urlResult.final_url],
  ["PAGE DESCRIPTION", urlResult.page_description],
  ["PAGE SUMMARY", urlResult.page_summary],
] as [string, string | undefined][]).map(([label, value]) => (
  <div className="url-report-block" key={label}>
    <label>{label}</label>
    {label.includes("URL") && value ? (
      <a href={value} target="_blank" rel="noreferrer">
        {value} ↗
      </a>
    ) : (
      <p>{safeText(value)}</p>
    )}
  </div>
))}

              <div className="url-claims-list">
                <div className="url-report-block"><label>EXTRACTED CLAIMS & VERIFICATION</label></div>
                {urlResult.claims?.length ? urlResult.claims.map((item, index) => (
                  <article className="image-claim-card" key={`${item.claim}-${index}`}>
                    <div className="image-claim-heading">
                      <span>CLAIM {String(index + 1).padStart(2, "0")}</span>
                      <strong className={`verdict-indicator ${verdictClass(item.verdict)}`}>{item.verdict.toUpperCase()}</strong>
                    </div>
                    <h3>{item.claim}</h3>
                    {item.context && <div className="url-report-block"><label>PAGE CONTEXT</label><p>{item.context}</p></div>}
                    <div className="image-report-columns">
                      {[
                        ["ASSESSMENT", item.assessment],
                        ["EVIDENCE SUMMARY", item.evidence_summary],
                        ["UNCERTAINTY", item.uncertainty],
                      ].map(([label, value]) => (
                        <div key={label}><label>{label}</label><p>{safeText(value)}</p></div>
                      ))}
                    </div>
                    {item.sources?.length ? (
                      <div className="image-claim-sources">
                        <label>VALIDATED EVIDENCE SOURCES</label>
                        {item.sources.map((source, i) => (
                          <div className="image-source-row" key={`${source.url}-${i}`}>
                            <span>{source.relationship || "Neutral"}</span>
                            <a href={source.url} target="_blank" rel="noreferrer">{source.title || source.url} ↗</a>
                          </div>
                        ))}
                      </div>
                    ) : <p className="image-no-sources">No validated sources returned. Treat this claim as inconclusive.</p>}
                  </article>
                )) : <p>No verifiable factual claims were extracted from this webpage.</p>}
              </div>
              {urlResult.limitations?.length ? (
                <div className="image-report-block image-limitations">
                  <label>INVESTIGATION LIMITATIONS</label>
                  <ul>{urlResult.limitations.map((item, index) => <li key={index}>{item}</li>)}</ul>
                </div>
              ) : null}
            </section>
          )}

          {/* EXISTING AUDIO REPORT */}
          {audioResult && (
            <section className="panel image-report">
              <div className="panel-header">
                <div>
                  <div className="panel-kicker">10 / AUDIO INTELLIGENCE INVESTIGATION</div>
                  <h2>Audio analysis report</h2>
                </div>
                <span className="panel-counter">{audioResult.claims?.length ?? 0} CLAIMS</span>
              </div>
              <div className="image-report-meta">
                <span>FILE: {audioFile?.name || "Audio recording"}</span>
                <span>DURATION: {formatDuration(audioResult.audio_duration_ms)}</span>
              </div>
              <div className="image-report-meta">
                <span>TRANSCRIPTION: {audioResult.transcription_model || "Unknown"}</span>
                <span>VERIFICATION: {audioResult.verification_model || "Unknown"}</span>
              </div>
              <div className="image-report-block">
                <label>TRANSCRIPT SUMMARY</label>
                <p>{audioResult.page_summary || "No transcript summary returned."}</p>
              </div>
              <div className="image-report-block">
                <label>FULL TRANSCRIPT</label>
                <p className="audio-transcript">{audioResult.transcript || "No transcript returned."}</p>
              </div>
              <div className="image-report-block">
                <label>AUDIO METADATA</label>
                <p>
                  Sample rate: {audioResult.audio_info?.sample_rate ?? "Unknown"} Hz •
                  Channels: {audioResult.audio_info?.channels ?? "Unknown"} •
                  Encoding: {audioResult.audio_info?.sample_width
                    ? `${audioResult.audio_info.sample_width * 8}-bit PCM`
                    : "Unknown"}
                </p>
              </div>
              {audioResult.turns?.length ? (
                <div className="image-report-block">
                  <label>SPEAKER TURNS</label>
                  {audioResult.turns.map((turn, index) => (
                    <div className="image-source-row" key={`${turn.turn_id ?? index}`}>
                      <span>{turn.speaker || "Unknown speaker"}</span>
                      <span>{formatDuration(turn.start_ms)} – {formatDuration(turn.end_ms)}</span>
                    </div>
                  ))}
                </div>
              ) : null}
              <div className="image-claims-list">
                <div className="image-report-block"><label>EXTRACTED CLAIMS & INDEPENDENT VERIFICATION</label></div>
                {audioResult.claims?.length ? audioResult.claims.map((item, index) => (
                  <article className="image-claim-card" key={`${item.claim}-${index}`}>
                    <div className="image-claim-heading">
                      <span>CLAIM {String(index + 1).padStart(2, "0")}</span>
                      <strong className={`verdict-indicator ${verdictClass(item.verdict)}`}>{item.verdict.toUpperCase()}</strong>
                    </div>
                    <h3>{item.claim}</h3>
                    {item.context && <div className="url-report-block"><label>TRANSCRIPT CONTEXT</label><p>{item.context}</p></div>}
                    <div className="image-report-columns">
                      {[
                        ["ASSESSMENT", item.assessment],
                        ["EVIDENCE SUMMARY", item.evidence_summary],
                        ["TRANSCRIPTION UNCERTAINTY", item.transcription_uncertainty],
                        ["VERIFICATION UNCERTAINTY", item.uncertainty],
                      ].map(([label, value]) => (
                        <div key={label}><label>{label}</label><p>{safeText(value)}</p></div>
                      ))}
                    </div>
                    {item.sources?.length ? (
                      <div className="image-claim-sources">
                        <label>VALIDATED EVIDENCE SOURCES</label>
                        {item.sources.map((source, i) => (
                          <div className="image-source-row" key={`${source.url}-${i}`}>
                            <span>{source.relationship || "Neutral"}</span>
                            <a href={source.url} target="_blank" rel="noreferrer">{source.title || source.url} ↗</a>
                          </div>
                        ))}
                      </div>
                    ) : <p className="image-no-sources">No validated sources returned. Treat this claim as inconclusive.</p>}
                  </article>
                )) : <p>No independently verifiable factual claims were extracted from this audio.</p>}
              </div>
              {audioResult.limitations?.length ? (
                <div className="image-report-block image-limitations">
                  <label>INVESTIGATION LIMITATIONS</label>
                  <ul>{audioResult.limitations.map((item, index) => <li key={index}>{item}</li>)}</ul>
                </div>
              ) : null}
              <div className="image-report-block image-limitations">
                <label>IMPORTANT INTERPRETATION NOTE</label>
                <p>
                  This report evaluates claims extracted from the recognized transcript
                  against external evidence. Speech recognition can introduce errors.
                  Speaker diarization labels are not identity verification. This pipeline
                  does not determine whether a voice is cloned, synthetic or authentic.
                </p>
              </div>
            </section>
          )}

          {/* TEXT REPORT */}
          {result && (
            <section className="report-summary">
              <div className="panel-kicker">11 / INVESTIGATION CONCLUSION</div>
              <h2>Assessment & uncertainty</h2>
              <div className="summary-columns">
                <div><label>ASSESSMENT</label><p>{result.assessment || "No assessment text returned."}</p></div>
                <div><label>EVIDENCE SUMMARY</label><p>{result.evidence_summary || "No evidence summary returned."}</p></div>
                <div><label>UNCERTAINTY & LIMITATIONS</label><p>{result.uncertainty || "No uncertainty statement returned."}</p></div>
              </div>
            </section>
          )}
          {/* PDF EXPORT BUTTON */}
{activeReport && (
  <div className="pdf-export-wrapper">
    <button
      type="button"
      className="report-export-button"
      onClick={() => window.print()}
    >
      <span>↓</span>
      EXPORT INVESTIGATION REPORT (PDF)
    </button>
  </div>
)}

          {/* PRINT-ONLY INVESTIGATION REPORT */}
          {activeReport && (
            <section className="pdf-report-root" aria-label="PDF investigation report">
              <header className="pdf-report-header">
                <div className="pdf-report-brand">VERITASSHIELD / DIGITAL FORENSICS</div>
                <h1>{reportTitle}</h1>
                <p className="pdf-report-subtitle">
                  Evidence-led investigation record • AI-assisted analysis • Human review required
                </p>
              </header>

              <div className="pdf-meta-grid">
                <div><strong>Case ID:</strong> {safeText(caseId)}</div>
                <div><strong>Investigation ID:</strong> {safeText(investigationId)}</div>
                <div><strong>Investigation date:</strong> {caseStartedAt ? formatDate(caseStartedAt) : "Not recorded"}</div>
                <div><strong>Report generated:</strong> {formatDate()}</div>
                <div><strong>Investigation type:</strong> {reportType.toUpperCase()}</div>
                <div><strong>Backend status:</strong> {apiStatus.toUpperCase()}</div>
                <div><strong>Active model:</strong> {safeText(activeModel)}</div>
                <div><strong>Discovered domains:</strong> {activeDomains.length}</div>
              </div>

              {renderPDFReportBody()}

              <footer className="pdf-report-footer">
                VERITASSHIELD • CASE {safeText(caseId)} •
                This report reflects the information returned by the configured
                investigation service. Source availability, retrieval quality,
                model limitations and uncertainty should be considered during
                human review. An AI-generated verdict is not a guarantee of truth.
              </footer>
            </section>
          )}
        </main>
      </div>

      <footer className="footer-bar">
        <span>VERITASSHIELD / DIGITAL FORENSICS</span>
        <span>INVESTIGATE BEFORE YOU BELIEVE.</span>
        <span>AI-ASSISTED ANALYSIS • HUMAN REVIEW REQUIRED</span>
      </footer>
    </div>
  );
}

export default App;
