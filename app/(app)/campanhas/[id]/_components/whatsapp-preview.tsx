"use client";

type Btn = { type: "quick_reply" | "url"; text: string; url: string };

export function WhatsappPreview({
  message,
  buttons = [],
  imageUrl,
  time = "11:48",
  sampleName = "Pedro",
  compact = false,
}: {
  message: string;
  buttons?: Btn[];
  imageUrl?: string;
  time?: string;
  sampleName?: string;
  compact?: boolean;
}) {
  const text = (message || "").replaceAll("{{1}}", sampleName);
  return (
    <div
      className={`rounded-2xl ${compact ? "p-2" : "p-4"}`}
      style={{ background: "#E7E0D6" }}
    >
      <div
        className={`bg-white rounded-xl rounded-tl-sm shadow-sm ${compact ? "p-2.5 max-w-[260px]" : "p-3.5 max-w-[340px]"}`}
      >
        {imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt=""
            className="rounded-lg mb-2 w-full object-cover max-h-44"
          />
        )}
        <p
          className={`whitespace-pre-wrap leading-relaxed text-ink ${compact ? "text-[12px]" : "text-sm"}`}
        >
          {text}
        </p>
        <div className="text-right text-[10px] text-muted mt-1">{time}</div>
        {buttons.length > 0 && (
          <div className="mt-1 -mx-3.5 -mb-3.5 border-t border-line">
            {buttons.map((b, i) => (
              <div
                key={i}
                className={`flex items-center justify-center gap-2 py-2 text-emeraldd font-medium ${i > 0 ? "border-t border-line" : ""} ${compact ? "text-xs" : "text-sm"}`}
              >
                <span>{b.type === "url" ? "🔗" : "↩"}</span>
                <span>{b.text}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
